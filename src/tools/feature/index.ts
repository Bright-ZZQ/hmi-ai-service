/**
 * Feature 动态特性 / 事件 / 脚本类工具
 *
 * add_feature_*（display + symbol）、add_event_definition、set_display_script、set_pipe_script、set_symbol_attr_function。
 * 脚本类工具保持 category 'feature'，与动态特性同属特性阶段。
 */

import type { SkillRegistryEntry } from '../../types'
import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import type { ToolHandler } from '../core/context'
import { isDynamicFeatureTool } from './dynamic-feature-builders'
import {
  ADD_EVENT_DEFINITION,
  ADD_FEATURE_BLINK,
  ADD_FEATURE_CHANGE_COLOR,
  ADD_FEATURE_DASH_FLOW,
  ADD_FEATURE_FILL,
  ADD_FEATURE_MOVE,
  ADD_FEATURE_MULTISTATE_COLOR,
  ADD_FEATURE_MULTISTATE_TEXT,
  ADD_FEATURE_NUM_DISPLAY,
  ADD_FEATURE_OPEN_PAGE,
  ADD_FEATURE_OPERATION_ENABLE,
  ADD_FEATURE_RESET,
  ADD_FEATURE_ROTATE,
  ADD_FEATURE_SCALE,
  ADD_FEATURE_TIP_SHOW,
  ADD_FEATURE_VISIBLE,
  ADD_FEATURE_WRITE_VALUE,
  SET_DISPLAY_SCRIPT,
  SET_PIPE_SCRIPT,
} from './definitions.display'
import {
  ADD_FEATURE_BLINK_SYMBOL,
  ADD_FEATURE_CHANGE_COLOR_SYMBOL,
  ADD_FEATURE_DASH_FLOW_SYMBOL,
  ADD_FEATURE_FILL_SYMBOL,
  ADD_FEATURE_MOVE_SYMBOL,
  ADD_FEATURE_MULTISTATE_COLOR_SYMBOL,
  ADD_FEATURE_MULTISTATE_TEXT_SYMBOL,
  ADD_FEATURE_NUM_DISPLAY_SYMBOL,
  ADD_FEATURE_OPEN_PAGE_SYMBOL,
  ADD_FEATURE_OPERATION_ENABLE_SYMBOL,
  ADD_FEATURE_RESET_SYMBOL,
  ADD_FEATURE_ROTATE_SYMBOL,
  ADD_FEATURE_SCALE_SYMBOL,
  ADD_FEATURE_TIP_SHOW_SYMBOL,
  ADD_FEATURE_VISIBLE_SYMBOL,
  ADD_FEATURE_WRITE_VALUE_SYMBOL,
  SET_SYMBOL_ATTR_FUNCTION,
} from './definitions.symbol'
import { handleAddEventDefinition, handleDynamicFeature, handleInteractiveFeature } from './handlers'
import { handleSetDisplayScript, handleSetPipeScript, handleSetSymbolAttrFunction } from './script-handlers'

export { DISPLAY_EVENT_KEY } from './handlers'

const FEATURE_PHASES = ['feature'] as const

function feature(entry: SkillRegistryEntry, keywords: string[], handler?: ToolHandler): ToolModule {
  const name = entry.toolDef.function.name
  const resolved = handler ?? (isDynamicFeatureTool(name) ? handleDynamicFeature : handleInteractiveFeature)
  return defineTool(entry, resolved, { category: 'feature', phases: [...FEATURE_PHASES], keywords })
}

const KW_VISIBLE = ['显隐', '显示', '隐藏', '可见']
const KW_WRITE_VALUE = ['写值', '下发', '输入', '设定']
const KW_CHANGE_COLOR = ['变色', '换色', '颜色变化']
const KW_BLINK = ['闪烁', '闪动', '报警闪']
const KW_MOVE = ['移动', '平移', '运动']
const KW_OPEN_PAGE = ['打开画面', '跳转', '弹窗', '链接']
const KW_ROTATE = ['旋转', '转动', '自转']
const KW_NUM_DISPLAY = ['数值显示', '实时值', '显示数值', '测点值', '单位', '小数位', '格式化']
const KW_SCALE = ['缩放', '放大', '缩小', '比例缩放']
const KW_FILL = ['填充动态', '填充特性', '液位', '进度条', '水位', '充满']
const KW_DASH_FLOW = ['流动', '流向', '粒子', '流体']
const KW_OPERATION_ENABLE = ['操作使能', '使能', '可操作', '不可操作', '禁用操作']
const KW_MULTISTATE_TEXT = ['多状态文字', '多状态文本', '状态文字', '状态文本']
const KW_MULTISTATE_COLOR = ['多状态颜色', '多状态变色', '状态颜色', '状态变色']
const KW_TIP_SHOW = ['tip', 'Tip', 'TIP', '悬浮提示', '鼠标提示']
const KW_RESET = ['置位', '复位', '置0', '置1', '脉冲', '电平']

