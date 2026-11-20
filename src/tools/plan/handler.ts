import { buildGenerationPlan } from './generation-plan'
import type { ToolExecContext } from '../core/context'
import type { AgentStep } from '../../types'

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
