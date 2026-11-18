/**
 * Display 图纸组 — 排版 / 图纸属性 / 页面参数 / 检查工具
 *
 * 执行逻辑见 agent/layout-tools.ts、agent/page-tools.ts、agent/inspect-tools.ts。
 */

import type { SkillRegistryEntry } from '../../../types'
import { FILTER_PROP, TARGETS_PROP } from '../_shared'

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

export const SET_PAGE_PROPERTY: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'set_page_property',
      description: `设置图纸属性（属性栏 - 图纸）：画布尺寸、背景色、刷新周期、画布适应模式、缩放/平移/动画开关、在线操作按钮。
只修改传入的属性，其余保持不变；这是对当前图纸的修改，不得新建图元。设置后调用 assemble_display 输出完整图纸。
改变画布尺寸不会移动或缩放已有图元，需要时配合 fit_to_canvas。`,
      parameters: {
        type: 'object',
        properties: {
          pageWidth: { type: 'number', description: '画布宽度(px)，1~20000' },
          pageHeight: { type: 'number', description: '画布高度(px)，1~20000' },
          bgColor: { type: 'string', description: '背景色，如 #0b1a2e' },
          refreshCycle: { type: 'number', description: '数据刷新周期(毫秒)，10~3600000，默认 1000' },
          fitMode: { type: 'number', enum: [0, 1, 2, 3, 4, 5], description: '画布适应模式：0=不适应，1=适应宽度，2=适应高度，3=等比适应（默认），4=填充，5=拉伸' },
          zoomEnable: { type: 'boolean', description: '预览时是否允许缩放' },
          translateEnable: { type: 'boolean', description: '预览时是否允许平移' },
          dynaAnimation: { type: 'boolean', description: '是否启用动态特性动画' },
          onlineOperations: { type: 'array', items: { type: 'string' }, description: '预览态可用的操作按钮，可选 editable/recoverable/playbackable/fullable/screenshotable，传空数组表示全部关闭' },
        },
        required: [],
      },
    },
  },
}

export const DECLARE_PAGE_PARAMS: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'declare_page_params',
      description: `显式声明页面参数（图纸级键值对，脚本通过 gv.setPageParamsEx/getPageParamsEx 读写，也可作为打开图纸时的外部入参）。
脚本里以字符串字面量引用的参数在组装时会自动声明为浮点型；需要指定类型、初始值、描述，或声明 TP（%TP<n>% 文本/测点占位符）参数时用本工具。
同名参数默认保持不变，overwrite=true 才覆盖。设置后调用 assemble_display 输出完整图纸。`,
      parameters: {
        type: 'object',
        properties: {
          params: {
            type: 'array',
            description: '要声明的参数列表',
            items: {
              type: 'object',
              description: '{ name: 参数名（不含空白与引号）, type: int|float|boolean|string|color|tag_tp|string_tp（默认 float）, value: 初始值, desc: 描述, tpIndex: TP 参数必填，不小于 1 的整数且同类型内不重复 }',
            },
          },
          overwrite: { type: 'boolean', description: '同名已有参数是否覆盖，默认 false' },
        },
        required: ['params'],
      },
    },
  },
}

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
