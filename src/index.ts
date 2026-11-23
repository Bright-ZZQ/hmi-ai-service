/**
 * HMI Engine Web AI Service — 入口
 *
 * 独立的 AI 图符/图纸生成后端服务。
 * 启动: npm run dev  (tsx watch src/index.ts)
 * 端口: 默认 3100 (通过 PORT 环境变量配置)
 */
import './polyfills'
import express from 'express'
import cors from 'cors'
import { loadConfig } from './config'
import aiGenerateRouter from './routes/ai-generate'
import { createMcpRouter } from './mcp/http'

const config = loadConfig()
const app = express()

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hmiengineweb-ai-service' })
})

// AI 生成路由
app.use('/api', aiGenerateRouter)

// MCP 入口：/mcp/display、/mcp/symbol；MCP_ENABLED=false 时关闭
if (process.env.MCP_ENABLED !== 'false') {
  app.use('/mcp', createMcpRouter())
}

// 启动
app.listen(config.port, () => {
  console.log(`[AI Service] 服务已启动: http://localhost:${config.port}`)

  const modelConfigured = Boolean(process.env.AI_MODEL_API_KEY && process.env.AI_MODEL_NAME)
  if (modelConfigured) {
    console.log(`[AI Service] Agent Service：可用，模型: 可用 (${config.agent.model}, ${config.agent.modelApiUrl})`)
  } else {
    const missing = ['AI_MODEL_API_KEY', 'AI_MODEL_NAME'].filter(name => !process.env[name])
    console.warn(`[AI Service] Agent Service：不可用，模型: 未配置，不可用（缺少 ${missing.join('、')}，请在 .env 文件中设置）`)
  }

  const mcpEnabled = process.env.MCP_ENABLED !== 'false'
  if (mcpEnabled) {
    console.log(`[AI Service] MCP: 可用 (http://localhost:${config.port}/mcp/display, /mcp/symbol)`)
  } else {
    console.warn('[AI Service] MCP: 已禁用 (MCP_ENABLED=false)，不可用')
  }

  if (config.editorSvcUrl) {
    console.log('[AI Service] 查询测点: 可用')
  } else {
    console.warn('[AI Service] 查询测点: 未配置 HMI_EDITOR_SVC_URL，不可用（生成时将跳过测点信息补全）')
  }
})