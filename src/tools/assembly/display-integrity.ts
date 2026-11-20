/**
 * 图纸交互完整性校验
 *
 * 检出会让用户看不到效果的组合：
 * - 图元被无条件隐藏（显隐特性 isVisible=0 且没有触发条件，运行时永久不可见）；
 * - 事件的目标图元不存在，或目标图元永久不可见；
 * - 文字图元之间相互重叠（多轮修改时新增说明文字却没有处理旧文字）。
 * 模型多轮修改时容易用“隐藏”代替“删除”，并让事件继续指向被隐藏的旧图元。
 *
 * 另外提供旋转中心归一：旋转特性的 rotCenter=5 会在运行时把旋转中心重置为包围盒中心，
 * 覆盖图元自身的 roatePos；roatePos 与包围盒中心不一致时必须改用 rotCenter=0（偏移中心）。
 */

import { decodeText } from '../lib/element-lookup'

type Rec = Record<string, unknown>

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 图元可能是展平格式，也可能把特性放在 store 下，两处都读取 */
function readList(element: Rec, key: string): Rec[] {
  const store = isRec(element.store) ? element.store : {}
  return [element[key], store[key]].flatMap(value => (Array.isArray(value) ? value.filter(isRec) : []))
}

function elementIds(element: Rec): string[] {
  const store = isRec(element.store) ? element.store : {}
  return [element.id, element.node_id, store.node_id]
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

function elementLabel(element: Rec): string {
  return String(element.name ?? element.id ?? element.node_id ?? '未命名')
}

/** 图元是否被无条件隐藏：最后一个显隐特性 isVisible=0、无触发条件且未取反 */
export function isPermanentlyHidden(element: Rec): boolean {
  const visibleFeatures = readList(element, 'dynamicDyna').filter(feature => feature.type === 'GraphDynaVisible')
  const feature = visibleFeatures[visibleFeatures.length - 1]
  if (!feature) return false
  const pars = isRec(feature.pars) ? feature.pars : {}
  const isVisible = isRec(pars.isVisible) ? pars.isVisible.original : undefined
  const noCondition = !Array.isArray(feature.conditions) || feature.conditions.length === 0
  return Number(isVisible) === 0 && noCondition && feature.not !== true
}

interface Bounds { x: number, y: number, width: number, height: number }

function getBounds(element: Rec): Bounds | undefined {
  const rect = element.localRect
  if (!Array.isArray(rect)) return undefined
  const xs = rect.map(p => (isRec(p) ? Number(p.x) : NaN))
  const ys = rect.map(p => (isRec(p) ? Number(p.y) : NaN))
  if (!xs.length || xs.some(v => !Number.isFinite(v)) || ys.some(v => !Number.isFinite(v))) return undefined
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** 估算文字实际占用的区域（文字框通常远大于文字本身，直接比较文字框会误报） */
function getTextInkBounds(element: Rec): Bounds | undefined {
  const box = getBounds(element)
  const text = decodeText(element.text)
  if (!box || !text) return undefined
  const fontSize = Number(String(element.font ?? '').split(',')[1]) || 14
  const lines = text.split(/\r?\n/)
  const lineWidth = (line: string) => [...line].reduce((sum, ch) => sum + ((ch.codePointAt(0) ?? 0) > 0x2E80 ? 1 : 0.55), 0) * fontSize
  const width = Math.min(box.width, Math.max(...lines.map(lineWidth)))
  const height = Math.min(box.height, lines.length * fontSize * 1.2)
  const hAlign = Number(element.textHAlign ?? 1)
  const vAlign = Number(element.textVAlign ?? 1)
  return {
    x: box.x + (hAlign === 0 ? 0 : hAlign === 2 ? box.width - width : (box.width - width) / 2),
    y: box.y + (vAlign === 0 ? 0 : vAlign === 2 ? box.height - height : (box.height - height) / 2),
    width,
    height,
  }
}

function overlapRatio(a: Bounds, b: Bounds): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  const smaller = Math.min(a.width * a.height, b.width * b.height)
  return w > 0 && h > 0 && smaller > 0 ? (w * h) / smaller : 0
}

function describeText(element: Rec): string {
  const text = (decodeText(element.text) ?? '').replace(/\s+/g, ' ')
  return `${elementLabel(element)}（${text.length > 20 ? `${text.slice(0, 20)}…` : text}）`
}

/** 检出文字图元之间的重叠：新增的说明文字压在旧文字上是多轮修改的典型问题 */
function findTextOverlapIssues(list: Rec[]): string[] {
  const texts = list
    .filter(element => element.type === 'Text' && !isPermanentlyHidden(element))
    .map(element => ({ element, ink: getTextInkBounds(element) }))
    .filter((item): item is { element: Rec, ink: Bounds } => item.ink !== undefined)

  const issues: string[] = []
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (overlapRatio(texts[i].ink, texts[j].ink) < OVERLAP_RATIO_LIMIT) continue
      issues.push(`文字图元 ${describeText(texts[i].element)} 与 ${describeText(texts[j].element)} 相互重叠。`
        + '若新文字用于替换旧文字，必须用 update_element 修改旧文字内容或用 delete_element 删除旧文字；'
        + '否则请用 update_element 移动其中之一（同时更新 localRect 四个顶点与 roatePos）使两者不再重叠')
    }
  }
  return issues
}

