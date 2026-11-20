import { buildGenerationPlan } from '../../generation-plan'
import type { ToolExecContext } from '../../tool-context'
import type { AgentStep } from '../../../types'

export function handleDeclarePlan({ name, args, session, onStep }: ToolExecContext): string {
  const plan = buildGenerationPlan(args)
  session.generationPlan = plan
  const step: AgentStep = {
    type: 'tool_call',
    content: `已声明生成计划: ${plan.summary || '未命名计划'}`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  return JSON.stringify({ success: true, plan })
}

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
