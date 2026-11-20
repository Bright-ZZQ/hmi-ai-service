/**
 * tools 公共 API — agent 与 mcp 共用的工具层入口
 *
 * 依赖方向：agent → tools、mcp → tools；tools 不得反向引用 agent/、mcp/、routes/（scripts/check-deps.cjs 校验）。
 */

export {
  getAllSkills,
  getSkillByName,
  getSkillMeta,
  getToolModules,
  getToolsForType,
  isAssemblyTool,
  lintRegistry,
} from './core/registry'
export { executeToolCall, listToolNames } from './core/executor'
export { createSession, getCanvasFromJson, getElementsFromJson, isPlainObject } from './core/session'
export { validateSessionOutput } from './core/finalize'
export { briefOf, compactToolResult } from './core/result-compactor'
export { enrichModelPoints } from './lib/model-point-resolver'
export { formatErrors } from './lib/schema-validator'
export type { Rec, SessionState, ToolExecContext, ToolHandler } from './core/context'
export type { ToolModule } from './core/tool-module'
