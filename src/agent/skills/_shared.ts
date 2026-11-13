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
例如：target="矩形", changesJson="{\\"store\\":{\\"fill\\":\\"#4488FF\\"}}"。修改完成后必须调用 assemble_display 或 assemble_symbol。`,
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
            expectedElementCount: { type: 'number', description: '最终 elements/comps 扁平数组的准确数量；仅当用户明确要求图元数量或基于当前 JSON 可准确计算时填写，否则省略' },
            requiredFeatureTools: {
              type: 'array',
              items: { type: 'string' },
              description: '必须成功执行的 add_feature_* / add_event_definition 工具名列表；每个条目代表一次特性应用，重复需求需重复填写，无特性则传空数组',
            },
            distinctFeatureTargets: { type: 'boolean', description: 'requiredFeatureTools 中各次特性应用是否必须绑定到互不相同的图元' },
          },
          required: ['summary', 'requiredFeatureTools', 'distinctFeatureTargets'],
        },
      },
    },
  }
}