const OVERLAP_RATIO_LIMIT = 0.3

/** 旋转特性的 rotCenter：0=偏移中心（使用图元自身的 roatePos），5=包围盒中心 */
const ROTATE_CENTER_OFFSET = 0
const ROTATE_CENTER_BOX = 5

function hasOffsetPivot(element: Rec): boolean {
  const bounds = getBounds(element)
  const pos = element.roatePos
  if (!bounds || !isRec(pos)) return false
  const x = Number(pos.x)
  const y = Number(pos.y)
  return Number.isFinite(x) && Number.isFinite(y)
    && (Math.abs(x - (bounds.x + bounds.width / 2)) > 0.5 || Math.abs(y - (bounds.y + bounds.height / 2)) > 0.5)
}

function fixRotateFeatures(features: Rec[]): Rec[] {
  return features.map((feature) => {
    const pars = isRec(feature.pars) ? feature.pars : undefined
    const rotCenter = pars && isRec(pars.rotCenter) ? pars.rotCenter : undefined
    if (feature.type !== 'GraphDynaRotate' || !pars || Number(rotCenter?.original) !== ROTATE_CENTER_BOX) return feature
    return { ...feature, pars: { ...pars, rotCenter: { ...rotCenter, original: ROTATE_CENTER_OFFSET } } }
  })
}

/**
 * 旋转中心归一：图元的 roatePos 偏离包围盒中心（如 3 叶片扇叶绕轮毂圆心旋转）时，
 * 把旋转特性的 rotCenter 从“包围盒中心(5)”改为“偏移中心(0)”，否则运行时旋转中心被重置而偏心晃动。
 * 与 baseElements 中完全一致的已有图元保持原样，不改动用户的既有内容。
 */
export function normalizeRotatePivots(elements: Rec[], baseElements: unknown[] = []): Rec[] {
  const baseById = new Map<string, string>()
  for (const base of baseElements.filter(isRec)) {
    for (const id of elementIds(base)) baseById.set(id, JSON.stringify(base))
  }
  return elements.map((element) => {
    const unchanged = elementIds(element).some(id => baseById.get(id) === JSON.stringify(element))
    if (unchanged || !hasOffsetPivot(element)) return element
    const store = isRec(element.store) ? element.store : undefined
    const next: Rec = { ...element }
    if (Array.isArray(element.dynamicDyna)) next.dynamicDyna = fixRotateFeatures(element.dynamicDyna.filter(isRec))
    if (store && Array.isArray(store.dynamicDyna)) {
      next.store = { ...store, dynamicDyna: fixRotateFeatures(store.dynamicDyna.filter(isRec)) }
    }
    return next
  })
}

/** 返回图纸元素的交互问题描述列表，无问题返回空数组 */
export function findDisplayInteractionIssues(elements: unknown[]): string[] {
  const list = elements.filter(isRec)
  const byId = new Map<string, Rec>()
  for (const element of list) {
    for (const id of elementIds(element)) byId.set(id, element)
  }

  const issues: string[] = findTextOverlapIssues(list)
  for (const element of list) {
    if (isPermanentlyHidden(element)) {
      issues.push(`图元 "${elementLabel(element)}" 被无条件隐藏（显隐特性 isVisible=0 且无触发条件，运行时永久不可见）。`
        + '不再需要的图元必须用 delete_element 删除，不能用显隐特性代替删除')
    }
    for (const event of readList(element, 'events')) {
      const nodes = Array.isArray(event.nodes) ? event.nodes : []
      for (const nodeId of nodes) {
        if (typeof nodeId !== 'string' || nodeId === 'node-self') continue
        const target = byId.get(nodeId)
        const title = String(event.title ?? event.name ?? '')
        if (!target) {
          issues.push(`图元 "${elementLabel(element)}" 的事件 "${title}" 指向不存在的图元 ${nodeId}，请改为最终图纸中存在的图元`)
        } else if (isPermanentlyHidden(target)) {
          issues.push(`图元 "${elementLabel(element)}" 的事件 "${title}" 作用于永久隐藏的图元 "${elementLabel(target)}"，用户看不到效果。`
            + '请删除该事件，或改为作用于可见图元')
        }
      }
    }
  }
  return issues
}
