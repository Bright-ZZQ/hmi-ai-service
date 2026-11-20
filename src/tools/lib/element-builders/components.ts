/**
 * 领域组件库 — 自洽、可复用的复合组件
 *
 * 建立在 layout-engine 之上，把"标签/数值/状态灯"、"设备图符"等常见结构封装为
 * 一次调用即产出**内部布局正确、绝不重叠**的图元组。
 *
 * 与逐个 create_display_* 的区别：调用方只给**语义数据**（标题、行数据、设备类型），
 * 坐标由布局引擎确定性计算。
 */

import {
  buildRect,
  buildEllipse,
  buildText,
  buildLine,
  buildPolygon,
  buildPie,
  buildPolyline,
} from './display-elements'
import { renderLayout, type LayoutNode, type Rect } from './layout-engine'

// ============================================================
// 文本度量与自适应 — 保证文字永不超出所在容器
// ============================================================

/** 单字符相对字号的宽度系数（近似，偏保守以避免低估） */
function charWidthRatio(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  // CJK 统一表意文字 / 全角标点 / 假名 / 韩文：按 1 个字宽计
  if (
    (code >= 0x1100 && code <= 0x115f)
    || (code >= 0x2e80 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe30 && code <= 0xfe6f)
    || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6)
  ) return 1
  if (ch === ' ') return 0.3
  if ('iljI.,:;\'"|!()[]'.includes(ch)) return 0.32
  if ('mwMW%@'.includes(ch)) return 0.85
  return 0.58
}

/** 估算文本渲染宽度(px) */
export function measureTextWidth(text: string, fontSize: number, bold = false): number {
  let units = 0
  for (const ch of text) units += charWidthRatio(ch)
  return units * fontSize * (bold ? 1.06 : 1)
}

export interface FittedText {
  text: string
  fontSize: number
}

/**
 * 让文本适配给定宽度：先在 [minFontSize, fontSize] 内缩小字号，
 * 仍放不下则按字符截断并追加省略号。返回值保证渲染宽度 ≤ maxWidth。
 */
export function fitText(
  text: string,
  maxWidth: number,
  fontSize: number,
  options: { bold?: boolean; minFontSize?: number } = {},
): FittedText {
  const bold = options.bold ?? false
  const minFontSize = options.minFontSize ?? Math.max(Math.round(fontSize * 0.72), 9)
  const limit = Math.max(maxWidth, 1)

  let size = fontSize
  while (size > minFontSize && measureTextWidth(text, size, bold) > limit) {
    size -= 1
  }
  if (measureTextWidth(text, size, bold) <= limit) return { text, fontSize: size }

  const ellipsis = '…'
  const chars = [...text]
  let kept = chars.length
  while (kept > 0 && measureTextWidth(chars.slice(0, kept).join('') + ellipsis, size, bold) > limit) {
    kept--
  }
  if (kept <= 0) return { text: '', fontSize: size }
  return { text: chars.slice(0, kept).join('') + ellipsis, fontSize: size }
}

// ============================================================
// MetricPanel — 指标数据面板
// ============================================================

export type MetricStatus = 'normal' | 'warning' | 'alarm'

export interface MetricRow {
  /** 指标名称（左列） */
  label: string
  /** 指标数值（右列） */
  value: string
  /** 状态：控制左侧状态灯颜色；省略则不显示状态灯 */
  status?: MetricStatus
}

export interface MetricPanelParams {
  x: number
  y: number
  /** 面板宽度(px) */
  width: number
  /** 面板高度(px)；省略时按行数自适应 */
  height?: number
  /** 面板标题 */
  title: string
  /** 指标行 */
  rows: MetricRow[]
  titleColor?: string
  labelColor?: string
  valueColor?: string
  panelFill?: string
  panelStroke?: string
  /** 每行高度，默认 34 */
  rowHeight?: number
  /** 数值列宽度，默认 120 */
  valueWidth?: number
  /** 行字号，默认 13 */
  fontSize?: number
  /** 标题字号，默认 16 */
  titleFontSize?: number
}

