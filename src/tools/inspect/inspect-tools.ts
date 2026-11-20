/**
 * 检查与特性读写工具：list_features / remove_feature / update_feature / get_element_detail /
 * check_feature_conditions / lint_display / test_script
 *
 * 特性读写同时适用于图纸与图符（特性都在 store.dynamicDyna / interactiveDyna）；
 * lint_display 仅适用于图纸；test_script 按编辑器类型提供不同的脚本类型。
 */

import {
  buildConditionEntry,
  featureToolNameForType,
  modelPoint,
} from '../feature/dynamic-feature-builders'
import { decodeText, findElementIndex, isRecord } from '../lib/element-lookup'
import { collectFeatureRefs, featureId, mapFeatureLists } from '../feature/feature-attach'
import type { FeatureRef } from '../feature/feature-attach'
import { getElementBounds } from '../lib/element-geometry'
import { lintDisplay } from './lint-display'
import { SCRIPT_KINDS, runScriptInSandbox } from '../feature/script-sandbox'
import type { ScriptKind } from '../feature/script-sandbox'
import { PAGE_SCRIPT_PARAMS, PIPE_SCRIPT_PARAMS, SYMBOL_FUNC_PARAMS, prepareScript } from '../feature/script-tools'
import { emitUpdate, fail, getElementKey, ok, parseJsonArg, recordStep } from '../core/context'
import type { Rec, SessionState, ToolExecContext, ToolHandler } from '../core/context'

const OPERATOR_LABELS = ['=', '!=', '>', '<', '>=', '<=', '包含', '不包含', '在之间', '不在之间', '位运算']
const NUMERIC_OPERATORS = new Set([2, 3, 4, 5])
const MAX_LISTED_ELEMENTS = 60
const MAX_DETAIL_CHARS = 6000
const MAX_DETAIL_PATHS = 20
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function conditionText(condition: Rec): string {
  const left = isRecord(condition.leftValue) ? condition.leftValue : {}
  const point = String(left.nodeId || left.tagName || '(未指定测点)')
  const sign = OPERATOR_LABELS[Number(condition.sign)] ?? `运算符${String(condition.sign)}`
  const right = isRecord(condition.rightValue) ? condition.rightValue.original : condition.rightValue
  return `${point} ${sign} ${String(right ?? '')}`
}

function describeFeature(ref: FeatureRef): Rec {
  const { feature, kind } = ref
  const type = String(feature.type ?? '')
  const summary: Rec = {
    index: ref.index,
    kind,
    id: featureId(feature, kind),
    type,
  }
  if (kind === '事件') {
    summary.title = feature.title ?? ''
    summary.trigger = feature.type
    const actions = Array.isArray(feature.actions) ? feature.actions : []
    summary.actions = actions.map(action => (isRecord(action) ? action.fnName : '')).filter(Boolean)
    return summary
  }
  summary.tool = featureToolNameForType(type)
  if (Array.isArray(feature.conditions) && feature.conditions.length > 0) {
    summary.conditions = feature.conditions.filter(isRecord).map(conditionText)
    if (feature.not === true) summary.not = true
  }
  if (Array.isArray(feature.multiStateConditions)) {
    summary.states = feature.multiStateConditions.filter(isRecord).map(state => ({
      value: state.value,
      when: Array.isArray(state.conditions) ? state.conditions.filter(isRecord).map(conditionText).join(' 且 ') : '',
    }))
  }
  const points: string[] = []
  const scalars: Rec = {}
  const pars = isRecord(feature.pars) ? feature.pars : {}
  for (const [key, par] of Object.entries(pars)) {
    const original = isRecord(par) ? par.original : par
    if (isRecord(original) && 'nodeId' in original) {
      if (original.nodeId) points.push(`${key}=${String(original.nodeId)}`)
    } else if (['string', 'number', 'boolean'].includes(typeof original) && Object.keys(scalars).length < 12) {
      scalars[key] = original
    }
  }
  if (points.length > 0) summary.points = points
  if (Object.keys(scalars).length > 0) summary.params = scalars
  if (kind === '交互' && feature.act !== undefined) summary.act = feature.act
  return summary
}

