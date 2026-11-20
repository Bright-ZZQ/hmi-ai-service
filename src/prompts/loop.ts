/**
 * 内部 Agent Loop 的系统提示词（含思考格式、计划下发与 ask_user 约定）。
 * 拼接结果由 test/fixtures/loop-system-prompt.*.txt 快照逐字节守护。
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

const LOOP_OUTPUT_RULES = `## 输出要求（强制，控制思考与输出长度）

- 可以充分思考，把方案想清楚，但思考结束必须落到行动：定好整体分区与数量后就调用工具；能一次调用解决的（clone_element_grid、bulk_apply_feature、复合组件）不要拆成多次推演。
- 思考时的输出约定：每当确定一个关键决策（整体布局与分区、对象与特性的对应、遇到歧义时的取舍、重要的技术选择），单独起一行，以“【结论】”开头，用一句话（不超过 50 字）写清楚；其余推演照常写，不必加标记。这些结论行会实时展示给用户，其余思考内容不展示。
- 第一轮调用工具前，先用不超过 4 行文字输出“关键分析”（布局分区、对象与特性的对应关系、需要用户注意的约束），随后立即调用 declare_generation_plan 与创建工具；之后不要再复述计划或逐步解说，每轮最多一句进度说明。`

const WORKFLOW = `## 工作流程

1. 分析用户需求，首先调用 \`declare_generation_plan\` 声明可验证的数量与特性要求
2. 依次调用 create_display_* 或 create_symbol_* 工具创建每个图元
3. 用户要求动态效果时，在目标图元创建后调用对应的 add_feature_* 工具
4. 所有图元和特性创建完毕后，调用 assemble_display 或 assemble_symbol 组装成完整的图纸/图符 JSON
5. 组装工具会自动使用工作区中的全部图元，只传图纸/图符名称与需要修改的画布参数，禁止把图元 JSON 作为参数传入（会让输出极其缓慢，看起来像卡住）`

const LOOP_PLAN_BULLET = `- **特性工具按计划下发**：声明生成计划前不提供特性工具的参数说明；请在 \`declare_generation_plan\` 的 requiredFeatureTools 中列出要用的特性工具种类（含 add_event_definition，每种列一次，不必计数），之后的轮次只提供这些特性工具。特性使用次数变化不需要重新声明计划；只有要用计划外的特性种类时，才重新调用 declare_generation_plan 补充。`

const LOCATE_BULLET = `- 用户不会给图元 ID，而是描述图元名称或文字图元的文字内容（图纸中文字为 base64，\`find_elements\` 已解码）。需要定位图元（事件所属图元、动作目标图元）时先调用 \`find_elements\`；恰好 1 个候选才可继续；0 个或多个候选时必须调用 \`ask_user\` 提问（如“该图元是否在图纸右上方？”“该图元是否在某某图元旁边？”或列出候选让用户选），禁止猜测。用户回答后再次定位。`

const LOOP_THINKING_REMINDER = `## 思考格式提醒（强制）

你的思考过程中，每确定一个关键决策（布局分区、对象与特性对应、歧义取舍、技术选择），必须另起一行并以“【结论】”开头写一句话（≤50 字），例如：
【结论】左侧 6 个按钮、右侧 6 个对象按行一一对应
【结论】风机用三个扇叶多边形，绕轮毂圆心旋转
这些结论行会实时展示给用户，务必先写出整体方案的结论再开始细节推演。`

/** 内部 Agent Loop 的系统提示词。 */
export function buildLoopSystemPrompt(editorType: EditorType): string {
  return [
    INTRO,
    LOOP_OUTPUT_RULES,
    WORKFLOW,
    FEATURES_HEAD + [LOOP_PLAN_BULLET, FEATURES_SHARED_A, LOCATE_BULLET, FEATURES_SHARED_B].join('\n'),
    REST_SHARED,
    buildOutputTypeSection(editorType),
    LOOP_THINKING_REMINDER,
  ].join('\n\n')
}
