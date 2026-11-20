/**
 * 页面参数声明
 *
 * 运行时 gv.setPageParamsEx / getPageParamsEx 只读写 document.pageParams 中已声明的参数，
 * 未声明时 set 无效、get 返回 undefined，依赖它保存状态的脚本（如启停旋转循环）会直接失效。
 * 因此组装图纸时，把脚本中以字符串字面量引用的页面参数自动补充声明。
 */
import { randomUUID } from 'node:crypto'

/** 与编辑器 PageParamsType.FLOAT 对应；运行时不按类型转换值，仅用于编辑器展示 */
const PAGE_PARAM_TYPE_FLOAT = 1

const PAGE_PARAM_CALL = /\b(?:set|get)PageParamsEx\(\s*(['"`])([^'"`]+)\1/g

/** 匹配参数名不是字符串字面量的调用（如 getPageParamsEx(name)），此类参数无法自动声明 */
const DYNAMIC_PAGE_PARAM_CALL = /\b(?:set|get)PageParamsEx\(\s*(?!['"`])/

/** 脚本是否以非字面量的参数名读写页面参数 */
export function hasDynamicPageParamName(script: string): boolean {
  return DYNAMIC_PAGE_PARAM_CALL.test(script)
}

/** 递归收集数据中所有字符串里以字面量引用的页面参数名 */
export function collectPageParamNames(root: unknown): string[] {
  const names = new Set<string>()
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(PAGE_PARAM_CALL)) names.add(match[2])
    } else if (Array.isArray(value)) {
      value.forEach(visit)
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(visit)
    }
  }
  visit(root)
  return [...names]
}

/** 在已有页面参数基础上补充缺失的声明，已有参数原样保留 */
export function ensurePageParams(existing: unknown, names: string[]): Array<Record<string, unknown>> {
  const params = Array.isArray(existing) ? [...existing] as Array<Record<string, unknown>> : []
  const declared = new Set(params.map(param => param?.name))
  for (const name of names) {
    if (declared.has(name)) continue
    params.push({
      id: randomUUID(),
      name,
      desc: '',
      type: PAGE_PARAM_TYPE_FLOAT,
      value: 0,
      editMode: 0,
    })
    declared.add(name)
  }
  return params
}
