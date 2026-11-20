import { encodeText, findElementBriefs, findElementIndex } from '../../element-lookup'
import { decodeHtmlEntities } from '../../text-entities'
import type { ToolExecContext } from '../../tool-context'
import { isPlainObject } from '../session'
import type { AgentStep } from '../../../types'

function mergeElement(
  target: Record<string, unknown>,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const [key, value] of Object.entries(changes)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
    const current = result[key]
    result[key] = isPlainObject(current) && isPlainObject(value)
      ? mergeElement(current, value)
      : value
  }
  return result
}

// 修改已有图元（多轮对话）
export function handleUpdateElement({ name, args, session, onStep, emit }: ToolExecContext): string {
  const target = String(args.target || '')
  const index = findElementIndex(session.workingElements, target)
  if (index < 0) {
    return JSON.stringify({ success: false, error: `未找到图元: ${target}` })
  }

  let changes: Record<string, unknown>
  try {
    const parsed = JSON.parse(String(args.changesJson || '{}'))
    if (!isPlainObject(parsed)) throw new Error('changesJson 必须是 JSON 对象')
    changes = parsed
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'changesJson 解析失败',
    })
  }

  // 图纸文字图元的 text 以 base64 存储，模型传入的是原始文字，必须编码，否则编辑器 atob 解码失败
  if (session.editorType === 'display' && typeof changes.text === 'string') {
    changes = { ...changes, text: encodeText(decodeHtmlEntities(changes.text)) }
  }

  session.workingElements[index] = mergeElement(session.workingElements[index], changes)
  const step: AgentStep = {
    type: 'tool_call',
    content: `已修改图元 "${target}"`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emit({
    type: 'element_patch',
    patch: { op: 'update', target, element: session.workingElements[index] },
  })
  return JSON.stringify({ success: true, element: session.workingElements[index] })
}

// 删除已有图元（多轮对话）
export function handleDeleteElement({ name, args, session, onStep, emit }: ToolExecContext): string {
  const target = String(args.target || '')
  const index = findElementIndex(session.workingElements, target)
  if (index < 0) {
    return JSON.stringify({ success: false, error: `未找到图元: ${target}` })
  }
  const [removed] = session.workingElements.splice(index, 1)
  const step: AgentStep = {
    type: 'tool_call',
    content: `已删除图元 "${target}"`,
    toolName: name,
    toolArgs: args,
    timestamp: Date.now(),
  }
  session.steps.push(step)
  onStep(step)
  emit({ type: 'element_patch', patch: { op: 'delete', target } })
  return JSON.stringify({ success: true, removed })
}

// 按名称/文字内容检索图元
export function handleFindElements({ args, session }: ToolExecContext): string {
  const keyword = typeof args.keyword === 'string' ? args.keyword : ''
  const { total, candidates } = findElementBriefs(
    session.workingElements,
    keyword,
    session.canvas.pageWidth,
    session.canvas.pageHeight,
  )
  return JSON.stringify({
    success: true,
    canvas: { width: session.canvas.pageWidth, height: session.canvas.pageHeight },
    total,
    candidates,
  })
}
