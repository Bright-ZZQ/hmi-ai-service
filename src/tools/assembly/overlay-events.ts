/**
 * 覆盖图元事件穿透（仅图纸 Display）
 *
 * 预览态只有最上层被命中的图元会收到鼠标事件。AI 生成的按钮通常由“底板形状 + 文字”组成，
 * 事件/交互特性配置在底板上，文字叠在底板之上，用户点到文字时底板收不到点击，控制不生效。
 *
 * 组装时把底板的鼠标事件与交互特性同步到压在其上的文字/装饰图元（覆盖图元）：
 * - 事件中指向 node-self 的目标改为底板 id，动作仍作用于底板；
 * - 按触发分组（按压：单击/双击/按下/抬起；悬停：移入/离开/悬停）同步，
 *   覆盖图元在某组已有自己的事件或交互特性时不同步该组，避免一次点击同时执行两套动作；
 * - 同步的副本带 MIRROR_FLAG 标记，每次组装先清除旧副本再重新计算，底板事件修改后副本随之更新。
 */

import { isPermanentlyHidden } from './display-integrity'
import { freshenFeature, getElementBounds } from '../lib/element-geometry'
import type { Bounds } from '../lib/element-geometry'
import { isRecord } from '../lib/element-lookup'

type Rec = Record<string, unknown>
type ListKey = 'events' | 'interactiveDyna' | 'dynamicDyna'
type TriggerGroup = 'press' | 'hover'

/** 同步副本的标记字段，值为来源图元 id */
export const MIRROR_FLAG = '_mirrorFrom'

const NODE_SELF = 'node-self'
const ENABLE_FEATURE_TYPE = 'GraphDynaEnableEvent'
const MIN_COVER_RATIO = 0.5

/** 会遮挡下层命中的形状（线条类太细，不视为遮挡） */
const BLOCKING_TYPES = new Set([
  'Rectangle', 'RoundRect', 'Ellipse', 'Polygon', 'Picture', 'Pie', 'Chord', 'RegularPolygon', 'Text',
])
/** 可作为覆盖图元接收同步的类型；组合、图符、组件等自身有独立交互，不参与 */
const OVERLAY_TYPES = new Set([...BLOCKING_TYPES, 'Line', 'Curve', 'Arc'])

const EVENT_GROUPS: Record<string, TriggerGroup> = {
  onClick: 'press',
  onDoubleClick: 'press',
  onDown: 'press',
  onUp: 'press',
  onEnter: 'hover',
  onLeave: 'hover',
  onHover: 'hover',
}

/** 交互特性 act（与编辑器 INTERACTIVE_EVENT 一致）；启动在线/定时器等非鼠标触发不同步，否则会重复执行 */
const ACT_GROUPS: Record<number, TriggerGroup> = {
  2: 'press', // LEFT_DOWN
  3: 'press', // LEFT_UP
  4: 'press', // RIGHT_DOWN
  5: 'press', // RIGHT_UP
  6: 'press', // DOUBLE_CLICK
  17: 'press', // CLICK
  10: 'hover', // MOUSE_MOVE
  14: 'hover', // ENTER
  15: 'hover', // LEAVE
  16: 'hover', // HOVER
}

function eventGroup(event: Rec): TriggerGroup | undefined {
  return typeof event.type === 'string' ? EVENT_GROUPS[event.type] : undefined
}

function actGroup(feature: Rec): TriggerGroup | undefined {
  return ACT_GROUPS[Number(feature.act)]
}

function isMirror(item: Rec): boolean {
  return typeof item[MIRROR_FLAG] === 'string'
}

/** 读取图元某个列表（store 与顶层两处） */
function readAll(element: Rec, key: ListKey): Rec[] {
  const store = isRecord(element.store) ? element.store : {}
  return [store[key], element[key]].flatMap(value => (Array.isArray(value) ? value.filter(isRecord) : []))
}

/** 清除所有容器中的同步副本，返回新图元；无副本时返回原对象 */
function stripMirrors(element: Rec): Rec {
  const keys: ListKey[] = ['events', 'interactiveDyna', 'dynamicDyna']
  if (!keys.some(key => readAll(element, key).some(isMirror))) return element
  const next: Rec = { ...element }
  const store = isRecord(element.store) ? { ...element.store } : undefined
  for (const key of keys) {
    if (Array.isArray(next[key])) next[key] = (next[key] as unknown[]).filter(item => !isRecord(item) || !isMirror(item))
    if (store && Array.isArray(store[key])) store[key] = (store[key] as unknown[]).filter(item => !isRecord(item) || !isMirror(item))
  }
  if (store) next.store = store
  return next
}

/** 追加到图元已使用的容器：store 优先，其次顶层，都没有时写入 store（与 AI 生成图元一致） */
function appendList(element: Rec, key: ListKey, items: Rec[]): void {
  if (items.length === 0) return
  const store = isRecord(element.store) ? element.store : undefined
  if (!(store && Array.isArray(store[key])) && Array.isArray(element[key])) {
    element[key] = [...element[key] as unknown[], ...items]
    return
  }
  const base = store ?? {}
  const existing = Array.isArray(base[key]) ? base[key] as unknown[] : []
  element.store = { ...base, [key]: [...existing, ...items] }
}

function center(bounds: Bounds): { x: number, y: number } {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
}

function containsPoint(bounds: Bounds, point: { x: number, y: number }): boolean {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y && point.y <= bounds.y + bounds.height
}

/** 覆盖图元的中心落在底板内，且至少一半面积压在底板上 */
function isCoveredBy(overlay: Bounds, base: Bounds): boolean {
  if (!containsPoint(base, center(overlay))) return false
  const area = overlay.width * overlay.height
  if (area <= 0) return true
  const w = Math.min(overlay.x + overlay.width, base.x + base.width) - Math.max(overlay.x, base.x)
  const h = Math.min(overlay.y + overlay.height, base.y + base.height) - Math.max(overlay.y, base.y)
  return w > 0 && h > 0 && (w * h) / area >= MIN_COVER_RATIO
}

