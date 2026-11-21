/**
 * 图纸图元 (Display Element) JSON 生成器
 *
 * 提供通用的图纸图元生成函数，涵盖 create-display-* 系列 Skill 的规则。
 * 每个函数输入用户级参数（尺寸、位置、颜色等），输出完整的 elements JSON 对象。
 *
 * 设计原则：
 * - 固定字段在本模块中自动填充（不依赖模型生成）
 * - 模型只提供关键参数（尺寸、位置、颜色、名称等）
 * - 新增元素类型只需加一个 builder 函数 + 在 switch 中注册
 */

import type { EditorType } from '../../../types'
import { decodeHtmlEntities } from '../text-entities'

// ============================================================
// 通用工具函数
// ============================================================

/** 生成唯一 ID（21位，含大小写字母、数字、下划线、连字符） */
export function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  let id = ''
  for (let i = 0; i < 21; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

/** 计算 localRect 四个顶点（左上、右上、右下、左下） */
export function calcLocalRect(x: number, y: number, w: number, h: number) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

/** 计算 roatePos（旋转中心 = localRect 中心） */
export function calcRoatePos(x: number, y: number, w: number, h: number) {
  return { x: x + w / 2, y: y + h / 2 }
}

/** 渐变方向 → 渐变起点在包围盒中的相对位置（与编辑器序列化的 centerX / centerY 一致） */
const GRADIENT_DIRECTION_ORIGIN: Record<string, [number, number]> = {
  center: [0.5, 0.5],
  top: [0.5, 0],
  bottom: [0.5, 1],
  left: [0, 0.5],
  right: [1, 0.5],
  leftTop: [0, 0],
  leftBottom: [0, 1],
  rightTop: [1, 0],
  rightBottom: [1, 1],
}
const GRADIENT_TYPES = new Set(['linear', 'radial', 'single_spread', 'double_spread'])

/**
 * 规范化渐变模式串（"方向 类型"）。只写类型（如 "radial"）时方向默认 top；方向或类型无法识别返回 undefined。
 * 图纸与图符共用。
 */
export function normalizeGradientMode(gradient: unknown): string | undefined {
  if (typeof gradient !== 'string' || !gradient.trim()) return undefined
  const tokens = gradient.trim().split(/\s+/)
  const type = tokens.length > 1 ? tokens[1] : tokens[0]
  const direction = tokens.length > 1 ? tokens[0] : 'top'
  if (!Object.hasOwn(GRADIENT_DIRECTION_ORIGIN, direction) || !GRADIENT_TYPES.has(type)) return undefined
  return `${direction} ${type}`
}

/**
 * 构造颜色对象（支持渐变）。
 *
 * 纯色：`{ startColor }`
 * 渐变：`{ startColor, endColor, gradientMode, centerX, centerY }`，这是编辑器反序列化真正识别的格式：
 * gradientMode 为渐变类型，centerX / centerY（0~1）为渐变起点位置，三者缺一编辑器都不会显示渐变。
 *
 * 入参 `gradient` 形如 `"top linear"`、`"center radial"`（方向 + 类型），`start` 是方向所指一侧（渐变起点）的颜色，
 * `end` 是另一侧（终点）的颜色。注意编辑器的渲染是 [0, endColor, 1, startColor]：即 JSON 的 endColor 出现在
 * 渐变起点、startColor 出现在终点，因此这里要把两者对调写入，才能让“start=起点色、end=终点色”的直观语义成立。
 * 无法识别的渐变串按纯色处理。
 */
export function buildColorObj(
  start: string,
  end?: string,
  gradient?: string,
): Record<string, string | number> {
  const mode = normalizeGradientMode(gradient)
  if (!mode) return { startColor: start }
  const [direction, type] = mode.split(' ')
  const origin = GRADIENT_DIRECTION_ORIGIN[direction]
  return {
    startColor: end || start,
    endColor: start,
    gradientMode: type,
    centerX: origin[0],
    centerY: origin[1],
  }
}

// ============================================================
// 通用基础字段（所有图纸图元共用）
// ============================================================

export function getBaseFields(type: string, layer: string) {
  return {
    draggable: true,
    moveable: true,
    scaleX: 1,
    horMirror: false,
    scaleY: 1,
    verMirror: false,
    pId: '0',
    ver: 1,
    location: '',
    area: '',
    auth: '',
    limitForm: 1,
    shadowOpacity: 0,
    shadowBlur: 6,
    shadowOffsetX: 3,
    shadowOffsetY: 3,
    shadowColor: '#1ABC9C',
    hitStrokeWidth: 4,
    type,
    layer,
  }
}

// ============================================================
// 视觉细节：阴影 / 边框线型 / 箭头 / 静态旋转
// ============================================================

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max)
}

