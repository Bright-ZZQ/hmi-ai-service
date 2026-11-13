/**
 * 事件定义 — 函数参考、参数校验与事件配置构造
 *
 * 对应编辑器“属性栏 - 控制 - 事件定义”：
 * - 图元级：写入图元 store.events，仅支持鼠标事件（单击/双击/移入/离开/悬停/按下/抬起）；
 * - 图纸级：写入 document.pageProperty.events，支持事件响应、定时执行、条件执行
 *   （数值变化 / 画面打开前 / 画面打开后）。
 * 运行时仅取 actions[0] 执行，因此一条事件只配置一个动作。
 */
import { randomUUID } from 'node:crypto'

export const MOUSE_EVENT_TYPES = [
  'onClick',
  'onDoubleClick',
  'onEnter',
  'onLeave',
  'onHover',
  'onDown',
  'onUp',
] as const

export type MouseEventType = typeof MOUSE_EVENT_TYPES[number]

export const DISPLAY_TRIGGERS = [
  'respond',
  'schedule',
  'valueChanged',
  'onOpenBefore',
  'onOpenAfter',
] as const

export type DisplayTrigger = typeof DISPLAY_TRIGGERS[number]

export const ACTION_KINDS = [
  'script',
  'visible',
  'move',
  'rotate',
  'scale',
  'size',
  'color',
  'openDialog',
  'openWindow',
] as const

export type ActionKind = typeof ACTION_KINDS[number]

export const SCHEDULE_TYPES = ['interval', 'daily', 'weekly', 'monthly'] as const

export type ScheduleType = typeof SCHEDULE_TYPES[number]

/** 目标为触发事件的图元自身 */
export const NODE_SELF = 'node-self'

/** 图元对象（data）可用函数参考 */
export const NODE_API_REFERENCE = `data：setVisibleEx(bool)/getVisibleEx() 显隐；setXEx/getXEx、setYEx/getYEx 位置；setRotationEx/getRotationEx 旋转；setScaleXEx/getScaleXEx、setScaleYEx/getScaleYEx 缩放；setWidthEx/getWidthEx、setHeightEx/getHeightEx 尺寸；setBackgroundColorEx(color)/getBackgroundColorEx() 背景(填充)色；setBorderColorEx/getBorderColorEx 边框色；setTextColorEx/getTextColorEx 文本色；setTextEx(text)/getTextEx() 文本内容(仅文本图元)；getAttr(attr)/setAttr(attr,value) 通用属性；getChildrenEx() 子图元；getShapeEx() 图元类型。`

/** 图纸（gv）可用函数参考 */
export const GV_API_REFERENCE = `gv：findNodeByIdEx(id) 查找图元；setZoomEx({x,y})/getZoomEx()；setPageParamsEx(name,value)/getPageParamsEx(name)；setLayerVisibleByIndexEx(index,visible)/getLayerVisibleByIndexEx(index)；setLayerVisibleByNameEx(name,visible)/getLayerVisibleByNameEx(name)。`

/** 通用函数（hmi.utils）参考 */
export const UTILS_API_REFERENCE = `通用：hmi.utils.readModelPoint({projectCode,points}, success, error)；hmi.utils.writeModelPoint({projectCode,nodes:[{point,value}],gv}, success, error)；hmi.utils.getProjectCode(gv)；hmi.utils.openDialog(url,{positionType,width,height},closeOthers)；hmi.utils.openPage(url)。`

/** 脚本可用函数参考（精简自编辑器函数库），嵌入工具描述供模型编写脚本 */
export const SCRIPT_API_REFERENCE = `脚本是函数体，只写函数体，不要 function 声明与外层花括号。签名随触发方式不同：
- 图元鼠标事件 / 事件响应 / 定时 / 画面打开后：function(data, gv, params)，data=目标图元（未配置目标图元时为 undefined），gv=当前图纸 GraphView，params=事件参数对象；
- 数值变化：function(data, gv, value)，value 形如 { 测点全路径: { oldValue, newValue } }；
- 画面打开前：function(gv)，此时图元尚未加载，只能使用 gv 与通用函数。
只能使用下列函数与标准 JavaScript（Math/Date/String/Array/JSON/Number/setTimeout 等），禁止 import/require/eval/fetch/XMLHttpRequest/document/window。
操作其他图元用 gv.findNodeByIdEx("图元ID") 并判空。颜色用 "#rrggbb" 字符串。
随机颜色示例："#" + Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, "0")
${NODE_API_REFERENCE}
${GV_API_REFERENCE}
${UTILS_API_REFERENCE}`

