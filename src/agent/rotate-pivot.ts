/**
 * 旋转中心（roatePos）处理
 *
 * 运行时 setXEx/setYEx/getXEx/getYEx 读写的是图元旋转中心（roatePos，新建图元默认为包围盒中心）的画布绝对坐标，
 * 不是左上角；setRotationEx(角度) 让图元绕自身旋转中心转到该绝对角度。
 * 多个部件绕同一圆心转动（扇叶绕轮毂）时，只需把它们的旋转中心设为该圆心，脚本里调用 setRotationEx 即可。
 * 模型常用 setXEx/setYEx + 三角函数手算公转，并把坐标误当作左上角减去半宽高，导致叶片偏心晃动、时好时坏，
 * 因此脚本校验阶段拒绝手算公转，并提供在创建/事件/图纸脚本工具上直接设置旋转中心的参数。
 */

export interface PivotPoint {
  x: number
  y: number
}

export interface RotatePivotRequest {
  pivot: PivotPoint
  targets: string[]
}

function toFinite(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

/** 读取一对旋转中心坐标：都未提供返回 null，只提供一个或不是数字返回错误 */
export function readPivotPoint(rawX: unknown, rawY: unknown, label = 'pivotX/pivotY'): PivotPoint | null | { error: string } {
  if (rawX == null && rawY == null) return null
  const x = toFinite(rawX)
  const y = toFinite(rawY)
  if (x === undefined || y === undefined) return { error: `${label} 必须同时提供且为数字（旋转中心的画布绝对坐标）` }
  return { x, y }
}

/**
 * 读取脚本类工具的旋转中心参数（rotatePivotX / rotatePivotY / rotatePivotElements）。
 * 三者都未提供返回 null；提供了任一则必须完整。
 */
export function readRotatePivotRequest(args: Record<string, unknown>): RotatePivotRequest | null | { error: string } {
  const rawTargets = args.rotatePivotElements
  const point = readPivotPoint(args.rotatePivotX, args.rotatePivotY, 'rotatePivotX/rotatePivotY')
  if (point === null && rawTargets == null) return null
  if (point === null) return { error: '传了 rotatePivotElements 但缺少 rotatePivotX/rotatePivotY（公共旋转圆心的画布绝对坐标）' }
  if ('error' in point) return point
  const targets = Array.isArray(rawTargets)
    ? [...new Set(rawTargets.map(item => String(item).trim()).filter(Boolean))]
    : []
  if (targets.length === 0) return { error: 'rotatePivotElements 必须是需要绕该圆心转动的图元 id/名称列表（非空数组）' }
  return { pivot: point, targets }
}

/** 脚本是否在用 setXEx/setYEx + 三角函数手算公转，同时用 setRotationEx 自转 */
export function hasManualOrbit(script: string): boolean {
  return /\.setRotationEx\s*\(/.test(script)
    && /\.set[XY]Ex\s*\(/.test(script)
    && /\bMath\.(?:cos|sin)\s*\(/.test(script)
}

export const MANUAL_ORBIT_ERROR = '脚本用 setXEx/setYEx 配合 Math.cos/Math.sin 手算图元绕圆心公转并用 setRotationEx 自转，已拒绝：'
  + 'setXEx/setYEx 的坐标是图元旋转中心(roatePos)而不是左上角，手算公转极易偏心晃动。'
  + '正确做法：把要转动的图元的旋转中心设为公共圆心（add_event_definition / set_display_script 传 rotatePivotX、rotatePivotY=圆心画布绝对坐标、'
  + 'rotatePivotElements=这些图元的 id；或创建图元时传 pivotX/pivotY），脚本里只对它们调用 setRotationEx(累计角度)，'
  + '不要再调用 setXEx/setYEx'
