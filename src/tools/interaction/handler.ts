import type { ToolExecContext } from '../core/context'
import type { AgentStep } from '../../types'

// 目标不明确时向用户提问并结束本轮
export function handleAskUser({ name, args, session, onStep, emit }: ToolExecContext): string {
  const question = typeof args.question === 'string' ? args.question.trim() : ''
  if (!question) return JSON.stringify({ success: false, error: '缺少 question 参数' })
  const options = Array.isArray(args.options)
    ? args.options.filter((o): o is string => typeof o === 'string' && o.length > 0).slice(0, 6)
    : undefined
  session.question = { question, ...(options?.length ? { options } : {}) }
  const step: AgentStep = {
    type: 'tool_call',
    content: question,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emit({ type: 'question', question: session.question })
  return JSON.stringify({ success: true, message: '已向用户提问，请停止并等待用户回答' })
}