function sourceTitle(event: Rec, sourceName: string): string {
  const title = typeof event.title === 'string' && event.title ? event.title : String(event.type ?? '事件')
  return `${title}（跟随${sourceName}）`
}

/** 复制底板事件：node-self 指向底板，重新生成名称并打标记 */
function mirrorEvent(event: Rec, source: Rec, sourceId: string): Rec {
  const copy = freshenFeature(structuredClone(event), true)
  if (Array.isArray(copy.nodes)) copy.nodes = copy.nodes.map(node => (node === NODE_SELF ? sourceId : node))
  if (!isMirror(event)) copy.title = sourceTitle(event, String(source.name ?? sourceId))
  copy[MIRROR_FLAG] = isMirror(event) ? event[MIRROR_FLAG] : sourceId
  return copy
}

function mirrorFeature(feature: Rec, sourceId: string): Rec {
  const copy = freshenFeature(structuredClone(feature), false)
  copy[MIRROR_FLAG] = isMirror(feature) ? feature[MIRROR_FLAG] : sourceId
  return copy
}

interface Entry {
  index: number
  element: Rec
  bounds: Bounds | undefined
  parent: string
  z: number
}

/** 把覆盖图元同步的事件/特性写入 overlay，返回是否有改动 */
function mirrorInto(overlay: Rec, source: Rec, sourceId: string): boolean {
  const ownEvents = readAll(overlay, 'events')
  const ownInteractive = readAll(overlay, 'interactiveDyna')
  const busy = new Set<TriggerGroup>()
  for (const event of ownEvents) {
    const group = eventGroup(event)
    if (group) busy.add(group)
  }
  for (const feature of ownInteractive) {
    const group = actGroup(feature)
    if (group) busy.add(group)
  }

  const events = readAll(source, 'events')
    .filter((event) => {
      const group = eventGroup(event)
      return group !== undefined && !busy.has(group)
    })
    .map(event => mirrorEvent(event, source, sourceId))
  const interactive = readAll(source, 'interactiveDyna')
    .filter((feature) => {
      const group = actGroup(feature)
      return group !== undefined && !busy.has(group)
    })
    .map(feature => mirrorFeature(feature, sourceId))

  // 交互特性受图元自身的操作使能约束，覆盖图元没有自己的交互特性时一并同步使能特性
  const enable = interactive.length > 0 && ownInteractive.length === 0
    && !readAll(overlay, 'dynamicDyna').some(feature => feature.type === ENABLE_FEATURE_TYPE)
    ? readAll(source, 'dynamicDyna').filter(feature => feature.type === ENABLE_FEATURE_TYPE).map(feature => mirrorFeature(feature, sourceId))
    : []

  appendList(overlay, 'events', events)
  appendList(overlay, 'interactiveDyna', interactive)
  appendList(overlay, 'dynamicDyna', enable)
  return events.length + interactive.length + enable.length > 0
}

function hasPointerBehavior(element: Rec): boolean {
  return readAll(element, 'events').some(event => eventGroup(event) !== undefined)
    || readAll(element, 'interactiveDyna').some(feature => actGroup(feature) !== undefined)
}

/**
 * 为压在交互图元之上的文字/装饰图元同步鼠标事件与交互特性，使点击覆盖图元等同于点击下层图元。
 * 只在同一父级（pId）内按渲染层级（zIndex 升序，相同按列表顺序）比较。不修改入参。
 */
export function propagateOverlayEvents(elements: Rec[]): Rec[] {
  const result = elements.map(element => (isRecord(element) ? stripMirrors(element) : element))
  const entries: Entry[] = result
    .map((element, index) => ({
      index,
      element,
      bounds: isRecord(element) ? getElementBounds(element) : undefined,
      parent: isRecord(element) && typeof element.pId === 'string' && element.pId ? element.pId : '0',
      z: isRecord(element) && typeof element.zIndex === 'number' ? element.zIndex : 0,
    }))
    .filter(entry => isRecord(entry.element))

  const byParent = new Map<string, Entry[]>()
  for (const entry of entries) {
    const siblings = byParent.get(entry.parent) ?? []
    siblings.push(entry)
    byParent.set(entry.parent, siblings)
  }

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.z - b.z || a.index - b.index)
    // 自下而上处理，覆盖图元之上再叠的图元（如底板 → 高光 → 文字）可沿链继承
    siblings.forEach((entry, order) => {
      const overlay = entry.element
      if (!entry.bounds || !OVERLAY_TYPES.has(String(overlay.type)) || isPermanentlyHidden(overlay)) return
      // 中心点上方最近的可命中图元才是实际被遮挡的对象；它没有鼠标交互时不再向下查找
      let base: { element: Rec, bounds: Bounds } | undefined
      for (let i = order - 1; i >= 0; i--) {
        const { element: candidate, bounds } = siblings[i]
        if (!bounds || !BLOCKING_TYPES.has(String(candidate.type))) continue
        if (isPermanentlyHidden(candidate)) continue
        if (!containsPoint(bounds, center(entry.bounds))) continue
        base = { element: candidate, bounds }
        break
      }
      if (!base || !isCoveredBy(entry.bounds, base.bounds) || !hasPointerBehavior(base.element)) return
      const sourceId = typeof base.element.id === 'string' ? base.element.id : ''
      if (!sourceId) return

      const next: Rec = { ...overlay }
      if (mirrorInto(next, base.element, sourceId)) {
        entry.element = next
        result[entry.index] = next
      }
    })
  }
  return result
}
