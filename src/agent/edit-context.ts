/**
 * 基于已有图纸/图符修改（编辑模式）的辅助函数
 *
 * 画布上已有的内容并非 AI 生成，可能不满足生成时的严格校验；
 * 同时新增图元必须叠放在已有图元之上，否则会被已有内容遮挡。
 */

type Element = Record<string, unknown>

/** 图纸图元用 id 标识，图符图元用 store.node_id 标识 */
function getElementId(element: Element): string | undefined {
  if (typeof element.id === 'string' && element.id) return element.id
  const store = element.store as Record<string, unknown> | undefined
  return typeof store?.node_id === 'string' && store.node_id ? store.node_id : undefined
}

/** 新增图元（不在原图纸中的 id）依次叠放到原有最高层级之上，原有图元保持不变 */
export function stackNewElementsOnTop(elements: Element[], baseElements: Element[]): Element[] {
  const baseIds = new Set(baseElements.map(getElementId).filter((id): id is string => Boolean(id)))
  let nextZIndex = baseElements.reduce(
    (max, element) => (typeof element.zIndex === 'number' && element.zIndex > max ? element.zIndex : max),
    -1,
  ) + 1

  return elements.map((element) => {
    const id = getElementId(element)
    return id && baseIds.has(id) ? element : { ...element, zIndex: nextZIndex++ }
  })
}

/** 本轮新增的图元数量（原图纸中不存在的 id） */
export function countNewElements(elements: Element[], baseElements: Element[]): number {
  const baseIds = new Set(baseElements.map(getElementId).filter((id): id is string => Boolean(id)))
  // 原图元没有 id 时无法按 id 判断，改为按内容逐个匹配，避免被误算成新增
  const unmatchedIdlessBase = baseElements
    .filter(element => !getElementId(element))
    .map(element => JSON.stringify(element))
  return elements.filter((element) => {
    const id = getElementId(element)
    if (id) return !baseIds.has(id)
    const matchIndex = unmatchedIdlessBase.indexOf(JSON.stringify(element))
    if (matchIndex < 0) return true
    unmatchedIdlessBase.splice(matchIndex, 1)
    return false
  }).length
}

/**
 * 去掉“原封不动保留的原有图元”上的校验错误：这些图元不是 AI 产出，模型也无法修复，
 * 否则用户手绘的特殊图元（如宽度为 0 的直线）会让整轮修改反复校验失败。
 */
export function omitUnchangedBaseElementErrors<T extends { path: string }>(
  errors: T[],
  elements: Element[],
  baseElements: Element[],
): T[] {
  if (baseElements.length === 0) return errors

  const baseById = new Map<string, string>()
  for (const element of baseElements) {
    const id = getElementId(element)
    if (id) baseById.set(id, JSON.stringify(element))
  }

  return errors.filter((error) => {
    const match = /^(?:document\.elements|comps)\[(\d+)\]/.exec(error.path)
    if (!match) return true
    const element = elements[Number(match[1])]
    if (!element) return true
    const id = getElementId(element)
    return !(id && baseById.get(id) === JSON.stringify(element))
  })
}
