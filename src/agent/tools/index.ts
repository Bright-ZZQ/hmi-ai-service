import { getAllSkills, lintRegistry } from '../skill-registry'
import { isDynamicFeatureTool, isInteractiveFeatureTool } from '../dynamic-feature-builders'
import { EXTENDED_TOOL_HANDLERS } from '../extended-tools'
import type { SessionState, ToolHandler } from '../tool-context'
import type { AgentStep, SSEEvent } from '../../types'
import { handleAssembleDisplay, handleAssembleSymbol } from './handlers/assemble'
import {
  TOOL_TO_ELEMENT_TYPE,
  TOOL_TO_SYMBOL_TYPE,
  handleChartPanel,
  handleCreateDisplayElement,
  handleCreateSymbolElement,
  handleEquipment,
  handleMetricPanel,
} from './handlers/create'
import { handleDeleteElement, handleFindElements, handleUpdateElement } from './handlers/edit'
import {
  handleAddEventDefinition,
  handleDynamicFeature,
  handleInteractiveFeature,
} from './handlers/features'
import { handleAskUser, handleDeclarePlan } from './handlers/plan'
import { handleSetDisplayScript, handleSetPipeScript, handleSetSymbolAttrFunction } from './handlers/script'

export { DISPLAY_EVENT_KEY } from './handlers/features'
export { validateSessionOutput } from './finalize'
export { createSession, getCanvasFromJson, getElementsFromJson, isPlainObject } from './session'
export type { SessionState } from './session'

/**
 * 工具执行分发表：工具名 → handler。
 * 基础图元 / 图符图元 / 动态特性按注册表自动接线，其余按名精确登记。
 * 由 lintRegistry 保证与 Skill 注册表一一对应，杜绝定义与执行漂移。
 */
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  declare_generation_plan: handleDeclarePlan,
  add_event_definition: handleAddEventDefinition,
  set_display_script: handleSetDisplayScript,
  set_pipe_script: handleSetPipeScript,
  set_symbol_attr_function: handleSetSymbolAttrFunction,
  find_elements: handleFindElements,
  ask_user: handleAskUser,
  create_metric_panel: handleMetricPanel,
  create_equipment: handleEquipment,
  create_chart_panel: handleChartPanel,
  update_element: handleUpdateElement,
  delete_element: handleDeleteElement,
  assemble_display: handleAssembleDisplay,
  assemble_symbol: handleAssembleSymbol,
  ...EXTENDED_TOOL_HANDLERS,
}

for (const skill of getAllSkills()) {
  const toolName = skill.toolDef.function.name
  if (TOOL_HANDLERS[toolName]) continue
  if (TOOL_TO_ELEMENT_TYPE[toolName]) TOOL_HANDLERS[toolName] = handleCreateDisplayElement
  else if (TOOL_TO_SYMBOL_TYPE[toolName]) TOOL_HANDLERS[toolName] = handleCreateSymbolElement
  else if (isDynamicFeatureTool(toolName)) TOOL_HANDLERS[toolName] = handleDynamicFeature
  else if (isInteractiveFeatureTool(toolName)) TOOL_HANDLERS[toolName] = handleInteractiveFeature
}

// 启动自检：确保工具定义、分类元数据与执行 handler 三者一致（定义即执行）
const REGISTRY_WIRING_ERRORS = lintRegistry(Object.keys(TOOL_HANDLERS))
if (REGISTRY_WIRING_ERRORS.length > 0) {
  throw new Error(`[skill-registry] 工具接线校验失败:\n- ${REGISTRY_WIRING_ERRORS.join('\n- ')}`)
}

export function listToolNames(): string[] {
  return Object.keys(TOOL_HANDLERS)
}

/**
 * 执行单个工具调用
 * @returns 工具执行结果字符串
 */
export function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  session: SessionState,
  onStep: (step: AgentStep) => void,
  emit: (event: SSEEvent) => void,
): string {
  const handler = TOOL_HANDLERS[name]
  if (!handler) return JSON.stringify({ error: `未知工具: ${name}` })
  try {
    return handler({ name, args, session, onStep, emit })
  } catch (error) {
    // 单个工具参数异常不应中断整轮生成，把错误回传给模型让其修正后重试
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[AgentService] tool ${name} failed: ${message}`)
    return JSON.stringify({ success: false, error: `${name} 执行失败: ${message}，请检查参数后重新调用` })
  }
}