const round2 = (value: number) => Math.round(value * 100) / 100

/** 有边框线型（dash）的图元：与编辑器 borderTypes 一致 */
const BORDER_STYLE_TYPES = new Set(['Rectangle', 'RoundRect', 'Ellipse', 'Pie', 'Arc', 'Chord', 'Polygon', 'RegularPolygon'])
/** 有箭头属性的图元（编辑器仅直线与弧支持） */
const ARROW_TYPES = new Set(['Line', 'Arc'])
const MAX_BORDER_STYLE = 4
const MAX_ARROW_TYPE = 8

/** 仅在调用方显式传入时才写入，未传入的图元 JSON 保持原样 */
function applyVisualExtras(element: Record<string, unknown>, params: Record<string, unknown>): void {
  if (isFiniteNumber(params.shadowOpacity)) element.shadowOpacity = Math.min(Math.max(params.shadowOpacity, 0), 1)
  if (typeof params.shadowColor === 'string' && params.shadowColor) element.shadowColor = params.shadowColor
  for (const key of ['shadowBlur', 'shadowOffsetX', 'shadowOffsetY'] as const) {
    const value = params[key]
    if (isFiniteNumber(value)) element[key] = key === 'shadowBlur' ? Math.max(value, 0) : value
  }

  const type = String(element.type)
  if (BORDER_STYLE_TYPES.has(type) && isFiniteNumber(params.borderStyle)) {
    element.borderStyle = clampInt(params.borderStyle, 0, MAX_BORDER_STYLE)
  }
  if (ARROW_TYPES.has(type)) {
    for (const key of ['startArrowType', 'endArrowType'] as const) {
      const value = params[key]
      if (isFiniteNumber(value)) element[key] = clampInt(value, 0, MAX_ARROW_TYPE)
    }
    for (const key of ['startArrowSize', 'endArrowSize'] as const) {
      const value = params[key]
      if (isFiniteNumber(value)) element[key] = Math.max(Math.round(value), 0)
    }
  }
}

/** 可通过 rotation 参数旋转的图元：位置由外接矩形（localRect）决定的类型 */
export const ROTATABLE_TYPES = new Set(['Rectangle', 'RoundRect', 'Ellipse', 'Text', 'Picture', 'Pie', 'Arc', 'Chord', 'RegularPolygon'])

/**
 * 静态旋转：编辑器的 localRect 保存的是“旋转后”的 4 个顶点，roateAngle 为旋转角度，roatePos 为旋转中心。
 * 因此要把未旋转的顶点绕 roatePos 顺时针转 angle 度，并写入 roateAngle。angle 为 0 / 非法值时不做任何修改。
 * 必须在最终的 roatePos（含 pivotX/pivotY）确定后调用。
 */
export function applyStaticRotation(element: Record<string, unknown>, angle: unknown): void {
  if (!isFiniteNumber(angle) || !ROTATABLE_TYPES.has(String(element.type))) return
  const normalized = ((angle % 360) + 360) % 360
  const rect = element.localRect as Array<{ x: number, y: number }> | undefined
  const pivot = element.roatePos as { x: number, y: number } | undefined
  if (normalized === 0 || !Array.isArray(rect) || !pivot) return
  const radian = (normalized * Math.PI) / 180
  const cos = Math.cos(radian)
  const sin = Math.sin(radian)
  element.localRect = rect.map(point => {
    const dx = point.x - pivot.x
    const dy = point.y - pivot.y
    return { x: round2(pivot.x + dx * cos - dy * sin), y: round2(pivot.y + dx * sin + dy * cos) }
  })
  element.roateAngle = normalized
}

