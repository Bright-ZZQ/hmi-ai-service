import { buildDisplayElement, buildSymbolElement, buildMetricPanel, buildEquipment, buildChartPanel, isBackgroundElement } from '../../element-builders'
import type { MetricPanelParams, EquipmentParams, ChartPanelParams } from '../../element-builders'
import { readPivotPoint } from '../../rotate-pivot'
import type { SessionState, ToolExecContext } from '../../tool-context'
import { isPlainObject } from '../session'
import type { AgentStep, SSEEvent } from '../../../types'

// ============================================================
// 工具执行
// ============================================================

/** 映射 create_display_xxx 工具名到 element type */
export const TOOL_TO_ELEMENT_TYPE: Record<string, string> = {
  create_display_rect: 'Rectangle',
  create_display_ellipse: 'Ellipse',
  create_display_text: 'Text',
  create_display_line: 'Line',
  create_display_polygon: 'Polygon',
  create_display_picture: 'Picture',
  create_display_pie: 'Pie',
  create_display_arc: 'Arc',
  create_display_chord: 'Chord',
  create_display_curve: 'Curve',
  create_display_pipe: 'Pipeline',
  create_display_polyline: 'Polyline',
  create_display_regular_polygon: 'RegularPolygon',
}

/** 映射 create_symbol_xxx 工具名到 symbol comp 类型 */
export const TOOL_TO_SYMBOL_TYPE: Record<string, string> = {
  create_symbol_rect: 'Rect',
  create_symbol_ellipse: 'Ellipse',
  create_symbol_text: 'Text',
  create_symbol_line: 'Line',
  create_symbol_polygon: 'Polygon',
  create_symbol_polyline: 'Curve',
  create_symbol_arc: 'Arc',
  create_symbol_chord: 'Chord',
  create_symbol_pie: 'Pie',
}

// ============================================================
// 工具执行分发（P1：注册表驱动的 name → handler 查表）
// ============================================================

// 只有整批都是全画布底板时才下沉，避免复合组件的混合批次被误判
function emitElements(
  session: SessionState,
  emit: (event: SSEEvent) => void,
  elements: Record<string, unknown>[],
): void {
  if (elements.length === 0) return
  emit({
    type: 'element',
    elements,
    isBackground: session.editorType === 'display'
      && elements.every(el => isBackgroundElement(el, session.canvas.pageWidth, session.canvas.pageHeight)),
  })
}

function getInvalidSizeError(element: Record<string, unknown>): string | undefined {
  if (element.type === 'Group') return undefined
  const isValid = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0
  if (!isValid(element.width) || !isValid(element.height)) {
    return `width/height 必须是大于 0 的有限数字（当前 width=${String(element.width)}, height=${String(element.height)}）`
  }
  const rect = element.localRect
  if (Array.isArray(rect) && rect.some(p => !isPlainObject(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    return 'x/y 必须是有限数字'
  }
  return undefined
}

// 图元创建工具（create_display_*）
export function handleCreateDisplayElement({ name, args, session, onStep, emit }: ToolExecContext): string {
  const elementType = TOOL_TO_ELEMENT_TYPE[name]
  const pivot = readPivotPoint(args.pivotX, args.pivotY)
  if (pivot && 'error' in pivot) {
    return JSON.stringify({ success: false, error: `${name} 参数不合法：${pivot.error}。该图元未创建，请修正后重新调用` })
  }
  const element = buildDisplayElement(elementType, args)
  // 缺少/非法的尺寸参数会生成残缺图元，直接拒绝并让模型重新创建，避免污染工作区
  const sizeError = getInvalidSizeError(element)
  if (sizeError) {
    return JSON.stringify({
      success: false,
      error: `${name} 参数不合法：${sizeError}。该图元未创建，请补全 x/y/width/height 等必填参数后重新调用`,
    })
  }
  // 与其他部件绕同一圆心转动（扇叶绕轮毂）：旋转中心直接落在公共圆心
  if (pivot) element.roatePos = pivot
  session.workingElements.push(element)

  const step: AgentStep = {
    type: 'tool_call',
    content: `已创建 ${elementType} 图元: ${element.name || '(自动命名)'}`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emitElements(session, emit, [element])

  return JSON.stringify(element)
}

// 图符图元创建工具（create_symbol_*）
export function handleCreateSymbolElement({ name, args, session, onStep, emit }: ToolExecContext): string {
  const symbolType = TOOL_TO_SYMBOL_TYPE[name]
  const element = buildSymbolElement(symbolType, args)
  session.workingElements.push(element)
  const attrs = isPlainObject(element.attrs) ? element.attrs : {}

  const step: AgentStep = {
    type: 'tool_call',
    content: `已创建 ${symbolType} 图符图元: ${attrs.name || '(自动命名)'}`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emitElements(session, emit, [element])

  return JSON.stringify(element)
}

// 复合组件：指标面板
export function handleMetricPanel({ name, args, session, onStep, emit }: ToolExecContext): string {
  let elements: Record<string, unknown>[]
  try {
    elements = buildMetricPanel(args as unknown as MetricPanelParams)
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'create_metric_panel 失败',
    })
  }
  session.workingElements.push(...elements)

  const step: AgentStep = {
    type: 'tool_call',
    content: `已创建指标面板 "${args.title || ''}"，含 ${elements.length} 个图元`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emitElements(session, emit, elements)

  return JSON.stringify({
    success: true,
    count: elements.length,
    targets: elements.map(element => ({
      id: element.id,
      name: element.name,
    })),
  })
}

// 复合组件：图表卡片
export function handleChartPanel({ name, args, session, onStep, emit }: ToolExecContext): string {
  let elements: Record<string, unknown>[]
  try {
    elements = buildChartPanel(args as unknown as ChartPanelParams)
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'create_chart_panel 失败',
    })
  }
  session.workingElements.push(...elements)

  const step: AgentStep = {
    type: 'tool_call',
    content: `已创建图表卡片 "${args.title || ''}"（${args.kind || ''}），含 ${elements.length} 个图元`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emitElements(session, emit, elements)

  return JSON.stringify({
    success: true,
    count: elements.length,
    targets: elements.map(element => ({
      id: element.id,
      name: element.name,
    })),
  })
}

// 复合组件：工艺设备
export function handleEquipment({ name, args, session, onStep, emit }: ToolExecContext): string {
  let elements: Record<string, unknown>[]
  try {
    elements = buildEquipment(args as unknown as EquipmentParams)
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'create_equipment 失败',
    })
  }
  session.workingElements.push(...elements)

  const step: AgentStep = {
    type: 'tool_call',
    content: `已创建设备 "${args.kind || ''}"，含 ${elements.length} 个图元`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emitElements(session, emit, elements)

  return JSON.stringify({
    success: true,
    count: elements.length,
    targets: elements.map(element => ({
      id: element.id,
      name: element.name,
    })),
  })
}
