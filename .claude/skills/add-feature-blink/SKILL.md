---
name: add-feature-blink
description: 为图元添加闪烁动态特性（Blink）。当用户需要"添加闪烁特性""闪烁""闪动""显隐闪烁""颜色闪烁""条件满足时闪烁""报警闪烁"时，优先使用此技能。支持配置触发条件、闪烁方式（显隐闪烁/颜色闪烁）、闪烁频率（慢速/中速/快速），以及在颜色闪烁模式下配置填充色、边框色、文字色及渐变，生成标准 FeatureConfig 数据并写入图元的 store.dynamicDyna 数组中。
---

# 闪烁动态特性生成技能

用于为图符中的图元添加闪烁动态特性（Blink），根据条件控制图元周期性显隐或周期性变色。

注意：在本项目规范中：
- 动态特性存储在图元的 `store.dynamicDyna` 数组中
- 闪烁特性的 `type` 固定为 `GraphDynaBlink`

## 适用范围

当用户出现以下需求时使用此技能：

- 为图元添加闪烁特性
- 根据条件控制图元闪烁/闪动
- 配置显隐闪烁（周期性显示/隐藏）
- 配置颜色闪烁（周期性地在原始颜色和闪烁颜色之间切换）
- 配置报警闪烁效果

## 工作流程

### 1. 参数收集

**必需参数：**
- `targetNode`: 目标图元标识（`node_id` 或 `name`）

**条件参数（与其他动态特性一致）：**
- `leftValue`: 条件左值（模型点对象）
- `sign`: 运算符（0~10）
- `rightValue`: 条件右值

**闪烁核心参数：**
- `[blinkFreq]`: 闪烁频率，默认 `0`
  - `0` = 慢速（1000ms/次）
  - `1` = 中速（500ms/次）
  - `2` = 快速（250ms/次）
- `[blinkMethod]`: 闪烁方式，默认 `0`
  - `0` = 显隐闪烁（周期性地显示/隐藏图元）
  - `1` = 颜色闪烁（周期性地切换颜色）

**颜色闪烁参数（仅当 blinkMethod=1 时需要）：**

*填充色相关：*
- `[isFullClr]`: 是否改变填充色，`1`=是，`0`=否，默认 `0`
- `[blinkBacClr]`: 闪烁填充色，默认 `rgb(0, 0, 0)`
- `[blinkBacGra]`: 填充渐变模式，默认 `""`（无渐变）
- `[blinkBacGraClr]`: 填充渐变颜色，默认 `rgb(255, 255, 255)`

*边框色相关：*
- `[isFrameClr]`: 是否改变边框色，`1`=是，`0`=否，默认 `0`
- `[blinkBorClr]`: 闪烁边框色，默认 `rgb(0, 0, 0)`
- `[blinkBorGra]`: 边框渐变模式，默认 `""`（无渐变）
- `[blinkBorGraClr]`: 边框渐变颜色，默认 `rgb(255, 255, 255)`

*文字色相关：*
- `[isTextClr]`: 是否改变文字颜色，`1`=是，`0`=否，默认 `0`
- `[blinkColor]`: 闪烁文字色，默认 `rgb(0, 0, 0)`

**行为参数：**
- `[not]`: 条件计算结果取反，默认 `false`

### 2. 参数合法性校验

1. `targetNode` 必须能定位到对应图元。
2. `blinkFreq` 必须为 `0`、`1` 或 `2`。
3. `blinkMethod` 必须为 `0`（显隐闪烁）或 `1`（颜色闪烁）。
4. 颜色闪烁模式下，至少需要开启一项颜色变化（`isFullClr`、`isFrameClr`、`isTextClr` 至少有一个为 `1`）。
5. 颜色值格式必须合法（支持 `rgb(r,g,b)`、`rgba(r,g,b,a)`、`#RRGGBB`、`#RGB` 格式）。
6. `isFullClr`、`isFrameClr`、`isTextClr` 必须为 `0` 或 `1`。

### 3. 数据生成规则

#### 3.1 FeatureConfig 结构

```json
{
  "id": "<UUID>",
  "name": "GraphDynaBlink",
  "type": "GraphDynaBlink",
  "conditions": [],
  "not": false,
  "pars": {
    "blinkFreq": { "original": 0, "ref": "" },
    "blinkFreqRef": { "original": "", "ref": "" },
    "blinkMethod": { "original": 0, "ref": "" },
    "blinkMethodRef": { "original": "", "ref": "" },
    "blinkColor": { "original": "rgb(0, 0, 0)", "ref": "" },
    "blinkColorRef": { "original": "", "ref": "" },
    "isFullClr": { "original": 0, "ref": "" },
    "isFullClrRef": { "original": "", "ref": "" },
    "isFrameClr": { "original": 0, "ref": "" },
    "isFrameClrRef": { "original": "", "ref": "" },
    "isTextClr": { "original": 0, "ref": "" },
    "isTextClrRef": { "original": "", "ref": "" },
    "blinkBacClr": { "original": "rgb(0, 0, 0)", "ref": "" },
    "blinkBacClrRef": { "original": "", "ref": "" },
    "blinkBorClr": { "original": "rgb(0, 0, 0)", "ref": "" },
    "blinkBorClrRef": { "original": "", "ref": "" },
    "blinkBacGraClr": { "original": "rgb(255, 255, 255)", "ref": "" },
    "blinkBacGraClrRef": { "original": "", "ref": "" },
    "blinkBorGraClr": { "original": "rgb(255, 255, 255)", "ref": "" },
    "blinkBorGraClrRef": { "original": "", "ref": "" },
    "blinkBacGra": { "original": "", "ref": "" },
    "blinkBorGra": { "original": "", "ref": "" }
  }
}
```

