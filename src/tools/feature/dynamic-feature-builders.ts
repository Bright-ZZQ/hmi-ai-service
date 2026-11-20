/**
 * Feature Builders
 *
 * 将模型工具参数转换为 HMI 编辑器可直接消费的 FeatureConfig。
 * 动态特性写入 store.dynamicDyna，交互特性写入 store.interactiveDyna。
 */

type DynamicFeatureToolName =
  | 'add_feature_rotate'
  | 'add_feature_move'
  | 'add_feature_blink'
  | 'add_feature_change_color'
  | 'add_feature_num_display'
  | 'add_feature_visible'
  | 'add_feature_scale'
  | 'add_feature_fill'
  | 'add_feature_dash_flow'
  | 'add_feature_operation_enable'
  | 'add_feature_multistate_text'
  | 'add_feature_multistate_color'

type InteractiveFeatureToolName =
  | 'add_feature_write_value'
  | 'add_feature_open_page'
  | 'add_feature_tip_show'
  | 'add_feature_reset'

interface FeatureParam {
  original: unknown
  ref?: string
}

export interface MultiStateCondition {
  id: string
  name: string
  value: string
  conditions: Record<string, unknown>[]
  not: boolean
}

export interface DynamicFeatureConfig {
  id: string
  name: string
  type: string
  conditions: Record<string, unknown>[]
  not: boolean
  pars: Record<string, FeatureParam>
  multiStateConditions?: MultiStateCondition[]
}

export interface InteractiveFeatureConfig {
  id: string
  name: string
  type: string
  act: number
  pars: Record<string, FeatureParam>
  conditions?: Record<string, unknown>[]
  not?: boolean
}

const DYNAMIC_FEATURE_TYPES: Record<DynamicFeatureToolName, string> = {
  add_feature_rotate: 'GraphDynaRotate',
  add_feature_move: 'GraphDynaMove',
  add_feature_blink: 'GraphDynaBlink',
  add_feature_change_color: 'GraphDynaChangeClr',
  add_feature_num_display: 'GraphDynaValDisplay',
  add_feature_visible: 'GraphDynaVisible',
  add_feature_scale: 'GraphDynaZoom',
  add_feature_fill: 'GraphDynaFillColor',
  add_feature_dash_flow: 'GraphDynaDashFlow',
  add_feature_operation_enable: 'GraphDynaEnableEvent',
  add_feature_multistate_text: 'GraphDynaChangeStringMul',
  add_feature_multistate_color: 'GraphDynaChangeClrMul',
}

const WRITE_VALUE_DIGITAL = 'GraphTriggerWriteDigVal'
const WRITE_VALUE_ANALOG = 'GraphTriggerWriteAnaVal'
const OPEN_PAGE_TYPE = 'GraphTriggerOpenPage'
const TIP_SHOW_TYPE = 'GraphTriggerTip'
const RESET_TYPE = 'GraphTriggerRegisterReset'

const INTERACTIVE_ACT = { LEFT_DOWN: 2, HOVER: 16 }
const TIP_TYPE = { DS_VALUE: 0, STATIC_TEXT: 1 }
const RESET_OUTPUT = { LEVEL: 0, PULSE: 1 }
const CONFIRM_POS_CUSTOM = 3
const SCALE_MODE = { EQUAL: 0, DIFF: 1 }
const MIN_ZOOM_RATIO = 0
const MAX_ZOOM_RATIO = 10
const DASH_FLOW_PARTICLE = 'particle'
const MAX_MULTI_STATES = 20
// 数值显示：显示类型（contentTy）与时间来源（parTimeTy），与编辑器 NUM_DISPLAY_PARAMS 一致
const NUM_DISPLAY_CONTENT_TIME_VALUE = 1
const NUM_DISPLAY_TIME_TYPE = { CURRENT: 0, DATABASE: 1 }

