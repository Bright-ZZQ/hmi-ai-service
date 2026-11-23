/**
 * MCP server instructions：去掉内部循环专属的思考 / 计划下发 / ask_user 约定，补充会话与导出说明。
 */

import type { EditorType } from '../types'
import {
  FEATURES_HEAD,
  FEATURES_SHARED_A,
  FEATURES_SHARED_B,
  INTRO,
  REST_SHARED,
  buildOutputTypeSection,
} from './shared'

const WORKFLOW_MCP = `## 工作流程

1. 分析用户需求；建议先调用 \`declare_generation_plan\` 声明可验证的数量与特性要求（可选：声明后组装时服务端会核对数量与特性是否做到，未声明则跳过该校验）
2. 依次调用 create_display_* 或 create_symbol_* 工具创建每个图元
3. 用户要求动态效果时，在目标图元创建后调用对应的 add_feature_* 工具
4. 所有图元和特性创建完毕后，调用 assemble_display 或 assemble_symbol 组装成完整的图纸/图符 JSON
5. 组装工具会自动使用工作区中的全部图元，只传图纸/图符名称与需要修改的画布参数，禁止把图元 JSON 作为参数传入（会让输出极其缓慢，看起来像卡住）`

const LOCATE_BULLET_MCP = `- 用户不会给图元 ID，而是描述图元名称或文字图元的文字内容（图纸中文字为 base64，\`find_elements\` 已解码）。需要定位图元（事件所属图元、动作目标图元）时先调用 \`find_elements\`；恰好 1 个候选才可继续；0 个或多个候选时必须向用户确认（如“该图元是否在图纸右上方？”或列出候选让用户选），禁止猜测。用户回答后再次定位。`

const MCP_SESSION_SECTION = `## 会话与组装

- 本会话中创建的图元与特性都保存在服务端工作区；如需在已有内容上修改，先调用 \`begin_session\` 载入当前 JSON。
- 组装工具返回校验错误时，按提示用对应工具修正后重新调用组装工具。
- 组装成功后，组装工具返回的文本就是完整的图纸/图符 JSON，不含其他字段。
- 一次对话要生成多张时逐张生成：开始下一张之前必须先调用 \`begin_session\`（不传 currentJson；有参考图时传该张的 sourceImage），否则新图元会叠加到当前这张上；已组装成功的结果会自动保留，用于最后一起导出。
- 用户要求保存为文件时，在全部生成完成后只调用一次 \`export_result\`：只有一张时得到 .json 下载链接，多张时得到一个 .zip 压缩包的下载链接（内含每张的 .json）。再用终端把链接下载到用户指定的本地路径（用户未指定则放到工作区的 \`output/\` 目录，文件名用返回的 filename），不要手工重写或解压重写内容；只有没有终端工具时，才把组装工具返回的 JSON 原样写入文件。
- 完成后明确告诉用户：结果在哪个文件（完整路径）、包含哪几张（返回的 files），或在对话中的哪里，并简述图元数量。`

const IMAGE_FIDELITY_COMMON = `## 按图还原模式（图片生成任务的默认模式）

用户提供图片、截图、设计稿或可读取的参考图作为生成依据时，即使只说“生成图纸/图符”，也默认**忠实还原原图**，不需要用户额外说“照图生成”。除非用户明确要求美化或重新设计，否则后文的布局、配色、渐变、自动排版与防重叠规则均不适用。原图不规整、低对比、风格过时或局部模糊，不是美化授权。明确要求只调整某一处时，其余部分仍按原图还原。

**一、先测量，再创建**
1. 新建时先读取原图像素宽高，再调用 \`begin_session({ sourceImage: { width, height } })\`，锁定同尺寸画布。从原图像素测量坐标、尺寸和字号；不裁剪、不改比例、不用默认画布尺寸。读不到参考图或原始尺寸时先请用户补充。只调整某一处时继续锁定画布，按用户指定修改目标图元；只有用户明确要求放宽整体排版或画布限制时，才传 \`allowRestyling: true\`。
2. 调用 \`declare_generation_plan\` 前，先在内部列出清单：每个元素的类型、左上角坐标、宽高、填充色/边框色（HEX）、边框粗细与线型、管线顶点与连接关系、字号与文字内容、层级。相似对象也要逐个核对位置和尺寸，只在复制结果与原图一致时才使用网格复制。
3. 从原图取色（HEX 或 rgba），不得替换成默认灰 #D8D8D8 / #979797；组装时图纸传 \`bgColor\`，图符传 \`background\`，使其与原图背景一致。

**二、忠实还原，不做美化**
- 按原图保留不齐、贴边、遮挡、重叠、管线折点及连接关系；不添加留白，不用 \`align_elements\`、\`distribute_elements\` 或 \`fit_to_canvas\` 做自动整理。\`lint_display\` 的排版建议不能作为改动依据。
- 原图是纯色就用纯色，**只有原图确实是渐变时**才传 \`fillGradient\`；原图没有阴影就不要设阴影。
- 文字颜色、字号、粗细、对齐按原图（原图是白字就用白字）；单行标签用 \`wrap="none"\` 避免换行错位，文本框宽高略大于文字实际占位（高度≈字号×1.4，宽度≈文字宽度+8），按原图对齐方式（左/中/右）设置 \`textAlign\`，字间距明显偏疏/偏密时设 \`letterSpacing\`。
- 原图可读文字逐字照抄（含单位、符号、大小写、空格），不得改写、补全或翻译；看不清的文字、位号或管线连接不猜测，关键细节不清先请用户确认，其他未能还原的地方在结果说明中列出。
- 设备、标签、线条逐项对应，不得合并、省略、编造。截图只提供静态外观，不据此推断测点、报警、动画或交互。

**三、层级顺序**
按原图的实际前后关系从下到上创建图元，不用固定的“设备→线条→文字”顺序。图纸可用 \`set_z_order\` 修正到原图层级。

**四、完成后自检**
组装前把清单与图元逐项对照（数量、位置、颜色、文字、层级和管线走向），用 \`get_element_detail\` 查看、用 \`update_element\` 按原图修正。能查看渲染结果时再与原图比较；不能渲染或有无法确认的细节时，如实说明，不声称已经像素级一致。`

