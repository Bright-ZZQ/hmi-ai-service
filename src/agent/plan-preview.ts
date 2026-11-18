/**
 * 整体方案预览：在带工具的完整生成之前，先用一次轻量调用（不带工具、关闭思考、短输出）
 * 快速产出 3~5 条整体方案要点并流式展示，让用户几秒内就看到分析结论；
 * 同时把方案交给主流程，减少主流程重复规划所花的思考。
 *
 * 失败、超时或网关不支持时静默返回空串，不影响主流程。
 */

import type { AgentConfig, AgentContext, EditorType } from '../types'

const PREVIEW_MAX_TOKENS = 600
const PREVIEW_TIMEOUT_MS = 25000
const MIN_PROMPT_LENGTH = 20
const MAX_EXISTING_NAMES = 20
const MAX_HISTORY_MESSAGES = 4
const MAX_HISTORY_CHARS = 600

const PREVIEW_SYSTEM = `你是 HMI 工控组态软件的图纸/图符生成助手。现在只做“方案预览”，不要生成任何图元数据，不要调用工具。
用 3~5 条要点说明你准备如何完成用户需求，每条单独一行，以“- ”开头，每条不超过 40 字，只写结论：
- 整体布局与分区（含画布尺寸是否够用）
- 对象与动态特性/事件的对应关系（用哪类特性或事件实现）
- 需求中的歧义或矛盾，以及你的取舍
- 需要用户注意的约束
不要写坐标推演、不要复述需求原文、不要写开场白和总结。`

function describeContext(editorType: EditorType, context: AgentContext): string {
  const parts: string[] = [`本次要生成的是${editorType === 'symbol' ? '图符' : '图纸'}。`]
  const json = context.currentJson
  if (json) {
    const elements = editorType === 'display'
      ? (json.document as Record<string, unknown> | undefined)?.elements
      : json.comps
    if (Array.isArray(elements) && elements.length > 0) {
      const names = elements
        .map((element) => {
          const record = element as Record<string, unknown>
          const attrs = (record.attrs ?? {}) as Record<string, unknown>
          return String(record.name ?? attrs.name ?? '')
        })
        .filter(Boolean)
      parts.push(`画布上已有 ${elements.length} 个图元（部分名称：${[...new Set(names)].slice(0, MAX_EXISTING_NAMES).join('、') || '无'}），请在其基础上修改，不要重画。`)
    }
  }
  return parts.join('')
}

export async function generatePlanPreview(
  prompt: string,
  editorType: EditorType,
  config: AgentConfig,
  context: AgentContext,
  onText: (text: string) => void,
): Promise<string> {
  if (prompt.trim().length < MIN_PROMPT_LENGTH) return ''

  const history = (context.history ?? [])
    .filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-MAX_HISTORY_MESSAGES)
    .map(message => ({ role: message.role, content: message.content.slice(0, MAX_HISTORY_CHARS) }))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS)
  let text = ''
  try {
    const res = await fetch(config.modelApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.modelApiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: `${PREVIEW_SYSTEM}\n${describeContext(editorType, context)}` },
          ...history,
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: PREVIEW_MAX_TOKENS,
        stream: true,
        // 关闭思考等专有参数（如 DeepSeek 的 {"thinking":{"type":"disabled"}}），保证几秒内出结果
        ...config.previewBody,
      }),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) return ''

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta
          // 只取正文；若网关仍返回思考内容（reasoning_content）则忽略
          if (typeof delta?.content === 'string' && delta.content) {
            text += delta.content
            onText(delta.content)
          }
        } catch {
          // 忽略无法解析的分片
        }
      }
    }
  } catch {
    // 超时 / 网络错误：已流出的部分仍可作为方案使用
  } finally {
    clearTimeout(timer)
  }
  return text.trim()
}
