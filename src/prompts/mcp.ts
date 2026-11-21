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
- 一次对话要生成多张时逐张生成：开始下一张之前必须先调用 \`begin_session\`（不传 currentJson），否则新图元会叠加到当前这张上；已组装成功的结果会自动保留，用于最后一起导出。
- 用户要求保存为文件时，在全部生成完成后只调用一次 \`export_result\`：只有一张时得到 .json 下载链接，多张时得到一个 .zip 压缩包的下载链接（内含每张的 .json）。再用终端把链接下载到用户指定的本地路径（用户未指定则放到工作区的 \`output/\` 目录，文件名用返回的 filename），不要手工重写或解压重写内容；只有没有终端工具时，才把组装工具返回的 JSON 原样写入文件。
- 完成后明确告诉用户：结果在哪个文件（完整路径）、包含哪几张（返回的 files），或在对话中的哪里，并简述图元数量。`

const IMAGE_FIDELITY_COMMON = `## 按图还原模式（用户提供了图片/截图/设计稿，要求照图生成时强制）

本节优先级高于上文的“布局指南”“画布尺寸与防重叠”“颜色指南”“渐变色”及“优先渐变/文字必须深色”等排版美化类规则：此时目标是**忠实还原原图**，不是重新设计。

**一、先测量，再创建**
1. 先估算原图像素宽高，把画布宽高设为与原图一致（或同比例等比放大，如 ×1），不要沿用默认 1880×962；之后所有坐标、尺寸、字号都按同一比例从原图换算，禁止凭感觉估值。
2. 调用 \`declare_generation_plan\` 前，先在内部列出清单：每个元素的类型、左上角坐标、宽高、填充色/边框色（HEX）、边框粗细与线型、字号与文字内容、层级。图中重复出现的设备/标签先量出一个再复制，保证大小一致。
3. 颜色必须取原图实际颜色（HEX 或 rgba），不得替换成默认灰 #D8D8D8 / #979797；背景色用 \`assemble_*\` 的 \`bgColor\` 对齐原图背景。

**二、忠实还原，不做美化**
- 位置与对齐按原图像素，不要“居中/等距/网格”整理；不要四周额外留边距；原图中元素贴边、重叠、叠放（线条穿过设备、标签压在设备上、半透明遮罩）都要原样保留，\`lint_display\` 的越界/重叠/对比度提示在这种情况下可以忽略。
- 原图是纯色就用纯色，**只有原图确实是渐变时**才传 \`fillGradient\`；原图没有阴影就不要设阴影。
- 文字颜色、字号、粗细、对齐按原图（原图是白字就用白字）；单行标签用 \`wrap="none"\` 避免换行错位，文本框宽高略大于文字实际占位（高度≈字号×1.4，宽度≈文字宽度+8），按原图对齐方式（左/中/右）设置 \`textAlign\`，字间距明显偏疏/偏密时设 \`letterSpacing\`。
- 原图文字内容逐字照抄（含单位、符号、大小写、空格），不得改写、补全或翻译。
- 数量要一一对应：原图有几个设备/标签/线条就生成几个，不得合并、省略、编造。

**三、层级顺序**
先背景，再大块分区/容器底板，再设备本体，再各类线条，再箭头，最后文字标注；被其他元素遮挡的部分，以原图的前后关系为准。

**四、完成后自检**
组装前把“清单”与已创建的图元逐项对照（数量、位置、颜色、文字），必要时用 \`get_element_detail\` 查看或 \`update_element\` 修正；组装后再对照原图确认整体布局，有偏差继续修正，直到与原图一致再结束。`

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

/** 按图还原的约束与工具对照；仅在用户提供图片要求照图生成时生效。 */
export function buildImageFidelitySection(editorType: EditorType): string {
  return IMAGE_FIDELITY_COMMON + (editorType === 'symbol' ? IMAGE_FIDELITY_SYMBOL : IMAGE_FIDELITY_DISPLAY)
}

/** MCP server instructions。 */
export function buildMcpInstructions(editorType: EditorType): string {
  return [
    INTRO,
    WORKFLOW_MCP,
    FEATURES_HEAD + [FEATURES_SHARED_A, LOCATE_BULLET_MCP, FEATURES_SHARED_B].join('\n'),
    REST_SHARED,
    buildOutputTypeSection(editorType),
    MCP_SESSION_SECTION,
    buildImageFidelitySection(editorType),
  ].join('\n\n')
}
