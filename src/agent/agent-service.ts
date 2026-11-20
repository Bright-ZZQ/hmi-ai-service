/**
 * Agent Service — Agent Loop 引擎
 *
 * 核心逻辑：
 * 1. 接收用户自然语言输入 + 编辑器类型
 * 2. 加载对应 Skill 的 tool 定义
 * 3. Agent Loop: 调模型 API → 执行 tool_call → 结果回传 → 循环
 * 4. 模型完成时提取最终 JSON → Schema 校验 → 返回
 *
 * 会话管理：
 * - 维护 workingElements 数组，存储所有已生成的图元
 * - assemble_display/assemble_symbol 自动使用 workingElements
 * - 模型无需手动传递大型 JSON 对象
 */

import { isAssemblyTool, narrowToolsForRound, selectTools } from './skill-registry'
import { enrichModelPoints } from './model-point-resolver'
import { ThinkingDigest } from './thinking-digest'
import { generatePlanPreview } from './plan-preview'
import { compactToolResult } from './tool-result-compactor'
import { buildLoopSystemPrompt } from './prompts'
import { createSession, executeToolCall, validateSessionOutput } from './tools'
import { formatErrors } from './schema-validator'
import type {
  EditorType,
  AgentMessage,
  AgentConfig,
  AgentResult,
  AgentStep,
  ToolCall,
  SSEEvent,
  StreamMetrics,
  AgentContext,
} from '../types'

export { createSession, executeToolCall } from './tools'
export type { SessionState } from './tools'

// ============================================================
// Agent Loop 主逻辑
// ============================================================

/**
 * 运行 Agent Loop
 * @param prompt 用户自然语言输入
 * @param editorType 编辑器类型
 * @param config Agent 配置（API key 等）
 * @param onSSEEvent SSE 事件回调
 * @returns Agent 执行结果
 */
