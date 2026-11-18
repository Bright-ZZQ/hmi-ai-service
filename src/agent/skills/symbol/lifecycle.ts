/**
 * Symbol 图符组 — 生成计划 / 多轮编辑 / 图符组装
 */

import type { SkillRegistryEntry } from '../../../types'
import { createDeleteElementSkill, createGenerationPlanSkill, createUpdateElementSkill } from '../_shared'

export const DECLARE_SYMBOL_GENERATION_PLAN = createGenerationPlanSkill('symbol')
export const UPDATE_SYMBOL_ELEMENT = createUpdateElementSkill('symbol')
export const DELETE_SYMBOL_ELEMENT = createDeleteElementSkill('symbol')

export const ASSEMBLE_SYMBOL: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'assemble_symbol',
      description: `将所有图符图元组装为完整的图符 JSON。
调用此工具前，必须先创建所有需要的图符图元（通过 create_symbol_rect、create_symbol_ellipse、create_symbol_text、create_symbol_line、create_symbol_polygon、create_symbol_polyline、create_symbol_arc、create_symbol_chord、create_symbol_pie 等工具）。
对于未指定尺寸的图元，会自动应用自适应填充布局（单图元铺满、多图元等分/网格排列）。
此工具会自动：填充 comps 字段、设置 modified 时间戳、配置 store 属性。
**重要**：服务端自动使用工作区中的全部图元，只传 symbolName 及需要修改的画布参数，禁止把图元 JSON 作为参数传入（会极其缓慢）；不需要的图元请用 delete_element 删除。`,
      parameters: {
        type: 'object',
        properties: {
          symbolName: { type: 'string', description: '图符名称' },
          width: { type: 'number', description: '画布宽度(px)，默认 800' },
          height: { type: 'number', description: '画布高度(px)，默认 600' },
          background: { type: 'string', description: '背景色，默认 rgba(255,255,255,1)' },
        },
        required: ['symbolName'],
      },
    },
  },
}
