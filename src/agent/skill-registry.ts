/**
 * Skill Registry — 工具定义注册表
 *
 * 每个 Skill 对应一个注册条目，包含：
 * - toolDef: 给模型看的 OpenAI function definition
 *
 * 新增 Skill 只需在此文件中添加一个条目，无需修改业务代码。
 *
 * 分组策略：
 * - 'display' → 图纸编辑器工具（create-display-* + assemble_display + add-feature-*）
 * - 'symbol'  → 图符编辑器工具（create-symbol-* + assemble_symbol + add-feature-*）
 */

import type { EditorType, SkillRegistryEntry, ToolDefinition } from '../types'

// ============================================================
// 可复用参数片段 — 渐变色
// ============================================================

/**
 * 渐变模式字符串格式：`"方向 类型"`，例如 "top linear"、"center radial"、"left double_spread"。
 * - 方向：top / bottom / left / right / leftTop / leftBottom / rightTop / rightBottom / center
 * - 类型：linear（线性）/ radial（径向）/ single_spread（单边扩散）/ double_spread（双边扩散）
 * 省略渐变模式则为纯色。
 */
const GRADIENT_HINT = '渐变模式，形如 "top linear"、"center radial"。方向: top/bottom/left/right/leftTop/leftBottom/rightTop/rightBottom/center；类型: linear/radial/single_spread/double_spread。省略则为纯色'

/** 填充 + 边框渐变参数（用于有填充的形状） */
const SHAPE_GRADIENT_PROPS = {
  fillEndColor: { type: 'string', description: '填充渐变终点色（配合 fillGradient 使用），省略则等于起点色' },
  fillGradient: { type: 'string', description: `填充${GRADIENT_HINT}` },
  strokeEndColor: { type: 'string', description: '边框渐变终点色（配合 strokeGradient 使用），省略则等于起点色' },
  strokeGradient: { type: 'string', description: `边框${GRADIENT_HINT}` },
} as const

/** 仅边框渐变参数（用于线条/曲线/管道等无填充形状） */
const STROKE_GRADIENT_PROPS = {
  strokeEndColor: { type: 'string', description: '线条渐变终点色（配合 strokeGradient 使用），省略则等于起点色' },
  strokeGradient: { type: 'string', description: `线条${GRADIENT_HINT}` },
} as const

// ============================================================
// Display 图纸组 — 图元创建工具
// ============================================================

const CREATE_DISPLAY_RECT: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_rect',
      description: `创建图纸矩形/圆角矩形图元。用于在图纸上添加矩形（Rectangle）或圆角矩形（RoundRect）。
返回完整的 elements 格式 JSON 对象，可直接放入图纸的 elements 数组。`,
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: '宽度(px)' },
          height: { type: 'number', description: '高度(px)' },
          x: { type: 'number', description: '左上角 x 坐标(px)' },
          y: { type: 'number', description: '左上角 y 坐标(px)' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          borderWidth: { type: 'number', description: '边框宽度，默认 1' },
          cornerRadius: { type: 'number', description: '圆角大小(px)，指定后类型变为 RoundRect' },
          ...SHAPE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['width', 'height', 'x', 'y'],
      },
    },
  },
}

const CREATE_DISPLAY_ELLIPSE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_ellipse',
      description: `创建图纸椭圆图元。用于在图纸上添加椭圆（Ellipse）。
椭圆通过外接矩形的左上角坐标和宽高来定位。返回完整的 elements 格式 JSON 对象。`,
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: '宽度(px)，椭圆外接矩形宽度' },
          height: { type: 'number', description: '高度(px)，椭圆外接矩形高度' },
          x: { type: 'number', description: '外接矩形左上角 x 坐标(px)' },
          y: { type: 'number', description: '外接矩形左上角 y 坐标(px)' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          borderWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['width', 'height', 'x', 'y'],
      },
    },
  },
}

const CREATE_DISPLAY_TEXT: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_text',
      description: `创建图纸文本图元。用于在图纸上添加文字内容。文本内容会自动进行 base64 编码存储。
**重要**：图纸背景默认为白色(#ffffff)，请确保文本颜色(fill)在白色背景上清晰可见。避免使用白色、浅灰(#D8D8D8)、浅黄等浅色。推荐使用 #000000(黑)、#333333(深灰)、#1a1a2e(深蓝黑) 等深色。返回完整的 elements 格式 JSON 对象。`,
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '文本原始内容（直接传入原始文字即可，系统会自动进行 base64 编码后存储）' },
          x: { type: 'number', description: '左上角 x 坐标(px)' },
          y: { type: 'number', description: '左上角 y 坐标(px)' },
          width: { type: 'number', description: '文本框宽度(px)，默认 200' },
          height: { type: 'number', description: '文本框高度(px)，默认 40' },
          fontSize: { type: 'number', description: '字体大小，默认 14' },
          fontFamily: { type: 'string', description: '字体，默认 "Microsoft YaHei"' },
          fill: { type: 'string', description: '文字颜色，默认 #000000。注意：图纸背景为白色，请选择深色以保证可见性' },
          bold: { type: 'boolean', description: '是否加粗，默认 false' },
          italic: { type: 'boolean', description: '是否斜体，默认 false' },
          underline: { type: 'boolean', description: '是否下划线，默认 false' },
          textAlign: { type: 'string', enum: ['left', 'center', 'right'], description: '水平对齐，默认 left' },
          textBaseline: { type: 'string', enum: ['top', 'middle', 'bottom'], description: '垂直对齐，默认 top' },
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['text', 'x', 'y'],
      },
    },
  },
}

const CREATE_DISPLAY_LINE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_line',
      description: `创建图纸直线图元。用于在图纸上绘制直线段。返回完整的 elements 格式 JSON 对象。`,
      parameters: {
        type: 'object',
        properties: {
          x1: { type: 'number', description: '起点 x 坐标(px)' },
          y1: { type: 'number', description: '起点 y 坐标(px)' },
          x2: { type: 'number', description: '终点 x 坐标(px)' },
          y2: { type: 'number', description: '终点 y 坐标(px)' },
          stroke: { type: 'string', description: '线条颜色，默认 #979797' },
          strokeWidth: { type: 'number', description: '线条宽度，默认 1' },
          lineStyle: { type: 'string', enum: ['solid', 'dashed', 'dotted'], description: '线型，默认 solid' },
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['x1', 'y1', 'x2', 'y2'],
      },
    },
  },
}

const CREATE_DISPLAY_POLYGON: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_polygon',
      description: `创建图纸多边形图元。通过顶点坐标数组定义多边形形状。返回完整的 elements 格式 JSON 对象。`,
      parameters: {
        type: 'object',
        properties: {
          points: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                x: { type: 'number', description: '顶点 x 坐标' },
                y: { type: 'number', description: '顶点 y 坐标' },
              },
              required: ['x', 'y'],
            },
            description: '多边形顶点数组',
          },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          borderWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['points'],
      },
    },
  },
}