const STATUS_DOT_COLOR: Record<MetricStatus, { fill: string; stroke: string }> = {
  normal: { fill: '#00dd44', stroke: '#00bb33' },
  warning: { fill: '#ffaa00', stroke: '#ff8800' },
  alarm: { fill: '#ff3333', stroke: '#ff0000' },
}

/** 构建一行 MetricRow → HStack[ 状态灯?, 标签(grow), 数值 ] */
function metricRowNode(
  row: MetricRow,
  opts: {
    rowHeight: number
    valueWidth: number
    fontSize: number
    labelColor: string
    valueColor: string
  },
): LayoutNode {
  const { rowHeight, valueWidth, fontSize, labelColor, valueColor } = opts
  const textH = Math.ceil(fontSize * 1.6)
  const children: LayoutNode[] = []

  if (row.status) {
    const dot = STATUS_DOT_COLOR[row.status]
    children.push({
      type: 'box',
      width: 14,
      height: 14,
      render: ({ x, y, w, h }) => [
        buildEllipse({
          x, y, width: w, height: h,
          fill: dot.fill,
          stroke: dot.stroke,
          borderWidth: 1.5,
          name: `${row.label}状态灯`,
        }),
      ],
    })
  }

  children.push({
    type: 'box',
    grow: 1,
    height: textH,
    render: ({ x, y, w, h }) => {
      const fitted = fitText(row.label, w, fontSize)
      return [
        buildText({
          text: fitted.text,
          x, y, width: w, height: h,
          fontSize: fitted.fontSize,
          fill: labelColor,
          textAlign: 'left',
          textBaseline: 'middle',
          name: row.label,
        }),
      ]
    },
  })

  children.push({
    type: 'box',
    width: valueWidth,
    height: textH,
    render: ({ x, y, w, h }) => {
      const fitted = fitText(row.value, w, fontSize, { bold: true })
      return [
        buildText({
          text: fitted.text,
          x, y, width: w, height: h,
          fontSize: fitted.fontSize,
          fill: valueColor,
          bold: true,
          textAlign: 'right',
          textBaseline: 'middle',
          name: `${row.label}值`,
        }),
      ]
    },
  })

  return {
    type: 'hstack',
    height: rowHeight,
    gap: 8,
    align: 'center',
    children,
  }
}

/**
 * 构建指标数据面板，返回扁平图元数组（背景在前，内容在后，保证层级正确）。
 */
export function buildMetricPanel(params: MetricPanelParams): Record<string, unknown>[] {
  const {
    x, y, width, height,
    title,
    rows,
    titleColor = '#00d4ff',
    labelColor = '#aabbcc',
    valueColor = '#00ff88',
    panelFill = '#101830',
    panelStroke = '#1e3a50',
    rowHeight = 34,
    valueWidth = 120,
    fontSize = 13,
    titleFontSize = 16,
  } = params

  const titleH = Math.ceil(titleFontSize * 1.6)
  const contentWidth = Math.max(width - 32, 1)
  // 数值列宽度：按实际数值文本自适应，且不得挤掉标签列（最多占内容区一半）
  const measuredValueWidth = rows.reduce(
    (max, row) => Math.max(max, measureTextWidth(row.value, fontSize, true) + 4),
    0,
  )
  const safeValueWidth = Math.max(
    Math.min(Math.max(valueWidth, measuredValueWidth), contentWidth * 0.5),
    40,
  )

  const titleNode: LayoutNode = {
    type: 'box',
    height: titleH,
    render: ({ x: tx, y: ty, w, h }) => {
      const fitted = fitText(title, w, titleFontSize, { bold: true })
      return [
        buildText({
          text: fitted.text,
          x: tx, y: ty, width: w, height: h,
          fontSize: fitted.fontSize,
          fill: titleColor,
          bold: true,
          textAlign: 'left',
          textBaseline: 'middle',
          name: `${title}标题`,
        }),
      ]
    },
  }

  const rowNodes = rows.map(r =>
    metricRowNode(r, { rowHeight, valueWidth: safeValueWidth, fontSize, labelColor, valueColor }),
  )

  // 高度守卫：面板高度不足以容纳标题 + 所有行时自动撑高，避免内容溢出面板
  const requiredHeight = 16 * 2 + titleH + rowHeight * rows.length + 8 * rows.length
  const safeHeight = height === undefined ? undefined : Math.max(height, requiredHeight)

  const panel: LayoutNode = {
    type: 'vstack',
    width,
    height: safeHeight,
    padding: 16,
    gap: 8,
    align: 'stretch',
    render: ({ x: px, y: py, w, h }) => [
      buildRect({
        x: px, y: py, width: w, height: h,
        fill: panelFill,
        stroke: panelStroke,
        borderWidth: 1,
        cornerRadius: 8,
        name: `${title}面板`,
      }),
    ],
    children: [titleNode, ...rowNodes],
  }

  return renderLayout(panel, x, y)
}

