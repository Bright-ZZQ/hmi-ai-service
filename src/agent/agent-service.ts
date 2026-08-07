/**
 * Agent Service — Agent Loop 引擎
 *
 * 核心逻辑：
 * 1. 接收用户自然语言输入 + 编辑器类型
 * 2. 加载对应 Skill 的 tool 定义
 * 3. Agent Loop: 调模型 API → 执行 tool_call → 结果回传 → 循环
 * 4. 模型完成时提取最终 JSON → Schema 校验 → 返回
 *
 * 会话管理：
 * - 维护 workingElements 数组，存储所有已生成的图元
 * - assemble_display/assemble_symbol 自动使用 workingElements
 * - 模型无需手动传递大型 JSON 对象
 */

import { getToolsForType, isAssemblyTool } from './skill-registry'
import { buildDisplayElement, buildDisplayDocument, buildSymbolDocument, buildSymbolElement, buildMetricPanel, buildEquipment, isBackgroundElement } from './element-builders'
import type { MetricPanelParams, EquipmentParams } from './element-builders'
import { validateOutput, formatErrors } from './schema-validator'
import type {
  EditorType,
  AgentMessage,
  AgentConfig,
  AgentResult,
  AgentStep,
  ToolCall,
  SSEEvent,
  StreamCanvas,
  StreamMetrics,
  AgentContext,
} from '../types'

// ============================================================
// System Prompt
// ============================================================

const SYSTEM_PROMPT = `你是 HMI 工控组态软件的图纸/图符生成助手。

你的任务是根据用户的自然语言描述，使用提供的工具函数来生成图纸（Display）或图符（Symbol）的完整 JSON 数据。

## 工作流程

1. 分析用户需求，确定需要创建哪些图元
2. 依次调用 create_display_* 或 create_symbol_* 工具创建每个图元
3. 所有图元创建完毕后，调用 assemble_display 或 assemble_symbol 组装成完整的图纸/图符 JSON
4. 组装工具会自动使用你创建的所有图元，无需手动指定 elementsData 参数（除非你有特殊需求）

## 优先使用复合组件（关键，避免重叠）

**禁止**用一堆 create_display_text 手工逐像素拼"标签+数值"表格——这极易算错坐标导致重叠、越界。改用以下复合工具，其内部坐标由布局引擎**确定性计算**，保证不重叠、不越界、对齐整齐：

- **数据面板 / 指标列表 / 监控读数** → 必须用 \`create_metric_panel\`：只给标题和 rows（{label, value, status}），一次产出整块面板。
- **工艺设备**（储罐/塔器/炉子等）→ 必须用 \`create_equipment\`：只给 kind 和包围盒 x/y/width/height，一次产出比例正确的设备图符。
- 仅**装饰性、零散**的图元（标题文字、连接线、箭头、背景）才用 create_display_* 原语逐个绘制。

## 图层顺序（关键，避免遮挡）

- **背景/整块底板必须最先创建**：图元的绘制层级由创建顺序决定（先创建 = 在底层，后创建 = 在上层）。若先画内容再画覆盖整块画布的背景，背景就会盖住内容。
- 正确顺序：① 全屏背景 → ② 卡片/面板等容器底板 → ③ 文本、数值、状态灯、图标等内容 → ④ 连接线/箭头。
- 覆盖整块画布的背景务必贴着画布左上角(0,0)并铺满 pageWidth×pageHeight。

## 多轮修改

- 当系统提供“当前 JSON”时，表示用户正在修改上一轮结果
- 修改已有图元优先调用 update_element；删除图元调用 delete_element；新增图元继续调用 create_* 工具
- target 优先使用稳定的 id/code/key，其次使用 name
- 只修改用户明确要求的字段，其他图元及字段必须保持不变
- 修改或删除完成后，必须调用 assemble_display 或 assemble_symbol 输出完整最新 JSON

## 布局指南

- 默认图纸尺寸: 1880×962（16:9 比例）
- 多图元排列: 水平等距或网格排列
- 单个图元: 居中放置，尺寸适中（如 400×300）
- 2-3 个图元: 水平等距排列
- 4+ 个图元: 网格排列

## 画布尺寸与防重叠（关键）

- **所有图元必须完整落在画布范围内**（0 ≤ x，x+width ≤ pageWidth；0 ≤ y，y+height ≤ pageHeight），四周至少保留 20px 边距，禁止越界、禁止相互重叠（背景、卡片容器等作为底层容器除外）。
- **先规划再绘制**：在创建图元前，先按内容数量估算每个卡片/面板/图表所需的宽高，累加后判断默认 1880×962 是否放得下。
- **放不下就扩大画布**：如果内容较多、按合理间距排布会超出默认尺寸或导致图元重叠、拥挤，**必须调大画布**——在调用 \`assemble_display\` 时显式传入更大的 \`pageWidth\` / \`pageHeight\`（例如 2400×1350、2560×1440，或按需继续加大），而不是把图元硬塞进小画布造成重叠。
- 宁可扩大画布留出充足留白，也不要让图元挤在一起或超出边界。扩大画布后，记得让背景/最外层容器同步覆盖新的画布尺寸。

## 颜色指南

- 标准填充色: #D8D8D8（浅灰）
- 标准边框色: #979797（深灰）
- 警告/强调: #FF4444（红）、#FFAA00（橙）
- 正常状态: #44BB44（绿）、#4488FF（蓝）
- **文本颜色**: 图纸/图符背景默认为白色(#ffffff)，文本颜色(fill)务必选择深色以确保可见性。推荐 #000000(黑)、#333333(深灰)、#1a1a2e(深蓝黑)。禁止使用白色、浅灰(#D8D8D8)、浅黄(#FFFF99)等浅色作为文本颜色。

## 渐变色（提升视觉质感）

- 大多数形状工具（矩形/椭圆/多边形/正多边形/饼图/弧/弦，及对应图符工具）都支持渐变填充与渐变边框。
- 填充渐变：传 \`fillGradient\`（渐变模式）+ \`fillEndColor\`（终点色）；\`fill\` 作为起点色。
- 边框/线条渐变：传 \`strokeGradient\` + \`strokeEndColor\`；\`stroke\` 作为起点色。
- 渐变模式格式为 \`"方向 类型"\`：
  - 方向：top / bottom / left / right / leftTop / leftBottom / rightTop / rightBottom / center
  - 类型：linear（线性）/ radial（径向）/ single_spread（单边扩散）/ double_spread（双边扩散）
  - 示例：\`"top linear"\`（上→下线性）、\`"center radial"\`（中心向外径向）、\`"left double_spread"\`
- 需要立体感/金属感/科技感的储罐、按钮、面板、进度条时，优先使用渐变。

## 复杂图形（曲线 / 贝塞尔）

- 需要平滑曲线、圆滑轮廓、异形管路时，使用 \`create_display_curve\`（曲线）。
- 曲线通过 \`polygon\`（顶点）+ \`segments\`（段类型）+ \`controlPoints\`（贝塞尔控制点）定义：
  - segments：1=起点, 2=直线段, 3=二阶贝塞尔（每段 1 控制点）, 4=三阶贝塞尔（每段 2 控制点，最平滑）
  - 三阶贝塞尔可绘制 S 形、波浪、花瓣等复杂形状。
- 折线用 \`create_display_polyline\`，管道用 \`create_display_pipe\`，正多边形用 \`create_display_regular_polygon\`。
- 图符曲线用 \`create_symbol_polyline\`（支持 controlPoints + closed 闭合）。

## 重要提示

- 每个 create_display_* 工具调用会返回完整的图元 JSON，你无需关心内部细节
- 调用 assemble 工具后，整个生成流程完成
- 坐标原点在左上角，x 向右增大，y 向下增大`

