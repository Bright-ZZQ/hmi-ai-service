/**
 * Display 图纸组 — 基础图元创建工具
 */

import type { SkillRegistryEntry } from '../../types'
import {
  LINE_ARROW_PROPS,
  SHAPE_BORDER_STYLE_PROP,
  SHAPE_GRADIENT_PROPS,
  SHAPE_PIVOT_PROPS,
  SHAPE_ROTATION_PROP,
  SHAPE_SHADOW_PROPS,
  STROKE_GRADIENT_PROPS,
  TEXT_STYLE_PROPS,
} from '../_shared/fragments'

/** 外接矩形定位的形状：旋转中心 + 静态旋转 + 阴影 + 边框线型 */
const BOX_SHAPE_PROPS = {
  ...SHAPE_PIVOT_PROPS,
  ...SHAPE_ROTATION_PROP,
  ...SHAPE_SHADOW_PROPS,
  ...SHAPE_BORDER_STYLE_PROP,
} as const

/** 顶点定位的多边形：顶点已是最终位置，不提供静态旋转 */
const POLYGON_SHAPE_PROPS = {
  ...SHAPE_PIVOT_PROPS,
  ...SHAPE_SHADOW_PROPS,
  ...SHAPE_BORDER_STYLE_PROP,
} as const

export const CREATE_DISPLAY_RECT: SkillRegistryEntry = {
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
          ...BOX_SHAPE_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['width', 'height', 'x', 'y'],
      },
    },
  },
}

export const CREATE_DISPLAY_ELLIPSE: SkillRegistryEntry = {
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
          ...BOX_SHAPE_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['width', 'height', 'x', 'y'],
      },
    },
  },
}

export const CREATE_DISPLAY_TEXT: SkillRegistryEntry = {
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
          ...TEXT_STYLE_PROPS,
          textAlign: { type: 'string', enum: ['left', 'center', 'right'], description: '水平对齐，默认 center' },
          textBaseline: { type: 'string', enum: ['top', 'middle', 'bottom'], description: '垂直对齐，默认 middle' },
          ...SHAPE_ROTATION_PROP,
          ...SHAPE_PIVOT_PROPS,
          ...SHAPE_SHADOW_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['text', 'x', 'y'],
      },
    },
  },
}

export const CREATE_DISPLAY_LINE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_line',
      description: `创建图纸直线图元（Line）：两点之间的普通细线，可设线宽、线型（实线/虚线/点线）和端点箭头。
适用于各类细线：连接线、工艺连线（含流程图里的细线，不论颜色）、引线、分割线、虚线框边、箭头线等，线外观简洁、无纹理，是画线条的默认选择。需要多段转折的连线用 create_display_polyline。返回完整的 elements 格式 JSON 对象。`,
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
          ...LINE_ARROW_PROPS,
          ...SHAPE_SHADOW_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['x1', 'y1', 'x2', 'y2'],
      },
    },
  },
}

export const CREATE_DISPLAY_POLYGON: SkillRegistryEntry = {
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
          ...POLYGON_SHAPE_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['points'],
      },
    },
  },
}

export const CREATE_DISPLAY_PICTURE: SkillRegistryEntry = {
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
          ...SHAPE_ROTATION_PROP,
          ...SHAPE_PIVOT_PROPS,
          ...SHAPE_SHADOW_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['src', 'x', 'y', 'width', 'height'],
      },
    },
  },
}

export const CREATE_DISPLAY_PIE: SkillRegistryEntry = {
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
          ...BOX_SHAPE_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['cx', 'cy', 'radius', 'startAngle', 'endAngle'],
      },
    },
  },
}

export const CREATE_DISPLAY_ARC: SkillRegistryEntry = {
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
          ...BOX_SHAPE_PROPS,
          ...LINE_ARROW_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['width', 'height', 'startAngle', 'endAngle', 'x', 'y'],
      },
    },
  },
}

export const CREATE_DISPLAY_CHORD: SkillRegistryEntry = {
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
          ...BOX_SHAPE_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['width', 'height', 'startAngle', 'endAngle', 'x', 'y'],
      },
    },
  },
}

export const CREATE_DISPLAY_CURVE: SkillRegistryEntry = {
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

export const CREATE_DISPLAY_PIPE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_pipe',
      description: `创建图纸管道图元（Pipeline）：外观是较粗、带纹路的管状对象（管径 borderWidth 默认 10），通过路径顶点数组定义走向，
可挂流动动画（add_feature_dash_flow）和管道流动脚本（set_pipe_script），这些只有管道才支持。
不是“线”的替代品：画细线（包括流程图里的工艺连线）请用 create_display_line / create_display_polyline，不要用本工具。
仅当用户明确要求“管道”外观或管道流动效果时才使用。
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

export const CREATE_DISPLAY_POLYLINE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_display_polyline',
      description: `创建图纸折线图元（Polyline）。通过顶点坐标数组定义折线形状，close 固定为 false。
与多边形（Polygon）的区别是折线不闭合。
适用于多段转折的细线：连接线、工艺连线（含流程图里的细线，不论颜色）、引线、示意线等（可设线宽、线型），外观简洁、无纹理，是画折线的默认选择。返回完整的 elements 格式 JSON 对象，type 为 "Polyline"。`,
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

export const CREATE_DISPLAY_REGULAR_POLYGON: SkillRegistryEntry = {
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
          ...BOX_SHAPE_PROPS,
          name: { type: 'string', description: '图元名称，默认自动生成' },
          layer: { type: 'string', description: '图层ID，默认 "1"' },
          zIndex: { type: 'number', description: '层级，默认自动递增' },
        },
        required: ['sides', 'radius', 'x', 'y'],
      },
    },
  },
}