// ============================================================
// Equipment — 设备图符模板库
// ============================================================

export type EquipmentKind = 'tank' | 'tower' | 'furnace' | 'column'

export interface EquipmentParams {
  kind: EquipmentKind
  x: number
  y: number
  width: number
  height: number
  /** 主体填充色 */
  fill?: string
  /** 主体边框色 */
  stroke?: string
  /** 名称前缀 */
  name?: string
}

interface EquipmentPalette {
  body: string
  border: string
  accent: string
}

function palette(fill?: string, stroke?: string): EquipmentPalette {
  return {
    body: fill ?? '#1a2035',
    border: stroke ?? '#3a6080',
    accent: stroke ?? '#4a7a9a',
  }
}

/** 储罐：圆顶 + 罐身 + 圆底 */
function buildTank(p: EquipmentParams): Record<string, unknown>[] {
  const { x, y, width, height, name = '储罐' } = p
  const pal = palette(p.fill, p.stroke)
  const domeH = Math.max(Math.round(height * 0.14), 12)

  return [
    // 罐身
    buildRect({
      x, y: y + domeH / 2, width, height: height - domeH,
      fill: pal.body, stroke: pal.border, borderWidth: 2, cornerRadius: 6,
      name: `${name}罐身`,
    }),
    // 顶盖（椭圆）
    buildEllipse({
      x, y, width, height: domeH,
      fill: pal.accent, stroke: pal.border, borderWidth: 2,
      name: `${name}顶`,
    }),
    // 底盖（椭圆）
    buildEllipse({
      x, y: y + height - domeH, width, height: domeH,
      fill: pal.accent, stroke: pal.border, borderWidth: 2,
      name: `${name}底`,
    }),
  ]
}

/** 塔器（吸收塔/转化塔）：圆顶封头 + 塔身 + 内部填料层 + 圆底封头 */
function buildTower(p: EquipmentParams): Record<string, unknown>[] {
  const { x, y, width, height, name = '塔器' } = p
  const pal = palette(p.fill, p.stroke)
  const capH = Math.max(Math.round(height * 0.08), 10)
  const bodyY = y + capH
  const bodyH = height - capH * 2

  const els: Record<string, unknown>[] = [
    // 塔身
    buildRect({
      x, y: bodyY, width, height: bodyH,
      fill: pal.body, stroke: pal.border, borderWidth: 2, cornerRadius: 6,
      name: `${name}塔身`,
    }),
    // 顶封头
    buildRect({
      x: x - width * 0.06, y, width: width * 1.12, height: capH * 2,
      fill: pal.accent, stroke: pal.border, borderWidth: 2, cornerRadius: capH,
      name: `${name}顶封头`,
    }),
    // 底封头
    buildRect({
      x: x - width * 0.04, y: y + height - capH * 2, width: width * 1.08, height: capH * 2,
      fill: pal.accent, stroke: pal.border, borderWidth: 2, cornerRadius: capH,
      name: `${name}底封头`,
    }),
  ]

  // 内部填料层（3 条横线）
  const layers = 3
  for (let i = 1; i <= layers; i++) {
    const ly = bodyY + (bodyH * i) / (layers + 1)
    els.push(
      buildLine({
        x1: x + width * 0.1, y1: ly, x2: x + width * 0.9, y2: ly,
        stroke: pal.accent, strokeWidth: 2,
        name: `${name}填料层${i}`,
      }),
    )
  }

  return els
}