function elementLabel(element: Rec): string {
  const attrs = isRecord(element.attrs) ? element.attrs : {}
  return String(element.name ?? attrs.name ?? getElementKey(element))
}

function resolveElement(session: SessionState, target: unknown): { index: number, element: Rec } | { error: string } {
  const key = typeof target === 'string' ? target.trim() : ''
  if (!key) return { error: '缺少 target（图元 id 或名称）' }
  const index = findElementIndex(session.workingElements, key)
  if (index < 0) return { error: `未找到图元: ${key}` }
  return { index, element: session.workingElements[index] }
}

// ============================================================
// list_features
// ============================================================

const handleListFeatures: ToolHandler = (ctx) => {
  const { session, args } = ctx
  if (typeof args.target === 'string' && args.target.trim()) {
    const resolved = resolveElement(session, args.target)
    if ('error' in resolved) return fail(resolved.error)
    const refs = collectFeatureRefs(resolved.element)
    return ok({
      element: { id: getElementKey(resolved.element), name: elementLabel(resolved.element) },
      total: refs.length,
      features: refs.map(describeFeature),
    })
  }
  const rows = session.workingElements
    .map(element => ({ element, refs: collectFeatureRefs(element) }))
    .filter(row => row.refs.length > 0)
  return ok({
    elementCount: rows.length,
    elements: rows.slice(0, MAX_LISTED_ELEMENTS).map(({ element, refs }) => ({
      id: getElementKey(element),
      name: elementLabel(element),
      features: refs.map(ref => `${ref.index}.${ref.kind}:${String(ref.feature.type ?? '')}`),
    })),
    ...(rows.length > MAX_LISTED_ELEMENTS ? { truncated: true, hint: '指定 target 可查看某个图元的完整特性详情' } : {}),
  })
}

// ============================================================
// remove_feature
// ============================================================

function selectFeatureRefs(refs: FeatureRef[], args: Rec): { picked: FeatureRef[] } | { error: string } {
  const id = typeof args.featureId === 'string' ? args.featureId.trim() : ''
  const type = typeof args.featureType === 'string' ? args.featureType.trim() : ''
  const index = args.index === undefined ? undefined : Number(args.index)
  if (!id && !type && index === undefined) return { error: '必须提供 featureId、index（来自 list_features）或 featureType 之一' }

  let picked = refs
  if (id) picked = picked.filter(ref => featureId(ref.feature, ref.kind) === id)
  if (index !== undefined) picked = picked.filter(ref => ref.index === index)
  if (type) {
    picked = picked.filter(ref => String(ref.feature.type) === type || featureToolNameForType(String(ref.feature.type)) === type)
  }
  if (picked.length === 0) return { error: '没有匹配的特性，请先用 list_features 查看' }
  return { picked }
}

const handleRemoveFeature: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const resolved = resolveElement(session, args.target)
  if ('error' in resolved) return fail(resolved.error)
  const { element } = resolved

  const selected = selectFeatureRefs(collectFeatureRefs(element), args)
  if ('error' in selected) return fail(selected.error)
  const { picked } = selected
  if (picked.length > 1 && args.all !== true) {
    return fail(`匹配到 ${picked.length} 个特性：${picked.map(ref => `#${ref.index} ${String(ref.feature.type)}`).join('、')}。`
      + '请用 featureId 或 index 指定其中一个；确需全部删除时传 all=true')
  }

  const removed = new Set(picked.map(ref => ref.feature))
  for (const key of ['dynamicDyna', 'interactiveDyna'] as const) {
    mapFeatureLists(element, key, list => list.filter(feature => !removed.has(feature)))
  }
  if (picked.some(ref => ref.kind === '事件')) {
    const store = isRecord(element.store) ? { ...element.store } : undefined
    if (store && Array.isArray(store.events)) {
      store.events = (store.events as unknown[]).filter(event => !removed.has(event as Rec))
      element.store = store
    }
    if (Array.isArray(element.events)) element.events = (element.events as unknown[]).filter(event => !removed.has(event as Rec))
  }

  // 已删除的特性不应继续满足生成计划
  const aliases = new Set([getElementKey(element), elementLabel(element)])
  for (const ref of picked) {
    const toolName = ref.kind === '事件' ? 'add_event_definition' : featureToolNameForType(String(ref.feature.type))
    const at = session.featureExecutions.findIndex(execution => execution.toolName === toolName && aliases.has(execution.elementKey))
    if (at >= 0) session.featureExecutions.splice(at, 1)
  }

  emitUpdate(ctx, element)
  recordStep(ctx, `已从图元 "${elementLabel(element)}" 删除 ${picked.length} 个特性`)
  return ok({ removed: picked.map(ref => ({ index: ref.index, kind: ref.kind, type: ref.feature.type })), message: '请调用 assemble 工具输出完整结果' })
}

