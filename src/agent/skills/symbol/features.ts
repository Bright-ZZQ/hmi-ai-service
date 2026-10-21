/**
 * Symbol 图符组 — 动态/交互特性工具
 *
 * 旋转 / 移动 / 闪烁 / 变色 / 数值显示 / 显隐 / 写值 / 打开页面
 * 同时适用于图纸元素和图符 comp，复用 display 侧的 toolDef，仅将 group 改为 'symbol'。
 */

import type { SkillRegistryEntry } from '../../../types'
import {
  ADD_FEATURE_BLINK,
  ADD_FEATURE_CHANGE_COLOR,
  ADD_FEATURE_MOVE,
  ADD_FEATURE_NUM_DISPLAY,
  ADD_FEATURE_OPEN_PAGE,
  ADD_FEATURE_ROTATE,
  ADD_FEATURE_VISIBLE,
  ADD_FEATURE_WRITE_VALUE,
} from '../display/features'

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
