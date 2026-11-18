/**
 * Display 图纸组 — 批量与重复生成工具
 *
 * clone_element_grid / bulk_apply_feature / copy_features / import_point_table / group_elements / ungroup_elements
 * 执行逻辑见 agent/batch-tools.ts。
 */

import type { SkillRegistryEntry } from '../../../types'
import { FILTER_PROP, TARGETS_PROP } from '../_shared'

const REPLACE_PROP = {
  type: 'array',
  description: '特性内字符串替换，形如 [{"from":"PUMP1","to":"PUMP{n}"}]：把特性（条件测点、数据源、事件等）里的 from 子串替换为 to，to 里的 {n} 会展开为序号（{n:2} 补零到 2 位）。不影响名称与文字内容',
  items: {
    type: 'object',
    description: '{ from: 要替换的子串, to: 替换成的内容，可含 {n} }',
  },
} as const

const START_INDEX_PROP = {
  type: 'number',
  description: '序号起点，默认 1。原图元视为第 startIndex 个，复制出的第 k 份序号为 startIndex+k',
} as const

export const CLONE_ELEMENT_GRID: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'clone_element_grid',
      description: `把一个图元（或组合）按 rows×cols 网格复制多份，原图元占网格第一格。复制品携带全部动态/交互特性与事件，名称与测点可按序号模板递增。
适用于“8 台一样的泵”“3 行 4 列的指示灯”等重复布局，不要逐个 create_* 再逐个 add_feature_*。
先创建并配置好第一个图元（含特性），再调用本工具；用 replace 把测点换成各自的测点，如 [{"from":"PUMP1","to":"PUMP{n}"}]。
间距 gapX/gapY 是相邻图元边缘之间的空隙(px)。内容超出画布时会返回 warning，需扩大画布或调整布局。`,
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '要复制的图元 id 或名称（组合图元会连同子图元一起复制）' },
          rows: { type: 'number', description: '行数，默认 1' },
          cols: { type: 'number', description: '列数，默认 1' },
          gapX: { type: 'number', description: '列间距(px)，默认 20' },
          gapY: { type: 'number', description: '行间距(px)，默认 20' },
          direction: { type: 'string', enum: ['row', 'column'], description: '填充顺序：row=先横向再换行（默认），column=先纵向再换列' },
          nameTemplate: { type: 'string', description: '复制品名称模板，如 "泵{n}"、"指示灯{n:2}"；省略则用 "原名_序号"' },
          replace: REPLACE_PROP,
          startIndex: START_INDEX_PROP,
        },
        required: ['target'],
      },
    },
  },
}

export const BULK_APPLY_FEATURE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'bulk_apply_feature',
      description: `对一批图元用同一套参数添加同一种特性，等价于对每个图元调用一次对应的 add_feature_*，但只需一次调用。
feature 为 add_feature_* 工具名；paramsJson 为该工具的参数（不含 elementName）的 JSON 对象字符串，字符串值里可用 {n}（序号，{n:2} 补零）、{name}（图元名称）占位，让每个图元绑定各自的测点，如 {"dataSourceKey":"100:PUMP{n:2}.RUN"}。
目标用 targets 列出，或用 filter 按类型/名称/文字内容批量选择。部分图元失败不影响其余图元，失败原因会逐个返回。
遵守与 add_feature_* 相同的条件规则：未经用户明确指定，不得传 conditionSpecifiedByUser / dataSourceKey 条件参数。`,
      parameters: {
        type: 'object',
        properties: {
          feature: { type: 'string', description: '特性工具名，如 add_feature_blink、add_feature_num_display、add_feature_write_value' },
          paramsJson: { type: 'string', description: '该特性工具的参数 JSON 对象字符串（不含 elementName），字符串值可含 {n} / {name} 占位' },
          targets: TARGETS_PROP,
          filter: FILTER_PROP,
          startIndex: START_INDEX_PROP,
        },
        required: ['feature', 'paramsJson'],
      },
    },
  },
}