export async function runAgentLoop(
  prompt: string,
  editorType: EditorType,
  config: AgentConfig,
  onSSEEvent: (event: SSEEvent) => void,
  context: AgentContext = {},
): Promise<AgentResult> {
  const session = createSession(editorType, context.currentJson)
  // 按需下发：按用户意图筛选工具子集，静态需求省去动态特性工具、首轮省去编辑工具
  const tools = selectTools(editorType, {
    prompt,
    isEditing: Boolean(context.currentJson),
  })
  const maxRetries = config.maxRetries
  const validateFinalOutput = (json: unknown) => validateSessionOutput(session, json, { requirePlan: true })

  const startedAt = Date.now()
  let modelMs = 0
  let toolMs = 0
  let rounds = 0
  let toolCalls = 0

  const buildMetrics = (): StreamMetrics => {
    const totalMs = Date.now() - startedAt
    return {
      modelMs,
      // 总耗时扣掉等待模型的部分，即服务端自身开销
      serverMs: Math.max(0, totalMs - modelMs),
      toolMs,
      totalMs,
      rounds,
      toolCalls,
    }
  }
  const emitMetrics = () => onSSEEvent({ type: 'metrics', metrics: buildMetrics() })

  // 先下发画布，让前端在收到首个图元前就建好尺寸与背景
  onSSEEvent({ type: 'canvas', canvas: session.canvas })

  // 步骤回调
  const onStep = (step: AgentStep) => {
    if (step.type === 'tool_call') {
      onSSEEvent({
        type: 'tool_call',
        content: step.content,
        toolName: step.toolName,
        toolArgs: step.toolArgs,
      })
    } else if (step.type === 'thinking') {
      onSSEEvent({ type: 'thinking', content: step.content })
    }
  }

  /**
   * 模型停止调用工具但未显式组装时的兜底：直接用工作区已累积的图元组装。
   * 避免模型“忘记”调 assemble 就整单失败。
   */
  const finishWithAutoAssemble = async (): Promise<AgentResult | null> => {
    // toolCalls === 0 说明模型什么都没做（如反问澄清），多轮修改时不能把原图当成新结果返回
    if (session.finalJson || toolCalls === 0 || session.workingElements.length === 0) return null

    const assembleName = editorType === 'display' ? 'assemble_display' : 'assemble_symbol'
    const nameArg = editorType === 'display'
      ? { pageName: session.canvas.name }
      : { symbolName: session.canvas.name }

    const startedAt = Date.now()
    executeToolCall(assembleName, nameArg, session, onStep, onSSEEvent)
    toolMs += Date.now() - startedAt
    toolCalls++

    if (!session.finalJson) return null
    if (validateFinalOutput(session.finalJson).length > 0) {
      // 兜底结果不合法则不占用结果位，交回原有重试/失败路径
      session.finalJson = undefined
      return null
    }

    session.steps.push({ type: 'done', content: '生成完成（服务端兜底组装）', timestamp: Date.now() })
    await enrichModelPoints(session.finalJson, context.modelPointApi)
    const metrics = buildMetrics()
    onSSEEvent({ type: 'result', json: session.finalJson })
    onSSEEvent({ type: 'metrics', metrics })
    onSSEEvent({ type: 'done' })

    return { success: true, json: session.finalJson, steps: session.steps, metrics }
  }

  // 构建初始消息
  const history = (context.history || [])
    .filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-10)
    .map(message => ({ role: message.role, content: message.content.slice(0, 4000) } as AgentMessage))

  const messages: AgentMessage[] = [{ role: 'system', content: buildLoopSystemPrompt(editorType) }]
  if (context.currentJson) {
    messages.push({
      role: 'system',
      content: `这是画布上已有的当前${editorType === 'symbol' ? '图符' : '图纸'} JSON。服务端已将其中图元载入工作区，请保留已有内容，仅按用户要求增量新增/修改/删除，并最终组装完整结果：\n${JSON.stringify(context.currentJson)}`,
    })
  }
  messages.push(...history, { role: 'user', content: prompt })

  // 方案预览：几秒内先把整体方案流式展示给用户，并交给主流程作为已确定的方案
  let previewStreamed = false
  const planPreview = await generatePlanPreview(prompt, editorType, config, context, (text) => {
    if (!previewStreamed) {
      previewStreamed = true
      onSSEEvent({ type: 'thinking', content: '📋 整体方案：\n' })
    }
    onSSEEvent({ type: 'thinking', content: text })
  })
  if (planPreview) {
    onSSEEvent({ type: 'thinking', content: '\n' })
    messages.push({
      role: 'system',
      content: `已向用户展示的整体方案如下。整体规划已完成，你无需重复规划：思考只需补充实现细节（坐标、参数），随后直接调用工具按方案执行；若发现方案有误可在执行中修正。\n${planPreview}`,
    })
  }

  let retries = 0
  let lengthRetries = 0
  const MAX_LENGTH_RETRIES = 2
  let lastValidationErrors = ''
  let announcedRetries = -1
  // === Agent Loop ===
  while (retries <= maxRetries) {
    // 进度通知：只在首轮和每次修正时提示，普通工具轮次不重复刷屏
    if (retries !== announcedRetries) {
      announcedRetries = retries
      const thinkingStep: AgentStep = {
        type: 'thinking',
        content: retries === 0 ? '正在分析需求...' : `正在进行第 ${retries} 次修正...`,
        timestamp: Date.now(),
      }
      session.steps.push(thinkingStep)
      onStep(thinkingStep)
    }

    // 流内派发：模型每吐完一个 tool_call 就立即执行并推送图元，不必等整轮结束
    const streamedResults = new Map<string, string>()
    const baseWorkingElements = structuredClone(session.workingElements)
    const baseToolCalls = toolCalls
    const baseGenerationPlan = session.generationPlan
    // 删除特性会移除已记录的执行，回滚需整体恢复而不是按长度截断
    const baseFeatureExecutions = [...session.featureExecutions]
    const baseDisplayEventCount = session.displayEvents.length
    const baseDisplayScript = session.displayScript
    const baseSymbolDataBindings = session.symbolDataBindings
    const basePageProperty = structuredClone(session.pageProperty)
    const basePageParamDecls = structuredClone(session.pageParamDecls)
    const baseZOrderOps = [...session.zOrderOps]
    const baseCanvas = { ...session.canvas }
    // 流内工具是在读流循环里跑的，会被算进 callModel 的 elapsedMs，需单独记账后扣除
    let streamToolMs = 0

    const dispatch: StreamDispatch = {
      onToolCall: (tc) => {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          args = {}
        }
        const startedAt = Date.now()
        streamedResults.set(
          tc.id,
          executeToolCall(tc.function.name, args, session, onStep, onSSEEvent),
        )
        const cost = Date.now() - startedAt
        toolMs += cost
        streamToolMs += cost
        toolCalls++
      },
      // 模型 API 中途失败重试时，撤销本次尝试已提交的图元，并让前端重画已有部分
      onRollback: () => {
        session.workingElements.splice(
          0,
          session.workingElements.length,
          ...structuredClone(baseWorkingElements),
        )
        session.finalJson = undefined
        session.generationPlan = baseGenerationPlan
        session.featureExecutions.splice(0, session.featureExecutions.length, ...baseFeatureExecutions)
        session.displayEvents.length = baseDisplayEventCount
        session.displayScript = baseDisplayScript
        session.symbolDataBindings = baseSymbolDataBindings
        session.pageProperty = structuredClone(basePageProperty)
        session.pageParamDecls = structuredClone(basePageParamDecls)
        session.zOrderOps = [...baseZOrderOps]
        session.canvas = { ...baseCanvas }
        streamedResults.clear()
        toolCalls = baseToolCalls
        onSSEEvent({ type: 'stream_reset' })
        if (session.workingElements.length > 0) {
          onSSEEvent({ type: 'element', elements: session.workingElements })
        }
      },
    }

    // 调用模型 API（流式）
    // 因思考超额被截断后重试时，放宽输出上限（有上限，避免网关拒绝）
    const callConfig = lengthRetries > 0
      ? { ...config, maxTokens: Math.min((config.maxTokens || 16384) * 2, 65536) }
      : config
    // 按轮次收窄工具：计划声明前不发特性工具，声明后只发计划内的特性工具
    const roundTools = narrowToolsForRound(tools, {
      prompt,
      plannedFeatureTools: session.generationPlan?.requiredFeatureTools,
    })
    const roundStartedAt = Date.now()
    const { response, retryCount, elapsedMs } = await callModel(lengthRetries > 0, callConfig, messages, roundTools, onSSEEvent, dispatch)
    modelMs += Math.max(0, elapsedMs - streamToolMs)
    rounds++
    emitMetrics()

    if (!response) {
      const retried = retryCount > 0 ? `（已重试 ${retryCount} 次）` : ''
      return {
        success: false,
        error: `模型 API 调用失败${retried}`,
        steps: session.steps,
        metrics: buildMetrics(),
      }
    }

    const choice = response.choices?.[0]
    console.log(`[AgentService] round=${rounds} retries=${retries} finish=${choice?.finish_reason} toolCalls=${choice?.message?.tool_calls?.length ?? 0} contentLen=${choice?.message?.content?.length ?? 0} tools=${roundTools.length}/${JSON.stringify(roundTools).length} ctx=${JSON.stringify(messages).length} sec=${Math.round((Date.now() - roundStartedAt) / 1000)}`)
    if (!choice) {
      return {
        success: false,
        error: '模型返回为空',
        steps: session.steps,
        metrics: buildMetrics(),
      }
    }

    // === 情况 1: 模型返回 tool_calls ===
    if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
      // 添加 assistant 消息（含 tool_calls）
      messages.push({
        role: 'assistant',
        content: choice.message.content || null,
        tool_calls: choice.message.tool_calls,
      } as AgentMessage)

      // 执行每个 tool_call（流内已执行的直接取缓存结果，避免重复构建图元）
      for (const tc of choice.message.tool_calls) {
        let result = streamedResults.get(tc.id)

        if (result === undefined) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch {
            args = {}
          }

          const toolStartedAt = Date.now()
          result = executeToolCall(tc.function.name, args, session, onStep, onSSEEvent)
          toolMs += Date.now() - toolStartedAt
          toolCalls++
        }

        // 添加 tool 结果消息：只回传精简摘要，完整数据留在工作区，避免上下文随轮次膨胀
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: compactToolResult(tc.function.name, result),
        })
      }
      emitMetrics()

      // 目标不明确：提问并结束本轮，不产出图纸，等待用户回答
      if (session.question) {
        const metrics = buildMetrics()
        onSSEEvent({ type: 'metrics', metrics })
        onSSEEvent({ type: 'done' })
        return {
          success: false,
          question: session.question,
          steps: session.steps,
          metrics,
        }
      }

      if (choice.message.tool_calls.some(tc => isAssemblyTool(tc.function.name))) {
        if (session.finalJson) {
          // Schema 校验
          const errors = validateFinalOutput(session.finalJson)
          if (errors.length === 0) {
            // 成功
            const doneStep: AgentStep = {
              type: 'done',
              content: '生成完成',
              timestamp: Date.now(),
            }
            session.steps.push(doneStep)

            await enrichModelPoints(session.finalJson, context.modelPointApi)
            const metrics = buildMetrics()
            onSSEEvent({ type: 'result', json: session.finalJson })
            onSSEEvent({ type: 'metrics', metrics })
            onSSEEvent({ type: 'done' })

            return {
              success: true,
              json: session.finalJson,
              steps: session.steps,
              metrics,
            }
          }

          // 校验失败 → 进入重试
          retries++
          // 未通过校验的组装结果不能占着结果位，否则后续兜底组装会被跳过
          session.finalJson = undefined
          lastValidationErrors = formatErrors(errors)
          const errMsg = `生成的 JSON 校验未通过，以下字段需要修正：\n${lastValidationErrors}\n请重新调用 assemble 工具并修正。`
          messages.push({ role: 'user', content: errMsg })

          onSSEEvent({ type: 'error', content: errMsg, retry: true })

          const retryStep: AgentStep = {
            type: 'retry',
            content: formatErrors(errors),
            timestamp: Date.now(),
          }
          session.steps.push(retryStep)
          continue
        }
      }

      continue
    }

    // === 情况 2: 模型返回文本（可能包含 JSON）===
    if (choice.message?.content) {
      const content = choice.message.content

      // 尝试从文本中提取 JSON
      const json = extractJson(content)

      if (json) {
        // 判断类型
        const detectedType = detectType(json)
        if (detectedType && detectedType !== editorType) {
          retries++
          const errMsg = `输出类型错误：本次要求 ${editorType}，模型却输出了 ${detectedType}。请使用本次类型对应的 create/assemble 工具重新生成。`
          messages.push({ role: 'assistant', content })
          messages.push({ role: 'user', content: errMsg })
          onSSEEvent({ type: 'error', content: errMsg, retry: true })
          continue
        }

        const errors = validateFinalOutput(json)
        if (errors.length === 0) {
          session.finalJson = json
          await enrichModelPoints(json, context.modelPointApi)

          const metrics = buildMetrics()
          onSSEEvent({ type: 'result', json })
          onSSEEvent({ type: 'metrics', metrics })
          onSSEEvent({ type: 'done' })

          return {
            success: true,
            json,
            steps: session.steps,
            metrics,
          }
        }

        // 有 JSON 但格式不对 → 校验反馈
        retries++
        const errMsg = `JSON 校验失败：\n${formatErrors(errors)}\n请修正后重新输出。`
        messages.push({ role: 'assistant', content })
        messages.push({ role: 'user', content: errMsg })

        onSSEEvent({ type: 'error', content: errMsg, retry: true })
        continue
      }

      // 文本中没有 JSON
      messages.push({ role: 'assistant', content })

      const assembledFromText = await finishWithAutoAssemble()
      if (assembledFromText) return assembledFromText

      // 已执行过工具却只回了一段文字（如复述计划）：催促继续调用工具，而不是直接判失败
      if (toolCalls > 0 && retries < maxRetries) {
        retries++
        const errMsg = `你只输出了文字，没有调用工具。请不要复述计划，直接调用工具继续完成任务并调用 assemble 工具输出完整结果。${lastValidationErrors ? `\n上一次校验未通过的原因：\n${lastValidationErrors}` : ''}`
        messages.push({ role: 'user', content: errMsg })
        onSSEEvent({ type: 'error', content: errMsg, retry: true })
        session.steps.push({ type: 'retry', content: '模型仅返回文字，已催促继续调用工具', timestamp: Date.now() })
        continue
      }

      return {
        success: false,
        error: lastValidationErrors
          ? `生成结果校验未通过：\n${lastValidationErrors}`
          : '模型未生成 JSON，可能需要补充信息',
        steps: session.steps,
        metrics: buildMetrics(),
      }
    }

    // === 情况 3: 模型既未调用工具也没有文本 ===
    const assembledFromEmpty = await finishWithAutoAssemble()
    if (assembledFromEmpty) return assembledFromEmpty

    // 推理模型把输出额度全部花在思考上（finish_reason=length）：不是校验失败，单独计数，
    // 下一次提高输出上限并要求精简思考，避免一次偶发的“想太久”直接耗尽重试次数
    if (choice.finish_reason === 'length' && lengthRetries < MAX_LENGTH_RETRIES) {
      lengthRetries++
      const nudge = toolCalls > 0
        ? '你上一轮的思考耗尽了输出额度，没有产出任何内容。这次请把思考控制在关键决策上、尽快行动：若图元尚未创建完毕，继续调用 create_* / add_feature_* 工具；若已全部完成，立即调用 assemble 工具输出完整结果。'
        : '你上一轮的思考耗尽了输出额度，没有产出任何内容。这次请把思考控制在整体方案上（分区、数量、对应关系），不要逐个图元推演坐标，然后立即调用 declare_generation_plan 并开始 create_* 创建图元，边做边调整。'
      messages.push({ role: 'user', content: nudge })
      const notice = `模型思考耗尽了输出额度，已放宽额度并提示其聚焦要点后重试（${lengthRetries}/${MAX_LENGTH_RETRIES}）`
      onSSEEvent({ type: 'retry', content: notice })
      session.steps.push({ type: 'retry', content: notice, timestamp: Date.now() })
      continue
    }

    retries++
    // 空回复（常见于推理模型思考耗尽输出额度）：催促其直接行动，否则下一轮仍会原样空转
    if (toolCalls > 0) {
      messages.push({
        role: 'user',
        content: '你上一轮没有输出任何内容。请减少思考、直接行动：若图元尚未创建完毕，继续调用 create_* / add_feature_* 工具；若已全部完成，立即调用 assemble 工具输出完整结果。',
      })
    }
  }

  // 超过最大重试次数
  return {
    success: false,
    error: `超过最大重试次数 (${maxRetries})${lastValidationErrors ? `，最后一次校验未通过：\n${lastValidationErrors}` : ''}`,
    steps: session.steps,
    metrics: buildMetrics(),
  }
}

