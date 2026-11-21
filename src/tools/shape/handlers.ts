import { applyStaticRotation, buildDisplayElement, buildSymbolElement } from '../lib/element-builders'
import { readPivotPoint } from '../feature/rotate-pivot'
import { emitElements } from '../core/context'
import type { ToolExecContext } from '../core/context'
import { isPlainObject } from '../core/session'
import type { AgentStep } from '../../types'

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
// 工具执行分发（注册表驱动的 name → handler 查表）
// ============================================================

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
  applyStaticRotation(element, args.rotation)
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
