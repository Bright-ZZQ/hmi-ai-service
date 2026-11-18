/**
 * 图纸静态检查（lint_display）
 *
 * 在 display-integrity 的交互完整性检查基础上，补充布局类问题：越界、重叠、文字溢出、
 * 文字与底色对比度过低、同名图元。只读，不修改任何图元。
 */

import { isBackgroundElement, measureTextWidth } from './element-builders'
import { contrastRatio, hasVisibleFill } from './dynamic-feature-builders'
import { findDisplayInteractionIssues, isPermanentlyHidden } from './display-integrity'
import { getElementBounds } from './element-geometry'
import type { Bounds } from './element-geometry'
import { decodeText, isRecord } from './element-lookup'

type Rec = Record<string, unknown>

export type LintLevel = 'error' | 'warning' | 'info'

export interface LintIssue {
  level: LintLevel
  code: 'out_of_canvas' | 'overlap' | 'text_overflow' | 'text_empty' | 'low_contrast' | 'duplicate_name' | 'interaction'
  element?: string
  message: string
}

const MAX_ISSUES_PER_CODE = 20
const OVERLAP_RATIO_LIMIT = 0.3
const OUT_OF_CANVAS_TOLERANCE = 1
const MIN_TEXT_CONTRAST = 2.5
const SOLID_SHAPES = new Set(['Rectangle', 'RoundRect', 'Ellipse', 'Polygon', 'Picture', 'Pie', 'Chord', 'RegularPolygon'])
const DEFAULT_FONT_SIZE = 14
const TEXT_LINE_HEIGHT = 1.2

function label(element: Rec): string {
  return String(element.name ?? element.id ?? '未命名')
}

function elementKey(element: Rec): string {
  return typeof element.id === 'string' ? element.id : label(element)
}

function overlapArea(a: Bounds, b: Bounds): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function contains(outer: Bounds, inner: Bounds, tolerance = 1): boolean {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance
}

function fillOf(element: Rec): string | undefined {
  const fill = isRecord(element.fillColor) ? element.fillColor.startColor : undefined
  return hasVisibleFill(fill) ? fill : undefined
}

function textColorOf(element: Rec): string | undefined {
  const color = isRecord(element.textColor) ? element.textColor.startColor : undefined
  return typeof color === 'string' ? color : undefined
}

function fontInfo(element: Rec): { size: number, bold: boolean } {
  const parts = String(element.font ?? '').split(',')
  return { size: Number(parts[1]) || DEFAULT_FONT_SIZE, bold: parts[4] === '1' }
}

function capped(issues: LintIssue[], code: LintIssue['code']): boolean {
  return issues.filter(issue => issue.code === code).length >= MAX_ISSUES_PER_CODE
}

