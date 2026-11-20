/**
 * 批量与重复生成工具
 *
 * clone_element_grid / bulk_apply_feature / copy_features / import_point_table /
 * group_elements / ungroup_elements。仅适用于图纸（扁平图元，层级由 pId 表达）。
 *
 * 批量产物与逐个调用 create_* / add_feature_* 完全一致，并登记到 featureExecutions，
 * 因此生成计划中的 requiredFeatureTools 校验对批量结果同样有效。
 */

import { applyReplacements, expandTemplate, hasPlaceholder, mapElementStrings, mapFeatureStrings, mapStrings, parsePointTable, readReplacements } from './batch-utils'
import type { PointRow } from './batch-utils'
import { buildDisplayElement, getBaseFields, calcLocalRect, calcRoatePos, generateId } from '../lib/element-builders'
import {
  cloneSubtree,
  collectSubtreeIndices,
  freshenFeature,
  getElementBounds,
  getNodeId,
  topLevelIndices,
  transformElement,
  unionBounds,
} from '../lib/element-geometry'
import type { Bounds } from '../lib/element-geometry'
import { buildDynamicFeature, featureToolNameForType, isDynamicFeatureTool, isInteractiveFeatureTool } from '../feature/dynamic-feature-builders'
import { findElementIndex, getElementAliases, isRecord } from '../lib/element-lookup'
import { attachFeatureToElement, collectFeatureRefs, prepareFeature } from '../feature/feature-attach'
import type { FeatureRef } from '../feature/feature-attach'
import {
  emitDelete,
  emitUpdate,
  fail,
  getElementKey,
  ok,
  parseJsonArg,
  readFilter,
  recordStep,
  resolveTargetIndices,
  toStringList,
} from '../core/context'
import type { Rec, SessionState, ToolExecContext, ToolHandler } from '../core/context'

const MAX_GRID_CELLS = 100
const MAX_BULK_TARGETS = 200
const DEFAULT_GAP = 20
const CANVAS_MARGIN = 20

const round = (value: number) => Math.round(value * 100) / 100

function requireDisplay(session: SessionState, tool: string): string | undefined {
  return session.editorType === 'display' ? undefined : `${tool} 仅适用于图纸`
}

function baseElementIds(session: SessionState): Set<string> {
  const document = isRecord(session.currentJson?.document) ? session.currentJson.document : undefined
  const elements = Array.isArray(document?.elements) ? document.elements as Rec[] : []
  return new Set(elements.map(getNodeId).filter(Boolean))
}

function subtreeBounds(elements: Rec[], root: number): Bounds | undefined {
  return unionBounds(collectSubtreeIndices(elements, root).map(index => getElementBounds(elements[index])))
}

/** 登记克隆 / 复制出的特性，使 declare_generation_plan 的特性校验对批量结果同样生效 */
function recordFeatureExecutions(session: SessionState, element: Rec): void {
  const key = getElementAliases(element)[0]
  if (!key) return
  for (const ref of collectFeatureRefs(element)) {
    const toolName = ref.kind === '事件' ? 'add_event_definition' : featureToolNameForType(String(ref.feature.type))
    if (toolName) session.featureExecutions.push({ toolName, elementKey: key })
  }
}

function canvasOverflowWarning(session: SessionState, bounds: Bounds | undefined): string | undefined {
  if (!bounds) return undefined
  const right = bounds.x + bounds.width + CANVAS_MARGIN
  const bottom = bounds.y + bounds.height + CANVAS_MARGIN
  const { pageWidth, pageHeight } = session.canvas
  if (right <= pageWidth && bottom <= pageHeight && bounds.x >= 0 && bounds.y >= 0) return undefined
  return `生成内容的范围（右 ${Math.round(right)}px、下 ${Math.round(bottom)}px）超出当前画布 ${pageWidth}×${pageHeight}，`
    + '请在 assemble_display 传入更大的 pageWidth/pageHeight，或用 set_page_property / fit_to_canvas 处理'
}

function parseParams(value: unknown): { value: Rec } | { error: string } {
  const parsed = parseJsonArg(value)
  if ('error' in parsed) return { error: `paramsJson ${parsed.error}` }
  if (parsed.value === undefined) return { value: {} }
  return isRecord(parsed.value) ? { value: parsed.value } : { error: 'paramsJson 必须是 JSON 对象' }
}

