/**
 * 扩展工具 handler 汇总：批量 / 排版 / 检查 / 页面级工具
 */

import { BATCH_TOOL_HANDLERS } from './batch-tools'
import { INSPECT_TOOL_HANDLERS } from './inspect-tools'
import { LAYOUT_TOOL_HANDLERS } from './layout-tools'
import { PAGE_TOOL_HANDLERS } from './page-tools'
import type { ToolHandler } from './tool-context'

export const EXTENDED_TOOL_HANDLERS: Record<string, ToolHandler> = {
  ...BATCH_TOOL_HANDLERS,
  ...LAYOUT_TOOL_HANDLERS,
  ...INSPECT_TOOL_HANDLERS,
  ...PAGE_TOOL_HANDLERS,
}
