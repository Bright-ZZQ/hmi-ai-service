/**
 * Symbol 图符组 — 图元创建工具
 */

import type { SkillRegistryEntry } from '../../types'
import { LINE_ARROW_PROPS, SHAPE_BORDER_STYLE_PROP, SHAPE_GRADIENT_PROPS, STROKE_GRADIENT_PROPS } from '../_shared/fragments'

const SYMBOL_OPACITY_PROP = {
  opacity: { type: 'number', description: '图元整体不透明度 0~1，默认 1。原图中半透明的图元才设置' },
} as const

/**
 * 为图符创建工具追加视觉细节参数（整体不透明度、边框线型；直线/弧另有箭头），返回新的注册项，不修改原定义。
 * 文字没有边框，只追加不透明度。
 */
export function withSymbolDetailProps(entry: SkillRegistryEntry, kind: 'text' | 'shape' | 'arrow'): SkillRegistryEntry {
  const extra = kind === 'text'
    ? { ...SYMBOL_OPACITY_PROP }
    : { ...SYMBOL_OPACITY_PROP, ...SHAPE_BORDER_STYLE_PROP, ...(kind === 'arrow' ? LINE_ARROW_PROPS : {}) }
  const fn = entry.toolDef.function
  return {
    ...entry,
    toolDef: {
      ...entry.toolDef,
      function: {
        ...fn,
        parameters: { ...fn.parameters, properties: { ...fn.parameters.properties, ...extra } },
      },
    },
  }
}

export const CREATE_SYMBOL_RECT: SkillRegistryEntry = {
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

export const CREATE_SYMBOL_ELLIPSE: SkillRegistryEntry = {
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

export const CREATE_SYMBOL_TEXT: SkillRegistryEntry = {
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

export const CREATE_SYMBOL_LINE: SkillRegistryEntry = {
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

export const CREATE_SYMBOL_POLYGON: SkillRegistryEntry = {
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

export const CREATE_SYMBOL_POLYLINE: SkillRegistryEntry = {
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

export const CREATE_SYMBOL_ARC: SkillRegistryEntry = {
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

export const CREATE_SYMBOL_CHORD: SkillRegistryEntry = {
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

export const CREATE_SYMBOL_PIE: SkillRegistryEntry = {
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
