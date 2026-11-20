/**
 * 排版工具：对齐 / 等距分布 / 层级调整 / 适应画布
 *
 * 仅适用于图纸（扁平图元，位置由 localRect 决定）。组合图元按“组合 + 全部后代”整体移动；
 * 选中项里已被其他选中组合包含的后代不会重复移动。
 */

import { isBackgroundElement } from '../lib/element-builders'
import {
  applyTransformToSubtrees,
  collectSubtreeIndices,
  getElementBounds,
  getNodeId,
  topLevelIndices,
  unionBounds,
} from '../lib/element-geometry'
import type { Bounds } from '../lib/element-geometry'
import { findElementIndex } from '../lib/element-lookup'
import { emitUpdate, fail, ok, readFilter, recordStep, resolveTargetIndices } from '../core/context'
import type { Rec, SessionState, ToolExecContext, ToolHandler, ZOrderOp } from '../core/context'

const ALIGN_MODES = ['left', 'center', 'right', 'top', 'middle', 'bottom'] as const
type AlignMode = typeof ALIGN_MODES[number]
const DEFAULT_MARGIN = 20
const MAX_FIT_SCALE = 4
const EPSILON = 0.01

const round = (value: number) => Math.round(value * 100) / 100

function subtreeBounds(elements: Rec[], root: number): Bounds | undefined {
  return unionBounds(collectSubtreeIndices(elements, root).map(index => getElementBounds(elements[index])))
}

function requireDisplay(session: SessionState, tool: string): string | undefined {
  return session.editorType === 'display' ? undefined : `${tool} 仅适用于图纸`
}

function selectRoots(ctx: ToolExecContext): { roots: number[] } | { error: string } {
  const { session, args } = ctx
  const resolved = resolveTargetIndices(session, args.targets, readFilter(args.filter))
  if ('error' in resolved) return resolved
  const roots = topLevelIndices(session.workingElements, resolved.indices)
    .filter(index => getElementBounds(session.workingElements[index]) !== undefined)
  if (roots.length === 0) return { error: '选中的图元没有可用的位置信息' }
  return { roots }
}

/** 移动一个顶层图元（含后代），返回受影响的图元 */
function moveRoot(session: SessionState, root: number, dx: number, dy: number): Rec[] {
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return []
  return applyTransformToSubtrees(session.workingElements, [root], { dx, dy })
}

function emitAll(ctx: ToolExecContext, changed: Rec[]): void {
  for (const element of changed) emitUpdate(ctx, element)
}

// ============================================================
// 对齐
// ============================================================

const handleAlign: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'align_elements')
  if (notDisplay) return fail(notDisplay)
  const mode = args.mode as AlignMode
  if (!ALIGN_MODES.includes(mode)) return fail(`mode 必须是 ${ALIGN_MODES.join('/')} 之一`)

  const selected = selectRoots(ctx)
  if ('error' in selected) return fail(selected.error)
  let roots = selected.roots

  let reference: Bounds | undefined
  const refArg = typeof args.reference === 'string' ? args.reference.trim() : ''
  if (refArg === 'canvas') {
    reference = { x: 0, y: 0, width: session.canvas.pageWidth, height: session.canvas.pageHeight }
  } else if (refArg && refArg !== 'selection') {
    const refIndex = findElementIndex(session.workingElements, refArg)
    if (refIndex < 0) return fail(`未找到参考图元: ${refArg}`)
    reference = subtreeBounds(session.workingElements, refIndex)
    roots = roots.filter(index => index !== refIndex)
    if (!reference) return fail('参考图元没有可用的位置信息')
  }
  if (!reference && roots.length < 2) return fail('按选区对齐至少需要 2 个图元；单个图元请指定 reference（canvas 或某图元）')
  if (roots.length === 0) return fail('没有需要对齐的图元')

  const boxes = new Map(roots.map(index => [index, subtreeBounds(session.workingElements, index) as Bounds]))
  const ref = reference ?? unionBounds([...boxes.values()]) as Bounds
  const changed: Rec[] = []
  for (const [index, box] of boxes) {
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = ref.x - box.x
    else if (mode === 'center') dx = ref.x + ref.width / 2 - (box.x + box.width / 2)
    else if (mode === 'right') dx = ref.x + ref.width - (box.x + box.width)
    else if (mode === 'top') dy = ref.y - box.y
    else if (mode === 'middle') dy = ref.y + ref.height / 2 - (box.y + box.height / 2)
    else dy = ref.y + ref.height - (box.y + box.height)
    changed.push(...moveRoot(session, index, dx, dy))
  }
  emitAll(ctx, changed)
  recordStep(ctx, `已对齐 ${roots.length} 个图元（${mode}）`)
  return ok({ aligned: roots.length, moved: changed.length, mode })
}