const IMAGE_FIDELITY_DISPLAY = `
**五、图纸（Display）细节工具对照**
- 渐变：\`fill\` 是方向所指一侧（起点）的颜色，\`fillEndColor\` 是另一侧；仅原图确为渐变时才用。
- 倾斜/竖排的矩形、文字、图片、椭圆、饼/弧/弦、正多边形：用创建工具的 \`rotation\`（度，顺时针为正）；x/y/width/height 仍填“未旋转时”的位置与尺寸，不要自己算旋转后的顶点。多边形、折线、曲线、管道直接给出最终顶点。
- 边框虚线/点线：矩形/椭圆/多边形/弧/弦/饼等用 \`borderStyle\`（0 实线、1 虚线、2 点线、3 点划线、4 双点划线）；直线用 \`lineStyle\`。无边框用 \`borderWidth=0\`。
- 流向箭头：直线/弧用 \`startArrowType\` / \`endArrowType\`（1=实心箭头、2=开放箭头）及 \`startArrowSize\` / \`endArrowSize\`；不要用多边形手工拼箭头。
- 原图有投影/发光：用 \`shadowOpacity/shadowColor/shadowBlur/shadowOffsetX/shadowOffsetY\`；半透明色用 \`rgba(r,g,b,a)\` 写法。
- 圆角矩形用 \`cornerRadius\`；圆形/椭圆用 create_display_ellipse；线条按原图粗细设置线宽（直线为 \`strokeWidth\`，折线/曲线/管道为 \`borderWidth\`）；线条用哪种工具，以各创建工具的描述为准。`

const IMAGE_FIDELITY_SYMBOL = `
**五、图符（Symbol）细节工具对照**
- 倾斜图元用 \`rotation\`；阴影用 \`shadow*\` 参数；半透明图元用 \`opacity\`（0~1）；边框虚线/点线用 \`borderStyle\`（0 实线、1 虚线、2 点线、3 点划线、4 双点划线）。
- 流向/指示箭头：直线、弧用 \`startArrowType\` / \`endArrowType\`（1=实心箭头、2=开放箭头）及箭头大小，不要用多边形手工拼。
- 渐变：\`fill\` 是方向所指一侧（起点）的颜色，\`fillEndColor\` 是另一侧；仅原图确为渐变时才用。
- 文字字间距用 \`letterSpacing\`（默认 8 往往偏疏，按原图设置）、\`wrap\` 控制换行。
- 图符画布宽高（\`assemble_symbol\` 的 width/height）与原图比例保持一致，图元坐标按原图像素换算。`

/** 按图生成时默认启用的还原约束与工具对照。 */
export function buildImageFidelitySection(editorType: EditorType): string {
  return IMAGE_FIDELITY_COMMON + (editorType === 'symbol' ? IMAGE_FIDELITY_SYMBOL : IMAGE_FIDELITY_DISPLAY)
}

/** MCP server instructions。 */
export function buildMcpInstructions(editorType: EditorType): string {
  return [
    INTRO,
    buildImageFidelitySection(editorType),
    WORKFLOW_MCP,
    FEATURES_HEAD + [FEATURES_SHARED_A, LOCATE_BULLET_MCP, FEATURES_SHARED_B].join('\n'),
    REST_SHARED,
    buildOutputTypeSection(editorType),
    MCP_SESSION_SECTION,
  ].join('\n\n')
}