function getSystemPrompt(editorType: EditorType): string {
  const target = editorType === 'symbol'
    ? `本次任务必须生成图符（Symbol）。只能调用 create_symbol_* 和 assemble_symbol；最终 JSON 顶层必须包含 comps，禁止输出 document。`
    : `本次任务必须生成图纸（Display）。只能调用 create_display_* 和 assemble_display；最终 JSON 顶层必须包含 document，禁止输出 comps。`
  return `${SYSTEM_PROMPT}\n\n## 本次输出类型（强制）\n\n${target}`
}

// ============================================================
// 会话状态
// ============================================================

interface SessionState {
  editorType: EditorType
  workingElements: Record<string, unknown>[]
  steps: AgentStep[]
  finalJson?: Record<string, unknown>
  currentJson?: Record<string, unknown>
  /** 流式绘制用的画布信息；最终以 assemble 结果为准 */
  canvas: StreamCanvas
}

const DEFAULT_DISPLAY_CANVAS: StreamCanvas = {
  name: 'AI生成图纸',
  pageWidth: 1880,
  pageHeight: 962,
  bgColor: '#ffffff',
}

const DEFAULT_SYMBOL_CANVAS: StreamCanvas = {
  name: 'AI生成图符',
  pageWidth: 800,
  pageHeight: 600,
  bgColor: 'rgba(255, 255, 255, 1)',
}

/** 多轮修改时沿用上一轮画布，首轮用默认值；P2 引入 begin_* 工具后由模型显式声明。 */
function getCanvasFromJson(
  editorType: EditorType,
  json?: Record<string, unknown>,
): StreamCanvas {
  if (editorType === 'display') {
    const document = json?.document as Record<string, unknown> | undefined
    const pageProperty = document?.pageProperty as Record<string, unknown> | undefined
    return {
      name: typeof document?.name === 'string' ? document.name : DEFAULT_DISPLAY_CANVAS.name,
      pageWidth: typeof pageProperty?.pageWidth === 'number' ? pageProperty.pageWidth : DEFAULT_DISPLAY_CANVAS.pageWidth,
      pageHeight: typeof pageProperty?.pageHeight === 'number' ? pageProperty.pageHeight : DEFAULT_DISPLAY_CANVAS.pageHeight,
      bgColor: typeof pageProperty?.bgColor === 'string' ? pageProperty.bgColor : DEFAULT_DISPLAY_CANVAS.bgColor,
    }
  }
  return {
    name: typeof json?.name === 'string' ? json.name : DEFAULT_SYMBOL_CANVAS.name,
    pageWidth: typeof json?.width === 'number' ? json.width : DEFAULT_SYMBOL_CANVAS.pageWidth,
    pageHeight: typeof json?.height === 'number' ? json.height : DEFAULT_SYMBOL_CANVAS.pageHeight,
    bgColor: typeof json?.background === 'string' ? json.background : DEFAULT_SYMBOL_CANVAS.bgColor,
  }
}

function getElementsFromJson(
  editorType: EditorType,
  json?: Record<string, unknown>,
): Record<string, unknown>[] {
  if (!json) return []
  const items = editorType === 'display'
    ? (json.document as Record<string, unknown> | undefined)?.elements
    : json.comps
  if (!Array.isArray(items)) return []
  return structuredClone(items) as Record<string, unknown>[]
}