const ANALOG_WRITE_MODE = { RATIO: 0, FIXED_INCRE: 1, FIXED: 2, INPUT: 3 }
const DIGITAL_WRITE_MODE = { REVERSE: 0, FIXED: 1 }
const RANGE_MODE = { CUSTOM: 0, DATABASE: 1, NONUSE: 2 }
const GRAPH_TYPE = { GRAPH: 0, WEBPAGE: 1, SCENE: 2, DEFAULT_PANEL: 3 }
const OPENPAGE_TYPE = { PAGE: 0, DIALOG: 1, BROWSERWINDOW: 2 }
const DEFAULT_INTERACTIVE_ACT = 17

function original(value: unknown): FeatureParam {
  return { original: value }
}

function dataPoint(value: unknown): Record<string, string> {
  if (typeof value === 'string' && value.trim()) {
    return { ...modelPoint(value), type: 'm', domain: '-1', nodeType: '' }
  }
  return {
    nodeId: '',
    tagName: '',
    nodeType: '',
  }
}

/**
 * 数值显示等特性使用的模型点结构：需同时包含 nodeId / tagName / itemName。
 * 用户提供形如 `100:XAM_001.AV` 的全路径，按最后一个 `.` 拆分为 tagName 与 itemName。
 */
export function modelPoint(value: unknown): Record<string, string> {
  const nodeId = typeof value === 'string' ? value.trim() : ''
  const dotIndex = nodeId.lastIndexOf('.')
  return {
    nodeId,
    tagName: dotIndex > 0 ? nodeId.slice(0, dotIndex) : nodeId,
    itemName: dotIndex > 0 ? nodeId.slice(dotIndex + 1) : '',
  }
}

/** 写值特性运行时要求数据源带 domain，模型点域固定为 '-1'。 */
function writeDataPoint(value: unknown): Record<string, string> {
  return { ...modelPoint(value), domain: '-1' }
}

function isConditionSpecifiedByUser(args: Record<string, unknown>): boolean {
  return args.conditionSpecifiedByUser === true
}

export function buildConditionEntry(
  dataSourceKey: unknown,
  operator: unknown,
  rightValue: unknown,
): Record<string, unknown> {
  // 后端按 leftValue 订阅测点并计算条件，logic 为编辑器校验必填；nodeType 等字段由 model-point-resolver 在组装后补全
  const leftValue: Record<string, string> = { ...writeDataPoint(dataSourceKey), type: 'm' }
  return {
    num: globalThis.crypto.randomUUID(),
    leftValue,
    sign: Number(operator ?? 0),
    rightValue: { original: String(rightValue ?? '1'), ref: '' },
    logicSign: 0,
    logic: leftValue.nodeId,
    conditions: [],
  }
}

function buildConditions(args: Record<string, unknown>): Record<string, unknown>[] {
  if (!isConditionSpecifiedByUser(args) || !args.dataSourceKey) return []
  return [buildConditionEntry(args.dataSourceKey, args.conditionOperator, args.conditionValue)]
}

const OPERATOR_LABELS = ['=', '!=', '>', '<', '>=', '<=']

interface StateInput {
  dataSourceKey: string
  operator: unknown
  value: unknown
  payload: string
}

