/**
 * Schema Validator — JSON 输出校验器
 *
 * 校验模型生成的 JSON 是否符合图纸/图符的数据结构规范。
 * 使用手写校验规则以保持零外部依赖。
 *
 * 校验策略：
 * 1. 结构校验：检查必需的顶层字段是否存在
 * 2. 类型校验：检查关键字段的类型是否正确
 * 3. 内容校验：检查 elements/comps 数组中每个元素的必要字段
 */

import type { EditorType } from '../types'

export interface ValidationError {
  path: string
  message: string
}

/**
 * 校验模型生成的 JSON
 * @returns 错误列表，空数组表示通过
 */
export function validateOutput(
  json: unknown,
  editorType: EditorType,
): ValidationError[] {
  if (editorType === 'display') {
    return validateDisplay(json)
  }
  return validateSymbol(json)
}

// ============================================================
// 图纸 (Display Document) 校验
// ============================================================

function validateDisplay(json: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (!json || typeof json !== 'object') {
    return [{ path: '$', message: '输出必须是一个 JSON 对象' }]
  }

  const doc = json as Record<string, unknown>

  // 顶层结构
  if (!doc.document) {
    return [{ path: '$', message: '缺少顶层 document 字段' }]
  }

  const document = doc.document as Record<string, unknown>

  // 必需字段
  if (typeof document.name !== 'string' || !document.name) {
    errors.push({ path: 'document.name', message: '图纸名称不能为空' })
  }

  if (!Array.isArray(document.elements)) {
    errors.push({ path: 'document.elements', message: 'elements 必须是数组' })
    return errors // 后续校验依赖 elements 存在
  }

  // 校验每个 element
  const elements = document.elements as Record<string, unknown>[]
  elements.forEach((el, i) => {
    const prefix = `document.elements[${i}]`

    if (!el.type || typeof el.type !== 'string') {
      errors.push({ path: `${prefix}.type`, message: '图元必须有 type 字段' })
    }

    if (!el.id || typeof el.id !== 'string') {
      errors.push({ path: `${prefix}.id`, message: '图元必须有 id 字段' })
    }

    if (typeof el.zIndex !== 'number') {
      errors.push({ path: `${prefix}.zIndex`, message: '图元必须有 zIndex 字段' })
    }

    // 非 Group 图元需要 localRect
    if (el.type !== 'Group' && !Array.isArray(el.localRect)) {
      errors.push({ path: `${prefix}.localRect`, message: '非 Group 图元需要 localRect 字段' })
    }

    // 验证 localRect 结构
    if (Array.isArray(el.localRect) && el.localRect.length !== 4) {
      errors.push({
        path: `${prefix}.localRect`,
        message: `localRect 必须包含 4 个顶点，当前 ${el.localRect.length} 个`,
      })
    }
  })

  // pageProperty 校验
  if (document.pageProperty) {
    const pp = document.pageProperty as Record<string, unknown>
    if (typeof pp.pageWidth !== 'number') {
      errors.push({ path: 'document.pageProperty.pageWidth', message: 'pageWidth 必须是数字' })
    }
    if (typeof pp.pageHeight !== 'number') {
      errors.push({ path: 'document.pageProperty.pageHeight', message: 'pageHeight 必须是数字' })
    }
  } else {
    errors.push({ path: 'document.pageProperty', message: '缺少 pageProperty 字段' })
  }

  return errors
}

// ============================================================
// 图符 (Symbol) 校验
// ============================================================

function validateSymbol(json: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (!json || typeof json !== 'object') {
    return [{ path: '$', message: '输出必须是一个 JSON 对象' }]
  }

  const symbol = json as Record<string, unknown>

  if (!Array.isArray(symbol.comps)) {
    errors.push({ path: 'comps', message: 'comps 必须是数组' })
  } else {
    const comps = symbol.comps as Record<string, unknown>[]
    comps.forEach((comp, i) => {
      if (!comp.className || typeof comp.className !== 'string') {
        errors.push({ path: `comps[${i}].className`, message: '图元必须有 className 字段' })
      }
    })
  }

  if (typeof symbol.width !== 'number') {
    errors.push({ path: 'width', message: 'width 必须是数字' })
  }

  if (typeof symbol.height !== 'number') {
    errors.push({ path: 'height', message: 'height 必须是数字' })
  }

  if (typeof symbol.code !== 'string') {
    errors.push({ path: 'code', message: 'code 必须是字符串' })
  }

  return errors
}

// ============================================================
// 格式化错误为人类可读的描述
// ============================================================

export function formatErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return ''
  return errors.map(e => `- ${e.path}: ${e.message}`).join('\n')
}