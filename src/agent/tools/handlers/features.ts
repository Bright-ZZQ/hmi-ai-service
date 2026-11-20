import { isDynamicFeatureTool, isInteractiveFeatureTool } from '../../dynamic-feature-builders'
import {
  ACTION_KINDS,
  DISPLAY_TRIGGERS,
  MOUSE_EVENT_TYPES,
  NODE_SELF,
  buildEventDefinition,
} from '../../event-definition'
import type { ActionKind, DisplayTrigger, MouseEventType } from '../../event-definition'
import { findElementIndex, getElementAliases } from '../../element-lookup'
import { attachFeatureToElement, prepareFeature } from '../../feature-attach'
import { readRotatePivotRequest } from '../../rotate-pivot'
import type { PivotPoint } from '../../rotate-pivot'
import type { SessionState, ToolExecContext } from '../../tool-context'
import { isPlainObject } from '../session'
import type { AgentStep } from '../../../types'

export function resolveFeatureTarget(session: SessionState, args: Record<string, unknown>): {
  target: string
  index: number
  element: Record<string, unknown>
} | { error: string } {
  const target = String(args.elementName || '')
  const index = findElementIndex(session.workingElements, target)
  if (index < 0) {
    return { error: `未找到需要添加特性的图元: ${target}` }
  }
  return { target, index, element: session.workingElements[index] }
}

export function finishFeatureAttach(
  ctx: ToolExecContext,
  target: string,
  element: Record<string, unknown>,
  featureType: string,
  kind: '动态' | '交互',
): string {
  const { name, args, session, onStep, emit } = ctx
  session.featureExecutions.push({
    toolName: name,
    elementKey: getElementAliases(element)[0] || target,
  })
  const step: AgentStep = {
    type: 'tool_call',
    content: `已为图元 "${target}" 添加 ${featureType} ${kind}特性`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emit({
    type: 'element_patch',
    patch: { op: 'update', target, element },
  })
  return JSON.stringify({ success: true, element })
}

// 动态特性（旋转 / 移动 / 闪烁 / 变色 / 数值显示 / 显隐 / 缩放 / 填充 / 流动 / 操作使能 / 多状态文字 / 多状态颜色）
export function handleDynamicFeature(ctx: ToolExecContext): string {
  const { name, args, session } = ctx
  if (!isDynamicFeatureTool(name)) {
    return JSON.stringify({ success: false, error: `动态特性工具尚未实现: ${name}` })
  }
  return attachFeatureFromArgs(ctx, name, args, session)
}

// 交互特性（写值 / 打开页面 / Tip 显示 / 置位）
export function handleInteractiveFeature(ctx: ToolExecContext): string {
  const { name, args, session } = ctx
  if (!isInteractiveFeatureTool(name)) {
    return JSON.stringify({ success: false, error: `交互特性工具尚未实现: ${name}` })
  }
  return attachFeatureFromArgs(ctx, name, args, session)
}

function attachFeatureFromArgs(
  ctx: ToolExecContext,
  name: string,
  args: Record<string, unknown>,
  session: SessionState,
): string {
  const resolved = resolveFeatureTarget(session, args)
  if ('error' in resolved) {
    return JSON.stringify({ success: false, error: resolved.error })
  }
  const { target, element } = resolved
  const prepared = prepareFeature(name, args, element, session.editorType)
  if ('error' in prepared) {
    return JSON.stringify({ success: false, error: prepared.error })
  }
  attachFeatureToElement(element, prepared.storeKey, prepared.feature)
  return finishFeatureAttach(ctx, target, element, prepared.feature.type, prepared.kind)
}

export const DISPLAY_EVENT_KEY = '__display_event__'

function getElementNodeId(element: Record<string, unknown>): string {
  const store = isPlainObject(element.store) ? element.store : {}
  const id = element.id ?? store.node_id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : getElementAliases(element)[0] ?? ''
}

function pickEnum<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback
}

export interface ResolvedRotatePivot {
  pivot: PivotPoint
  indices: number[]
}

/** 解析脚本类工具的 rotatePivot* 参数，并把目标图元定位到工作区下标（尚未写入） */
export function resolveRotatePivot(
  session: SessionState,
  args: Record<string, unknown>,
): ResolvedRotatePivot | null | { error: string } {
  const request = readRotatePivotRequest(args)
  if (request === null || 'error' in request) return request
  if (session.editorType !== 'display') return { error: 'rotatePivot* 参数仅适用于图纸' }
  const indices: number[] = []
  for (const key of request.targets) {
    const index = findElementIndex(session.workingElements, key)
    if (index < 0) return { error: `rotatePivotElements 中的图元 ${key} 不存在，请先创建或用 find_elements 确定` }
    if (!indices.includes(index)) indices.push(index)
  }
  return { pivot: request.pivot, indices }
}

