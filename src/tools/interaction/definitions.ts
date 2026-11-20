/**
 * Interaction 交互类工具定义 — 向用户提问（仅 Agent 循环使用）
 */

import type { SkillRegistryEntry } from '../../types'

export const ASK_USER: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'ask_user',
      description: `无法确定用户所指图元（find_elements 返回 0 个或多个候选）时，向用户提问并结束本轮，等待用户回答后再继续。
不要猜测目标图元。问题应简短、可直接回答，可基于候选的位置/相邻关系提问，例如“该图元是否在图纸右上方？”“该图元是否在‘XX’图元旁边？”，也可列出候选让用户选择。`,
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '向用户提出的问题' },
          options: { type: 'array', items: { type: 'string' }, description: '可选的快捷回答（如“是”“否”或候选图元描述），可省略' },
        },
        required: ['question'],
      },
    },
  },
}
