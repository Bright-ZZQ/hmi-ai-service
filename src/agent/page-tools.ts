/**
 * 页面级工具：图纸属性（set_page_property）与页面参数声明（declare_page_params）
 *
 * 属性与参数先记录在会话中，assemble_display 时统一写入 document.pageProperty / document.pageParams，
 * 与 set_display_script 等脚本类工具的“先登记、后组装”方式一致。
 */

import { randomUUID } from 'node:crypto'
import { isRecord } from './element-lookup'
import { fail, ok, recordStep } from './tool-context'
import type { Rec, ToolHandler } from './tool-context'

const MAX_CANVAS_SIZE = 20000
const MIN_REFRESH_CYCLE_MS = 10
const MAX_REFRESH_CYCLE_MS = 3600000
const FIT_MODES = [0, 1, 2, 3, 4, 5]
const ONLINE_OPERATIONS = ['editable', 'recoverable', 'playbackable', 'fullable', 'screenshotable']
const MAX_PARAM_NAME_LENGTH = 64
const MAX_DECLARED_PARAMS = 100

function positiveSize(value: unknown): number | undefined {
  const num = Number(value)
  return value !== undefined && value !== null && value !== '' && Number.isFinite(num) && num > 0 && num <= MAX_CANVAS_SIZE
    ? Math.round(num)
    : undefined
}

const handleSetPageProperty: ToolHandler = (ctx) => {
  const { args, session } = ctx
  if (session.editorType !== 'display') return fail('set_page_property 仅适用于图纸')

  const changes: Rec = {}
  const applied: string[] = []

  for (const key of ['pageWidth', 'pageHeight'] as const) {
    if (args[key] === undefined) continue
    const size = positiveSize(args[key])
    if (size === undefined) return fail(`${key} 必须是 1~${MAX_CANVAS_SIZE} 之间的数字`)
    changes[key] = size
    changes[key === 'pageWidth' ? 'width' : 'height'] = size
    applied.push(`${key}=${size}`)
  }
  if (args.bgColor !== undefined) {
    if (typeof args.bgColor !== 'string' || !args.bgColor.trim()) return fail('bgColor 必须是颜色字符串，如 #0b1a2e')
    changes.bgColor = args.bgColor.trim()
    applied.push(`bgColor=${changes.bgColor}`)
  }
  if (args.refreshCycle !== undefined) {
    const cycle = Number(args.refreshCycle)
    if (!Number.isFinite(cycle) || cycle < MIN_REFRESH_CYCLE_MS || cycle > MAX_REFRESH_CYCLE_MS) {
      return fail(`refreshCycle（毫秒）必须在 ${MIN_REFRESH_CYCLE_MS}~${MAX_REFRESH_CYCLE_MS} 之间`)
    }
    changes.refreshCycle = Math.round(cycle)
    applied.push(`refreshCycle=${changes.refreshCycle}`)
  }
  if (args.fitMode !== undefined) {
    const mode = Number(args.fitMode)
    if (!FIT_MODES.includes(mode)) return fail('fitMode 必须是 0(不适应)/1(宽度)/2(高度)/3(等比适应)/4(填充)/5(拉伸)')
    changes.fitMode = mode
    applied.push(`fitMode=${mode}`)
  }
  for (const key of ['zoomEnable', 'translateEnable', 'dynaAnimation'] as const) {
    if (args[key] === undefined) continue
    if (typeof args[key] !== 'boolean') return fail(`${key} 必须是布尔值`)
    changes[key] = args[key]
    applied.push(`${key}=${String(args[key])}`)
  }
  if (args.onlineOperations !== undefined) {
    if (!Array.isArray(args.onlineOperations)) return fail('onlineOperations 必须是字符串数组')
    const invalid = args.onlineOperations.filter(item => !ONLINE_OPERATIONS.includes(String(item)))
    if (invalid.length > 0) return fail(`onlineOperations 含不支持的值：${invalid.join('、')}，可选 ${ONLINE_OPERATIONS.join('/')}`)
    changes.onlineOperations = [...new Set(args.onlineOperations.map(String))]
    applied.push(`onlineOperations=${(changes.onlineOperations as string[]).join(',') || '空'}`)
  }
  if (applied.length === 0) return fail('至少需要提供一个要修改的图纸属性')

  Object.assign(session.pageProperty, changes)
  if (changes.pageWidth !== undefined || changes.pageHeight !== undefined || changes.bgColor !== undefined) {
    session.canvas = {
      ...session.canvas,
      ...(changes.pageWidth !== undefined ? { pageWidth: changes.pageWidth as number } : {}),
      ...(changes.pageHeight !== undefined ? { pageHeight: changes.pageHeight as number } : {}),
      ...(changes.bgColor !== undefined ? { bgColor: changes.bgColor as string } : {}),
    }
    ctx.emit({ type: 'canvas', canvas: session.canvas })
  }
  recordStep(ctx, `已设置图纸属性：${applied.join('，')}`)
  return ok({ applied, message: '图纸属性已登记，请调用 assemble_display 输出完整图纸' })
}

// ============================================================
// 页面参数声明
// ============================================================