/** 多状态特性：每个状态一条独立条件，按声明顺序匹配。 */
function buildMultiStateConditions(
  args: Record<string, unknown>,
  payloadKey: 'text' | 'color',
): MultiStateCondition[] {
  const states = Array.isArray(args.states) ? args.states : []
  if (states.length === 0) throw new Error('states 不能为空：至少需要一个“条件 → 显示值”状态')
  if (states.length > MAX_MULTI_STATES) throw new Error(`states 最多 ${MAX_MULTI_STATES} 个`)

  return states.map((raw, index): MultiStateCondition => {
    const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const state: StateInput = {
      dataSourceKey: typeof item.dataSourceKey === 'string' ? item.dataSourceKey.trim() : '',
      operator: item.conditionOperator,
      value: item.conditionValue,
      payload: typeof item[payloadKey] === 'string' ? (item[payloadKey] as string).trim() : '',
    }
    if (!state.dataSourceKey) throw new Error(`states[${index}] 缺少 dataSourceKey（测点全路径）`)
    if (!state.payload) throw new Error(`states[${index}] 缺少 ${payloadKey}`)
    const operatorIndex = Number(state.operator ?? 0)
    return {
      id: globalThis.crypto.randomUUID(),
      name: `${state.dataSourceKey} ${OPERATOR_LABELS[operatorIndex] ?? ''} ${String(state.value ?? '1')}`.replace(/\s+/g, ' '),
      value: state.payload,
      conditions: [buildConditionEntry(state.dataSourceKey, state.operator, state.value)],
      not: false,
    }
  })
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

export function contrastRatio(left: string, right: string): number {
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

export function hasVisibleFill(value: unknown): value is string {
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

function buildNumDisplayPars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const useTime = Number(args.useTime ?? 0)
  const currentTime = useTime === 1 && Number(args.parTimeTy ?? NUM_DISPLAY_TIME_TYPE.DATABASE) === NUM_DISPLAY_TIME_TYPE.CURRENT
  if (!currentTime && !(typeof args.dataSourceKey === 'string' && args.dataSourceKey.trim())) {
    throw new Error('数值显示缺少 dataSourceKey；仅“显示当前系统时间”(useTime=1 且 parTimeTy=0)可省略')
  }
  const pars: Record<string, FeatureParam> = {
    contentTy: original(NUM_DISPLAY_CONTENT_TIME_VALUE),
    ds: original(modelPoint(args.dataSourceKey)),
    align: original(Number(args.align ?? 3)),
    blink: original(Number(args.blink ?? 0)),
    showE0E1: original(Number(args.showE0E1 ?? 0)),
    useTime: original(useTime),
    isOfData: original(Number(args.isOfData ?? 0)),
    showUT: original(Number(args.showUT ?? 0)),
  }

  if (Number(args.showE0E1 ?? 0)) {
    const showDbE0E1 = Number(args.showDbE0E1 ?? 0)
    pars.showDbE0E1 = original(showDbE0E1)
    if (showDbE0E1) {
      pars.e0Des = original(modelPoint(args.e0DesDataSourceKey))
      pars.e1Des = original(modelPoint(args.e1DesDataSourceKey))
    } else {
      pars.e0Des = original(String(args.e0Des ?? ''))
      pars.e1Des = original(String(args.e1Des ?? ''))
    }
  }

  if (Number(args.useTime ?? 0)) {
    pars.parTimeTy = original(currentTime ? NUM_DISPLAY_TIME_TYPE.CURRENT : NUM_DISPLAY_TIME_TYPE.DATABASE)
    pars.timeFormat = original(Number(args.timeFormat ?? 0))
  }

  if (Number(args.isOfData ?? 0)) {
    pars.ofItem = original(modelPoint(args.ofItemDataSourceKey))
  } else {
    pars.ofShow = original(Number(args.ofShow ?? -1))
  }

  if (Number(args.showUT ?? 0)) {
    pars.unit = original(modelPoint(args.unitDataSourceKey))
  }

  return pars
}

function buildVisiblePars(args: Record<string, unknown>): Record<string, FeatureParam> {
  return {
    isVisible: original(Number(args.isVisible ?? 1)),
  }
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return value === undefined || value === null || value === '' || !Number.isFinite(parsed) ? fallback : parsed
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** 量程参数：useDB=1 取数据库量程上下限测点，否则用自定义 mu/md。 */
function addRangePars(
  pars: Record<string, FeatureParam>,
  args: Record<string, unknown>,
  prefix: string,
): void {
  const name = (base: string) => (prefix ? `${prefix}${capitalize(base)}` : base)
  const useDB = Number(args[name('useDB')] ?? 0)
  pars[name('useDB')] = original(useDB)
  if (useDB) {
    pars[name('muItem')] = original(dataPoint(args[name('muDataSourceKey')]))
    pars[name('mdItem')] = original(dataPoint(args[name('mdDataSourceKey')]))
  } else {
    pars[name('mu')] = original(numberOr(args[name('mu')], 100))
    pars[name('md')] = original(numberOr(args[name('md')], 0))
  }
}

function buildZoomAxisPars(
  pars: Record<string, FeatureParam>,
  args: Record<string, unknown>,
  prefix: '' | 'h' | 'v',
): void {
  const name = (base: string) => (prefix ? `${prefix}${capitalize(base)}` : base)
  const dsArg = prefix ? `${prefix}DataSourceKey` : 'dsDataSourceKey'
  let zoomMin = numberOr(args[name('zoomMin')], 1)
  let zoomMax = numberOr(args[name('zoomMax')], 3)
  zoomMin = Math.min(Math.max(zoomMin, MIN_ZOOM_RATIO), MAX_ZOOM_RATIO)
  zoomMax = Math.min(Math.max(zoomMax, MIN_ZOOM_RATIO), MAX_ZOOM_RATIO)
  if (zoomMax <= zoomMin) {
    zoomMin = 1
    zoomMax = 3
  }
  pars[name('ds')] = original(dataPoint(args[dsArg]))
  pars[name('pos')] = original(Number(args[name('pos')] ?? 0))
  pars[name('zoomMin')] = original(zoomMin)
  pars[name('zoomMax')] = original(zoomMax)
  addRangePars(pars, args, prefix)
}

function buildScalePars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const zoomMode = Number(args.zoomMode ?? SCALE_MODE.EQUAL)
  const pars: Record<string, FeatureParam> = {
    zoomMode: original(zoomMode),
    recover: original(Number(args.recover ?? 0)),
  }
  if (zoomMode === SCALE_MODE.EQUAL) {
    buildZoomAxisPars(pars, args, '')
    return pars
  }
  for (const axis of ['h', 'v'] as const) {
    const enabled = Number(args[`${axis}Zoom`] ?? 1)
    pars[`${axis}Zoom`] = original(enabled)
    if (enabled) buildZoomAxisPars(pars, args, axis)
  }
  return pars
}

function buildFillPars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const pars: Record<string, FeatureParam> = {
    ds: original(dataPoint(args.dsDataSourceKey)),
    minFill: original(numberOr(args.minFill, 0)),
    maxFill: original(numberOr(args.maxFill, 100)),
    fillDir: original(Number(args.fillDir ?? 1)),
    reSet: original(Number(args.reSet ?? 0)),
    fillClr: original(String(args.fillClr ?? 'rgb(0, 0, 0)')),
    fillGraClr: original(String(args.fillGraClr ?? 'rgb(255, 255, 255)')),
    fillGra: original(String(args.fillGra ?? '')),
  }
  addRangePars(pars, args, '')
  return pars
}

function buildDashFlowPars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const groupType = typeof args.flowGroupType === 'string' ? args.flowGroupType : 'background'
  const pars: Record<string, FeatureParam> = {
    flowSpeed: original(Number(args.flowSpeed ?? 5)),
    flowDirection: original(Number(args.flowDirection ?? 0)),
    flowAutoreverse: original(Number(args.flowAutoreverse ?? 0)),
    flowGroupType: original(groupType),
    flowGroupColor: original(String(args.flowGroupColor ?? '#F3F77E')),
  }
  if (groupType === DASH_FLOW_PARTICLE) {
    pars.particleSize = original(numberOr(args.particleSize, 10))
    pars.particleDensity = original(numberOr(args.particleDensity, 3))
    return pars
  }
  pars.flowGroupNum = original(numberOr(args.flowGroupNum, 1))
  pars.flowGroupCount = original(numberOr(args.flowGroupCount, 10))
  pars.flowGroupGap = original(numberOr(args.flowGroupGap, 3.5))
  pars.flowGroupMax = original(numberOr(args.flowGroupMax, 7))
  pars.flowGroupMin = original(numberOr(args.flowGroupMin, 0))
  pars.keepDirection = original(Number(args.keepDirection ?? 0))
  return pars
}