// ============================================================
// clone_element_grid
// ============================================================

const handleCloneGrid: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'clone_element_grid')
  if (notDisplay) return fail(notDisplay)

  const target = typeof args.target === 'string' ? args.target.trim() : ''
  const rootIndex = target ? findElementIndex(session.workingElements, target) : -1
  if (rootIndex < 0) return fail(`未找到要复制的图元: ${target || '(缺少 target)'}`)

  const rows = Number(args.rows ?? 1)
  const cols = Number(args.cols ?? 1)
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return fail('rows、cols 必须是不小于 1 的整数')
  const cells = rows * cols
  if (cells < 2) return fail('rows × cols 至少为 2')
  if (cells > MAX_GRID_CELLS) return fail(`rows × cols 不能超过 ${MAX_GRID_CELLS}（当前 ${cells}）`)
  const gapX = args.gapX === undefined ? DEFAULT_GAP : Number(args.gapX)
  const gapY = args.gapY === undefined ? DEFAULT_GAP : Number(args.gapY)
  if (!Number.isFinite(gapX) || !Number.isFinite(gapY)) return fail('gapX、gapY 必须是数字')
  const startIndex = args.startIndex === undefined ? 1 : Number(args.startIndex)
  if (!Number.isInteger(startIndex)) return fail('startIndex 必须是整数')
  const replacements = readReplacements(args.replace)
  if ('error' in replacements) return fail(replacements.error)
  const nameTemplate = typeof args.nameTemplate === 'string' && args.nameTemplate.trim() ? args.nameTemplate.trim() : undefined

  const bounds = subtreeBounds(session.workingElements, rootIndex)
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return fail('该图元没有有效的外接矩形，无法按网格复制')

  const columnMajor = args.direction === 'column'
  const originalName = String(session.workingElements[rootIndex].name ?? '图元')
  const created: Rec[] = []
  const names: string[] = []
  for (let k = 1; k < cells; k++) {
    const row = columnMajor ? k % rows : Math.floor(k / cols)
    const col = columnMajor ? Math.floor(k / rows) : k % cols
    const vars = { n: startIndex + k, i: k, row: row + 1, col: col + 1, name: originalName }
    const dx = col * (bounds.width + gapX)
    const dy = row * (bounds.height + gapY)

    const clones = cloneSubtree(session.workingElements, rootIndex).map((clone, position) => {
      let next = transformElement(clone, { dx, dy })
      if (replacements.length > 0) {
        next = mapFeatureStrings(next, text => applyReplacements(text, replacements, vars))
      }
      if (position === 0) {
        next.name = nameTemplate ? expandTemplate(nameTemplate, vars) : `${originalName}_${vars.n}`
      }
      return next
    })
    names.push(String(clones[0].name))
    created.push(...clones)
  }

  session.workingElements.push(...created)
  for (const element of created) recordFeatureExecutions(session, element)
  ctx.emit({ type: 'element', elements: created, isBackground: false })

  const all = unionBounds([bounds, ...created.map(getElementBounds)])
  const warning = canvasOverflowWarning(session, all)
  recordStep(ctx, `已将 "${originalName}" 按 ${rows}×${cols} 网格复制出 ${cells - 1} 份`)
  return ok({
    created: cells - 1,
    elementsAdded: created.length,
    names: names.slice(0, 30),
    area: all ? { x: round(all.x), y: round(all.y), width: round(all.width), height: round(all.height) } : undefined,
    ...(warning ? { warning } : {}),
  })
}

// ============================================================
// bulk_apply_feature
// ============================================================

function expandParams(value: unknown, vars: Record<string, string | number>): unknown {
  if (typeof value === 'string') return hasPlaceholder(value) ? expandTemplate(value, vars) : value
  if (Array.isArray(value)) return value.map(item => expandParams(item, vars))
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandParams(item, vars)]))
  return value
}

