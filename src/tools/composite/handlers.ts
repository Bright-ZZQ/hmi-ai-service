import { buildMetricPanel, buildEquipment, buildChartPanel } from '../lib/element-builders'
import type { MetricPanelParams, EquipmentParams, ChartPanelParams } from '../lib/element-builders'
import { emitElements } from '../core/context'
import type { ToolExecContext } from '../core/context'
import type { AgentStep } from '../../types'

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