function buildOperationEnablePars(args: Record<string, unknown>): Record<string, FeatureParam> {
  return { enableType: original(Number(args.enableType ?? 0)) }
}

function buildMultiStateTextPars(): Record<string, FeatureParam> {
  return {}
}

function buildMultiStateColorPars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const flags = ['isFullClr', 'isFrameClr', 'isTextClr']
  const noneSpecified = flags.every(flag => args[flag] === undefined || args[flag] === null)
  const pars: Record<string, FeatureParam> = {}
  for (const flag of flags) {
    pars[flag] = original(noneSpecified && flag === 'isFullClr' ? 1 : Number(args[flag] ?? 0))
  }
  return pars
}

function isAnalogWrite(args: Record<string, unknown>): boolean {
  const valueType = args.valueType
  return valueType === 'analog' || valueType === 1 || valueType === '1'
}

function buildWriteValuePars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const analog = isAnalogWrite(args)
  const writeMode = Number(args.writeMode ?? 0)
  const confirmEnable = Number(args.confirmEnable ?? 0)
  const pars: Record<string, FeatureParam> = {
    ds: original(writeDataPoint(args.dataSourceKey)),
    writeMode: original(writeMode),
    confirmEnable: original(confirmEnable),
    value: original(Number(args.value ?? 0)),
  }

  if (analog) {
    const rangeMode = Number(args.rangeMode ?? 0)
    pars.rangeMode = original(rangeMode)
    if (writeMode === ANALOG_WRITE_MODE.RATIO) {
      pars.rate = original(Number(args.rate ?? 0))
    }
    if (writeMode === ANALOG_WRITE_MODE.FIXED_INCRE || writeMode === ANALOG_WRITE_MODE.FIXED) {
      pars.value = original(Number(args.value ?? 0))
    }
    if (rangeMode === RANGE_MODE.CUSTOM) {
      pars.mu = original(Number(args.mu ?? 100))
      pars.md = original(Number(args.md ?? 0))
    } else if (rangeMode === RANGE_MODE.DATABASE) {
      pars.muItem = original(writeDataPoint(args.muDataSourceKey))
      pars.mdItem = original(writeDataPoint(args.mdDataSourceKey))
    }
    if (confirmEnable) {
      pars.confirmDes = original(String(args.confirmDes ?? ''))
    }
    return pars
  }

  if (writeMode === DIGITAL_WRITE_MODE.REVERSE) {
    pars.readItem = original(args.readItemDataSourceKey ? writeDataPoint(args.readItemDataSourceKey) : {})
  }
  if (writeMode === DIGITAL_WRITE_MODE.FIXED) {
    pars.value = original(Number(args.value ?? 0))
  }
  if (confirmEnable) {
    pars.confirmDes0 = original(String(args.confirmDes0 ?? ''))
    pars.confirmDes1 = original(String(args.confirmDes1 ?? ''))
  }
  return pars
}

