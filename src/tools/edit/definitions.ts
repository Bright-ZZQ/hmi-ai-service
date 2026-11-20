/**
 * Edit 编辑类工具定义 — 多轮编辑（update_element / delete_element）与图元定位（find_elements）
 */

import type { SkillRegistryEntry } from '../../types'
import { createDeleteElementSkill, createUpdateElementSkill } from '../_shared/fragments'

export const UPDATE_DISPLAY_ELEMENT = createUpdateElementSkill('display')
export const DELETE_DISPLAY_ELEMENT = createDeleteElementSkill('display')
export const UPDATE_SYMBOL_ELEMENT = createUpdateElementSkill('symbol')
export const DELETE_SYMBOL_ELEMENT = createDeleteElementSkill('symbol')

export const FIND_DISPLAY_ELEMENTS: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'find_elements',
      description: `在当前图纸中按名称或文字图元的文字内容（服务端已解码 base64）查找候选图元，返回 id、name、type、text、坐标尺寸及相对画布的大致位置（如“右上”）。
用户用自然语言指代图元（如“名为XX的按钮”“文字为‘启动’的图元”）时先调用此工具，再用返回的 id 作为 elementName 调用后续工具。keyword 为空则列出全部图元。`,
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '名称或文字内容关键词，可为空' },
        },
        required: [],
      },
    },
  },
}