export const FEATURE_TOOLS: ToolModule[] = [
  // Display — 动态特性
  feature(ADD_FEATURE_VISIBLE, KW_VISIBLE),
  feature(ADD_FEATURE_WRITE_VALUE, KW_WRITE_VALUE),
  feature(ADD_FEATURE_CHANGE_COLOR, KW_CHANGE_COLOR),
  feature(ADD_FEATURE_BLINK, KW_BLINK),
  feature(ADD_FEATURE_MOVE, KW_MOVE),
  feature(ADD_FEATURE_OPEN_PAGE, KW_OPEN_PAGE),
  feature(ADD_FEATURE_ROTATE, KW_ROTATE),
  feature(ADD_FEATURE_NUM_DISPLAY, KW_NUM_DISPLAY),
  feature(ADD_FEATURE_SCALE, KW_SCALE),
  feature(ADD_FEATURE_FILL, KW_FILL),
  feature(ADD_FEATURE_DASH_FLOW, KW_DASH_FLOW),
  feature(ADD_FEATURE_OPERATION_ENABLE, KW_OPERATION_ENABLE),
  feature(ADD_FEATURE_MULTISTATE_TEXT, KW_MULTISTATE_TEXT),
  feature(ADD_FEATURE_MULTISTATE_COLOR, KW_MULTISTATE_COLOR),
  feature(ADD_FEATURE_TIP_SHOW, KW_TIP_SHOW),
  feature(ADD_FEATURE_RESET, KW_RESET),
  feature(ADD_EVENT_DEFINITION, ['脚本', '事件定义', '事件响应', '点击', '单击', '双击', '鼠标移入', '鼠标离开', '悬停', '定时', '每隔', '周期', '每天', '每周', '每月', '画面打开', '打开前', '打开后', '值变化', '数值变化', '条件执行', '弹窗', '弹出'], handleAddEventDefinition),

  // Display — 图纸脚本 / 管道脚本
  feature(SET_DISPLAY_SCRIPT, ['图纸脚本', '画面脚本', '页面脚本', '初始化脚本', '加载脚本', '画面初始化', '页面初始化'], handleSetDisplayScript),
  feature(SET_PIPE_SCRIPT, ['管道脚本', '管道流动', '流动组', '管道流向', '管道反向', '管道速度'], handleSetPipeScript),

  // Symbol — 动态 / 交互特性
  feature(ADD_FEATURE_ROTATE_SYMBOL, KW_ROTATE),
  feature(ADD_FEATURE_MOVE_SYMBOL, KW_MOVE),
  feature(ADD_FEATURE_BLINK_SYMBOL, KW_BLINK),
  feature(ADD_FEATURE_CHANGE_COLOR_SYMBOL, KW_CHANGE_COLOR),
  feature(ADD_FEATURE_NUM_DISPLAY_SYMBOL, KW_NUM_DISPLAY),
  feature(ADD_FEATURE_VISIBLE_SYMBOL, KW_VISIBLE),
  feature(ADD_FEATURE_WRITE_VALUE_SYMBOL, KW_WRITE_VALUE),
  feature(ADD_FEATURE_OPEN_PAGE_SYMBOL, KW_OPEN_PAGE),
  feature(ADD_FEATURE_SCALE_SYMBOL, KW_SCALE),
  feature(ADD_FEATURE_FILL_SYMBOL, KW_FILL),
  feature(ADD_FEATURE_DASH_FLOW_SYMBOL, KW_DASH_FLOW),
  feature(ADD_FEATURE_OPERATION_ENABLE_SYMBOL, KW_OPERATION_ENABLE),
  feature(ADD_FEATURE_MULTISTATE_TEXT_SYMBOL, KW_MULTISTATE_TEXT),
  feature(ADD_FEATURE_MULTISTATE_COLOR_SYMBOL, KW_MULTISTATE_COLOR),
  feature(ADD_FEATURE_TIP_SHOW_SYMBOL, KW_TIP_SHOW),
  feature(ADD_FEATURE_RESET_SYMBOL, KW_RESET),
  feature(SET_SYMBOL_ATTR_FUNCTION, ['脚本', '函数', '函数绑定', '属性绑定', '数据绑定', '绑定函数', '阈值', '超过', '高于', '低于', '根据数值'], handleSetSymbolAttrFunction),
]