const CREATE_DISPLAY_PICTURE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_picture',
      description: `创建图纸图片图元。用于在图纸上放置图片资源。返回完整的 elements 格式 JSON 对象。`,
      parameters: {
        type: 'object',
        properties: {
          src: { type: 'string', description: '图片资源路径' },
          x: { type: 'number', description: '左上角 x 坐标(px)' },
          y: { type: 'number', description: '左上角 y 坐标(px)' },
          width: { type: 'number', description: '显示宽度(px)' },
          height: { type: 'number', description: '显示高度(px)' },
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['src', 'x', 'y', 'width', 'height'],
      },
    },
  },
}

const CREATE_DISPLAY_PIE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_pie',
      description: `创建图纸饼图/扇形图元。通过圆心、半径和起止角度定义扇形。返回完整的 elements 格式 JSON 对象。`,
      parameters: {
        type: 'object',
        properties: {
          cx: { type: 'number', description: '圆心 x 坐标(px)' },
          cy: { type: 'number', description: '圆心 y 坐标(px)' },
          radius: { type: 'number', description: '半径(px)' },
          startAngle: { type: 'number', description: '起始角度(度)' },
          endAngle: { type: 'number', description: '结束角度(度)' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          borderWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['cx', 'cy', 'radius', 'startAngle', 'endAngle'],
      },
    },
  },
}

// ============================================================
// 多轮编辑工具（Display / Symbol 共用同一工具名）
// ============================================================

function createUpdateElementSkill(group: EditorType): SkillRegistryEntry {
  return {
    group,
    toolDef: {
      type: 'function',
      function: {
        name: 'update_element',
        description: `修改当前图纸/图符中已有图元。target 可传图元的 id、code、key 或 name。
changesJson 必须是 JSON 对象字符串，服务端会递归合并对象、整体替换数组，并保留未提及字段。
例如：target="矩形", changesJson="{\\"store\\":{\\"fill\\":\\"#4488FF\\"}}"。修改完成后必须调用 assemble_display 或 assemble_symbol。`,
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: '目标图元的 id、code、key 或 name' },
            changesJson: { type: 'string', description: '需要递归合并到目标图元的 JSON 对象字符串' },
          },
          required: ['target', 'changesJson'],
        },
      },
    },
  }
}

function createDeleteElementSkill(group: EditorType): SkillRegistryEntry {
  return {
    group,
    toolDef: {
      type: 'function',
      function: {
        name: 'delete_element',
        description: `删除当前图纸/图符中的已有图元。target 可传图元的 id、code、key 或 name。删除完成后必须调用 assemble_display 或 assemble_symbol。`,
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: '目标图元的 id、code、key 或 name' },
          },
          required: ['target'],
        },
      },
    },
  }
}

const UPDATE_DISPLAY_ELEMENT = createUpdateElementSkill('display')
const DELETE_DISPLAY_ELEMENT = createDeleteElementSkill('display')
const UPDATE_SYMBOL_ELEMENT = createUpdateElementSkill('symbol')
const DELETE_SYMBOL_ELEMENT = createDeleteElementSkill('symbol')

function createGenerationPlanSkill(group: EditorType): SkillRegistryEntry {
  return {
    group,
    toolDef: {
      type: 'function',
      function: {
        name: 'declare_generation_plan',
        description: `声明本次生成或修改的验收计划，必须在创建、修改或删除图元前调用。
服务端会在最终组装时对照计划校验实际结果，避免遗漏数量约束或动态特性。
计划只描述可验证结果，不传递图元 JSON。`,
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '对用户需求的简短复述' },
            expectedElementCount: { type: 'number', description: '最终 elements/comps 扁平数组的准确数量；仅当用户明确要求图元数量或基于当前 JSON 可准确计算时填写，否则省略' },
            requiredFeatureTools: {
              type: 'array',
              items: { type: 'string' },
              description: '必须成功执行的 add_feature_* 工具名列表；每个条目代表一次特性应用，重复需求需重复填写，无特性则传空数组',
            },
            distinctFeatureTargets: { type: 'boolean', description: 'requiredFeatureTools 中各次特性应用是否必须绑定到互不相同的图元' },
          },
          required: ['summary', 'requiredFeatureTools', 'distinctFeatureTargets'],
        },
      },
    },
  }
}

const DECLARE_DISPLAY_GENERATION_PLAN = createGenerationPlanSkill('display')
const DECLARE_SYMBOL_GENERATION_PLAN = createGenerationPlanSkill('symbol')

// ============================================================
// Display 图纸组 — 弧/弦/曲线/管道/折线/正多边形
// ============================================================

const CREATE_DISPLAY_ARC: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_arc',
      description: `创建图纸弧图元（Arc）。通过包围盒和起止角度定义弧线。弧默认透明填充，仅显示描边。
返回完整的 elements 格式 JSON 对象，type 为 "Arc"。`,
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: '包围盒宽度(px)，= 2 × radiusX' },
          height: { type: 'number', description: '包围盒高度(px)，= 2 × radiusY' },
          startAngle: { type: 'number', description: '起始角度(度)，如 0' },
          endAngle: { type: 'number', description: '结束角度(度)，如 90' },
          x: { type: 'number', description: '包围盒左上角 x 坐标(px)' },
          y: { type: 'number', description: '包围盒左上角 y 坐标(px)' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D800（透明）' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          borderWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['width', 'height', 'startAngle', 'endAngle', 'x', 'y'],
      },
    },
  },
}

const CREATE_DISPLAY_CHORD: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_chord',
      description: `创建图纸弦图元（Chord）。弦是闭合的弧，含 closePath:true 字段，填充色不透明。
与弧的区别：弦用直线连接弧的两端点形成闭合区域。返回完整的 elements 格式 JSON 对象，type 为 "Chord"。`,
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: '包围盒宽度(px)' },
          height: { type: 'number', description: '包围盒高度(px)' },
          startAngle: { type: 'number', description: '起始角度(度)' },
          endAngle: { type: 'number', description: '结束角度(度)' },
          x: { type: 'number', description: '包围盒左上角 x 坐标(px)' },
          y: { type: 'number', description: '包围盒左上角 y 坐标(px)' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          borderWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['width', 'height', 'startAngle', 'endAngle', 'x', 'y'],
      },
    },
  },
}

const CREATE_DISPLAY_CURVE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_curve',
      description: `创建图纸曲线图元（Curve）。支持直线段与贝塞尔曲线段混合，可绘制平滑的复杂曲线路径。
通过顶点数组 polygon 和段类型数组 segments 定义路径。segments 编码：
- 1=moveTo（起点，首点隐含）
- 2=lineTo（直线段）
- 3=quaraticCurveTo（二阶贝塞尔，每段需 1 个控制点）
- 4=bezierCurveTo（三阶贝塞尔，每段需 2 个控制点，最平滑）
贝塞尔控制点按顺序放入 controlPoints 扁平数组 [cx1,cy1,cx2,cy2,...]。
例如画一条平滑 S 曲线：polygon=[{x:0,y:100},{x:200,y:100}], segments=[4], controlPoints=[60,0,140,200]。
曲线无填充，仅描边。返回完整的 elements 格式 JSON 对象，type 为 "Curve"。`,
      parameters: {
        type: 'object',
        properties: {
          polygon: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                x: { type: 'number', description: '顶点 x 坐标' },
                y: { type: 'number', description: '顶点 y 坐标' },
              },
              required: ['x', 'y'],
            },
            description: '路径顶点坐标数组 [{x,y}, ...]',
          },
          segments: {
            type: 'array',
            items: { type: 'number' },
            description: '段类型数组，长度 = polygon长度 - 1。1=直线, 2=直线段, 3=二阶贝塞尔, 4=三阶贝塞尔',
          },
          controlPoints: {
            type: 'array',
            items: { type: 'number' },
            description: '贝塞尔控制点扁平数组 [cx1,cy1,cx2,cy2,...]。二阶每段 1 个点(2 值)，三阶每段 2 个点(4 值)，纯直线时省略',
          },
          stroke: { type: 'string', description: '线条颜色，默认 #979797' },
          borderWidth: { type: 'number', description: '线宽，默认 1' },
          ...STROKE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['polygon', 'segments'],
      },
    },
  },
}

