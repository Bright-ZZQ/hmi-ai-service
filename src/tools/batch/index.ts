/**
 * Batch 批量与重复生成工具：clone_element_grid / bulk_apply_feature / copy_features / import_point_table / group / ungroup
 */

import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import { BATCH_TOOL_HANDLERS } from './batch-tools'
import {
  BULK_APPLY_FEATURE,
  CLONE_ELEMENT_GRID,
  COPY_FEATURES,
  GROUP_ELEMENTS,
  IMPORT_POINT_TABLE,
  UNGROUP_ELEMENTS,
} from './definitions'

const BATCH_PHASES = ['create', 'feature', 'edit'] as const

function batch(entry: typeof CLONE_ELEMENT_GRID, keywords: string[]): ToolModule {
  return defineTool(entry, BATCH_TOOL_HANDLERS[entry.toolDef.function.name], { category: 'batch', phases: [...BATCH_PHASES], keywords })
}

export const BATCH_TOOLS: ToolModule[] = [
  batch(CLONE_ELEMENT_GRID, ['复制', '阵列', '网格', '批量', '重复', '克隆', '副本', '多台', '多个', '行列', '相同的', '一样的']),
  batch(BULK_APPLY_FEATURE, ['批量', '所有', '全部', '每个', '每台', '各个', '分别', '统一', '都加', '都设置']),
  batch(COPY_FEATURES, ['复制特性', '复制配置', '拷贝', '同样的特性', '相同特性', '同样配置', '沿用', '复制']),
  batch(IMPORT_POINT_TABLE, ['点表', '导入', 'csv', 'CSV', 'Excel', 'excel', '表格', '位号表', '测点表', '清单']),
  batch(GROUP_ELEMENTS, ['组合', '成组', '打组', '编组']),
  batch(UNGROUP_ELEMENTS, ['取消组合', '解组', '拆分组合', '解除组合', '拆组']),
]