/** 与 PageParamsType 对应：整数 0 / 浮点 1 / 布尔 2 / 字符 3 / 颜色 4 / 点名 TP 8 / 字符 TP 9 */
const PARAM_TYPES: Record<string, number> = {
  int: 0,
  float: 1,
  boolean: 2,
  string: 3,
  color: 4,
  tag_tp: 8,
  string_tp: 9,
}
const TP_TYPES = new Set([8, 9])
const INVALID_NAME = /['"`\s]/

function coerceParamValue(type: number, value: unknown): { value: unknown } | { error: string } {
  switch (type) {
    case 0:
    case 1: {
      const num = value === undefined || value === '' ? 0 : Number(value)
      if (!Number.isFinite(num)) return { error: '数值型参数的 value 必须是数字' }
      return { value: type === 0 ? Math.trunc(num) : num }
    }
    case 2:
      return { value: value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0 }
    default:
      return { value: value === undefined || value === null ? '' : String(value) }
  }
}

function existingParams(session: { currentJson?: Rec }): Rec[] {
  const document = isRecord(session.currentJson?.document) ? session.currentJson.document : undefined
  return Array.isArray(document?.pageParams) ? (document.pageParams as unknown[]).filter(isRecord) : []
}

const handleDeclarePageParams: ToolHandler = (ctx) => {
  const { args, session } = ctx
  if (session.editorType !== 'display') return fail('declare_page_params 仅适用于图纸')
  if (!Array.isArray(args.params) || args.params.length === 0) return fail('params 必须是非空数组')
  if (args.params.length > MAX_DECLARED_PARAMS) return fail(`一次最多声明 ${MAX_DECLARED_PARAMS} 个页面参数`)

  const overwrite = args.overwrite === true
  const staged = new Map<string, Rec>()
  const known = [...existingParams(session), ...session.pageParamDecls]
  const tpTaken = (type: number, index: number, name: string) => [...known, ...staged.values()]
    .some(param => param.type === type && Number(param.tpIndex) === index && param.name !== name)

  for (const [position, raw] of args.params.entries()) {
    if (!isRecord(raw)) return fail(`params[${position}] 必须是对象`)
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name) return fail(`params[${position}] 缺少 name`)
    if (name.length > MAX_PARAM_NAME_LENGTH || INVALID_NAME.test(name)) {
      return fail(`参数名 "${name}" 不合法：不能含空白、引号，且不超过 ${MAX_PARAM_NAME_LENGTH} 个字符（脚本以字符串字面量引用它）`)
    }
    const typeName = typeof raw.type === 'string' ? raw.type : 'float'
    if (!Object.prototype.hasOwnProperty.call(PARAM_TYPES, typeName)) {
      return fail(`参数 ${name} 的 type 不支持：${typeName}，可选 ${Object.keys(PARAM_TYPES).join('/')}`)
    }
    const type = PARAM_TYPES[typeName]
    const coerced = coerceParamValue(type, raw.value)
    if ('error' in coerced) return fail(`参数 ${name}：${coerced.error}`)

    const param: Rec = {
      id: randomUUID(),
      name,
      desc: typeof raw.desc === 'string' ? raw.desc : '',
      type,
      value: coerced.value,
      editMode: 0,
    }
    if (TP_TYPES.has(type)) {
      const index = Number(raw.tpIndex)
      if (!Number.isInteger(index) || index < 1) return fail(`TP 参数 ${name} 必须提供不小于 1 的整数 tpIndex`)
      if (tpTaken(type, index, name)) return fail(`TP 参数 ${name} 的 tpIndex=${index} 与同类型已有参数重复`)
      param.tpIndex = index
    }
    staged.set(name, { ...param, overwrite })
  }

  const names = [...staged.keys()]
  session.pageParamDecls = [
    ...session.pageParamDecls.filter(decl => !staged.has(String(decl.name))),
    ...staged.values(),
  ]
  recordStep(ctx, `已声明页面参数：${names.join('、')}`)
  return ok({
    declared: names,
    message: overwrite
      ? '页面参数已登记（同名已有参数将被覆盖），请调用 assemble_display 输出完整图纸'
      : '页面参数已登记（同名已有参数保持不变），请调用 assemble_display 输出完整图纸',
  })
}

/** 把 declare_page_params 登记的参数并入图纸已有参数：同名默认保持原样，overwrite 时覆盖并沿用原 id */
export function ensureDeclaredPageParams(existing: unknown, decls: Rec[]): Rec[] {
  const params = Array.isArray(existing) ? [...existing] as Rec[] : []
  for (const decl of decls) {
    const { overwrite, ...param } = decl
    const index = params.findIndex(item => isRecord(item) && item.name === param.name)
    if (index < 0) {
      params.push(param)
    } else if (overwrite === true) {
      params[index] = { ...param, id: isRecord(params[index]) && params[index].id ? params[index].id : param.id }
    }
  }
  return params
}

export const PAGE_TOOL_HANDLERS: Record<string, ToolHandler> = {
  set_page_property: handleSetPageProperty,
  declare_page_params: handleDeclarePageParams,
}
