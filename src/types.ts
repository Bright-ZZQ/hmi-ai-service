/**
 * AI Agent 类型定义
 *
 * 前后端共享，变更时需同步。
 */

/** 编辑器类型 */
export type EditorType = 'display' | 'symbol'

/** 跨请求携带的精简对话历史。会话状态由客户端持有，服务端保持无状态。 */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentContext {
  history?: ConversationMessage[]
  currentJson?: Record<string, unknown>
}

/** OpenAI 兼容的 Tool Definition */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, {
        type: string
        description: string
        enum?: string[]
        items?: Record<string, unknown>
      }>
      required: string[]
    }
  }
}

/** Skill 注册条目 */
export interface SkillRegistryEntry {
  toolDef: ToolDefinition
  group: EditorType
}

/** Agent 循环中的消息类型 (兼容 OpenAI Chat Completions API) */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** Agent 执行结果 */
export interface AgentResult {
  success: boolean
  json?: Record<string, unknown>
  error?: string
  steps: AgentStep[]
}

export interface AgentStep {
  type: 'thinking' | 'tool_call' | 'validation' | 'retry' | 'done'
  content: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  timestamp: number
}

/** Agent 配置 */
export interface AgentConfig {
  modelApiUrl: string
  modelApiKey: string
  model: string
  maxRetries: number
  /** 模型 API 调用最大重试次数（默认 3） */
  modelApiMaxRetries: number
  /** 模型 API 重试基础延迟（ms，默认 1000，指数退避） */
  modelApiRetryDelay: number
}

/** SSE 事件类型 */
export type SSEEventType =
  | 'thinking'
  | 'tool_call'
  | 'progress'
  | 'result'
  | 'error'
  | 'retry'
  | 'done'

export interface SSEEvent {
  type: SSEEventType
  content?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  json?: Record<string, unknown>
  retry?: boolean
}
