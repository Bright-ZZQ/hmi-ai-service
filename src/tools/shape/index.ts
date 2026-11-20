/**
 * Shape 基础图元工具：create_display_* / create_symbol_*
 */

import type { SkillRegistryEntry } from '../../types'
import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import {
  CREATE_DISPLAY_ARC,
  CREATE_DISPLAY_CHORD,
  CREATE_DISPLAY_CURVE,
  CREATE_DISPLAY_ELLIPSE,
  CREATE_DISPLAY_LINE,
  CREATE_DISPLAY_PICTURE,
  CREATE_DISPLAY_PIE,
  CREATE_DISPLAY_PIPE,
  CREATE_DISPLAY_POLYGON,
  CREATE_DISPLAY_POLYLINE,
  CREATE_DISPLAY_RECT,
  CREATE_DISPLAY_REGULAR_POLYGON,
  CREATE_DISPLAY_TEXT,
} from './definitions.display'
import {
  CREATE_SYMBOL_ARC,
  CREATE_SYMBOL_CHORD,
  CREATE_SYMBOL_ELLIPSE,
  CREATE_SYMBOL_LINE,
  CREATE_SYMBOL_PIE,
  CREATE_SYMBOL_POLYGON,
  CREATE_SYMBOL_POLYLINE,
  CREATE_SYMBOL_RECT,
  CREATE_SYMBOL_TEXT,
} from './definitions.symbol'
import { handleCreateDisplayElement, handleCreateSymbolElement } from './handlers'

const displayShape = (entry: SkillRegistryEntry, keywords: string[]): ToolModule =>
  defineTool(entry, handleCreateDisplayElement, { category: 'shape', phases: ['create'], keywords })

const symbolShape = (entry: SkillRegistryEntry, keywords: string[]): ToolModule =>
  defineTool(entry, handleCreateSymbolElement, { category: 'shape', phases: ['create'], keywords })

export const SHAPE_TOOLS: ToolModule[] = [
  // Display — 基础图元
  displayShape(CREATE_DISPLAY_RECT, ['矩形', '方块', '卡片', '面板', '按钮', '边框']),
  displayShape(CREATE_DISPLAY_ELLIPSE, ['椭圆', '圆', '圆形', '指示灯', '状态灯']),
  displayShape(CREATE_DISPLAY_TEXT, ['文字', '文本', '标题', '标签', '数值', '说明']),
  displayShape(CREATE_DISPLAY_LINE, ['直线', '线段', '连接线', '分割线']),
  displayShape(CREATE_DISPLAY_POLYGON, ['多边形', '箭头', '三角形']),
  displayShape(CREATE_DISPLAY_PICTURE, ['图片', '图标', '图像', 'icon']),
  displayShape(CREATE_DISPLAY_PIE, ['饼图', '扇形', '占比']),
  displayShape(CREATE_DISPLAY_ARC, ['弧', '圆弧', '仪表', '刻度']),
  displayShape(CREATE_DISPLAY_CHORD, ['弦', '弓形']),
  displayShape(CREATE_DISPLAY_CURVE, ['曲线', '贝塞尔', '波浪', '平滑', '异形']),
  displayShape(CREATE_DISPLAY_PIPE, ['管道', '管路', '流体', '工艺线']),
  displayShape(CREATE_DISPLAY_POLYLINE, ['折线', '多段线', '路径']),
  displayShape(CREATE_DISPLAY_REGULAR_POLYGON, ['正多边形', '五边形', '六边形', '正三角']),

  // Symbol — 基础图元
  symbolShape(CREATE_SYMBOL_RECT, ['矩形', '方块']),
  symbolShape(CREATE_SYMBOL_ELLIPSE, ['椭圆', '圆']),
  symbolShape(CREATE_SYMBOL_TEXT, ['文字', '文本', '标签']),
  symbolShape(CREATE_SYMBOL_LINE, ['直线', '线段']),
  symbolShape(CREATE_SYMBOL_POLYGON, ['多边形', '箭头']),
  symbolShape(CREATE_SYMBOL_POLYLINE, ['折线', '曲线']),
  symbolShape(CREATE_SYMBOL_ARC, ['弧', '圆弧']),
  symbolShape(CREATE_SYMBOL_CHORD, ['弦', '弓形']),
  symbolShape(CREATE_SYMBOL_PIE, ['饼图', '扇形']),
]