export function lintDisplay(
  elements: Rec[],
  canvas: { pageWidth: number, pageHeight: number, bgColor: string },
): LintIssue[] {
  const issues: LintIssue[] = []
  const entries = elements
    .map(element => ({ element, bounds: getElementBounds(element) }))
    .filter((entry): entry is { element: Rec, bounds: Bounds } => entry.bounds !== undefined)
  const isGroup = (element: Rec) => element.type === 'Group'

  // 越界
  for (const { element, bounds } of entries) {
    if (isGroup(element) || isBackgroundElement(element, canvas.pageWidth, canvas.pageHeight)) continue
    const over: string[] = []
    if (bounds.x < -OUT_OF_CANVAS_TOLERANCE) over.push(`左侧超出 ${Math.round(-bounds.x)}px`)
    if (bounds.y < -OUT_OF_CANVAS_TOLERANCE) over.push(`上方超出 ${Math.round(-bounds.y)}px`)
    const right = bounds.x + bounds.width - canvas.pageWidth
    const bottom = bounds.y + bounds.height - canvas.pageHeight
    if (right > OUT_OF_CANVAS_TOLERANCE) over.push(`右侧超出 ${Math.round(right)}px`)
    if (bottom > OUT_OF_CANVAS_TOLERANCE) over.push(`下方超出 ${Math.round(bottom)}px`)
    if (over.length > 0 && !capped(issues, 'out_of_canvas')) {
      issues.push({ level: 'error', code: 'out_of_canvas', element: elementKey(element), message: `图元 ${label(element)} 越出画布：${over.join('，')}` })
    }
  }

  // 实心形状重叠（一方完全包含另一方视为容器关系，不算重叠）
  const solids = entries.filter(({ element }) => SOLID_SHAPES.has(String(element.type))
    && !isBackgroundElement(element, canvas.pageWidth, canvas.pageHeight)
    && !isPermanentlyHidden(element))
  for (let i = 0; i < solids.length && !capped(issues, 'overlap'); i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]
      const b = solids[j]
      if (a.element.pId !== b.element.pId) continue
      if (contains(a.bounds, b.bounds) || contains(b.bounds, a.bounds)) continue
      const smaller = Math.min(a.bounds.width * a.bounds.height, b.bounds.width * b.bounds.height)
      if (smaller <= 0 || overlapArea(a.bounds, b.bounds) / smaller < OVERLAP_RATIO_LIMIT) continue
      issues.push({
        level: 'warning',
        code: 'overlap',
        element: elementKey(a.element),
        message: `图元 ${label(a.element)} 与 ${label(b.element)} 部分重叠（重叠超过较小者面积的 ${Math.round(OVERLAP_RATIO_LIMIT * 100)}%），且不是包含关系`,
      })
      if (capped(issues, 'overlap')) break
    }
  }

  // 文字：溢出、为空、与底色对比度
  const containers = entries
    .filter(({ element }) => SOLID_SHAPES.has(String(element.type)) && fillOf(element) !== undefined)
    .sort((a, b) => Number(a.element.zIndex ?? 0) - Number(b.element.zIndex ?? 0))
  for (const { element, bounds } of entries) {
    if (element.type !== 'Text' || isPermanentlyHidden(element)) continue
    const text = decodeText(element.text) ?? ''
    if (!text.trim()) {
      if (!capped(issues, 'text_empty')) {
        issues.push({ level: 'info', code: 'text_empty', element: elementKey(element), message: `文字图元 ${label(element)} 内容为空（若由数值显示特性驱动可忽略）` })
      }
      continue
    }
    const { size, bold } = fontInfo(element)
    const lines = text.split(/\r?\n/)
    const widest = Math.max(...lines.map(line => measureTextWidth(line, size, bold)))
    const needHeight = lines.length * size * TEXT_LINE_HEIGHT
    const autoFrame = element.autoFrame === true || element.autoFrame === 1
    if (!autoFrame && (widest > bounds.width + 1 || needHeight > bounds.height + 2) && !capped(issues, 'text_overflow')) {
      issues.push({
        level: 'warning',
        code: 'text_overflow',
        element: elementKey(element),
        message: `文字 ${label(element)}（${text.length > 12 ? `${text.slice(0, 12)}…` : text}）估算需要约 ${Math.round(widest)}×${Math.round(needHeight)}px，文本框仅 ${Math.round(bounds.width)}×${Math.round(bounds.height)}px，可能被截断或溢出`,
      })
    }

    const color = textColorOf(element)
    if (!color || !hasVisibleFill(color)) continue
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2
    const below = [...containers].reverse().find(({ element: shape, bounds: box }) => (
      Number(shape.zIndex ?? 0) <= Number(element.zIndex ?? 0)
      && cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height
    ))
    const background = (below ? fillOf(below.element) : undefined) ?? canvas.bgColor
    if (contrastRatio(color, background) < MIN_TEXT_CONTRAST && !capped(issues, 'low_contrast')) {
      issues.push({
        level: 'warning',
        code: 'low_contrast',
        element: elementKey(element),
        message: `文字 ${label(element)} 的颜色 ${color} 与底色 ${background} 对比度过低，可能看不清`,
      })
    }
  }

  // 同名图元（按名称定位会有歧义）
  const byName = new Map<string, number>()
  for (const element of elements) {
    const name = typeof element.name === 'string' ? element.name : ''
    if (name) byName.set(name, (byName.get(name) ?? 0) + 1)
  }
  for (const [name, count] of byName) {
    if (count > 1 && !capped(issues, 'duplicate_name')) {
      issues.push({ level: 'info', code: 'duplicate_name', message: `有 ${count} 个图元同名「${name}」，按名称引用时会有歧义，建议用 id 定位` })
    }
  }

  for (const message of new Set(findDisplayInteractionIssues(elements))) {
    issues.push({ level: 'error', code: 'interaction', message })
  }
  return issues
}
