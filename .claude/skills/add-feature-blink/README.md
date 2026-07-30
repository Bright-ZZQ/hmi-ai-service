# add-feature-blink

为图符中的图元添加闪烁动态特性（`GraphDynaBlink`），根据条件控制图元周期性显隐或周期性变色。

## 快速开始

```text
当 AI_001 > 100 时，矩形-100001 慢速闪烁（显隐）
```

支持两种闪烁方式：显隐闪烁（`blinkMethod=0`）和颜色闪烁（`blinkMethod=1`），颜色闪烁模式下可独立配置填充色、边框色、文字色及渐变。

## 参数说明

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `targetNode` | node_id / name | 是 | - | 目标图元 |
| `leftValue` | DbModel | 条件时必需 | - | 条件左值 |
| `sign` | 0~10 | 条件时必需 | - | 运算符 |
| `rightValue` | string/number | 条件时必需 | - | 条件右值 |
| `blinkFreq` | 0\|1\|2 | 否 | 0 | 闪烁频率：0=慢速, 1=中速, 2=快速 |
| `blinkMethod` | 0\|1 | 否 | 0 | 闪烁方式：0=显隐闪烁, 1=颜色闪烁 |
| `isFullClr` | 0\|1 | 否 | 0 | 是否改变填充色 |
| `blinkBacClr` | color | 否 | rgb(0,0,0) | 闪烁填充色 |
| `blinkBacGra` | string | 否 | "" | 填充渐变模式 |
| `blinkBacGraClr` | color | 否 | rgb(255,255,255) | 填充渐变颜色 |
| `isFrameClr` | 0\|1 | 否 | 0 | 是否改变边框色 |
| `blinkBorClr` | color | 否 | rgb(0,0,0) | 闪烁边框色 |
| `blinkBorGra` | string | 否 | "" | 边框渐变模式 |
| `blinkBorGraClr` | color | 否 | rgb(255,255,255) | 边框渐变颜色 |
| `isTextClr` | 0\|1 | 否 | 0 | 是否改变文字颜色 |
| `blinkColor` | color | 否 | rgb(0,0,0) | 闪烁文字色 |
| `not` | boolean | 否 | false | 条件取反 |

> 颜色闪烁模式下，至少需要开启一项颜色变化 (`isFullClr`/`isFrameClr`/`isTextClr` 至少一个为 1)

## 相关技能

- [add-feature-visible](../add-feature-visible/) — 显隐特性
- [add-feature-change-color](../add-feature-change-color/) — 变色特性
- [add-feature-rotate](../add-feature-rotate/) — 旋转特性

## 来源

功能来源:
- 2D: `hmiengineweb/packages/d2-preview/src/dynamic-plugin/features/blink.ts`
- 3D: `hmiengineweb/packages/d3-core/src/components/dynamic-feature-component/features/blink-feature.ts`
- 编辑器 2D: `hmiengineweb/editor-web-ui/src/views/editor/d2-feature-config/dynamic/blink/`
- 编辑器 3D: `hmiengineweb/editor-web-ui/src/views/editor/d3-feature-config/dynamic/blink/`