const handleBulkApplyFeature: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'bulk_apply_feature')
  if (notDisplay) return fail(notDisplay)

  const feature = typeof args.feature === 'string' ? args.feature : ''
  if (!isDynamicFeatureTool(feature) && !isInteractiveFeatureTool(feature)) {
    return fail(`feature 必须是 add_feature_* 工具名（如 add_feature_blink），当前: ${feature || '(空)'}`)
  }
  const params = parseParams(args.paramsJson)
  if ('error' in params) return fail(params.error)
  const startIndex = args.startIndex === undefined ? 1 : Number(args.startIndex)
  if (!Number.isInteger(startIndex)) return fail('startIndex 必须是整数')

  const resolved = resolveTargetIndices(session, args.targets, readFilter(args.filter))
  if ('error' in resolved) return fail(resolved.error)
  if (resolved.indices.length > MAX_BULK_TARGETS) return fail(`一次最多处理 ${MAX_BULK_TARGETS} 个图元（当前 ${resolved.indices.length}）`)

  const applied: string[] = []
  const failed: string[] = []
  resolved.indices.forEach((index, position) => {
    const element = session.workingElements[index]
    const label = String(element.name ?? getElementKey(element))
    const vars = { n: startIndex + position, i: position, name: label, id: getElementKey(element) }
    const featureArgs = expandParams(params.value, vars) as Rec
    const prepared = prepareFeature(feature, featureArgs, element, session.editorType)
    if ('error' in prepared) {
      failed.push(`${label}: ${prepared.error}`)
      return
    }
    attachFeatureToElement(element, prepared.storeKey, prepared.feature)
    session.featureExecutions.push({ toolName: feature, elementKey: getElementAliases(element)[0] || getElementKey(element) })
    emitUpdate(ctx, element)
    applied.push(label)
  })

  if (applied.length === 0) return fail(`所有图元都添加失败：${failed.slice(0, 5).join('；')}`)
  recordStep(ctx, `已为 ${applied.length} 个图元批量添加 ${feature}${failed.length ? `（${failed.length} 个失败）` : ''}`)
  return ok({
    applied: applied.length,
    targets: applied.slice(0, 30),
    ...(failed.length > 0 ? { failed: failed.slice(0, 20) } : {}),
    message: '请调用 assemble_display 输出完整图纸',
  })
}

// ============================================================
// copy_features
// ============================================================

const COPY_KINDS = ['dynamic', 'interactive', 'event'] as const

const handleCopyFeatures: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'copy_features')
  if (notDisplay) return fail(notDisplay)

  const from = typeof args.from === 'string' ? args.from.trim() : ''
  const sourceIndex = from ? findElementIndex(session.workingElements, from) : -1
  if (sourceIndex < 0) return fail(`未找到源图元: ${from || '(缺少 from)'}`)
  const source = session.workingElements[sourceIndex]

  const kinds = toStringList(args.kinds)
  const invalidKind = kinds.find(kind => !(COPY_KINDS as readonly string[]).includes(kind))
  if (invalidKind) return fail(`kinds 含不支持的值 ${invalidKind}，可选 ${COPY_KINDS.join('/')}`)
  const wantedKinds = new Set(kinds.length > 0 ? kinds : ['dynamic', 'interactive'])
  const kindMap: Record<string, string> = { 动态: 'dynamic', 交互: 'interactive', 事件: 'event' }
  const types = toStringList(args.featureTypes)

  const refs: FeatureRef[] = collectFeatureRefs(source).filter((ref) => {
    if (!wantedKinds.has(kindMap[ref.kind])) return false
    if (types.length === 0) return true
    const type = String(ref.feature.type)
    return types.includes(type) || types.includes(featureToolNameForType(type) ?? '')
  })
  if (refs.length === 0) return fail('源图元上没有符合条件的特性，请先用 list_features 查看')

  const replacements = readReplacements(args.replace)
  if ('error' in replacements) return fail(replacements.error)
  const startIndex = args.startIndex === undefined ? 1 : Number(args.startIndex)
  if (!Number.isInteger(startIndex)) return fail('startIndex 必须是整数')
  const replaceMode = args.mode === 'replace'

  const resolved = resolveTargetIndices(session, args.to, readFilter(args.filter))
  if ('error' in resolved) return fail(resolved.error)
  const targets = resolved.indices.filter(index => index !== sourceIndex)
  if (targets.length === 0) return fail('目标图元不能只有源图元本身')
  if (targets.length > MAX_BULK_TARGETS) return fail(`一次最多处理 ${MAX_BULK_TARGETS} 个图元`)

  let copies = 0
  targets.forEach((index, position) => {
    const element = session.workingElements[index]
    const vars = { n: startIndex + position, i: position, name: String(element.name ?? '') }
    if (replaceMode) {
      const replacedTypes = new Set(refs.map(ref => String(ref.feature.type)))
      for (const key of ['dynamicDyna', 'interactiveDyna'] as const) {
        const hasKind = refs.some(ref => ref.key === key)
        if (!hasKind) continue
        const existing = collectFeatureRefs(element).filter(ref => ref.key === key && replacedTypes.has(String(ref.feature.type)))
        if (existing.length === 0) continue
        const drop = new Set(existing.map(ref => ref.feature))
        const store = isRecord(element.store) ? { ...element.store } : undefined
        if (store && Array.isArray(store[key])) store[key] = (store[key] as Rec[]).filter(item => !drop.has(item))
        if (store) element.store = store
        if (Array.isArray(element[key])) element[key] = (element[key] as Rec[]).filter(item => !drop.has(item))
      }
    }
    for (const ref of refs) {
      const fresh = freshenFeature(structuredClone(ref.feature), ref.kind === '事件')
      const copy = replacements.length > 0
        ? mapStrings(fresh, text => applyReplacements(text, replacements, vars))
        : fresh
      if (ref.kind === '事件') {
        // 事件的目标图元若是源图元自身，复制后应作用于接收事件的图元
        const sourceId = getNodeId(source)
        if (sourceId && Array.isArray(copy.nodes)) {
          copy.nodes = (copy.nodes as unknown[]).map(node => (node === sourceId ? getNodeId(element) || node : node))
        }
        const store = isRecord(element.store) ? { ...element.store } : {}
        element.store = { ...store, events: [...(Array.isArray(store.events) ? store.events as Rec[] : []), copy] }
      } else {
        attachFeatureToElement(element, ref.key as 'dynamicDyna' | 'interactiveDyna', copy)
      }
      const toolName = ref.kind === '事件' ? 'add_event_definition' : featureToolNameForType(String(ref.feature.type))
      if (toolName) session.featureExecutions.push({ toolName, elementKey: getElementAliases(element)[0] || getElementKey(element) })
      copies++
    }
    emitUpdate(ctx, element)
  })

  recordStep(ctx, `已把 ${refs.length} 个特性从 "${String(source.name ?? from)}" 复制到 ${targets.length} 个图元`)
  return ok({
    targets: targets.length,
    featuresPerTarget: refs.length,
    copies,
    mode: replaceMode ? 'replace' : 'append',
    message: '请调用 assemble_display 输出完整图纸',
  })
}