/** 精馏/催化塔柱：细长塔身 + 多层塔板 */
function buildColumn(p: EquipmentParams): Record<string, unknown>[] {
  const { x, y, width, height, name = '塔柱' } = p
  const pal = palette(p.fill, p.stroke)
  const capH = Math.min(
    Math.max(Math.round(width * 0.4), 10),
    Math.max(Math.floor(height * 0.2), 1),
  )

  const els: Record<string, unknown>[] = [
    buildRect({
      x, y: y + capH, width, height: height - capH * 2,
      fill: pal.body, stroke: pal.border, borderWidth: 2, cornerRadius: 4,
      name: `${name}塔身`,
    }),
    buildEllipse({
      x, y, width, height: capH * 2,
      fill: pal.accent, stroke: pal.border, borderWidth: 2,
      name: `${name}顶`,
    }),
    buildEllipse({
      x, y: y + height - capH * 2, width, height: capH * 2,
      fill: pal.accent, stroke: pal.border, borderWidth: 2,
      name: `${name}底`,
    }),
  ]

  const trays = 5
  const bodyY = y + capH
  const bodyH = height - capH * 2
  for (let i = 1; i <= trays; i++) {
    const ly = bodyY + (bodyH * i) / (trays + 1)
    els.push(
      buildLine({
        x1: x, y1: ly, x2: x + width, y2: ly,
        stroke: pal.accent, strokeWidth: 1.5,
        name: `${name}塔板${i}`,
      }),
    )
  }

  return els
}

/** 焚烧炉/沸腾炉：炉体 + 锥底 + 火焰 */
function buildFurnace(p: EquipmentParams): Record<string, unknown>[] {
  const { x, y, width, height, name = '炉' } = p
  const pal = palette(p.fill, p.stroke)
  const coneH = Math.max(Math.round(height * 0.22), 20)
  const bodyH = height - coneH

  return [
    // 炉体
    buildRect({
      x, y, width, height: bodyH,
      fill: pal.body, stroke: pal.border, borderWidth: 2, cornerRadius: 8,
      name: `${name}体`,
    }),
    // 锥底
    buildPolygon({
      points: [
        { x: x + width * 0.06, y: y + bodyH },
        { x: x + width * 0.94, y: y + bodyH },
        { x: x + width * 0.68, y: y + height },
        { x: x + width * 0.32, y: y + height },
      ],
      fill: pal.body, stroke: pal.border, borderWidth: 2,
      name: `${name}锥底`,
    }),
    // 火焰（内部椭圆）
    buildEllipse({
      x: x + width * 0.32, y: y + bodyH * 0.4, width: width * 0.36, height: bodyH * 0.45,
      fill: '#ff6600', stroke: '#ffaa00', borderWidth: 2,
      name: `${name}火焰`,
    }),
  ]
}

/**
 * 构建设备图符，返回扁平图元数组（比例固定、形状可辨识）。
 */
export function buildEquipment(params: EquipmentParams): Record<string, unknown>[] {
  switch (params.kind) {
    case 'tank':
      return buildTank(params)
    case 'tower':
      return buildTower(params)
    case 'column':
      return buildColumn(params)
    case 'furnace':
      return buildFurnace(params)
    default:
      throw new Error(`不支持的设备类型: ${(params as EquipmentParams).kind}`)
  }
}

// ============================================================
// ChartPanel — 图表面板（柱状图 / 折线图 / 饼图）
// ============================================================

export type ChartKind = 'bar' | 'line' | 'pie'

export interface ChartPoint {
  /** 分类名 / 时间点标签 */
  label: string
  /** 数值（非负） */
  value: number
  /** 该项颜色，省略则取默认调色板 */
  color?: string
}

