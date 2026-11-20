import { validateGenerationPlan } from '../plan/generation-plan'
import { countNewElements, omitUnchangedBaseElementErrors } from '../assembly/edit-context'
import { findDisplayInteractionIssues } from '../assembly/display-integrity'
import { getElementAliases } from '../lib/element-lookup'
import { validateOutput } from '../lib/schema-validator'
import type { ValidationError } from '../lib/schema-validator'
import type { SessionState } from './context'
import { DISPLAY_EVENT_KEY } from '../feature/handlers'
import { getElementsFromJson, isPlainObject } from './session'

/**
 * 校验会话产出的最终 JSON（Schema、交互完整性、生成计划）。
 * requirePlan=false 且会话未声明计划时跳过计划校验；已声明计划则照常校验。
 */
export function validateSessionOutput(
  session: SessionState,
  json: unknown,
  options: { requirePlan: boolean },
): ValidationError[] {
  const editorType = session.editorType
  const baseElements = getElementsFromJson(editorType, session.currentJson)
  const isEditing = Boolean(session.currentJson)
  const output = isPlainObject(json) ? json : undefined
  const generatedElements = getElementsFromJson(editorType, output)
  const generatedElementKeys = new Set(generatedElements.flatMap(getElementAliases))
  const finalFeatureExecutions = session.featureExecutions.filter(
    execution => execution.elementKey.startsWith(DISPLAY_EVENT_KEY) || generatedElementKeys.has(execution.elementKey),
  )
  // 编辑已有内容时，数量约束针对本轮新增的图元，已有图元不计入
  const plannedElementCount = isEditing
    ? countNewElements(generatedElements, baseElements)
    : generatedElements.length
  // 已有图纸本身存在的问题不由本轮负责，只拦截本轮新引入的
  const baseInteractionIssues = new Set(editorType === 'display' ? findDisplayInteractionIssues(baseElements) : [])
  const interactionIssues = editorType === 'display'
    ? [...new Set(findDisplayInteractionIssues(generatedElements))].filter(issue => !baseInteractionIssues.has(issue))
    : []
  const planErrors = options.requirePlan || session.generationPlan
    ? validateGenerationPlan(
      session.generationPlan,
      plannedElementCount,
      finalFeatureExecutions,
      isEditing,
    ).map(message => ({ path: 'generationPlan', message }))
    : []
  return [
    ...omitUnchangedBaseElementErrors(validateOutput(json, editorType), generatedElements, baseElements),
    ...interactionIssues.map(message => ({ path: 'elements', message })),
    ...planErrors,
  ]
}
