/**
 * Tool Routing — Agent 循环的工具按需下发
 *
 * 工具本身（定义 / handler / 分类元数据）由 tools/ 注册表维护；
 * 本文件只负责 Agent 循环专用的路由策略：按用户意图 / 生命周期阶段 / 轮次收窄下发给模型的工具子集。
 * phases / keywords / core 仍保留在各工具的 SkillMeta 中。
 */

import type { AgentPhase, EditorType, ToolDefinition } from '../types'
import { getToolModules } from '../tools'

/** 动态意图关键词：由全部特性关键词 + 通用动效词汇聚合，用于按需下发时判定是否需要特性工具 */
const DYNAMIC_INTENT_KEYWORDS = [
  ...new Set([
    ...getToolModules()
      .filter(module => module.meta.category === 'feature')
      .flatMap(module => module.meta.keywords ?? []),
    '动态', '动画', '实时', '联动', '交互', '告警', '报警', '转', '闪',
  ]),
]

function matchesDynamicIntent(prompt: string): boolean {
  if (!prompt) return false
  return DYNAMIC_INTENT_KEYWORDS.some(keyword => prompt.includes(keyword))
}

function matchesKeywords(prompt: string, keywords: string[] = []): boolean {
  return Boolean(prompt) && keywords.some(keyword => prompt.includes(keyword))
}

/**
 * 按编辑器类型 + 生命周期阶段筛选工具。核心工具（core）在任意阶段都会保留。
 */
export function getToolsForPhase(editorType: EditorType, phase: AgentPhase): ToolDefinition[] {
  return getToolModules(editorType)
    .filter(module => module.meta.core === true || module.meta.phases.includes(phase))
    .map(module => module.definition)
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
  return getToolModules(editorType)
    .filter(({ meta }) => {
      if (meta.core) return true
      switch (meta.category) {
        case 'feature':
          return wantsDynamic
        case 'edit':
          return isEditing
        // 批量 / 排版 / 检查 / 图纸级设置：编辑已有画布时全部下发，首轮生成仅在用户意图命中关键词时下发
        case 'batch':
        case 'layout':
        case 'inspect':
        case 'page':
          return isEditing || matchesKeywords(prompt, meta.keywords)
        default:
          return true
      }
    })
    .map(module => module.definition)
}

/** 计划里可能不会逐一列出、但由用户意图明确需要的特性类工具（脚本 / 事件定义） */
const INTENT_FEATURE_TOOLS = new Set(['add_event_definition', 'set_display_script', 'set_pipe_script', 'set_symbol_attr_function'])

/**
 * 按轮次收窄下发的工具（减少每轮模型要读的工具说明）：
 * - 声明生成计划前：不下发特性类工具（参数说明很长；系统提示词已列出全部特性工具的名称与用途，足以完成计划）；
 * - 声明计划后：只下发计划 requiredFeatureTools 中列出的特性工具，以及用户意图明确需要的脚本 / 事件定义工具。
 * 其余类别不受影响。模型需要计划外的特性工具时，重新调用 declare_generation_plan 补充即可。
 */
export function narrowToolsForRound(
  tools: ToolDefinition[],
  options: { prompt?: string, plannedFeatureTools?: string[] } = {},
): ToolDefinition[] {
  const { prompt = '', plannedFeatureTools } = options
  const metaByName = new Map(getToolModules().map(module => [module.definition.function.name, module.meta]))
  return tools.filter((tool) => {
    const name = tool.function.name
    const meta = metaByName.get(name)
    if (!meta || meta.category !== 'feature') return true
    if (!plannedFeatureTools) return false
    if (plannedFeatureTools.includes(name)) return true
    return INTENT_FEATURE_TOOLS.has(name) && matchesKeywords(prompt, meta.keywords)
  })
}
