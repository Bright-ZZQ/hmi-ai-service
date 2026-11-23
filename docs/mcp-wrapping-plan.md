# MCP 封装方案：抽取工具层，`runAgentLoop` 与 MCP 共用

## 1. 目标

- 现有 Agent Service 继续使用 `runAgentLoop`，对外行为（`POST /api/ai/generate` SSE）保持不变。
- 将工具函数（handler）从 `agent-service.ts` 抽出为独立的工具层，`runAgentLoop` 与 MCP 共同调用。
- MCP 将工具层暴露给第三方 agent，由第三方 agent 的 LLM 自行编排工具调用。

## 2. 已确认的决策

| 问题 | 决策 |
|---|---|
| 会话绑定方式 | 使用 `/mcp/display`、`/mcp/symbol` 两个入口 + MCP 自带会话（`Mcp-Session-Id`），工具参数中不带 `sessionId`；必要时再加可选 `sessionId` 作为备用 |
| `declare_generation_plan` | 对外部 agent 可选：声明了才按计划校验，未声明则跳过；在 `instructions` 中推荐先声明。内部循环保持强制 |
| `SYSTEM_PROMPT` | 拆分为"领域规则（共享）"与"内部循环专属"两部分；共享部分通过 MCP `instructions` 提供，长篇特性规则可放到 MCP resource 按需读取 |

## 3. 现状

- 60 多个工具的 handler 原先都在 [src/agent/agent-service.ts](../src/agent/agent-service.ts) 内部（现已拆分到 [src/tools/](../src/tools/)，见 [tools-architecture.md](tools-architecture.md)），包括创建图元、复合组件、修改/删除、组装、特性、事件、脚本，以及 `TOOL_HANDLERS` 接线、`lintRegistry` 自检、`executeToolCall`。
- `runAgentLoop` 内含只服务于 LLM 循环的后处理：`validateFinalOutput`（Schema、交互问题、计划校验）、`enrichModelPoints`、`compactToolResult`。
- 状态集中在 `SessionState`（[context.ts](../src/tools/core/context.ts)），服务本身无状态。
- 原有测试通过 `require('../dist/agent/agent-service')` 引入 `createSession` / `executeToolCall`；工具层独立后，测试改为 `require('../dist/tools')`，`agent-service` 不再 re-export（`minimalAssembleArgs` 仍从 `agent-service` 导出）。

## 4. 工具层抽取

工具层位于 `src/tools/`（agent 与 mcp 共用），仅做搬迁，不改行为。

| 新文件 | 来源 |
|---|---|
| `core/session.ts` | `createSession`、`getCanvasFromJson`、`getElementsFromJson` |
| `shape/handlers.ts` | `handleCreateDisplayElement`、`handleCreateSymbolElement`，以及 `TOOL_TO_ELEMENT_TYPE`、`TOOL_TO_SYMBOL_TYPE` |
| `edit/handlers.ts` | `handleUpdateElement`、`handleDeleteElement`、`handleFindElements`，以及 `mergeElement` 等辅助函数 |
| `assembly/handlers.ts` | `handleAssembleDisplay`、`handleAssembleSymbol`，以及 `resolveExplicitElements`、`ensureEncodedTexts` |
| `feature/handlers.ts` | 动态/交互特性（`attachFeatureFromArgs`、`finishFeatureAttach`）、事件定义 |
| `feature/script-handlers.ts` | `set_display_script`、`set_pipe_script`、`set_symbol_attr_function`，以及 `rotatePivot` 相关函数 |
| `plan/handler.ts`、`interaction/handler.ts` | `declare_generation_plan`、`ask_user` |
| `core/executor.ts` | 汇总各 `ToolModule` 的 handler 为 `TOOL_HANDLERS`；启动时执行 `lintRegistry`；导出 `executeToolCall`、`listToolNames()` |
| `core/finalize.ts` | 将 `runAgentLoop` 中的 `validateFinalOutput` 闭包改为纯函数 `validateSessionOutput(session, json, { requirePlan })`；`baseElements`、`isEditing` 均可从 `session.currentJson` 推出 |

