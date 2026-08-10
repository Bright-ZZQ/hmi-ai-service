/**
 * Dynamic Feature Builders
 *
 * 将模型工具参数转换为 HMI 编辑器可直接消费的 FeatureConfig。
 */

type DynamicFeatureToolName =
  | 'add_feature_rotate'
  | 'add_feature_move'
  | 'add_feature_blink'
  | 'add_feature_change_color'

interface FeatureParam {
  original: unknown
  ref?: string
}

export interface DynamicFeatureConfig {
  id: string
  name: string
  type: string
  conditions: Record<string, unknown>[]
  not: boolean
  pars: Record<string, FeatureParam>
}

const FEATURE_TYPES: Record<DynamicFeatureToolName, string> = {
  add_feature_rotate: 'GraphDynaRotate',
  add_feature_move: 'GraphDynaMove',
  add_feature_blink: 'GraphDynaBlink',
  add_feature_change_color: 'GraphDynaChangeClr',
}

function original(value: unknown): FeatureParam {
  return { original: value }
}

function dataPoint(value: unknown): Record<string, string> {
  return {
    nodeId: '',
    tagName: typeof value === 'string' ? value : '',
    nodeType: '',
  }
}

function isConditionSpecifiedByUser(args: Record<string, unknown>): boolean {
  return args.conditionSpecifiedByUser === true
}

function buildConditions(args: Record<string, unknown>): Record<string, unknown>[] {
  if (!isConditionSpecifiedByUser(args) || !args.dataSourceKey) return []
  return [{
    num: '1',
    leftValue: dataPoint(args.dataSourceKey),
    sign: Number(args.conditionOperator ?? 0),
    rightValue: { original: String(args.conditionValue ?? '1'), ref: '' },
    logicSign: 0,
    logic: '',
    conditions: [],
  }]
}

function buildRotatePars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const rotMode = Number(args.rotMode ?? 0)
  const pars: Record<string, FeatureParam> = {
    rotMode: original(rotMode),
    rotCenter: original(Number(args.rotCenter ?? 5)),
  }
  if (rotMode === 0) {
    return {
      ...pars,
      rotAngle: original(Number(args.rotAngle ?? 5)),
      rotCond: original(Number(args.rotCond ?? 0)),
      condTrue: original(Number(args.condTrue ?? 0)),
      condFalse: original(Number(args.condFalse ?? 1)),
    }
  }

  const useDB = Number(args.useDB ?? 0)
  Object.assign(pars, {
    ds: original(dataPoint(args.dsDataSourceKey)),
    maxAngle: original(Number(args.maxAngle ?? 360)),
    minAngle: original(Number(args.minAngle ?? 0)),
    useDB: original(useDB),
  })
  if (useDB) {
    pars.muItem = original(dataPoint(args.muDataSourceKey))
    pars.mdItem = original(dataPoint(args.mdDataSourceKey))
  } else {
    pars.mu = original(Number(args.mu ?? 100))
    pars.md = original(Number(args.md ?? 0))
  }
  return pars
}

function addMoveAxisPars(
  pars: Record<string, FeatureParam>,
  args: Record<string, unknown>,
  axis: 'h' | 'v',
  moveMode: number,
): void {
  const enabled = Number(args[`${axis}Move`] ?? 1)
  if (!enabled) return

  pars[`${axis}Distance`] = original(Number(args[`${axis}Distance`] ?? 0))
  if (moveMode === 0) {
    pars[`${axis}Speed`] = original(Number(args[`${axis}Speed`] ?? 0))
    return
  }

  const useDB = Number(args[`${axis}UseDB`] ?? 0)
  pars[`${axis}Ds`] = original(dataPoint(args[`${axis}DataSourceKey`]))
  pars[`${axis}UseDB`] = original(useDB)
  if (useDB) {
    pars[`${axis}MuItem`] = original(dataPoint(args[`${axis}MuDataSourceKey`]))
    pars[`${axis}MdItem`] = original(dataPoint(args[`${axis}MdDataSourceKey`]))
  } else {
    pars[`${axis}Mu`] = original(Number(args[`${axis}Mu`] ?? 100))
    pars[`${axis}Md`] = original(Number(args[`${axis}Md`] ?? 0))
  }
}

function buildMovePars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const moveMode = Number(args.moveMode ?? 0)
  const pars: Record<string, FeatureParam> = {
    moveMode: original(moveMode),
    reBack: original(Number(args.reBack ?? 0)),
    hMove: original(Number(args.hMove ?? 1)),
    vMove: original(Number(args.vMove ?? 1)),
  }
  addMoveAxisPars(pars, args, 'h', moveMode)
  addMoveAxisPars(pars, args, 'v', moveMode)
  return pars
}

function parseColor(color: string): [number, number, number, number] | undefined {
  const normalized = color.trim().toLowerCase()
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/)
  if (hex) {
    const value = hex[1].length === 3
      ? hex[1].split('').map(char => char + char).join('')
      : hex[1]
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
      value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1,
    ]
  }

  const rgb = normalized.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (!rgb) return undefined
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
}

