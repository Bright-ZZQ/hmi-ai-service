import {
  PAGE_SCRIPT_PARAMS,
  PIPE_SCRIPT_PARAMS,
  SYMBOL_FUNC_PARAMS,
  extractReadBindings,
  mergeDataBindings,
  mergePageScript,
  parseDataBindings,
  prepareScript,
} from './script-tools'
import type { ToolExecContext } from '../core/context'
import { isPlainObject } from '../core/session'
import {
  DISPLAY_EVENT_KEY,
  applyRotatePivot,
  finishFeatureAttach,
  resolveFeatureTarget,
  resolveRotatePivot,
  rotatePivotInfo,
} from './handlers'
import type { AgentStep } from '../../types'

// 图纸脚本：写入 pageProperty.scriptFunc（assemble_display 时合并）
export function handleSetDisplayScript(ctx: ToolExecContext): string {
  const { name, args, session, onStep } = ctx
  const prepared = prepareScript(args.script, PAGE_SCRIPT_PARAMS)
  if ('error' in prepared) {
    return JSON.stringify({ success: false, error: `${prepared.error}，请修正后重新调用` })
  }
  const pivot = resolveRotatePivot(session, args)
  if (pivot && 'error' in pivot) return JSON.stringify({ success: false, error: pivot.error })
  const pivotIds = pivot ? applyRotatePivot(ctx, pivot) : []
  const replace = args.mode === 'replace'
  const previous = session.displayScript
  session.displayScript = {
    script: previous && !replace ? mergePageScript(previous.script, prepared.script, false) : prepared.script,
    replace: replace || previous?.replace === true,
  }
  session.featureExecutions.push({
    toolName: name,
    elementKey: `${DISPLAY_EVENT_KEY}script${session.featureExecutions.length}`,
  })
  const step: AgentStep = {
    type: 'tool_call',
    content: replace ? '已替换图纸脚本' : '已添加图纸脚本',
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  return JSON.stringify({ success: true, message: '图纸脚本已设置，请调用 assemble_display 输出完整图纸', ...rotatePivotInfo(pivot, pivotIds) })
}

// 管道脚本：写入管道图元 store.pipeScript
export function handleSetPipeScript(ctx: ToolExecContext): string {
  const { args, session } = ctx
  const resolved = resolveFeatureTarget(session, args)
  if ('error' in resolved) return JSON.stringify({ success: false, error: resolved.error })
  const { target, element } = resolved
  if (element.type !== 'Pipeline') {
    return JSON.stringify({ success: false, error: `图元 ${target} 不是管道（当前类型 ${String(element.type)}），管道脚本只能用于 create_display_pipe 创建的管道` })
  }
  const prepared = prepareScript(args.script, PIPE_SCRIPT_PARAMS)
  if ('error' in prepared) {
    return JSON.stringify({ success: false, error: `${prepared.error}，请修正后重新调用` })
  }
  const elementStore = isPlainObject(element.store) ? { ...element.store } : {}
  elementStore.pipeScript = prepared.script
  if (args.enableFlowGroup !== false) elementStore.flowGroupEnabled = true
  element.store = elementStore
  return finishFeatureAttach(ctx, target, element, '管道脚本', '动态')
}

/** 图符 store 中承载结构化数据、不能由函数计算的键 */
const SYMBOL_NON_BINDABLE_STORE_KEYS = new Set([
  'shape', 'node_id', '_originInfo', 'events', 'dynamicDyna', 'interactiveDyna',
])

// 图符属性绑定函数：attrs/store 中的 { func, value }
export function handleSetSymbolAttrFunction(ctx: ToolExecContext): string {
  const { args, session } = ctx
  const resolved = resolveFeatureTarget(session, args)
  if ('error' in resolved) return JSON.stringify({ success: false, error: resolved.error })
  const { target, element } = resolved
  const fail = (error: string) => JSON.stringify({ success: false, error })

  const attr = typeof args.attr === 'string' ? args.attr.trim() : ''
  if (!attr) return fail('缺少 attr 参数')

  const prepared = prepareScript(args.script, SYMBOL_FUNC_PARAMS)
  if ('error' in prepared) return fail(`${prepared.error}，请修正后重新调用`)
  if (!/\breturn\b/.test(prepared.script)) return fail('属性绑定函数必须 return 属性值，请修正后重新调用')
  if (/^(attr|relatedProps)@/.test(prepared.script)) return fail('script 必须是函数体，不能以 attr@ / relatedProps@ 开头')

  const bindings = parseDataBindings(args.dataBindings)
  if ('error' in bindings) return fail(bindings.error)
  const declared = new Set<string>()
  const baseBindings = session.currentJson?.dataBindings
  for (const item of [...(Array.isArray(baseBindings) ? baseBindings : []), ...session.symbolDataBindings, ...bindings]) {
    if (isPlainObject(item) && typeof item.attr === 'string') declared.add(item.attr)
  }
  const missing = extractReadBindings(prepared.script).filter(key => !declared.has(key))
  if (missing.length > 0) {
    return fail(`脚本读取了未声明的数据绑定：${missing.join('、')}，请在 dataBindings 中声明后重新调用`)
  }

  const attrs = isPlainObject(element.attrs) ? element.attrs : {}
  const store = isPlainObject(element.store) ? element.store : {}
  const inAttrs = Object.prototype.hasOwnProperty.call(attrs, attr)
  const inStore = !inAttrs
    && Object.prototype.hasOwnProperty.call(store, attr)
    && !SYMBOL_NON_BINDABLE_STORE_KEYS.has(attr)
  if (!inAttrs && !inStore) {
    const available = [
      ...Object.keys(attrs),
      ...Object.keys(store).filter(key => !SYMBOL_NON_BINDABLE_STORE_KEYS.has(key)),
    ]
    return fail(`图元 ${target} 不存在可绑定的属性 ${attr}（不存在的属性运行时不生效）。可用属性：${available.join('、')}`)
  }

  const section = inAttrs ? attrs : store
  const current = section[attr]
  // 保留属性原值作为未触发函数时的初始值
  const initial = isPlainObject(current) && 'func' in current ? current.value : current
  const updated = { ...section, [attr]: { func: prepared.script, value: initial } }
  if (inAttrs) element.attrs = updated
  else element.store = updated

  session.symbolDataBindings = mergeDataBindings(session.symbolDataBindings, bindings)
  return finishFeatureAttach(ctx, target, element, `${attr} 属性函数`, '动态')
}
