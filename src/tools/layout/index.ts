/**
 * Layout 排版工具：align_elements / distribute_elements / set_z_order / fit_to_canvas
 */

import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import { ALIGN_ELEMENTS, DISTRIBUTE_ELEMENTS, FIT_TO_CANVAS, SET_Z_ORDER } from './definitions'
import { LAYOUT_TOOL_HANDLERS } from './layout-tools'

const LAYOUT_PHASES = ['create', 'feature', 'edit'] as const

function layout(entry: typeof ALIGN_ELEMENTS, keywords: string[]): ToolModule {
  return defineTool(entry, LAYOUT_TOOL_HANDLERS[entry.toolDef.function.name], { category: 'layout', phases: [...LAYOUT_PHASES], keywords })
}

export const LAYOUT_TOOLS: ToolModule[] = [
  layout(ALIGN_ELEMENTS, ['对齐', '整齐', '齐平', '居中', '排齐', '排版']),
  layout(DISTRIBUTE_ELEMENTS, ['等距', '均匀', '平均分布', '间距', '分布', '排版', '整齐']),
  layout(SET_Z_ORDER, ['置顶', '置底', '置于顶层', '置于底层', '上移', '下移', '层级', '遮挡', '盖住', '被挡', '上层', '下层']),
  layout(FIT_TO_CANVAS, ['适应画布', '缩放到', '超出画布', '越界', '超出', '缩小', '放不下', '太大', '整体缩放']),
]