#### 3.2 pars 键命名规则

每个参数由两个键组成：
- `参数名`: 存放 `{ original: 值, ref: "" }`
- `参数名Ref`: 存放引用信息 `{ original: "", ref: "" }`

例如 `blinkFreq` 和 `blinkFreqRef`。

#### 3.3 写入位置

生成的 FeatureConfig 对象追加到目标图元的 `store.dynamicDyna` 数组中。

## 输出格式

```json
{
  "className": "Rect",
  "attrs": { "name": "矩形-100001", "..." },
  "store": {
    "shape": "Rect",
    "_originInfo": { "width": 100, "height": 80 },
    "node_id": "tFOKy37rWGSXdG5rnYkby",
    "dynamicDyna": [
      {
        "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
        "name": "GraphDynaBlink",
        "type": "GraphDynaBlink",
        "conditions": [
          {
            "num": "1",
            "leftValue": { "nodeId": "node123", "tagName": "1,AI_001", "nodeType": "1" },
            "sign": 2,
            "rightValue": { "original": "80", "ref": "" },
            "logicSign": 0,
            "logic": "",
            "conditions": []
          }
        ],
        "not": false,
        "pars": {
          "blinkFreq": { "original": 0, "ref": "" },
          "blinkFreqRef": { "original": "", "ref": "" },
          "blinkMethod": { "original": 0, "ref": "" },
          "blinkMethodRef": { "original": "", "ref": "" },
          "blinkColor": { "original": "rgb(0, 0, 0)", "ref": "" },
          "blinkColorRef": { "original": "", "ref": "" },
          "isFullClr": { "original": 0, "ref": "" },
          "isFullClrRef": { "original": "", "ref": "" },
          "isFrameClr": { "original": 0, "ref": "" },
          "isFrameClrRef": { "original": "", "ref": "" },
          "isTextClr": { "original": 0, "ref": "" },
          "isTextClrRef": { "original": "", "ref": "" },
          "blinkBacClr": { "original": "rgb(0, 0, 0)", "ref": "" },
          "blinkBacClrRef": { "original": "", "ref": "" },
          "blinkBorClr": { "original": "rgb(0, 0, 0)", "ref": "" },
          "blinkBorClrRef": { "original": "", "ref": "" },
          "blinkBacGraClr": { "original": "rgb(255, 255, 255)", "ref": "" },
          "blinkBacGraClrRef": { "original": "", "ref": "" },
          "blinkBorGraClr": { "original": "rgb(255, 255, 255)", "ref": "" },
          "blinkBorGraClrRef": { "original": "", "ref": "" },
          "blinkBacGra": { "original": "", "ref": "" },
          "blinkBorGra": { "original": "", "ref": "" }
        }
      }
    ]
  }
}
```

## 简化输出规则

- 当用户仅选择显隐闪烁（blinkMethod=0）时，颜色相关参数（isFullClr、isFrameClr、isTextClr、blinkBacClr 等）保持默认值即可。
- 当用户选择颜色闪烁（blinkMethod=1）但仅指定某一种颜色变化（如仅填充色），其他颜色变化标志位保持默认值 `0`。

## 使用示例

### 示例 1：条件满足时显隐闪烁

用户请求：
> 当 AI_001 > 100 时，矩形-100001 慢速闪烁（显隐）

执行流程：
1. 定位图元 `矩形-100001`
2. 配置条件：leftValue=AI_001 的模型点, sign=2(>), rightValue=100
3. 设置 blinkMethod=0（显隐闪烁）, blinkFreq=0（慢速）
4. 颜色相关参数使用默认值
5. 生成 FeatureConfig 写入 store.dynamicDyna

### 示例 2：报警颜色闪烁

用户请求：
> 当温度 >= 90 时，矩形快速闪烁红色

执行流程：
1. 定位目标图元
2. 配置条件：sign=3(>=), rightValue=90
3. 设置 blinkMethod=1（颜色闪烁）, blinkFreq=2（快速）
4. 设置 isFullClr=1, blinkBacClr="#FF0000"
5. 生成 FeatureConfig 写入 store.dynamicDyna

### 示例 3：边框闪烁

用户请求：
> 当状态值等于 1 时，文字中速闪烁黄色，边框也闪烁黄色

执行流程：
1. 定位目标图元
2. 配置条件：sign=0(=), rightValue=1
3. 设置 blinkMethod=1, blinkFreq=1（中速）
4. 设置 isTextClr=1, blinkColor="rgb(255, 255, 0)"
5. 设置 isFrameClr=1, blinkBorClr="rgb(255, 255, 0)"
6. 生成 FeatureConfig 写入 store.dynamicDyna

## 注意事项

- 显隐闪烁与显隐特性有优先级关系：当图元已被显隐特性隐藏时（`visibleDynamic=false`），显隐闪烁不会生效
- 颜色闪烁在显隐特性隐藏图元时也会执行（但用户看不到效果）
- 同一图元可添加多个闪烁特性，运行时最后一个满足条件的配置生效
- `store.dynamicDyna` 可同时包含不同类型的动态特性（如显隐+变色+闪烁）
- 闪烁频率 0/1/2 分别对应慢速(1000ms)/中速(500ms)/快速(250ms)周期
