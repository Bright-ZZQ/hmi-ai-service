import { buildDisplayDocument, buildSymbolDocument } from '../lib/element-builders'
import { stackNewElementsOnTop } from './edit-context'
import { mergeDataBindings, mergePageScript } from '../feature/script-tools'
import { normalizeRotatePivots } from './display-integrity'
import { collectPageParamNames, ensurePageParams } from '../page/page-params'
import { decodeText, encodeText, findElementIndex, getElementAliases, isEncodedText } from '../lib/element-lookup'
import { decodeHtmlEntities } from '../lib/text-entities'
import { ensureDeclaredPageParams } from '../page/page-tools'
import { applyZOrderOps } from '../layout/layout-tools'
import { propagateOverlayEvents } from './overlay-events'
import type { ToolExecContext } from '../core/context'
import { getCanvasFromJson, getElementsFromJson, isPlainObject } from '../core/session'
import type { AgentStep } from '../../types'

/**
 * 模型显式传入 elementsData 时往往是自行转写的副本，会丢失 store 中的动态/交互特性。
 * 按 id/名称回溯到工作区中的原图元，找不到才沿用传入内容。
 */
function resolveExplicitElements(
  explicit: unknown,
  working: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (!Array.isArray(explicit)) return working
  const resolved: Record<string, unknown>[] = []
  for (const item of explicit) {
    if (!isPlainObject(item)) continue
    const index = typeof item.id === 'string' ? findElementIndex(working, item.id) : -1
    // 名称可能重复，仅在唯一匹配时才按名称回溯，避免多个图元被折叠成同一个
    const nameMatches = index < 0 && typeof item.name === 'string'
      ? working.filter(element => getElementAliases(element).includes(item.name as string))
      : []
    const matched = index >= 0 ? working[index] : nameMatches.length === 1 ? nameMatches[0] : item
    if (!resolved.includes(matched)) resolved.push(matched)
  }
  return resolved
}

/** 兜底：模型自行转写的文字图元可能携带未编码的原始文字，组装前统一修正为 base64 */
function ensureEncodedTexts(elements: Record<string, unknown>[]): Record<string, unknown>[] {
  return elements.map((element) => {
    if (element.type !== 'Text' || typeof element.text !== 'string') return element
    if (!isEncodedText(element.text)) {
      return { ...element, text: encodeText(decodeHtmlEntities(element.text)) }
    }
    const raw = decodeText(element.text) ?? ''
    const cleaned = decodeHtmlEntities(raw)
    return cleaned === raw ? element : { ...element, text: encodeText(cleaned) }
  })
}

