/**
 * MCP Server：把 Agent 工具层暴露给第三方 agent。
 *
 * 每个 MCP 会话持有一份 SessionState，由外部 agent 的 LLM 自行编排工具调用，
 * 工具执行与组装校验复用内部 Agent Loop 的同一套实现。
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import { getToolsForType, isAssemblyTool } from '../agent/skill-registry'
import { buildMcpInstructions } from '../agent/prompts'
import { enrichModelPoints } from '../agent/model-point-resolver'
import { briefOf, compactToolResult } from '../agent/tool-result-compactor'
import { formatErrors } from '../agent/schema-validator'
import { createSession, executeToolCall, validateSessionOutput } from '../agent/tools'
import type { Rec } from '../agent/tool-context'
import type { EditorType, ModelPointApiConfig } from '../types'
import { toFilename } from './result-store'
import type { BundleFile } from './bundle'

export type RequestHeaders = Record<string, string | string[] | undefined>

export interface ExportedResult {
  url: string
  filename: string
  /** 包内 JSON 文件名；单个结果时就是 filename，多个结果时 filename 是 zip */
  files: string[]
  fileCount: number
  sizeBytes: number
  expiresInSeconds: number
}

export interface HmiMcpServerOptions {
  editorType: EditorType
  /** 由当前请求头解析编辑器网关配置，用于组装后补全测点；返回 undefined 则跳过补全 */
  resolveModelPointApi?: (headers: RequestHeaders) => ModelPointApiConfig | undefined
  /** 提供后暴露 export_result 工具：保存一批组装结果并返回客户端可下载的链接 */
  exportResult?: (payload: { files: BundleFile[], editorType: EditorType }, headers: RequestHeaders) => ExportedResult
}

const SERVER_INFO = { name: 'hmiengineweb-ai-service', version: '1.0.0' }
const MAX_STATE_ELEMENTS = 100

// 外部 agent 有自己的用户通道，不暴露向用户提问的工具
const HIDDEN_TOOLS = new Set(['ask_user'])

const BEGIN_SESSION = 'begin_session'
const GET_SESSION_STATE = 'get_session_state'
const EXPORT_RESULT = 'export_result'

const SESSION_TOOLS: Tool[] = [
  {
    name: BEGIN_SESSION,
    description: '开始（或重置）一次绘制会话。不传 currentJson 为从空白画布开始；传入已有图纸/图符 JSON 则载入其中的图元，之后可在其基础上增量修改。会清空当前工作区的全部图元。一次对话要生成多张时，开始下一张之前必须先调用本工具，否则新图元会叠加到当前这张上；已组装成功但尚未导出的结果会自动保留，用于最后一起导出。',
    inputSchema: {
      type: 'object',
      properties: {
        currentJson: {
          type: 'object',
          description: '已有的图纸（含 document）或图符（含 comps）完整 JSON，可选',
        },
      },
      required: [],
    },
  },
  {
    name: GET_SESSION_STATE,
    description: '查看当前会话状态：画布尺寸、工作区图元概要（id/名称/类型/位置尺寸）、是否已声明计划、是否已组装、待导出的结果数量。',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
]

const EXPORT_RESULT_TOOL: Tool = {
  name: EXPORT_RESULT,
  description: '把待导出的组装结果（本会话中已组装成功且尚未导出的全部图纸/图符）保存为可下载文件，返回下载链接（短期有效）。只有一张时链接是 .json，多张时是一个 .zip（内含每张的 .json）。需要把结果存为本地文件时，全部生成完后调用一次，再用终端把链接下载到目标路径，避免手工重写 JSON。',
  inputSchema: { type: 'object', properties: {}, required: [] },
}

const ASSEMBLE_HINT = '\n【MCP】组装成功后如需继续生成另一张，必须先调用 begin_session，否则新图元会叠加到当前这张上。'

function toMcpTool(definition: ReturnType<typeof getToolsForType>[number]): Tool {
  const { name, description, parameters } = definition.function
  return {
    name,
    description: isAssemblyTool(name) ? `${description}${ASSEMBLE_HINT}` : description,
    inputSchema: parameters as Tool['inputSchema'],
  }
}

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) }
}

function jsonResult(payload: Rec): CallToolResult {
  return textResult(JSON.stringify(payload))
}

function parseRecord(raw: string): Rec | undefined {
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Rec : undefined
  } catch {
    return undefined
  }
}

/** handler 返回 { success: false } 或仅含 error 字段（未知工具）视为失败 */
function isFailure(raw: string): boolean {
  const parsed = parseRecord(raw)
  if (!parsed) return false
  return parsed.success === false || (parsed.success === undefined && typeof parsed.error === 'string')
}

function errorMessageOf(raw: string): string {
  const parsed = parseRecord(raw)
  return typeof parsed?.error === 'string' ? parsed.error : raw
}

function isPlainRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createHmiMcpServer(options: HmiMcpServerOptions): Server {
  const { editorType, resolveModelPointApi, exportResult } = options
  let session = createSession(editorType)

  const toolDefinitions = getToolsForType(editorType).filter(tool => !HIDDEN_TOOLS.has(tool.function.name))
  const requiredByTool = new Map(toolDefinitions.map(tool => [tool.function.name, tool.function.parameters.required]))
  const tools = [
    ...SESSION_TOOLS,
    ...(exportResult ? [EXPORT_RESULT_TOOL] : []),
    ...toolDefinitions.map(toMcpTool),
  ]

  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: buildMcpInstructions(editorType),
  })

  const noop = () => {}

  // 已组装成功、尚未导出的历史结果；begin_session 重置会话时不丢弃，最后一起导出
  let pendingFiles: BundleFile[] = []
  // 最近一批已导出的文件，链接过期后可重新导出
  let lastExported: BundleFile[] = []
  let currentExported = false

  const snapshotCurrent = (): BundleFile | undefined => {
    const finalJson = session.finalJson
    if (!finalJson || currentExported) return undefined
    const name = editorType === 'display'
      ? (isPlainRecord(finalJson.document) ? finalJson.document.name : undefined)
      : finalJson.name
    return { filename: toFilename(name, editorType), body: JSON.stringify(finalJson) }
  }

  const beginSession = (args: Rec): CallToolResult => {
    if (args.currentJson !== undefined && !isPlainRecord(args.currentJson)) {
      return textResult('currentJson 必须是 JSON 对象', true)
    }
    const previous = snapshotCurrent()
    if (previous) pendingFiles.push(previous)
    session = createSession(editorType, args.currentJson)
    currentExported = false
    return jsonResult({
      success: true,
      canvas: session.canvas,
      elementCount: session.workingElements.length,
      pendingExportCount: pendingFiles.length,
    })
  }

  const getSessionState = (): CallToolResult => jsonResult({
    success: true,
    editorType,
    canvas: session.canvas,
    elementCount: session.workingElements.length,
    elements: session.workingElements.slice(0, MAX_STATE_ELEMENTS).map(briefOf),
    truncated: session.workingElements.length > MAX_STATE_ELEMENTS,
    planDeclared: Boolean(session.generationPlan),
    assembled: Boolean(session.finalJson),
    pendingExportCount: pendingFiles.length + (snapshotCurrent() ? 1 : 0),
  })

  const assemble = async (name: string, args: Rec, headers: RequestHeaders): Promise<CallToolResult> => {
    // 清掉上一次的结果，避免本次组装失败时误取到旧结果
    session.finalJson = undefined
    const raw = executeToolCall(name, args, session, noop, noop)
    const finalJson = session.finalJson
    if (!finalJson) return textResult(errorMessageOf(raw), true)

    // 计划可选：未声明则跳过计划校验，已声明则照常校验
    const errors = validateSessionOutput(session, finalJson, { requirePlan: false })
    if (errors.length > 0) {
      session.finalJson = undefined
      return textResult(`生成的 JSON 校验未通过，以下字段需要修正：\n${formatErrors(errors)}\n请修正后重新调用 ${name}。`, true)
    }

    await enrichModelPoints(finalJson, resolveModelPointApi?.(headers))
    currentExported = false
    // 只输出图纸/图符数据本身；失败走 isError，不需要额外的 success 包装
    return textResult(JSON.stringify(finalJson))
  }

  const exportLastResult = (exporter: NonNullable<typeof exportResult>, headers: RequestHeaders): CallToolResult => {
    const current = snapshotCurrent()
    const files = current ? [...pendingFiles, current] : [...pendingFiles]
    // 没有新结果时重新导出上一批，方便链接过期后再取
    const batch = files.length > 0 ? files : lastExported
    if (batch.length === 0) {
      return textResult(`尚无可导出的结果，请先成功调用 ${editorType === 'display' ? 'assemble_display' : 'assemble_symbol'}`, true)
    }
    const exported = exporter({ files: batch, editorType }, headers)
    if (files.length > 0) {
      lastExported = files
      pendingFiles = []
      if (current) currentExported = true
    }
    return jsonResult({ ...exported })
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

  server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
    const { name } = request.params
    const args = request.params.arguments ?? {}

    if (name === BEGIN_SESSION) return beginSession(args)
    if (name === GET_SESSION_STATE) return getSessionState()
    if (name === EXPORT_RESULT && exportResult) return exportLastResult(exportResult, extra.requestInfo?.headers ?? {})

    const required = requiredByTool.get(name)
    if (!required) return textResult(`未知工具: ${name}`, true)
    const missing = required.filter(key => args[key] === undefined)
    if (missing.length > 0) return textResult(`缺少必填参数: ${missing.join('、')}`, true)

    if (isAssemblyTool(name)) return assemble(name, args, extra.requestInfo?.headers ?? {})

    const raw = executeToolCall(name, args, session, noop, noop)
    return textResult(compactToolResult(name, raw), isFailure(raw))
  })

  return server
}