// ============================================================
// 模型 API 调用
// ============================================================

interface ModelResponse {
  choices?: Array<{
    message?: {
      role?: string
      content?: string | null
      tool_calls?: ToolCall[]
    }
    finish_reason?: string
  }>
  error?: { message: string }
}

interface ModelCallResult {
  response: ModelResponse | null
  retryCount: number
  /** 实际等待模型 API 的耗时（ms），不含重试退避等待 */
  elapsedMs: number
}

/** 流内派发钩子：让工具在模型还在输出时就执行，而不是等整轮结束 */
interface StreamDispatch {
  /** 单个 tool_call 的 arguments 已完整，可以立即执行 */
  onToolCall: (toolCall: ToolCall) => void
  /** 本次尝试中途失败并将重试，需回滚已派发的副作用 */
  onRollback: () => void
}

/** 超过该长度（字符）仍无任何正式输出的思考视为失控，提前中断（约 4~5k token） */
const DEFAULT_MAX_REASONING_CHARS = 0

/** 组装工具只需名称与画布参数，参数超过该长度说明模型在重写全部图元数据 */
const ASSEMBLE_ARGS_LIMIT = 2000
const ASSEMBLE_STRING_KEYS = ['pageName', 'symbolName', 'bgColor', 'background', 'author', 'company', 'desc']
const ASSEMBLE_NUMBER_KEYS = ['pageWidth', 'pageHeight', 'width', 'height']
/** 超过该时长没有任何可见输出时，推送一次当前进度 */
const PROGRESS_INTERVAL_MS = 20000
const PROGRESS_TICK_MS = 5000