const CREATE_DISPLAY_PIPE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_pipe',
      description: `创建图纸管道图元（Pipeline）。通过路径顶点数组定义管道走向。
含 lineCap（端点样式）和 lineJoin（连接点样式）字段。返回完整的 elements 格式 JSON 对象，type 为 "Pipeline"。`,
      parameters: {
        type: 'object',
        properties: {
          polygon: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                x: { type: 'number', description: '路径顶点 x 坐标' },
                y: { type: 'number', description: '路径顶点 y 坐标' },
              },
              required: ['x', 'y'],
            },
            description: '管道路径顶点数组 [{x,y}, ...]',
          },
          stroke: { type: 'string', description: '管道颜色，默认 #929292' },
          borderWidth: { type: 'number', description: '管径宽度，默认 10' },
          borderStyle: { type: 'number', description: '线型，1=实线（默认）' },
          lineCap: { type: 'string', enum: ['butt', 'round', 'square'], description: '端点样式，默认 butt' },
          lineJoin: { type: 'string', enum: ['round', 'bevel', 'miter'], description: '连接点样式，默认 round' },
          ...STROKE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['polygon'],
      },
    },
  },
}

const CREATE_DISPLAY_POLYLINE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_polyline',
      description: `创建图纸折线图元（Polyline）。通过顶点坐标数组定义折线形状，close 固定为 false。
与多边形（Polygon）的区别是折线不闭合。返回完整的 elements 格式 JSON 对象，type 为 "Polyline"。`,
      parameters: {
        type: 'object',
        properties: {
          polygon: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                x: { type: 'number', description: '顶点 x 坐标' },
                y: { type: 'number', description: '顶点 y 坐标' },
              },
              required: ['x', 'y'],
            },
            description: '折线顶点坐标数组 [{x1,y1}, {x2,y2}, ...]',
          },
          stroke: { type: 'string', description: '线条颜色，默认 #979797' },
          borderWidth: { type: 'number', description: '线宽，默认 1' },
          ...STROKE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['polygon'],
      },
    },
  },
}

const CREATE_DISPLAY_REGULAR_POLYGON: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_regular_polygon',
      description: `创建图纸正多边形图元（RegularPolygon）。通过边数和外接圆半径定义。
width 和 height = radius × 2。如 sides=3 为等边三角形，sides=6 为正六边形。
返回完整的 elements 格式 JSON 对象，type 为 "RegularPolygon"。`,
      parameters: {
        type: 'object',
        properties: {
          sides: { type: 'number', description: '边数（如 3=三角形, 6=六边形）' },
          radius: { type: 'number', description: '外接圆半径(px)' },
          x: { type: 'number', description: '包围盒左上角 x 坐标(px)' },
          y: { type: 'number', description: '包围盒左上角 y 坐标(px)' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          borderWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['sides', 'radius', 'x', 'y'],
      },
    },
  },
}

// ============================================================
// Display 图纸组 — 复合组件（布局引擎驱动，坐标自动计算）
// ============================================================

const CREATE_METRIC_PANEL: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_metric_panel',
      description: `创建**指标数据面板**（标题 + 多行"标签/数值/状态灯"）。这是展示监控数据的首选工具。
**重要**：内部每一行的坐标由布局引擎自动、确定性计算，保证行间不重叠、不越界、对齐整齐。
你**只需给出数据**（标题 + rows），**不要**再用多个 create_display_text 手工拼表格。
一次调用产出整块面板（背景 + 所有文本 + 状态灯）。`,
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '面板左上角 x 坐标(px)' },
          y: { type: 'number', description: '面板左上角 y 坐标(px)' },
          width: { type: 'number', description: '面板宽度(px)' },
          height: { type: 'number', description: '面板高度(px)，省略则按行数自适应' },
          title: { type: 'string', description: '面板标题' },
          rows: {
            type: 'array',
            description: '指标行数组，每项 {label, value, status?}',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '指标名称（左列）' },
                value: { type: 'string', description: '指标数值（右列，含单位）' },
                status: { type: 'string', enum: ['normal', 'warning', 'alarm'], description: '状态灯颜色：normal绿/warning橙/alarm红，省略则不显示状态灯' },
              },
              required: ['label', 'value'],
            },
          },
          titleColor: { type: 'string', description: '标题颜色，默认 #00d4ff' },
          labelColor: { type: 'string', description: '标签颜色，默认 #aabbcc' },
          valueColor: { type: 'string', description: '数值颜色，默认 #00ff88' },
          panelFill: { type: 'string', description: '面板背景色，默认 #101830' },
          panelStroke: { type: 'string', description: '面板边框色，默认 #1e3a50' },
          valueWidth: { type: 'number', description: '数值列宽度，默认 120' },
        },
        required: ['x', 'y', 'width', 'title', 'rows'],
      },
    },
  },
}

const CREATE_EQUIPMENT: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_equipment',
      description: `创建**工艺设备图符**（比例固定、形状可辨识）。用于绘制储罐、塔器、炉子等设备。
**重要**：设备由多个原语按正确比例自动组合，**不要**自己用 create_display_rect/ellipse 拼设备。
一次调用产出整个设备（主体 + 封头/锥底 + 内部结构）。`,
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['tank', 'tower', 'furnace', 'column'], description: '设备类型：tank储罐/tower吸收塔转化塔(带填料层)/furnace焚烧炉沸腾炉(带火焰锥底)/column精馏催化塔柱(带塔板)' },
          x: { type: 'number', description: '设备包围盒左上角 x 坐标(px)' },
          y: { type: 'number', description: '设备包围盒左上角 y 坐标(px)' },
          width: { type: 'number', description: '设备宽度(px)' },
          height: { type: 'number', description: '设备高度(px)' },
          fill: { type: 'string', description: '主体填充色，默认 #1a2035' },
          stroke: { type: 'string', description: '主体边框色，默认 #3a6080' },
          name: { type: 'string', description: '名称前缀，默认按类型' },
        },
        required: ['kind', 'x', 'y', 'width', 'height'],
      },
    },
  },
}

// ============================================================
// Display 图纸组 — 图纸组装工具
// ============================================================

