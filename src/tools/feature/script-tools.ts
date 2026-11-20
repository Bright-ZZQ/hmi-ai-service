/**
 * 脚本类工具 — 图纸脚本 / 管道脚本 / 图符属性绑定函数
 *
 * 与事件定义同属“由模型编写脚本函数体”的能力，复用其脚本规整与安全校验：
 * - 图纸脚本：写入 document.pageProperty.scriptFunc，画面加载完成后执行一次，签名 (data, core, cache)；
 * - 管道脚本：写入管道图元 store.pipeScript，管道加入画布时执行，签名 (data, gv)；
 * - 图符属性绑定函数：写入图符图元 attrs/store 的 { func, value }，数据绑定值变化时重算，签名 (data)，需 return 属性值。
 */
import {
  GV_API_REFERENCE,
  NODE_API_REFERENCE,
  UTILS_API_REFERENCE,
  normalizeScript,
  validateScript,
} from './event-definition'

const SCRIPT_RULES = '只写函数体，不要 function 声明与外层花括号；只能使用标准 JavaScript（Math/Date/String/Array/JSON/Number/setTimeout/setInterval 等）与下列函数，禁止 import/require/eval/fetch/XMLHttpRequest/document/window。'

/** 图纸脚本（属性栏 - 图纸 - 脚本）API 参考 */
export const PAGE_SCRIPT_API_REFERENCE = `图纸脚本签名为 function(data, core, cache)，在画面加载完成后执行一次：data=当前图纸 GraphView（与事件脚本中的 gv 相同），core=核心对象，cache=可存放自定义数据的对象。${SCRIPT_RULES}
${GV_API_REFERENCE.replace(/^gv：/, 'data（GraphView）：')}
图元操作：data.findNodeByIdEx("图元ID") 取得图元后，可用 setVisibleEx/setXEx/setYEx/setRotationEx/setWidthEx/setHeightEx/setBackgroundColorEx/setBorderColorEx/setTextColorEx/setTextEx 等 Ex 方法，必须判空。
setXEx/setYEx/getXEx/getYEx 是图元旋转中心（roatePos，默认包围盒中心）的画布绝对坐标，不是左上角；setRotationEx(角度) 绕自身旋转中心转到该绝对角度。setWidthEx/setHeightEx 以图元中心为基准向两侧伸缩：做进度条/液位条时必须同步调整 setXEx/setYEx 固定起点（横向条 setXEx(起点x + 新宽度/2)，纵向条 setYEx(底边y - 新高度/2)），否则条从中间向两边变长。多个图元绕同一圆心转动（如扇叶绕轮毂）时，用本工具的 rotatePivotX/rotatePivotY/rotatePivotElements 把它们的旋转中心设为该圆心，脚本只调用 setRotationEx(累计角度)，禁止用 setXEx/setYEx 配合 Math.cos/Math.sin 手算公转。
${UTILS_API_REFERENCE}`

/** 管道脚本 API 参考 */
export const PIPE_SCRIPT_API_REFERENCE = `管道脚本签名为 function(data, gv)，管道加入画布时执行一次：data=当前管道图元，gv=当前图纸 GraphView。${SCRIPT_RULES}
管道含脚本时，流动组默认处于关闭状态，必须在脚本中调用 data.setScriptEnabled(true) 才会按 flowGroupEnabled 等配置显示/流动；data.setScriptEnabled(false) 关闭。
data：setScriptEnabled(bool)/getScriptEnabled()；setStore(key,value)/getStore(key) 读写管道配置，常用 key：flowEnabled(虚线流动 bool)、flowReverse(虚线反向 bool)、flowRate(虚线流速 number)、flowGroupEnabled(流动组 bool)、flowGroupReverse(流动组反向 bool)、flowGroupRate(流动组流速 number)、flowGroupColor(流动组颜色 "#rrggbb")、flowGroupType("background"|"image"|"particle")、bgStroke/fgStroke(背景层/前景层颜色)；可赋值 data.onScriptDestroy = function(){...} 在管道销毁时清理定时器。
${GV_API_REFERENCE}
${UTILS_API_REFERENCE}
定时读取测点用 setInterval，并在 data.onScriptDestroy 中 clearInterval。`

