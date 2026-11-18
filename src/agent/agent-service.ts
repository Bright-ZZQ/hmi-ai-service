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

import { getAllSkills, isAssemblyTool, lintRegistry, narrowToolsForRound, selectTools } from './skill-registry'
import { buildDisplayElement, buildDisplayDocument, buildSymbolDocument, buildSymbolElement, buildMetricPanel, buildEquipment, buildChartPanel, isBackgroundElement } from './element-builders'
import type { MetricPanelParams, EquipmentParams, ChartPanelParams } from './element-builders'
import { isDynamicFeatureTool, isInteractiveFeatureTool } from './dynamic-feature-builders'
import { enrichModelPoints } from './model-point-resolver'
import { buildGenerationPlan, validateGenerationPlan } from './generation-plan'
import { countNewElements, omitUnchangedBaseElementErrors, stackNewElementsOnTop } from './edit-context'
import {
  ACTION_KINDS,
  DISPLAY_TRIGGERS,
  MOUSE_EVENT_TYPES,
  NODE_SELF,
  buildEventDefinition,
} from './event-definition'
import type { ActionKind, DisplayTrigger, MouseEventType } from './event-definition'
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
import { findDisplayInteractionIssues, normalizeRotatePivots } from './display-integrity'
import { collectPageParamNames, ensurePageParams } from './page-params'
import { decodeText, encodeText, findElementBriefs, findElementIndex, getElementAliases, isEncodedText } from './element-lookup'
import { decodeHtmlEntities } from './text-entities'
import { ThinkingDigest } from './thinking-digest'
import { generatePlanPreview } from './plan-preview'
import { compactToolResult } from './tool-result-compactor'
import { attachFeatureToElement, prepareFeature } from './feature-attach'
import { EXTENDED_TOOL_HANDLERS } from './extended-tools'
import { ensureDeclaredPageParams } from './page-tools'
import { applyZOrderOps } from './layout-tools'
import type { SessionState, ToolExecContext, ToolHandler } from './tool-context'
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

## 输出要求（强制，控制思考与输出长度）

- 可以充分思考，把方案想清楚，但思考结束必须落到行动：定好整体分区与数量后就调用工具；能一次调用解决的（clone_element_grid、bulk_apply_feature、复合组件）不要拆成多次推演。
- 思考时的输出约定：每当确定一个关键决策（整体布局与分区、对象与特性的对应、遇到歧义时的取舍、重要的技术选择），单独起一行，以“【结论】”开头，用一句话（不超过 50 字）写清楚；其余推演照常写，不必加标记。这些结论行会实时展示给用户，其余思考内容不展示。
- 第一轮调用工具前，先用不超过 4 行文字输出“关键分析”（布局分区、对象与特性的对应关系、需要用户注意的约束），随后立即调用 declare_generation_plan 与创建工具；之后不要再复述计划或逐步解说，每轮最多一句进度说明。

## 工作流程