const ASSEMBLE_DISPLAY: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'assemble_display',
      description: `将所有图纸图元组装为完整的图纸 document JSON。
调用此工具前，必须先创建所有需要的图元（通过 create_display_* 系列工具）。
此工具会：自动重排 zIndex、计算 latestIndex、生成唯一 code、添加当前时间戳。
**重要**：elementsData 参数无需手动传递，系统会自动使用你之前创建的所有图元。仅在需要手动指定部分图元时才传入。`,
      parameters: {
        type: 'object',
        properties: {
          pageName: { type: 'string', description: '图纸名称' },
          elementsData: {
            type: 'array',
            description: '之前 create_display_* 工具返回的图元 JSON 对象数组',
          },
          pageWidth: { type: 'number', description: '画布宽度(px)，默认 1880。当图元较多、按合理间距排布会越界或重叠时，必须调大此值（如 2400、2560）以容纳全部内容，避免拥挤重叠' },
          pageHeight: { type: 'number', description: '画布高度(px)，默认 962。当纵向内容放不下时，必须调大此值（如 1350、1440）以容纳全部内容，避免重叠' },
          bgColor: { type: 'string', description: '背景色，默认 #ffffff' },
          author: { type: 'string', description: '作者，默认空' },
          company: { type: 'string', description: '公司，默认空' },
          desc: { type: 'string', description: '描述，默认空' },
        },
        required: ['pageName'],
      },
    },
  },
}

// ============================================================
// Display 图纸组 — 动态特性工具
// ============================================================

const FEATURE_CONDITION_PROPS = {
  conditionSpecifiedByUser: {
    type: 'boolean',
    description: '仅当用户原始请求明确指定了触发条件时设为 true；禁止根据场景自行推断或补充条件，默认 false',
  },
  dataSourceKey: {
    type: 'string',
    description: '用户明确指定的条件数据源键名；conditionSpecifiedByUser 不为 true 时禁止传入',
  },
  conditionOperator: {
    type: 'number',
    description: '用户明确指定的比较运算符：0=, 1=!=, 2=>, 3=<, 4=>=, 5=<=, 6=包含, 7=不包含, 8=在之间, 9=不在之间, 10=位运算',
  },
  conditionValue: {
    type: 'string',
    description: '用户明确指定的条件比较值；不得自行生成默认值',
  },
} as const

const ADD_FEATURE_VISIBLE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_visible',
      description: `为图元添加显隐动态特性。使图元可以根据数据源的值来控制显示或隐藏。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称' },
          dataSourceKey: { type: 'string', description: '数据源键名' },
          visibleWhen: { type: 'string', enum: ['>0', '==1', '==true', '!=0'], description: '显示条件' },
        },
        required: ['elementName'],
      },
    },
  },
}

const ADD_FEATURE_WRITE_VALUE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_write_value',
      description: `为图元添加数值写入动态特性。使图元可以根据数据源动态更新显示的数值。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称' },
          dataSourceKey: { type: 'string', description: '数据源键名' },
          format: { type: 'string', description: '数值格式，如 "0.00"' },
        },
        required: ['elementName'],
      },
    },
  },
}

