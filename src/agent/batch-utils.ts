/**
 * 批量生成辅助：模板占位符展开、特性内字符串批量替换、点表（CSV / JSON）解析
 */

import { decodeText, encodeText, isRecord } from './element-lookup'

type Rec = Record<string, unknown>

// ============================================================
// 模板占位符
// ============================================================

export type TemplateVars = Record<string, string | number>

/**
 * 展开 `{n}`、`{n:2}`（补零到 2 位）、`{i}`、`{row}`、`{col}` 及自定义变量；
 * 变量不存在时保持原样，避免误伤普通花括号内容。
 */
export function expandTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)(?::(\d+))?\}/g, (match, key: string, width?: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return match
    const value = String(vars[key])
    return width ? value.padStart(Number(width), '0') : value
  })
}

export function hasPlaceholder(template: string): boolean {
  return /\{\w+(?::\d+)?\}/.test(template)
}

// ============================================================
// 字符串批量替换
// ============================================================

const FEATURE_KEYS = ['dynamicDyna', 'interactiveDyna', 'events'] as const

function mapStringsDeep(value: unknown, fn: (text: string) => string, skipKeys: ReadonlySet<string>): unknown {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map(item => mapStringsDeep(item, fn, skipKeys))
  if (isRecord(value)) {
    const mapped = Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      skipKeys.has(key) ? item : mapStringsDeep(item, fn, skipKeys),
    ]))
    // 测点由模板占位符（如 {point}）替换而来时，tagName / itemName 需按替换后的全路径重新拆分
    if (typeof value.nodeId === 'string' && hasPlaceholder(value.nodeId) && typeof mapped.nodeId === 'string') {
      const dot = mapped.nodeId.lastIndexOf('.')
      mapped.tagName = dot > 0 ? mapped.nodeId.slice(0, dot) : mapped.nodeId
      mapped.itemName = dot > 0 ? mapped.nodeId.slice(dot + 1) : ''
    }
    return mapped
  }
  return value
}

const ID_KEYS: ReadonlySet<string> = new Set(['id', 'pId', 'num', 'type'])

/** 对任意 JSON 值里的字符串叶子逐个应用 fn（id / pId / type 等标识字段除外） */
export function mapStrings<T>(value: T, fn: (text: string) => string): T {
  return mapStringsDeep(value, fn, ID_KEYS) as T
}

/** 只替换特性（动态 / 交互 / 事件）里的字符串，常用于把测点名批量换成另一台设备的测点 */
export function mapFeatureStrings(element: Rec, fn: (text: string) => string): Rec {
  const next: Rec = { ...element }
  for (const key of FEATURE_KEYS) {
    if (Array.isArray(next[key])) next[key] = mapStringsDeep(next[key], fn, ID_KEYS)
  }
  if (isRecord(element.store)) {
    const store: Rec = { ...element.store }
    for (const key of FEATURE_KEYS) {
      if (Array.isArray(store[key])) store[key] = mapStringsDeep(store[key], fn, ID_KEYS)
    }
    next.store = store
  }
  return next
}

/** 替换图元内所有字符串（名称、文字内容、特性等）；文字图元的 base64 文本会先解码再重新编码 */
export function mapElementStrings(element: Rec, fn: (text: string) => string): Rec {
  if (element.type !== 'Text' || typeof element.text !== 'string') {
    return mapStringsDeep(element, fn, ID_KEYS) as Rec
  }
  const { text, ...rest } = element
  const next = mapStringsDeep(rest, fn, ID_KEYS) as Rec
  next.text = encodeText(fn(decodeText(text as string) ?? ''))
  return next
}

export interface Replacement { from: string, to: string }

export function readReplacements(value: unknown): Replacement[] | { error: string } {
  let list = value
  if (typeof list === 'string') {
    if (!list.trim()) return []
    try {
      list = JSON.parse(list)
    } catch {
      return { error: 'replace 必须是 [{"from":"...","to":"..."}] 数组或其 JSON 字符串' }
    }
  }
  if (list === undefined || list === null) return []
  if (!Array.isArray(list)) return { error: 'replace 必须是数组' }
  const result: Replacement[] = []
  for (const item of list) {
    if (!isRecord(item) || typeof item.from !== 'string' || !item.from || typeof item.to !== 'string') {
      return { error: 'replace 的每一项都必须包含非空字符串 from 和字符串 to' }
    }
    result.push({ from: item.from, to: item.to })
  }
  return result
}

/** 对一段文本依次应用替换；to 中的占位符用 vars 展开 */
export function applyReplacements(text: string, replacements: Replacement[], vars: TemplateVars): string {
  return replacements.reduce(
    (current, { from, to }) => current.split(from).join(expandTemplate(to, vars)),
    text,
  )
}

