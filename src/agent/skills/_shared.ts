/**
 * Skill 共用片段与工厂
 *
 * - 渐变 / 动态特性条件等可复用的参数片段
 * - Display / Symbol 共用同一工具名的多轮编辑、生成计划工具工厂
 */

import type { EditorType, SkillRegistryEntry } from '../../types'

// ============================================================
// 可复用参数片段 — 渐变色
// ============================================================

/**
 * 渐变模式字符串格式：`"方向 类型"`，例如 "top linear"、"center radial"、"left double_spread"。
 * - 方向：top / bottom / left / right / leftTop / leftBottom / rightTop / rightBottom / center
 * - 类型：linear（线性）/ radial（径向）/ single_spread（单边扩散）/ double_spread（双边扩散）
 * 省略渐变模式则为纯色。
 */
const GRADIENT_HINT = '渐变模式，形如 "top linear"、"center radial"。方向: top/bottom/left/right/leftTop/leftBottom/rightTop/rightBottom/center；类型: linear/radial/single_spread/double_spread。省略则为纯色'

/** 填充 + 边框渐变参数（用于有填充的形状） */
export const SHAPE_GRADIENT_PROPS = {
  fillEndColor: { type: 'string', description: '填充渐变终点色（配合 fillGradient 使用），省略则等于起点色' },
  fillGradient: { type: 'string', description: `填充${GRADIENT_HINT}` },
  strokeEndColor: { type: 'string', description: '边框渐变终点色（配合 strokeGradient 使用），省略则等于起点色' },
  strokeGradient: { type: 'string', description: `边框${GRADIENT_HINT}` },
} as const

/** 仅边框渐变参数（用于线条/曲线/管道等无填充形状） */
export const STROKE_GRADIENT_PROPS = {
  strokeEndColor: { type: 'string', description: '线条渐变终点色（配合 strokeGradient 使用），省略则等于起点色' },
  strokeGradient: { type: 'string', description: `线条${GRADIENT_HINT}` },
} as const

// ============================================================
// 可复用参数片段 — 动态特性触发条件
// ============================================================

export const FEATURE_CONDITION_PROPS = {
  conditionSpecifiedByUser: {
    type: 'boolean',
    description: '仅当用户原始请求明确指定了触发条件时设为 true；禁止根据场景自行推断或补充条件，默认 false',
  },
  dataSourceKey: {
    type: 'string',
    description: '用户明确指定的条件数据源键名；conditionSpecifiedByUser 不为 true 时禁止传入',
  },
  conditionOperator: {
    type: 'number',
    description: '用户明确指定的比较运算符：0=, 1=!=, 2=>, 3=<, 4=>=, 5=<=, 6=包含, 7=不包含, 8=在之间, 9=不在之间, 10=位运算',
  },
  conditionValue: {
    type: 'string',
    description: '用户明确指定的条件比较值；不得自行生成默认值',
  },
} as const

// ============================================================
// 可复用参数片段 — 旋转中心
// ============================================================

/** 创建图元时指定旋转中心（roatePos），用于多个部件绕同一圆心转动 */
export const SHAPE_PIVOT_PROPS = {
  pivotX: { type: 'number', description: '可选：旋转中心的画布绝对 x 坐标，默认包围盒中心。该图元要与其他部件绕同一圆心转动（如扇叶绕轮毂、辐条绕轮心）时，与 pivotY 一起传公共圆心' },
  pivotY: { type: 'number', description: '可选：旋转中心的画布绝对 y 坐标，与 pivotX 配合使用' },
} as const

/** 脚本类工具设置图元旋转中心：脚本用 setRotationEx 让多个图元绕同一圆心转动时使用 */
export const ROTATE_PIVOT_PROPS = {
  rotatePivotX: { type: 'number', description: '可选：脚本要让 rotatePivotElements 绕同一圆心转动时，该圆心的画布绝对 x 坐标（如轮毂圆心）' },
  rotatePivotY: { type: 'number', description: '可选：公共旋转圆心的画布绝对 y 坐标，与 rotatePivotX 配合使用' },
  rotatePivotElements: {
    type: 'array',
    items: { type: 'string' },
    description: '可选：需要绕该圆心转动的图元 id/名称列表（如全部扇叶）。服务端把它们的旋转中心设为该圆心，脚本只需对它们调用 setRotationEx(累计角度)',
  },
} as const