/** 只保留 JSON 顶层（第一层对象）里的字符，嵌套的图元数据整段跳过，避免误取图元内部的 width 等同名字段 */
function topLevelText(raw: string): string {
  let depth = 0
  let inString = false
  let escaped = false
  let out = ''
  for (const ch of raw) {
    if (inString) {
      if (depth === 1) out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      if (depth === 1) out += ch
    } else if (ch === '{' || ch === '[') {
      depth++
    } else if (ch === '}' || ch === ']') {
      depth--
    } else if (depth === 1) {
      out += ch
    }
  }
  return out
}

/** 从被截断的组装参数里只保留名称与画布参数，图元数据一律由服务端工作区提供 */
export function minimalAssembleArgs(raw: string): string {
  const text = topLevelText(raw)
  const args: Record<string, unknown> = {}
  for (const key of ASSEMBLE_STRING_KEYS) {
    const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text)
    if (match) {
      try {
        args[key] = JSON.parse(`"${match[1]}"`)
      } catch {
        // 转义不完整时忽略该字段
      }
    }
  }
  for (const key of ASSEMBLE_NUMBER_KEYS) {
    const match = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text)
    if (match) args[key] = Number(match[1])
  }
  return JSON.stringify(args)
}

type StreamPhase = 'waiting' | 'reasoning' | 'content' | 'tool' | 'paused'