// ============================================================
// 各类型图元 Builder
// ============================================================

export interface RectParams {
  width: number
  height: number
  x: number
  y: number
  fill?: string
  stroke?: string
  borderWidth?: number
  cornerRadius?: number
  fillEndColor?: string
  fillGradient?: string
  strokeEndColor?: string
  strokeGradient?: string
  name?: string
  layer?: string
  zIndex?: number
}

export function buildRect(params: RectParams) {
  const {
    width, height, x, y,
    fill = '#D8D8D8',
    stroke = '#979797',
    borderWidth = 1,
    cornerRadius,
    fillEndColor,
    fillGradient,
    strokeEndColor,
    strokeGradient,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const type = cornerRadius ? 'RoundRect' : 'Rectangle'
  const localRect = calcLocalRect(x, y, width, height)
  const roatePos = calcRoatePos(x, y, width, height)

  const element: Record<string, unknown> = {
    id: generateId(),
    ...getBaseFields(type, layer),
    name: name || (cornerRadius ? '圆角矩形' : '矩形'),
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    fillColor: buildColorObj(fill, fillEndColor, fillGradient),
    borderColor: buildColorObj(stroke, strokeEndColor, strokeGradient),
    textColor: { startColor: fill },
    borderWidth,
    zIndex,
  }

  if (cornerRadius) {
    element.cornerRadius = cornerRadius
    element.roundAngle = cornerRadius
  }

  return element
}

export interface EllipseParams {
  width: number
  height: number
  x: number
  y: number
  fill?: string
  stroke?: string
  borderWidth?: number
  fillEndColor?: string
  fillGradient?: string
  strokeEndColor?: string
  strokeGradient?: string
  name?: string
  layer?: string
  zIndex?: number
}

export function buildEllipse(params: EllipseParams) {
  const {
    width, height, x, y,
    fill = '#D8D8D8',
    stroke = '#979797',
    borderWidth = 1,
    fillEndColor,
    fillGradient,
    strokeEndColor,
    strokeGradient,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const localRect = calcLocalRect(x, y, width, height)
  const roatePos = calcRoatePos(x, y, width, height)

  return {
    id: generateId(),
    ...getBaseFields('Ellipse', layer),
    name: name || '椭圆',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    fillColor: buildColorObj(fill, fillEndColor, fillGradient),
    borderColor: buildColorObj(stroke, strokeEndColor, strokeGradient),
    textColor: { startColor: fill },
    borderWidth,
    zIndex,
  }
}

export interface TextParams {
  text: string
  x: number
  y: number
  width?: number
  height?: number
  fontSize?: number
  fontFamily?: string
  fill?: string
  textAlign?: 'left' | 'center' | 'right'
  textBaseline?: 'top' | 'middle' | 'bottom'
  bold?: boolean
  italic?: boolean
  underline?: boolean
  deleteline?: boolean
  letterSpacing?: number
  wrap?: 'char' | 'word' | 'none'
  name?: string
  layer?: string
  zIndex?: number
}

const TEXT_H_ALIGN: Record<string, number> = { left: 0, center: 1, right: 2 }
const TEXT_V_ALIGN: Record<string, number> = { top: 0, middle: 1, bottom: 2 }
const TEXT_WRAP: Record<string, number> = { char: 0, word: 1, none: 2 }
const MAX_LETTER_SPACING = 50

export function buildText(params: TextParams) {
  const {
    x, y,
    width = 200,
    height = 40,
    fontSize = 14,
    fontFamily = 'Microsoft YaHei',
    fill = '#000000',
    textAlign = 'center',
    textBaseline = 'middle',
    bold = false,
    italic = false,
    underline = false,
    deleteline = false,
    wrap,
    name,
    layer = '1',
    zIndex = 0,
  } = params
  const letterSpacing = isFiniteNumber(params.letterSpacing)
    ? Math.min(Math.max(params.letterSpacing, 0), MAX_LETTER_SPACING)
    : 0

  const localRect = calcLocalRect(x, y, width, height)
  const roatePos = calcRoatePos(x, y, width, height)

  // 模型可能漏传或传入非字符串的 text，缺省按空文本处理，避免 Buffer.from(undefined) 抛错
  const text = decodeHtmlEntities(typeof params.text === 'string' ? params.text : params.text == null ? '' : String(params.text))

  // 文本内容 base64 编码后存储
  const encodedText = Buffer.from(text, 'utf-8').toString('base64')

  return {
    id: generateId(),
    ...getBaseFields('Text', layer),
    name: name || '文本',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    text: encodedText,
    // 编辑器标准格式：family,size,-1,5,bold,italic,underline,deleteline,letterSpacing,0
    font: `${fontFamily},${fontSize},-1,5,${bold ? 1 : 0},${italic ? 1 : 0},${underline ? 1 : 0},${deleteline ? 1 : 0},${letterSpacing},0`,
    underline,
    deleteline: Boolean(deleteline),
    textColor: { startColor: fill },
    fillColor: { startColor: fill },
    borderColor: { startColor: 'rgba(255,255,255,0)' },
    borderWidth: 0,
    textWrap: typeof TEXT_WRAP[wrap as string] === 'number' ? TEXT_WRAP[wrap as string] : 0,
    // 编辑器使用数值枚举：水平 0左/1中/2右，垂直 0上/1中/2下
    textHAlign: TEXT_H_ALIGN[textAlign] ?? 1,
    textVAlign: TEXT_V_ALIGN[textBaseline] ?? 1,
    zIndex,
  }
}

export interface LineParams {
  x1: number
  y1: number
  x2: number
  y2: number
  stroke?: string
  strokeWidth?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  name?: string
  layer?: string
  zIndex?: number
}

const LINE_STYLE_TO_BORDER_STYLE: Record<string, number> = { solid: 0, dashed: 1, dotted: 2 }

export function buildLine(params: LineParams) {
  const {
    x1, y1, x2, y2,
    stroke = '#979797',
    strokeWidth = 1,
    lineStyle = 'solid',
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const width = Math.abs(x2 - x1) || 1
  const height = Math.abs(y2 - y1) || 1
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  const localRect = calcLocalRect(x, y, width, height)
  const roatePos = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }

  // 编辑器直线以 line 点数组绘制（x1/y1/x2/y2 不会被识别），线型使用数值枚举 borderStyle
  return {
    id: generateId(),
    ...getBaseFields('Line', layer),
    name: name || '直线',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    line: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    borderColor: { startColor: stroke },
    fillColor: { startColor: 'rgba(255,255,255,0)' },
    textColor: { startColor: stroke },
    borderWidth: strokeWidth,
    borderStyle: LINE_STYLE_TO_BORDER_STYLE[lineStyle] ?? 0,
    zIndex,
  }
}

export interface PolygonParams {
  points: Array<{ x: number; y: number }>
  fill?: string
  stroke?: string
  borderWidth?: number
  fillEndColor?: string
  fillGradient?: string
  strokeEndColor?: string
  strokeGradient?: string
  name?: string
  layer?: string
  zIndex?: number
}

export function buildPolygon(params: PolygonParams) {
  const {
    points,
    fill = '#D8D8D8',
    stroke = '#979797',
    borderWidth = 1,
    fillEndColor,
    fillGradient,
    strokeEndColor,
    strokeGradient,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const width = maxX - minX
  const height = maxY - minY

  const localRect = calcLocalRect(minX, minY, width, height)
  const roatePos = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }

  return {
    id: generateId(),
    ...getBaseFields('Polygon', layer),
    name: name || '多边形',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    points,
    fillColor: buildColorObj(fill, fillEndColor, fillGradient),
    borderColor: buildColorObj(stroke, strokeEndColor, strokeGradient),
    textColor: { startColor: fill },
    borderWidth,
    zIndex,
  }
}

export interface PictureParams {
  src: string
  x: number
  y: number
  width: number
  height: number
  name?: string
  layer?: string
  zIndex?: number
}

export function buildPicture(params: PictureParams) {
  const { src, x, y, width, height, name, layer = '1', zIndex = 0 } = params
  const localRect = calcLocalRect(x, y, width, height)
  const roatePos = calcRoatePos(x, y, width, height)

  return {
    id: generateId(),
    ...getBaseFields('Picture', layer),
    name: name || '图片',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    src,
    clipX: 0,
    clipY: 0,
    clipWidth: width,
    clipHeight: height,
    zIndex,
  }
}

export interface PieParams {
  cx: number
  cy: number
  radius: number
  startAngle: number
  endAngle: number
  fill?: string
  stroke?: string
  borderWidth?: number
  fillEndColor?: string
  fillGradient?: string
  strokeEndColor?: string
  strokeGradient?: string
  name?: string
  layer?: string
  zIndex?: number
}

export function buildPie(params: PieParams) {
  const {
    cx, cy, radius,
    startAngle, endAngle,
    fill = '#D8D8D8',
    stroke = '#979797',
    borderWidth = 1,
    fillEndColor,
    fillGradient,
    strokeEndColor,
    strokeGradient,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const width = radius * 2
  const height = radius * 2
  const x = cx - radius
  const y = cy - radius
  const localRect = calcLocalRect(x, y, width, height)
  const roatePos = { x: cx, y: cy }

  return {
    id: generateId(),
    ...getBaseFields('Pie', layer),
    name: name || '饼图',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    cx, cy, radius,
    startAngle, endAngle,
    fillColor: buildColorObj(fill, fillEndColor, fillGradient),
    borderColor: buildColorObj(stroke, strokeEndColor, strokeGradient),
    textColor: { startColor: fill },
    borderWidth,
    zIndex,
  }
}

// ============================================================
// 弧 / 弦（Arc / Chord）
// ============================================================

export interface ArcParams {
  width: number
  height: number
  startAngle: number
  endAngle: number
  x: number
  y: number
  fill?: string
  stroke?: string
  borderWidth?: number
  fillEndColor?: string
  fillGradient?: string
  strokeEndColor?: string
  strokeGradient?: string
  name?: string
  layer?: string
  zIndex?: number
}

/** 构造弧/弦。弦（closePath=true）用直线连接弧两端形成闭合区域。 */
function buildArcLike(params: ArcParams, closePath: boolean) {
  const {
    width, height, startAngle, endAngle, x, y,
    fill = closePath ? '#D8D8D8' : '#D8D8D800',
    stroke = '#979797',
    borderWidth = 1,
    fillEndColor,
    fillGradient,
    strokeEndColor,
    strokeGradient,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const type = closePath ? 'Chord' : 'Arc'
  const localRect = calcLocalRect(x, y, width, height)
  const roatePos = calcRoatePos(x, y, width, height)

  const element: Record<string, unknown> = {
    id: generateId(),
    ...getBaseFields(type, layer),
    name: name || (closePath ? '弦' : '弧'),
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    startAngle,
    endAngle,
    fillColor: buildColorObj(fill, fillEndColor, fillGradient),
    borderColor: buildColorObj(stroke, strokeEndColor, strokeGradient),
    textColor: { startColor: fill },
    borderWidth,
    zIndex,
  }

  if (closePath) element.closePath = true

  return element
}

export function buildArc(params: ArcParams) {
  return buildArcLike(params, false)
}

export function buildChord(params: ArcParams) {
  return buildArcLike(params, true)
}

// ============================================================
// 曲线（Curve）— 支持直线段与贝塞尔曲线段
// ============================================================

export interface CurveParams {
  /** 控制点坐标数组 [{x,y}, ...] */
  polygon: Array<{ x: number; y: number }>
  /**
   * 段类型数组。段类型编码：
   * 1=moveTo 起点, 2=lineTo 直线段, 3=quaraticCurveTo 二阶贝塞尔, 4=bezierCurveTo 三阶贝塞尔, 5=closePath 闭合。
   * 长度 = polygon.length - 1（首点隐含 moveTo）。
   */
  segments: number[]
  /** 贝塞尔控制点扁平数组 [cx1, cy1, cx2, cy2, ...]，二阶每段 1 个点，三阶每段 2 个点 */
  controlPoints?: number[]
  stroke?: string
  borderWidth?: number
  strokeEndColor?: string
  strokeGradient?: string
  name?: string
  layer?: string
  zIndex?: number
}

export function buildCurve(params: CurveParams) {
  const {
    polygon,
    segments,
    controlPoints = [],
    stroke = '#979797',
    borderWidth = 1,
    strokeEndColor,
    strokeGradient,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const xs = polygon.map(p => p.x)
  const ys = polygon.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const width = maxX - minX || 1
  const height = maxY - minY || 1

  const localRect = calcLocalRect(minX, minY, width, height)
  const roatePos = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }

  return {
    id: generateId(),
    ...getBaseFields('Curve', layer),
    name: name || '曲线',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    polygon,
    segments,
    controlPoints,
    borderColor: buildColorObj(stroke, strokeEndColor, strokeGradient),
    fillColor: { startColor: 'rgba(255,255,255,0)' },
    borderWidth,
    zIndex,
  }
}

// ============================================================
// 管道（Pipeline）
// ============================================================

export interface PipeParams {
  polygon: Array<{ x: number; y: number }>
  stroke?: string
  borderWidth?: number
  borderStyle?: number
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'round' | 'bevel' | 'miter'
  strokeEndColor?: string
  strokeGradient?: string
  name?: string
  layer?: string
  zIndex?: number
}

export function buildPipe(params: PipeParams) {
  const {
    polygon,
    stroke = '#929292',
    borderWidth = 10,
    borderStyle = 1,
    lineCap = 'butt',
    lineJoin = 'round',
    strokeEndColor,
    strokeGradient,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const xs = polygon.map(p => p.x)
  const ys = polygon.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const width = maxX - minX || 1
  const height = maxY - minY || 1

  const localRect = calcLocalRect(minX, minY, width, height)
  const roatePos = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }

  return {
    id: generateId(),
    ...getBaseFields('Pipeline', layer),
    name: name || '管道',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    polygon,
    borderColor: buildColorObj(stroke, strokeEndColor, strokeGradient),
    fillColor: { startColor: 'rgba(255,255,255,0)' },
    borderWidth,
    borderStyle,
    lineCap,
    lineJoin,
    zIndex,
  }
}

// ============================================================
// 折线（Polyline）
// ============================================================

export interface PolylineParams {
  polygon: Array<{ x: number; y: number }>
  stroke?: string
  borderWidth?: number
  strokeEndColor?: string
  strokeGradient?: string
  name?: string
  layer?: string
  zIndex?: number
}

export function buildPolyline(params: PolylineParams) {
  const {
    polygon,
    stroke = '#979797',
    borderWidth = 1,
    strokeEndColor,
    strokeGradient,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const xs = polygon.map(p => p.x)
  const ys = polygon.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const width = maxX - minX || 1
  const height = maxY - minY || 1

  const localRect = calcLocalRect(minX, minY, width, height)
  const roatePos = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }

  return {
    id: generateId(),
    ...getBaseFields('Polyline', layer),
    name: name || '折线',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    polygon,
    close: false,
    borderColor: buildColorObj(stroke, strokeEndColor, strokeGradient),
    fillColor: { startColor: 'rgba(255,255,255,0)' },
    borderWidth,
    zIndex,
  }
}

// ============================================================
// 正多边形（RegularPolygon）
// ============================================================

export interface RegularPolygonParams {
  sides: number
  radius: number
  x: number
  y: number
  fill?: string
  stroke?: string
  borderWidth?: number
  fillEndColor?: string
  fillGradient?: string
  strokeEndColor?: string
  strokeGradient?: string
  name?: string
  layer?: string
  zIndex?: number
}

export function buildRegularPolygon(params: RegularPolygonParams) {
  const {
    sides, radius, x, y,
    fill = '#D8D8D8',
    stroke = '#979797',
    borderWidth = 1,
    fillEndColor,
    fillGradient,
    strokeEndColor,
    strokeGradient,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const width = radius * 2
  const height = radius * 2
  const localRect = calcLocalRect(x, y, width, height)
  const roatePos = calcRoatePos(x, y, width, height)

  return {
    id: generateId(),
    ...getBaseFields('RegularPolygon', layer),
    name: name || '正多边形',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    sides,
    radius,
    fillColor: buildColorObj(fill, fillEndColor, fillGradient),
    borderColor: buildColorObj(stroke, strokeEndColor, strokeGradient),
    textColor: { startColor: fill },
    borderWidth,
    zIndex,
  }
}

// ============================================================
// 统一 Builder 入口
// ============================================================

/** 根据类型名和参数字典生成图元 JSON（含阴影、边框线型、箭头等视觉细节；旋转由 applyStaticRotation 在旋转中心确定后应用） */
export function buildDisplayElement(
  type: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const element = buildBaseDisplayElement(type, params)
  applyVisualExtras(element, params)
  return element
}

function buildBaseDisplayElement(
  type: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  switch (type) {
    case 'Rectangle':
    case 'RoundRect':
      return buildRect(params as unknown as RectParams)
    case 'Ellipse':
      return buildEllipse(params as unknown as EllipseParams)
    case 'Text':
      return buildText(params as unknown as TextParams)
    case 'Line':
      return buildLine(params as unknown as LineParams)
    case 'Polygon':
      return buildPolygon(params as unknown as PolygonParams)
    case 'Picture':
      return buildPicture(params as unknown as PictureParams)
    case 'Pie':
      return buildPie(params as unknown as PieParams)
    case 'Arc':
      return buildArc(params as unknown as ArcParams)
    case 'Chord':
      return buildChord(params as unknown as ArcParams)
    case 'Curve':
      return buildCurve(params as unknown as CurveParams)
    case 'Pipeline':
      return buildPipe(params as unknown as PipeParams)
    case 'Polyline':
      return buildPolyline(params as unknown as PolylineParams)
    case 'RegularPolygon':
      return buildRegularPolygon(params as unknown as RegularPolygonParams)
    default:
      throw new Error(`不支持的图纸图元类型: ${type}`)
  }
}

// ============================================================
// 图纸 Document 组装器（display-generator Skill）
// ============================================================

export interface DisplayDocumentParams {
  pageName: string
  elementsData: Record<string, unknown>[]
  pageWidth?: number
  pageHeight?: number
  bgColor?: string
  zoomEnable?: boolean
  refreshCycle?: number
  author?: string
  company?: string
  desc?: string
  scadaType?: string
}

/** 生成 32 位随机 hex 字符串（模拟 MD5） */
function generateCode(): string {
  const hex = '0123456789abcdef'
  let code = ''
  for (let i = 0; i < 32; i++) {
    code += hex.charAt(Math.floor(Math.random() * hex.length))
  }
  return code
}

/**
 * 判断图元是否为覆盖整块画布的背景/底板。
 * 用于组装时把背景下沉到最底层，避免因创建顺序靠后而遮挡显示内容。
 */
export function isBackgroundElement(
  el: Record<string, unknown>,
  pageWidth: number,
  pageHeight: number,
): boolean {
  // 只有实心形状类才可能作为背景底板
  if (!['Rectangle', 'RoundRect', 'Polygon'].includes(el.type as string)) return false

  const rect = el.localRect as Array<{ x: number; y: number }> | undefined
  const width = typeof el.width === 'number' ? el.width : 0
  const height = typeof el.height === 'number' ? el.height : 0
  if (!Array.isArray(rect) || rect.length === 0 || width <= 0 || height <= 0) return false

  const x = rect[0].x
  const y = rect[0].y
  const canvasArea = pageWidth * pageHeight
  if (canvasArea <= 0) return false

  // 覆盖 ≥ 85% 画布面积，且左上角贴近原点，视为背景底板
  return (
    width * height >= canvasArea * 0.85 &&
    x <= pageWidth * 0.1 &&
    y <= pageHeight * 0.1
  )
}

/** 组装完整图纸 document JSON */
export function buildDisplayDocument(params: DisplayDocumentParams) {
  const {
    pageName,
    elementsData,
    pageWidth = 1880,
    pageHeight = 962,
    bgColor = '#ffffff',
    zoomEnable = true,
    refreshCycle = 1000,
    author = '',
    company = '',
    desc = '',
    scadaType = '',
  } = params

  // zIndex 重排：先把覆盖整块画布的背景/底板下沉到最底层，其余保持创建顺序（稳定排序），
  // 避免背景因创建顺序靠后而遮挡显示内容。
  const ordered = elementsData
    .map((el, i) => ({ el, i, bg: isBackgroundElement(el, pageWidth, pageHeight) }))
    .sort((a, b) => (a.bg === b.bg ? a.i - b.i : a.bg ? -1 : 1))
    .map(entry => entry.el)

  const elements = ordered.map((el, i) => ({
    ...el,
    zIndex: i,
  }))

  // latestIndex 计算
  const latestIndex = 100000 + elements.length + 20

  // 日期格式化
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

  return {
    document: {
      ver: '1.0',
      name: pageName,
      code: generateCode(),
      author,
      company,
      desc,
      date,
      scadaType,
      pageSaved: true,
      pageProperty: {
        latestIndex,
        area: '',
        auth: '',
        bgColor,
        bgPic: 1,
        pageHeight,
        onlineOperations: ['screenshotable'],
        pageWidth,
        picContent: '',
        ratio: 0,
        refreshCycle,
        templateRef: '',
        zoomEnable,
        width: pageWidth,
        height: pageHeight,
      },
      pageParams: [],
      oldPageParams: [],
      layers: [
        {
          id: '1',
          moveable: true,
          name: '',
          selectable: true,
          visible: true,
        },
      ],
      elements,
      pageScript: [],
    },
  }
}

// ============================================================
// 图符 Symbol 组装器（canvas-symbol-generator Skill）
// ============================================================

export interface SymbolDocumentParams {
  symbolName: string
  compsData: Record<string, unknown>[]
  width?: number
  height?: number
  background?: string
}

/** 组装完整图符 JSON */
export function buildSymbolDocument(params: SymbolDocumentParams) {
  const {
    symbolName,
    compsData,
    width = 800,
    height = 600,
    background = 'rgba(255, 255, 255, 1)',
  } = params

  return {
    modified: Date.now(),
    comps: compsData,
    dataBindings: [],
    relatedProps: [],
    mainData: '',
    code: '1000673',
    width,
    height,
    background,
    store: {
      latestIndex: 100000,
      gridThickLinesEvery: 10,
      bgColor: background,
      gridBlockSize: 10,
      pageHeight: height,
      pageWidth: width,
    },
    renderHTML: '',
    name: symbolName,
  }
}

// ============================================================
// 根据 editorType 执行对应的文档组装
// ============================================================

export interface AssembleParams {
  editorType: EditorType
  name: string
  items: Record<string, unknown>[]
  options?: Record<string, unknown>
}

export function assembleDocument(params: AssembleParams) {
  const { editorType, name, items, options = {} } = params

  if (editorType === 'display') {
    return buildDisplayDocument({
      pageName: name,
      elementsData: items,
      ...options,
    })
  } else {
    return buildSymbolDocument({
      symbolName: name,
      compsData: items,
      ...options,
    })
  }
}