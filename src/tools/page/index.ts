/**
 * Page 图纸级设置工具：set_page_property / declare_page_params
 */

import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import { DECLARE_PAGE_PARAMS, SET_PAGE_PROPERTY } from './definitions'
import { PAGE_TOOL_HANDLERS } from './page-tools'

const PAGE_PHASES = ['create', 'feature', 'edit'] as const

export const PAGE_TOOLS: ToolModule[] = [
  defineTool(SET_PAGE_PROPERTY, PAGE_TOOL_HANDLERS.set_page_property, {
    category: 'page',
    phases: [...PAGE_PHASES],
    keywords: ['画布', '背景色', '刷新周期', '适应模式', '图纸属性', '页面属性', '画面大小', '分辨率', '尺寸', '图纸大小', '全屏'],
  }),
  defineTool(DECLARE_PAGE_PARAMS, PAGE_TOOL_HANDLERS.declare_page_params, {
    category: 'page',
    phases: [...PAGE_PHASES],
    keywords: ['页面参数', '画面参数', 'TP', 'tp', '入参', '图纸参数', '传参'],
  }),
]
