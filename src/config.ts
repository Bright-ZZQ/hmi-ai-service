/**
 * 服务配置 — 从环境变量加载
 */
import dotenv from 'dotenv'
import type { AgentConfig } from './types'

dotenv.config()

export interface ServiceConfig {
  port: number
  /** 编辑器后端地址，用于补全特性测点的模型信息；为空则跳过补全 */
  editorSvcUrl: string
  agent: AgentConfig
}

function parseJsonEnv(name: string): Record<string, unknown> | undefined {
  const raw = process.env[name]
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
  } catch {
    console.warn(`[config] ${name} 不是合法的 JSON 对象，已忽略`)
    return undefined
  }
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env.PORT || '3100', 10),
    editorSvcUrl: process.env.HMI_EDITOR_SVC_URL || '',
    agent: {
      modelApiUrl: process.env.AI_MODEL_API_URL || 'https://api.openai.com/v1/chat/completions',
      modelApiKey: process.env.AI_MODEL_API_KEY || '',
      model: process.env.AI_MODEL_NAME || 'gpt-4',
      maxRetries: parseInt(process.env.AI_MAX_RETRIES || '2', 10),
      modelApiMaxRetries: parseInt(process.env.AI_MODEL_API_MAX_RETRIES || '3', 10),
      modelApiRetryDelay: parseInt(process.env.AI_MODEL_API_RETRY_DELAY || '1000', 10),
      modelApiRetryMaxDelay: parseInt(process.env.AI_MODEL_API_RETRY_MAX_DELAY || '120000', 10),
      modelApiRateLimitRetryDelay: parseInt(process.env.AI_MODEL_API_RATE_LIMIT_RETRY_DELAY || '60000', 10),
      maxTokens: parseInt(process.env.AI_MODEL_MAX_TOKENS || '32768', 10),
      extraBody: parseJsonEnv('AI_MODEL_EXTRA_BODY'),
      fallbackBody: parseJsonEnv('AI_MODEL_FALLBACK_BODY'),
      previewBody: parseJsonEnv('AI_MODEL_PREVIEW_BODY'),
      maxReasoningChars: parseInt(process.env.AI_MODEL_MAX_REASONING_CHARS || '0', 10),
    },
  }
}