function createSession(editorType: EditorType, currentJson?: Record<string, unknown>): SessionState {
  return {
    editorType,
    workingElements: getElementsFromJson(editorType, currentJson),
    steps: [],
    currentJson,
    canvas: getCanvasFromJson(editorType, currentJson),
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeElement(
  target: Record<string, unknown>,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const [key, value] of Object.entries(changes)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
    const current = result[key]
    result[key] = isPlainObject(current) && isPlainObject(value)
      ? mergeElement(current, value)
      : value
  }
  return result
}

function getElementAliases(element: Record<string, unknown>): string[] {
  const store = isPlainObject(element.store) ? element.store : {}
  const attrs = isPlainObject(element.attrs) ? element.attrs : {}
  return [
    element.id, element.code, element.key, element.name,
    attrs.id, attrs.code, attrs.key, attrs.name,
    store.id, store.code, store.key, store.name, store.node_id,
  ]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
}

function findElementIndex(elements: Record<string, unknown>[], target: string): number {
  return elements.findIndex(element => getElementAliases(element).includes(target))
}

// ============================================================
// 工具执行
// ============================================================

/** 映射 create_display_xxx 工具名到 element type */
const TOOL_TO_ELEMENT_TYPE: Record<string, string> = {
  create_display_rect: 'Rectangle',
  create_display_ellipse: 'Ellipse',
  create_display_text: 'Text',
  create_display_line: 'Line',
  create_display_polygon: 'Polygon',
  create_display_picture: 'Picture',
  create_display_pie: 'Pie',
  create_display_arc: 'Arc',
  create_display_chord: 'Chord',
  create_display_curve: 'Curve',
  create_display_pipe: 'Pipeline',
  create_display_polyline: 'Polyline',
  create_display_regular_polygon: 'RegularPolygon',
}

/** 映射 create_symbol_xxx 工具名到 symbol comp 类型 */
const TOOL_TO_SYMBOL_TYPE: Record<string, string> = {
  create_symbol_rect: 'Rect',
  create_symbol_ellipse: 'Ellipse',
  create_symbol_text: 'Text',
  create_symbol_line: 'Line',
  create_symbol_polygon: 'Polygon',
  create_symbol_polyline: 'Curve',
  create_symbol_arc: 'Arc',
  create_symbol_chord: 'Chord',
  create_symbol_pie: 'Pie',
}

/**
 * 执行单个工具调用
 * @returns 工具执行结果字符串
 */
function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  session: SessionState,
  onStep: (step: AgentStep) => void,
  emit: (event: SSEEvent) => void,
): string {
  const elementType = TOOL_TO_ELEMENT_TYPE[name]
  const symbolType = TOOL_TO_SYMBOL_TYPE[name]

  // 只有整批都是全画布底板时才下沉，避免复合组件的混合批次被误判
  const emitElements = (elements: Record<string, unknown>[]) => {
    if (elements.length === 0) return
    emit({
      type: 'element',
      elements,
      isBackground: session.editorType === 'display'
        && elements.every(el => isBackgroundElement(el, session.canvas.pageWidth, session.canvas.pageHeight)),
    })
  }

  // 1. 图元创建工具
  if (elementType) {
    const element = buildDisplayElement(elementType, args)
    session.workingElements.push(element)

    const step: AgentStep = {
      type: 'tool_call',
      content: `已创建 ${elementType} 图元: ${element.name || '(自动命名)'}`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)
    emitElements([element])

    return JSON.stringify(element)
  }

  // 1b. 图符图元创建工具
  if (symbolType) {
    const element = buildSymbolElement(symbolType, args)
    session.workingElements.push(element)
    const attrs = isPlainObject(element.attrs) ? element.attrs : {}

    const step: AgentStep = {
      type: 'tool_call',
      content: `已创建 ${symbolType} 图符图元: ${attrs.name || '(自动命名)'}`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)
    emitElements([element])

    return JSON.stringify(element)
  }

  // 1c. 复合组件工具（布局引擎驱动，一次产出多个图元）
  if (name === 'create_metric_panel') {
    let elements: Record<string, unknown>[]
    try {
      elements = buildMetricPanel(args as unknown as MetricPanelParams)
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'create_metric_panel 失败',
      })
    }
    session.workingElements.push(...elements)

    const step: AgentStep = {
      type: 'tool_call',
      content: `已创建指标面板 "${args.title || ''}"，含 ${elements.length} 个图元`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)
    emitElements(elements)

    return JSON.stringify({ success: true, count: elements.length })
  }

  if (name === 'create_equipment') {
    let elements: Record<string, unknown>[]
    try {
      elements = buildEquipment(args as unknown as EquipmentParams)
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'create_equipment 失败',
      })
    }
    session.workingElements.push(...elements)

    const step: AgentStep = {
      type: 'tool_call',
      content: `已创建设备 "${args.kind || ''}"，含 ${elements.length} 个图元`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)
    emitElements(elements)

    return JSON.stringify({ success: true, count: elements.length })
  }

  // 2. 修改已有图元（多轮对话）
  if (name === 'update_element') {
    const target = String(args.target || '')
    const index = findElementIndex(session.workingElements, target)
    if (index < 0) {
      return JSON.stringify({ success: false, error: `未找到图元: ${target}` })
    }

    let changes: Record<string, unknown>
    try {
      const parsed = JSON.parse(String(args.changesJson || '{}'))
      if (!isPlainObject(parsed)) throw new Error('changesJson 必须是 JSON 对象')
      changes = parsed
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'changesJson 解析失败',
      })
    }

    session.workingElements[index] = mergeElement(session.workingElements[index], changes)
    const step: AgentStep = {
      type: 'tool_call',
      content: `已修改图元 "${target}"`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)
    emit({
      type: 'element_patch',
      patch: { op: 'update', target, element: session.workingElements[index] },
    })
    return JSON.stringify({ success: true, element: session.workingElements[index] })
  }

  // 3. 删除已有图元（多轮对话）
  if (name === 'delete_element') {
    const target = String(args.target || '')
    const index = findElementIndex(session.workingElements, target)
    if (index < 0) {
      return JSON.stringify({ success: false, error: `未找到图元: ${target}` })
    }
    const [removed] = session.workingElements.splice(index, 1)
    const step: AgentStep = {
      type: 'tool_call',
      content: `已删除图元 "${target}"`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)
    emit({ type: 'element_patch', patch: { op: 'delete', target } })
    return JSON.stringify({ success: true, removed })
  }

  // 4. 图纸组装工具
  if (name === 'assemble_display') {
    const elementsData = (args.elementsData as Record<string, unknown>[])
    // 如果模型传了空数组或未传，自动使用 session 中已创建的所有图元
    const effectiveElements = (elementsData && elementsData.length > 0) ? elementsData : session.workingElements
    const baseDocument = session.currentJson?.document as Record<string, unknown> | undefined
    const basePageProperty = baseDocument?.pageProperty as Record<string, unknown> | undefined
    const document: Record<string, unknown> = buildDisplayDocument({
      pageName: (args.pageName as string) || (baseDocument?.name as string) || 'AI生成图纸',
      elementsData: effectiveElements,
      pageWidth: (args.pageWidth as number | undefined) ?? (basePageProperty?.pageWidth as number | undefined),
      pageHeight: (args.pageHeight as number | undefined) ?? (basePageProperty?.pageHeight as number | undefined),
      bgColor: (args.bgColor as string | undefined) ?? (basePageProperty?.bgColor as string | undefined),
      author: (args.author as string | undefined) ?? (baseDocument?.author as string | undefined),
      company: (args.company as string | undefined) ?? (baseDocument?.company as string | undefined),
      desc: (args.desc as string | undefined) ?? (baseDocument?.desc as string | undefined),
    })

    if (baseDocument) {
      const generated = document.document as Record<string, unknown>
      document.document = {
        ...generated,
        code: baseDocument.code ?? generated.code,
        layers: baseDocument.layers ?? generated.layers,
        pageParams: baseDocument.pageParams ?? generated.pageParams,
        oldPageParams: baseDocument.oldPageParams ?? generated.oldPageParams,
        pageScript: baseDocument.pageScript ?? generated.pageScript,
        elements: effectiveElements,
      }
    }

    session.finalJson = document
    session.canvas = getCanvasFromJson('display', document)
    emit({ type: 'canvas', canvas: session.canvas })

    const step: AgentStep = {
      type: 'tool_call',
      content: `已组装图纸 "${args.pageName}"，包含 ${effectiveElements.length} 个图元`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)

    return JSON.stringify(document)
  }

  // 5. 图符组装工具
  if (name === 'assemble_symbol') {
    const compsData = (args.compsData as Record<string, unknown>[])
    // 如果模型传了空数组或未传，自动使用 session 中已创建的所有图元
    const effectiveComps = (compsData && compsData.length > 0) ? compsData : session.workingElements
    if (effectiveComps.length === 0) {
      return JSON.stringify({
        success: false,
        error: '图符没有任何图元。请先成功调用 create_symbol_*，再调用 assemble_symbol。',
      })
    }
    const baseSymbol = session.currentJson
    const baseStore = baseSymbol?.store as Record<string, unknown> | undefined
    const builtSymbol = buildSymbolDocument({
      symbolName: (args.symbolName as string) || (baseSymbol?.name as string) || 'AI生成图符',
      compsData: effectiveComps,
      width: (args.width as number | undefined) ?? (baseSymbol?.width as number | undefined),
      height: (args.height as number | undefined) ?? (baseSymbol?.height as number | undefined),
      background: (args.background as string | undefined) ?? (baseSymbol?.background as string | undefined),
    })
    const symbol = baseSymbol ? {
      ...baseSymbol,
      ...builtSymbol,
      code: baseSymbol.code ?? builtSymbol.code,
      dataBindings: baseSymbol.dataBindings ?? builtSymbol.dataBindings,
      relatedProps: baseSymbol.relatedProps ?? builtSymbol.relatedProps,
      mainData: baseSymbol.mainData ?? builtSymbol.mainData,
      renderHTML: baseSymbol.renderHTML ?? builtSymbol.renderHTML,
      store: { ...baseStore, ...(builtSymbol.store as Record<string, unknown>) },
      comps: effectiveComps,
    } : builtSymbol

    session.finalJson = symbol
    session.canvas = getCanvasFromJson('symbol', symbol)
    emit({ type: 'canvas', canvas: session.canvas })

    const step: AgentStep = {
      type: 'tool_call',
      content: `已组装图符 "${args.symbolName}"，包含 ${effectiveComps.length} 个图元`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)

    return JSON.stringify(symbol)
  }

  // 6. 旋转动态特性
  if (name === 'add_feature_rotate') {
    const target = String(args.elementName || '')
    const index = findElementIndex(session.workingElements, target)
    if (index < 0) {
      return JSON.stringify({ success: false, error: `未找到需要旋转的图元: ${target}` })
    }

    const element = session.workingElements[index]
    const elementStore = isPlainObject(element.store) ? { ...element.store } : {}
    const existingFeatures = Array.isArray(elementStore.dynamicDyna)
      ? [...elementStore.dynamicDyna]
      : []
    const original = (value: unknown) => ({ original: value, ref: '' })
    const rotMode = Number(args.rotMode ?? 0)
    const conditions = args.dataSourceKey ? [{
      num: '1',
      leftValue: { nodeId: '', tagName: String(args.dataSourceKey), nodeType: '' },
      sign: Number(args.conditionOperator ?? 0),
      rightValue: original(String(args.conditionValue ?? '1')),
      logicSign: 0,
      logic: '',
      conditions: [],
    }] : []
    const pars = rotMode === 1 ? {
      rotMode: original(1), rotModeRef: original(''),
      rotCenter: original(Number(args.rotCenter ?? 5)), rotCenterRef: original(''),
      ds: original({ nodeId: '', tagName: String(args.dsDataSourceKey || ''), nodeType: '' }), dsRef: original(''),
      maxAngle: original(Number(args.maxAngle ?? 360)), maxAngleRef: original(''),
      minAngle: original(Number(args.minAngle ?? 0)), minAngleRef: original(''),
      useDB: original(Number(args.useDB ?? 0)), useDBRef: original(''),
      mu: original(Number(args.mu ?? 100)), muRef: original(''),
      md: original(Number(args.md ?? 0)), mdRef: original(''),
    } : {
      rotMode: original(0), rotModeRef: original(''),
      rotCenter: original(Number(args.rotCenter ?? 5)), rotCenterRef: original(''),
      rotAngle: original(Number(args.rotAngle ?? 5)), rotAngleRef: original(''),
      rotCond: original(Number(args.rotCond ?? 0)), rotCondRef: original(''),
      condTrue: original(Number(args.condTrue ?? 0)), condTrueRef: original(''),
      condFalse: original(Number(args.condFalse ?? 0)), condFalseRef: original(''),
    }
    existingFeatures.push({
      id: globalThis.crypto.randomUUID(),
      name: 'GraphDynaRotate',
      type: 'GraphDynaRotate',
      conditions,
      not: Boolean(args.not ?? false),
      pars,
    })
    element.store = { ...elementStore, dynamicDyna: existingFeatures }

    const step: AgentStep = {
      type: 'tool_call',
      content: `已为图元 "${target}" 添加旋转动态特性`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)
    return JSON.stringify({ success: true, element })
  }

  // 7. 其他动态特性工具（当前为占位实现）
  if (name.startsWith('add_feature_')) {
    const featureName = name.replace('add_feature_', '')
    const step: AgentStep = {
      type: 'tool_call',
      content: `已添加 ${featureName} 动态特性到图元 "${args.elementName || '(未指定)'}"`,
      toolName: name,
      toolArgs: args,
      timestamp: Date.now(),
    }
    session.steps.push(step)
    onStep(step)

    return JSON.stringify({ success: true, feature: featureName, target: args.elementName })
  }

  // 未知工具
  return JSON.stringify({ error: `未知工具: ${name}` })
}