// ============================================================
// update_feature
// ============================================================

function coerceParValue(existing: unknown, value: unknown): unknown {
  if (isRecord(existing) && 'nodeId' in existing && typeof value === 'string') return { ...existing, ...modelPoint(value) }
  if (typeof existing === 'number' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return value
}

const handleUpdateFeature: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const resolved = resolveElement(session, args.target)
  if ('error' in resolved) return fail(resolved.error)
  const { element } = resolved

  const refs = collectFeatureRefs(element).filter(ref => ref.kind !== '事件')
  const selected = selectFeatureRefs(refs, args)
  if ('error' in selected) return fail(selected.error)
  if (selected.picked.length > 1) {
    return fail(`匹配到 ${selected.picked.length} 个特性，请用 featureId 或 index 精确指定一个`)
  }
  const target = selected.picked[0].feature

  const parsedChanges = parseJsonArg(args.changesJson)
  if ('error' in parsedChanges) return fail(parsedChanges.error)
  const changes = isRecord(parsedChanges.value) ? parsedChanges.value : {}
  const conditionKey = typeof args.dataSourceKey === 'string' ? args.dataSourceKey.trim() : ''
  if (!isRecord(parsedChanges.value) && !conditionKey && args.clearConditions !== true) {
    return fail('没有任何修改：请提供 changesJson（如 {"pars":{"rotAngle":10}}），或条件参数 dataSourceKey / clearConditions')
  }

  const applied: string[] = []
  // 先在草稿上完成全部校验，全部通过后才一次性写回，避免失败时留下部分修改
  const draft: Rec = {}
  if (isRecord(changes.pars)) {
    const pars = isRecord(target.pars) ? { ...target.pars } : {}
    for (const [key, value] of Object.entries(changes.pars)) {
      if (BLOCKED_KEYS.has(key)) continue
      if (!(key in pars)) {
        return fail(`特性 ${String(target.type)} 不存在参数 ${key}，可用参数：${Object.keys(pars).join('、') || '无'}；需要新增不同模式的参数请删除后用 add_feature_* 重新添加`)
      }
      const existing = pars[key]
      if (isRecord(value) && 'original' in value) {
        pars[key] = value
      } else {
        const base = isRecord(existing) ? existing : {}
        pars[key] = { ...base, original: coerceParValue(base.original, value) }
      }
      applied.push(`pars.${key}`)
    }
    draft.pars = pars
  }
  for (const key of ['not', 'act'] as const) {
    if (changes[key] === undefined) continue
    if (key === 'not' && typeof changes.not !== 'boolean') return fail('not 必须是布尔值')
    if (key === 'act' && !Number.isFinite(Number(changes.act))) return fail('act 必须是数字')
    draft[key] = key === 'act' ? Number(changes.act) : changes.not
    applied.push(key)
  }
  if (Array.isArray(target.multiStateConditions) && (conditionKey || args.clearConditions === true)) {
    return fail('多状态特性的条件在各状态内，不能用 dataSourceKey / clearConditions 修改；请删除后用 add_feature_multistate_* 重新添加')
  }
  if (args.clearConditions === true) {
    draft.conditions = []
    applied.push('conditions(已清空)')
  } else if (conditionKey) {
    draft.conditions = [buildConditionEntry(conditionKey, args.conditionOperator, args.conditionValue)]
    applied.push('conditions')
  }
  if (applied.length === 0) return fail('changesJson 中没有可识别的修改项（支持 pars / not / act）')
  Object.assign(target, draft)

  emitUpdate(ctx, element)
  recordStep(ctx, `已修改图元 "${elementLabel(element)}" 的特性 ${String(target.type)}：${applied.join('、')}`)
  return ok({ updated: applied, feature: describeFeature(selected.picked[0]), message: '请调用 assemble 工具输出完整结果' })
}

