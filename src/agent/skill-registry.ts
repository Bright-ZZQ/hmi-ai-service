/**
 * Skill Registry — 工具聚合、分类治理与按需下发
 *
 * 工具定义已按类别拆分到 `./skills/**`：
 * - `skills/display/{shapes,composite,features,lifecycle}.ts`
 * - `skills/symbol/{shapes,features,lifecycle}.ts`
 * - `skills/_shared.ts`（渐变/条件片段、多轮编辑与生成计划工厂）
 *
 * 本文件负责：
 * - 汇总所有 Skill 为 ALL_SKILLS
 * - 维护分类元数据 SKILL_META（category / phases / keywords）
 * - 提供按需下发（selectTools / getToolsForPhase）与一致性校验（lintRegistry）
 *
 * 新增工具：在对应 skills/** 模块中定义并加入 ALL_SKILLS，同时在 SKILL_META 登记一条。
 */

import type { AgentPhase, EditorType, SkillMeta, SkillRegistryEntry, ToolDefinition } from '../types'
import {
  CREATE_DISPLAY_ARC,
  CREATE_DISPLAY_CHORD,
  CREATE_DISPLAY_CURVE,
  CREATE_DISPLAY_ELLIPSE,
  CREATE_DISPLAY_LINE,
  CREATE_DISPLAY_PICTURE,
  CREATE_DISPLAY_PIE,
  CREATE_DISPLAY_PIPE,
  CREATE_DISPLAY_POLYGON,
  CREATE_DISPLAY_POLYLINE,
  CREATE_DISPLAY_RECT,
  CREATE_DISPLAY_REGULAR_POLYGON,
  CREATE_DISPLAY_TEXT,
} from './skills/display/shapes'
import { CREATE_CHART_PANEL, CREATE_EQUIPMENT, CREATE_METRIC_PANEL } from './skills/display/composite'
import {
  ADD_FEATURE_BLINK,
  ADD_FEATURE_CHANGE_COLOR,
  ADD_FEATURE_MOVE,
  ADD_FEATURE_OPEN_PAGE,
  ADD_FEATURE_ROTATE,
  ADD_FEATURE_VISIBLE,
  ADD_FEATURE_WRITE_VALUE,
  ADD_FEATURE_NUM_DISPLAY,
  ADD_EVENT_DEFINITION,
  ASK_USER,
  FIND_DISPLAY_ELEMENTS,
  SET_DISPLAY_SCRIPT,
  SET_PIPE_SCRIPT,
} from './skills/display/features'
import {
  ASSEMBLE_DISPLAY,
  DECLARE_DISPLAY_GENERATION_PLAN,
  DELETE_DISPLAY_ELEMENT,
  UPDATE_DISPLAY_ELEMENT,
} from './skills/display/lifecycle'
import {
  CREATE_SYMBOL_ARC,
  CREATE_SYMBOL_CHORD,
  CREATE_SYMBOL_ELLIPSE,
  CREATE_SYMBOL_LINE,
  CREATE_SYMBOL_PIE,
  CREATE_SYMBOL_POLYGON,
  CREATE_SYMBOL_POLYLINE,
  CREATE_SYMBOL_RECT,
  CREATE_SYMBOL_TEXT,
} from './skills/symbol/shapes'
import {
  ADD_FEATURE_BLINK_SYMBOL,
  ADD_FEATURE_CHANGE_COLOR_SYMBOL,
  ADD_FEATURE_MOVE_SYMBOL,
  ADD_FEATURE_NUM_DISPLAY_SYMBOL,
  ADD_FEATURE_OPEN_PAGE_SYMBOL,
  ADD_FEATURE_ROTATE_SYMBOL,
  ADD_FEATURE_VISIBLE_SYMBOL,
  ADD_FEATURE_WRITE_VALUE_SYMBOL,
  SET_SYMBOL_ATTR_FUNCTION,
} from './skills/symbol/features'
import {
  ASSEMBLE_SYMBOL,
  DECLARE_SYMBOL_GENERATION_PLAN,
  DELETE_SYMBOL_ELEMENT,
  UPDATE_SYMBOL_ELEMENT,
} from './skills/symbol/lifecycle'

// ============================================================
// 全局注册表
// ============================================================

