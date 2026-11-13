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

type InteractiveFeatureToolName =
  | 'add_feature_write_value'
  | 'add_feature_open_page'

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

export interface InteractiveFeatureConfig {
  id: string
  name: string
  type: string
  act: number
  pars: Record<string, FeatureParam>
}

const DYNAMIC_FEATURE_TYPES: Record<DynamicFeatureToolName, string> = {
  add_feature_rotate: 'GraphDynaRotate',
  add_feature_move: 'GraphDynaMove',
  add_feature_blink: 'GraphDynaBlink',
  add_feature_change_color: 'GraphDynaChangeClr',
  add_feature_num_display: 'GraphDynaValDisplay',
  add_feature_visible: 'GraphDynaVisible',
}

const WRITE_VALUE_DIGITAL = 'GraphTriggerWriteDigVal'
const WRITE_VALUE_ANALOG = 'GraphTriggerWriteAnaVal'
const OPEN_PAGE_TYPE = 'GraphTriggerOpenPage'

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
function modelPoint(value: unknown): Record<string, string> {
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

function buildConditions(args: Record<string, unknown>): Record<string, unknown>[] {
  if (!isConditionSpecifiedByUser(args) || !args.dataSourceKey) return []
  // 后端按 leftValue 订阅测点并计算条件，logic 为编辑器校验必填；nodeType 等字段由 model-point-resolver 在组装后补全
  const leftValue: Record<string, string> = { ...writeDataPoint(args.dataSourceKey), type: 'm' }
  return [{
    num: globalThis.crypto.randomUUID(),
    leftValue,
    sign: Number(args.conditionOperator ?? 0),
    rightValue: { original: String(args.conditionValue ?? '1'), ref: '' },
    logicSign: 0,
    logic: leftValue.nodeId,
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

function buildNumDisplayPars(args: Record<string, unknown>): Record<string, FeatureParam> {
  const pars: Record<string, FeatureParam> = {
    ds: original(modelPoint(args.dataSourceKey)),
    align: original(Number(args.align ?? 3)),
    blink: original(Number(args.blink ?? 0)),
    showE0E1: original(Number(args.showE0E1 ?? 0)),
    useTime: original(Number(args.useTime ?? 0)),
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

export function isDynamicFeatureTool(name: string): name is DynamicFeatureToolName {
  return Object.prototype.hasOwnProperty.call(DYNAMIC_FEATURE_TYPES, name)
}

export function isInteractiveFeatureTool(name: string): name is InteractiveFeatureToolName {
  return name === 'add_feature_write_value' || name === 'add_feature_open_page'
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
    add_feature_num_display: buildNumDisplayPars,
    add_feature_visible: buildVisiblePars,
  }
  const type = DYNAMIC_FEATURE_TYPES[name]
  return {
    id: globalThis.crypto.randomUUID(),
    name: type,
    type,
    conditions: buildConditions(args),
    not: isConditionSpecifiedByUser(args) ? Boolean(args.not ?? false) : false,
    pars: parsBuilders[name](args),
  }
}

export function buildInteractiveFeature(
  name: InteractiveFeatureToolName,
  args: Record<string, unknown>,
): InteractiveFeatureConfig {
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