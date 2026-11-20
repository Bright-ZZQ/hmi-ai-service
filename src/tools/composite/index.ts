/**
 * Composite 复合组件工具：create_metric_panel / create_equipment / create_chart_panel（布局引擎驱动）
 */

import { defineTool } from '../core/tool-module'
import type { ToolModule } from '../core/tool-module'
import { CREATE_CHART_PANEL, CREATE_EQUIPMENT, CREATE_METRIC_PANEL } from './definitions'
import { handleChartPanel, handleEquipment, handleMetricPanel } from './handlers'

export const COMPOSITE_TOOLS: ToolModule[] = [
  defineTool(CREATE_METRIC_PANEL, handleMetricPanel, { category: 'composite', phases: ['create'], keywords: ['数据面板', '指标', '监控', '读数', '列表', '表格', '仪表盘'] }),
  defineTool(CREATE_EQUIPMENT, handleEquipment, { category: 'composite', phases: ['create'], keywords: ['储罐', '塔器', '炉子', '泵', '阀门', '设备', '换热器', '反应器'] }),
  defineTool(CREATE_CHART_PANEL, handleChartPanel, { category: 'composite', phases: ['create'], keywords: ['图表', '饼图', '折线图', '柱状图', '趋势', '占比', '统计', '看板', '大屏', '曲线'] }),
]