function buildOpenPagePars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const popType = Number(args.popType ?? OPENPAGE_TYPE.PAGE)
  const pageType = Number(args.pageType ?? GRAPH_TYPE.GRAPH)
  const checkEnable = Number(args.checkEnable ?? 0)
  const pars: Record<string, FeatureParam> = {
    popType: original(popType),
    pageType: original(pageType),
    checkEnable: original(checkEnable),
    checkDs: original(checkEnable ? modelPoint(args.checkDataSourceKey) : ''),
  }

  if (pageType === GRAPH_TYPE.WEBPAGE) {
    pars.webPath = original(String(args.webPath ?? ''))
  } else if (pageType === GRAPH_TYPE.DEFAULT_PANEL) {
    pars.panelPath = original(String(args.panelPath ?? ''))
    pars.panelCode = original(String(args.panelCode ?? ''))
    pars.defaultPanelPath = original(String(args.defaultPanelPath ?? ''))
    pars.defaultPanelType = original(Number(args.defaultPanelType ?? 0))
    pars.parmInfoList = original(Array.isArray(args.parmInfoList) ? args.parmInfoList : [])
  } else {
    pars.pageName = original({
      name: String(args.pageName ?? ''),
      code: String(args.pageCode ?? ''),
      path: String(args.pagePath ?? ''),
    })
    pars.pageParam = original(Array.isArray(args.pageParam) ? args.pageParam : [])
  }

  if (popType === OPENPAGE_TYPE.DIALOG) {
    pars.windowPos = original(Number(args.windowPos ?? 0))
    pars.posX = original(Number(args.posX ?? 0))
    pars.posY = original(Number(args.posY ?? 0))
    pars.defaultFullscreen = original(Number(args.defaultFullscreen ?? 0))
    pars.customSize = original(Number(args.customSize ?? 0))
    pars.width = original(Number(args.width ?? 400))
    pars.height = original(Number(args.height ?? 300))
    pars.title = original(String(args.title ?? ''))
    pars.titleTextClr = original(String(args.titleTextClr ?? '#000000'))
    pars.titleBgClr = original(String(args.titleBgClr ?? '#FFFFFF'))
    pars.borderClr = original(String(args.borderClr ?? '#000000'))
  }

  return pars
}

