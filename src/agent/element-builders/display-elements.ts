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

import type { EditorType } from '../../types'

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
    fillColor: { startColor: fill },
    borderColor: { startColor: stroke },
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
    fillColor: { startColor: fill },
    borderColor: { startColor: stroke },
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
  name?: string
  layer?: string
  zIndex?: number
}

export function buildText(params: TextParams) {
  const {
    text,
    x, y,
    width = 200,
    height = 40,
    fontSize = 14,
    fontFamily = 'Microsoft YaHei',
    fill = '#000000',
    textAlign = 'left',
    textBaseline = 'top',
    bold = false,
    italic = false,
    underline = false,
    name,
    layer = '1',
    zIndex = 0,
  } = params

  const localRect = calcLocalRect(x, y, width, height)
  const roatePos = calcRoatePos(x, y, width, height)

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
    fontSize,
    fontFamily,
    textColor: { startColor: fill },
    fillColor: { startColor: fill },
    borderColor: { startColor: 'rgba(255,255,255,0)' },
    borderWidth: 0,
    textAlign,
    textBaseline,
    bold,
    italic,
    underline,
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

  return {
    id: generateId(),
    ...getBaseFields('Line', layer),
    name: name || '直线',
    width,
    height,
    _originInfo: { width, height },
    localRect,
    roatePos,
    x1, y1, x2, y2,
    borderColor: { startColor: stroke },
    fillColor: { startColor: 'rgba(255,255,255,0)' },
    textColor: { startColor: stroke },
    borderWidth: strokeWidth,
    lineStyle,
    zIndex,
  }
}

export interface PolygonParams {
  points: Array<{ x: number; y: number }>
  fill?: string
  stroke?: string
  borderWidth?: number
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
    fillColor: { startColor: fill },
    borderColor: { startColor: stroke },
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
    fillColor: { startColor: fill },
    borderColor: { startColor: stroke },
    textColor: { startColor: fill },
    borderWidth,
    zIndex,
  }
}

// ============================================================
// 统一 Builder 入口
// ============================================================

/** 根据类型名和参数字典生成图元 JSON */
export function buildDisplayElement(
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

  // zIndex 重排
  const elements = elementsData.map((el, i) => ({
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