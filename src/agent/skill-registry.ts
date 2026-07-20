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
      description: `创建图纸曲线图元（Curve）。通过控制点数组和段类型数组定义曲线路径。
segments 值：1=直线段，2=曲线段。曲线没有 fillColor 和 textColor 字段。
返回完整的 elements 格式 JSON 对象，type 为 "Curve"。`,
      parameters: {
        type: 'object',
        properties: {
          polygon: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                x: { type: 'number', description: '控制点 x 坐标' },
                y: { type: 'number', description: '控制点 y 坐标' },
              },
              required: ['x', 'y'],
            },
            description: '控制点坐标数组 [{x,y}, ...]',
          },
          segments: {
            type: 'array',
            items: { type: 'number' },
            description: '段类型数组，如 [1, 2, 2, 2]。1=直线段，2=曲线段，长度 = polygon长度 - 1',
          },
          stroke: { type: 'string', description: '线条颜色，默认 #979797' },
          borderWidth: { type: 'number', description: '线宽，默认 1' },
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
          pageWidth: { type: 'number', description: '画布宽度(px)，默认 1880' },
          pageHeight: { type: 'number', description: '画布高度(px)，默认 962' },
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
          dataSourceKey: { type: 'string', description: '条件数据源键名' },
          conditionOperator: { type: 'number', description: '比较运算符：0=, 1=!=, 2=>, 3=<, 4=>=, 5=<=, 6=包含, 7=不包含, 8=在之间, 9=不在之间, 10=位运算' },
          conditionValue: { type: 'string', description: '条件比较值' },
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
          dataSourceKey: { type: 'string', description: '条件数据源键名' },
          conditionOperator: { type: 'number', description: '比较运算符 0~10' },
          conditionValue: { type: 'string', description: '条件比较值' },
          moveMode: { type: 'number', description: '移动方式：0=自动移动（固定速度），1=参数驱动移动（数据源映射），默认 0' },
          reBack: { type: 'number', description: '是否往返移动：0=单向，1=往返（到达终点后反向），默认 0' },
          hMove: { type: 'number', description: '是否开启水平移动：0=否，1=是，默认 1' },
          vMove: { type: 'number', description: '是否开启垂直移动：0=否，1=是，默认 1' },
          hDistance: { type: 'number', description: '水平移动距离(px)，默认 0' },
          hSpeed: { type: 'number', description: '自动模式下水平移动速度(px/帧)，默认 0' },
          vDistance: { type: 'number', description: '垂直移动距离(px)，默认 0' },
          vSpeed: { type: 'number', description: '自动模式下垂直移动速度(px/帧)，默认 0' },
          hDataSourceKey: { type: 'string', description: '参数模式下水平方向数据源键名' },
          hUseDB: { type: 'number', description: '水平使用数据库量程：0=否，1=是，默认 0' },
          hMu: { type: 'number', description: '水平量程上限（hUseDB=0 时），默认 100' },
          hMd: { type: 'number', description: '水平量程下限（hUseDB=0 时），默认 0' },
          vDataSourceKey: { type: 'string', description: '参数模式下垂直方向数据源键名' },
          vUseDB: { type: 'number', description: '垂直使用数据库量程：0=否，1=是，默认 0' },
          vMu: { type: 'number', description: '垂直量程上限（vUseDB=0 时），默认 100' },
          vMd: { type: 'number', description: '垂直量程下限（vUseDB=0 时），默认 0' },
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
          dataSourceKey: { type: 'string', description: '条件数据源键名' },
          conditionOperator: { type: 'number', description: '比较运算符 0~10' },
          conditionValue: { type: 'string', description: '条件比较值' },
          rotMode: { type: 'number', description: '旋转方式：0=自动旋转（固定角度），1=参数驱动旋转（数据源映射），默认 0' },
          rotCenter: { type: 'number', description: '旋转中心：0=偏移中心，1=左上角，2=左下角，3=右上角，4=右下角，5=中心，6=顶部中心，7=底部中心，8=左侧中心，9=右侧中心，默认 5' },
          rotAngle: { type: 'number', description: '自动模式下每次旋转角度(度)，范围 -360~360，默认 5' },
          rotCond: { type: 'number', description: '是否开启条件控制旋转：0=否，1=是，默认 0' },
          condTrue: { type: 'number', description: '条件满足时行为：0=旋转，1=停止，2=保持，默认 0' },
          condFalse: { type: 'number', description: '条件不满足时行为：0=旋转，1=停止，2=保持，默认 0' },
          dsDataSourceKey: { type: 'string', description: '参数模式下数据源键名' },
          maxAngle: { type: 'number', description: '参数模式下最大旋转角度，范围 -360~360，默认 360' },
          minAngle: { type: 'number', description: '参数模式下最小旋转角度，范围 -360~360，默认 0' },
          useDB: { type: 'number', description: '是否使用数据库量程：0=否，1=是，默认 0' },
          mu: { type: 'number', description: '量程上限（useDB=0 时），默认 100' },
          md: { type: 'number', description: '量程下限（useDB=0 时），默认 0' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
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

  // Display 图纸组 — 已有图元编辑
  UPDATE_DISPLAY_ELEMENT,
  DELETE_DISPLAY_ELEMENT,

  // Display 图纸组 — 图纸组装
  ASSEMBLE_DISPLAY,

  // Display 图纸组 — 动态特性
  ADD_FEATURE_VISIBLE,
  ADD_FEATURE_WRITE_VALUE,
  ADD_FEATURE_CHANGE_COLOR,
  ADD_FEATURE_MOVE,
  ADD_FEATURE_OPEN_PAGE,
  ADD_FEATURE_ROTATE,

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
