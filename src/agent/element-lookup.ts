/**
 * 图元检索 — 按名称 / 文字图元内容（base64 存储）在当前图纸中查找候选图元，
 * 并给出位置描述，供模型判断目标或向用户提问。
 */

export interface ElementBrief {
  id: string
  name: string
  type: string
  /** 文字图元解码后的内容 */
  text?: string
  x: number
  y: number
  width: number
  height: number
  /** 相对画布的大致位置，如“右上” */
  position: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 解码文字图元的 base64 内容；非合法 base64 时原样返回 */
export function decodeText(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  const decoded = Buffer.from(raw, 'base64').toString('utf-8')
  const normalize = (value: string) => value.replace(/=+$/, '')
  return normalize(Buffer.from(decoded, 'utf-8').toString('base64')) === normalize(raw) ? decoded : raw
}

/** 是否为编辑器 atob 可严格解码、且为合法 UTF-8 的 base64 文本 */
export function isEncodedText(raw: string): boolean {
  if (raw === '') return true
  if (raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return false
  const decoded = Buffer.from(raw, 'base64').toString('utf-8')
  return Buffer.from(decoded, 'utf-8').toString('base64') === raw
}

/** 将文字图元的原始文本编码为编辑器存储格式（base64） */
export function encodeText(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64')
}

function getBounds(element: Record<string, unknown>): { x: number, y: number, width: number, height: number } {
  const rect = element.localRect
  if (Array.isArray(rect) && rect.length > 0) {
    const xs = rect.map(p => (isRecord(p) ? Number(p.x) : NaN)).filter(Number.isFinite)
    const ys = rect.map(p => (isRecord(p) ? Number(p.y) : NaN)).filter(Number.isFinite)
    if (xs.length && ys.length) {
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
    }
  }
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  return { x: num(element.x), y: num(element.y), width: num(element.width), height: num(element.height) }
}

function describePosition(
  bounds: { x: number, y: number, width: number, height: number },
  pageWidth: number,
  pageHeight: number,
): string {
  const cx = (bounds.x + bounds.width / 2) / (pageWidth || 1)
  const cy = (bounds.y + bounds.height / 2) / (pageHeight || 1)
  const h = cx < 1 / 3 ? '左' : cx > 2 / 3 ? '右' : '中'
  const v = cy < 1 / 3 ? '上' : cy > 2 / 3 ? '下' : '中'
  return h === '中' && v === '中' ? '中间' : `${h}${v}`.replace('中', '')
}

export function briefElement(
  element: Record<string, unknown>,
  pageWidth: number,
  pageHeight: number,
): ElementBrief {
  const bounds = getBounds(element)
  const text = element.type === 'Text' || typeof element.text === 'string' ? decodeText(element.text) : undefined
  return {
    id: String(element.id ?? ''),
    name: typeof element.name === 'string' ? element.name : '',
    type: typeof element.type === 'string' ? element.type : '',
    ...(text ? { text } : {}),
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    position: describePosition(bounds, pageWidth, pageHeight),
  }
}

/** 按关键词（名称或文字内容，忽略大小写）检索；关键词为空则返回全部 */
export function findElementBriefs(
  elements: Record<string, unknown>[],
  keyword: string,
  pageWidth: number,
  pageHeight: number,
  limit = 30,
): { total: number, candidates: ElementBrief[] } {
  const kw = keyword.trim().toLowerCase()
  const matched = elements
    .map(element => briefElement(element, pageWidth, pageHeight))
    .filter(brief => !kw
      || brief.name.toLowerCase().includes(kw)
      || (brief.text ?? '').toLowerCase().includes(kw))
  return {
    total: matched.length,
    candidates: matched.slice(0, limit).map(brief => (brief.text && brief.text.length > 50
      ? { ...brief, text: `${brief.text.slice(0, 50)}…` }
      : brief)),
  }
}
