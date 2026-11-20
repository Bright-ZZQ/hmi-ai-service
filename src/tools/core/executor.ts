import { getToolModules, lintRegistry } from './registry'
import type { SessionState, ToolHandler } from './context'
import type { AgentStep, SSEEvent } from '../../types'

export { createSession, getCanvasFromJson, getElementsFromJson, isPlainObject } from './session'
export type { SessionState } from './session'

/**
 * 工具执行分发表：工具名 → handler，由各 ToolModule 自带的 handler 汇总而成。
 * 由 lintRegistry 保证与注册表一一对应，杜绝定义与执行漂移。
 */
const TOOL_HANDLERS: Record<string, ToolHandler> = {}
for (const module of getToolModules()) {
  const toolName = module.definition.function.name
  if (!TOOL_HANDLERS[toolName]) TOOL_HANDLERS[toolName] = module.handler
}

// 启动自检：确保工具定义、分类元数据与执行 handler 三者一致（定义即执行）
const REGISTRY_WIRING_ERRORS = lintRegistry(Object.keys(TOOL_HANDLERS))
if (REGISTRY_WIRING_ERRORS.length > 0) {
  throw new Error(`[tool-registry] 工具接线校验失败:\n- ${REGISTRY_WIRING_ERRORS.join('\n- ')}`)
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
