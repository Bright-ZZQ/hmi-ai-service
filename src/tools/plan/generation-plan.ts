export interface GenerationPlan {
  summary: string
  expectedElementCount?: number
  requiredFeatureTools: string[]
  distinctFeatureTargets: boolean
}

export interface FeatureExecution {
  toolName: string
  elementKey: string
}

export function buildGenerationPlan(args: Record<string, unknown>): GenerationPlan {
  const rawCount = args.expectedElementCount
  const expectedElementCount = typeof rawCount === 'number'
    && Number.isInteger(rawCount)
    && rawCount >= 0
    ? rawCount
    : undefined
  // 只记录“要用哪些特性工具”，不要求次数：重复条目去重，执行中数量变化无需重新声明计划
  const requiredFeatureTools = Array.isArray(args.requiredFeatureTools)
    ? [...new Set(args.requiredFeatureTools.filter((name): name is string => typeof name === 'string' && name.length > 0))]
    : []

  return {
    summary: typeof args.summary === 'string' ? args.summary : '',
    expectedElementCount,
    requiredFeatureTools,
    distinctFeatureTargets: Boolean(args.distinctFeatureTargets),
  }
}

function canMatchFeatureExecutions(
  requirements: string[],
  executions: FeatureExecution[],
  distinctTargets: boolean,
  requirementIndex = 0,
  usedExecutions = new Set<number>(),
  usedTargets = new Set<string>(),
): boolean {
  if (requirementIndex >= requirements.length) return true

  for (let index = 0; index < executions.length; index++) {
    const execution = executions[index]
    if (usedExecutions.has(index) || execution.toolName !== requirements[requirementIndex]) continue
    if (distinctTargets && usedTargets.has(execution.elementKey)) continue

    usedExecutions.add(index)
    if (distinctTargets) usedTargets.add(execution.elementKey)
    if (canMatchFeatureExecutions(
      requirements,
      executions,
      distinctTargets,
      requirementIndex + 1,
      usedExecutions,
      usedTargets,
    )) return true
    usedExecutions.delete(index)
    if (distinctTargets) usedTargets.delete(execution.elementKey)
  }

  return false
}

export function validateGenerationPlan(
  plan: GenerationPlan | undefined,
  elementCount: number,
  featureExecutions: FeatureExecution[],
  isEditing = false,
): string[] {
  if (!plan) return ['缺少生成计划，请先调用 declare_generation_plan']

  const errors: string[] = []
  if (plan.expectedElementCount !== undefined && plan.expectedElementCount !== elementCount) {
    const scope = isEditing ? '本轮新增' : ''
    errors.push(`生成计划要求${scope} ${plan.expectedElementCount} 个基础图元，实际${scope}为 ${elementCount} 个。`
      + '若计划数量有误（如用户并未限定数量，或需求就是新增图元），请先重新调用 declare_generation_plan 修正（不限定数量时省略 expectedElementCount）；'
      + '若实际图元多余或缺失，请用 delete_element / create_* 调整后再组装')
  }

  // 每种计划内的特性工具至少成功执行一次；distinctFeatureTargets 时不同种类的特性须落在互不相同的图元上
  const requiredTools = [...new Set(plan.requiredFeatureTools)]
  if (!canMatchFeatureExecutions(
    requiredTools,
    featureExecutions,
    plan.distinctFeatureTargets,
  )) {
    const base = plan.distinctFeatureTargets
      ? '动态特性工具未按生成计划完整执行，或不同种类的特性未绑定到互不相同的图元'
      : '动态特性工具未按生成计划完整执行'
    errors.push(`${base}。${describeFeatureGap(requiredTools, featureExecutions)}`
      + '请只补调缺少的特性工具（目标须是最终组装结果中的图元），再重新调用 assemble 工具；'
      + '若计划中的 requiredFeatureTools 列出了实际不需要的工具，请先重新调用 declare_generation_plan 修正')
  }

  return errors
}

function describeFeatureGap(required: string[], executions: FeatureExecution[]): string {
  const done = new Set(executions.map(execution => execution.toolName))
  const missing = required.filter(tool => !done.has(tool))
  return `计划要求使用：${required.join('、') || '无'}；最终图纸中已有效执行：${[...done].join('、') || '无'}${missing.length ? `；缺少：${missing.join('、')}` : ''}。`
}