// ============================================================
// import_point_table
// ============================================================

const POINT_TABLE_COLUMNS = ['point', 'name', 'unit', 'min', 'max', 'device'] as const
const DEFAULT_CELL_WIDTH = 420
const DEFAULT_ROW_HEIGHT = 36
const DEFAULT_ROW_GAP = 6
const DEFAULT_FONT_SIZE = 16

interface GridLayout {
  originX: number
  originY: number
  cols: number
  cellWidth: number
  cellHeight: number
  gapX: number
  gapY: number
  columnMajor: boolean
  rows: number
}

function cellOffset(layout: GridLayout, k: number): { dx: number, dy: number, row: number, col: number } {
  const row = layout.columnMajor ? k % layout.rows : Math.floor(k / layout.cols)
  const col = layout.columnMajor ? Math.floor(k / layout.rows) : k % layout.cols
  return {
    row,
    col,
    dx: col * (layout.cellWidth + layout.gapX),
    dy: row * (layout.cellHeight + layout.gapY),
  }
}

function readLayout(args: Rec, count: number, defaults: { cellWidth: number, cellHeight: number, originX: number, originY: number }): GridLayout | { error: string } {
  const num = (key: string, fallback: number) => (args[key] === undefined ? fallback : Number(args[key]))
  const layout = {
    originX: num('x', defaults.originX),
    originY: num('y', defaults.originY),
    cols: num('cols', 1),
    cellWidth: num('cellWidth', defaults.cellWidth),
    cellHeight: num('cellHeight', defaults.cellHeight),
    gapX: num('gapX', DEFAULT_GAP),
    gapY: num('gapY', DEFAULT_ROW_GAP),
  }
  if (Object.values(layout).some(value => !Number.isFinite(value))) return { error: 'x、y、cols、cellWidth、cellHeight、gapX、gapY 必须是数字' }
  if (!Number.isInteger(layout.cols) || layout.cols < 1) return { error: 'cols 必须是不小于 1 的整数' }
  if (layout.cellWidth <= 0 || layout.cellHeight <= 0) return { error: 'cellWidth、cellHeight 必须大于 0' }
  const columnMajor = args.direction === 'column'
  return { ...layout, columnMajor, rows: Math.ceil(count / layout.cols) }
}

