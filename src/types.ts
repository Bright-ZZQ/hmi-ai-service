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

/** 调用编辑器模型点校验接口所需的配置 */
export interface ModelPointApiConfig {
  /** 编辑器后端网关地址，如 http://host:8700 */
  baseUrl: string
  /** 透传前端请求的 Authorization */
  authorization?: string
  /** 透传前端请求的工程 namespace（projectCode） */
  namespace?: string
}

export interface AgentContext {
  history?: ConversationMessage[]
  currentJson?: Record<string, unknown>
  modelPointApi?: ModelPointApiConfig
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
        enum?: Array<string | number | boolean>
        items?: Record<string, unknown>
      }>
      required: string[]
    }
  }
}

/** 工具分类（治理 / 路由用） */
export type ToolCategory =
  | 'plan'
  | 'shape'
  | 'composite'
  | 'edit'
  | 'assembly'
  | 'feature'
  /** 批量与重复生成（复制 / 批量特性 / 点表 / 组合） */
  | 'batch'
  /** 排版（对齐 / 分布 / 层级 / 适应画布） */
  | 'layout'
  /** 检查与调试（特性读写 / 布局检查 / 脚本试跑） */
  | 'inspect'
  /** 图纸级设置（图纸属性 / 页面参数） */
  | 'page'

/** Agent 生命周期阶段 */
export type AgentPhase = 'plan' | 'create' | 'feature' | 'assemble' | 'edit'

/** 工具分类元数据：按需下发（阶段门控 / 关键词预筛）与一致性校验的数据源 */
export interface SkillMeta {
  category: ToolCategory
  /** 适用的生命周期阶段 */
  phases: AgentPhase[]
  /** 任意阶段都应下发的核心工具 */
  core?: boolean
  /** 相关性预筛关键词（中文意图词） */
  keywords?: string[]
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
  /** 目标不明确，需要用户补充信息后再继续 */
  question?: AgentQuestion
  steps: AgentStep[]
  metrics?: StreamMetrics
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
  /** 模型 API 重试最大延迟（ms，默认 120000） */
  modelApiRetryMaxDelay: number
  /** 429 限流重试基础延迟（ms，默认 60000） */
  modelApiRateLimitRetryDelay: number
  /** 单次模型调用的最大输出 token（含推理模型的思考 token，默认 16384） */
  maxTokens?: number
  /** 附加到每次模型请求体的专有参数，如 {"thinking":{"type":"enabled"}} */
  extraBody?: Record<string, unknown>
  /** 思考超额后重试时额外附加的参数，如 {"thinking":{"type":"disabled"}} 关闭思考 */
  fallbackBody?: Record<string, unknown>
  /** 方案预览（轻量前置调用）附加的请求体参数，如 {"thinking":{"type":"disabled"}} 关闭思考以便几秒内出结果；不配置则预览沿用模型默认思考 */
  previewBody?: Record<string, unknown>
  /** 无正式输出时允许的最大思考长度（字符），超过则提前中断；默认 0 表示不限制 */
  maxReasoningChars?: number
}

/** 流式绘制的画布信息 */
export interface StreamCanvas {
  name: string
  pageWidth: number
  pageHeight: number
  bgColor: string
}

/** 流式绘制的图元增量补丁 */
export interface StreamPatch {
  op: 'update' | 'delete'
  target: string
  element?: Record<string, unknown>
}

/** 生成耗时指标（累计值） */
export interface StreamMetrics {
  /** 等待模型 API 的累计耗时（ms，不含重试退避等待） */
  modelMs: number
  /** 服务端自身耗时（ms）= 总耗时 - 模型耗时 */
  serverMs: number
  /** 工具执行（图元构建/组装）累计耗时（ms） */
  toolMs: number
  /** Agent Loop 开始到当前的总耗时（ms） */
  totalMs: number
  /** 已完成的模型调用轮次 */
  rounds: number
  /** 已执行的工具调用数 */
  toolCalls: number
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
  | 'canvas'
  | 'element'
  | 'element_patch'
  | 'stream_reset'
  | 'metrics'
  | 'question'

/** Agent 需要用户澄清时的提问 */
export interface AgentQuestion {
  question: string
  options?: string[]
}

export interface SSEEvent {
  type: SSEEventType
  content?: string
  question?: AgentQuestion
  toolName?: string
  toolArgs?: Record<string, unknown>
  json?: Record<string, unknown>
  retry?: boolean
  /** 一次生成会话的唯一标识，用于前端丢弃过期流 */
  streamId?: string
  /** 单调递增序号 */
  seq?: number
  canvas?: StreamCanvas
  /** 复合组件一次产出多个图元 */
  elements?: Record<string, unknown>[]
  /** 覆盖整块画布的底板，前端需下沉 zIndex */
  isBackground?: boolean
  patch?: StreamPatch
  metrics?: StreamMetrics
}
