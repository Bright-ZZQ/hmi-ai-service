/**
 * 工具执行上下文与公共辅助
 *
 * agent-service 与各类工具 handler（批量 / 排版 / 检查 / 页面级）共用，
 * 避免 handler 模块反向依赖 agent-service 造成循环引用。
 */

import { decodeText, findElementIndex, getElementAliases, isRecord } from '../lib/element-lookup'
import { isBackgroundElement } from '../lib/element-builders'
import type { FeatureExecution, GenerationPlan } from '../plan/generation-plan'
import type { AgentQuestion, AgentStep, EditorType, SSEEvent, StreamCanvas } from '../../types'

export type Rec = Record<string, unknown>

export interface ZOrderOp {
  action: 'front' | 'back' | 'up' | 'down'
  ids: string[]
}

export interface SessionState {
  editorType: EditorType
  workingElements: Rec[]
  steps: AgentStep[]
  finalJson?: Rec
  currentJson?: Rec
  generationPlan?: GenerationPlan
  featureExecutions: FeatureExecution[]
  /** 本轮新增的图纸级事件定义，assemble_display 时并入 pageProperty.events */
  displayEvents: Rec[]
  /** 本轮设置的图纸脚本，assemble_display 时写入 pageProperty.scriptFunc */
  displayScript?: { script: string, replace: boolean }
  /** 本轮新增的图符数据绑定声明，assemble_symbol 时并入 dataBindings */
  symbolDataBindings: Rec[]
  /** 本轮通过 set_page_property 设置的图纸属性，assemble_display 时覆盖到 pageProperty */
  pageProperty: Rec
  /** 本轮通过 declare_page_params 声明的页面参数，assemble_display 时并入 document.pageParams */
  pageParamDecls: Rec[]
  /** 本轮登记的层级调整，assemble_display 时在最终图元列表上依次执行 */
  zOrderOps: ZOrderOp[]
  /** 目标不明确时向用户的提问，设置后本轮结束 */
  question?: AgentQuestion
  /** 流式绘制用的画布信息；最终以 assemble 结果为准 */
  canvas: StreamCanvas
}

export interface ToolExecContext {
  name: string
  args: Rec
  session: SessionState
  onStep: (step: AgentStep) => void
  emit: (event: SSEEvent) => void
}

export type ToolHandler = (ctx: ToolExecContext) => string

export function ok(payload: Rec = {}): string {
  return JSON.stringify({ success: true, ...payload })
}

export function fail(error: string): string {
  return JSON.stringify({ success: false, error })
}

/** 记录并下发一个工具步骤 */
export function recordStep(ctx: ToolExecContext, content: string): void {
  const step: AgentStep = {
    type: 'tool_call',
    content,
    toolName: ctx.name,
    toolArgs: ctx.args,
    timestamp: Date.now(),
  }
  ctx.session.steps.push(step)
  ctx.onStep(step)
}

/** 图元的稳定标识：优先 id，其次 store.node_id，最后任意别名 */
export function getElementKey(element: Rec): string {
  const store = isRecord(element.store) ? element.store : {}
  const id = element.id ?? store.node_id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : getElementAliases(element)[0] ?? ''
}

export function emitUpdate(ctx: ToolExecContext, element: Rec): void {
  ctx.emit({
    type: 'element_patch',
    patch: { op: 'update', target: getElementKey(element), element },
  })
}

export function emitDelete(ctx: ToolExecContext, element: Rec): void {
  ctx.emit({ type: 'element_patch', patch: { op: 'delete', target: getElementKey(element) } })
}

/** 下发新建图元；只有整批都是全画布底板时才下沉，避免复合组件的混合批次被误判 */
export function emitElements(
  session: SessionState,
  emit: (event: SSEEvent) => void,
  elements: Rec[],
): void {
  if (elements.length === 0) return
  emit({
    type: 'element',
    elements,
    isBackground: session.editorType === 'display'
      && elements.every(el => isBackgroundElement(el, session.canvas.pageWidth, session.canvas.pageHeight)),
  })
}

export function toStringList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
    .map(item => String(item).trim())
    .filter(Boolean)
}

/** 模型传入的 JSON 参数可能已是对象，也可能是字符串；统一解析 */
export function parseJsonArg(value: unknown): { value: unknown } | { error: string } {
  if (typeof value !== 'string') return { value }
  const text = value.trim()
  if (!text) return { value: undefined }
  try {
    return { value: JSON.parse(text) }
  } catch (error) {
    return { error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` }
  }
}

export interface ElementFilter {
  type?: string
  nameContains?: string
  textContains?: string
}

export function readFilter(value: unknown): ElementFilter | undefined {
  const parsed = parseJsonArg(value)
  if ('error' in parsed || !isRecord(parsed.value)) return undefined
  const raw = parsed.value
  const pick = (key: string) => (typeof raw[key] === 'string' && (raw[key] as string).trim() ? (raw[key] as string).trim() : undefined)
  const filter: ElementFilter = { type: pick('type'), nameContains: pick('nameContains'), textContains: pick('textContains') }
  return filter.type || filter.nameContains || filter.textContains ? filter : undefined
}

function matchesFilter(element: Rec, filter: ElementFilter): boolean {
  if (filter.type && element.type !== filter.type) return false
  if (filter.nameContains) {
    const name = typeof element.name === 'string' ? element.name : ''
    if (!name.toLowerCase().includes(filter.nameContains.toLowerCase())) return false
  }
  if (filter.textContains) {
    const text = decodeText(element.text) ?? ''
    if (!text.toLowerCase().includes(filter.textContains.toLowerCase())) return false
  }
  return true
}

/**
 * 解析目标图元下标。targets 中每项可以是 id / code / key / name；
 * id 精确命中时只取该图元，仅按名称命中时取全部同名图元。filter 为空时必须提供 targets。
 */
export function resolveTargetIndices(
  session: SessionState,
  targets: unknown,
  filter: ElementFilter | undefined,
): { indices: number[] } | { error: string } {
  const list = toStringList(targets)
  const found = new Set<number>()
  const elements = session.workingElements

  for (const target of list) {
    const exact = elements.findIndex(element => element.id === target
      || (isRecord(element.store) && element.store.node_id === target)
      || element.code === target || element.key === target)
    if (exact >= 0) {
      found.add(exact)
      continue
    }
    const byName = elements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => getElementAliases(element).includes(target))
    if (byName.length === 0) {
      const index = findElementIndex(elements, target)
      if (index < 0) return { error: `未找到图元: ${target}` }
    }
    byName.forEach(({ index }) => found.add(index))
  }

  if (filter) {
    elements.forEach((element, index) => {
      if (matchesFilter(element, filter)) found.add(index)
    })
  }

  if (list.length === 0 && !filter) return { error: '必须提供 targets（图元 id 或名称列表）或 filter' }
  if (found.size === 0) return { error: '没有匹配的图元' }
  return { indices: [...found].sort((a, b) => a - b) }
}