function buildRowElements(
  row: PointRow,
  layout: GridLayout,
  offset: { dx: number, dy: number },
  options: { fontSize: number, decimals: number, hasUnit: boolean },
): Rec[] {
  const x0 = layout.originX + offset.dx
  const y0 = layout.originY + offset.dy
  const labelW = layout.cellWidth * (options.hasUnit ? 0.5 : 0.55)
  const valueW = layout.cellWidth * (options.hasUnit ? 0.3 : 0.45)
  const unitW = layout.cellWidth - labelW - valueW
  const base = { y: y0, height: layout.cellHeight, fontSize: options.fontSize, textBaseline: 'middle' as const }

  const label = buildDisplayElement('Text', {
    ...base, text: row.name, x: x0, width: labelW, textAlign: 'left', fill: '#333333', name: `${row.name}-名称`,
  })
  const value = buildDisplayElement('Text', {
    ...base, text: '--', x: x0 + labelW, width: valueW, textAlign: 'right', fill: '#0066cc', bold: true, name: `${row.name}-数值`,
  })
  const feature = buildDynamicFeature('add_feature_num_display', {
    dataSourceKey: row.point,
    ofShow: options.decimals,
    align: 3,
  })
  attachFeatureToElement(value, 'dynamicDyna', feature)
  const elements = [label, value]
  if (options.hasUnit) {
    elements.push(buildDisplayElement('Text', {
      ...base, text: row.unit, x: x0 + labelW + valueW, width: unitW, textAlign: 'left', fill: '#666666', name: `${row.name}-单位`,
    }))
  }
  return elements
}

const handleImportPointTable: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'import_point_table')
  if (notDisplay) return fail(notDisplay)

  const data = typeof args.data === 'string' ? args.data : ''
  const columnsArg = parseJsonArg(args.columns)
  if ('error' in columnsArg) return fail(`columns ${columnsArg.error}`)
  let columns: Partial<Record<typeof POINT_TABLE_COLUMNS[number], string>> | undefined
  if (columnsArg.value !== undefined) {
    if (!isRecord(columnsArg.value)) return fail('columns 必须是 {"point":"表头名",...} 对象')
    columns = {}
    for (const key of POINT_TABLE_COLUMNS) {
      const header = columnsArg.value[key]
      if (typeof header === 'string' && header.trim()) columns[key] = header.trim()
    }
  }
  const table = parsePointTable(data, columns)
  if ('error' in table) return fail(table.error)
  const { rows, warnings } = table

  const fontSize = args.fontSize === undefined ? DEFAULT_FONT_SIZE : Number(args.fontSize)
  const decimals = args.decimals === undefined ? -1 : Number(args.decimals)
  if (!Number.isFinite(fontSize) || fontSize <= 0) return fail('fontSize 必须是正数')
  if (!Number.isInteger(decimals) || decimals < -1 || decimals > 6) return fail('decimals 必须是 -1（跟随全局小数位）或 0~6 的整数')

  const templateTarget = typeof args.templateTarget === 'string' ? args.templateTarget.trim() : ''
  if (templateTarget) return importWithTemplate(ctx, rows, warnings, templateTarget)

  const layout = readLayout(args, rows.length, {
    cellWidth: DEFAULT_CELL_WIDTH,
    cellHeight: DEFAULT_ROW_HEIGHT,
    originX: CANVAS_MARGIN,
    originY: CANVAS_MARGIN,
  })
  if ('error' in layout) return fail(layout.error)

  const hasUnit = rows.some(row => row.unit)
  const created: Rec[] = []
  rows.forEach((row, k) => {
    created.push(...buildRowElements(row, layout, cellOffset(layout, k), { fontSize, decimals, hasUnit }))
  })
  session.workingElements.push(...created)
  for (const element of created) recordFeatureExecutions(session, element)
  ctx.emit({ type: 'element', elements: created, isBackground: false })

  const area = unionBounds(created.map(getElementBounds))
  const warning = canvasOverflowWarning(session, area)
  recordStep(ctx, `已根据点表生成 ${rows.length} 行数值显示（${created.length} 个图元）`)
  return ok({
    rows: rows.length,
    elementsAdded: created.length,
    boundTo: rows.slice(0, 30).map(row => row.point),
    area: area ? { x: round(area.x), y: round(area.y), width: round(area.width), height: round(area.height) } : undefined,
    ...(warnings.length > 0 ? { notes: warnings.slice(0, 20) } : {}),
    ...(warning ? { warning } : {}),
  })
}

