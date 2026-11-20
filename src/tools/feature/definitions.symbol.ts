/**
 * Symbol 图符组 — 动态/交互特性工具
 *
 * 旋转 / 移动 / 闪烁 / 变色 / 数值显示 / 显隐 / 缩放 / 填充 / 流动 / 操作使能 / 多状态文字 / 多状态颜色 /
 * 写值 / 打开页面 / Tip 显示 / 置位，同时适用于图纸元素和图符 comp，复用 display 侧的 toolDef，仅将 group 改为 'symbol'。
 */

import type { SkillRegistryEntry } from '../../types'
import { SYMBOL_BINDING_VALUE_TYPES, SYMBOL_FUNC_API_REFERENCE } from './script-tools'
import {
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
} from './definitions.display'

export const ADD_FEATURE_SCALE_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_SCALE,
  group: 'symbol',
}

export const ADD_FEATURE_FILL_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_FILL,
  group: 'symbol',
}

export const ADD_FEATURE_DASH_FLOW_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_DASH_FLOW,
  group: 'symbol',
}

export const ADD_FEATURE_OPERATION_ENABLE_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_OPERATION_ENABLE,
  group: 'symbol',
}

export const ADD_FEATURE_MULTISTATE_TEXT_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_MULTISTATE_TEXT,
  group: 'symbol',
}

export const ADD_FEATURE_MULTISTATE_COLOR_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_MULTISTATE_COLOR,
  group: 'symbol',
}

export const ADD_FEATURE_TIP_SHOW_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_TIP_SHOW,
  group: 'symbol',
}

export const ADD_FEATURE_RESET_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_RESET,
  group: 'symbol',
}

export const ADD_FEATURE_ROTATE_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_ROTATE,
  group: 'symbol',
}

export const ADD_FEATURE_MOVE_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_MOVE,
  group: 'symbol',
}

export const ADD_FEATURE_BLINK_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_BLINK,
  group: 'symbol',
}

export const ADD_FEATURE_CHANGE_COLOR_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_CHANGE_COLOR,
  group: 'symbol',
}

export const ADD_FEATURE_NUM_DISPLAY_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_NUM_DISPLAY,
  group: 'symbol',
}

export const ADD_FEATURE_VISIBLE_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_VISIBLE,
  group: 'symbol',
}

export const ADD_FEATURE_WRITE_VALUE_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_WRITE_VALUE,
  group: 'symbol',
}

export const ADD_FEATURE_OPEN_PAGE_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_OPEN_PAGE,
  group: 'symbol',
}

export const SET_SYMBOL_ATTR_FUNCTION: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'set_symbol_attr_function',
      description: `为图符图元的某个属性设置“函数”数据绑定：由图符数据绑定值（dataBindings）通过脚本计算出属性值，如“温度超过 80 变红”“按开度旋转”“状态为 1 显示文字‘运行’”。
elementName 为 create_symbol_* 返回的图元 name/node_id；attr 必须是该图元 attrs 或 store 中已存在的属性名（如 fill、stroke、rotation、width、text、opacity），否则运行时不生效，工具会拒绝并列出可用属性。
脚本读取的每个数据绑定名必须在 dataBindings 中声明（valueType：number/string/boolean/picker 颜色/modal 测点），用户随后在图纸中为这些绑定关联数据源。同一属性重复设置会覆盖。
设置后调用 assemble_symbol 输出完整图符。
${SYMBOL_FUNC_API_REFERENCE}`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元的 name 或 node_id' },
          attr: { type: 'string', description: '要由函数计算的属性名，如 fill、stroke、rotation、text' },
          script: { type: 'string', description: '属性绑定函数体，必须 return 属性值' },
          dataBindings: {
            type: 'array',
            description: '本脚本用到的数据绑定声明，已声明过的可省略',
            items: {
              type: 'object',
              properties: {
                attr: { type: 'string', description: '绑定名，字母/数字/下划线，如 temp' },
                name: { type: 'string', description: '显示名称，如 温度' },
                valueType: { type: 'string', enum: [...SYMBOL_BINDING_VALUE_TYPES] },
                defaultValue: { description: '默认值，类型与 valueType 一致' },
              },
              required: ['attr', 'valueType'],
            },
          },
        },
        required: ['elementName', 'attr', 'script'],
      },
    },
  },
}
