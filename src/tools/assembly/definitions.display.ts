/**
 * Display 图纸组 — 图纸组装
 */

import type { SkillRegistryEntry } from '../../types'

export const ASSEMBLE_DISPLAY: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'assemble_display',
      description: `将所有图纸图元组装为完整的图纸 document JSON。服务端自动使用工作区中已创建/修改的全部图元，无需也不能传入图元数据。
调用此工具前，必须先创建所有需要的图元（通过 create_display_* 系列工具）。
此工具会：自动重排 zIndex、计算 latestIndex、生成唯一 code、添加当前时间戳。
**重要**：只传 pageName 及需要修改的画布参数，禁止把图元 JSON 作为参数传入（会极其缓慢）；不需要的图元请用 delete_element 删除。`,
      parameters: {
        type: 'object',
        properties: {
          pageName: { type: 'string', description: '图纸名称' },
          pageWidth: { type: 'number', description: '画布宽度(px)，默认 1880。当图元较多、按合理间距排布会越界或重叠时，必须调大此值（如 2400、2560）以容纳全部内容，避免拥挤重叠' },
          pageHeight: { type: 'number', description: '画布高度(px)，默认 962。当纵向内容放不下时，必须调大此值（如 1350、1440）以容纳全部内容，避免重叠' },
          bgColor: { type: 'string', description: '背景色，默认 #ffffff' },
          author: { type: 'string', description: '作者，默认空' },
          company: { type: 'string', description: '公司，默认空' },
          desc: { type: 'string', description: '描述，默认空' },
        },
        required: ['pageName'],
      },
    },
  },
}