// ============================================================
// Agent Loop 主逻辑
// ============================================================

/**
 * 运行 Agent Loop
 * @param prompt 用户自然语言输入
 * @param editorType 编辑器类型
 * @param config Agent 配置（API key 等）
 * @param onSSEEvent SSE 事件回调
 * @returns Agent 执行结果
 */
export async function runAgentLoop(
  prompt: string,
  editorType: EditorType,
  config: AgentConfig,
  onSSEEvent: (event: SSEEvent) => void,
  context: AgentContext = {},
): Promise<AgentResult> {
  const session = createSession(editorType, context.currentJson)
  const tools = getToolsForType(editorType)
  const maxRetries = config.maxRetries

  const startedAt = Date.now()
  let modelMs = 0
  let toolMs = 0
  let rounds = 0
  let toolCalls = 0

  const buildMetrics = (): StreamMetrics => {
    const totalMs = Date.now() - startedAt
    return {
      modelMs,
      // 总耗时扣掉等待模型的部分，即服务端自身开销
      serverMs: Math.max(0, totalMs - modelMs),
      toolMs,
      totalMs,
      rounds,
      toolCalls,
    }
  }
  const emitMetrics = () => onSSEEvent({ type: 'metrics', metrics: buildMetrics() })

  // 先下发画布，让前端在收到首个图元前就建好尺寸与背景
  onSSEEvent({ type: 'canvas', canvas: session.canvas })

  // 步骤回调
  const onStep = (step: AgentStep) => {
    if (step.type === 'tool_call') {
      onSSEEvent({
        type: 'tool_call',
        content: step.content,
        toolName: step.toolName,
        toolArgs: step.toolArgs,
      })
    } else if (step.type === 'thinking') {
      onSSEEvent({ type: 'thinking', content: step.content })
    }
  }

  /**
   * 模型停止调用工具但未显式组装时的兜底：直接用工作区已累积的图元组装。
   * 避免模型“忘记”调 assemble 就整单失败。
   */
  const finishWithAutoAssemble = (): AgentResult | null => {
    // toolCalls === 0 说明模型什么都没做（如反问澄清），多轮修改时不能把原图当成新结果返回
    if (session.finalJson || toolCalls === 0 || session.workingElements.length === 0) return null

    const assembleName = editorType === 'display' ? 'assemble_display' : 'assemble_symbol'
    const nameArg = editorType === 'display'
      ? { pageName: session.canvas.name }
      : { symbolName: session.canvas.name }

    const startedAt = Date.now()
    executeToolCall(assembleName, nameArg, session, onStep, onSSEEvent)
    toolMs += Date.now() - startedAt
    toolCalls++

    if (!session.finalJson) return null
    if (validateOutput(session.finalJson, editorType).length > 0) {
      // 兜底结果不合法则不占用结果位，交回原有重试/失败路径
      session.finalJson = undefined
      return null
    }

    session.steps.push({ type: 'done', content: '生成完成（服务端兜底组装）', timestamp: Date.now() })
    const metrics = buildMetrics()
    onSSEEvent({ type: 'result', json: session.finalJson })
    onSSEEvent({ type: 'metrics', metrics })
    onSSEEvent({ type: 'done' })

    return { success: true, json: session.finalJson, steps: session.steps, metrics }
  }

  // 构建初始消息
  const history = (context.history || [])
    .filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-10)
    .map(message => ({ role: message.role, content: message.content.slice(0, 4000) } as AgentMessage))

  const messages: AgentMessage[] = [{ role: 'system', content: getSystemPrompt(editorType) }]
  if (context.currentJson) {
    messages.push({
      role: 'system',
      content: `这是上一轮生成的当前 JSON。服务端已将其中图元载入工作区，请基于它增量修改并最终组装完整结果：\n${JSON.stringify(context.currentJson)}`,
    })
  }
  messages.push(...history, { role: 'user', content: prompt })

  let retries = 0

  // === Agent Loop ===
  while (retries <= maxRetries) {
    // 进度通知
    const thinkingStep: AgentStep = {
      type: 'thinking',
      content: retries === 0 ? '正在分析需求...' : `正在进行第 ${retries} 次修正...`,
      timestamp: Date.now(),
    }
    session.steps.push(thinkingStep)
    onStep(thinkingStep)

    // 流内派发：模型每吐完一个 tool_call 就立即执行并推送图元，不必等整轮结束
    const streamedResults = new Map<string, string>()
    const baseElementCount = session.workingElements.length
    const baseToolCalls = toolCalls
    // 流内工具是在读流循环里跑的，会被算进 callModel 的 elapsedMs，需单独记账后扣除
    let streamToolMs = 0

    const dispatch: StreamDispatch = {
      onToolCall: (tc) => {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          args = {}
        }
        const startedAt = Date.now()
        streamedResults.set(
          tc.id,
          executeToolCall(tc.function.name, args, session, onStep, onSSEEvent),
        )
        const cost = Date.now() - startedAt
        toolMs += cost
        streamToolMs += cost
        toolCalls++
      },
      // 模型 API 中途失败重试时，撤销本次尝试已提交的图元，并让前端重画已有部分
      onRollback: () => {
        session.workingElements.length = baseElementCount
        session.finalJson = undefined
        streamedResults.clear()
        toolCalls = baseToolCalls
        onSSEEvent({ type: 'stream_reset' })
        if (session.workingElements.length > 0) {
          onSSEEvent({ type: 'element', elements: session.workingElements })
        }
      },
    }

    // 调用模型 API（流式）
    const { response, retryCount, elapsedMs } = await callModel(config, messages, tools, onSSEEvent, dispatch)
    modelMs += Math.max(0, elapsedMs - streamToolMs)
    rounds++
    emitMetrics()

    if (!response) {
      const retried = retryCount > 0 ? `（已重试 ${retryCount} 次）` : ''
      return {
        success: false,
        error: `模型 API 调用失败${retried}`,
        steps: session.steps,
        metrics: buildMetrics(),
      }
    }

    const choice = response.choices?.[0]
    if (!choice) {
      return {
        success: false,
        error: '模型返回为空',
        steps: session.steps,
        metrics: buildMetrics(),
      }
    }

    // === 情况 1: 模型返回 tool_calls ===
    if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
      // 添加 assistant 消息（含 tool_calls）
      messages.push({
        role: 'assistant',
        content: choice.message.content || null,
        tool_calls: choice.message.tool_calls,
      } as AgentMessage)

      // 执行每个 tool_call（流内已执行的直接取缓存结果，避免重复构建图元）
      for (const tc of choice.message.tool_calls) {
        let result = streamedResults.get(tc.id)

        if (result === undefined) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch {
            args = {}
          }

          const toolStartedAt = Date.now()
          result = executeToolCall(tc.function.name, args, session, onStep, onSSEEvent)
          toolMs += Date.now() - toolStartedAt
          toolCalls++
        }

        // 添加 tool 结果消息
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        })
      }
      emitMetrics()

      // 如果是组装工具，生成完成
      if (choice.message.tool_calls.some(tc => isAssemblyTool(tc.function.name))) {
        if (session.finalJson) {
          // Schema 校验
          const errors = validateOutput(session.finalJson, editorType)
          if (errors.length === 0) {
            // 成功
            const doneStep: AgentStep = {
              type: 'done',
              content: '生成完成',
              timestamp: Date.now(),
            }
            session.steps.push(doneStep)

            const metrics = buildMetrics()
            onSSEEvent({ type: 'result', json: session.finalJson })
            onSSEEvent({ type: 'metrics', metrics })
            onSSEEvent({ type: 'done' })

            return {
              success: true,
              json: session.finalJson,
              steps: session.steps,
              metrics,
            }
          }

          // 校验失败 → 进入重试
          retries++
          const errMsg = `生成的 JSON 校验未通过，以下字段需要修正：\n${formatErrors(errors)}\n请重新调用 assemble 工具并修正。`
          messages.push({ role: 'user', content: errMsg })

          onSSEEvent({ type: 'error', content: errMsg, retry: true })

          const retryStep: AgentStep = {
            type: 'retry',
            content: formatErrors(errors),
            timestamp: Date.now(),
          }
          session.steps.push(retryStep)
          continue
        }
      }

      continue
    }

    // === 情况 2: 模型返回文本（可能包含 JSON）===
    if (choice.message?.content) {
      const content = choice.message.content

      // 尝试从文本中提取 JSON
      const json = extractJson(content)

      if (json) {
        // 判断类型
        const detectedType = detectType(json)
        if (detectedType && detectedType !== editorType) {
          retries++
          const errMsg = `输出类型错误：本次要求 ${editorType}，模型却输出了 ${detectedType}。请使用本次类型对应的 create/assemble 工具重新生成。`
          messages.push({ role: 'assistant', content })
          messages.push({ role: 'user', content: errMsg })
          onSSEEvent({ type: 'error', content: errMsg, retry: true })
          continue
        }

        const errors = validateOutput(json, editorType)
        if (errors.length === 0) {
          session.finalJson = json

          const metrics = buildMetrics()
          onSSEEvent({ type: 'result', json })
          onSSEEvent({ type: 'metrics', metrics })
          onSSEEvent({ type: 'done' })

          return {
            success: true,
            json,
            steps: session.steps,
            metrics,
          }
        }

        // 有 JSON 但格式不对 → 校验反馈
        retries++
        const errMsg = `JSON 校验失败：\n${formatErrors(errors)}\n请修正后重新输出。`
        messages.push({ role: 'assistant', content })
        messages.push({ role: 'user', content: errMsg })

        onSSEEvent({ type: 'error', content: errMsg, retry: true })
        continue
      }

      // 文本中没有 JSON
      messages.push({ role: 'assistant', content })

      const assembledFromText = finishWithAutoAssemble()
      if (assembledFromText) return assembledFromText

      return {
        success: false,
        error: '模型未生成 JSON，可能需要补充信息',
        steps: session.steps,
        metrics: buildMetrics(),
      }
    }

    // === 情况 3: 模型既未调用工具也没有文本 ===
    const assembledFromEmpty = finishWithAutoAssemble()
    if (assembledFromEmpty) return assembledFromEmpty

    retries++
  }

  // 超过最大重试次数
  return {
    success: false,
    error: `超过最大重试次数 (${maxRetries})`,
    steps: session.steps,
    metrics: buildMetrics(),
  }
}

