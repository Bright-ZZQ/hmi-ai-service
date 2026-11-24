# 原生图元生成脚本

`scripts/build_native_document.py` 使用 Python 标准库，把坐标数据编译成完整原生图纸 JSON。目标图纸来自 `--base`，坐标、样式及批次来自 `--scene`，版本相关的字段默认值来自 `--profile`。脚本生成本地文件，之后按 [原生图纸批量载入](native-document.md) 在指定编辑器载入、保存并回读。

## 使用

在技能目录运行。输入底稿取自用户指定图纸的原生快照。

```powershell
python scripts/build_native_document.py --base target-before.json --scene scene.json --output generated.json
python scripts/build_native_document.py --base target-before.json --scene scene.json --until-batch equipment --output through-equipment.json
```

每次从同一份原始底稿重建，输出累积到指定批次的完整图纸。输出中追加本次图元，保留底稿的已有图元、身份字段、图层和配置。底稿含 `pageProperty.latestIndex` 时，该计数增加生成图元数。底稿里已有同一批生成标识时会报错，以免把前批输出当成底稿重复追加。输出路径须与输入文件不同。

从图纸身份、场景 `namespace` 和对象 `key` 生成稳定标识。同一底稿和场景重复生成的文件一致，各累积批次中的同一对象标识一致。增改场景时保留已有对象的 `key`，每批需使用唯一 `key`。

默认 `assets/native-format-v1.json` 对应本次验证的编辑器格式。它包含原生类型映射、公共属性、文本编码、按钮库路径及基础尺寸。文本编码支持 `base64-utf8` 和 `plain`。编辑器版本改变时，先用新版本样件核对，再通过 `--profile another-format.json` 提供适配后的配置。

## 场景数据

以下片段演示输入结构，画幅及图层定义来自底稿。

```json
{
  "schema": "hmi-native-scene/v1",
  "namespace": "cooling-section",
  "layer": "1",
  "styles": {
    "water": {
      "borderColor": {"startColor": "#0001FD"},
      "borderWidth": 2.5,
      "bgStroke": "#0001FD",
      "bgStrokeWidth": 2.5
    },
    "tag": {
      "font": "SimSun,12,-1,5,0,0,0,0,0,0",
      "textColor": {"startColor": "#FFFFFF"}
    }
  },
  "batches": [
    {
      "key": "pipes",
      "objects": [
        {"key": "supply", "kind": "pipeline", "name": "海水供给",
         "points": [[80, 120], [260, 120], [260, 200]], "style": "water"}
      ]
    },
    {
      "key": "tags",
      "objects": [
        {"key": "temperature", "kind": "text", "name": "温度位号",
         "bounds": [290, 190, 90, 18], "text": "TIT-101", "style": "tag"}
      ]
    }
  ]
}
```

| 字段 | 用法 |
| --- | --- |
| `bounds` | `[x, y, width, height]`，适用于 `rectangle`、`ellipse`、`text`、`button`，尺寸为正数。 |
| `points` | 有序点列，适用于 `pipeline` 和 `polygon`。允许水平或竖直管道，箭头可作为多边形或局部坐标模板。 |
| `text` | 文本和按钮输入普通 Unicode 字符串。脚本按该版本格式编码原生文本，同时填写按钮两态文字。可用 `pressed_text` 指定不同的按下文字。 |
| `children` | `group` 的子件数组，可嵌套。脚本自动计算组边框，保留每个子件的原生类型。子件和父组共用当前图纸或模板的坐标系。 |
| `layer` | 图层 ID，必须存在于底稿。对象可覆盖场景或父组的图层。底稿只有一个图层时可省略场景图层。 |
| `z` | 可选叠放顺序。同一层级默认按数组顺序，根对象位于底稿及前批根对象上方。对子件只影响组内顺序。 |
| `style`、`attrs` | `style` 引用一个样式名或样式名列表，随后 `attrs` 覆盖原生属性。同名原生属性整体替换。坐标、标识、类型、文本编码及缩放由脚本生成，不能通过样式覆盖。 |

渐变使用原生 `fillColor` 字典。仪表虚线使用 `bgDash`、`borderStyle` 等样件属性。文字字体、字号及颜色放在样式或 `attrs` 中。按钮字号放在 `dataBind.button.text.font`，直接设置字号并在编辑器核对裁字。

### 复用模板

`templates` 中的每项定义一个根对象。实例通过 `at` 平移整组局部坐标，用 `params` 替换名称、文字等字符串里的 `${参数名}`。参数只做字符串替换。几何尺寸和坐标使用明确的数值。

```json
{
  "templates": {
    "readout": {
      "key": "root",
      "kind": "group",
      "name": "读数 · ${tag}",
      "children": [
        {"key": "value", "kind": "text", "bounds": [0, 0, 60, 18],
         "text": "#.###", "style": "value-text"}
      ]
    }
  },
  "instance_example": {
    "key": "pressure-101",
    "kind": "instance",
    "template": "readout",
    "at": [320, 180],
    "params": {"tag": "PIT-101"}
  }
}
```

将模板放进场景的 `templates`，将实例对象放进批次的 `objects`，并提供引用的样式。重复调用同一模板会得到独立标识和可编辑子件。

## 本次《总流程图》的回归数据

`examples/total-flow/scene.json` 保存四批坐标和样式，含六个局部坐标模板及 67 个模板实例。`base.json` 使用示例编码和空图元底稿，画幅为 1696 × 875。真实目标图纸的身份与配置应取自该目标的快照。

```powershell
python scripts/build_native_document.py --base examples/total-flow/base.json --scene examples/total-flow/scene.json --output "$env:TEMP/total-flow-generated.json"
python -B -X utf8 -m unittest discover -s tests -p "test_build_native_document.py" -v
```

四批累积图元数依次为 125、568、986、1025，最终含 107 个原生按钮。回归期望值取自本次原始四批快照，验证时归一化随机标识与浮点尾差，逐批比较几何、样式、文字、顺序和组合关系的摘要。同时检查两态按钮文字、跨批标识、模板坐标平移、替换目标身份、保留底稿、命令行往返和失败时保留已有输出。

这些检查验证原生文件的生成结果。实际导入时仍需检查编辑器渲染、异步按钮载入及保存回执。