function buildTipShowPars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const tipType = Number(args.tipType ?? TIP_TYPE.DS_VALUE)
  const pars: Record<string, FeatureParam> = {
    tipType: original(tipType),
    showPos: original(Number(args.showPos ?? 0)),
  }
  if (tipType === TIP_TYPE.STATIC_TEXT) {
    pars.showText = original(String(args.showText ?? ''))
    return pars
  }

  const showPercent = Number(args.showPercent ?? 0)
  pars.ds = original(dataPoint(args.tipDataSourceKey))
  pars.showPercent = original(showPercent)
  if (!showPercent) return pars

  const calculatePercent = Number(args.calculatePercent ?? 0)
  pars.calculatePercent = original(calculatePercent)
  pars.itemNegative = original(Number(args.itemNegative ?? 0))
  if (calculatePercent) {
    pars.muItem = original(dataPoint(args.muDataSourceKey))
    pars.mdItem = original(dataPoint(args.mdDataSourceKey))
  }
  return pars
}

function buildResetPars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const outType = Number(args.outType ?? RESET_OUTPUT.PULSE)
  const bitEnable = Number(args.bitEnable ?? 0)
  const confirmEnable = Number(args.confirmEnable ?? 0)
  const pars: Record<string, FeatureParam> = {
    ds: original(dataPoint(args.dataSourceKey)),
    outType: original(outType),
  }
  if (outType === RESET_OUTPUT.PULSE) {
    pars.pulseType = original(Number(args.pulseType ?? 0))
    pars.pulseWidth = original(Math.min(Math.max(numberOr(args.pulseWidth, 3), 0), 999))
  } else {
    pars.levelType = original(Number(args.levelType ?? 0))
  }
  pars.bitEnable = original(bitEnable)
  if (bitEnable) pars.bitNum = original(Math.min(Math.max(numberOr(args.bitNum, 0), 0), 31))
  pars.confirmEnable = original(confirmEnable)
  if (confirmEnable) {
    const confirmPos = Number(args.confirmPos ?? 0)
    pars.confirmDes = original(String(args.confirmDes ?? ''))
    pars.confirmPos = original(confirmPos)
    if (confirmPos === CONFIRM_POS_CUSTOM) {
      pars.posX = original(numberOr(args.posX, 0))
      pars.posY = original(numberOr(args.posY, 0))
    }
  }
  return pars
}

export function isDynamicFeatureTool(name: string): name is DynamicFeatureToolName {
  return Object.prototype.hasOwnProperty.call(DYNAMIC_FEATURE_TYPES, name)
}

export function isInteractiveFeatureTool(name: string): name is InteractiveFeatureToolName {
  return name === 'add_feature_write_value'
    || name === 'add_feature_open_page'
    || name === 'add_feature_tip_show'
    || name === 'add_feature_reset'
}

