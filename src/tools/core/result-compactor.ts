/**
 * 工具结果精简：回传给模型的工具结果只保留后续决策需要的信息（成败、id、名称、类型、位置尺寸、错误原因），
 * 不再回传完整图元 / 完整图纸 JSON。完整数据仍保存在会话工作区并通过 SSE 推给前端，
 * 模型需要细节时可调用 get_element_detail 按需读取。
 *
 * 每轮请求都会重发全部历史消息，完整 JSON 会让上下文随轮次线性膨胀，拖慢每一轮的响应。
 */

import { getElementBounds } from '../lib/element-geometry'
import { decodeText, isRecord } from '../lib/element-lookup'

type Rec = Record<string, unknown>

const MAX_RESULT_CHARS = 4000
const MAX_TEXT_PREVIEW = 30
const MAX_LIST_ITEMS = 40

function round(value: number): number {
  return Math.round(value)
}

/** 图元摘要：图纸图元用 id，图符图元用 store.node_id */
export function briefOf(element: Rec): Rec {
  const store = isRecord(element.store) ? element.store : {}
  const attrs = isRecord(element.attrs) ? element.attrs : {}
  const bounds = getElementBounds(element)
    ?? (typeof attrs.x === 'number' && typeof attrs.y === 'number'
      ? { x: attrs.x, y: attrs.y, width: Number(attrs.width) || 0, height: Number(attrs.height) || 0 }
      : undefined)
  const text = element.type === 'Text' ? decodeText(element.text) : (typeof attrs.text === 'string' ? attrs.text : undefined)
  const features = ['dynamicDyna', 'interactiveDyna', 'events']
    .reduce((sum, key) => sum + (Array.isArray(store[key]) ? (store[key] as unknown[]).length : 0), 0)
  return {
    id: element.id ?? store.node_id,
    name: element.name ?? attrs.name,
    type: element.type ?? element.className,
    ...(bounds ? { x: round(bounds.x), y: round(bounds.y), width: round(bounds.width), height: round(bounds.height) } : {}),
    ...(text ? { text: text.length > MAX_TEXT_PREVIEW ? `${text.slice(0, MAX_TEXT_PREVIEW)}…` : text } : {}),
    ...(features > 0 ? { features } : {}),
  }
}

function isElementLike(value: unknown): value is Rec {
  return isRecord(value) && (typeof value.type === 'string' || typeof value.className === 'string')
    && (value.id !== undefined || isRecord(value.store))
}

function clip(text: string): string {
  return text.length <= MAX_RESULT_CHARS ? text : `${text.slice(0, MAX_RESULT_CHARS)}…（结果过长已截断，可用 get_element_detail 按需读取）`
}

/** 把工具原始结果精简为回传模型的内容；解析失败或无需精简时原样返回（超长时截断） */
export function compactToolResult(toolName: string, raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return clip(raw)
  }
  if (!isRecord(parsed)) return clip(raw)

  // 组装：不回传整份图纸，模型只需知道组装成功与规模
  if (toolName === 'assemble_display' && isRecord(parsed.document)) {
    const document = parsed.document
    const pageProperty = isRecord(document.pageProperty) ? document.pageProperty : {}
    return JSON.stringify({
      success: true,
      message: '图纸已组装，服务端正在校验',
      elementCount: Array.isArray(document.elements) ? document.elements.length : 0,
      pageWidth: pageProperty.pageWidth,
      pageHeight: pageProperty.pageHeight,
    })
  }
  if (toolName === 'assemble_symbol' && Array.isArray(parsed.comps)) {
    return JSON.stringify({
      success: true,
      message: '图符已组装，服务端正在校验',
      elementCount: parsed.comps.length,
      width: parsed.width,
      height: parsed.height,
    })
  }

  // 创建工具直接返回图元本身
  if (isElementLike(parsed)) return JSON.stringify({ success: true, ...briefOf(parsed) })

  // { success, element } / { success, removed } 形式
  const next: Rec = Object.assign({}, parsed)
  let changed = false
  for (const key of ['element', 'removed']) {
    if (isElementLike(next[key])) {
      next[key] = briefOf(next[key] as Rec)
      changed = true
    }
  }
  if (Array.isArray(next.elements) && next.elements.every(isElementLike)) {
    next.elements = (next.elements as Rec[]).slice(0, MAX_LIST_ITEMS).map(briefOf)
    changed = true
  }
  return clip(changed ? JSON.stringify(next) : raw)
}
