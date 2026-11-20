/**
 * 工具注册表 — 汇总各分类目录导出的 ToolModule
 *
 * 每个 ToolModule 同时携带定义 / handler / 分类元数据 / 分组，是工具治理的唯一数据源。
 * 本文件只做汇总、查询与一致性校验（lintRegistry）；按意图 / 阶段 / 轮次的下发路由见 agent/tool-routing.ts。
 *
 * 新增工具：在对应分类目录的 index.ts 中登记一个 ToolModule 即可，无需改动本文件
 * （新增分类目录时才需在 MODULES 中追加）。
 *
 * MODULES 的顺序决定 getToolsForType 的下发顺序；display / symbol 两个分组各自的相对顺序保持稳定，
 * 因此 edit / assembly 在 display 与 symbol 两侧的位置不同，按分组拆开编排。
 */

import type { EditorType, SkillMeta, SkillRegistryEntry, ToolDefinition } from '../../types'
import { ASSEMBLY_TOOLS } from '../assembly'
import { BATCH_TOOLS } from '../batch'
import { EDIT_TOOLS, LOOKUP_TOOLS } from '../edit'
import { FEATURE_TOOLS } from '../feature'
import { INSPECT_TOOLS } from '../inspect'
import { INTERACTION_TOOLS } from '../interaction'
import { LAYOUT_TOOLS } from '../layout'
import { PAGE_TOOLS } from '../page'
import { PLAN_TOOLS } from '../plan'
import { SHAPE_TOOLS } from '../shape'
import type { ToolModule } from './tool-module'

const forGroup = (modules: ToolModule[], group: EditorType): ToolModule[] =>
  modules.filter(module => module.group === group)

const MODULES: ToolModule[] = [
  ...PLAN_TOOLS,
  ...SHAPE_TOOLS,
  ...forGroup(EDIT_TOOLS, 'display'),
  ...forGroup(ASSEMBLY_TOOLS, 'display'),
  ...FEATURE_TOOLS,
  ...forGroup(EDIT_TOOLS, 'symbol'),
  ...LOOKUP_TOOLS,
  ...INTERACTION_TOOLS,
  ...BATCH_TOOLS,
  ...LAYOUT_TOOLS,
  ...PAGE_TOOLS,
  ...INSPECT_TOOLS,
  ...forGroup(ASSEMBLY_TOOLS, 'symbol'),
]

const nameOf = (module: ToolModule): string => module.definition.function.name

const ALL_SKILLS: SkillRegistryEntry[] = MODULES.map(module => ({ toolDef: module.definition, group: module.group }))

const META_BY_NAME = new Map<string, SkillMeta>()
for (const module of MODULES) {
  if (!META_BY_NAME.has(nameOf(module))) META_BY_NAME.set(nameOf(module), module.meta)
}

/** 获取全部 ToolModule（可按编辑器类型过滤） */
export function getToolModules(editorType?: EditorType): ToolModule[] {
  return editorType ? forGroup(MODULES, editorType) : MODULES
}

/** 获取工具分类元数据 */
export function getSkillMeta(name: string): SkillMeta | undefined {
  return META_BY_NAME.get(name)
}

/** 按编辑器类型获取全部工具定义列表 */
export function getToolsForType(editorType: EditorType): ToolDefinition[] {
  return forGroup(MODULES, editorType).map(module => module.definition)
}

/** 获取所有已注册的 Skill */
export function getAllSkills(): SkillRegistryEntry[] {
  return ALL_SKILLS
}

/** 按名称查找 Skill */
export function getSkillByName(name: string): SkillRegistryEntry | undefined {
  return ALL_SKILLS.find(skill => skill.toolDef.function.name === name)
}

/** 判断工具名称是否属于组装类工具 */
export function isAssemblyTool(name: string): boolean {
  return name === 'assemble_display' || name === 'assemble_symbol'
}

/**
 * 注册表一致性校验：名称唯一、定义 / 元数据 / handler 一一对应。
 * 返回错误信息数组，为空表示通过。供启动自检 / 单测调用。
 * @param handlerNames 执行分发表中已登记的工具名列表；传入后额外校验分发表与定义一一对应。
 */
export function lintRegistry(handlerNames?: string[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const handlerByName = new Map<string, ToolModule['handler']>()
  for (const module of MODULES) {
    const name = nameOf(module)
    const key = `${module.group}:${name}`
    if (seen.has(key)) errors.push(`重复注册: ${key}`)
    seen.add(key)
    if (!/^[a-z][a-z0-9_]*$/.test(name)) errors.push(`命名不合规: ${name}`)
    if (!module.meta) errors.push(`缺少分类元数据(meta): ${name}`)
    if (typeof module.handler !== 'function') errors.push(`缺少执行 handler: ${name}`)
    const known = handlerByName.get(name)
    if (known && known !== module.handler) errors.push(`同名工具 handler 不一致: ${name}`)
    handlerByName.set(name, module.handler)
  }
  if (handlerNames) {
    const handlers = new Set(handlerNames)
    for (const name of handlerByName.keys()) {
      if (!handlers.has(name)) errors.push(`缺少执行 handler: ${name}`)
    }
    for (const name of handlers) {
      if (!handlerByName.has(name)) errors.push(`handler 无对应工具定义: ${name}`)
    }
  }
  return errors
}
