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
} from './display-elements'
import { renderLayout, type LayoutNode } from './layout-engine'

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
    render: ({ x, y, w, h }) => [
      buildText({
        text: row.label,
        x, y, width: w, height: h,
        fontSize,
        fill: labelColor,
        textAlign: 'left',
        textBaseline: 'middle',
        name: row.label,
      }),
    ],
  })

  children.push({
    type: 'box',
    width: valueWidth,
    height: textH,
    render: ({ x, y, w, h }) => [
      buildText({
        text: row.value,
        x, y, width: w, height: h,
        fontSize,
        fill: valueColor,
        bold: true,
        textAlign: 'right',
        textBaseline: 'middle',
        name: `${row.label}值`,
      }),
    ],
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

  const titleNode: LayoutNode = {
    type: 'box',
    height: titleH,
    render: ({ x: tx, y: ty, w, h }) => [
      buildText({
        text: title,
        x: tx, y: ty, width: w, height: h,
        fontSize: titleFontSize,
        fill: titleColor,
        bold: true,
        textAlign: 'left',
        textBaseline: 'middle',
        name: `${title}标题`,
      }),
    ],
  }

  const rowNodes = rows.map(r =>
    metricRowNode(r, { rowHeight, valueWidth, fontSize, labelColor, valueColor }),
  )

  const panel: LayoutNode = {
    type: 'vstack',
    width,
    height,
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