const INTERACTIVE_TOOL_BY_TYPE: Record<string, InteractiveFeatureToolName> = {
  [WRITE_VALUE_DIGITAL]: 'add_feature_write_value',
  [WRITE_VALUE_ANALOG]: 'add_feature_write_value',
  [OPEN_PAGE_TYPE]: 'add_feature_open_page',
  [TIP_SHOW_TYPE]: 'add_feature_tip_show',
  [RESET_TYPE]: 'add_feature_reset',
}

/** 特性 type（如 GraphDynaBlink）对应的 add_feature_* 工具名；未知类型返回 undefined */
export function featureToolNameForType(type: string): string | undefined {
  const dynamic = (Object.entries(DYNAMIC_FEATURE_TYPES) as Array<[string, string]>)
    .find(([, featureType]) => featureType === type)
  return dynamic?.[0] ?? INTERACTIVE_TOOL_BY_TYPE[type]
}

/** 构建失败（参数不合法）时抛出 Error，由调用方转成工具错误返回给模型。 */
export function buildDynamicFeature(
  name: DynamicFeatureToolName,
  args: Record<string, unknown>,
): DynamicFeatureConfig {
  const parsBuilders: Record<DynamicFeatureToolName, (values: Record<string, unknown>) => Record<string, FeatureParam>> = {
    add_feature_rotate: buildRotatePars,
    add_feature_move: buildMovePars,
    add_feature_blink: buildBlinkPars,
    add_feature_change_color: buildChangeColorPars,
    add_feature_num_display: buildNumDisplayPars,
    add_feature_visible: buildVisiblePars,
    add_feature_scale: buildScalePars,
    add_feature_fill: buildFillPars,
    add_feature_dash_flow: buildDashFlowPars,
    add_feature_operation_enable: buildOperationEnablePars,
    add_feature_multistate_text: buildMultiStateTextPars,
    add_feature_multistate_color: buildMultiStateColorPars,
  }
  const type = DYNAMIC_FEATURE_TYPES[name]
  const feature: DynamicFeatureConfig = {
    id: globalThis.crypto.randomUUID(),
    name: type,
    type,
    conditions: buildConditions(args),
    not: isConditionSpecifiedByUser(args) ? Boolean(args.not ?? false) : false,
    pars: parsBuilders[name](args),
  }
  if (name === 'add_feature_multistate_text' || name === 'add_feature_multistate_color') {
    // 多状态特性的条件全部放在 multiStateConditions，不使用顶层条件
    feature.conditions = []
    feature.not = false
    feature.multiStateConditions = buildMultiStateConditions(
      args,
      name === 'add_feature_multistate_text' ? 'text' : 'color',
    )
  }
  return feature
}

export function buildInteractiveFeature(
  name: InteractiveFeatureToolName,
  args: Record<string, unknown>,
): InteractiveFeatureConfig {
  if (name === 'add_feature_tip_show') {
    return {
      id: globalThis.crypto.randomUUID(),
      name: TIP_SHOW_TYPE,
      type: TIP_SHOW_TYPE,
      act: Number(args.act ?? INTERACTIVE_ACT.HOVER),
      pars: buildTipShowPars(args),
      conditions: buildConditions(args),
      not: isConditionSpecifiedByUser(args) ? Boolean(args.not ?? false) : false,
    }
  }
  if (name === 'add_feature_reset') {
    return {
      id: globalThis.crypto.randomUUID(),
      name: RESET_TYPE,
      type: RESET_TYPE,
      act: Number(args.act ?? INTERACTIVE_ACT.LEFT_DOWN),
      pars: buildResetPars(args),
    }
  }
  const type = name === 'add_feature_write_value'
    ? (isAnalogWrite(args) ? WRITE_VALUE_ANALOG : WRITE_VALUE_DIGITAL)
    : OPEN_PAGE_TYPE
  return {
    id: globalThis.crypto.randomUUID(),
    name: type,
    type,
    act: Number(args.act ?? DEFAULT_INTERACTIVE_ACT),
    pars: name === 'add_feature_write_value' ? buildWriteValuePars(args) : buildOpenPagePars(args),
  }
}