// ============================================================
// 可复用参数片段 — 批量选择图元
// ============================================================

/** 批量工具的目标图元列表；id 精确命中只取该图元，仅按名称命中时取全部同名图元 */
export const TARGETS_PROP = {
  type: 'array',
  items: { type: 'string' },
  description: '目标图元的 id 或名称列表；名称相同的图元会全部命中。与 filter 同时提供时取并集',
} as const

/** 批量工具的条件选择器 */
export const FILTER_PROP = {
  type: 'string',
  description: '按条件批量选择图元的 JSON 对象字符串，可含 type（如 "Text"）、nameContains（名称包含）、textContains（文字图元内容包含），多个条件需同时满足，如 {"type":"Ellipse","nameContains":"指示灯"}',
} as const

// ============================================================
// 多轮编辑工具工厂（Display / Symbol 共用同一工具名）
// ============================================================

export function createUpdateElementSkill(group: EditorType): SkillRegistryEntry {
  return {
    group,
    toolDef: {
      type: 'function',
      function: {
        name: 'update_element',
        description: `修改当前图纸/图符中已有图元。target 可传图元的 id、code、key 或 name。
changesJson 必须是 JSON 对象字符串，服务端会递归合并对象、整体替换数组，并保留未提及字段。
例如：target="矩形", changesJson="{\\"store\\":{\\"fill\\":\\"#4488FF\\"}}"。修改图纸文字图元内容时 changesJson 的 text 直接传原始文字（如 {\\"text\\":\\"新文字\\"}），服务端会自动 base64 编码，不要自行编码。修改完成后必须调用 assemble_display 或 assemble_symbol。`,
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: '目标图元的 id、code、key 或 name' },
            changesJson: { type: 'string', description: '需要递归合并到目标图元的 JSON 对象字符串' },
          },
          required: ['target', 'changesJson'],
        },
      },
    },
  }
}

export function createDeleteElementSkill(group: EditorType): SkillRegistryEntry {
  return {
    group,
    toolDef: {
      type: 'function',
      function: {
        name: 'delete_element',
        description: `删除当前图纸/图符中的已有图元。target 可传图元的 id、code、key 或 name。删除完成后必须调用 assemble_display 或 assemble_symbol。`,
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: '目标图元的 id、code、key 或 name' },
          },
          required: ['target'],
        },
      },
    },
  }
}

export function createGenerationPlanSkill(group: EditorType): SkillRegistryEntry {
  return {
    group,
    toolDef: {
      type: 'function',
      function: {
        name: 'declare_generation_plan',
        description: `声明本次生成或修改的验收计划，必须在创建、修改或删除图元前调用。
服务端会在最终组装时对照计划校验实际结果，避免遗漏数量约束或动态特性。
计划只描述可验证结果，不传递图元 JSON。`,
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '对用户需求的简短复述' },
            expectedElementCount: { type: 'number', description: '新建时为最终 elements/comps 扁平数组的准确数量；基于当前 JSON 编辑时为本轮新增的图元数量（不含已有图元）。仅当用户明确要求图元数量时填写，否则必须省略（不要用 0 表示“不新增”）' },
            requiredFeatureTools: {
              type: 'array',
              items: { type: 'string' },
              description: '本次要用到的 add_feature_* / add_event_definition 工具名，每种只列一次，不需要按使用次数重复；无特性则传空数组。执行中某种特性的使用次数变化无需重新声明计划，只有需要新增计划外的特性种类时才重新声明',
            },
            distinctFeatureTargets: { type: 'boolean', description: '不同种类的特性是否必须绑定到互不相同的图元（用户要求“分别配置”时为 true）' },
          },
          required: ['summary', 'requiredFeatureTools', 'distinctFeatureTargets'],
        },
      },
    },
  }
}