export const COPY_FEATURES: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'copy_features',
      description: `把一个图元上已配置好的特性复制到其他图元，可同时把测点批量换成各自的测点。
默认复制动态+交互特性（kinds 可加入 event 以复制事件）；featureTypes 可限定特性类型（如 GraphDynaBlink 或 add_feature_blink）。
mode=append（默认）在目标已有特性之后追加；mode=replace 先移除目标上同类型的特性再复制。
先用 list_features 确认源图元上有哪些特性。`,
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '源图元 id 或名称' },
          to: TARGETS_PROP,
          filter: FILTER_PROP,
          kinds: { type: 'array', items: { type: 'string', enum: ['dynamic', 'interactive', 'event'] }, description: '要复制的种类，默认 ["dynamic","interactive"]' },
          featureTypes: { type: 'array', items: { type: 'string' }, description: '限定特性类型（特性 type 或 add_feature_* 工具名），省略则复制所选种类的全部特性' },
          replace: REPLACE_PROP,
          startIndex: START_INDEX_PROP,
          mode: { type: 'string', enum: ['append', 'replace'], description: 'append=追加（默认）；replace=先移除目标上同类型特性' },
        },
        required: ['from'],
      },
    },
  },
}

export const IMPORT_POINT_TABLE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'import_point_table',
      description: `把点表（CSV / TSV / JSON）批量展开为画面：每个测点一行“名称 + 实时数值（数值显示特性已绑定该测点）+ 单位”，按网格排布，保证不重叠。
点表必须有测点列（表头可为 point/测点/位号/点名 等，其余列 name/名称/描述、unit/单位、min/max、device/设备 可选；表头不规范时用 columns 指定，如 {"point":"位号","name":"说明"}）。
也可传 templateTarget，改为以画布上的一个图元/组合为模板：每行复制一份，并把其中字符串里的 {point} {name} {unit} {min} {max} {device} {n} 占位符替换为该行内容（模板里的特性也会一并替换，测点可写成 {point}）。
默认模板图元是本轮新建的占位图元，生成后会被移除；画布已有的图元不会被删除。keepTemplate=true 可保留。单次最多 200 行。`,
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: '点表内容：CSV/TSV 文本（首行为表头），或 JSON 数组（对象数组，或首行为表头的二维数组）' },
          columns: { type: 'string', description: '可选。字段到表头名的映射 JSON，如 {"point":"位号","name":"说明","unit":"单位"}，字段可选 point/name/unit/min/max/device' },
          templateTarget: { type: 'string', description: '可选。作为模板的图元/组合 id 或名称；省略则使用内置“名称+数值+单位”行样式' },
          keepTemplate: { type: 'boolean', description: '模板模式下是否保留模板图元，默认 false（仅对本轮新建的模板生效）' },
          x: { type: 'number', description: '网格起点 x(px)，默认 20（模板模式默认取模板位置）' },
          y: { type: 'number', description: '网格起点 y(px)，默认 20（模板模式默认取模板位置）' },
          cols: { type: 'number', description: '列数，默认 1（单列竖排）' },
          cellWidth: { type: 'number', description: '每行/每份的宽度(px)，默认 420（模板模式默认取模板宽度）' },
          cellHeight: { type: 'number', description: '每行/每份的高度(px)，默认 36（模板模式默认取模板高度）' },
          gapX: { type: 'number', description: '列间距(px)，默认 20' },
          gapY: { type: 'number', description: '行间距(px)，默认 6' },
          direction: { type: 'string', enum: ['row', 'column'], description: '填充顺序：row=先横向（默认），column=先纵向' },
          fontSize: { type: 'number', description: '内置样式的字号，默认 16' },
          decimals: { type: 'number', description: '内置样式的数值小数位：-1=跟随全局小数位（默认），0~6=固定位数' },
          startIndex: START_INDEX_PROP,
        },
        required: ['data'],
      },
    },
  },
}

export const GROUP_ELEMENTS: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'group_elements',
      description: `把多个图元组合为一个组合图元（Group），便于整体移动、复制和对齐。图元的位置、特性、事件保持不变。
要组合的图元必须属于同一层级。组合后新组合图元的 id 会在结果中返回。`,
      parameters: {
        type: 'object',
        properties: {
          targets: TARGETS_PROP,
          filter: FILTER_PROP,
          name: { type: 'string', description: '组合名称，默认“组合”' },
        },
        required: [],
      },
    },
  },
}

export const UNGROUP_ELEMENTS: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'ungroup_elements',
      description: `取消组合：把组合图元的子图元释放到组合所在的层级，并删除组合本身。
带缩放、旋转或镜像变换的组合会被拒绝（拆分会让子图元错位）。`,
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '组合图元的 id 或名称' },
        },
        required: ['target'],
      },
    },
  },
}
