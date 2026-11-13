/**
 * AI Generate SSE 路由
 *
 * POST /api/ai/generate
 * Body: { prompt: string, editorType: 'display' | 'symbol' }
 * Response: SSE 流 (text/event-stream)
 */
import { Router, Request, Response } from 'express'
import { runAgentLoop } from '../agent/agent-service'
import { loadConfig } from '../config'
import type { EditorType, SSEEvent, AgentResult, ConversationMessage } from '../types'

// 显式标注，避免 declaration emit 泄漏 pnpm 内部的类型解析路径。
const router: Router = Router()

router.post('/ai/generate', async (req: Request, res: Response) => {
  const { prompt, editorType, history, currentJson } = req.body as {
    prompt?: string
    editorType?: EditorType
    history?: ConversationMessage[]
    currentJson?: Record<string, unknown>
  }

  // 参数验证
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: '缺少 prompt 参数' })
    return
  }
  if (!editorType || !['display', 'symbol'].includes(editorType)) {
    res.status(400).json({ error: 'editorType 必须是 display 或 symbol' })
    return
  }

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // 禁用 nginx 缓冲

  const streamId = globalThis.crypto.randomUUID()
  let seq = 0

  // SSE 发送工具函数
  const sendSSE = (event: SSEEvent) => {
    if (res.writableEnded) return
    const data = JSON.stringify({ ...event, streamId, seq: seq++ })
    res.write(`event: ${event.type}\ndata: ${data}\n\n`)
  }

  // 心跳注释帧，避免长任务被代理按空闲超时掐断
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n')
  }, 15000)
  const stopHeartbeat = () => clearInterval(heartbeat)
  res.on('close', stopHeartbeat)

  try {
    const config = loadConfig()

    if (!config.agent.modelApiKey) {
      sendSSE({ type: 'error', content: 'AI 模型 API Key 未配置，请检查 .env 文件' })
      stopHeartbeat()
      res.end()
      return
    }

    // 执行 Agent Loop
    const result: AgentResult = await runAgentLoop(
      prompt,
      editorType,
      config.agent,
      sendSSE,
      {
        history: Array.isArray(history) ? history : [],
        currentJson: currentJson && typeof currentJson === 'object' && !Array.isArray(currentJson)
          ? currentJson
          : undefined,
      },
    )

    if (!result.success && !result.question) {
      sendSSE({
        type: 'error',
        content: result.error || '生成失败',
      })
    }

    stopHeartbeat()
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器内部错误'
    console.error('[AiGenerate] 异常:', err)
    sendSSE({ type: 'error', content: message })
    stopHeartbeat()
    res.end()
  }
})

export default router