// ============================================================
// 模型 API 调用
// ============================================================

interface ModelResponse {
  choices?: Array<{
    message?: {
      role?: string
      content?: string | null
      tool_calls?: ToolCall[]
    }
    finish_reason?: string
  }>
  error?: { message: string }
}

interface ModelCallResult {
  response: ModelResponse | null
  retryCount: number
  /** 实际等待模型 API 的耗时（ms），不含重试退避等待 */
  elapsedMs: number
}

/** 流内派发钩子：让工具在模型还在输出时就执行，而不是等整轮结束 */
interface StreamDispatch {
  /** 单个 tool_call 的 arguments 已完整，可以立即执行 */
  onToolCall: (toolCall: ToolCall) => void
  /** 本次尝试中途失败并将重试，需回滚已派发的副作用 */
  onRollback: () => void
}

async function callModel(
  config: AgentConfig,
  messages: AgentMessage[],
  tools: unknown[],
  onSSEEvent: (event: SSEEvent) => void,
  dispatch?: StreamDispatch,
): Promise<ModelCallResult> {
  const maxRetries = config.modelApiMaxRetries
  let elapsedMs = 0
  let dispatched = false

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 上一次尝试已经落了图元，重试前必须先撤销，否则会重复
    if (dispatched) {
      dispatch?.onRollback()
      dispatched = false
    }

    const attemptStartedAt = Date.now()
    try {
      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
        stream: true,
      }

      if (tools.length > 0) {
        body.tools = tools
        body.tool_choice = 'auto'
      }

      const res = await fetch(config.modelApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.modelApiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`[AgentService] API 调用失败 (attempt ${attempt + 1}/${maxRetries + 1}):`, res.status, errText)

        const isRateLimited = res.status === 429
        const isRetryable = isRateLimited || res.status === 408 || res.status >= 500

        // 认证失败、参数错误等不可恢复错误不重试
        if (!isRetryable) {
          elapsedMs += Date.now() - attemptStartedAt
          return { response: null, retryCount: attempt, elapsedMs }
        }

        if (attempt < maxRetries) {
          elapsedMs += Date.now() - attemptStartedAt
          const delay = getRetryDelay(config, attempt, res.status, res.headers.get('retry-after'))
          const reason = isRateLimited
            ? '模型服务触发速率限制'
            : `模型服务暂时不可用 (HTTP ${res.status})`
          onSSEEvent({
            type: 'retry',
            content: `${reason}，将在 ${formatDelay(delay)} 后重试 (${attempt + 1}/${maxRetries})...`,
          })
          await sleep(delay)
          continue
        }
        elapsedMs += Date.now() - attemptStartedAt
        return { response: null, retryCount: attempt, elapsedMs }
      }

      // 流式读取模型 API 响应
      const reader = res.body?.getReader()
      if (!reader) {
        console.error('[AgentService] 无法获取响应流')
        elapsedMs += Date.now() - attemptStartedAt
        return { response: null, retryCount: attempt, elapsedMs }
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedContent = ''
      const accumulatedToolCalls = new Map<number, {
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>()
      let maxIndex = -1
      const flushedIndexes = new Set<number>()

      // index 递增说明上一个 tool_call 的分片已经吐完，可以立即派发
      const flush = (index: number) => {
        if (!dispatch || index < 0 || flushedIndexes.has(index)) return
        const toolCall = accumulatedToolCalls.get(index)
        if (!toolCall?.id || !toolCall.function.name) return
        try {
          JSON.parse(toolCall.function.arguments || '{}')
        } catch {
          return // 参数尚未闭合，留给流结束后统一执行
        }
        flushedIndexes.add(index)
        try {
          dispatch.onToolCall(toolCall)
          dispatched = true
        } catch (error) {
          // 构建异常不是网络问题，不缓存结果即可交回流结束后的统一执行路径，避免误触发模型重试
          console.error('[AgentService] 流内工具执行失败:', error)
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const chunk = JSON.parse(data)
            const delta = chunk.choices?.[0]?.delta
            if (!delta) continue

            // 文本内容 → 实时转发给前端
            if (delta.content) {
              accumulatedContent += delta.content
              onSSEEvent({ type: 'thinking', content: delta.content })
            }

            // 工具调用 → 累积（多段 fragment 按 index 合并）
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0
                if (idx > maxIndex) {
                  flush(maxIndex)
                  maxIndex = idx
                }
                if (!accumulatedToolCalls.has(idx)) {
                  accumulatedToolCalls.set(idx, {
                    id: tc.id || '',
                    type: 'function',
                    function: { name: '', arguments: '' },
                  })
                }
                const existing = accumulatedToolCalls.get(idx)!
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.function.name += tc.function.name
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
              }
            }
          } catch {
            // 解析失败，跳过该 chunk
          }
        }
      }

      // 流结束，最后一个 tool_call 也已完整
      flush(maxIndex)

      // 构建最终响应
      const toolCalls = Array.from(accumulatedToolCalls.values())
      const message: NonNullable<ModelResponse['choices']>[0]['message'] = {
        role: 'assistant',
        content: accumulatedContent || null,
      }

      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls
      }

      elapsedMs += Date.now() - attemptStartedAt
      return {
        response: {
          choices: [{
            message,
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
          }],
        },
        retryCount: attempt,
        elapsedMs,
      }
    } catch (err) {
      console.error(`[AgentService] 网络请求异常 (attempt ${attempt + 1}/${maxRetries + 1}):`, err)
      elapsedMs += Date.now() - attemptStartedAt

      if (attempt < maxRetries) {
        const delay = getRetryDelay(config, attempt)
        onSSEEvent({
          type: 'retry',
          content: `网络连接失败，将在 ${formatDelay(delay)} 后重试 (${attempt + 1}/${maxRetries})...`,
        })
        await sleep(delay)
        continue
      }
      return { response: null, retryCount: attempt, elapsedMs }
    }
  }

  return { response: null, retryCount: maxRetries, elapsedMs }
}