export interface ChartPanelParams {
  x: number
  y: number
  /** 面板宽度(px) */
  width: number
  /** 面板高度(px) */
  height: number
  /** 图表类型 */
  kind: ChartKind
  /** 面板标题 */
  title: string
  /** 数据点 */
  data: ChartPoint[]
  /** 数值单位（显示在标题右侧） */
  unit?: string
  titleColor?: string
  labelColor?: string
  axisColor?: string
  panelFill?: string
  panelStroke?: string
  /** 自定义调色板 */
  palette?: string[]
  /** 柱状/折线的纵轴最大值，省略则按数据自适应 */
  maxValue?: number
}

const DEFAULT_PALETTE = [
  '#00d4ff', '#00ff88', '#ffaa00', '#ff5577',
  '#a97bff', '#22ddc0', '#ff8844', '#5599ff',
]

const CHART_TITLE_FONT = 16
const CHART_LABEL_FONT = 11

function pickColor(point: ChartPoint, index: number, palette: string[]): string {
  return point.color ?? palette[index % palette.length]
}

/** 格式化数值：整数直出，小数保留 1 位 */
function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** 柱状图：绘制在给定绘图区内，所有元素严格落在 rect 内 */
function renderBarChart(
  rect: Rect,
  data: ChartPoint[],
  palette: string[],
  labelColor: string,
  axisColor: string,
  maxValue: number,
  title: string,
): Record<string, unknown>[] {
  const els: Record<string, unknown>[] = []
  const labelH = CHART_LABEL_FONT * 1.6
  const valueH = CHART_LABEL_FONT * 1.6
  const plotY = rect.y + valueH
  const plotH = Math.max(rect.h - labelH - valueH, 1)
  const baseY = plotY + plotH

  // 基线
  els.push(buildLine({
    x1: rect.x, y1: baseY, x2: rect.x + rect.w, y2: baseY,
    stroke: axisColor, strokeWidth: 1, name: `${title}基线`,
  }))

  const n = data.length
  const slot = rect.w / n
  const barW = Math.max(Math.min(slot * 0.6, 60), 4)

  data.forEach((point, i) => {
    const color = pickColor(point, i, palette)
    const ratio = maxValue > 0 ? Math.min(Math.max(point.value, 0) / maxValue, 1) : 0
    const barH = Math.max(ratio * plotH, 1)
    const bx = rect.x + slot * i + (slot - barW) / 2
    const by = baseY - barH

    els.push(buildRect({
      x: bx, y: by, width: barW, height: barH,
      fill: color, stroke: color, borderWidth: 0,
      fillGradient: 'bottom linear', fillEndColor: color,
      cornerRadius: Math.min(3, barW / 2),
      name: `${title}-${point.label}柱`,
    }))
    // 数值（柱顶上方，位于预留的 valueH 带内）
    const fittedValue = fitText(formatValue(point.value), slot, CHART_LABEL_FONT)
    els.push(buildText({
      text: fittedValue.text,
      x: rect.x + slot * i, y: Math.max(by - valueH, rect.y), width: slot, height: valueH,
      fontSize: fittedValue.fontSize, fill: color,
      textAlign: 'center', textBaseline: 'middle',
      name: `${title}-${point.label}值`,
    }))
    // 分类标签（基线下方）
    const fittedLabel = fitText(point.label, slot, CHART_LABEL_FONT)
    els.push(buildText({
      text: fittedLabel.text,
      x: rect.x + slot * i, y: baseY, width: slot, height: labelH,
      fontSize: fittedLabel.fontSize, fill: labelColor,
      textAlign: 'center', textBaseline: 'middle',
      name: `${title}-${point.label}标签`,
    }))
  })

  return els
}

