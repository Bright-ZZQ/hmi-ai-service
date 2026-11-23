# HMI Engine Web AI Service

HMI Engine Web 的图纸（Display）与图符（Symbol）生成后端，支持图元创建、增量编辑、动态特性配置和组装校验。Agent Service 和 MCP 共用同一套绘图工具。

## 安装与启动

需要 **Node.js 18 或更高版本**和 **pnpm**。在项目根目录执行：

```bash
pnpm install
pnpm dev
```

如需运行编译产物，执行 `pnpm build` 后再执行 `pnpm start`。服务默认地址为 `http://localhost:3100`，可访问 `/health` 检查是否启动成功。

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

## MCP

由外部 Agent 调用模型并编排工具，无需配置 Agent Service 的模型。MCP 默认启用，使用支持 **Streamable HTTP** 的客户端连接：

- 图纸：`http://localhost:3100/mcp/display`
- 图符：`http://localhost:3100/mcp/symbol`

通过 `begin_session` 开始绘制，调用工具创建或编辑图元，再用 `assemble_display` 或 `assemble_symbol` 组装。需要下载时调用 `export_result`：单项导出为 JSON，多项导出为 ZIP。
