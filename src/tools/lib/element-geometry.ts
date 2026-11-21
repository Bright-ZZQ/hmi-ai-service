/**
 * 图纸图元几何工具（仅适用于图纸 Display 的扁平图元）
 *
 * 图纸图元的位置由 localRect（4 顶点）决定，同时散落在 roatePos、polygon / points、
 * Line 的 x1..y2、Pie 的 cx/cy 等字段中。平移 / 缩放时必须一起变换，否则编辑器反序列化后图元会错位。
 */

import { generateId } from './element-builders/display-elements'
import { isRecord } from './element-lookup'

type Rec = Record<string, unknown>

export interface Bounds { x: number, y: number, width: number, height: number }

const POINT_ARRAY_KEYS = ['localRect', 'polygon', 'points', 'line'] as const
const MIN_FONT_SIZE = 6

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function boundsOfPoints(points: unknown): Bounds | undefined {
  if (!Array.isArray(points) || points.length === 0) return undefined
  const xs: number[] = []
  const ys: number[] = []
  for (const point of points) {
    if (!isRecord(point) || !isNum(point.x) || !isNum(point.y)) return undefined
    xs.push(point.x)
    ys.push(point.y)
  }
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** 图元外接矩形：优先 localRect，其次 polygon / points，最后 x/y/width/height */
export function getElementBounds(element: Rec): Bounds | undefined {
  for (const key of POINT_ARRAY_KEYS) {
    const bounds = boundsOfPoints(element[key])
    if (bounds) return bounds
  }
  if (isNum(element.x) && isNum(element.y) && isNum(element.width) && isNum(element.height)) {
    return { x: element.x, y: element.y, width: element.width, height: element.height }
  }
  return undefined
}

export function unionBounds(list: Array<Bounds | undefined>): Bounds | undefined {
  const valid = list.filter((item): item is Bounds => item !== undefined)
  if (valid.length === 0) return undefined
  const x = Math.min(...valid.map(b => b.x))
  const y = Math.min(...valid.map(b => b.y))
  const right = Math.max(...valid.map(b => b.x + b.width))
  const bottom = Math.max(...valid.map(b => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}

export interface Transform2D {
  /** 等比缩放系数，默认 1 */
  scale?: number
  /** 缩放原点 */
  originX?: number
  originY?: number
  dx?: number
  dy?: number
}

/**
 * 对图元所有几何字段做“先绕原点缩放、再平移”的变换，返回新图元，不修改入参。
 * 缩放时同步缩放 width/height/_originInfo/radius，文字图元的字号也按比例缩放。
 */
export function transformElement(element: Rec, transform: Transform2D): Rec {
  const scale = transform.scale ?? 1
  const ox = transform.originX ?? 0
  const oy = transform.originY ?? 0
  const dx = transform.dx ?? 0
  const dy = transform.dy ?? 0
  const fx = (x: number) => ox + (x - ox) * scale + dx
  const fy = (y: number) => oy + (y - oy) * scale + dy
  const mapPoint = (point: unknown): unknown => (
    isRecord(point) && isNum(point.x) && isNum(point.y)
      ? { ...point, x: fx(point.x), y: fy(point.y) }
      : point
  )

  const next: Rec = { ...element }
  for (const key of POINT_ARRAY_KEYS) {
    if (Array.isArray(element[key])) next[key] = (element[key] as unknown[]).map(mapPoint)
  }
  if (isRecord(element.roatePos)) next.roatePos = mapPoint(element.roatePos)
  for (const key of ['x1', 'x2', 'cx', 'x'] as const) {
    if (isNum(element[key])) next[key] = fx(element[key] as number)
  }
  for (const key of ['y1', 'y2', 'cy', 'y'] as const) {
    if (isNum(element[key])) next[key] = fy(element[key] as number)
  }
  if (Array.isArray(element.controlPoints)) {
    next.controlPoints = (element.controlPoints as unknown[]).map((value, index) => (
      isNum(value) ? (index % 2 === 0 ? fx(value) : fy(value)) : value
    ))
  }

  if (scale !== 1) {
    for (const key of ['width', 'height', 'radius'] as const) {
      if (isNum(element[key])) next[key] = (element[key] as number) * scale
    }
    if (isRecord(element._originInfo)) {
      const info = element._originInfo
      next._originInfo = {
        ...info,
        ...(isNum(info.width) ? { width: info.width * scale } : {}),
        ...(isNum(info.height) ? { height: info.height * scale } : {}),
      }
    }
    if (typeof element.font === 'string') next.font = scaleFont(element.font, scale)
  }
  return next
}

/** font 形如 "family,size,-1,5,..."，第 2 段为字号 */
function scaleFont(font: string, scale: number): string {
  const parts = font.split(',')
  const size = Number(parts[1])
  if (!Number.isFinite(size)) return font
  parts[1] = String(Math.max(MIN_FONT_SIZE, Math.round(size * scale * 10) / 10))
  return parts.join(',')
}

export function translateElement(element: Rec, dx: number, dy: number): Rec {
  return transformElement(element, { dx, dy })
}

/** 图元 id（图纸图元）；缺失返回空串 */
export function getNodeId(element: Rec): string {
  return typeof element.id === 'string' ? element.id : ''
}

/** 根图元及其全部后代（按 pId 递归）在列表中的下标，保持列表顺序 */
export function collectSubtreeIndices(elements: Rec[], rootIndex: number): number[] {
  const rootId = getNodeId(elements[rootIndex])
  const ids = new Set<string>(rootId ? [rootId] : [])
  const picked = new Set<number>([rootIndex])
  // 子图元可能排在父组合之前，迭代到不再新增为止
  let changed = true
  while (changed) {
    changed = false
    elements.forEach((element, index) => {
      if (picked.has(index)) return
      const parent = typeof element.pId === 'string' ? element.pId : ''
      if (parent && ids.has(parent)) {
        picked.add(index)
        const id = getNodeId(element)
        if (id) ids.add(id)
        changed = true
      }
    })
  }
  return [...picked].sort((a, b) => a - b)
}

/** 去掉被其他选中图元包含（pId 在选中集合内）的后代，只保留“顶层”选中项 */
export function topLevelIndices(elements: Rec[], indices: number[]): number[] {
  const ids = new Set(indices.map(index => getNodeId(elements[index])).filter(Boolean))
  return indices.filter((index) => {
    let parent = typeof elements[index].pId === 'string' ? elements[index].pId as string : ''
    const seen = new Set<string>()
    while (parent && parent !== '0' && !seen.has(parent)) {
      if (ids.has(parent)) return false
      seen.add(parent)
      const owner = elements.find(element => getNodeId(element) === parent)
      parent = owner && typeof owner.pId === 'string' ? owner.pId : ''
    }
    return true
  })
}

/** 选中顶层图元及其后代的几何整体平移 / 缩放，返回被改动的图元（已写回 elements） */
export function applyTransformToSubtrees(
  elements: Rec[],
  roots: number[],
  transform: Transform2D,
): Rec[] {
  const touched = new Set<number>()
  for (const root of roots) collectSubtreeIndices(elements, root).forEach(index => touched.add(index))
  const changed: Rec[] = []
  for (const index of touched) {
    elements[index] = transformElement(elements[index], transform)
    changed.push(elements[index])
  }
  return changed
}

function remapStrings(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === 'string') return idMap.get(value) ?? value
  if (Array.isArray(value)) return value.map(item => remapStrings(item, idMap))
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapStrings(item, idMap)]))
  }
  return value
}