const ALL_SKILLS: SkillRegistryEntry[] = [
  DECLARE_DISPLAY_GENERATION_PLAN,

  // Display 图纸组 — 图元创建
  CREATE_DISPLAY_RECT,
  CREATE_DISPLAY_ELLIPSE,
  CREATE_DISPLAY_TEXT,
  CREATE_DISPLAY_LINE,
  CREATE_DISPLAY_POLYGON,
  CREATE_DISPLAY_PICTURE,
  CREATE_DISPLAY_PIE,
  CREATE_DISPLAY_ARC,
  CREATE_DISPLAY_CHORD,
  CREATE_DISPLAY_CURVE,
  CREATE_DISPLAY_PIPE,
  CREATE_DISPLAY_POLYLINE,
  CREATE_DISPLAY_REGULAR_POLYGON,

  // Display 图纸组 — 复合组件（布局引擎驱动）
  CREATE_METRIC_PANEL,
  CREATE_EQUIPMENT,
  CREATE_CHART_PANEL,

  // Display 图纸组 — 已有图元编辑
  UPDATE_DISPLAY_ELEMENT,
  DELETE_DISPLAY_ELEMENT,

  // Display 图纸组 — 图纸组装
  ASSEMBLE_DISPLAY,

  // Display 图纸组 — 动态特性
  ADD_FEATURE_VISIBLE,
  ADD_FEATURE_WRITE_VALUE,
  ADD_FEATURE_CHANGE_COLOR,
  ADD_FEATURE_BLINK,
  ADD_FEATURE_MOVE,
  ADD_FEATURE_OPEN_PAGE,
  ADD_FEATURE_ROTATE,
  ADD_FEATURE_NUM_DISPLAY,
  ADD_EVENT_DEFINITION,

  // Display 图纸组 — 图纸脚本 / 管道脚本
  SET_DISPLAY_SCRIPT,
  SET_PIPE_SCRIPT,

  // Display 图纸组 — 图元定位 / 向用户提问
  FIND_DISPLAY_ELEMENTS,
  ASK_USER,

  DECLARE_SYMBOL_GENERATION_PLAN,

  // Symbol 图符组 — 图元创建
  CREATE_SYMBOL_RECT,
  CREATE_SYMBOL_ELLIPSE,
  CREATE_SYMBOL_TEXT,
  CREATE_SYMBOL_LINE,
  CREATE_SYMBOL_POLYGON,
  CREATE_SYMBOL_POLYLINE,
  CREATE_SYMBOL_ARC,
  CREATE_SYMBOL_CHORD,
  CREATE_SYMBOL_PIE,

  // Symbol 图符组 — 动态/交互特性
  ADD_FEATURE_ROTATE_SYMBOL,
  ADD_FEATURE_MOVE_SYMBOL,
  ADD_FEATURE_BLINK_SYMBOL,
  ADD_FEATURE_CHANGE_COLOR_SYMBOL,
  ADD_FEATURE_NUM_DISPLAY_SYMBOL,
  ADD_FEATURE_VISIBLE_SYMBOL,
  ADD_FEATURE_WRITE_VALUE_SYMBOL,
  ADD_FEATURE_OPEN_PAGE_SYMBOL,
  SET_SYMBOL_ATTR_FUNCTION,

  // Symbol 图符组 — 已有图元编辑
  UPDATE_SYMBOL_ELEMENT,
  DELETE_SYMBOL_ELEMENT,

  // Symbol 图符组 — 图符组装
  ASSEMBLE_SYMBOL,
]

// ============================================================
// 工具分类元数据（P0：治理 / 路由基础）
// ============================================================

const FEATURE_PHASES: AgentPhase[] = ['feature']

/**
 * 工具分类表：集中登记每个工具的 category / phases / keywords。
 * 作为按需下发（阶段门控、关键词预筛）与一致性校验（lintRegistry）的唯一数据源。
 * 新增工具时必须在此登记一条，否则启动自检会失败。
 */
