import type { SessionState } from './context'
import type { EditorType, StreamCanvas } from '../../types'

// ============================================================
// 会话状态
// ============================================================

export type { SessionState }

export const DEFAULT_DISPLAY_CANVAS: StreamCanvas = {
  name: 'AI生成图纸',
  pageWidth: 1880,
  pageHeight: 962,
  bgColor: '#ffffff',
}

export const DEFAULT_SYMBOL_CANVAS: StreamCanvas = {
  name: 'AI生成图符',
  pageWidth: 800,
  pageHeight: 600,
  bgColor: 'rgba(255, 255, 255, 1)',
}

/** 多轮修改时沿用上一轮画布，首轮用默认值；P2 引入 begin_* 工具后由模型显式声明。 */
export function getCanvasFromJson(
  editorType: EditorType,
  json?: Record<string, unknown>,
): StreamCanvas {
  if (editorType === 'display') {
    const document = json?.document as Record<string, unknown> | undefined
    const pageProperty = document?.pageProperty as Record<string, unknown> | undefined
    return {
      name: typeof document?.name === 'string' ? document.name : DEFAULT_DISPLAY_CANVAS.name,
      pageWidth: typeof pageProperty?.pageWidth === 'number' ? pageProperty.pageWidth : DEFAULT_DISPLAY_CANVAS.pageWidth,
      pageHeight: typeof pageProperty?.pageHeight === 'number' ? pageProperty.pageHeight : DEFAULT_DISPLAY_CANVAS.pageHeight,
      bgColor: typeof pageProperty?.bgColor === 'string' ? pageProperty.bgColor : DEFAULT_DISPLAY_CANVAS.bgColor,
    }
  }
  return {
    name: typeof json?.name === 'string' ? json.name : DEFAULT_SYMBOL_CANVAS.name,
    pageWidth: typeof json?.width === 'number' ? json.width : DEFAULT_SYMBOL_CANVAS.pageWidth,
    pageHeight: typeof json?.height === 'number' ? json.height : DEFAULT_SYMBOL_CANVAS.pageHeight,
    bgColor: typeof json?.background === 'string' ? json.background : DEFAULT_SYMBOL_CANVAS.bgColor,
  }
}

export function getElementsFromJson(
  editorType: EditorType,
  json?: Record<string, unknown>,
): Record<string, unknown>[] {
  if (!json) return []
  const items = editorType === 'display'
    ? (json.document as Record<string, unknown> | undefined)?.elements
    : json.comps
  if (!Array.isArray(items)) return []
  return structuredClone(items) as Record<string, unknown>[]
}

export function createSession(editorType: EditorType, currentJson?: Record<string, unknown>): SessionState {
  return {
    editorType,
    workingElements: getElementsFromJson(editorType, currentJson),
    steps: [],
    currentJson,
    featureExecutions: [],
    displayEvents: [],
    symbolDataBindings: [],
    pageProperty: {},
    pageParamDecls: [],
    zOrderOps: [],
    canvas: getCanvasFromJson(editorType, currentJson),
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
