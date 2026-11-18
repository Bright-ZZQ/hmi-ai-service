/**
 * 特性挂载公共逻辑
 *
 * add_feature_* 单图元工具与 bulk_apply_feature 批量工具共用：
 * 同一套参数校验、旋转中心处理与特性构建，保证批量结果与逐个添加完全一致。
 */

import {
  buildDynamicFeature,
  buildInteractiveFeature,
  isDynamicFeatureTool,
  isInteractiveFeatureTool,
} from './dynamic-feature-builders'
import { isRecord } from './element-lookup'
import type { EditorType } from '../types'

type Rec = Record<string, unknown>

export type FeatureStoreKey = 'dynamicDyna' | 'interactiveDyna'

export interface PreparedFeature {
  feature: object & { type: string }
  storeKey: FeatureStoreKey
  kind: '动态' | '交互'
}

export function getElementFillColor(element: Rec): string | undefined {
  const fillColor = isRecord(element.fillColor) ? element.fillColor : undefined
  if (typeof fillColor?.startColor === 'string') return fillColor.startColor
  const attrs = isRecord(element.attrs) ? element.attrs : undefined
  return typeof attrs?.fill === 'string' ? attrs.fill : undefined
}

export function attachFeatureToElement(element: Rec, storeKey: FeatureStoreKey, feature: object): void {
  const elementStore = isRecord(element.store) ? { ...element.store } : {}
  const existing = Array.isArray(elementStore[storeKey]) ? [...elementStore[storeKey] as unknown[]] : []
  existing.push(feature)
  element.store = { ...elementStore, [storeKey]: existing }
}

/**
 * 按工具名与参数为目标图元构建特性（不挂载）。旋转特性指定 pivot 时会写入图元 roatePos。
 * 参数不合法时返回 error，由调用方回传给模型。
 */
export function prepareFeature(
  name: string,
  args: Rec,
  element: Rec,
  editorType: EditorType,
): PreparedFeature | { error: string } {
  try {
    if (isDynamicFeatureTool(name)) {
      if (name === 'add_feature_visible' && Number(args.isVisible ?? 1) === 0 && args.not !== true
        && !(args.conditionSpecifiedByUser === true && args.dataSourceKey)) {
        return {
          error: '无条件的 isVisible=0 会让图元永久不可见，已拒绝。不要的图元请用 delete_element 删除；'
            + '仅当用户明确指定了触发条件时才能配置“条件满足隐藏”',
        }
      }
      const pivotX = Number(args.pivotX)
      const pivotY = Number(args.pivotY)
      const hasPivot = name === 'add_feature_rotate' && editorType === 'display'
        && args.pivotX != null && args.pivotY != null && Number.isFinite(pivotX) && Number.isFinite(pivotY)
      if (hasPivot) {
        // 旋转中心落在指定点：写入图元 roatePos，并用“偏移中心”让运行时保留该点
        element.roatePos = { x: pivotX, y: pivotY }
      }
      const featureArgs = name === 'add_feature_blink'
        ? { ...args, elementFillColor: getElementFillColor(element) }
        : hasPivot ? { ...args, rotCenter: 0 } : args
      const feature = buildDynamicFeature(name, featureArgs)
      return { feature, storeKey: 'dynamicDyna', kind: '动态' }
    }
    if (isInteractiveFeatureTool(name)) {
      const feature = buildInteractiveFeature(name, args)
      return { feature, storeKey: 'interactiveDyna', kind: '交互' }
    }
    return { error: `不支持的特性工具: ${name}` }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** 读取图元上的特性列表；AI 生成的特性在 store 下，编辑器序列化的图元特性可能在顶层，两处都读取 */
export function getFeatureList(element: Rec, key: FeatureStoreKey): Rec[] {
  const store = isRecord(element.store) ? element.store : {}
  return [store[key], element[key]]
    .flatMap(source => (Array.isArray(source) ? (source as unknown[]).filter(isRecord) : []))
}

/** 对特性实际所在的每个容器（store 与顶层）分别应用变换，保持特性原本的位置 */
export function mapFeatureLists(element: Rec, key: FeatureStoreKey, fn: (list: Rec[]) => Rec[]): void {
  const store = isRecord(element.store) ? element.store : undefined
  if (store && Array.isArray(store[key])) {
    element.store = { ...store, [key]: fn((store[key] as unknown[]).filter(isRecord)) }
  }
  if (Array.isArray(element[key])) {
    element[key] = fn((element[key] as unknown[]).filter(isRecord))
  }
}

export type FeatureKind = '动态' | '交互' | '事件'

export interface FeatureRef {
  kind: FeatureKind
  key: FeatureStoreKey | 'events'
  feature: Rec
  /** 在 list_features 中展示的序号，从 1 开始 */
  index: number
}

export function featureId(feature: Rec, kind: FeatureKind): string {
  if (kind === '事件') return typeof feature.name === 'string' ? feature.name : ''
  return typeof feature.id === 'string' ? feature.id : ''
}

export function readEvents(element: Rec): Rec[] {
  const store = isRecord(element.store) ? element.store : {}
  const source = Array.isArray(store.events) ? store.events : Array.isArray(element.events) ? element.events : []
  return (source as unknown[]).filter(isRecord)
}

export function collectFeatureRefs(element: Rec): FeatureRef[] {
  const refs: FeatureRef[] = []
  const push = (kind: FeatureKind, key: FeatureRef['key'], list: Rec[]) => {
    for (const feature of list) refs.push({ kind, key, feature, index: refs.length + 1 })
  }
  push('动态', 'dynamicDyna', getFeatureList(element, 'dynamicDyna'))
  push('交互', 'interactiveDyna', getFeatureList(element, 'interactiveDyna'))
  push('事件', 'events', readEvents(element))
  return refs
}
