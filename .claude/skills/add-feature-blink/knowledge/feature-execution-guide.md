# 闪烁特性执行原理

来源:
- 2D: `hmiengineweb/packages/d2-preview/src/dynamic-plugin/features/blink.ts`
- 3D: `hmiengineweb/packages/d3-core/src/components/dynamic-feature-component/features/blink-feature.ts`

## 2D BlinkFeature 执行逻辑 (blink.ts)

2D 闪烁引擎使用 `setInterval` 定时器实现周期切换：

```typescript
// 闪烁频率映射
const FREQUENCY = [1000, 500, 250]  // 对应 blinkFreq 0,1,2

// 核心: setInterval 周期性切换闪烁状态
curBlinkingConfig.timerHandlerId = setInterval(() => {
  if (!curBlinkingConfig.state) {
    // 未闪烁 -> 添加闪烁效果
    if (blinkMethod === BLINK_PARAMS.METHOD_OPTIONS.VISIBLE) {
      node.setAttrs({ visible: false })           // 显隐闪烁: 隐藏图元
    } else if (blinkMethod === BLINK_PARAMS.METHOD_OPTIONS.COLOR) {
      // 颜色闪烁: 保存原始颜色，设置闪烁颜色
      curBlinkingConfig.oldColor = node.getAttr('fill')
      curBlinkingConfig.oldStroke = node.getAttr('stroke')
      setTextColor(node, blinkColor)               // 文字闪烁
      setBacColor(node, blinkBacClr, blinkBacGra, blinkBacGraClr, blinkColor)  // 填充闪烁
      setBorColor(node, blinkBorClr, blinkBorGra, blinkBorGraClr, blinkColor)  // 边框闪烁
    }
  } else {
    // 闪烁中 -> 恢复原始样式
    node.setAttrs({ fill: oldColor, stroke: oldStroke, visible: true, ... })
  }
  curBlinkingConfig.state = !curBlinkingConfig.state
}, curBlinkingConfig.blinkFreq)
```

### 显隐优先级规则

- 当图元已被显隐特性隐藏（`visibleDynamic=false`）时，显隐闪烁不会生效
- 颜色闪烁在显隐隐藏状态下仍会执行（但用户不可见）
- 同一图元配置多个闪烁特性时，最后一个满足条件的配置生效

## 3D BlinkFeature 执行逻辑 (blink-feature.ts)

3D 闪烁引擎使用每帧 `update(delta)` 方法实现：

```typescript
// 闪烁周期映射
const BlinkFreqs = {
  0: 1,     // 慢速 - 1秒
  1: 0.5,   // 中速 - 0.5秒
  2: 0.2,   // 快速 - 0.2秒
}

update(delta: number): void {
  if (!this.condition) {
    // 条件不满足：恢复原始状态
    this.entity.visible = true
    this.setColor('#fff')
    return
  }

  this.timer += delta
  if (this.timer >= this.time) {
    this.timer = 0
    if (this.blinkMethod === METHOD_OPTIONS.VISIBLE) {
      this.entity.visible = !this.entity.visible     // 显隐切换
    } else {
      this.color = this.color === this.blinkBacClr ? '#fff' : this.blinkBacClr
      this.setColor(this.color)                       // 颜色切换
    }
  }
}
```

3D 版本仅支持 `blinkFreq`、`blinkMethod`、`blinkBacClr` 三个参数，不支持渐变和边框/文字的颜色单独配置。

## 闪烁频率说明

| blinkFreq | 周期 | 说明 |
|-----------|------|------|
| 0 | 1000ms (1s) | 慢速 |
| 1 | 500ms (0.5s) | 中速 |
| 2 | 250ms (0.25s) | 快速 |

当 `blinkFreq` 引用页面参数时，SCADA 场景支持直接设置闪烁频率值（1/2/4），引擎会计算为 `1000/value` ms。

## 获取有效配置

多个闪烁特性配置时，从后往前遍历 `configList`，返回第一个条件满足的配置：

```typescript
for (let i = configList.length - 1; i >= 0; i--) {
  if (getConditionVal(conditionKey, wsData.conditions)) {
    return configList[i]   // 最后一个满足条件的生效
  }
}
return undefined           // 无满足条件的配置时，取消当前闪烁
```