/** 以画布上的图元 / 组合为模板，每行点表复制一份并替换 {point} {name} {unit} {min} {max} {device} {n} 占位符 */
function importWithTemplate(ctx: ToolExecContext, rows: PointRow[], notes: string[], templateTarget: string): string {
  const { session, args } = ctx
  const templateIndex = findElementIndex(session.workingElements, templateTarget)
  if (templateIndex < 0) return fail(`未找到模板图元: ${templateTarget}`)
  const bounds = subtreeBounds(session.workingElements, templateIndex)
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return fail('模板图元没有有效的外接矩形')

  const layout = readLayout(args, rows.length, {
    cellWidth: bounds.width,
    cellHeight: bounds.height,
    originX: bounds.x,
    originY: bounds.y,
  })
  if ('error' in layout) return fail(layout.error)
  const startIndex = args.startIndex === undefined ? 1 : Number(args.startIndex)
  if (!Number.isInteger(startIndex)) return fail('startIndex 必须是整数')

  const templateName = String(session.workingElements[templateIndex].name ?? '模板')
  const created: Rec[] = []
  rows.forEach((row, k) => {
    const { dx, dy, row: r, col: c } = cellOffset(layout, k)
    const vars = {
      point: row.point, name: row.name, unit: row.unit, min: row.min, max: row.max, device: row.device,
      n: startIndex + k, i: k, row: r + 1, col: c + 1,
    }
    const shift = { dx: layout.originX - bounds.x + dx, dy: layout.originY - bounds.y + dy }
    const clones = cloneSubtree(session.workingElements, templateIndex).map((clone, position) => {
      const moved = transformElement(clone, shift)
      const mapped = mapElementStrings(moved, text => expandTemplate(text, vars))
      if (position === 0 && mapped.name === moved.name) mapped.name = `${templateName}_${vars.n}`
      return mapped
    })
    created.push(...clones)
  })

  session.workingElements.push(...created)
  for (const element of created) recordFeatureExecutions(session, element)

  // 模板只是占位：由本工具在本轮新建的模板删除；用户原有图元不动
  let templateRemoved = false
  if (args.keepTemplate !== true && !baseElementIds(session).has(getNodeId(session.workingElements[templateIndex]))) {
    const doomed = collectSubtreeIndices(session.workingElements, templateIndex)
    for (const index of [...doomed].sort((a, b) => b - a)) {
      emitDelete(ctx, session.workingElements[index])
      session.workingElements.splice(index, 1)
    }
    templateRemoved = true
  }
  ctx.emit({ type: 'element', elements: created, isBackground: false })

  const area = unionBounds(created.map(getElementBounds))
  const warning = canvasOverflowWarning(session, area)
  recordStep(ctx, `已以 "${templateName}" 为模板，根据点表生成 ${rows.length} 份`)
  return ok({
    rows: rows.length,
    elementsAdded: created.length,
    templateRemoved,
    ...(templateRemoved ? {} : { templateKept: '模板为画布已有图元或 keepTemplate=true，已保留' }),
    boundTo: rows.slice(0, 30).map(row => row.point),
    ...(notes.length > 0 ? { notes: notes.slice(0, 20) } : {}),
    ...(warning ? { warning } : {}),
  })
}

// ============================================================
// group_elements / ungroup_elements
// ============================================================

const IDENTITY_EPSILON = 1e-6