function freshenFeatures(list: unknown): unknown {
  if (!Array.isArray(list)) return list
  return list.map((feature) => {
    if (!isRecord(feature)) return feature
    const next: Rec = { ...feature, id: globalThis.crypto.randomUUID() }
    if (Array.isArray(feature.conditions)) next.conditions = freshenConditions(feature.conditions)
    if (Array.isArray(feature.multiStateConditions)) {
      next.multiStateConditions = feature.multiStateConditions.map(state => (
        isRecord(state)
          ? {
              ...state,
              id: globalThis.crypto.randomUUID(),
              conditions: freshenConditions(state.conditions),
            }
          : state
      ))
    }
    return next
  })
}

function freshenConditions(list: unknown): unknown {
  if (!Array.isArray(list)) return list
  return list.map(item => (
    isRecord(item)
      ? { ...item, num: globalThis.crypto.randomUUID(), conditions: freshenConditions(item.conditions) }
      : item
  ))
}

function freshenEvent(event: unknown): unknown {
  if (!isRecord(event)) return event
  return {
    ...event,
    ...(typeof event.id === 'string' ? { id: globalThis.crypto.randomUUID() } : {}),
    ...(typeof event.name === 'string' ? { name: `event${globalThis.crypto.randomUUID().replace(/-/g, '')}` } : {}),
  }
}

/** 复制单个特性或事件时重新生成 id / 名称 */
export function freshenFeature(feature: Rec, isEvent: boolean): Rec {
  return isEvent ? freshenEvent(feature) as Rec : (freshenFeatures([feature]) as Rec[])[0]
}

/** 给特性（含条件）重新生成 id，避免复制出的特性与原特性共用 id */
export function freshenElementFeatures(element: Rec): Rec {
  const next: Rec = { ...element }
  const store = isRecord(element.store) ? { ...element.store } : undefined
  for (const key of ['dynamicDyna', 'interactiveDyna'] as const) {
    if (Array.isArray(next[key])) next[key] = freshenFeatures(next[key])
    if (store && Array.isArray(store[key])) store[key] = freshenFeatures(store[key])
  }
  if (store) {
    if (Array.isArray(store.events)) store.events = store.events.map(freshenEvent)
    next.store = store
  }
  if (Array.isArray(next.events)) next.events = (next.events as unknown[]).map(freshenEvent)
  return next
}

/**
 * 深拷贝根图元及其后代：生成新 id、重建 pId 层级、重新生成特性 id，
 * 事件里指向被复制图元自身（旧 id）的引用改为指向新图元。返回新图元列表（根在前）。
 */
export function cloneSubtree(elements: Rec[], rootIndex: number): Rec[] {
  const indices = collectSubtreeIndices(elements, rootIndex)
  const idMap = new Map<string, string>()
  for (const index of indices) {
    const id = getNodeId(elements[index])
    if (id) idMap.set(id, generateId())
  }
  return indices.map((index) => {
    const source = structuredClone(elements[index])
    const clone = freshenElementFeatures(source)
    const id = getNodeId(source)
    if (id) clone.id = idMap.get(id)
    const parent = typeof source.pId === 'string' ? source.pId : ''
    if (index !== rootIndex && parent && idMap.has(parent)) clone.pId = idMap.get(parent)
    if (isRecord(clone.store) && Array.isArray(clone.store.events)) {
      clone.store = { ...clone.store, events: remapStrings(clone.store.events, idMap) }
    }
    if (Array.isArray(clone.events)) clone.events = remapStrings(clone.events, idMap)
    return clone
  })
}