`agent-service.ts` 的变化：
- 删除搬走的 handler，改为从 `../tools` 引入。
- 不再 re-export `createSession`、`executeToolCall`、`SessionState`，测试直接从 `dist/tools` 引入。
- `runAgentLoop` 流程不变（模型调用、重试、`compactToolResult`、`narrowToolsForRound`、兜底组装、回滚），调用 `validateSessionOutput(..., { requirePlan: true })`。

注意事项：
- 避免循环依赖：handler 只依赖 `core/context.ts` 与各 builder 模块，不反向依赖 `agent-service.ts`；依赖方向由 `scripts/check-deps.cjs` 校验。
- 本阶段结束后，`npm test` 必须全部通过。

## 5. MCP 层

新增 `src/mcp/`，依赖 `@modelcontextprotocol/sdk` 与 `zod`。

### 5.1 工具暴露

- 工具定义取自 `getToolsForType(editorType)`；`ToolDefinition.function.parameters` 本身是 JSON Schema，直接映射为 MCP `inputSchema`，不手写。
- 调用走 `executeToolCall(name, args, session, onStep, emit)`，与 agent loop 使用完全相同的 handler。
- 不暴露 `ask_user`（外部 agent 有自己的用户通道）：按 `SkillMeta.audience === 'agent'` 过滤，不再硬编码工具名。
- 其余工具默认全部暴露；预留按 `SkillMeta.category` 限制暴露类别的配置，避免占满外部 agent 的上下文。
- 额外提供：
  - `begin_session({ currentJson?, sourceImage?, allowRestyling? })`：重置会话；可载入已有 JSON 以便增量编辑。按截图、照片或设计稿生成时，创建图元前必须传 `sourceImage: { width, height }`（原始像素尺寸），例如 `{ "sourceImage": { "width": 1268, "height": 643 } }`。
  - `get_session_state`：返回画布与当前图元概要；`reproduceImage: true` 表示按图还原保护已开启。

按图还原时，服务端锁定画布为参考图尺寸，拒绝自动对齐、等距分布、适应画布，以及在组装时另传图元列表；图纸组装不再自动把全幅形状沉底。代理仍需依据原图测量位置与尺寸、提取颜色、核对文字与遮挡关系；MCP 不接收图片本身，无法自行识别参考图或做像素级校验。只有用户明确授权整体重新排版或调整画布时才传 `allowRestyling: true`。纯文字任务不传 `sourceImage`，原有流程不变；`/api/ai/generate` 仍仅接收文字。

### 5.2 会话与入口

- `/mcp/display`、`/mcp/symbol` 两个入口，入口决定编辑器类型和工具集，避免两套工具重名冲突，并缩短工具列表。
- 每个 MCP 会话对应一个 `SessionState`，存放在内存 `Map`，带 TTL 与数量上限；stdio 模式下一个进程对应一个会话。
- 备用方案：若外部平台无法稳定保持 MCP 会话，再增加可选的 `sessionId` 参数。

### 5.3 工具结果

- handler 返回值默认经 `compactToolResult` 精简（与 agent loop 一致），需要完整字段时由外部 agent 调用 `get_element_detail`。
- handler 返回 `{ success: false, error }` 时设置 `isError: true`，并保留原文中的修正提示。

### 5.4 组装与校验

`assemble_display` / `assemble_symbol` 在 handler 之后，MCP 层追加：
1. `validateSessionOutput(session, json, { requirePlan: false })`。
2. 通过：调用 `enrichModelPoints`，返回完整最终 JSON。
3. 不通过：返回错误列表，并清空 `session.finalJson`（与 agent loop 重试逻辑一致），由外部 agent 修正后重新组装。

`requirePlan: false` 的语义：外部 agent 声明了 `declare_generation_plan` 则按计划校验数量与特性；未声明则跳过计划校验。Schema、交互问题等其余校验始终生效。

`modelPointApi`（查询点信息）在 MCP 侧配置，优先从 mcp.json 的 `headers` 读取：`editorSvcUrl`（地址）、`editorAuthorization`（鉴权完整值）、`projectCode`（工程编码）。未提供的项回退到环境变量 `MCP_EDITOR_SVC_URL` / `MCP_EDITOR_AUTHORIZATION` / `MCP_PROJECT_CODE`（或 `createMcpRouter` 同名选项 `editorSvcUrl` / `editorAuthorization` / `projectCode`）；stdio 模式只使用环境变量。地址未配置时跳过测点补全。