/** 把目标图元的旋转中心设为公共圆心，脚本中的 setRotationEx 即绕该圆心转动；返回被修改图元的 id */
export function applyRotatePivot(ctx: ToolExecContext, resolved: ResolvedRotatePivot): string[] {
  return resolved.indices.map((index) => {
    const element = ctx.session.workingElements[index]
    element.roatePos = { ...resolved.pivot }
    const id = getElementNodeId(element)
    ctx.emit({ type: 'element_patch', patch: { op: 'update', target: id, element } })
    return id
  })
}

export function rotatePivotInfo(resolved: ResolvedRotatePivot | null, ids: string[]) {
  return resolved ? { rotatePivot: { ...resolved.pivot, elements: ids } } : {}
}

// 事件定义：图元级写入 store.events，图纸级并入 pageProperty.events
export function handleAddEventDefinition(ctx: ToolExecContext): string {
  const { name, args, session, onStep } = ctx
  const isDisplay = args.scope === 'display'
  const title = typeof args.title === 'string' ? args.title.trim().slice(0, 30) : ''
  const action = pickEnum<ActionKind>(args.action, ACTION_KINDS, 'script')
  const pivot = resolveRotatePivot(session, args)
  if (pivot && 'error' in pivot) return JSON.stringify({ success: false, error: pivot.error })

  // 动作目标图元：targetElements 逐个解析为图元 id
  const nodeIds: string[] = []
  const targets = Array.isArray(args.targetElements) ? args.targetElements : []
  for (const raw of targets) {
    const key = String(raw)
    if (key === NODE_SELF) {
      nodeIds.push(NODE_SELF)
      continue
    }
    const index = findElementIndex(session.workingElements, key)
    if (index < 0) {
      return JSON.stringify({ success: false, error: `未找到动作目标图元: ${key}，请先用 find_elements 确定` })
    }
    nodeIds.push(getElementNodeId(session.workingElements[index]))
  }

  let owner: { target: string, element: Record<string, unknown> } | undefined
  if (!isDisplay) {
    const resolved = resolveFeatureTarget(session, args)
    if ('error' in resolved) return JSON.stringify({ success: false, error: resolved.error })
    owner = resolved
    // 图元事件缺省对自身执行动作；脚本同样默认以自身为目标，保证 data 不为 undefined
    if (nodeIds.length === 0) nodeIds.push(NODE_SELF)
  }

  const event = buildEventDefinition({
    target: isDisplay ? 'display' : 'element',
    title,
    nodeIds,
    mouseEvent: pickEnum<MouseEventType>(args.eventType, MOUSE_EVENT_TYPES, 'onClick'),
    eventScope: args.eventScope === 'other' ? 'other' : 'current',
    trigger: pickEnum<DisplayTrigger>(args.trigger, DISPLAY_TRIGGERS, 'respond'),
    handleId: typeof args.handleId === 'string' ? args.handleId.trim() : '',
    schedule: args,
    dataSourceKeys: Array.isArray(args.dataSourceKeys) ? args.dataSourceKeys.map(String) : [],
    action,
    args,
  })
  if ('error' in event) {
    return JSON.stringify({ success: false, error: `${event.error}，请修正后重新调用` })
  }
  const pivotIds = pivot ? applyRotatePivot(ctx, pivot) : []

  if (!isDisplay && owner) {
    const { target, element } = owner
    const elementStore = isPlainObject(element.store) ? { ...element.store } : {}
    const events = Array.isArray(elementStore.events) ? [...elementStore.events] : []
    events.push(event)
    element.store = { ...elementStore, events }
    const result = finishFeatureAttach(ctx, target, element, `${String(event.type ?? '')} 事件(${action})`, '交互')
    return pivot ? JSON.stringify({ ...JSON.parse(result), ...rotatePivotInfo(pivot, pivotIds) }) : result
  }

  session.displayEvents.push(event)
  session.featureExecutions.push({
    toolName: name,
    elementKey: `${DISPLAY_EVENT_KEY}${session.displayEvents.length}`,
  })
  const step: AgentStep = {
    type: 'tool_call',
    content: `已添加图纸事件 "${title || event.name}"（${String(args.trigger ?? 'respond')} / ${action}）`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  return JSON.stringify({ success: true, event, ...rotatePivotInfo(pivot, pivotIds) })
}
