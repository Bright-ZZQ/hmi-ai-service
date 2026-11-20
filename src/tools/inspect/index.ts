/**
 * Inspect 检查与调试工具：lint_display / list_features / remove_feature / update_feature /
 * get_element_detail / check_feature_conditions / test_script
 */

import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import { createInspectSkills } from './definitions'
import { LINT_DISPLAY } from './definitions.lint'
import { INSPECT_TOOL_HANDLERS } from './inspect-tools'

const INSPECT_PHASES = ['edit', 'assemble'] as const

const INSPECT_KEYWORDS: Record<string, string[]> = {
  lint_display: ['检查', '校验', '重叠', '越界', '溢出', '对比度', '诊断', '排查', '看不清', '有问题', '审查'],
  list_features: ['查看特性', '特性列表', '有哪些特性', '已有特性', '已配置', '当前特性', '查看配置', '列出特性'],
  remove_feature: ['删除特性', '去掉特性', '移除特性', '取消特性', '删掉特性', '去掉闪烁', '取消闪烁', '移除事件', '删除事件'],
  update_feature: ['修改特性', '调整特性', '改特性', '修改参数', '改测点', '改条件', '修改条件', '调快', '调慢', '改成', '换成'],
  get_element_detail: ['详情', '详细', '具体内容', '属性值', '查看图元'],
  check_feature_conditions: ['检查条件', '条件有误', '条件检查', '校验条件', '特性检查', '条件是否'],
  test_script: ['试跑', '测试脚本', '调试', '脚本报错', '脚本有问题', '验证脚本', '运行脚本', '脚本测试', '试运行'],
}

function inspect(entry: typeof LINT_DISPLAY): ToolModule {
  const name = entry.toolDef.function.name
  return defineTool(entry, INSPECT_TOOL_HANDLERS[name], { category: 'inspect', phases: [...INSPECT_PHASES], keywords: INSPECT_KEYWORDS[name] })
}

export const INSPECT_TOOLS: ToolModule[] = [
  inspect(LINT_DISPLAY),
  ...createInspectSkills('display').map(inspect),
  ...createInspectSkills('symbol').map(inspect),
]