### 5.5 传输与挂载

- Streamable HTTP：在 [src/index.ts](../src/index.ts) 挂载 `/mcp/display`、`/mcp/symbol`，由 `MCP_ENABLED` 控制。
- 可选 stdio 入口：`src/mcp-stdio.ts --editor display|symbol`，该模式下 `console.log` 需改走 stderr。
- 安全：Bearer token（`MCP_AUTH_TOKEN`）、Origin 校验、会话数与 TTL 上限。

### 5.6 instructions 与 prompts

将 `SYSTEM_PROMPT` 拆分：
- `src/prompts/`：`shared.ts` 为领域规则（共享部分），包括图层顺序、画布尺寸与防重叠、颜色与文本可见性、特性使用规则、批量与检查工具用法、多轮修改规则、必须调用 `assemble_*`；`loop.ts`（`buildLoopSystemPrompt`）为内部循环专属部分，不对外暴露，包括思考格式（`【结论】`）、输出长度控制、"特性工具按计划下发"、`ask_user` 相关规则；`mcp.ts`（`buildMcpInstructions`）为 MCP 专属。
- `agent-service.ts` 仅调用 `buildLoopSystemPrompt`。

对外：
- MCP `instructions` 使用共享部分，并推荐先调用 `declare_generation_plan`。
- MCP `instructions` 末尾追加“按图还原模式”（`buildImageFidelitySection`，仅 MCP 使用，内部循环提示词不变）：用户提供图片要求照图生成时，先按原图像素设画布并测量清单，忠实还原颜色/位置/文字，不做排版美化，并对照图纸/图符各自的细节工具（`rotation`、`borderStyle`、箭头、阴影、`letterSpacing`/`wrap`）。
- 如需压缩 `instructions` 体积，将"动态特性"长段放入 MCP resource（如 `hmi://guide/features`）按需读取，`instructions` 仅保留核心流程。

对内：
- `runAgentLoop` 使用的最终 prompt 必须与拆分前完全一致，用测试做字符串比对保证。

## 6. 循环专属行为（不下沉）

以下逻辑只服务于"服务端自己调用 LLM"，留在 `agent-service.ts`，MCP 不复用：
- `narrowToolsForRound`、`selectTools` 的按需下发（位于 `src/agent/tool-routing.ts`）。
- 流内派发与回滚。
- 兜底自动组装、催促重试。
- 方案预览（`generatePlanPreview`）。

## 7. 分期

| 阶段 | 内容 | 验收 |
|---|---|---|
| P1 | 抽取工具层到 `src/tools/`，仅搬迁 | `npm test` 全部通过；测试改为从 `dist/tools` 引入 `createSession` / `executeToolCall` |
| P2 | 抽取 `validateSessionOutput`；拆分 `SYSTEM_PROMPT` 到 `src/prompts/` | `runAgentLoop` 行为不变；拆分后的内部 prompt 与原文一致（测试比对） |
| P3 | MCP 层：会话存储、工具注册、`begin_session` / `get_session_state`、HTTP 入口、`instructions`、测试 | 用 SDK in-memory transport 跑通 `begin_session` → `create_*` → `add_feature_*` → `assemble_*`；组装校验失败路径、`requirePlan: false` 路径 |
| P4（可选） | stdio 入口、类别分级暴露、`sessionId` 备用方案、resources | 按需 |

## 8. 风险

- 搬迁 handler 时的循环依赖：沿用 `core/context.ts` 的拆分思路，handler 不依赖 `agent-service.ts`。
- 外部 agent 缺少内部 prompt 的使用规范，会影响生成质量：通过 `instructions`（及 resource）补足。
- 外部 agent 可能漏做计划内的内容：计划可选，漏做的兜底校验减弱；如实测漏做频繁，将 `requirePlan` 改为强制（只是一个参数）。
- 内存会话泄漏：通过 TTL 与数量上限控制。
- `console.log` 污染 stdio：仅影响 stdio 模式，该入口统一重定向。