// ============================================================
// 等距分布
// ============================================================

const handleDistribute: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'distribute_elements')
  if (notDisplay) return fail(notDisplay)
  const axis = args.axis === 'vertical' ? 'vertical' : args.axis === 'horizontal' ? 'horizontal' : undefined
  if (!axis) return fail('axis 必须是 horizontal 或 vertical')

  const selected = selectRoots(ctx)
  if ('error' in selected) return fail(selected.error)
  const gap = args.gap === undefined ? undefined : Number(args.gap)
  if (gap !== undefined && !Number.isFinite(gap)) return fail('gap 必须是数字')
  if (selected.roots.length < (gap === undefined ? 3 : 2)) {
    return fail(gap === undefined ? '不指定 gap 的等距分布至少需要 3 个图元' : '至少需要 2 个图元')
  }

  const horizontal = axis === 'horizontal'
  const items = selected.roots
    .map(index => ({ index, box: subtreeBounds(session.workingElements, index) as Bounds }))
    .sort((a, b) => (horizontal ? a.box.x - b.box.x : a.box.y - b.box.y))
  const start = (box: Bounds) => (horizontal ? box.x : box.y)
  const size = (box: Bounds) => (horizontal ? box.width : box.height)

  let spacing: number
  if (gap !== undefined) {
    spacing = gap
  } else {
    const first = items[0].box
    const last = items[items.length - 1].box
    const totalSize = items.reduce((sum, item) => sum + size(item.box), 0)
    spacing = (start(last) + size(last) - start(first) - totalSize) / (items.length - 1)
  }

  const changed: Rec[] = []
  let cursor = start(items[0].box)
  for (const item of items) {
    const delta = cursor - start(item.box)
    changed.push(...moveRoot(session, item.index, horizontal ? delta : 0, horizontal ? 0 : delta))
    cursor += size(item.box) + spacing
  }
  emitAll(ctx, changed)
  recordStep(ctx, `已${horizontal ? '水平' : '垂直'}分布 ${items.length} 个图元，间距 ${round(spacing)}px`)
  const overflow = cursor - spacing
  const limit = horizontal ? session.canvas.pageWidth : session.canvas.pageHeight
  return ok({
    distributed: items.length,
    gap: round(spacing),
    ...(overflow > limit ? { warning: `分布后内容末端 ${round(overflow)}px 超出画布${horizontal ? '宽' : '高'} ${limit}px，请缩小间距或扩大画布` } : {}),
  })
}

// ============================================================
// 层级
// ============================================================

const Z_ACTIONS = ['front', 'back', 'up', 'down'] as const
type ZAction = typeof Z_ACTIONS[number]

const handleSetZOrder: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'set_z_order')
  if (notDisplay) return fail(notDisplay)
  const action = args.action as ZAction
  if (!Z_ACTIONS.includes(action)) return fail(`action 必须是 ${Z_ACTIONS.join('/')} 之一`)

  const resolved = resolveTargetIndices(session, args.targets ?? args.target, readFilter(args.filter))
  if ('error' in resolved) return fail(resolved.error)
  const ids = resolved.indices.map(index => getNodeId(session.workingElements[index])).filter(Boolean)
  if (ids.length === 0) return fail('选中的图元没有 id，无法调整层级')

  // 层级与最终 zIndex 相关，延迟到 assemble_display 时在最终图元列表上执行，避免被叠放规则覆盖
  session.zOrderOps.push({ action, ids })
  recordStep(ctx, `已登记层级调整（${action}），涉及 ${ids.length} 个图元`)
  return ok({ action, count: ids.length, message: '层级调整已登记，将在 assemble_display 时生效' })
}

/**
 * 在最终图元列表上依次执行层级调整。层级只在同一父节点（同一 pId）的兄弟之间比较：
 * 兄弟按新顺序重新占用它们在数组中的原有槽位，并写入连续的 zIndex。
 */