/** 计算指数退避延迟；429 至少等待一个 TPM 统计窗口，并优先遵循 Retry-After。 */
function getRetryDelay(
  config: AgentConfig,
  attempt: number,
  status?: number,
  retryAfter?: string | null,
): number {
  const configuredBaseDelay = status === 429
    ? Math.max(config.modelApiRetryDelay, config.modelApiRateLimitRetryDelay)
    : config.modelApiRetryDelay
  const baseDelay = Number.isFinite(configuredBaseDelay) ? Math.max(0, configuredBaseDelay) : 0
  const configuredMaxDelay = Number.isFinite(config.modelApiRetryMaxDelay)
    ? config.modelApiRetryMaxDelay
    : baseDelay
  const maxDelay = Math.max(baseDelay, configuredMaxDelay)
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
  const retryAfterDelay = parseRetryAfter(retryAfter)
  const delay = Math.max(exponentialDelay, retryAfterDelay ?? 0)
  const jitter = Math.floor(Math.random() * Math.min(delay * 0.1, 5000))
  return delay + jitter
}

/** 支持 Retry-After 的秒数或 HTTP 日期格式。 */
function parseRetryAfter(value?: string | null): number | null {
  if (!value) return null

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  const retryAt = Date.parse(value)
  if (Number.isNaN(retryAt)) return null
  return Math.max(0, retryAt - Date.now())
}

function formatDelay(delay: number): string {
  return `${Math.ceil(delay / 1000)} 秒`
}

/** 延迟工具函数 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================
// JSON 提取工具
// ============================================================

/**
 * 从模型文本输出中提取 JSON 对象
 * 支持 ```json 代码块和纯 JSON 文本
 */
function extractJson(text: string): Record<string, unknown> | null {
  // 尝试 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // 继续尝试其他方式
    }
  }

  // 尝试直接解析（取第一个 { 到最后一个 }）
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1))
    } catch {
      // 失败
    }
  }

  return null
}

/**
 * 自动检测 JSON 是 Display Document 还是 Symbol
 */
function detectType(json: Record<string, unknown>): EditorType | null {
  if (json.document) return 'display'
  if (json.comps !== undefined && json.code) return 'symbol'
  return null
}