// ============================================================
// get_element_detail
// ============================================================

function readPath(root: unknown, path: string): { found: boolean, value?: unknown } {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let current: unknown = root
  for (const segment of segments) {
    if (BLOCKED_KEYS.has(segment)) return { found: false }
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false }
      current = current[index]
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment]
    } else {
      return { found: false }
    }
  }
  return { found: true, value: current }
}

function clip(value: unknown): unknown {
  const text = JSON.stringify(value)
  if (text === undefined || text.length <= MAX_DETAIL_CHARS) return value
  return { truncated: true, chars: text.length, preview: `${text.slice(0, MAX_DETAIL_CHARS)}…` }
}

function describeShallow(element: Rec): Rec {
  const scalars: Rec = {}
  const nested: Rec = {}
  for (const [key, value] of Object.entries(element)) {
    if (typeof value === 'string') scalars[key] = value.length > 80 ? `${value.slice(0, 80)}…` : value
    else if (typeof value === 'number' || typeof value === 'boolean') scalars[key] = value
    else if (Array.isArray(value)) nested[key] = `array(${value.length})`
    else if (isRecord(value)) nested[key] = `object(${Object.keys(value).join(',').slice(0, 80)})`
  }
  return { scalars, nested }
}

const handleGetElementDetail: ToolHandler = (ctx) => {
  const { session, args } = ctx
  const resolved = resolveElement(session, args.target)
  if ('error' in resolved) return fail(resolved.error)
  const { element } = resolved

  const paths = Array.isArray(args.paths) ? args.paths.filter((path): path is string => typeof path === 'string' && path.trim() !== '') : []
  if (paths.length > MAX_DETAIL_PATHS) return fail(`一次最多读取 ${MAX_DETAIL_PATHS} 个 paths`)
  if (paths.length > 0) {
    const values: Rec = {}
    const missing: string[] = []
    for (const path of paths) {
      const read = readPath(element, path.trim())
      if (read.found) values[path] = clip(read.value)
      else missing.push(path)
    }
    return ok({ element: getElementKey(element), values, ...(missing.length > 0 ? { missing } : {}) })
  }

  const bounds = getElementBounds(element)
  const text = element.type === 'Text' ? decodeText(element.text) : undefined
  const refs = collectFeatureRefs(element)
  return ok({
    element: {
      id: getElementKey(element),
      name: elementLabel(element),
      type: element.type ?? element.className,
      ...(bounds ? { bounds: { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) } } : {}),
      ...(text !== undefined ? { text } : {}),
      features: refs.length,
      ...describeShallow(element),
    },
    hint: '用 paths（如 ["store.dynamicDyna","fillColor"]）读取具体字段的完整内容',
  })
}

// ============================================================
// check_feature_conditions
// ============================================================

interface ConditionIssue {
  element: string
  feature: string
  level: 'error' | 'warning'
  message: string
}

function isNumeric(value: unknown): boolean {
  return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
}

function checkConditionList(
  conditions: unknown,
  where: { element: string, feature: string },
  issues: ConditionIssue[],
): void {
  if (!Array.isArray(conditions)) return
  for (const item of conditions) {
    if (!isRecord(item)) continue
    const left = isRecord(item.leftValue) ? item.leftValue : {}
    const sign = Number(item.sign)
    const right = isRecord(item.rightValue) ? item.rightValue.original : item.rightValue
    const text = conditionText(item)
    if (!left.nodeId && !left.tagName) {
      issues.push({ ...where, level: 'error', message: `条件「${text}」没有测点` })
    }
    if (!Number.isInteger(sign) || sign < 0 || sign >= OPERATOR_LABELS.length) {
      issues.push({ ...where, level: 'error', message: `条件「${text}」的运算符 ${String(item.sign)} 不合法（应为 0~10）` })
      continue
    }
    if (NUMERIC_OPERATORS.has(sign) && !isNumeric(right)) {
      issues.push({ ...where, level: 'error', message: `条件「${text}」使用了数值比较运算符，但比较值 ${JSON.stringify(right ?? '')} 不是数字` })
    } else if (sign === 10 && !(isNumeric(right) && Number.isInteger(Number(right)))) {
      issues.push({ ...where, level: 'error', message: `条件「${text}」是位运算，比较值必须是整数` })
    } else if (right === undefined || right === null || String(right).trim() === '') {
      issues.push({ ...where, level: 'warning', message: `条件「${text}」的比较值为空` })
    }
    checkConditionList(item.conditions, where, issues)
  }
}