/** 折线图：折线 + 数据点 + 分类标签，严格落在 rect 内 */
function renderLineChart(
  rect: Rect,
  data: ChartPoint[],
  palette: string[],
  labelColor: string,
  axisColor: string,
  maxValue: number,
  title: string,
): Record<string, unknown>[] {
  const els: Record<string, unknown>[] = []
  const labelH = CHART_LABEL_FONT * 1.6
  const dotR = 3
  const plotY = rect.y + dotR
  const plotH = Math.max(rect.h - labelH - dotR * 2, 1)
  const baseY = plotY + plotH
  const color = data[0]?.color ?? palette[0]

  // 网格线（3 条）
  for (let i = 1; i <= 3; i++) {
    const gy = plotY + (plotH * i) / 4
    els.push(buildLine({
      x1: rect.x, y1: gy, x2: rect.x + rect.w, y2: gy,
      stroke: axisColor, strokeWidth: 1, lineStyle: 'dashed',
      name: `${title}网格${i}`,
    }))
  }
  els.push(buildLine({
    x1: rect.x, y1: baseY, x2: rect.x + rect.w, y2: baseY,
    stroke: axisColor, strokeWidth: 1, name: `${title}基线`,
  }))

  const n = data.length
  const step = n > 1 ? (rect.w - dotR * 2) / (n - 1) : 0
  const points = data.map((point, i) => {
    const ratio = maxValue > 0 ? Math.min(Math.max(point.value, 0) / maxValue, 1) : 0
    return {
      x: rect.x + dotR + step * i,
      y: baseY - ratio * plotH,
    }
  })

  if (points.length > 1) {
    els.push(buildPolyline({
      polygon: points,
      stroke: color, borderWidth: 2,
      name: `${title}折线`,
    }))
  }

  points.forEach((p, i) => {
    els.push(buildEllipse({
      x: p.x - dotR, y: p.y - dotR, width: dotR * 2, height: dotR * 2,
      fill: color, stroke: color, borderWidth: 1,
      name: `${title}-${data[i].label}点`,
    }))
  })

  // 分类标签：点位过密时隔项显示，避免文字重叠
  const labelStep = Math.max(1, Math.ceil((n * 44) / Math.max(rect.w, 1)))
  data.forEach((point, i) => {
    if (i % labelStep !== 0) return
    const cx = points[i].x
    const lw = Math.min(step > 0 ? step : rect.w, 60)
    const lx = Math.min(Math.max(cx - lw / 2, rect.x), rect.x + rect.w - lw)
    const fitted = fitText(point.label, lw, CHART_LABEL_FONT)
    els.push(buildText({
      text: fitted.text,
      x: lx, y: baseY, width: lw, height: labelH,
      fontSize: fitted.fontSize, fill: labelColor,
      textAlign: 'center', textBaseline: 'middle',
      name: `${title}-${point.label}标签`,
    }))
  })

  return els
}

/** 饼图：左侧扇形 + 右侧图例，严格落在 rect 内 */
function renderPieChart(
  rect: Rect,
  data: ChartPoint[],
  palette: string[],
  labelColor: string,
  title: string,
): Record<string, unknown>[] {
  const els: Record<string, unknown>[] = []
  const total = data.reduce((a, p) => a + Math.max(p.value, 0), 0)
  const legendW = Math.min(Math.max(rect.w * 0.4, 90), rect.w - 40)
  const pieAreaW = rect.w - legendW
  const radius = Math.max(Math.min(pieAreaW, rect.h) / 2 - 4, 4)
  const cx = rect.x + pieAreaW / 2
  const cy = rect.y + rect.h / 2

  let angle = -90
  data.forEach((point, i) => {
    const share = total > 0 ? Math.max(point.value, 0) / total : 1 / data.length
    const sweep = share * 360
    const color = pickColor(point, i, palette)
    els.push(buildPie({
      cx, cy, radius,
      startAngle: angle,
      endAngle: angle + sweep,
      fill: color, stroke: '#0a1020', borderWidth: 1,
      name: `${title}-${point.label}扇形`,
    }))
    angle += sweep
  })

  // 图例：等分高度，超出面板高度时自动缩小行高
  const rowH = Math.min(20, rect.h / Math.max(data.length, 1))
  const legendX = rect.x + pieAreaW + 8
  const legendTop = rect.y + Math.max((rect.h - rowH * data.length) / 2, 0)
  const swatch = Math.min(10, rowH - 2)

  data.forEach((point, i) => {
    const ly = legendTop + rowH * i
    const color = pickColor(point, i, palette)
    const pct = total > 0 ? Math.round((Math.max(point.value, 0) / total) * 100) : 0
    els.push(buildRect({
      x: legendX, y: ly + (rowH - swatch) / 2, width: swatch, height: swatch,
      fill: color, stroke: color, borderWidth: 0, cornerRadius: 2,
      name: `${title}-${point.label}图例色块`,
    }))
    const legendTextX = legendX + swatch + 6
    const legendTextW = Math.max(rect.x + rect.w - legendTextX, 10)
    const fitted = fitText(`${point.label} ${pct}%`, legendTextW, CHART_LABEL_FONT)
    els.push(buildText({
      text: fitted.text,
      x: legendTextX,
      y: ly,
      width: legendTextW,
      height: rowH,
      fontSize: fitted.fontSize,
      fill: labelColor,
      textAlign: 'left', textBaseline: 'middle',
      name: `${title}-${point.label}图例`,
    }))
  })

  return els
}

