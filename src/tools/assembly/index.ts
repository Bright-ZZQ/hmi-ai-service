/**
 * Assembly 组装工具：assemble_display / assemble_symbol
 */

import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import { ASSEMBLE_DISPLAY } from './definitions.display'
import { ASSEMBLE_SYMBOL } from './definitions.symbol'
import { handleAssembleDisplay, handleAssembleSymbol } from './handlers'

export const ASSEMBLY_TOOLS: ToolModule[] = [
  defineTool(ASSEMBLE_DISPLAY, handleAssembleDisplay, { category: 'assembly', phases: ['assemble'], core: true }),
  defineTool(ASSEMBLE_SYMBOL, handleAssembleSymbol, { category: 'assembly', phases: ['assemble'], core: true }),
]