function checkFeature(element: string, ref: FeatureRef, issues: ConditionIssue[]): void {
  const { feature } = ref
  const type = String(feature.type ?? '')
  const where = { element, feature: `#${ref.index} ${type}` }
  checkConditionList(feature.conditions, where, issues)

  if (Array.isArray(feature.multiStateConditions)) {
    if (feature.multiStateConditions.length === 0) {
      issues.push({ ...where, level: 'error', message: '多状态特性没有任何状态' })
    }
    const seen = new Set<string>()
    for (const state of feature.multiStateConditions.filter(isRecord)) {
      checkConditionList(state.conditions, where, issues)
      const signature = Array.isArray(state.conditions) ? state.conditions.filter(isRecord).map(conditionText).join('&') : ''
      if (signature && seen.has(signature)) {
        issues.push({ ...where, level: 'warning', message: `多个状态使用了相同条件「${signature}」，后面的状态永远不会生效` })
      }
      seen.add(signature)
    }
  }

  const pars = isRecord(feature.pars) ? feature.pars : {}
  const ds = isRecord(pars.ds) ? pars.ds.original : undefined
  const currentTimeOnly = type === 'GraphDynaValDisplay'
    && isRecord(pars.useTime) && Number(pars.useTime.original) === 1
    && isRecord(pars.parTimeTy) && Number(pars.parTimeTy.original) === 0
  if (isRecord(pars.ds) && !currentTimeOnly && (!isRecord(ds) || (!ds.nodeId && !ds.tagName))) {
    issues.push({ ...where, level: 'error', message: '特性的数据源 ds 为空，运行时不会有任何效果' })
  }
}

const handleCheckFeatureConditions: ToolHandler = (ctx) => {
  const { session, args } = ctx
  let elements = session.workingElements
  if (typeof args.target === 'string' && args.target.trim()) {
    const resolved = resolveElement(session, args.target)
    if ('error' in resolved) return fail(resolved.error)
    elements = [resolved.element]
  }
  const issues: ConditionIssue[] = []
  let checked = 0
  for (const element of elements) {
    for (const ref of collectFeatureRefs(element).filter(item => item.kind !== '事件')) {
      checked++
      checkFeature(elementLabel(element), ref, issues)
    }
  }
  const errors = issues.filter(issue => issue.level === 'error').length
  recordStep(ctx, `特性检查完成：${checked} 个特性，${errors} 个错误，${issues.length - errors} 个警告`)
  return ok({
    checked,
    errors,
    warnings: issues.length - errors,
    issues: issues.slice(0, 50),
    ...(issues.length > 50 ? { truncated: true } : {}),
    ...(issues.length === 0 ? { message: '未发现问题' } : {}),
  })
}

// ============================================================
// lint_display
// ============================================================

const handleLintDisplay: ToolHandler = (ctx) => {
  const { session } = ctx
  if (session.editorType !== 'display') return fail('lint_display 仅适用于图纸')
  const issues = lintDisplay(session.workingElements, session.canvas)
  const errors = issues.filter(issue => issue.level === 'error').length
  recordStep(ctx, `图纸检查完成：${errors} 个错误，${issues.length - errors} 个提示`)
  return ok({
    canvas: { width: session.canvas.pageWidth, height: session.canvas.pageHeight },
    elementCount: session.workingElements.length,
    errors,
    issues,
    ...(issues.length === 0 ? { message: '未发现布局或交互问题' } : {}),
  })
}

// ============================================================
// test_script
// ============================================================

const KIND_PARAMS: Record<ScriptKind, string[]> = {
  event: ['data', 'gv', 'params'],
  value_changed: ['data', 'gv', 'value'],
  before_open: ['gv'],
  page: PAGE_SCRIPT_PARAMS,
  pipe: PIPE_SCRIPT_PARAMS,
  symbol_func: SYMBOL_FUNC_PARAMS,
}

