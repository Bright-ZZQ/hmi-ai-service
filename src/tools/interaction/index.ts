/**
 * Interaction 交互类工具：ask_user（audience: 'agent'，仅 Agent 循环使用，不对 MCP 暴露）
 */

import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import { ASK_USER } from './definitions'
import { handleAskUser } from './handler'

export const INTERACTION_TOOLS: ToolModule[] = [
  defineTool(ASK_USER, handleAskUser, { category: 'edit', phases: ['edit'], audience: 'agent' }),
]