const ADD_FEATURE_CHANGE_COLOR: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_change_color',
      description: `为图元添加变色动态特性（ChangeColor）。根据条件改变图元的填充色、边框色、文字颜色。
支持触发条件、渐变样式，以及条件失效时的恢复颜色。存储到 store.dynamicDyna，type 为 GraphDynaChangeClr。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          isFullClr: { type: 'number', description: '是否改变填充色，1=是，0=否，默认 0' },
          chBacClr: { type: 'string', description: '条件满足时的填充色（支持 rgb/rgba/hex），默认 rgb(0,0,0)' },
          chBacGra: { type: 'string', description: '填充渐变模式，默认空（无渐变）' },
          chBacGraClr: { type: 'string', description: '填充渐变颜色，默认 rgb(0,0,0)' },
          isFrameClr: { type: 'number', description: '是否改变边框色，1=是，0=否，默认 0' },
          chBorClr: { type: 'string', description: '条件满足时的边框色，默认 rgb(0,0,0)' },
          chBorGra: { type: 'string', description: '边框渐变模式，默认空（无渐变）' },
          chBorGraClr: { type: 'string', description: '边框渐变颜色，默认 rgb(0,0,0)' },
          isTextClr: { type: 'number', description: '是否改变文字颜色，1=是，0=否，默认 0' },
          chClr: { type: 'string', description: '条件满足时的文字色，默认 rgb(0,0,0)' },
          isRecover: { type: 'number', description: '条件不满足时是否恢复颜色，1=是，0=否，默认 0' },
          recBacClr: { type: 'string', description: '恢复填充色，默认 rgb(0,0,0)' },
          recBacGra: { type: 'string', description: '恢复填充渐变模式' },
          recBacGraClr: { type: 'string', description: '恢复填充渐变颜色' },
          recBorClr: { type: 'string', description: '恢复边框色，默认 rgb(0,0,0)' },
          recBorGra: { type: 'string', description: '恢复边框渐变模式' },
          recBorGraClr: { type: 'string', description: '恢复边框渐变颜色' },
          recClr: { type: 'string', description: '恢复文字色，默认 rgb(0,0,0)' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

const ADD_FEATURE_BLINK: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_blink',
      description: `为图元添加闪烁动态特性（Blink）。支持显隐闪烁和颜色闪烁，可配置慢/中/快三档频率。
    有不透明填充色的图元默认使用显隐闪烁，效果更明显；仅当用户明确要求“颜色闪烁”时才设置 forceColorBlink=true。存储到 store.dynamicDyna，type 为 GraphDynaBlink。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id、id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          blinkFreq: { type: 'number', enum: [0, 1, 2], description: '闪烁频率：0=慢(1000ms)，1=中(500ms)，2=快(250ms)，默认 0' },
          blinkMethod: { type: 'number', enum: [0, 1], description: '闪烁方式：0=显隐闪烁，1=颜色闪烁，默认 0；有填充色的图元优先使用 0' },
          forceColorBlink: { type: 'boolean', description: '仅当用户明确要求“颜色闪烁”时设为 true；否则有填充色的图元会自动改用显隐闪烁' },
          blinkColor: { type: 'string', description: '颜色闪烁的通用颜色，默认 rgb(0, 0, 0)' },
          isFullClr: { type: 'number', description: '颜色闪烁时是否改变填充色：1=是，0=否，默认 0' },
          isFrameClr: { type: 'number', description: '颜色闪烁时是否改变边框色：1=是，0=否，默认 0' },
          isTextClr: { type: 'number', description: '颜色闪烁时是否改变文字色：1=是，0=否，默认 0' },
          blinkBacClr: { type: 'string', description: '闪烁填充色，必须与图元当前背景色有明显对比；对比度低于 3:1 时服务端自动选择黑/白对比色' },
          blinkBorClr: { type: 'string', description: '闪烁边框色，默认 rgb(0, 0, 0)' },
          blinkBacGra: { type: 'string', description: '闪烁填充渐变模式，默认空' },
          blinkBorGra: { type: 'string', description: '闪烁边框渐变模式，默认空' },
          blinkBacGraClr: { type: 'string', description: '闪烁填充渐变色，默认 rgb(255, 255, 255)' },
          blinkBorGraClr: { type: 'string', description: '闪烁边框渐变色，默认 rgb(255, 255, 255)' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

const ADD_FEATURE_MOVE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_move',
      description: `为图元添加移动动态特性（Move）。支持自动移动（固定速度/距离）和参数驱动移动（将数据源值映射为位移）。
可分别配置水平/垂直方向。存储到 store.dynamicDyna，type 为 GraphDynaMove。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          moveMode: { type: 'number', description: '移动方式：0=自动移动（固定速度），1=参数驱动移动（数据源映射），默认 0' },
          reBack: { type: 'number', description: '是否往返移动：0=单向，1=往返（到达终点后反向），默认 0' },
          hMove: { type: 'number', description: '是否开启水平移动：0=否，1=是，默认 1' },
          vMove: { type: 'number', description: '是否开启垂直移动：0=否，1=是，默认 1' },
          hDistance: { type: 'number', description: '水平移动距离(px)，默认 0' },
          hSpeed: { type: 'number', description: '自动模式下水平移动速度(px/s，必须为正数)，默认 0' },
          vDistance: { type: 'number', description: '垂直移动距离(px)，默认 0' },
          vSpeed: { type: 'number', description: '自动模式下垂直移动速度(px/s，必须为正数)，默认 0' },
          hDataSourceKey: { type: 'string', description: '参数模式下水平方向数据源键名' },
          hUseDB: { type: 'number', description: '水平使用数据库量程：0=否，1=是，默认 0' },
          hMu: { type: 'number', description: '水平量程上限（hUseDB=0 时），默认 100' },
          hMd: { type: 'number', description: '水平量程下限（hUseDB=0 时），默认 0' },
          hMuDataSourceKey: { type: 'string', description: '水平数据库量程上限数据源（hUseDB=1 时）' },
          hMdDataSourceKey: { type: 'string', description: '水平数据库量程下限数据源（hUseDB=1 时）' },
          vDataSourceKey: { type: 'string', description: '参数模式下垂直方向数据源键名' },
          vUseDB: { type: 'number', description: '垂直使用数据库量程：0=否，1=是，默认 0' },
          vMu: { type: 'number', description: '垂直量程上限（vUseDB=0 时），默认 100' },
          vMd: { type: 'number', description: '垂直量程下限（vUseDB=0 时），默认 0' },
          vMuDataSourceKey: { type: 'string', description: '垂直数据库量程上限数据源（vUseDB=1 时）' },
          vMdDataSourceKey: { type: 'string', description: '垂直数据库量程下限数据源（vUseDB=1 时）' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

const ADD_FEATURE_OPEN_PAGE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_open_page',
      description: `为图元添加打开页面交互特性（OpenPage）。支持通过鼠标事件（单击/双击等）触发页面跳转或弹窗打开。
使用 act 字段定义触发事件。存储到 store.interactiveDyna，type 为 GraphTriggerOpenPage。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          pageName: { type: 'string', description: '目标页面名称' },
          pageCode: { type: 'string', description: '目标页面编码' },
          pagePath: { type: 'string', description: '目标页面路径' },
          act: { type: 'number', description: '触发事件：2=左键按下，3=左键抬起，4=右键按下，5=右键抬起，6=双击，14=鼠标进入，15=鼠标离开，17=单击，默认 17' },
          pageType: { type: 'number', description: '页面类型：0=图纸，1=网页，2=场景，3=预设面板，默认 0' },
          popType: { type: 'number', description: '打开方式：0=页面内，1=弹窗，2=新窗口，默认 0' },
          windowPos: { type: 'number', description: '弹窗位置：0=鼠标，1=左上，2=右下，3=自定义，4=左下，5=右上，6=居中，默认 0' },
          posX: { type: 'number', description: '自定义位置 X（windowPos=3 时），默认 0' },
          posY: { type: 'number', description: '自定义位置 Y（windowPos=3 时），默认 0' },
          customSize: { type: 'number', description: '弹窗大小模式：0=自适应内容，1=自定义，默认 0' },
          width: { type: 'number', description: '弹窗宽度（customSize=1 时），默认 400' },
          height: { type: 'number', description: '弹窗高度（customSize=1 时），默认 300' },
          title: { type: 'string', description: '弹窗标题，默认空' },
          defaultFullscreen: { type: 'number', description: '是否默认全屏：0=否，1=是，默认 0' },
          titleTextClr: { type: 'string', description: '标题文字颜色' },
          titleBgClr: { type: 'string', description: '标题背景色' },
          borderClr: { type: 'string', description: '边框颜色' },
          webPath: { type: 'string', description: '网页 URL（pageType=1 时必需）' },
          checkEnable: { type: 'number', description: '是否启用操作使能检查：0=否，1=是，默认 0' },
          checkDataSourceKey: { type: 'string', description: '操作使能数据源键名' },
        },
        required: ['elementName', 'pageName'],
      },
    },
  },
}

const ADD_FEATURE_ROTATE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_rotate',
      description: `为图元添加旋转动态特性（Rotate）。同时支持图符图元和图纸图元。支持自动旋转（固定角度/速度）和参数驱动旋转（将数据源值映射为角度）。
可配置旋转中心、条件控制等。存储到 store.dynamicDyna，type 为 GraphDynaRotate。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          rotMode: { type: 'number', description: '旋转方式：0=自动旋转（固定角度），1=参数驱动旋转（数据源映射），默认 0' },
          rotCenter: { type: 'number', description: '旋转中心：0=偏移中心，1=左上角，2=左下角，3=右上角，4=右下角，5=中心，6=顶部中心，7=底部中心，8=左侧中心，9=右侧中心，默认 5' },
          rotAngle: { type: 'number', description: '自动模式下每秒旋转角度（度/秒），范围 -360~360，默认 5；例如 90 表示每秒旋转 90 度' },
          rotCond: { type: 'number', description: '是否开启条件控制旋转：0=否，1=是，默认 0' },
          condTrue: { type: 'number', description: '条件满足时行为：0=旋转，1=停止，2=保持，默认 0' },
          condFalse: { type: 'number', description: '条件不满足时行为：0=旋转，1=停止，2=保持，默认 1' },
          dsDataSourceKey: { type: 'string', description: '参数模式下数据源键名' },
          maxAngle: { type: 'number', description: '参数模式下最大旋转角度，范围 -360~360，默认 360' },
          minAngle: { type: 'number', description: '参数模式下最小旋转角度，范围 -360~360，默认 0' },
          useDB: { type: 'number', description: '是否使用数据库量程：0=否，1=是，默认 0' },
          mu: { type: 'number', description: '量程上限（useDB=0 时），默认 100' },
          md: { type: 'number', description: '量程下限（useDB=0 时），默认 0' },
          muDataSourceKey: { type: 'string', description: '数据库量程上限数据源（useDB=1 时）' },
          mdDataSourceKey: { type: 'string', description: '数据库量程下限数据源（useDB=1 时）' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

// 旋转特性同时适用于图纸元素和图符 comp；两个编辑器需要各自注册一次。
const ADD_FEATURE_ROTATE_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_ROTATE,
  group: 'symbol',
}

const ADD_FEATURE_MOVE_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_MOVE,
  group: 'symbol',
}

const ADD_FEATURE_BLINK_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_BLINK,
  group: 'symbol',
}

const ADD_FEATURE_CHANGE_COLOR_SYMBOL: SkillRegistryEntry = {
  ...ADD_FEATURE_CHANGE_COLOR,
  group: 'symbol',
}

// ============================================================
// Symbol 图符组 — 图元创建工具
// ============================================================

const CREATE_SYMBOL_RECT: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_symbol_rect',
      description: `创建图符矩形/圆角矩形图元。用于在图符中生成 Rectangle 或 RoundRect 图元数据。
