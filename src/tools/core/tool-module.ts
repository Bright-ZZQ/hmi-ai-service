/**
 * ToolModule：工具的一站式登记单元（定义 + 执行 handler + 分类元数据 + 分组）
 *
 * 每个分类目录导出 ToolModule[]，由 core/registry.ts 汇总；
 * 定义、元数据与 handler 在同一处绑定，杜绝集中大表与手工接线带来的漂移。
 */

import type { EditorType, SkillMeta, SkillRegistryEntry, ToolDefinition } from '../../types'
import type { ToolHandler } from './context'

export interface ToolModule {
  definition: ToolDefinition
  handler: ToolHandler
  meta: SkillMeta
  group: EditorType
}

/** 以定义条目（toolDef + group）绑定 handler 与元数据，生成 ToolModule */
export function defineTool(entry: SkillRegistryEntry, handler: ToolHandler, meta: SkillMeta): ToolModule {
  return { definition: entry.toolDef, handler, meta, group: entry.group }
}