// ============================================================
// 点表解析
// ============================================================

export interface PointRow {
  point: string
  name: string
  unit: string
  min: string
  max: string
  device: string
}

const COLUMN_ALIASES: Record<keyof PointRow, string[]> = {
  point: ['point', 'tag', 'nodeid', 'datasourcekey', 'tagname', '测点', '测点名', '测点全路径', '点位', '位号', '点名'],
  name: ['name', 'label', 'desc', 'description', '名称', '描述', '说明', '点描述', '显示名称'],
  unit: ['unit', 'eu', '单位', '工程单位'],
  min: ['min', 'low', 'lowlimit', '下限', '量程下限', '最小值'],
  max: ['max', 'high', 'highlimit', '上限', '量程上限', '最大值'],
  device: ['device', 'equipment', '设备', '设备名称', '设备名'],
}

export const MAX_POINT_ROWS = 200

/** 解析 CSV / TSV 文本（支持双引号转义），分隔符按首行自动识别 */
export function parseDelimited(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, '')
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [',', '\t', ';']
    .map(candidate => ({ candidate, count: firstLine.split(candidate).length }))
    .sort((a, b) => b.count - a.count)[0].candidate

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some(item => item.trim())) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some(item => item.trim())) rows.push(row)
  return rows
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_\-()（）]/g, '')
}

function stringify(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

/** 把 CSV 文本 / JSON 数组统一解析为点表行；columns 可显式指定「字段 → 表头」映射 */
export function parsePointTable(
  data: string,
  columns?: Partial<Record<keyof PointRow, string>>,
): { rows: PointRow[], warnings: string[] } | { error: string } {
  const text = data.trim()
  if (!text) return { error: '点表内容为空' }

  let headers: string[]
  let records: Array<Record<string, string>>
  if (text.startsWith('[') || text.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      return { error: `点表 JSON 解析失败：${error instanceof Error ? error.message : String(error)}` }
    }
    const list = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.rows) ? parsed.rows : undefined
    if (!list) return { error: '点表 JSON 必须是对象数组，或带 rows 数组的对象' }
    if (list.length > 0 && Array.isArray(list[0])) {
      headers = (list[0] as unknown[]).map(stringify)
      records = list.slice(1).map(item => Object.fromEntries(
        headers.map((header, index) => [header, stringify((item as unknown[])[index])]),
      ))
    } else {
      records = list.filter(isRecord).map(item => Object.fromEntries(
        Object.entries(item).map(([key, value]) => [key, stringify(value)]),
      ))
      headers = [...new Set(records.flatMap(record => Object.keys(record)))]
    }
  } else {
    const table = parseDelimited(text)
    if (table.length < 2) return { error: '点表至少需要表头行和一行数据' }
    headers = table[0].map(header => header.trim())
    records = table.slice(1).map(cells => Object.fromEntries(
      headers.map((header, index) => [header, (cells[index] ?? '').trim()]),
    ))
  }

  const lookup = (field: keyof PointRow): string | undefined => {
    const explicit = columns?.[field]
    if (explicit) return headers.find(header => normalizeHeader(header) === normalizeHeader(explicit))
    const aliases = COLUMN_ALIASES[field]
    return headers.find(header => aliases.includes(normalizeHeader(header)))
  }
  const mapping = {
    point: lookup('point'),
    name: lookup('name'),
    unit: lookup('unit'),
    min: lookup('min'),
    max: lookup('max'),
    device: lookup('device'),
  }
  if (!mapping.point) {
    return { error: `点表缺少测点列（可用表头：${headers.join('、') || '无'}）；请用 columns 指定，如 {"point":"位号"}` }
  }

  const warnings: string[] = []
  const rows: PointRow[] = []
  const seen = new Set<string>()
  records.forEach((record, index) => {
    const read = (field: keyof PointRow) => (mapping[field] ? stringify(record[mapping[field] as string]) : '')
    const point = read('point')
    if (!point) {
      warnings.push(`第 ${index + 1} 行缺少测点，已跳过`)
      return
    }
    if (seen.has(point)) warnings.push(`测点 ${point} 重复出现`)
    seen.add(point)
    rows.push({
      point,
      name: read('name') || point,
      unit: read('unit'),
      min: read('min'),
      max: read('max'),
      device: read('device'),
    })
  })
  if (rows.length === 0) return { error: '点表没有有效数据行' }
  if (rows.length > MAX_POINT_ROWS) {
    warnings.push(`点表共 ${rows.length} 行，仅处理前 ${MAX_POINT_ROWS} 行`)
    rows.length = MAX_POINT_ROWS
  }
  return { rows, warnings }
}