/** 图符属性绑定函数 API 参考 */
export const SYMBOL_FUNC_API_REFERENCE = `属性绑定函数签名为 function(data)，函数体必须 return 要赋给该属性的值（类型与属性一致：颜色用 "#rrggbb" 字符串，数值属性返回 number，rotation 为角度，文本返回字符串）。${SCRIPT_RULES}
data=图符实例：data.a("数据绑定名") 读取图符数据绑定（dataBindings）当前值（未绑定数据源时为其默认值），data.getValue() 读取主数据值。
函数在任一数据绑定值变化时重新执行，必须是无副作用的纯计算，不要读写测点、不要使用定时器。
脚本中用 data.a("xxx") 读取的每个绑定名必须在 dataBindings 参数（或图符已有绑定）中声明。
示例："return Number(data.a('temp')) > 80 ? '#ff0000' : '#00b050'"`

export interface PreparedScript {
  script: string
}

/** 规整并校验脚本；paramNames 为运行时形参，用于发现与形参重名的声明 */
export function prepareScript(
  raw: unknown,
  paramNames: string[],
): PreparedScript | { error: string } {
  const script = normalizeScript(typeof raw === 'string' ? raw : '')
  const problem = validateScript(script, paramNames)
  return problem ? { error: problem } : { script }
}

/** 图纸脚本形参 */
export const PAGE_SCRIPT_PARAMS = ['data', 'core', 'cache']
/** 管道脚本形参 */
export const PIPE_SCRIPT_PARAMS = ['data', 'gv']
/** 图符属性绑定函数形参 */
export const SYMBOL_FUNC_PARAMS = ['data']

/**
 * 合并图纸脚本：追加时包进独立块级作用域，避免与原脚本的 let/const 重名。
 * replace 或原脚本为空时直接使用新脚本。
 */
export function mergePageScript(base: unknown, script: string, replace: boolean): string {
  const baseScript = typeof base === 'string' ? base.trim() : ''
  if (replace || !baseScript) return script
  return `${baseScript}\n{\n${script}\n}`
}

export const SYMBOL_BINDING_VALUE_TYPES = ['number', 'string', 'boolean', 'picker', 'modal'] as const

export type SymbolDataBinding = {
  attr: string
  valueType: string
  defaultValue?: unknown
  name: string
}

/** 解析并校验模型传入的数据绑定声明 */
export function parseDataBindings(raw: unknown): SymbolDataBinding[] | { error: string } {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return { error: 'dataBindings 必须是数组' }
  const result: SymbolDataBinding[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return { error: 'dataBindings 的每一项必须是对象' }
    const record = item as Record<string, unknown>
    const attr = typeof record.attr === 'string' ? record.attr.trim() : ''
    if (!/^[A-Za-z_][\w]*$/.test(attr)) {
      return { error: `数据绑定名 "${String(record.attr)}" 不合法：需以字母或下划线开头，仅含字母、数字、下划线` }
    }
    const valueType = typeof record.valueType === 'string' ? record.valueType : 'number'
    if (!(SYMBOL_BINDING_VALUE_TYPES as readonly string[]).includes(valueType)) {
      return { error: `数据绑定 ${attr} 的 valueType 不支持：${valueType}，可选 ${SYMBOL_BINDING_VALUE_TYPES.join('/')}` }
    }
    result.push({
      attr,
      valueType,
      ...(record.defaultValue !== undefined ? { defaultValue: record.defaultValue } : {}),
      name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : attr,
    })
  }
  return result
}

/** 提取脚本中通过 data.a('xxx') 读取的绑定名 */
export function extractReadBindings(script: string): string[] {
  const names = new Set<string>()
  for (const match of script.matchAll(/\bdata\.a\(\s*(['"`])([^'"`]+)\1/g)) names.add(match[2])
  return [...names]
}

/** 按 attr 合并数据绑定，后者覆盖前者 */
export function mergeDataBindings(
  base: unknown,
  added: ReadonlyArray<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const merged = new Map<string, Record<string, unknown>>()
  if (Array.isArray(base)) {
    for (const item of base) {
      if (typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).attr === 'string') {
        merged.set((item as Record<string, unknown>).attr as string, item as Record<string, unknown>)
      }
    }
  }
  for (const binding of added) {
    const key = String(binding.attr)
    merged.set(key, { ...merged.get(key), ...binding })
  }
  return [...merged.values()]
}