// 图纸组装
export function handleAssembleDisplay({ name, args, session, onStep, emit }: ToolExecContext): string {
  const elementsData = args.elementsData
  // 如果模型传了空数组或未传，自动使用 session 中已创建的所有图元
  const effectiveElements = normalizeRotatePivots(ensureEncodedTexts(
    (Array.isArray(elementsData) && elementsData.length > 0)
      ? resolveExplicitElements(elementsData, session.workingElements)
      : session.workingElements,
  ), getElementsFromJson('display', session.currentJson))
  const baseDocument = session.currentJson?.document as Record<string, unknown> | undefined
  const basePageProperty = baseDocument?.pageProperty as Record<string, unknown> | undefined
  // 编辑已有图纸时，新增图元叠放在已有图元之上，已有图元的层级保持不变
  const baseElements = getElementsFromJson('display', session.currentJson)
  const baseIds = new Set(baseElements.map(element => element.id).filter(Boolean))
  // 以已有图元的当前层级（可能被拆分组合等操作调整过）作为叠放基准
  const survivingBase = effectiveElements.filter(element => baseIds.has(element.id))
  const finalElements = baseDocument
    ? stackNewElementsOnTop(effectiveElements, survivingBase)
    : effectiveElements
  const document: Record<string, unknown> = buildDisplayDocument({
    pageName: (args.pageName as string) || (baseDocument?.name as string) || 'AI生成图纸',
    elementsData: finalElements,
    preserveCreationOrder: session.preserveCreationOrder,
    pageWidth: (args.pageWidth as number | undefined) ?? (session.pageProperty.pageWidth as number | undefined) ?? (basePageProperty?.pageWidth as number | undefined),
    pageHeight: (args.pageHeight as number | undefined) ?? (session.pageProperty.pageHeight as number | undefined) ?? (basePageProperty?.pageHeight as number | undefined),
    bgColor: (args.bgColor as string | undefined) ?? (session.pageProperty.bgColor as string | undefined) ?? (basePageProperty?.bgColor as string | undefined),
    author: (args.author as string | undefined) ?? (baseDocument?.author as string | undefined),
    company: (args.company as string | undefined) ?? (baseDocument?.company as string | undefined),
    desc: (args.desc as string | undefined) ?? (baseDocument?.desc as string | undefined),
  })

  const generatedDocument = document.document as Record<string, unknown>
  const generatedPageProperty = generatedDocument.pageProperty as Record<string, unknown>
  // 保留原图纸 pageProperty 中的其他配置（如已有 events、scriptFunc），仅以生成值覆盖尺寸/背景等
  const pageProperty: Record<string, unknown> = { ...basePageProperty, ...generatedPageProperty }
  // 原图纸的 latestIndex 是编辑器生成名称/编号的计数基准，不能被调低
  if (typeof basePageProperty?.latestIndex === 'number' && basePageProperty.latestIndex > Number(pageProperty.latestIndex)) {
    pageProperty.latestIndex = basePageProperty.latestIndex
  }
  // set_page_property 设置的其余属性（适应模式、刷新周期等）覆盖到图纸属性；尺寸与背景以上面的最终取值为准
  Object.assign(pageProperty, session.pageProperty, {
    pageWidth: generatedPageProperty.pageWidth,
    pageHeight: generatedPageProperty.pageHeight,
    width: generatedPageProperty.width,
    height: generatedPageProperty.height,
    bgColor: generatedPageProperty.bgColor,
  })
  if (session.displayEvents.length > 0) {
    const baseEvents = Array.isArray(basePageProperty?.events) ? basePageProperty.events : []
    pageProperty.events = [...baseEvents, ...session.displayEvents]
  }
  if (session.displayScript) {
    pageProperty.scriptFunc = mergePageScript(
      basePageProperty?.scriptFunc,
      session.displayScript.script,
      session.displayScript.replace,
    )
  }
  generatedDocument.pageProperty = pageProperty

  if (baseDocument) {
    const generated = document.document as Record<string, unknown>
    document.document = {
      ...generated,
      code: baseDocument.code ?? generated.code,
      layers: baseDocument.layers ?? generated.layers,
      pageParams: baseDocument.pageParams ?? generated.pageParams,
      oldPageParams: baseDocument.oldPageParams ?? generated.oldPageParams,
      pageScript: baseDocument.pageScript ?? generated.pageScript,
      elements: finalElements,
    }
  }

  // 脚本以字面量引用的页面参数必须已声明，否则运行时 setPageParamsEx 无效、getPageParamsEx 返回 undefined
  const finalDocument = document.document as Record<string, unknown>
  finalDocument.pageParams = ensurePageParams(
    ensureDeclaredPageParams(finalDocument.pageParams, session.pageParamDecls),
    collectPageParamNames([finalDocument.elements, finalDocument.pageProperty]),
  )

  if (session.zOrderOps.length > 0) finalDocument.elements = applyZOrderOps(finalDocument.elements as Record<string, unknown>[], session.zOrderOps)
  // 层级确定后再同步：压在按钮底板上的文字/装饰也要响应底板的点击与悬停
  finalDocument.elements = propagateOverlayEvents(finalDocument.elements as Record<string, unknown>[])

  session.finalJson = document
  session.canvas = getCanvasFromJson('display', document)
  emit({ type: 'canvas', canvas: session.canvas })

  const step: AgentStep = {
    type: 'tool_call',
    content: `已组装图纸 "${args.pageName}"，包含 ${effectiveElements.length} 个图元`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)

  return JSON.stringify(document)
}

// 图符组装
export function handleAssembleSymbol({ name, args, session, onStep, emit }: ToolExecContext): string {
  const compsData = (args.compsData as Record<string, unknown>[])
  // 如果模型传了空数组或未传，自动使用 session 中已创建的所有图元
  const effectiveComps = (compsData && compsData.length > 0) ? compsData : session.workingElements
  if (effectiveComps.length === 0) {
    return JSON.stringify({
      success: false,
      error: '图符没有任何图元。请先成功调用 create_symbol_*，再调用 assemble_symbol。',
    })
  }
  const baseSymbol = session.currentJson
  const baseStore = baseSymbol?.store as Record<string, unknown> | undefined
  const builtSymbol = buildSymbolDocument({
    symbolName: (args.symbolName as string) || (baseSymbol?.name as string) || 'AI生成图符',
    compsData: effectiveComps,
    width: (args.width as number | undefined) ?? (baseSymbol?.width as number | undefined),
    height: (args.height as number | undefined) ?? (baseSymbol?.height as number | undefined),
    background: (args.background as string | undefined) ?? (baseSymbol?.background as string | undefined),
  })
  const symbol: Record<string, unknown> = baseSymbol ? {
    ...baseSymbol,
    ...builtSymbol,
    code: baseSymbol.code ?? builtSymbol.code,
    dataBindings: baseSymbol.dataBindings ?? builtSymbol.dataBindings,
    relatedProps: baseSymbol.relatedProps ?? builtSymbol.relatedProps,
    mainData: baseSymbol.mainData ?? builtSymbol.mainData,
    renderHTML: baseSymbol.renderHTML ?? builtSymbol.renderHTML,
    store: { ...baseStore, ...(builtSymbol.store as Record<string, unknown>) },
    comps: effectiveComps,
  } : builtSymbol

  if (session.symbolDataBindings.length > 0) {
    symbol.dataBindings = mergeDataBindings(symbol.dataBindings, session.symbolDataBindings)
  }
  session.finalJson = symbol
  session.canvas = getCanvasFromJson('symbol', symbol)
  emit({ type: 'canvas', canvas: session.canvas })

  const step: AgentStep = {
    type: 'tool_call',
    content: `已组装图符 "${args.symbolName}"，包含 ${effectiveComps.length} 个图元`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)

  return JSON.stringify(symbol)
}
