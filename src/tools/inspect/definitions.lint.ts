/**
 * Display 图纸组 — 布局检查工具（lint_display）
 *
 * 执行逻辑见 inspect-tools.ts / lint-display.ts。
 */

import type { SkillRegistryEntry } from '../../types'

export const LINT_DISPLAY: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'lint_display',
      description: `检查当前图纸的布局与交互问题（只读，不修改图元）：越出画布、实心图形部分重叠、文字溢出文本框、文字与底色对比度过低、同名图元、永久隐藏的图元、指向不存在/隐藏图元的事件。
返回问题列表（level=error/warning/info，含图元 id）。修改较多后、组装前调用一次，按结果用 update_element / align_elements / fit_to_canvas 等修正。`,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
}
