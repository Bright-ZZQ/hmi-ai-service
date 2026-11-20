/**
 * Display 图纸组 — 排版工具（对齐 / 分布 / 层级 / 适应画布）
 *
 * 执行逻辑见 layout-tools.ts。
 */

import type { SkillRegistryEntry } from '../../types'
import { FILTER_PROP, TARGETS_PROP } from '../_shared/fragments'

export const ALIGN_ELEMENTS: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'align_elements',
      description: `对齐多个图元。mode：left/center/right 为水平方向左/中/右对齐，top/middle/bottom 为垂直方向上/中/下对齐。
reference 指定对齐基准：selection=所选图元的整体外框（默认，至少 2 个图元）、canvas=画布、或某个图元的 id/名称（该图元本身不动）。
组合图元整体移动。需要等距排布请用 distribute_elements。`,
      parameters: {
        type: 'object',
        properties: {
          targets: TARGETS_PROP,
          filter: FILTER_PROP,
          mode: { type: 'string', enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'], description: '对齐方式' },
          reference: { type: 'string', description: '对齐基准：selection（默认）/ canvas / 某图元的 id 或名称' },
        },
        required: ['mode'],
      },
    },
  },
}

export const DISTRIBUTE_ELEMENTS: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'distribute_elements',
      description: `沿水平或垂直方向等距分布多个图元。
不传 gap：保持最左（上）与最右（下）两个图元不动，其余图元使间隙相等（至少 3 个图元）。
传 gap：从最左（上）图元起，按固定间隙（px）依次排开（至少 2 个图元）；排到画布外会返回 warning。`,
      parameters: {
        type: 'object',
        properties: {
          targets: TARGETS_PROP,
          filter: FILTER_PROP,
          axis: { type: 'string', enum: ['horizontal', 'vertical'], description: 'horizontal=水平方向分布，vertical=垂直方向分布' },
          gap: { type: 'number', description: '固定间隙(px)；省略则在首尾图元之间等距分布' },
        },
        required: ['axis'],
      },
    },
  },
}

export const SET_Z_ORDER: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'set_z_order',
      description: `调整图元层级（遮挡关系）。action：front=置于最顶层，back=置于最底层，up=上移一层，down=下移一层。
层级调整在 assemble_display 时统一生效，仅在同一层级（同一组合内或顶层）的图元之间比较。
被遮挡的图元要显示出来时用本工具，不要删除重建。`,
      parameters: {
        type: 'object',
        properties: {
          targets: TARGETS_PROP,
          filter: FILTER_PROP,
          action: { type: 'string', enum: ['front', 'back', 'up', 'down'], description: '层级动作' },
        },
        required: ['action'],
      },
    },
  },
}

export const FIT_TO_CANVAS: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'fit_to_canvas',
      description: `把内容整体平移 / 等比缩放，使其落在画布内并居中，防止越界。默认处理画布上全部图元（覆盖整块画布的背景底板不动），可用 targets/filter 限定范围。
mode=shrink（默认）：内容超出时才缩小，不放大；mode=fit：缩放到刚好填满可用区域（最多放大 4 倍）。
缩放时图元尺寸与文字字号同比变化。内容太多缩放后过小时，应改为扩大画布（assemble_display 的 pageWidth/pageHeight 或 set_page_property）。`,
      parameters: {
        type: 'object',
        properties: {
          targets: TARGETS_PROP,
          filter: FILTER_PROP,
          margin: { type: 'number', description: '四周留白(px)，默认 20' },
          mode: { type: 'string', enum: ['shrink', 'fit'], description: 'shrink=仅超出时缩小（默认），fit=缩放到填满可用区域' },
          center: { type: 'boolean', description: '是否居中，默认 true；false 时只把内容移入画布' },
        },
        required: [],
      },
    },
  },
}