/**
 * 构建图表面板（卡片背景 + 标题 + 图表），返回扁平图元数组。
 * 图表绘制区由布局引擎计算，所有内容严格限制在面板内部，不会越界。
 */
export function buildChartPanel(params: ChartPanelParams): Record<string, unknown>[] {
  const {
    x, y, width, height,
    kind,
    title,
    data,
    unit,
    titleColor = '#00d4ff',
    labelColor = '#aabbcc',
    axisColor = '#1e3a50',
    panelFill = '#101830',
    panelStroke = '#1e3a50',
    palette = DEFAULT_PALETTE,
    maxValue,
  } = params

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('create_chart_panel 需要至少 1 个数据点')
  }

  const dataMax = maxValue ?? Math.max(...data.map(p => Math.max(p.value, 0)), 0) * 1.15
  const titleH = Math.ceil(CHART_TITLE_FONT * 1.6)
  // 尺寸守卫：保证绘图区至少有可用空间，避免图表内容溢出卡片
  const safePanelW = Math.max(width, 200)
  const safePanelH = Math.max(height, titleH + 14 * 2 + 6 + 70)
  const titleText = unit ? `${title} (${unit})` : title

  const titleNode: LayoutNode = {
    type: 'box',
    height: titleH,
    render: ({ x: tx, y: ty, w, h }) => {
      const fitted = fitText(titleText, w, CHART_TITLE_FONT, { bold: true })
      return [
        buildText({
          text: fitted.text,
          x: tx, y: ty, width: w, height: h,
          fontSize: fitted.fontSize,
          fill: titleColor,
          bold: true,
          textAlign: 'left',
          textBaseline: 'middle',
          name: `${title}标题`,
        }),
      ]
    },
  }

  const plotNode: LayoutNode = {
    type: 'box',
    grow: 1,
    render: (rect) => {
      const safe: Rect = { ...rect, w: Math.max(rect.w, 1), h: Math.max(rect.h, 1) }
      switch (kind) {
        case 'bar':
          return renderBarChart(safe, data, palette, labelColor, axisColor, dataMax, title)
        case 'line':
          return renderLineChart(safe, data, palette, labelColor, axisColor, dataMax, title)
        case 'pie':
          return renderPieChart(safe, data, palette, labelColor, title)
        default:
          throw new Error(`不支持的图表类型: ${kind}`)
      }
    },
  }

  const panel: LayoutNode = {
    type: 'vstack',
    width: safePanelW,
    height: safePanelH,
    padding: 14,
    gap: 6,
    align: 'stretch',
    render: ({ x: px, y: py, w, h }) => [
      buildRect({
        x: px, y: py, width: w, height: h,
        fill: panelFill,
        stroke: panelStroke,
        borderWidth: 1,
        cornerRadius: 8,
        name: `${title}面板`,
      }),
    ],
    children: [titleNode, plotNode],
  }

  return renderLayout(panel, x, y)
}
