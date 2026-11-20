/**
 * Display 图纸组 — 图纸属性 / 页面参数工具
 *
 * 执行逻辑见 page-tools.ts。
 */

import type { SkillRegistryEntry } from '../../types'

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
