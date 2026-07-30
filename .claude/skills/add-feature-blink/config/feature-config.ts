/**
 * 闪烁动态特性 (GraphDynaBlink) 的 FeatureConfig 配置结构
 *
 * 功能来源:
 *   hmiengineweb/packages/d2-preview/src/dynamic-plugin/features/blink.ts      (2D 闪烁执行引擎)
 *   hmiengineweb/packages/d3-core/src/components/dynamic-feature-component/features/blink-feature.ts (3D 闪烁执行引擎)
 */

import type { FeatureParam } from '../../add-feature-visible/config/feature-config'

/** 闪烁特性 (GraphDynaBlink) 的 pars 结构 */
export interface BlinkPars {
  // 闪烁频率
  blinkFreq: FeatureParam       // 0=慢速(1000ms), 1=中速(500ms), 2=快速(250ms)
  blinkFreqRef: FeatureParam

  // 闪烁方式
  blinkMethod: FeatureParam     // 0=显隐闪烁, 1=颜色闪烁
  blinkMethodRef: FeatureParam

  // 文字闪烁颜色（颜色闪烁模式下使用）
  blinkColor: FeatureParam
  blinkColorRef: FeatureParam

  // 填充色开关及颜色
  isFullClr: FeatureParam       // 1=改变填充色
  isFullClrRef: FeatureParam
  blinkBacClr: FeatureParam     // 闪烁填充色
  blinkBacClrRef: FeatureParam

  // 边框色开关及颜色
  isFrameClr: FeatureParam      // 1=改变边框色
  isFrameClrRef: FeatureParam
  blinkBorClr: FeatureParam     // 闪烁边框色
  blinkBorClrRef: FeatureParam

  // 填充渐变
  blinkBacGra: FeatureParam     // 填充渐变模式
  blinkBacGraClr: FeatureParam  // 填充渐变颜色
  blinkBacGraClrRef: FeatureParam

  // 边框渐变
  blinkBorGra: FeatureParam     // 边框渐变模式
  blinkBorGraClr: FeatureParam  // 边框渐变颜色
  blinkBorGraClrRef: FeatureParam
}

/** 闪烁频率枚举 */
export const BLINK_FREQUENCY = {
  SLOW: 0,    // 慢速 - 1000ms
  MEDIUM: 1,  // 中速 - 500ms
  FAST: 2,    // 快速 - 250ms
} as const

/** 闪烁方式枚举 */
export const BLINK_METHOD = {
  VISIBLE: 0,  // 显隐闪烁 - 周期性地显示/隐藏图元
  COLOR: 1,    // 颜色闪烁 - 周期性地切换颜色
} as const
