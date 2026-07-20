/**
 * 服务配置 — 从环境变量加载
 */
import dotenv from 'dotenv'
import type { AgentConfig } from './types'

dotenv.config()

export interface ServiceConfig {
  port: number
  agent: AgentConfig
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env.PORT || '3100', 10),
    agent: {
      modelApiUrl: process.env.AI_MODEL_API_URL || 'https://api.openai.com/v1/chat/completions',
      modelApiKey: process.env.AI_MODEL_API_KEY || '',
      model: process.env.AI_MODEL_NAME || 'gpt-4',
      maxRetries: parseInt(process.env.AI_MAX_RETRIES || '2', 10),
      modelApiMaxRetries: parseInt(process.env.AI_MODEL_API_MAX_RETRIES || '3', 10),
      modelApiRetryDelay: parseInt(process.env.AI_MODEL_API_RETRY_DELAY || '1000', 10),
    },
  }
}