指定 cornerRadius 时 store.shape 为 "RoundRect"，否则为 "Rectangle"。返回完整的 comps 格式 JSON 对象，className 为 "Rect"。`,
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: '图元宽度(px)' },
          height: { type: 'number', description: '图元高度(px)' },
          x: { type: 'number', description: '左上角 x 坐标(px)，默认 0' },
          y: { type: 'number', description: '左上角 y 坐标(px)，默认 0' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          cornerRadius: { type: 'number', description: '圆角半径(px)，不指定时 shape=Rectangle，指定后 shape=RoundRect' },
          ...SHAPE_GRADIENT_PROPS,
          shadowOpacity: { type: 'number', description: '阴影不透明度，默认 0' },
          shadowBlur: { type: 'number', description: '阴影模糊半径，默认 6' },
          shadowOffsetX: { type: 'number', description: '阴影 x 偏移，默认 3' },
          shadowOffsetY: { type: 'number', description: '阴影 y 偏移，默认 3' },
          shadowColor: { type: 'string', description: '阴影颜色，默认 #1ABC9C' },
          draggable: { type: 'boolean', description: '是否可拖拽，默认 true' },
          rotation: { type: 'number', description: '旋转角度(度)，范围 0~360，默认 0' },
        },
        required: ['width', 'height'],
      },
    },
  },
}

const CREATE_SYMBOL_ELLIPSE: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_symbol_ellipse',
      description: `创建图符椭圆图元（Ellipse）。自动根据 width/height 计算 radiusX/radiusY。
返回完整的 comps 格式 JSON 对象，className 为 "Ellipse"，store.shape 为 "Ellipse"。`,
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: '包围盒宽度(px)，radiusX = width/2' },
          height: { type: 'number', description: '包围盒高度(px)，radiusY = height/2' },
          x: { type: 'number', description: '圆心 x 坐标(px)，默认 radiusX' },
          y: { type: 'number', description: '圆心 y 坐标(px)，默认 radiusY' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          strokeWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          shadowOpacity: { type: 'number', description: '阴影不透明度，默认 0' },
          shadowBlur: { type: 'number', description: '阴影模糊半径，默认 6' },
          shadowOffsetX: { type: 'number', description: '阴影 x 偏移，默认 3' },
          shadowOffsetY: { type: 'number', description: '阴影 y 偏移，默认 3' },
          shadowColor: { type: 'string', description: '阴影颜色，默认 #1ABC9C' },
          draggable: { type: 'boolean', description: '是否可拖拽，默认 true' },
          rotation: { type: 'number', description: '旋转角度(度)，范围 0~360，默认 0' },
        },
        required: ['width', 'height'],
      },
    },
  },
}

const CREATE_SYMBOL_TEXT: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_symbol_text',
      description: `创建图符文字图元（Text）。支持对齐方式、换行方式、省略号、装饰线等文字样式。文本内容会自动进行 base64 编码存储。
**重要**：图符背景默认为白色(rgba(255,255,255,1))，请确保文字颜色(fill)在白色背景上清晰可见。避免使用白色、浅灰、浅黄等浅色。推荐使用 #000000(黑)、#333333(深灰) 等深色。返回完整的 comps 格式 JSON 对象，className 为 "Text"，store.shape 为 "Text"。`,
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '文本原始内容（直接传入原始文字即可，系统会自动进行 base64 编码后存储），默认 "文字"' },
          width: { type: 'number', description: '文本框宽度(px)' },
          height: { type: 'number', description: '文本框高度(px)' },
          x: { type: 'number', description: '左上角 x 坐标(px)，默认 0' },
          y: { type: 'number', description: '左上角 y 坐标(px)，默认 0' },
          fill: { type: 'string', description: '文字颜色，默认 #000000。注意：图符背景为白色，请选择深色以保证可见性' },
          align: { type: 'string', enum: ['left', 'center', 'right'], description: '水平对齐，默认 center' },
          verticalAlign: { type: 'string', enum: ['top', 'middle', 'bottom'], description: '垂直对齐，默认 middle' },
          fontFamily: { type: 'string', description: '字体名称，默认空' },
          fontSize: { type: 'number', description: '字号，默认 14' },
          fontStyle: { type: 'string', enum: ['normal', 'bold', 'italic', 'italic bold'], description: '字体样式，默认空' },
          padding: { type: 'number', description: '内边距，默认 0' },
          letterSpacing: { type: 'number', description: '字间距，默认 8' },
          wrap: { type: 'string', enum: ['char', 'word', 'none'], description: '换行方式，默认 char' },
          ellipsis: { type: 'boolean', description: 'wrap=none 时显示省略号，默认 true' },
          underline: { type: 'boolean', description: '是否下划线，默认 false' },
          deleteline: { type: 'boolean', description: '是否删除线，默认 false' },
          shadowOpacity: { type: 'number', description: '阴影不透明度，默认 0' },
          shadowBlur: { type: 'number', description: '阴影模糊半径，默认 6' },
          shadowOffsetX: { type: 'number', description: '阴影 x 偏移，默认 3' },
          shadowOffsetY: { type: 'number', description: '阴影 y 偏移，默认 3' },
          shadowColor: { type: 'string', description: '阴影颜色，默认 #1ABC9C' },
          draggable: { type: 'boolean', description: '是否可拖拽，默认 true' },
          moveable: { type: 'boolean', description: '是否可移动，默认 true' },
          rotation: { type: 'number', description: '旋转角度(度)，范围 0~360，默认 0' },
        },
        required: ['width', 'height'],
      },
    },
  },
}