function readRecordArg(value: unknown, label: string): { value?: Rec } | { error: string } {
  const parsed = parseJsonArg(value)
  if ('error' in parsed) return { error: `${label} ${parsed.error}` }
  if (parsed.value === undefined) return {}
  return isRecord(parsed.value) ? { value: parsed.value } : { error: `${label} 必须是 JSON 对象` }
}

const handleTestScript: ToolHandler = (ctx: ToolExecContext) => {
  const { session, args } = ctx
  const kind = args.kind as ScriptKind
  const allowed = session.editorType === 'symbol' ? ['symbol_func'] : SCRIPT_KINDS.filter(item => item !== 'symbol_func')
  if (!allowed.includes(kind)) return fail(`kind 必须是 ${allowed.join('/')} 之一`)

  const prepared = prepareScript(args.script, KIND_PARAMS[kind])
  if ('error' in prepared) return fail(prepared.error)

  const points = readRecordArg(args.points, 'points')
  if ('error' in points) return fail(points.error)
  const bindings = readRecordArg(args.bindings, 'bindings')
  if ('error' in bindings) return fail(bindings.error)

  const document = isRecord(session.currentJson?.document) ? session.currentJson.document : undefined
  const pageParams: Rec = {}
  const declared = [
    ...(Array.isArray(document?.pageParams) ? document.pageParams as unknown[] : []),
    ...session.pageParamDecls,
  ]
  for (const param of declared.filter(isRecord)) {
    if (typeof param.name === 'string') pageParams[param.name] = param.value
  }

  let target: string | undefined
  if (typeof args.target === 'string' && args.target.trim()) {
    const resolved = resolveElement(session, args.target)
    if ('error' in resolved) return fail(resolved.error)
    target = getElementKey(resolved.element)
  }
  if (kind === 'pipe' && !target) {
    return fail('管道脚本试跑需要 target 指向一个管道图元')
  }

  const nodes = session.workingElements.map((element) => {
    const bounds = getElementBounds(element)
    // 与运行时一致：getXEx/getYEx 返回旋转中心（roatePos，缺省为包围盒中心），而不是左上角
    const pivot = isRecord(element.roatePos) ? element.roatePos : undefined
    const pivotX = typeof pivot?.x === 'number' ? pivot.x : NaN
    const pivotY = typeof pivot?.y === 'number' ? pivot.y : NaN
    return {
      id: getElementKey(element),
      name: elementLabel(element),
      type: typeof element.type === 'string' ? element.type : undefined,
      x: Number.isFinite(pivotX) ? pivotX : bounds ? bounds.x + bounds.width / 2 : undefined,
      y: Number.isFinite(pivotY) ? pivotY : bounds ? bounds.y + bounds.height / 2 : undefined,
      width: bounds?.width,
      height: bounds?.height,
      text: element.type === 'Text' ? decodeText(element.text) : undefined,
    }
  })

  const result = runScriptInSandbox({
    script: prepared.script,
    kind,
    nodes,
    target,
    points: points.value,
    bindings: bindings.value,
    pageParams,
    mainValue: args.mainValue,
    maxTimerRuns: typeof args.maxTimerRuns === 'number' ? args.maxTimerRuns : undefined,
  })
  recordStep(ctx, result.ok ? '脚本试跑通过' : `脚本试跑失败：${result.error ?? ''}`)
  return JSON.stringify({
    success: result.ok,
    ...(result.error ? { error: `${result.error}。请修正脚本后再次试跑` } : {}),
    ...(result.returned !== undefined ? { returned: result.returned } : {}),
    calls: result.calls,
    warnings: result.warnings,
    timerRuns: result.timerRuns,
    note: '试跑基于模拟对象，仅验证 API 用法与基本逻辑，不代表真实测点数据下的最终效果',
  })
}

export const INSPECT_TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_features: handleListFeatures,
  remove_feature: handleRemoveFeature,
  update_feature: handleUpdateFeature,
  get_element_detail: handleGetElementDetail,
  check_feature_conditions: handleCheckFeatureConditions,
  lint_display: handleLintDisplay,
  test_script: handleTestScript,
}