1. 分析用户需求，首先调用 \`declare_generation_plan\` 声明可验证的数量与特性要求
2. 依次调用 create_display_* 或 create_symbol_* 工具创建每个图元
3. 用户要求动态效果时，在目标图元创建后调用对应的 add_feature_* 工具
4. 所有图元和特性创建完毕后，调用 assemble_display 或 assemble_symbol 组装成完整的图纸/图符 JSON
5. 组装工具会自动使用工作区中的全部图元，只传图纸/图符名称与需要修改的画布参数，禁止把图元 JSON 作为参数传入（会让输出极其缓慢，看起来像卡住）

## 动态特性

- **特性工具按计划下发**：声明生成计划前不提供特性工具的参数说明；请在 \`declare_generation_plan\` 的 requiredFeatureTools 中列出要用的特性工具种类（含 add_event_definition，每种列一次，不必计数），之后的轮次只提供这些特性工具。特性使用次数变化不需要重新声明计划；只有要用计划外的特性种类时，才重新调用 declare_generation_plan 补充。
- 旋转 → \`add_feature_rotate\`，移动 → \`add_feature_move\`，闪烁 → \`add_feature_blink\`，变色 → \`add_feature_change_color\`，数值显示 → \`add_feature_num_display\`，显隐 → \`add_feature_visible\`。
- 缩放（数值驱动比例缩放） → \`add_feature_scale\`，填充（液位/进度，按比例填充） → \`add_feature_fill\`，流动（线/管道流动动画） → \`add_feature_dash_flow\`，操作使能（条件控制能否操作） → \`add_feature_operation_enable\`。
- 多状态文字 → \`add_feature_multistate_text\`，多状态颜色 → \`add_feature_multistate_color\`：每个状态自带“测点 + 运算符 + 比较值”条件，状态条件必须来自用户明确描述（\`states\`），缩放/填充需要驱动测点 \`dsDataSourceKey\`。
- 写值（点击下发） → \`add_feature_write_value\`，打开画面/跳转/弹窗 → \`add_feature_open_page\`，Tip 提示 → \`add_feature_tip_show\`，置位（脉冲/电平输出） → \`add_feature_reset\`。
- 事件定义（属性栏 - 控制 - 事件定义）统一用 \`add_event_definition\`，这是对**当前图纸**的修改，不得新建图元：
  - scope=element：图元鼠标事件（单击/双击/移入/离开/悬停/按下/抬起），动作可为脚本、显隐、移动、旋转、缩放、尺寸、变色、弹窗、打开窗口，或向其他图纸发送事件(eventScope=other + handleId)。
  - scope=display：图纸级事件。trigger=respond 事件响应（需 handleId，由图元事件/其他事件广播触发）；schedule 定时执行（间隔/每天/每周/每月）；valueChanged 数值变化（需测点全路径）；onOpenBefore 画面打开前（仅脚本）；onOpenAfter 画面打开后。
  - 一个事件只有一个动作；需要多个动作就多次调用。动作要作用于其他图元时，用 targetElements 传目标图元 id。
- 用户不会给图元 ID，而是描述图元名称或文字图元的文字内容（图纸中文字为 base64，\`find_elements\` 已解码）。需要定位图元（事件所属图元、动作目标图元）时先调用 \`find_elements\`；恰好 1 个候选才可继续；0 个或多个候选时必须调用 \`ask_user\` 提问（如“该图元是否在图纸右上方？”“该图元是否在某某图元旁边？”或列出候选让用户选），禁止猜测。用户回答后再次定位。
- 添加事件定义后，必须调用 assemble_display 返回完整图纸，其他内容保持不变。
- 脚本类特性（均不新建图元，设置后必须调用 assemble 工具输出完整结果）：
  - 图纸初始化脚本（画面加载后执行一次）→ \`set_display_script\`；默认追加到原脚本之后，仅用户明确要求替换时才 mode=replace。
  - 管道流动控制脚本 → \`set_pipe_script\`，目标必须是管道图元；脚本必须调用 data.setScriptEnabled(true) 流动组才会显示。
  - 图符（symbol）属性由数据绑定值计算（如“温度超过 80 变红”）→ \`set_symbol_attr_function\`，脚本 return 属性值，读取的绑定名必须在 dataBindings 中声明。
  - 由用户操作、定时或数值变化触发的动作用 \`add_event_definition\`，不要用上述工具。
  - 脚本只写函数体，只使用工具描述中列出的 API，严禁 import/require/eval/fetch/document/window。
- 必须先创建目标图元，再调用特性工具；\`elementName\` 使用创建工具返回的 name、id 或 node_id。
- “分别配置”表示每种特性必须绑定到不同图元，不得把所有特性堆在同一个图元上。
- 禁止自行为特性添加任何触发条件。只有用户原始请求明确指定“当/如果某测点满足某条件时”，才设置 \`conditionSpecifiedByUser=true\` 并传入 \`dataSourceKey\`、\`conditionOperator\`、\`conditionValue\`。
- 用户未明确指定条件时，必须省略所有条件参数并保持 \`conditionSpecifiedByUser=false\`；不得根据设备状态、颜色、动画类型或行业常识推断条件，不得补充默认测点或默认比较值。无条件表示特性持续生效。
- 自动旋转的 \`rotAngle\` 表示每秒旋转角度（单位：度/秒）；自动移动使用固定速度。“随测点值变化”使用参数模式，并配置对应方向的数据源与量程。
- 图元有不透明填充色时优先使用显隐闪烁（\`blinkMethod=0\`），效果比颜色闪烁更明显。
- 只有用户明确要求“颜色闪烁”时才使用 \`blinkMethod=1\` 并设置 \`forceColorBlink=true\`；此时按目标类型开启填充、边框或文字颜色开关。
- 颜色闪烁的填充色必须与图元当前背景色有明显对比；对比度低于 3:1 时，服务端自动改用黑色或白色对比色。
- 变色时必须至少开启 \`isFullClr\`、\`isFrameClr\`、\`isTextClr\` 中一项，并提供对应颜色。
- 显隐使用 \`isVisible\`：1=条件满足显示，0=条件满足隐藏。用户未指定条件时特性持续生效，因此无条件的 \`isVisible=0\` 会让图元永久不可见，禁止使用（不要的图元请删除）。
- 需要旋转的图元（扇叶、风机、转轮等）必须绕与其同轴部件（轮毂等）相同的圆心旋转：图元的包围盒中心与轮毂圆心一致时用默认旋转中心；不一致时（如 3 叶片等奇数叶片多边形，包围盒中心会偏离圆心）调用 \`add_feature_rotate\` 时传 \`pivotX/pivotY\`=轮毂圆心的画布绝对坐标。修改已有图元的 roatePos 时，旋转特性的 rotCenter 必须为 0，服务端组装时会自动校正。
- 编辑已有图纸时，为已有说明文字补充/改写文字：必须用 \`update_element\` 修改该文字本身（或 \`delete_element\` 删除后再新建），禁止在旧文字原位置再新建一个文字造成重叠；新增文字必须避开所有已有文字。
- 脚本里用 gv.setPageParamsEx/getPageParamsEx 保存启停等状态时，参数名必须是字符串字面量，服务端会在组装时自动声明；不要用变量作参数名。启停类脚本的目标图元必须是最终可见的图元，同一按钮不要为同一效果重复配置多条脚本。
- 写值必须传入要写入的测点 \`dataSourceKey\`；开关量用 \`valueType=digital\`（默认，反转或写 0/1），模拟量用 \`valueType=analog\`。触发事件默认单击。
- 打开画面必须指定目标：图纸用 \`pageName\`，网页用 \`webPath\`。弹窗打开时设置 \`popType=1\` 并配置位置/尺寸。

## 批量、排版与检查工具（有这些工具时优先使用，不要重复劳动）

- 多个一样的图元/设备（如 8 台泵、3×4 指示灯）：先创建并配置好第一个，再用 \`clone_element_grid\` 按 rows×cols 复制；用 \`replace\` 把特性里的测点按序号换成各自的（如 [{"from":"PUMP1","to":"PUMP{n}"}]）。禁止逐个 create_* 再逐个 add_feature_*。
- 一批图元用同一种特性 → \`bulk_apply_feature\`（paramsJson 里可用 {n}/{name} 占位）；把一个图元配好的特性复制到别的图元 → \`copy_features\`（先 \`list_features\` 看有哪些）。
- 用户给了点表（CSV/JSON：位号、描述、单位…）→ \`import_point_table\` 一次生成“名称 + 实时值 + 单位”并绑定测点；需要自定义样式时传 templateTarget。
- 对齐/等距/层级/越界：\`align_elements\`、\`distribute_elements\`、\`set_z_order\`、\`fit_to_canvas\`；多个图元需要整体移动或复制时先 \`group_elements\`。不要用 update_element 手工逐个改坐标。
- 画布尺寸/背景色/刷新周期/适应模式 → \`set_page_property\`；需要指定类型或 TP 的页面参数 → \`declare_page_params\`（脚本里字面量引用的参数无需声明，会自动补）。
- 修改或删除已有特性：先 \`list_features\` 取 id/序号，再用 \`update_feature\` / \`remove_feature\`；需要看某个图元的具体字段用 \`get_element_detail\`（按 paths 取），不要整份读取画布 JSON。
- 修改较多后、组装前可调用 \`lint_display\`（布局/交互问题）、\`check_feature_conditions\`（特性条件）自检；写了较复杂的脚本可用 \`test_script\` 在沙箱试跑，按 warnings/error 修正。这些检查工具只读，修改仍用对应的编辑工具。
- 以上工具修改了画布内容后，同样必须调用 assemble_display / assemble_symbol 输出完整结果。

## 优先使用复合组件（关键，避免重叠）

**禁止**用一堆 create_display_text 手工逐像素拼"标签+数值"表格——这极易算错坐标导致重叠、越界。改用以下复合工具，其内部坐标由布局引擎**确定性计算**，保证不重叠、不越界、对齐整齐：

- **数据面板 / 指标列表 / 监控读数** → 必须用 \`create_metric_panel\`：只给标题和 rows（{label, value, status}），一次产出整块面板。
- **图表**（柱状图 / 折线图 / 饼图、趋势、占比、统计）→ 必须用 \`create_chart_panel\`：只给 kind + title + data（[{label, value}]），一次产出整张图表卡片。坐标轴、柱子、折线、扇形、图例全部自动排布并被限制在卡片内，**绝不越界**。严禁用 create_display_rect / pie / polyline / line 手工拼图表。
- **工艺设备**（储罐/塔器/炉子等）→ 必须用 \`create_equipment\`：只给 kind 和包围盒 x/y/width/height，一次产出比例正确的设备图符。
- 仅**装饰性、零散**的图元（标题文字、连接线、箭头、背景）才用 create_display_* 原语逐个绘制。

## 图元数量语义（强制）

- 用户明确要求“生成 N 个图元”时（无当前 JSON 的新建场景；编辑已有内容时 N 指本轮新增数量），最终 \`elements\` / \`comps\` 必须恰好有 N 项（编辑时为 已有 + N 项）。
- \`create_equipment\`、\`create_metric_panel\` 和 \`create_chart_panel\` 一次会展开为多个基础图元，因此用户按“图元”计数时禁止使用；只有用户明确按“设备”或“面板”计数时才使用复合工具。
- 将明确的最终数量填入生成计划的 \`expectedElementCount\`；数量不明确时省略，不得猜测。

## 图层顺序（关键，避免遮挡）

- **背景/整块底板必须最先创建**：图元的绘制层级由创建顺序决定（先创建 = 在底层，后创建 = 在上层）。若先画内容再画覆盖整块画布的背景，背景就会盖住内容。
- 正确顺序：① 全屏背景 → ② 卡片/面板等容器底板 → ③ 文本、数值、状态灯、图标等内容 → ④ 连接线/箭头。
- 覆盖整块画布的背景务必贴着画布左上角(0,0)并铺满 pageWidth×pageHeight。

## 多轮修改

- 当系统提供“当前 JSON”时，表示画布上已有内容（可能是用户手工绘制或上一轮生成的），用户要在它的基础上修改，**不是**重新生成
- 默认保留所有已有图元，只做用户要求的改动：新增内容用 create_* 工具追加；修改已有图元优先调用 update_element；删除图元调用 delete_element
- 只有用户明确要求“清空/重画/重新生成/替换全部”时，才可以用 delete_element 删除**用户未提及**的已有图元；否则禁止删除或重建用户未提及的图元
- 用户要求修复、重做或替换某个图元/设备时，被替换掉的旧图元（包括你上一轮生成的）必须用 delete_element 删除，禁止用显隐特性（add_feature_visible）或事件把旧图元“隐藏”后另建新的；事件与特性必须作用于最终可见的图元，不得残留指向已删除或隐藏图元的事件
- 不得重复创建已存在的图元；新增图元的位置必须在现有画布尺寸（当前 JSON 的 pageWidth/pageHeight 或 width/height）之内，并避开已有图元占据的区域，不得覆盖已有内容；画布尺寸、背景色、图纸名称保持不变，除非用户明确要求修改
- 编辑模式下 declare_generation_plan 的 expectedElementCount 表示**本轮新增**的图元数量；用户未明确要求新增数量时（含仅修改/删除、或新增数量不确定）必须省略，不要填 0
- target 优先使用稳定的 id/code/key，其次使用 name
- 只修改用户明确要求的字段，其他图元及字段必须保持不变
- 修改、删除或新增完成后，必须调用 assemble_display 或 assemble_symbol 输出完整最新 JSON（含全部已有图元）

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
    ? `本次任务必须生成图符（Symbol）。使用 create_symbol_* 创建图元，可按需调用 add_feature_*，最后调用 assemble_symbol；最终 JSON 顶层必须包含 comps，禁止输出 document。`
    : `本次任务必须生成图纸（Display）。使用 create_display_* 创建图元，可按需调用 add_feature_*，最后调用 assemble_display；最终 JSON 顶层必须包含 document，禁止输出 comps。`
  return `${SYSTEM_PROMPT}\n\n## 本次输出类型（强制）\n\n${target}\n\n## 思考格式提醒（强制）\n\n你的思考过程中，每确定一个关键决策（布局分区、对象与特性对应、歧义取舍、技术选择），必须另起一行并以“【结论】”开头写一句话（≤50 字），例如：\n【结论】左侧 6 个按钮、右侧 6 个对象按行一一对应\n【结论】风机用三个扇叶多边形，绕轮毂圆心旋转\n这些结论行会实时展示给用户，务必先写出整体方案的结论再开始细节推演。`
}