async function callModel(
  reduceThinking: boolean,
  config: AgentConfig,
  messages: AgentMessage[],
  tools: unknown[],
  onSSEEvent: (event: SSEEvent) => void,
  dispatch?: StreamDispatch,
): Promise<ModelCallResult> {
  const maxRetries = config.modelApiMaxRetries
  let elapsedMs = 0
  let dispatched = false

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 上一次尝试已经落了图元，重试前必须先撤销，否则会重复
    if (dispatched) {
      dispatch?.onRollback()
      dispatched = false
    }

    const attemptStartedAt = Date.now()
    // 进度提示：模型长时间无可见输出（排队、深度思考、输出很长的工具参数）时，按当前阶段推送一句状态，避免界面看起来卡住
    const progress = { phase: 'waiting' as StreamPhase, tool: '', toolChars: 0, lastShownAt: attemptStartedAt }
    const show = (content: string) => {
      progress.lastShownAt = Date.now()
      onSSEEvent({ type: 'thinking', content })
    }
    const progressTimer = setInterval(() => {
      const now = Date.now()
      if (progress.phase === 'paused' || progress.phase === 'content' || now - progress.lastShownAt < PROGRESS_INTERVAL_MS) return
      const seconds = Math.round((now - attemptStartedAt) / 1000)
      if (progress.phase === 'waiting') show(`⏳ 等待模型响应（已 ${seconds} 秒）…\n`)
      else if (progress.phase === 'reasoning') show(`💭 仍在深入分析中（已 ${seconds} 秒）…\n`)
      else show(`🛠 正在生成 ${progress.tool || '工具'} 的参数（已 ${Math.max(1, Math.round(progress.toolChars / 1024))} KB，${seconds} 秒）…\n`)
    }, PROGRESS_TICK_MS)
    try {
      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: config.maxTokens || 16384,
        stream: true,
      }

      if (tools.length > 0) {
        body.tools = tools
        body.tool_choice = 'auto'
      }
      // 网关/模型专有参数（如 DeepSeek 的 thinking）；思考超额重试时再叠加 fallbackBody（如关闭思考）
      Object.assign(body, config.extraBody, reduceThinking ? config.fallbackBody : undefined)

      const res = await fetch(config.modelApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.modelApiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`[AgentService] API 调用失败 (attempt ${attempt + 1}/${maxRetries + 1}):`, res.status, errText)

        const isRateLimited = res.status === 429
        const isRetryable = isRateLimited || res.status === 408 || res.status >= 500

        // 认证失败、参数错误等不可恢复错误不重试
        if (!isRetryable) {
          elapsedMs += Date.now() - attemptStartedAt
          return { response: null, retryCount: attempt, elapsedMs }
        }

        if (attempt < maxRetries) {
          elapsedMs += Date.now() - attemptStartedAt
          const delay = getRetryDelay(config, attempt, res.status, res.headers.get('retry-after'))
          const reason = isRateLimited
            ? '模型服务触发速率限制'
            : `模型服务暂时不可用 (HTTP ${res.status})`
          onSSEEvent({
            type: 'retry',
            content: `${reason}，将在 ${formatDelay(delay)} 后重试 (${attempt + 1}/${maxRetries})...`,
          })
          progress.phase = 'paused'
          await sleep(delay)
          continue
        }
        elapsedMs += Date.now() - attemptStartedAt
        return { response: null, retryCount: attempt, elapsedMs }
      }

      // 流式读取模型 API 响应
      const reader = res.body?.getReader()
      if (!reader) {
        console.error('[AgentService] 无法获取响应流')
        elapsedMs += Date.now() - attemptStartedAt
        return { response: null, retryCount: attempt, elapsedMs }
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedContent = ''
      const accumulatedToolCalls = new Map<number, {
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>()
      let maxIndex = -1
      let finishReason = ''
      let reasoningChars = 0
      const digest = new ThinkingDigest()
      let thinkingRunaway = false
      let oversizedAssemble = false
      const flushedIndexes = new Set<number>()

      // index 递增说明上一个 tool_call 的分片已经吐完，可以立即派发
      const flush = (index: number) => {
        if (!dispatch || index < 0 || flushedIndexes.has(index)) return
        const toolCall = accumulatedToolCalls.get(index)
        if (!toolCall?.id || !toolCall.function.name) return
        try {
          JSON.parse(toolCall.function.arguments || '{}')
        } catch {
          return // 参数尚未闭合，留给流结束后统一执行
        }
        flushedIndexes.add(index)
        try {
          dispatch.onToolCall(toolCall)
          dispatched = true
          progress.lastShownAt = Date.now()
        } catch (error) {
          // 构建异常不是网络问题，不缓存结果即可交回流结束后的统一执行路径，避免误触发模型重试
          console.error('[AgentService] 流内工具执行失败:', error)
        }
      }

      streamLoop: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // 思考预算保护（可选）：还没有任何正式输出 / 工具调用就思考过长，提前中断，由上层按“思考超额”处理
        const maxReasoningChars = config.maxReasoningChars ?? DEFAULT_MAX_REASONING_CHARS
        if (maxReasoningChars > 0 && reasoningChars > maxReasoningChars && !accumulatedContent && accumulatedToolCalls.size === 0) {
          thinkingRunaway = true
          await reader.cancel().catch(() => undefined)
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const chunk = JSON.parse(data)
            if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason
            const delta = chunk.choices?.[0]?.delta
            if (!delta) continue

            // 推理模型的思考原文冗长且多为推演草稿，不整段转发：只摘出关键结论实时展示，
            // 同时统计长度用于（可选的）思考预算保护
            if (delta.reasoning_content) {
              const reasoning = String(delta.reasoning_content)
              reasoningChars += reasoning.length
              progress.phase = 'reasoning'
              for (const key of digest.push(reasoning)) show(`💭 ${key}\n`)
            }

            // 文本内容 → 实时转发给前端
            if (delta.content) {
              accumulatedContent += delta.content
              progress.phase = 'content'
              show(delta.content)
            }

            // 工具调用 → 累积（多段 fragment 按 index 合并）
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0
                if (idx > maxIndex) {
                  flush(maxIndex)
                  maxIndex = idx
                }
                if (!accumulatedToolCalls.has(idx)) {
                  accumulatedToolCalls.set(idx, {
                    id: tc.id || '',
                    type: 'function',
                    function: { name: '', arguments: '' },
                  })
                }
                const existing = accumulatedToolCalls.get(idx)!
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.function.name += tc.function.name
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
                progress.phase = 'tool'
                progress.tool = existing.function.name
                progress.toolChars = existing.function.arguments.length

                // 模型把全部图元数据写进组装参数：输出会极其缓慢（看起来卡住），且服务端本就用工作区图元组装。
                // 立即截断，只保留名称/画布参数，直接组装
                if (isAssemblyTool(existing.function.name) && existing.function.arguments.length > ASSEMBLE_ARGS_LIMIT) {
                  existing.function.arguments = minimalAssembleArgs(existing.function.arguments)
                  oversizedAssemble = true
                  break streamLoop
                }
              }
            }
          } catch {
            // 解析失败，跳过该 chunk
          }
        }
      }

      // 流结束，最后一个 tool_call 也已完整
      if (oversizedAssemble) {
        await reader.cancel().catch(() => undefined)
        console.warn('[AgentService] 组装参数中包含图元数据，已截断并改用工作区图元组装')
        show('⚡ 直接使用已创建的图元组装（无需重新输出图元数据）\n')
      }
      flush(maxIndex)
      for (const key of digest.flush()) show(`💭 ${key}\n`)

      // 构建最终响应
      const toolCalls = Array.from(accumulatedToolCalls.values())
      const message: NonNullable<ModelResponse['choices']>[0]['message'] = {
        role: 'assistant',
        content: accumulatedContent || null,
      }

      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls
      }

      elapsedMs += Date.now() - attemptStartedAt
      return {
        response: {
          choices: [{
            message,
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : (thinkingRunaway ? 'length' : (finishReason || 'stop')),
          }],
        },
        retryCount: attempt,
        elapsedMs,
      }
    } catch (err) {
      console.error(`[AgentService] 网络请求异常 (attempt ${attempt + 1}/${maxRetries + 1}):`, err)
      elapsedMs += Date.now() - attemptStartedAt

      if (attempt < maxRetries) {
        const delay = getRetryDelay(config, attempt)
        onSSEEvent({
          type: 'retry',
          content: `网络连接失败，将在 ${formatDelay(delay)} 后重试 (${attempt + 1}/${maxRetries})...`,
        })
        progress.phase = 'paused'
        await sleep(delay)
        continue
      }
      return { response: null, retryCount: attempt, elapsedMs }
    } finally {
      clearInterval(progressTimer)
    }
  }

  return { response: null, retryCount: maxRetries, elapsedMs }
}