const SKILL_META: Record<string, SkillMeta> = {
  declare_generation_plan: { category: 'plan', phases: ['plan'], core: true },

  update_element: { category: 'edit', phases: ['edit'] },
  delete_element: { category: 'edit', phases: ['edit'] },

  assemble_display: { category: 'assembly', phases: ['assemble'], core: true },
  assemble_symbol: { category: 'assembly', phases: ['assemble'], core: true },

  // Display — 基础图元
  create_display_rect: { category: 'shape', phases: ['create'], keywords: ['矩形', '方块', '卡片', '面板', '按钮', '边框'] },
  create_display_ellipse: { category: 'shape', phases: ['create'], keywords: ['椭圆', '圆', '圆形', '指示灯', '状态灯'] },
  create_display_text: { category: 'shape', phases: ['create'], keywords: ['文字', '文本', '标题', '标签', '数值', '说明'] },
  create_display_line: { category: 'shape', phases: ['create'], keywords: ['直线', '线段', '连接线', '分割线'] },
  create_display_polygon: { category: 'shape', phases: ['create'], keywords: ['多边形', '箭头', '三角形'] },
  create_display_picture: { category: 'shape', phases: ['create'], keywords: ['图片', '图标', '图像', 'icon'] },
  create_display_pie: { category: 'shape', phases: ['create'], keywords: ['饼图', '扇形', '占比'] },
  create_display_arc: { category: 'shape', phases: ['create'], keywords: ['弧', '圆弧', '仪表', '刻度'] },
  create_display_chord: { category: 'shape', phases: ['create'], keywords: ['弦', '弓形'] },
  create_display_curve: { category: 'shape', phases: ['create'], keywords: ['曲线', '贝塞尔', '波浪', '平滑', '异形'] },
  create_display_pipe: { category: 'shape', phases: ['create'], keywords: ['管道', '管路', '流体', '工艺线'] },
  create_display_polyline: { category: 'shape', phases: ['create'], keywords: ['折线', '多段线', '路径'] },
  create_display_regular_polygon: { category: 'shape', phases: ['create'], keywords: ['正多边形', '五边形', '六边形', '正三角'] },

  // Display — 复合组件
  create_metric_panel: { category: 'composite', phases: ['create'], keywords: ['数据面板', '指标', '监控', '读数', '列表', '表格', '仪表盘'] },
  create_equipment: { category: 'composite', phases: ['create'], keywords: ['储罐', '塔器', '炉子', '泵', '阀门', '设备', '换热器', '反应器'] },
  create_chart_panel: { category: 'composite', phases: ['create'], keywords: ['图表', '饼图', '折线图', '柱状图', '趋势', '占比', '统计', '看板', '大屏', '曲线'] },

  // Display — 动态特性
  add_feature_visible: { category: 'feature', phases: FEATURE_PHASES, keywords: ['显隐', '显示', '隐藏', '可见'] },
  add_feature_write_value: { category: 'feature', phases: FEATURE_PHASES, keywords: ['写值', '下发', '输入', '设定'] },
  add_feature_change_color: { category: 'feature', phases: FEATURE_PHASES, keywords: ['变色', '换色', '颜色变化'] },
  add_feature_blink: { category: 'feature', phases: FEATURE_PHASES, keywords: ['闪烁', '闪动', '报警闪'] },
  add_feature_move: { category: 'feature', phases: FEATURE_PHASES, keywords: ['移动', '平移', '运动'] },
  add_feature_open_page: { category: 'feature', phases: FEATURE_PHASES, keywords: ['打开画面', '跳转', '弹窗', '链接'] },
  add_feature_rotate: { category: 'feature', phases: FEATURE_PHASES, keywords: ['旋转', '转动', '自转'] },
  add_feature_num_display: { category: 'feature', phases: FEATURE_PHASES, keywords: ['数值显示', '实时值', '显示数值', '测点值', '单位', '小数位', '格式化'] },
  add_event_definition: { category: 'feature', phases: FEATURE_PHASES, keywords: ['脚本', '事件定义', '事件响应', '点击', '单击', '双击', '鼠标移入', '鼠标离开', '悬停', '定时', '每隔', '周期', '每天', '每周', '每月', '画面打开', '打开前', '打开后', '值变化', '数值变化', '条件执行', '弹窗', '弹出'] },
  set_display_script: { category: 'feature', phases: FEATURE_PHASES, keywords: ['图纸脚本', '画面脚本', '页面脚本', '初始化脚本', '加载脚本', '画面初始化', '页面初始化'] },
  set_pipe_script: { category: 'feature', phases: FEATURE_PHASES, keywords: ['管道脚本', '管道流动', '流动组', '管道流向', '管道反向', '管道速度'] },
  find_elements: { category: 'edit', phases: ['edit'] },
  ask_user: { category: 'edit', phases: ['edit'] },

  // Symbol — 基础图元
  create_symbol_rect: { category: 'shape', phases: ['create'], keywords: ['矩形', '方块'] },
  create_symbol_ellipse: { category: 'shape', phases: ['create'], keywords: ['椭圆', '圆'] },
  create_symbol_text: { category: 'shape', phases: ['create'], keywords: ['文字', '文本', '标签'] },
  create_symbol_line: { category: 'shape', phases: ['create'], keywords: ['直线', '线段'] },
  create_symbol_polygon: { category: 'shape', phases: ['create'], keywords: ['多边形', '箭头'] },
  create_symbol_polyline: { category: 'shape', phases: ['create'], keywords: ['折线', '曲线'] },
  create_symbol_arc: { category: 'shape', phases: ['create'], keywords: ['弧', '圆弧'] },
  create_symbol_chord: { category: 'shape', phases: ['create'], keywords: ['弦', '弓形'] },
  create_symbol_pie: { category: 'shape', phases: ['create'], keywords: ['饼图', '扇形'] },
  set_symbol_attr_function: { category: 'feature', phases: FEATURE_PHASES, keywords: ['脚本', '函数', '函数绑定', '属性绑定', '数据绑定', '绑定函数', '阈值', '超过', '高于', '低于', '根据数值'] },
}