const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\bimport\s*[({]|\bimport\s+[\w*{]/, 'import'],
  [/\brequire\s*\(/, 'require'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bdocument\b/, 'document'],
  [/\bwindow\b/, 'window'],
  [/\blocalStorage\b|\bsessionStorage\b/, 'storage'],
]

/** 去除模型可能多包的代码围栏与函数声明外壳 */
export function normalizeScript(raw: string): string {
  let script = raw.trim()
  const fence = script.match(/^```(?:javascript|js)?\s*\n([\s\S]*?)```$/)
  if (fence) script = fence[1].trim()
  const wrapped = script.match(/^function\s*\w*\s*\([^)]*\)\s*\{([\s\S]*)\}$/)
  if (wrapped) script = wrapped[1].trim()
  return script
}

/** 校验脚本：语法正确且不含禁用 API。返回错误信息，通过则返回 null */
export function validateScript(
  script: string,
  paramNames: string[] = ['data', 'gv', 'params', 'value'],
): string | null {
  if (!script) return '缺少 script 参数'
  for (const [pattern, label] of FORBIDDEN_PATTERNS) {
    if (pattern.test(script)) return `脚本包含禁止使用的能力：${label}`
  }
  try {
    // 仅编译不执行，用于语法检查；形参与运行时一致，才能发现与形参重名的声明
    new Function(...paramNames, script)
  } catch (err) {
    return `脚本语法错误：${err instanceof Error ? err.message : String(err)}`
  }
  return null
}

export interface EventDefinitionInput {
  /** element=图元事件；display=图纸事件 */
  target: 'element' | 'display'
  title: string
  /** 已解析为图元 id 的动作目标；element 缺省时由调用方传入 [NODE_SELF] */
  nodeIds: string[]
  mouseEvent: MouseEventType
  /** 图元事件：current=当前图纸执行动作；other=向其他图纸广播事件 */
  eventScope: 'current' | 'other'
  trigger: DisplayTrigger
  handleId: string
  schedule: Record<string, unknown>
  dataSourceKeys: string[]
  action: ActionKind
  args: Record<string, unknown>
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toNumber(value: unknown): number | undefined {
  if (isFiniteNumber(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function colorOption(value: unknown): { checked: boolean, color: string } {
  const color = typeof value === 'string' ? value.trim() : ''
  return { checked: color.length > 0, color }
}

/** 构造动作 payload；返回错误信息或 { fnName, payload } */
export function buildAction(
  action: ActionKind,
  args: Record<string, unknown>,
): { fnName: string, payload: string } | { error: string } {
  switch (action) {
    case 'script': {
      const script = normalizeScript(typeof args.script === 'string' ? args.script : '')
      const problem = validateScript(script)
      return problem ? { error: problem } : { fnName: 'hmi:script', payload: script }
    }
    case 'visible': {
      const visible = toNumber(args.visible)
      if (visible === undefined || ![0, 1, 2].includes(visible)) {
        return { error: 'visible 动作需要 visible 参数：0=隐藏，1=显示，2=显隐切换' }
      }
      return { fnName: 'hmi:nodeToggleVisible', payload: JSON.stringify({ visible }) }
    }
    case 'move': {
      const type = args.moveType === 'moveTo' ? 'moveTo' : args.moveType === 'moveBy' ? 'moveBy' : ''
      const x = toNumber(args.x)
      const y = toNumber(args.y)
      if (!type || x === undefined || y === undefined) {
        return { error: 'move 动作需要 moveType(moveBy=相对移动/moveTo=移动到坐标)、x、y' }
      }
      return { fnName: 'hmi:nodeToggleMove', payload: JSON.stringify({ type, x, y }) }
    }
    case 'rotate': {
      const angle = toNumber(args.angle)
      if (angle === undefined) return { error: 'rotate 动作需要 angle（角度）' }
      return {
        fnName: 'hmi:nodeToggleRotate',
        payload: JSON.stringify({ angle, clockwise: args.clockwise !== false }),
      }
    }
    case 'scale': {
      const scaleX = toNumber(args.scaleX)
      const scaleY = toNumber(args.scaleY)
      if (scaleX === undefined || scaleY === undefined) return { error: 'scale 动作需要 scaleX 与 scaleY' }
      return { fnName: 'hmi:nodeToggleScale', payload: JSON.stringify({ scaleX, scaleY }) }
    }
    case 'size': {
      const width = toNumber(args.width)
      const height = toNumber(args.height)
      if (width === undefined || height === undefined || width <= 0 || height <= 0) {
        return { error: 'size 动作需要大于 0 的 width 与 height' }
      }
      return { fnName: 'hmi:nodeSize', payload: JSON.stringify({ width, height }) }
    }
    case 'color': {
      const textColor = colorOption(args.textColor)
      const borderColor = colorOption(args.borderColor)
      const backgroundColor = colorOption(args.backgroundColor)
      if (!textColor.checked && !borderColor.checked && !backgroundColor.checked) {
        return { error: 'color 动作至少需要 textColor / borderColor / backgroundColor 之一' }
      }
      return {
        fnName: 'hmi:nodeChangeColor',
        payload: JSON.stringify({ textColor, borderColor, backgroundColor }),
      }
    }
    case 'openDialog': {
      const url = typeof args.url === 'string' ? args.url.trim() : ''
      const width = toNumber(args.width) ?? 800
      const height = toNumber(args.height) ?? 600
      if (!url) return { error: 'openDialog 动作需要 url' }
      const positions = ['center', 'left-top', 'right-top', 'left-bottom', 'right-bottom']
      const position = positions.includes(String(args.dialogPosition)) ? String(args.dialogPosition) : 'center'
      return {
        fnName: 'hmi:nodeTogglePopup',
        payload: JSON.stringify({ type: 'openDialog', position, url, width, height }),
      }
    }
    case 'openWindow': {
      const url = typeof args.url === 'string' ? args.url.trim() : ''
      if (!url) return { error: 'openWindow 动作需要 url' }
      return {
        fnName: 'hmi:nodeTogglePopup',
        payload: JSON.stringify({ type: 'openWindow', position: 'center', url, width: 800, height: 600 }),
      }
    }
    default:
      return { error: `不支持的动作: ${String(action)}` }
  }
}

function parseTime(value: unknown): { h: number, m: number, s: number } | undefined {
  const match = typeof value === 'string' ? value.trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/) : null
  if (!match) return undefined
  const h = Number(match[1])
  const m = Number(match[2])
  const s = Number(match[3] ?? 0)
  return h < 24 && m < 60 && s < 60 ? { h, m, s } : undefined
}

/** 按编辑器的 cron 约定生成表达式：秒 分 时 日 月 周；间隔执行为 `*\/秒数` */
export function buildCron(schedule: Record<string, unknown>): string | { error: string } {
  const type = schedule.scheduleType as ScheduleType
  if (type === 'interval') {
    const seconds = toNumber(schedule.intervalSeconds)
    if (seconds === undefined || !Number.isInteger(seconds) || seconds < 1) {
      return { error: '间隔执行需要正整数 intervalSeconds（秒）' }
    }
    return `*/${seconds}`
  }
  const time = parseTime(schedule.time)
  if (!time) return { error: '定时执行需要 time，格式 HH:mm:ss 或 HH:mm' }
  const prefix = `${time.s} ${time.m} ${time.h}`
  if (type === 'daily') return `${prefix} * * *`
  if (type === 'weekly') {
    const day = toNumber(schedule.dayOfWeek)
    if (day === undefined || !Number.isInteger(day) || day < 0 || day > 7) {
      return { error: '每周执行需要 dayOfWeek（1-7，1=周一，7=周日）' }
    }
    return `${prefix} * * ${day}`
  }
  if (type === 'monthly') {
    const day = toNumber(schedule.dayOfMonth)
    if (day === undefined || !Number.isInteger(day) || day < 1 || day > 31) {
      return { error: '每月执行需要 dayOfMonth（1-31）' }
    }
    return `${prefix} ${day} * *`
  }
  return { error: `不支持的 scheduleType: ${String(type)}，可选 ${SCHEDULE_TYPES.join('/')}` }
}

/** 测点全路径（如 "100:XAM_001.AV"）按最后一个 "." 拆分为 tagName 与 itemName */
function modelPoint(path: string): Record<string, string> {
  const dot = path.lastIndexOf('.')
  return {
    nodeId: path,
    tagName: dot > 0 ? path.slice(0, dot) : path,
    itemName: dot > 0 ? path.slice(dot + 1) : '',
  }
}

/** 构造一条事件配置（图元级或图纸级）；返回事件或错误信息 */
export function buildEventDefinition(input: EventDefinitionInput): Record<string, unknown> | { error: string } {
  const base = {
    title: input.title,
    name: `event${randomUUID().replace(/-/g, '')}`,
  }

  // 图元级：向其他图纸广播事件，不需要动作
  if (input.target === 'element' && input.eventScope === 'other') {
    if (!input.handleId) return { error: '向其他图纸发送事件需要 handleId（事件标识）' }
    const params = typeof input.args.params === 'string' ? input.args.params : '{}'
    return {
      ...base,
      eventType: 'normal',
      type: input.mouseEvent,
      scope: 'other',
      nodes: [],
      handleId: input.handleId,
      actions: [{ fnName: 'hmi:coreEmit', payload: params }],
    }
  }

  // 画面打开前：只能执行图纸脚本（此时图元尚未加载）
  const preOpen = input.target === 'display' && input.trigger === 'onOpenBefore'
  if (preOpen && input.action !== 'script') return { error: '画面打开前的事件只能使用 script 动作' }

  const action = buildAction(input.action, input.args)
  if ('error' in action) return action

  const needsNodes = !['script', 'openDialog', 'openWindow'].includes(input.action)
  if (needsNodes && input.nodeIds.length === 0) {
    return { error: `${input.action} 动作需要 targetElements（先用 find_elements 确定目标图元）` }
  }
  const nodes = preOpen ? [] : input.nodeIds
  const actions = [action]

  if (input.target === 'element') {
    return {
      ...base,
      eventType: 'normal',
      type: input.mouseEvent,
      scope: 'current',
      nodes,
      handleId: '',
      actions,
    }
  }

  switch (input.trigger) {
    case 'respond':
      if (!input.handleId) return { error: '事件响应需要 handleId（事件标识）' }
      return { ...base, eventType: 'normal', scope: 'current', nodes, handleId: input.handleId, actions }
    case 'schedule': {
      const cron = buildCron(input.schedule)
      if (typeof cron !== 'string') return cron
      return { ...base, eventType: 'schedule', cron, nodes, handleId: '', actions }
    }
    case 'valueChanged':
      if (input.dataSourceKeys.length === 0) return { error: '数值变化触发需要 dataSourceKeys（测点全路径）' }
      return {
        ...base,
        eventType: 'condition',
        condition: { type: 'valueChanged', value: input.dataSourceKeys.map(modelPoint) },
        nodes,
        handleId: '',
        actions,
      }
    case 'onOpenBefore':
      return { ...base, eventType: 'condition', condition: { type: 'onPreDeserialize', value: '' }, nodes, handleId: '', actions }
    case 'onOpenAfter':
      return { ...base, eventType: 'condition', condition: { type: 'onPostDeserialize', value: '' }, nodes, handleId: '', actions }
    default:
      return { error: `不支持的 trigger: ${String(input.trigger)}，可选 ${DISPLAY_TRIGGERS.join('/')}` }
  }
}