/** 计算指数退避延迟；429 至少等待一个 TPM 统计窗口，并优先遵循 Retry-After。 */
function getRetryDelay(
  config: AgentConfig,
  attempt: number,
  status?: number,
  retryAfter?: string | null,
): number {
  const configuredBaseDelay = status === 429
    ? Math.max(config.modelApiRetryDelay, config.modelApiRateLimitRetryDelay)
    : config.modelApiRetryDelay
  const baseDelay = Number.isFinite(configuredBaseDelay) ? Math.max(0, configuredBaseDelay) : 0
  const configuredMaxDelay = Number.isFinite(config.modelApiRetryMaxDelay)
    ? config.modelApiRetryMaxDelay
    : baseDelay
  const maxDelay = Math.max(baseDelay, configuredMaxDelay)
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
  const retryAfterDelay = parseRetryAfter(retryAfter)
  const delay = Math.max(exponentialDelay, retryAfterDelay ?? 0)
  const jitter = Math.floor(Math.random() * Math.min(delay * 0.1, 5000))
  return delay + jitter
}

/** 支持 Retry-After 的秒数或 HTTP 日期格式。 */
function parseRetryAfter(value?: string | null): number | null {
  if (!value) return null

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  const retryAt = Date.parse(value)
  if (Number.isNaN(retryAt)) return null
  return Math.max(0, retryAt - Date.now())
}

function formatDelay(delay: number): string {
  return `${Math.ceil(delay / 1000)} 秒`
}

/** 延迟工具函数 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================
// JSON 提取工具
// ============================================================

/**
 * 从模型文本输出中提取 JSON 对象
 * 支持 ```json 代码块和纯 JSON 文本
 */
function extractJson(text: string): Record<string, unknown> | null {
  // 尝试 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // 继续尝试其他方式
    }
  }

  // 尝试直接解析（取第一个 { 到最后一个 }）
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1))
    } catch {
      // 失败
    }
  }

  return null
}

/**
 * 自动检测 JSON 是 Display Document 还是 Symbol
 */
function detectType(json: Record<string, unknown>): EditorType | null {
  if (json.document) return 'display'
  if (json.comps !== undefined && json.code) return 'symbol'
  return null
}