function relativeLuminance(color: [number, number, number, number]): number {
  const channels = color.slice(0, 3).map(value => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(left: string, right: string): number {
  const leftColor = parseColor(left)
  const rightColor = parseColor(right)
  if (!leftColor || !rightColor) {
    return left.trim().toLowerCase() === right.trim().toLowerCase() ? 1 : Number.POSITIVE_INFINITY
  }
  const leftLuminance = relativeLuminance(leftColor)
  const rightLuminance = relativeLuminance(rightColor)
  return (Math.max(leftLuminance, rightLuminance) + 0.05)
    / (Math.min(leftLuminance, rightLuminance) + 0.05)
}

function hasVisibleFill(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false
  const color = parseColor(value)
  return color ? color[3] > 0 : true
}

function getContrastingColor(backgroundColor: string): string {
  return contrastRatio(backgroundColor, '#000000') >= contrastRatio(backgroundColor, '#FFFFFF')
    ? '#000000'
    : '#FFFFFF'
}

function getBlinkFillColor(args: Record<string, unknown>): string {
  const backgroundColor = typeof args.elementFillColor === 'string'
    ? args.elementFillColor
    : '#D8D8D8'
  const requestedColor = typeof args.blinkBacClr === 'string'
    ? args.blinkBacClr
    : getContrastingColor(backgroundColor)
  return contrastRatio(backgroundColor, requestedColor) < 3
    ? getContrastingColor(backgroundColor)
    : requestedColor
}

function buildBlinkPars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const requestedMethod = Number(args.blinkMethod ?? 0)
  const blinkMethod = requestedMethod === 1
    && hasVisibleFill(args.elementFillColor)
    && !Boolean(args.forceColorBlink)
      ? 0
      : requestedMethod
  return {
    blinkFreq: original(Number(args.blinkFreq ?? 0)),
    blinkMethod: original(blinkMethod),
    blinkColor: original(String(args.blinkColor ?? 'rgb(0, 0, 0)')),
    isFullClr: original(Number(args.isFullClr ?? 0)),
    isFrameClr: original(Number(args.isFrameClr ?? 0)),
    isTextClr: original(Number(args.isTextClr ?? 0)),
    blinkBacClr: original(getBlinkFillColor(args)),
    blinkBorClr: original(String(args.blinkBorClr ?? 'rgb(0, 0, 0)')),
    blinkBacGraClr: original(String(args.blinkBacGraClr ?? 'rgb(255, 255, 255)')),
    blinkBorGraClr: original(String(args.blinkBorGraClr ?? 'rgb(255, 255, 255)')),
    blinkBacGra: original(String(args.blinkBacGra ?? '')),
    blinkBorGra: original(String(args.blinkBorGra ?? '')),
  }
}

function buildChangeColorPars(args: Record<string, unknown>): Record<string, FeatureParam> {
  return {
    chClr: original(String(args.chClr ?? 'rgb(0, 0, 0)')),
    chBacClr: original(String(args.chBacClr ?? 'rgb(0, 0, 0)')),
    chBorClr: original(String(args.chBorClr ?? 'rgb(0, 0, 0)')),
    chBacGraClr: original(String(args.chBacGraClr ?? 'rgb(255, 255, 255)')),
    chBorGraClr: original(String(args.chBorGraClr ?? 'rgb(255, 255, 255)')),
    chBacGra: original(String(args.chBacGra ?? '')),
    chBorGra: original(String(args.chBorGra ?? '')),
    isFullClr: original(Number(args.isFullClr ?? 0)),
    isFrameClr: original(Number(args.isFrameClr ?? 0)),
    isTextClr: original(Number(args.isTextClr ?? 0)),
    isRecover: original(Number(args.isRecover ?? 0)),
    isBacRecover: original(Number(args.isBacRecover ?? 0)),
    isBorRecover: original(Number(args.isBorRecover ?? 0)),
    recClr: original(String(args.recClr ?? 'rgb(0, 0, 0)')),
    recBacClr: original(String(args.recBacClr ?? 'rgb(0, 0, 0)')),
    recBorClr: original(String(args.recBorClr ?? 'rgb(0, 0, 0)')),
    recBacGraClr: original(String(args.recBacGraClr ?? 'rgb(255, 255, 255)')),
    recBorGraClr: original(String(args.recBorGraClr ?? 'rgb(255, 255, 255)')),
    recBacGra: original(String(args.recBacGra ?? '')),
    recBorGra: original(String(args.recBorGra ?? '')),
  }
}

export function isDynamicFeatureTool(name: string): name is DynamicFeatureToolName {
  return Object.prototype.hasOwnProperty.call(FEATURE_TYPES, name)
}

export function buildDynamicFeature(
  name: DynamicFeatureToolName,
  args: Record<string, unknown>,
): DynamicFeatureConfig {
  const parsBuilders: Record<DynamicFeatureToolName, (values: Record<string, unknown>) => Record<string, FeatureParam>> = {
    add_feature_rotate: buildRotatePars,
    add_feature_move: buildMovePars,
    add_feature_blink: buildBlinkPars,
    add_feature_change_color: buildChangeColorPars,
  }
  const type = FEATURE_TYPES[name]
  return {
    id: globalThis.crypto.randomUUID(),
    name: type,
    type,
    conditions: buildConditions(args),
    not: isConditionSpecifiedByUser(args) ? Boolean(args.not ?? false) : false,
    pars: parsBuilders[name](args),
  }
}