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

/** MCP server instructions。 */
export function buildMcpInstructions(editorType: EditorType): string {
  return [
    INTRO,
    WORKFLOW_MCP,
    FEATURES_HEAD + [FEATURES_SHARED_A, LOCATE_BULLET_MCP, FEATURES_SHARED_B].join('\n'),
    REST_SHARED,
    buildOutputTypeSection(editorType),
    MCP_SESSION_SECTION,
  ].join('\n\n')
}
