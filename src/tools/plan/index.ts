/**
 * Plan 生成计划工具：declare_generation_plan
 */

import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import { DECLARE_DISPLAY_GENERATION_PLAN, DECLARE_SYMBOL_GENERATION_PLAN } from './definitions'
import { handleDeclarePlan } from './handler'

export * from './generation-plan'

export const PLAN_TOOLS: ToolModule[] = [
  defineTool(DECLARE_DISPLAY_GENERATION_PLAN, handleDeclarePlan, { category: 'plan', phases: ['plan'], core: true }),
  defineTool(DECLARE_SYMBOL_GENERATION_PLAN, handleDeclarePlan, { category: 'plan', phases: ['plan'], core: true }),
]
