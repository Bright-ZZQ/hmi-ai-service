/**
 * HMI Engine Web AI Service — 入口
 *
 * 独立的 AI 图符/图纸生成后端服务。
 * 启动: npm run dev  (tsx watch src/index.ts)
 * 端口: 默认 3100 (通过 PORT 环境变量配置)
 */
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
  console.log(`[AI Service] 模型: ${config.agent.model}`)
  console.log(`[AI Service] API URL: ${config.agent.modelApiUrl}`)

  if (!config.agent.modelApiKey) {
    console.warn('[AI Service] ⚠️  AI_MODEL_API_KEY 未配置，请在 .env 文件中设置')
  }
})