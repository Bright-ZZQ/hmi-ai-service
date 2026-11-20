/**
 * 模型点补全
 *
 * 特性里的测点（条件 leftValue、pars 里的 ds 等）只有模型提供的浏览名，
 * 而后端订阅/计算条件需要 nodeType、itemType、_unique 等字段。
 * 这里在最终组装后调用编辑器已有的 `/editorSvc/model/validateTagItem` 接口补全，
 * 拆分规则与编辑器模型点弹窗（components-ui modal-point/dialog.vue getModalData）保持一致。
 */

import type { ModelPointApiConfig } from '../../types'

const FEATURE_STORE_KEYS = ['dynamicDyna', 'interactiveDyna']
const FILED_POINT_TYPE = 'FieldPoint'
const ITEM_TYPE_DYNAMIC = 'dynamic'
const SUCCESS_CODE = 0
const REQUEST_TIMEOUT_MS = 5000

type PlainObject = Record<string, unknown>

interface ValidateResult {
  itemType?: string
  nodeClass?: string
  tagPath?: string
}

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getBrowseName(point: PlainObject): string {
  if (typeof point.nodeId === 'string' && point.nodeId) return point.nodeId
  const tagName = typeof point.tagName === 'string' ? point.tagName : ''
  const itemName = typeof point.itemName === 'string' ? point.itemName : ''
  return itemName ? `${tagName}.${itemName}` : tagName
}

function collectConditionPoints(conditions: unknown, points: PlainObject[], owners: Map<PlainObject, PlainObject>): void {
  if (!Array.isArray(conditions)) return
  for (const condition of conditions) {
    if (!isPlainObject(condition)) continue
    if (isPlainObject(condition.leftValue)) {
      points.push(condition.leftValue)
      owners.set(condition.leftValue, condition)
    }
    collectConditionPoints(condition.conditions, points, owners)
  }
}

function collectFeaturePoints(features: unknown, points: PlainObject[], owners: Map<PlainObject, PlainObject>): void {
  if (!Array.isArray(features)) return
  for (const feature of features) {
    if (!isPlainObject(feature)) continue
    collectConditionPoints(feature.conditions, points, owners)
    if (Array.isArray(feature.multiStateConditions)) {
      for (const state of feature.multiStateConditions) {
        if (isPlainObject(state)) collectConditionPoints(state.conditions, points, owners)
      }
    }
    if (!isPlainObject(feature.pars)) continue
    for (const par of Object.values(feature.pars)) {
      if (isPlainObject(par) && isPlainObject(par.original) && typeof par.original.tagName === 'string') {
        points.push(par.original)
      }
    }
  }
}

function collectPoints(node: unknown, points: PlainObject[], owners: Map<PlainObject, PlainObject>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectPoints(item, points, owners)
    return
  }
  if (!isPlainObject(node)) return
  // 事件定义的“数值变化”触发条件：condition.value 为测点数组
  if (node.type === 'valueChanged' && Array.isArray(node.value)) {
    for (const point of node.value) {
      if (isPlainObject(point)) points.push(point)
    }
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (FEATURE_STORE_KEYS.includes(key)) collectFeaturePoints(value, points, owners)
    else collectPoints(value, points, owners)
  }
}

async function validateTagItem(
  browseName: string,
  config: ModelPointApiConfig,
): Promise<ValidateResult | undefined> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.authorization) headers.Authorization = config.authorization
  if (config.namespace) headers.namespace = config.namespace
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/editorSvc/model/validateTagItem`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ browseName }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return undefined
    const body = await res.json() as { status?: number, data?: ValidateResult }
    if (body.status !== SUCCESS_CODE || !isPlainObject(body.data)) return undefined
    return body.data
  } catch {
    return undefined
  }
}

/** 按浏览名拆出 tagName/itemName，规则同编辑器 getModalData */
function toModelPoint(browseName: string, detail: ValidateResult): PlainObject {
  let parts = browseName.split('.')
  let itemName = ''
  if (detail.itemType) itemName = parts.pop() || ''
  // FieldPoint 的动态项没有独立项名，需要把 filedPointId 放入 itemName 才能查到动态值
  if (detail.nodeClass === FILED_POINT_TYPE && detail.itemType === ITEM_TYPE_DYNAMIC) {
    if (parts.length === 1) parts = parts[0].split(':')
    itemName = parts.pop() || ''
  }
  return {
    type: 'm',
    domain: '-1',
    itemType: detail.itemType,
    tagName: parts.join('.'),
    itemName,
    nodeType: detail.nodeClass,
    _unique: detail.tagPath,
    nodeId: browseName,
  }
}

/**
 * 补全最终 JSON 中特性测点的模型信息（原地修改）。
 * 未配置接口、接口失败或点不存在时保持原样，不影响生成结果。
 */
export async function enrichModelPoints(
  json: Record<string, unknown>,
  config?: ModelPointApiConfig,
): Promise<void> {
  if (!config?.baseUrl) return

  const points: PlainObject[] = []
  const owners = new Map<PlainObject, PlainObject>()
  collectPoints(json, points, owners)

  const pending = points.filter(point => !point.nodeType && getBrowseName(point))
  const browseNames = [...new Set(pending.map(getBrowseName))]
  const details = new Map<string, ValidateResult | undefined>()
  await Promise.all(browseNames.map(async (name) => {
    details.set(name, await validateTagItem(name, config))
  }))

  for (const point of pending) {
    const browseName = getBrowseName(point)
    const detail = details.get(browseName)
    if (!detail) continue
    Object.assign(point, toModelPoint(browseName, detail))
    const condition = owners.get(point)
    if (condition) condition.logic = browseName
  }
}
