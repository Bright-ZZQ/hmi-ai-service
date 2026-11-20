/**
 * Edit 已有图元编辑工具：update_element / delete_element / find_elements
 *
 * find_elements 单独导出（LOOKUP_TOOLS），便于 registry 按既定下发顺序编排。
 */

import type { SkillRegistryEntry } from '../../types'
import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import type { ToolHandler } from '../core/context'
import {
  DELETE_DISPLAY_ELEMENT,
  DELETE_SYMBOL_ELEMENT,
  FIND_DISPLAY_ELEMENTS,
  UPDATE_DISPLAY_ELEMENT,
  UPDATE_SYMBOL_ELEMENT,
} from './definitions'
import { handleDeleteElement, handleFindElements, handleUpdateElement } from './handlers'

const edit = (entry: SkillRegistryEntry, handler: ToolHandler): ToolModule =>
  defineTool(entry, handler, { category: 'edit', phases: ['edit'] })

export const EDIT_TOOLS: ToolModule[] = [
  edit(UPDATE_DISPLAY_ELEMENT, handleUpdateElement),
  edit(DELETE_DISPLAY_ELEMENT, handleDeleteElement),
  edit(UPDATE_SYMBOL_ELEMENT, handleUpdateElement),
  edit(DELETE_SYMBOL_ELEMENT, handleDeleteElement),
]

export const LOOKUP_TOOLS: ToolModule[] = [edit(FIND_DISPLAY_ELEMENTS, handleFindElements)]
