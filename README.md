# HMI Engine Web AI Service

HMI Engine Web 的图纸（Display）与图符（Symbol）生成后端，支持图元创建、增量编辑、动态特性配置和组装校验。Agent Service 和 MCP 共用同一套绘图工具。

## Skill：hmi-image-to-diagram

[skills/hmi-image-to-diagram](skills/hmi-image-to-diagram) 用于根据参考图片在 HMI 编辑器中复绘可编辑的工业流程图（PFD、P&ID）。

**需要的环境**：

- **Git**：获取本仓库。
- **Node.js 18+**（含 pnpm）：运行本服务。
- **Python 3**：运行 skill 的批量生成脚本，仅用标准库，无需 `pip install`。Windows 上命令是 `python`，可用 `winget install Python.Python.3.12` 安装。

**安装**：把整个 `skills/hmi-image-to-diagram` 目录复制到所用 Agent 的 skills 目录（如项目内 `.github/skills/`，或用户目录 `~/.copilot/skills/`），保持目录名不变，然后重新加载 Agent。

**一键配置**：把下面这段话发给你的 AI 助手，让它代为安装：

```text
配置如下环境：
- 运行环境：安装 Git、Node.js、Python 和 Chrome，已存在则跳过。
- SKILL：从 https://github.com/Bright-ZZQ/hmi-ai-service/tree/main/skills/hmi-image-to-diagram 安装SKILL。
```

## 安装与启动

需要 **Node.js 18 或更高版本**和 **pnpm**。在项目根目录执行：

```bash
pnpm install
pnpm dev
```

如需运行编译产物，执行 `pnpm build` 后再执行 `pnpm start`。服务默认地址为 `http://localhost:3100`，可访问 `/health` 检查是否启动成功。

## MCP

由外部 Agent 调用模型并编排工具，无需配置 Agent Service 的模型。MCP 默认启用，使用支持 **Streamable HTTP** 的客户端连接（需先按下文“安装与启动”运行服务）：

- 图纸：`http://localhost:3100/mcp/display`
- 图符：`http://localhost:3100/mcp/symbol`

通过 `begin_session` 开始绘制，调用工具创建或编辑图元，再用 `assemble_display` 或 `assemble_symbol` 组装。需要下载时调用 `export_result`：单项导出为 JSON，多项导出为 ZIP。

**一键配置**：把下面这段话发给你的 AI 助手，让它代为配置：

```text
配置如下环境：
- 运行环境：安装 Git、Node.js（18 或更高，含 pnpm），已存在则跳过。
- 服务：克隆 https://github.com/Bright-ZZQ/hmi-ai-service.git，执行 pnpm install，后台运行 pnpm dev，并访问 http://localhost:3100/health 确认启动。
- MCP：在你的 MCP 配置中添加两个 Streamable HTTP 服务器：hmi-display（http://localhost:3100/mcp/display）和 hmi-symbol（http://localhost:3100/mcp/symbol）。
```

## Agent Service

由服务端调用模型并编排绘图工具。使用前，在项目根目录的 `.env` 中配置 OpenAI 兼容的模型服务。

向 `POST /api/ai/generate` 发送 JSON，例如：

```json
{
  "prompt": "生成一张包含水箱和两台泵的工艺流程图",
  "editorType": "display"
}
```

`editorType` 可选 `display`（图纸）或 `symbol`（图符）。编辑已有内容时传入 `currentJson`。接口通过 SSE 返回绘制进度和最终 JSON。