const CREATE_SYMBOL_LINE: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_symbol_line',
      description: `创建图符直线图元（Line）。支持两种输入方式：扁平 points 数组 [x1,y1,x2,y2] 或显式 x1,y1,x2,y2。
返回完整的 comps 格式 JSON 对象，className 为 "Line"，store.shape 为 "Line"。`,
      parameters: {
        type: 'object',
        properties: {
          points: { type: 'array', items: { type: 'number' }, description: '坐标扁平数组 [x1, y1, x2, y2]' },
          x1: { type: 'number', description: '起点 x 坐标（与 x2,y1,y2 一起使用）' },
          y1: { type: 'number', description: '起点 y 坐标' },
          x2: { type: 'number', description: '终点 x 坐标' },
          y2: { type: 'number', description: '终点 y 坐标' },
          x: { type: 'number', description: '图元 x 坐标，默认 points[0]' },
          y: { type: 'number', description: '图元 y 坐标，默认 points[1]' },
          stroke: { type: 'string', description: '线条颜色，默认 #979797' },
          strokeWidth: { type: 'number', description: '线宽，默认 1' },
          hitStrokeWidth: { type: 'number', description: '命中检测宽度，默认 3' },
          shadowOpacity: { type: 'number', description: '阴影不透明度，默认 0' },
          shadowBlur: { type: 'number', description: '阴影模糊半径，默认 6' },
          shadowOffsetX: { type: 'number', description: '阴影 x 偏移，默认 3' },
          shadowOffsetY: { type: 'number', description: '阴影 y 偏移，默认 3' },
          shadowColor: { type: 'string', description: '阴影颜色，默认 #1ABC9C' },
          draggable: { type: 'boolean', description: '是否可拖拽，默认 true' },
          moveable: { type: 'boolean', description: '是否可移动，默认 true' },
          rotation: { type: 'number', description: '旋转角度(度)，范围 0~360，默认 0' },
        },
        required: [],
      },
    },
  },
}

const CREATE_SYMBOL_POLYGON: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_symbol_polygon',
      description: `创建图符多边形图元（Polygon）。通过 points 扁平数组定义顶点，至少 3 个点（6 个值）。
返回完整的 comps 格式 JSON 对象，className 为 "Line"，store.shape 为 "Polygon"，含 closed:true。`,
      parameters: {
        type: 'object',
        properties: {
          points: { type: 'array', items: { type: 'number' }, description: '顶点坐标扁平数组 [x1, y1, x2, y2, ...]，至少 3 个点' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          strokeWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          shadowOpacity: { type: 'number', description: '阴影不透明度，默认 0' },
          shadowBlur: { type: 'number', description: '阴影模糊半径，默认 6' },
          shadowOffsetX: { type: 'number', description: '阴影 x 偏移，默认 3' },
          shadowOffsetY: { type: 'number', description: '阴影 y 偏移，默认 3' },
          shadowColor: { type: 'string', description: '阴影颜色，默认 #1ABC9C' },
          draggable: { type: 'boolean', description: '是否可拖拽，默认 true' },
          moveable: { type: 'boolean', description: '是否可移动，默认 true' },
          rotation: { type: 'number', description: '旋转角度(度)，范围 0~360，默认 0' },
        },
        required: ['points'],
      },
    },
  },
}

const CREATE_SYMBOL_POLYLINE: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_symbol_polyline',
      description: `创建图符折线/贝塞尔曲线图元。支持四种形态：纯折线、二阶贝塞尔（quaraticCurveTo）、三阶贝塞尔（bezierCurveTo）、混合路径。
支持路径闭合。返回完整的 comps 格式 JSON 对象，className 为 "Curve"，store.shape 为 "Curve"。`,
      parameters: {
        type: 'object',
        properties: {
          points: { type: 'array', items: { type: 'number' }, description: '顶点坐标扁平数组 [x1, y1, x2, y2, ...]，至少 2 个点' },
          controlPoints: { type: 'array', items: { type: 'number' }, description: '贝塞尔控制点扁平数组。二阶每段 2 个数字，三阶每段 4 个数字，默认空数组' },
          closed: { type: 'boolean', description: '是否闭合路径，默认 false' },
          stroke: { type: 'string', description: '线条颜色，默认 #979797' },
          strokeWidth: { type: 'number', description: '线宽，默认 1' },
          hitStrokeWidth: { type: 'number', description: '命中检测宽度，默认约 3.08' },
          ...STROKE_GRADIENT_PROPS,
          shadowOpacity: { type: 'number', description: '阴影不透明度，默认 0' },
          shadowBlur: { type: 'number', description: '阴影模糊半径，默认 6' },
          shadowOffsetX: { type: 'number', description: '阴影 x 偏移，默认 3' },
          shadowOffsetY: { type: 'number', description: '阴影 y 偏移，默认 3' },
          shadowColor: { type: 'string', description: '阴影颜色，默认 #1ABC9C' },
          draggable: { type: 'boolean', description: '是否可拖拽，默认 true' },
          moveable: { type: 'boolean', description: '是否可移动，默认 true' },
          rotation: { type: 'number', description: '旋转角度(度)，范围 0~360，默认 0' },
        },
        required: ['points'],
      },
    },
  },
}

const CREATE_SYMBOL_ARC: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_symbol_arc',
      description: `创建图符弧图元（Arc）。弧为开放路径，默认透明填充仅显示描边。
自动根据 width/height 计算 radiusX/radiusY 和 scaleX/scaleY。返回完整的 comps 格式 JSON 对象，className 为 "Arc"，store.shape 为 "Arc"。`,
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: '包围盒宽度(px)' },
          height: { type: 'number', description: '包围盒高度(px)' },
          startAngle: { type: 'number', description: '起始角度(度)，范围 0~360，默认 0' },
          endAngle: { type: 'number', description: '结束角度(度)，范围 0~360，默认 90' },
          x: { type: 'number', description: '包围盒中心 x 坐标(px)，默认 width/2' },
          y: { type: 'number', description: '包围盒中心 y 坐标(px)，默认 height/2' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D800（透明）' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          strokeWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          shadowOpacity: { type: 'number', description: '阴影不透明度，默认 0' },
          shadowBlur: { type: 'number', description: '阴影模糊半径，默认 6' },
          shadowOffsetX: { type: 'number', description: '阴影 x 偏移，默认 3' },
          shadowOffsetY: { type: 'number', description: '阴影 y 偏移，默认 3' },
          shadowColor: { type: 'string', description: '阴影颜色，默认 #1ABC9C' },
          draggable: { type: 'boolean', description: '是否可拖拽，默认 true' },
          rotation: { type: 'number', description: '旋转角度(度)，范围 0~360，默认 0' },
        },
        required: ['width', 'height'],
      },
    },
  },
}

const CREATE_SYMBOL_CHORD: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_symbol_chord',
      description: `创建图符弦图元（Chord）。弦是闭合弧，含 closePath:true，填充色不透明。
与 create_symbol_arc 参数一致，区别在于默认填充不透明且有 closePath。返回完整的 comps 格式 JSON 对象，className 为 "Arc"，store.shape 为 "Chord"。`,
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: '包围盒宽度(px)' },
          height: { type: 'number', description: '包围盒高度(px)' },
          startAngle: { type: 'number', description: '起始角度(度)，范围 0~360，默认 0' },
          endAngle: { type: 'number', description: '结束角度(度)，范围 0~360，默认 90' },
          x: { type: 'number', description: '包围盒中心 x 坐标(px)，默认 width/2' },
          y: { type: 'number', description: '包围盒中心 y 坐标(px)，默认 height/2' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          strokeWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          shadowOpacity: { type: 'number', description: '阴影不透明度，默认 0' },
          shadowBlur: { type: 'number', description: '阴影模糊半径，默认 6' },
          shadowOffsetX: { type: 'number', description: '阴影 x 偏移，默认 3' },
          shadowOffsetY: { type: 'number', description: '阴影 y 偏移，默认 3' },
          shadowColor: { type: 'string', description: '阴影颜色，默认 #1ABC9C' },
          draggable: { type: 'boolean', description: '是否可拖拽，默认 true' },
          rotation: { type: 'number', description: '旋转角度(度)，范围 0~360，默认 0' },
        },
        required: ['width', 'height'],
      },
    },
  },
}

