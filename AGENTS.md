# AGENTS.md

HMI Engine Web 的 AI 图纸（Display）/图符（Symbol）生成后端：Node.js + TypeScript + Express。对外提供两个入口，共用同一套绘图工具：

- Agent Service：`POST /api/ai/generate`（SSE），服务端调用模型并编排工具
- MCP：`/mcp/display`、`/mcp/symbol`（Streamable HTTP），由外部 Agent 调用工具

## 包管理与命令

- 包管理器是 **pnpm**（以 `pnpm-lock.yaml` 为准），不是 npm/yarn。安装依赖用 `pnpm install`，不要用 `npm install`/`yarn`，也不要提交 `package-lock.json`。
- Node.js >= 18，TypeScript `strict`，编译目标 CommonJS（`module: commonjs`）。

| 命令         | 作用                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`   | `tsx watch src/index.ts` 本地开发，默认 `http://localhost:3100`               |
| `pnpm build` | `tsc` 编译到 `dist/`                                                          |
| `pnpm start` | 运行 `dist/index.js`                                                          |
| `pnpm test`  | build → `scripts/check-deps.cjs` 依赖方向检查 → `node --test test/*.test.cjs` |

- 测试文件是 `test/*.test.cjs`，测的是 `dist/` 编译产物，**必须先 build**；新增测试文件需要手动加入 `package.json` 的 `test` 脚本。
- 健康检查：`GET /health`。

## 目录结构

```
src/
  index.ts, config.ts, polyfills.ts, types.ts
  routes/     HTTP 路由（ai-generate）
  agent/      内部 LLM 循环：agent-service、tool-routing（按意图/阶段/轮次收窄工具）、plan-preview、thinking-digest
  mcp/        MCP 服务（http、server、bundle、result-store）；begin_session / get_session_state / export_result 仅在此处
  prompts/    系统提示词：shared、loop（内部循环）、mcp（MCP instructions）
  tools/      agent 与 mcp 共用的工具，按类别分目录（plan/shape/feature/edit/batch/layout/page/inspect/assembly/interaction），
              core/ 为会话与注册表，lib/ 为底层库，_shared/ 为参数片段
scripts/      check-deps.cjs（依赖方向检查）
test/         node:test 用例与 fixtures
docs/         tools-architecture.md（工具层架构，新增工具前必读）、mcp-wrapping-plan.md
packager/     平台应用包构建（x86）
```

## 依赖方向（由 `scripts/check-deps.cjs` 强制）

- `tools/` 不得引用 `agent/`、`mcp/`、`routes/`
- `mcp/` 不得引用 `agent/`
- `prompts/` 不得引用 `agent/`、`mcp/`
- `tools/lib/` 为底层库，不得反向引用工具分类目录；出现环依赖时把公共函数下沉到 `lib/` 或 `core/`

## 新增/修改工具

详见 [docs/tools-architecture.md](docs/tools-architecture.md)。要点：

1. 在对应类别目录的 `definitions*.ts` 写定义，handler 写在 `handlers.ts` 等文件，复用 `core/context.ts` 的 `ok` / `fail` / `recordStep`。
2. 在目录 `index.ts` 用 `defineTool(entry, handler, meta)` 登记，填写 `category` / `phases` / `keywords`；仅内部循环使用的工具加 `audience: 'agent'`。
3. 新建类别目录时需在 `core/registry.ts` 的 `MODULES` 中追加。
4. 运行 `pnpm test`：`lintRegistry` 与依赖检查会发现漏登记、重名、违规引用。
5. 工具名称、描述、参数会影响模型行为；改动已有工具时同步检查 `prompts/` 中的说明，并同步更新 `test/fixtures/loop-system-prompt.*.txt`（`prompts.test.cjs` 会与其比对）。

## 配置

通过项目根目录 `.env` 加载（`src/config.ts`，已被 `.gitignore` 忽略，**不要提交密钥**）。首次使用先复制模板：`Copy-Item .env.example .env`（Linux/macOS 用 `cp`）。新增环境变量时同步更新 `.env.example`。常用变量：

- 模型：`AI_MODEL_API_URL`、`AI_MODEL_API_KEY`、`AI_MODEL_NAME`、`AI_MODEL_MAX_TOKENS`，以及重试、`AI_MODEL_EXTRA_BODY` / `AI_MODEL_FALLBACK_BODY` / `AI_MODEL_PREVIEW_BODY`（JSON 对象）等
- 服务：`PORT`（默认 3100）、`HMI_EDITOR_SVC_URL`（用于补全特性测点模型信息，为空则跳过）
- MCP：`MCP_ENABLED`（设为 `false` 关闭）、`MCP_AUTH_TOKEN`、`MCP_ALLOWED_ORIGINS`、`MCP_MAX_SESSIONS`、`MCP_SESSION_TTL_MS`、`MCP_PUBLIC_BASE_URL`、`MCP_RESULT_TTL_MS`、`MCP_MAX_RESULTS`

## 打包部署

- `packager/x86/build.sh` 生成平台应用包，`appmanifest.ini` 描述应用（ID `hmi-ai-svc`，nodejs，端口 3100，TCP 健康检查）。
- 打包时在 stage 目录中用 `npm install --omit=dev --no-package-lock` 安装生产依赖并打入包内（目标机无法联网）；这是打包脚本的内部行为，不影响项目使用 pnpm。
- `packager/*/build/` 是构建产物，已被忽略，不要提交。

## 代码约定

- 源码注释、日志、提示词、文档使用中文；文件统一 UTF-8。注意 Windows 终端可能显示乱码，不代表文件损坏；编辑时务必保持 UTF-8，不要用会改变编码的方式重写文件。
- 保持 TypeScript `strict` 通过；不要用 `any` 绕过类型问题。
- 仅在需要说明意图时写注释。
- 改动后至少运行 `pnpm test`；涉及提示词或工具定义时，确认相关 `prompts` / `mcp` 测试通过。