// ============================================================
// 会话状态
// ============================================================

export type { SessionState }

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

export function createSession(editorType: EditorType, currentJson?: Record<string, unknown>): SessionState {
  return {
    editorType,
    workingElements: getElementsFromJson(editorType, currentJson),
    steps: [],
    currentJson,
    featureExecutions: [],
    displayEvents: [],
    symbolDataBindings: [],
    pageProperty: {},
    pageParamDecls: [],
    zOrderOps: [],
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

function getInvalidSizeError(element: Record<string, unknown>): string | undefined {
  if (element.type === 'Group') return undefined
  const isValid = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0
  if (!isValid(element.width) || !isValid(element.height)) {
    return `width/height 必须是大于 0 的有限数字（当前 width=${String(element.width)}, height=${String(element.height)}）`
  }
  const rect = element.localRect
  if (Array.isArray(rect) && rect.some(p => !isPlainObject(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    return 'x/y 必须是有限数字'
  }
  return undefined
}

/**
 * 模型显式传入 elementsData 时往往是自行转写的副本，会丢失 store 中的动态/交互特性。
 * 按 id/名称回溯到工作区中的原图元，找不到才沿用传入内容。
 */
function resolveExplicitElements(
  explicit: unknown,
  working: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (!Array.isArray(explicit)) return working
  const resolved: Record<string, unknown>[] = []
  for (const item of explicit) {
    if (!isPlainObject(item)) continue
    const index = typeof item.id === 'string' ? findElementIndex(working, item.id) : -1
    // 名称可能重复，仅在唯一匹配时才按名称回溯，避免多个图元被折叠成同一个
    const nameMatches = index < 0 && typeof item.name === 'string'
      ? working.filter(element => getElementAliases(element).includes(item.name as string))
      : []
    const matched = index >= 0 ? working[index] : nameMatches.length === 1 ? nameMatches[0] : item
    if (!resolved.includes(matched)) resolved.push(matched)
  }
  return resolved
}

/** 兜底：模型自行转写的文字图元可能携带未编码的原始文字，组装前统一修正为 base64 */
function ensureEncodedTexts(elements: Record<string, unknown>[]): Record<string, unknown>[] {
  return elements.map((element) => {
    if (element.type !== 'Text' || typeof element.text !== 'string') return element
    if (!isEncodedText(element.text)) {
      return { ...element, text: encodeText(decodeHtmlEntities(element.text)) }
    }
    const raw = decodeText(element.text) ?? ''
    const cleaned = decodeHtmlEntities(raw)
    return cleaned === raw ? element : { ...element, text: encodeText(cleaned) }
  })
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

// ============================================================
// 工具执行分发（P1：注册表驱动的 name → handler 查表）
// ============================================================

// 只有整批都是全画布底板时才下沉，避免复合组件的混合批次被误判
function emitElements(
  session: SessionState,
  emit: (event: SSEEvent) => void,
  elements: Record<string, unknown>[],
): void {
  if (elements.length === 0) return
  emit({
    type: 'element',
    elements,
    isBackground: session.editorType === 'display'
      && elements.every(el => isBackgroundElement(el, session.canvas.pageWidth, session.canvas.pageHeight)),
  })
}

function handleDeclarePlan({ name, args, session, onStep }: ToolExecContext): string {
  const plan = buildGenerationPlan(args)
  session.generationPlan = plan
  const step: AgentStep = {
    type: 'tool_call',
    content: `已声明生成计划: ${plan.summary || '未命名计划'}`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  return JSON.stringify({ success: true, plan })
}

// 图元创建工具（create_display_*）
function handleCreateDisplayElement({ name, args, session, onStep, emit }: ToolExecContext): string {
  const elementType = TOOL_TO_ELEMENT_TYPE[name]
  const element = buildDisplayElement(elementType, args)
  // 缺少/非法的尺寸参数会生成残缺图元，直接拒绝并让模型重新创建，避免污染工作区
  const sizeError = getInvalidSizeError(element)
  if (sizeError) {
    return JSON.stringify({
      success: false,
      error: `${name} 参数不合法：${sizeError}。该图元未创建，请补全 x/y/width/height 等必填参数后重新调用`,
    })
  }
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
  emitElements(session, emit, [element])

  return JSON.stringify(element)
}

// 图符图元创建工具（create_symbol_*）
function handleCreateSymbolElement({ name, args, session, onStep, emit }: ToolExecContext): string {
  const symbolType = TOOL_TO_SYMBOL_TYPE[name]
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
  emitElements(session, emit, [element])

  return JSON.stringify(element)
}

// 复合组件：指标面板
function handleMetricPanel({ name, args, session, onStep, emit }: ToolExecContext): string {
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
  emitElements(session, emit, elements)

  return JSON.stringify({
    success: true,
    count: elements.length,
    targets: elements.map(element => ({
      id: element.id,
      name: element.name,
    })),
  })
}

// 复合组件：图表卡片
function handleChartPanel({ name, args, session, onStep, emit }: ToolExecContext): string {
  let elements: Record<string, unknown>[]
  try {
    elements = buildChartPanel(args as unknown as ChartPanelParams)
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'create_chart_panel 失败',
    })
  }
  session.workingElements.push(...elements)

  const step: AgentStep = {
    type: 'tool_call',
    content: `已创建图表卡片 "${args.title || ''}"（${args.kind || ''}），含 ${elements.length} 个图元`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emitElements(session, emit, elements)

  return JSON.stringify({
    success: true,
    count: elements.length,
    targets: elements.map(element => ({
      id: element.id,
      name: element.name,
    })),
  })
}

// 复合组件：工艺设备
function handleEquipment({ name, args, session, onStep, emit }: ToolExecContext): string {
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
  emitElements(session, emit, elements)

  return JSON.stringify({
    success: true,
    count: elements.length,
    targets: elements.map(element => ({
      id: element.id,
      name: element.name,
    })),
  })
}

// 修改已有图元（多轮对话）
function handleUpdateElement({ name, args, session, onStep, emit }: ToolExecContext): string {
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

  // 图纸文字图元的 text 以 base64 存储，模型传入的是原始文字，必须编码，否则编辑器 atob 解码失败
  if (session.editorType === 'display' && typeof changes.text === 'string') {
    changes = { ...changes, text: encodeText(decodeHtmlEntities(changes.text)) }
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

// 删除已有图元（多轮对话）
function handleDeleteElement({ name, args, session, onStep, emit }: ToolExecContext): string {
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

// 图纸组装
function handleAssembleDisplay({ name, args, session, onStep, emit }: ToolExecContext): string {
  const elementsData = args.elementsData
  // 如果模型传了空数组或未传，自动使用 session 中已创建的所有图元
  const effectiveElements = normalizeRotatePivots(ensureEncodedTexts(
    (Array.isArray(elementsData) && elementsData.length > 0)
      ? resolveExplicitElements(elementsData, session.workingElements)
      : session.workingElements,
  ), getElementsFromJson('display', session.currentJson))
  const baseDocument = session.currentJson?.document as Record<string, unknown> | undefined
  const basePageProperty = baseDocument?.pageProperty as Record<string, unknown> | undefined
  // 编辑已有图纸时，新增图元叠放在已有图元之上，已有图元的层级保持不变
  const baseElements = getElementsFromJson('display', session.currentJson)
  const baseIds = new Set(baseElements.map(element => element.id).filter(Boolean))
  // 以已有图元的当前层级（可能被拆分组合等操作调整过）作为叠放基准
  const survivingBase = effectiveElements.filter(element => baseIds.has(element.id))
  const finalElements = baseDocument
    ? stackNewElementsOnTop(effectiveElements, survivingBase)
    : effectiveElements
  const document: Record<string, unknown> = buildDisplayDocument({
    pageName: (args.pageName as string) || (baseDocument?.name as string) || 'AI生成图纸',
    elementsData: finalElements,
    pageWidth: (args.pageWidth as number | undefined) ?? (session.pageProperty.pageWidth as number | undefined) ?? (basePageProperty?.pageWidth as number | undefined),
    pageHeight: (args.pageHeight as number | undefined) ?? (session.pageProperty.pageHeight as number | undefined) ?? (basePageProperty?.pageHeight as number | undefined),
    bgColor: (args.bgColor as string | undefined) ?? (session.pageProperty.bgColor as string | undefined) ?? (basePageProperty?.bgColor as string | undefined),
    author: (args.author as string | undefined) ?? (baseDocument?.author as string | undefined),
    company: (args.company as string | undefined) ?? (baseDocument?.company as string | undefined),
    desc: (args.desc as string | undefined) ?? (baseDocument?.desc as string | undefined),
  })

  const generatedDocument = document.document as Record<string, unknown>
  const generatedPageProperty = generatedDocument.pageProperty as Record<string, unknown>
  // 保留原图纸 pageProperty 中的其他配置（如已有 events、scriptFunc），仅以生成值覆盖尺寸/背景等
  const pageProperty: Record<string, unknown> = { ...basePageProperty, ...generatedPageProperty }
  // 原图纸的 latestIndex 是编辑器生成名称/编号的计数基准，不能被调低
  if (typeof basePageProperty?.latestIndex === 'number' && basePageProperty.latestIndex > Number(pageProperty.latestIndex)) {
    pageProperty.latestIndex = basePageProperty.latestIndex
  }
  // set_page_property 设置的其余属性（适应模式、刷新周期等）覆盖到图纸属性；尺寸与背景以上面的最终取值为准
  Object.assign(pageProperty, session.pageProperty, {
    pageWidth: generatedPageProperty.pageWidth,
    pageHeight: generatedPageProperty.pageHeight,
    width: generatedPageProperty.width,
    height: generatedPageProperty.height,
    bgColor: generatedPageProperty.bgColor,
  })
  if (session.displayEvents.length > 0) {
    const baseEvents = Array.isArray(basePageProperty?.events) ? basePageProperty.events : []
    pageProperty.events = [...baseEvents, ...session.displayEvents]
  }
  if (session.displayScript) {
    pageProperty.scriptFunc = mergePageScript(
      basePageProperty?.scriptFunc,
      session.displayScript.script,
      session.displayScript.replace,
    )
  }
  generatedDocument.pageProperty = pageProperty

  if (baseDocument) {
    const generated = document.document as Record<string, unknown>
    document.document = {
      ...generated,
      code: baseDocument.code ?? generated.code,
      layers: baseDocument.layers ?? generated.layers,
      pageParams: baseDocument.pageParams ?? generated.pageParams,
      oldPageParams: baseDocument.oldPageParams ?? generated.oldPageParams,
      pageScript: baseDocument.pageScript ?? generated.pageScript,
      elements: finalElements,
    }
  }

  // 脚本以字面量引用的页面参数必须已声明，否则运行时 setPageParamsEx 无效、getPageParamsEx 返回 undefined
  const finalDocument = document.document as Record<string, unknown>
  finalDocument.pageParams = ensurePageParams(
    ensureDeclaredPageParams(finalDocument.pageParams, session.pageParamDecls),
    collectPageParamNames([finalDocument.elements, finalDocument.pageProperty]),
  )

  if (session.zOrderOps.length > 0) finalDocument.elements = applyZOrderOps(finalDocument.elements as Record<string, unknown>[], session.zOrderOps)

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

// 图符组装
function handleAssembleSymbol({ name, args, session, onStep, emit }: ToolExecContext): string {
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
  const symbol: Record<string, unknown> = baseSymbol ? {
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

  if (session.symbolDataBindings.length > 0) {
    symbol.dataBindings = mergeDataBindings(symbol.dataBindings, session.symbolDataBindings)
  }
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

function resolveFeatureTarget(session: SessionState, args: Record<string, unknown>): {
  target: string
  index: number
  element: Record<string, unknown>
} | { error: string } {
  const target = String(args.elementName || '')
  const index = findElementIndex(session.workingElements, target)
  if (index < 0) {
    return { error: `未找到需要添加特性的图元: ${target}` }
  }
  return { target, index, element: session.workingElements[index] }
}

function finishFeatureAttach(
  ctx: ToolExecContext,
  target: string,
  element: Record<string, unknown>,
  featureType: string,
  kind: '动态' | '交互',
): string {
  const { name, args, session, onStep, emit } = ctx
  session.featureExecutions.push({
    toolName: name,
    elementKey: getElementAliases(element)[0] || target,
  })
  const step: AgentStep = {
    type: 'tool_call',
    content: `已为图元 "${target}" 添加 ${featureType} ${kind}特性`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emit({
    type: 'element_patch',
    patch: { op: 'update', target, element },
  })
  return JSON.stringify({ success: true, element })
}

// 动态特性（旋转 / 移动 / 闪烁 / 变色 / 数值显示 / 显隐 / 缩放 / 填充 / 流动 / 操作使能 / 多状态文字 / 多状态颜色）
function handleDynamicFeature(ctx: ToolExecContext): string {
  const { name, args, session } = ctx
  if (!isDynamicFeatureTool(name)) {
    return JSON.stringify({ success: false, error: `动态特性工具尚未实现: ${name}` })
  }
  return attachFeatureFromArgs(ctx, name, args, session)
}

// 交互特性（写值 / 打开页面 / Tip 显示 / 置位）
function handleInteractiveFeature(ctx: ToolExecContext): string {
  const { name, args, session } = ctx
  if (!isInteractiveFeatureTool(name)) {
    return JSON.stringify({ success: false, error: `交互特性工具尚未实现: ${name}` })
  }
  return attachFeatureFromArgs(ctx, name, args, session)
}

function attachFeatureFromArgs(
  ctx: ToolExecContext,
  name: string,
  args: Record<string, unknown>,
  session: SessionState,
): string {
  const resolved = resolveFeatureTarget(session, args)
  if ('error' in resolved) {
    return JSON.stringify({ success: false, error: resolved.error })
  }
  const { target, element } = resolved
  const prepared = prepareFeature(name, args, element, session.editorType)
  if ('error' in prepared) {
    return JSON.stringify({ success: false, error: prepared.error })
  }
  attachFeatureToElement(element, prepared.storeKey, prepared.feature)
  return finishFeatureAttach(ctx, target, element, prepared.feature.type, prepared.kind)
}
// 按名称/文字内容检索图元
function handleFindElements({ args, session }: ToolExecContext): string {
  const keyword = typeof args.keyword === 'string' ? args.keyword : ''
  const { total, candidates } = findElementBriefs(
    session.workingElements,
    keyword,
    session.canvas.pageWidth,
    session.canvas.pageHeight,
  )
  return JSON.stringify({
    success: true,
    canvas: { width: session.canvas.pageWidth, height: session.canvas.pageHeight },
    total,
    candidates,
  })
}

// 目标不明确时向用户提问并结束本轮
function handleAskUser({ name, args, session, onStep, emit }: ToolExecContext): string {
  const question = typeof args.question === 'string' ? args.question.trim() : ''
  if (!question) return JSON.stringify({ success: false, error: '缺少 question 参数' })
  const options = Array.isArray(args.options)
    ? args.options.filter((o): o is string => typeof o === 'string' && o.length > 0).slice(0, 6)
    : undefined
  session.question = { question, ...(options?.length ? { options } : {}) }
  const step: AgentStep = {
    type: 'tool_call',
    content: question,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emit({ type: 'question', question: session.question })
  return JSON.stringify({ success: true, message: '已向用户提问，请停止并等待用户回答' })
}

const DISPLAY_EVENT_KEY = '__display_event__'

function getElementNodeId(element: Record<string, unknown>): string {
  const store = isPlainObject(element.store) ? element.store : {}
  const id = element.id ?? store.node_id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : getElementAliases(element)[0] ?? ''
}

function pickEnum<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback
}

// 事件定义：图元级写入 store.events，图纸级并入 pageProperty.events
function handleAddEventDefinition(ctx: ToolExecContext): string {
  const { name, args, session, onStep } = ctx
  const isDisplay = args.scope === 'display'
  const title = typeof args.title === 'string' ? args.title.trim().slice(0, 30) : ''
  const action = pickEnum<ActionKind>(args.action, ACTION_KINDS, 'script')

  // 动作目标图元：targetElements 逐个解析为图元 id
  const nodeIds: string[] = []
  const targets = Array.isArray(args.targetElements) ? args.targetElements : []
  for (const raw of targets) {
    const key = String(raw)
    if (key === NODE_SELF) {
      nodeIds.push(NODE_SELF)
      continue
    }
    const index = findElementIndex(session.workingElements, key)
    if (index < 0) {
      return JSON.stringify({ success: false, error: `未找到动作目标图元: ${key}，请先用 find_elements 确定` })
    }
    nodeIds.push(getElementNodeId(session.workingElements[index]))
  }

  let owner: { target: string, element: Record<string, unknown> } | undefined
  if (!isDisplay) {
    const resolved = resolveFeatureTarget(session, args)
    if ('error' in resolved) return JSON.stringify({ success: false, error: resolved.error })
    owner = resolved
    // 图元事件缺省对自身执行动作；脚本同样默认以自身为目标，保证 data 不为 undefined
    if (nodeIds.length === 0) nodeIds.push(NODE_SELF)
  }

  const event = buildEventDefinition({
    target: isDisplay ? 'display' : 'element',
    title,
    nodeIds,
    mouseEvent: pickEnum<MouseEventType>(args.eventType, MOUSE_EVENT_TYPES, 'onClick'),
    eventScope: args.eventScope === 'other' ? 'other' : 'current',
    trigger: pickEnum<DisplayTrigger>(args.trigger, DISPLAY_TRIGGERS, 'respond'),
    handleId: typeof args.handleId === 'string' ? args.handleId.trim() : '',
    schedule: args,
    dataSourceKeys: Array.isArray(args.dataSourceKeys) ? args.dataSourceKeys.map(String) : [],
    action,
    args,
  })
  if ('error' in event) {
    return JSON.stringify({ success: false, error: `${event.error}，请修正后重新调用` })
  }

  if (!isDisplay && owner) {
    const { target, element } = owner
    const elementStore = isPlainObject(element.store) ? { ...element.store } : {}
    const events = Array.isArray(elementStore.events) ? [...elementStore.events] : []
    events.push(event)
    element.store = { ...elementStore, events }
    return finishFeatureAttach(ctx, target, element, `${String(event.type ?? '')} 事件(${action})`, '交互')
  }

  session.displayEvents.push(event)
  session.featureExecutions.push({
    toolName: name,
    elementKey: `${DISPLAY_EVENT_KEY}${session.displayEvents.length}`,
  })
  const step: AgentStep = {
    type: 'tool_call',
    content: `已添加图纸事件 "${title || event.name}"（${String(args.trigger ?? 'respond')} / ${action}）`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  return JSON.stringify({ success: true, event })
}

// 图纸脚本：写入 pageProperty.scriptFunc（assemble_display 时合并）
function handleSetDisplayScript(ctx: ToolExecContext): string {
  const { name, args, session, onStep } = ctx
  const prepared = prepareScript(args.script, PAGE_SCRIPT_PARAMS)
  if ('error' in prepared) {
    return JSON.stringify({ success: false, error: `${prepared.error}，请修正后重新调用` })
  }
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
  return JSON.stringify({ success: true, message: '图纸脚本已设置，请调用 assemble_display 输出完整图纸' })
}

// 管道脚本：写入管道图元 store.pipeScript
function handleSetPipeScript(ctx: ToolExecContext): string {
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
function handleSetSymbolAttrFunction(ctx: ToolExecContext): string {
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

/**
 * 工具执行分发表：工具名 → handler。
 * 基础图元 / 图符图元 / 动态特性按注册表自动接线，其余按名精确登记。
 * 由 lintRegistry 保证与 Skill 注册表一一对应，杜绝定义与执行漂移。
 */
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  declare_generation_plan: handleDeclarePlan,
  add_event_definition: handleAddEventDefinition,
  set_display_script: handleSetDisplayScript,
  set_pipe_script: handleSetPipeScript,
  set_symbol_attr_function: handleSetSymbolAttrFunction,
  find_elements: handleFindElements,
  ask_user: handleAskUser,
  create_metric_panel: handleMetricPanel,
  create_equipment: handleEquipment,
  create_chart_panel: handleChartPanel,
  update_element: handleUpdateElement,
  delete_element: handleDeleteElement,
  assemble_display: handleAssembleDisplay,
  assemble_symbol: handleAssembleSymbol,
  ...EXTENDED_TOOL_HANDLERS,
}

for (const skill of getAllSkills()) {
  const toolName = skill.toolDef.function.name
  if (TOOL_HANDLERS[toolName]) continue
  if (TOOL_TO_ELEMENT_TYPE[toolName]) TOOL_HANDLERS[toolName] = handleCreateDisplayElement
  else if (TOOL_TO_SYMBOL_TYPE[toolName]) TOOL_HANDLERS[toolName] = handleCreateSymbolElement
  else if (isDynamicFeatureTool(toolName)) TOOL_HANDLERS[toolName] = handleDynamicFeature
  else if (isInteractiveFeatureTool(toolName)) TOOL_HANDLERS[toolName] = handleInteractiveFeature
}

// 启动自检：确保工具定义、分类元数据与执行 handler 三者一致（定义即执行）
const REGISTRY_WIRING_ERRORS = lintRegistry(Object.keys(TOOL_HANDLERS))
if (REGISTRY_WIRING_ERRORS.length > 0) {
  throw new Error(`[skill-registry] 工具接线校验失败:\n- ${REGISTRY_WIRING_ERRORS.join('\n- ')}`)
}

/**
 * 执行单个工具调用
 * @returns 工具执行结果字符串
 */
export function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  session: SessionState,
  onStep: (step: AgentStep) => void,
  emit: (event: SSEEvent) => void,
): string {
  const handler = TOOL_HANDLERS[name]
  if (!handler) return JSON.stringify({ error: `未知工具: ${name}` })
  try {
    return handler({ name, args, session, onStep, emit })
  } catch (error) {
    // 单个工具参数异常不应中断整轮生成，把错误回传给模型让其修正后重试
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[AgentService] tool ${name} failed: ${message}`)
    return JSON.stringify({ success: false, error: `${name} 执行失败: ${message}，请检查参数后重新调用` })
  }
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
  // 按需下发：按用户意图筛选工具子集，静态需求省去动态特性工具、首轮省去编辑工具
  const tools = selectTools(editorType, {
    prompt,
    isEditing: Boolean(context.currentJson),
  })
  const maxRetries = config.maxRetries
  const baseElements = getElementsFromJson(editorType, context.currentJson)
  const isEditing = Boolean(context.currentJson)
  const validateFinalOutput = (json: unknown) => {
    const output = isPlainObject(json) ? json : undefined
    const generatedElements = getElementsFromJson(editorType, output)
    const generatedElementKeys = new Set(generatedElements.flatMap(getElementAliases))
    const finalFeatureExecutions = session.featureExecutions.filter(
      execution => execution.elementKey.startsWith(DISPLAY_EVENT_KEY) || generatedElementKeys.has(execution.elementKey),
    )
    // 编辑已有内容时，数量约束针对本轮新增的图元，已有图元不计入
    const plannedElementCount = isEditing
      ? countNewElements(generatedElements, baseElements)
      : generatedElements.length
    // 已有图纸本身存在的问题不由本轮负责，只拦截本轮新引入的
    const baseInteractionIssues = new Set(editorType === 'display' ? findDisplayInteractionIssues(baseElements) : [])
    const interactionIssues = editorType === 'display'
      ? [...new Set(findDisplayInteractionIssues(generatedElements))].filter(issue => !baseInteractionIssues.has(issue))
      : []
    return [
      ...omitUnchangedBaseElementErrors(validateOutput(json, editorType), generatedElements, baseElements),
      ...interactionIssues.map(message => ({ path: 'elements', message })),
      ...validateGenerationPlan(
        session.generationPlan,
        plannedElementCount,
        finalFeatureExecutions,
        isEditing,
      ).map(message => ({ path: 'generationPlan', message })),
    ]
  }

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
  const finishWithAutoAssemble = async (): Promise<AgentResult | null> => {
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
    if (validateFinalOutput(session.finalJson).length > 0) {
      // 兜底结果不合法则不占用结果位，交回原有重试/失败路径
      session.finalJson = undefined
      return null
    }

    session.steps.push({ type: 'done', content: '生成完成（服务端兜底组装）', timestamp: Date.now() })
    await enrichModelPoints(session.finalJson, context.modelPointApi)
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
      content: `这是画布上已有的当前${editorType === 'symbol' ? '图符' : '图纸'} JSON。服务端已将其中图元载入工作区，请保留已有内容，仅按用户要求增量新增/修改/删除，并最终组装完整结果：\n${JSON.stringify(context.currentJson)}`,
    })
  }
  messages.push(...history, { role: 'user', content: prompt })

  // 方案预览：几秒内先把整体方案流式展示给用户，并交给主流程作为已确定的方案
  let previewStreamed = false
  const planPreview = await generatePlanPreview(prompt, editorType, config, context, (text) => {
    if (!previewStreamed) {
      previewStreamed = true
      onSSEEvent({ type: 'thinking', content: '📋 整体方案：\n' })
    }
    onSSEEvent({ type: 'thinking', content: text })
  })
  if (planPreview) {
    onSSEEvent({ type: 'thinking', content: '\n' })
    messages.push({
      role: 'system',
      content: `已向用户展示的整体方案如下。整体规划已完成，你无需重复规划：思考只需补充实现细节（坐标、参数），随后直接调用工具按方案执行；若发现方案有误可在执行中修正。\n${planPreview}`,
    })
  }

  let retries = 0
  let lengthRetries = 0
  const MAX_LENGTH_RETRIES = 2
  let lastValidationErrors = ''
  let announcedRetries = -1
  // === Agent Loop ===
  while (retries <= maxRetries) {
    // 进度通知：只在首轮和每次修正时提示，普通工具轮次不重复刷屏
    if (retries !== announcedRetries) {
      announcedRetries = retries
      const thinkingStep: AgentStep = {
        type: 'thinking',
        content: retries === 0 ? '正在分析需求...' : `正在进行第 ${retries} 次修正...`,
        timestamp: Date.now(),
      }
      session.steps.push(thinkingStep)
      onStep(thinkingStep)
    }

    // 流内派发：模型每吐完一个 tool_call 就立即执行并推送图元，不必等整轮结束
    const streamedResults = new Map<string, string>()
    const baseWorkingElements = structuredClone(session.workingElements)
    const baseToolCalls = toolCalls
    const baseGenerationPlan = session.generationPlan
    // 删除特性会移除已记录的执行，回滚需整体恢复而不是按长度截断
    const baseFeatureExecutions = [...session.featureExecutions]
    const baseDisplayEventCount = session.displayEvents.length
    const baseDisplayScript = session.displayScript
    const baseSymbolDataBindings = session.symbolDataBindings
    const basePageProperty = structuredClone(session.pageProperty)
    const basePageParamDecls = structuredClone(session.pageParamDecls)
    const baseZOrderOps = [...session.zOrderOps]
    const baseCanvas = { ...session.canvas }
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
        session.workingElements.splice(
          0,
          session.workingElements.length,
          ...structuredClone(baseWorkingElements),
        )
        session.finalJson = undefined
        session.generationPlan = baseGenerationPlan
        session.featureExecutions.splice(0, session.featureExecutions.length, ...baseFeatureExecutions)
        session.displayEvents.length = baseDisplayEventCount
        session.displayScript = baseDisplayScript
        session.symbolDataBindings = baseSymbolDataBindings
        session.pageProperty = structuredClone(basePageProperty)
        session.pageParamDecls = structuredClone(basePageParamDecls)
        session.zOrderOps = [...baseZOrderOps]
        session.canvas = { ...baseCanvas }
        streamedResults.clear()
        toolCalls = baseToolCalls
        onSSEEvent({ type: 'stream_reset' })
        if (session.workingElements.length > 0) {
          onSSEEvent({ type: 'element', elements: session.workingElements })
        }
      },
    }

    // 调用模型 API（流式）
    // 因思考超额被截断后重试时，放宽输出上限（有上限，避免网关拒绝）
    const callConfig = lengthRetries > 0
      ? { ...config, maxTokens: Math.min((config.maxTokens || 16384) * 2, 65536) }
      : config
    // 按轮次收窄工具：计划声明前不发特性工具，声明后只发计划内的特性工具
    const roundTools = narrowToolsForRound(tools, {
      prompt,
      plannedFeatureTools: session.generationPlan?.requiredFeatureTools,
    })
    const roundStartedAt = Date.now()
    const { response, retryCount, elapsedMs } = await callModel(lengthRetries > 0, callConfig, messages, roundTools, onSSEEvent, dispatch)
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
    console.log(`[AgentService] round=${rounds} retries=${retries} finish=${choice?.finish_reason} toolCalls=${choice?.message?.tool_calls?.length ?? 0} contentLen=${choice?.message?.content?.length ?? 0} tools=${roundTools.length}/${JSON.stringify(roundTools).length} ctx=${JSON.stringify(messages).length} sec=${Math.round((Date.now() - roundStartedAt) / 1000)}`)
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

        // 添加 tool 结果消息：只回传精简摘要，完整数据留在工作区，避免上下文随轮次膨胀
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: compactToolResult(tc.function.name, result),
        })
      }
      emitMetrics()

      // 目标不明确：提问并结束本轮，不产出图纸，等待用户回答
      if (session.question) {
        const metrics = buildMetrics()
        onSSEEvent({ type: 'metrics', metrics })
        onSSEEvent({ type: 'done' })
        return {
          success: false,
          question: session.question,
          steps: session.steps,
          metrics,
        }
      }

      if (choice.message.tool_calls.some(tc => isAssemblyTool(tc.function.name))) {
        if (session.finalJson) {
          // Schema 校验
          const errors = validateFinalOutput(session.finalJson)
          if (errors.length === 0) {
            // 成功
            const doneStep: AgentStep = {
              type: 'done',
              content: '生成完成',
              timestamp: Date.now(),
            }
            session.steps.push(doneStep)

            await enrichModelPoints(session.finalJson, context.modelPointApi)
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
          // 未通过校验的组装结果不能占着结果位，否则后续兜底组装会被跳过
          session.finalJson = undefined
          lastValidationErrors = formatErrors(errors)
          const errMsg = `生成的 JSON 校验未通过，以下字段需要修正：\n${lastValidationErrors}\n请重新调用 assemble 工具并修正。`
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

        const errors = validateFinalOutput(json)
        if (errors.length === 0) {
          session.finalJson = json
          await enrichModelPoints(json, context.modelPointApi)

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

      const assembledFromText = await finishWithAutoAssemble()
      if (assembledFromText) return assembledFromText

      // 已执行过工具却只回了一段文字（如复述计划）：催促继续调用工具，而不是直接判失败
      if (toolCalls > 0 && retries < maxRetries) {
        retries++
        const errMsg = `你只输出了文字，没有调用工具。请不要复述计划，直接调用工具继续完成任务并调用 assemble 工具输出完整结果。${lastValidationErrors ? `\n上一次校验未通过的原因：\n${lastValidationErrors}` : ''}`
        messages.push({ role: 'user', content: errMsg })
        onSSEEvent({ type: 'error', content: errMsg, retry: true })
        session.steps.push({ type: 'retry', content: '模型仅返回文字，已催促继续调用工具', timestamp: Date.now() })
        continue
      }

      return {
        success: false,
        error: lastValidationErrors
          ? `生成结果校验未通过：\n${lastValidationErrors}`
          : '模型未生成 JSON，可能需要补充信息',
        steps: session.steps,
        metrics: buildMetrics(),
      }
    }

    // === 情况 3: 模型既未调用工具也没有文本 ===
    const assembledFromEmpty = await finishWithAutoAssemble()
    if (assembledFromEmpty) return assembledFromEmpty

    // 推理模型把输出额度全部花在思考上（finish_reason=length）：不是校验失败，单独计数，
    // 下一次提高输出上限并要求精简思考，避免一次偶发的“想太久”直接耗尽重试次数
    if (choice.finish_reason === 'length' && lengthRetries < MAX_LENGTH_RETRIES) {
      lengthRetries++
      const nudge = toolCalls > 0
        ? '你上一轮的思考耗尽了输出额度，没有产出任何内容。这次请把思考控制在关键决策上、尽快行动：若图元尚未创建完毕，继续调用 create_* / add_feature_* 工具；若已全部完成，立即调用 assemble 工具输出完整结果。'
        : '你上一轮的思考耗尽了输出额度，没有产出任何内容。这次请把思考控制在整体方案上（分区、数量、对应关系），不要逐个图元推演坐标，然后立即调用 declare_generation_plan 并开始 create_* 创建图元，边做边调整。'
      messages.push({ role: 'user', content: nudge })
      const notice = `模型思考耗尽了输出额度，已放宽额度并提示其聚焦要点后重试（${lengthRetries}/${MAX_LENGTH_RETRIES}）`
      onSSEEvent({ type: 'retry', content: notice })
      session.steps.push({ type: 'retry', content: notice, timestamp: Date.now() })
      continue
    }

    retries++
    // 空回复（常见于推理模型思考耗尽输出额度）：催促其直接行动，否则下一轮仍会原样空转
    if (toolCalls > 0) {
      messages.push({
        role: 'user',
        content: '你上一轮没有输出任何内容。请减少思考、直接行动：若图元尚未创建完毕，继续调用 create_* / add_feature_* 工具；若已全部完成，立即调用 assemble 工具输出完整结果。',
      })
    }
  }

  // 超过最大重试次数
  return {
    success: false,
    error: `超过最大重试次数 (${maxRetries})${lastValidationErrors ? `，最后一次校验未通过：\n${lastValidationErrors}` : ''}`,
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

/** 超过该长度（字符）仍无任何正式输出的思考视为失控，提前中断（约 4~5k token） */
const DEFAULT_MAX_REASONING_CHARS = 0

/** 组装工具只需名称与画布参数，参数超过该长度说明模型在重写全部图元数据 */
const ASSEMBLE_ARGS_LIMIT = 2000
const ASSEMBLE_STRING_KEYS = ['pageName', 'symbolName', 'bgColor', 'background', 'author', 'company', 'desc']
const ASSEMBLE_NUMBER_KEYS = ['pageWidth', 'pageHeight', 'width', 'height']
/** 超过该时长没有任何可见输出时，推送一次当前进度 */
const PROGRESS_INTERVAL_MS = 20000
const PROGRESS_TICK_MS = 5000

/** 只保留 JSON 顶层（第一层对象）里的字符，嵌套的图元数据整段跳过，避免误取图元内部的 width 等同名字段 */
function topLevelText(raw: string): string {
  let depth = 0
  let inString = false
  let escaped = false
  let out = ''
  for (const ch of raw) {
    if (inString) {
      if (depth === 1) out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      if (depth === 1) out += ch
    } else if (ch === '{' || ch === '[') {
      depth++
    } else if (ch === '}' || ch === ']') {
      depth--
    } else if (depth === 1) {
      out += ch
    }
  }
  return out
}

/** 从被截断的组装参数里只保留名称与画布参数，图元数据一律由服务端工作区提供 */
export function minimalAssembleArgs(raw: string): string {
  const text = topLevelText(raw)
  const args: Record<string, unknown> = {}
  for (const key of ASSEMBLE_STRING_KEYS) {
    const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text)
    if (match) {
      try {
        args[key] = JSON.parse(`"${match[1]}"`)
      } catch {
        // 转义不完整时忽略该字段
      }
    }
  }
  for (const key of ASSEMBLE_NUMBER_KEYS) {
    const match = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text)
    if (match) args[key] = Number(match[1])
  }
  return JSON.stringify(args)
}

type StreamPhase = 'waiting' | 'reasoning' | 'content' | 'tool' | 'paused'

async function callModel(
  reduceThinking: boolean,
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
    // 进度提示：模型长时间无可见输出（排队、深度思考、输出很长的工具参数）时，按当前阶段推送一句状态，避免界面看起来卡住
    const progress = { phase: 'waiting' as StreamPhase, tool: '', toolChars: 0, lastShownAt: attemptStartedAt }
    const show = (content: string) => {
      progress.lastShownAt = Date.now()
      onSSEEvent({ type: 'thinking', content })
    }
    const progressTimer = setInterval(() => {
      const now = Date.now()
      if (progress.phase === 'paused' || progress.phase === 'content' || now - progress.lastShownAt < PROGRESS_INTERVAL_MS) return
      const seconds = Math.round((now - attemptStartedAt) / 1000)
      if (progress.phase === 'waiting') show(`⏳ 等待模型响应（已 ${seconds} 秒）…\n`)
      else if (progress.phase === 'reasoning') show(`💭 仍在深入分析中（已 ${seconds} 秒）…\n`)
      else show(`🛠 正在生成 ${progress.tool || '工具'} 的参数（已 ${Math.max(1, Math.round(progress.toolChars / 1024))} KB，${seconds} 秒）…\n`)
    }, PROGRESS_TICK_MS)
    try {
      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: config.maxTokens || 16384,
        stream: true,
      }

      if (tools.length > 0) {
        body.tools = tools
        body.tool_choice = 'auto'
      }
      // 网关/模型专有参数（如 DeepSeek 的 thinking）；思考超额重试时再叠加 fallbackBody（如关闭思考）
      Object.assign(body, config.extraBody, reduceThinking ? config.fallbackBody : undefined)

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
          progress.phase = 'paused'
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
      let finishReason = ''
      let reasoningChars = 0
      const digest = new ThinkingDigest()
      let thinkingRunaway = false
      let oversizedAssemble = false
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
          progress.lastShownAt = Date.now()
        } catch (error) {
          // 构建异常不是网络问题，不缓存结果即可交回流结束后的统一执行路径，避免误触发模型重试
          console.error('[AgentService] 流内工具执行失败:', error)
        }
      }

      streamLoop: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // 思考预算保护（可选）：还没有任何正式输出 / 工具调用就思考过长，提前中断，由上层按“思考超额”处理
        const maxReasoningChars = config.maxReasoningChars ?? DEFAULT_MAX_REASONING_CHARS
        if (maxReasoningChars > 0 && reasoningChars > maxReasoningChars && !accumulatedContent && accumulatedToolCalls.size === 0) {
          thinkingRunaway = true
          await reader.cancel().catch(() => undefined)
          break
        }

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
            if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason
            const delta = chunk.choices?.[0]?.delta
            if (!delta) continue

            // 推理模型的思考原文冗长且多为推演草稿，不整段转发：只摘出关键结论实时展示，
            // 同时统计长度用于（可选的）思考预算保护
            if (delta.reasoning_content) {
              const reasoning = String(delta.reasoning_content)
              reasoningChars += reasoning.length
              progress.phase = 'reasoning'
              for (const key of digest.push(reasoning)) show(`💭 ${key}\n`)
            }

            // 文本内容 → 实时转发给前端
            if (delta.content) {
              accumulatedContent += delta.content
              progress.phase = 'content'
              show(delta.content)
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
                progress.phase = 'tool'
                progress.tool = existing.function.name
                progress.toolChars = existing.function.arguments.length

                // 模型把全部图元数据写进组装参数：输出会极其缓慢（看起来卡住），且服务端本就用工作区图元组装。
                // 立即截断，只保留名称/画布参数，直接组装
                if (isAssemblyTool(existing.function.name) && existing.function.arguments.length > ASSEMBLE_ARGS_LIMIT) {
                  existing.function.arguments = minimalAssembleArgs(existing.function.arguments)
                  oversizedAssemble = true
                  break streamLoop
                }
              }
            }
          } catch {
            // 解析失败，跳过该 chunk
          }
        }
      }

      // 流结束，最后一个 tool_call 也已完整
      if (oversizedAssemble) {
        await reader.cancel().catch(() => undefined)
        console.warn('[AgentService] 组装参数中包含图元数据，已截断并改用工作区图元组装')
        show('⚡ 直接使用已创建的图元组装（无需重新输出图元数据）\n')
      }
      flush(maxIndex)
      for (const key of digest.flush()) show(`💭 ${key}\n`)

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
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : (thinkingRunaway ? 'length' : (finishReason || 'stop')),
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
        progress.phase = 'paused'
        await sleep(delay)
        continue
      }
      return { response: null, retryCount: attempt, elapsedMs }
    } finally {
      clearInterval(progressTimer)
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