const CREATE_SYMBOL_PIE: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_symbol_pie',
      description: `创建图符饼图/扇形图元（Pie）。饼图是扇形区域，从圆心到弧的两端有两条半径线形成切片。
x/y 为包围盒左上角坐标（与 Arc/Chord 的圆心坐标不同）。返回完整的 comps 格式 JSON 对象，className 为 "Pie"，store.shape 为 "Pie"。`,
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number', description: '包围盒宽度(px)' },
          height: { type: 'number', description: '包围盒高度(px)' },
          startAngle: { type: 'number', description: '起始角度(度)，范围 0~360，默认 0' },
          endAngle: { type: 'number', description: '结束角度(度)，范围 0~360，默认 90' },
          x: { type: 'number', description: '包围盒左上角 x 坐标(px)，默认 0（注意：与 Arc 圆心坐标不同）' },
          y: { type: 'number', description: '包围盒左上角 y 坐标(px)，默认 0' },
          fill: { type: 'string', description: '填充色，默认 #D8D8D8' },
          stroke: { type: 'string', description: '边框色，默认 #979797' },
          strokeWidth: { type: 'number', description: '边框宽度，默认 1' },
          ...SHAPE_GRADIENT_PROPS,
          shadowOpacity: { type: 'number', description: '阴影不透明度，默认 0' },
          shadowBlur: { type: 'number', description: '阴影模糊半径，默认 6' },
          shadowOffsetX: { type: 'number', description: '阴影 x 偏移，默认 3' },
          shadowOffsetY: { type: 'number', description: '阴影 y 偏移，默认 3' },
          shadowColor: { type: 'string', description: '阴影颜色，默认 #1ABC9C' },
          draggable: { type: 'boolean', description: '是否可拖拽，默认 true' },
          rotation: { type: 'number', description: '旋转角度(度)，范围 0~360，默认 0' },
        },
        required: ['width', 'height'],
      },
    },
  },
}

// ============================================================
// Symbol 图符组 — 图符组装工具
// ============================================================

const ASSEMBLE_SYMBOL: SkillRegistryEntry = {
  group: 'symbol',
  toolDef: {
    type: 'function',
    function: {
      name: 'assemble_symbol',
      description: `将所有图符图元组装为完整的图符 JSON。
调用此工具前，必须先创建所有需要的图符图元（通过 create_symbol_rect、create_symbol_ellipse、create_symbol_text、create_symbol_line、create_symbol_polygon、create_symbol_polyline、create_symbol_arc、create_symbol_chord、create_symbol_pie 等工具）。
对于未指定尺寸的图元，会自动应用自适应填充布局（单图元铺满、多图元等分/网格排列）。
此工具会自动：填充 comps 字段、设置 modified 时间戳、配置 store 属性。
**重要**：compsData 参数无需手动传递，系统会自动使用你之前创建的所有图元。仅在需要手动指定部分图元时才传入。`,
      parameters: {
        type: 'object',
        properties: {
          symbolName: { type: 'string', description: '图符名称' },
          compsData: {
            type: 'array',
            description: '之前 create_symbol_* 工具返回的图元 JSON 对象数组',
          },
          width: { type: 'number', description: '画布宽度(px)，默认 800' },
          height: { type: 'number', description: '画布高度(px)，默认 600' },
          background: { type: 'string', description: '背景色，默认 rgba(255,255,255,1)' },
        },
        required: ['symbolName'],
      },
    },
  },
}

// ============================================================
// 全局注册表
// ============================================================

const ALL_SKILLS: SkillRegistryEntry[] = [
  DECLARE_DISPLAY_GENERATION_PLAN,

  // Display 图纸组 — 图元创建
  CREATE_DISPLAY_RECT,
  CREATE_DISPLAY_ELLIPSE,
  CREATE_DISPLAY_TEXT,
  CREATE_DISPLAY_LINE,
  CREATE_DISPLAY_POLYGON,
  CREATE_DISPLAY_PICTURE,
  CREATE_DISPLAY_PIE,
  CREATE_DISPLAY_ARC,
  CREATE_DISPLAY_CHORD,
  CREATE_DISPLAY_CURVE,
  CREATE_DISPLAY_PIPE,
  CREATE_DISPLAY_POLYLINE,
  CREATE_DISPLAY_REGULAR_POLYGON,

  // Display 图纸组 — 复合组件（布局引擎驱动）
  CREATE_METRIC_PANEL,
  CREATE_EQUIPMENT,

  // Display 图纸组 — 已有图元编辑
  UPDATE_DISPLAY_ELEMENT,
  DELETE_DISPLAY_ELEMENT,

  // Display 图纸组 — 图纸组装
  ASSEMBLE_DISPLAY,

  // Display 图纸组 — 动态特性
  ADD_FEATURE_VISIBLE,
  ADD_FEATURE_WRITE_VALUE,
  ADD_FEATURE_CHANGE_COLOR,
  ADD_FEATURE_BLINK,
  ADD_FEATURE_MOVE,
  ADD_FEATURE_OPEN_PAGE,
  ADD_FEATURE_ROTATE,

  DECLARE_SYMBOL_GENERATION_PLAN,

  // Symbol 图符组 — 图元创建
  CREATE_SYMBOL_RECT,
  CREATE_SYMBOL_ELLIPSE,
  CREATE_SYMBOL_TEXT,
  CREATE_SYMBOL_LINE,
  CREATE_SYMBOL_POLYGON,
  CREATE_SYMBOL_POLYLINE,
  CREATE_SYMBOL_ARC,
  CREATE_SYMBOL_CHORD,
  CREATE_SYMBOL_PIE,

  // Symbol 图符组 — 动态特性
  ADD_FEATURE_ROTATE_SYMBOL,
  ADD_FEATURE_MOVE_SYMBOL,
  ADD_FEATURE_BLINK_SYMBOL,
  ADD_FEATURE_CHANGE_COLOR_SYMBOL,

  // Symbol 图符组 — 已有图元编辑
  UPDATE_SYMBOL_ELEMENT,
  DELETE_SYMBOL_ELEMENT,

  // Symbol 图符组 — 图符组装
  ASSEMBLE_SYMBOL,
]

/** 按编辑器类型获取工具定义列表 */
export function getToolsForType(editorType: EditorType): ToolDefinition[] {
  return ALL_SKILLS
    .filter(s => s.group === editorType)
    .map(s => s.toolDef)
}

/** 获取所有已注册的 Skill */
export function getAllSkills(): SkillRegistryEntry[] {
  return ALL_SKILLS
}

/** 按名称查找 Skill */
export function getSkillByName(name: string): SkillRegistryEntry | undefined {
  return ALL_SKILLS.find(s => s.toolDef.function.name === name)
}

/** 判断工具名称是否属于组装类工具 */
export function isAssemblyTool(name: string): boolean {
  return name === 'assemble_display' || name === 'assemble_symbol'
}