/** 工具命名规范：治理约束，新增工具必须遵循 */
const TOOL_NAME_PATTERN = /^(create_(display|symbol)_[a-z_]+|create_metric_panel|create_equipment|create_chart_panel|add_feature_[a-z_]+|add_event_definition|set_display_script|set_pipe_script|set_symbol_attr_function|find_elements|ask_user|assemble_(display|symbol)|update_element|delete_element|declare_generation_plan)$/

/** 动态意图关键词：由全部特性关键词 + 通用动效词汇聚合，用于按需下发时判定是否需要特性工具 */
const DYNAMIC_INTENT_KEYWORDS = [
  ...new Set([
    ...Object.values(SKILL_META)
      .filter(meta => meta.category === 'feature')
      .flatMap(meta => meta.keywords ?? []),
    '动态', '动画', '实时', '联动', '交互', '告警', '报警', '转', '闪',
  ]),
]

function matchesDynamicIntent(prompt: string): boolean {
  if (!prompt) return false
  return DYNAMIC_INTENT_KEYWORDS.some(keyword => prompt.includes(keyword))
}

// ============================================================
// 访问与路由
// ============================================================

/** 获取工具分类元数据 */
export function getSkillMeta(name: string): SkillMeta | undefined {
  return SKILL_META[name]
}

/** 按编辑器类型获取全部工具定义列表 */
export function getToolsForType(editorType: EditorType): ToolDefinition[] {
  return ALL_SKILLS
    .filter(s => s.group === editorType)
    .map(s => s.toolDef)
}

/**
 * 按编辑器类型 + 生命周期阶段筛选工具。核心工具（core）在任意阶段都会保留。
 */
export function getToolsForPhase(editorType: EditorType, phase: AgentPhase): ToolDefinition[] {
  return ALL_SKILLS
    .filter(s => s.group === editorType)
    .filter((s) => {
      const meta = SKILL_META[s.toolDef.function.name]
      return meta ? (meta.core === true || meta.phases.includes(phase)) : true
    })
    .map(s => s.toolDef)
}

/**
 * 按需下发（P3）：按编辑器类型 + 用户意图筛选下发给模型的工具子集。
 * - core（生成计划 / 组装）始终保留；
 * - shape / composite（基础绘制词汇）始终保留，避免模型无图元可用；
 * - feature（动态特性）仅当用户表达动态意图时下发，静态需求下省去大段特性参数；
 * - edit（修改 / 删除）仅在多轮修改（存在当前 JSON）时下发。
 */
export function selectTools(
  editorType: EditorType,
  options: { prompt?: string, isEditing?: boolean } = {},
): ToolDefinition[] {
  const { prompt = '', isEditing = false } = options
  const wantsDynamic = matchesDynamicIntent(prompt)
  return ALL_SKILLS
    .filter(s => s.group === editorType)
    .filter((s) => {
      const meta = SKILL_META[s.toolDef.function.name]
      if (!meta) return true
      if (meta.core) return true
      switch (meta.category) {
        case 'feature':
          return wantsDynamic
        case 'edit':
          return isEditing
        default:
          return true
      }
    })
    .map(s => s.toolDef)
}

/** 获取所有已注册的 Skill */
export function getAllSkills(): SkillRegistryEntry[] {
  return ALL_SKILLS
}

/** 按名称查找 Skill */
export function getSkillByName(name: string): SkillRegistryEntry | undefined {
  return ALL_SKILLS.find(s => s.toolDef.function.name === name)
}

/** 判断工具名称是否属于组装类工具 */
export function isAssemblyTool(name: string): boolean {
  return name === 'assemble_display' || name === 'assemble_symbol'
}

/**
 * 注册表一致性校验：命名规范、分类元数据完备、（可选）执行 handler 对齐。
 * 返回错误信息数组，为空表示通过。供启动自检 / 单测调用。
 * @param handlerNames 已登记执行 handler 的工具名列表；传入后额外校验定义与执行一一对应。
 */
export function lintRegistry(handlerNames?: string[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const skill of ALL_SKILLS) {
    const name = skill.toolDef.function.name
    const key = `${skill.group}:${name}`
    if (seen.has(key)) errors.push(`重复注册: ${key}`)
    seen.add(key)
    if (!TOOL_NAME_PATTERN.test(name)) errors.push(`命名不合规: ${name}`)
    if (!SKILL_META[name]) errors.push(`缺少分类元数据(SKILL_META): ${name}`)
  }
  if (handlerNames) {
    const registered = new Set(ALL_SKILLS.map(s => s.toolDef.function.name))
    const handlers = new Set(handlerNames)
    for (const name of registered) {
      if (!handlers.has(name)) errors.push(`缺少执行 handler: ${name}`)
    }
    for (const name of handlers) {
      if (!registered.has(name)) errors.push(`handler 无对应工具定义: ${name}`)
    }
  }
  return errors
}