const handleGroup: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'group_elements')
  if (notDisplay) return fail(notDisplay)

  const resolved = resolveTargetIndices(session, args.targets, readFilter(args.filter))
  if ('error' in resolved) return fail(resolved.error)
  const elements = session.workingElements
  const members = topLevelIndices(elements, resolved.indices)
    .filter(index => getElementBounds(elements[index]) !== undefined && getNodeId(elements[index]))
  if (members.length < 2) return fail('组合至少需要 2 个有位置信息的图元')
  const parents = new Set(members.map(index => (typeof elements[index].pId === 'string' ? elements[index].pId as string : '0')))
  if (parents.size > 1) return fail('要组合的图元必须属于同一层级（不能分别位于不同的组合里）')
  const parent = [...parents][0]

  const box = unionBounds(members.map(index => subtreeBounds(elements, index))) as Bounds
  const width = Math.max(box.width, 1)
  const height = Math.max(box.height, 1)
  const first = elements[members[0]]
  const group: Rec = {
    id: generateId(),
    ...getBaseFields('Group', typeof first.layer === 'string' ? first.layer : '1'),
    name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : '组合',
    pId: parent,
    width,
    height,
    _originInfo: { width, height },
    localRect: calcLocalRect(box.x, box.y, width, height),
    roatePos: calcRoatePos(box.x, box.y, width, height),
    roateAngle: 0,
    zIndex: Math.min(...members.map(index => (typeof elements[index].zIndex === 'number' ? elements[index].zIndex as number : 0))),
  }

  const memberSet = new Set(members)
  const memberObjects = members.map(index => ({ ...elements[index], pId: group.id }))
  const next: Rec[] = []
  elements.forEach((element, index) => {
    if (index === members[0]) {
      next.push(group, ...memberObjects)
    } else if (!memberSet.has(index)) {
      next.push(element)
    }
  })
  elements.splice(0, elements.length, ...next)

  ctx.emit({ type: 'element', elements: [group], isBackground: false })
  for (const member of memberObjects) emitUpdate(ctx, member)
  recordStep(ctx, `已将 ${members.length} 个图元组合为 "${String(group.name)}"`)
  return ok({ group: { id: group.id, name: group.name }, members: members.length })
}

const handleUngroup: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const notDisplay = requireDisplay(session, 'ungroup_elements')
  if (notDisplay) return fail(notDisplay)

  const target = typeof args.target === 'string' ? args.target.trim() : ''
  const index = target ? findElementIndex(session.workingElements, target) : -1
  if (index < 0) return fail(`未找到组合图元: ${target || '(缺少 target)'}`)
  const elements = session.workingElements
  const group = elements[index]
  if (group.type !== 'Group') return fail(`图元 ${target} 不是组合（当前类型 ${String(group.type)}）`)

  const near = (value: unknown, expected: number) => value === undefined || value === null || Math.abs(Number(value) - expected) < IDENTITY_EPSILON
  if (!near(group.scaleX, 1) || !near(group.scaleY, 1) || !near(group.roateAngle, 0) || group.horMirror === true || group.verMirror === true) {
    return fail('该组合带有缩放、旋转或镜像变换，直接拆分会让子图元错位，已拒绝；请在编辑器中手动取消组合')
  }

  const groupId = getNodeId(group)
  const parent = typeof group.pId === 'string' ? group.pId : '0'
  const children = elements.filter(element => element.pId === groupId)
  const childSet = new Set(children)
  const lifted: Rec[] = children.map(child => ({ ...child, pId: parent }))

  const next: Rec[] = []
  for (const element of elements) {
    if (element === group) next.push(...lifted)
    else if (!childSet.has(element)) next.push(element)
  }
  // 编辑器保存的 zIndex 是“在父节点内的顺序”：把同级（含被释放的子图元）按数组顺序整体重新编号，避免与同级图元冲突
  const liftedSet = new Set(lifted)
  const released: Rec[] = []
  let rank = 0
  const finalList = next.map((element) => {
    const isSibling = (typeof element.pId === 'string' ? element.pId : '0') === parent
    if (!isSibling) return element
    const updated = { ...element, zIndex: rank++ }
    if (liftedSet.has(element)) released.push(updated)
    return updated
  })
  elements.splice(0, elements.length, ...finalList)

  emitDelete(ctx, group)
  for (const child of released) emitUpdate(ctx, child)
  recordStep(ctx, `已取消组合 "${String(group.name ?? target)}"，释放 ${children.length} 个子图元`)
  return ok({ released: children.length })
}

export const BATCH_TOOL_HANDLERS: Record<string, ToolHandler> = {
  clone_element_grid: handleCloneGrid,
  bulk_apply_feature: handleBulkApplyFeature,
  copy_features: handleCopyFeatures,
  import_point_table: handleImportPointTable,
  group_elements: handleGroup,
  ungroup_elements: handleUngroup,
}