export function applyZOrderOps(elements: Rec[], ops: ZOrderOp[]): Rec[] {
  let list = [...elements]
  for (const op of ops) {
    const picked = new Set(list.map((element, index) => (op.ids.includes(getNodeId(element)) ? index : -1)).filter(index => index >= 0))
    const parentOf = (index: number) => (typeof list[index].pId === 'string' ? list[index].pId as string : '0')
    const parents = new Set([...picked].map(parentOf))
    for (const parent of parents) {
      const siblings = list.map((_, index) => index).filter(index => parentOf(index) === parent)
      const z = (index: number) => (typeof list[index].zIndex === 'number' ? list[index].zIndex as number : 0)
      const order = [...siblings].sort((a, b) => z(a) - z(b) || a - b)
      const chosen = new Set(order.filter(index => picked.has(index) && parentOf(index) === parent))
      const rest = order.filter(index => !chosen.has(index))
      const chosenInOrder = order.filter(index => chosen.has(index))
      let next: number[]
      if (op.action === 'front') next = [...rest, ...chosenInOrder]
      else if (op.action === 'back') next = [...chosenInOrder, ...rest]
      else {
        next = [...order]
        const sequence = op.action === 'up' ? [...chosenInOrder].reverse() : chosenInOrder
        for (const index of sequence) {
          const at = next.indexOf(index)
          const swapWith = op.action === 'up' ? at + 1 : at - 1
          if (swapWith < 0 || swapWith >= next.length || chosen.has(next[swapWith])) continue
          ;[next[at], next[swapWith]] = [next[swapWith], next[at]]
        }
      }
      const snapshot = next.map(index => list[index])
      const slots = [...siblings].sort((a, b) => a - b)
      const updated = [...list]
      slots.forEach((slot, rank) => {
        updated[slot] = { ...snapshot[rank], zIndex: rank }
      })
      list = updated
    }
  }
  return list
}
// ============================================================
// 适应画布
// ============================================================

const handleFitToCanvas: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'fit_to_canvas')
  if (notDisplay) return fail(notDisplay)

  const margin = args.margin === undefined ? DEFAULT_MARGIN : Number(args.margin)
  if (!Number.isFinite(margin) || margin < 0) return fail('margin 必须是不小于 0 的数字')
  const mode = args.mode === 'fit' ? 'fit' : 'shrink'
  const center = args.center !== false
  const { pageWidth, pageHeight } = session.canvas
  const availW = pageWidth - margin * 2
  const availH = pageHeight - margin * 2
  if (availW <= 0 || availH <= 0) return fail('margin 过大，画布没有可用空间')

  const elements = session.workingElements
  const hasSelection = args.targets !== undefined || args.filter !== undefined
  let roots: number[]
  if (hasSelection) {
    const selected = selectRoots(ctx)
    if ('error' in selected) return fail(selected.error)
    roots = selected.roots
  } else {
    // 默认处理全部顶层图元，整块底板（覆盖画布的背景）保持不动
    const all = elements.map((_, index) => index)
      .filter(index => (typeof elements[index].pId !== 'string' || elements[index].pId === '0' || !elements.some(e => getNodeId(e) === elements[index].pId)))
    roots = all.filter(index => getElementBounds(elements[index]) !== undefined
      && !isBackgroundElement(elements[index], pageWidth, pageHeight))
    if (roots.length === 0) return fail('画布上没有可调整的图元')
  }

  const content = unionBounds(roots.map(index => subtreeBounds(elements, index)))
  if (!content || content.width <= 0 || content.height <= 0) return fail('选中的图元没有有效的外接矩形')

  let scale = Math.min(availW / content.width, availH / content.height)
  scale = mode === 'shrink' ? Math.min(1, scale) : Math.min(MAX_FIT_SCALE, scale)
  const scaledW = content.width * scale
  const scaledH = content.height * scale
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high))
  const left = center ? (pageWidth - scaledW) / 2 : clamp(content.x, margin, pageWidth - margin - scaledW)
  const top = center ? (pageHeight - scaledH) / 2 : clamp(content.y, margin, pageHeight - margin - scaledH)

  if (Math.abs(scale - 1) < 1e-6 && Math.abs(left - content.x) < EPSILON && Math.abs(top - content.y) < EPSILON) {
    return ok({ changed: false, message: '内容已在画布内且位置合适，无需调整' })
  }
  const changed = applyTransformToSubtrees(elements, roots, {
    scale,
    originX: content.x,
    originY: content.y,
    dx: left - content.x,
    dy: top - content.y,
  })
  emitAll(ctx, changed)
  recordStep(ctx, `已将 ${roots.length} 个图元${scale !== 1 ? `按 ${round(scale)} 倍缩放并` : ''}${center ? '居中' : '移入画布'}`)
  return ok({
    changed: true,
    scale: round(scale),
    content: { x: round(left), y: round(top), width: round(scaledW), height: round(scaledH) },
  })
}

export const LAYOUT_TOOL_HANDLERS: Record<string, ToolHandler> = {
  align_elements: handleAlign,
  distribute_elements: handleDistribute,
  set_z_order: handleSetZOrder,
  fit_to_canvas: handleFitToCanvas,
}
