/**
 * Display 图纸组 — 复合组件（布局引擎驱动，坐标自动计算）
 */

import type { SkillRegistryEntry } from '../../types'

export const CREATE_METRIC_PANEL: SkillRegistryEntry = {
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

export const CREATE_EQUIPMENT: SkillRegistryEntry = {
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

export const CREATE_CHART_PANEL: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'create_chart_panel',
      description: `创建**图表卡片**（卡片背景 + 标题 + 柱状图/折线图/饼图）。这是绘制任何图表的唯一正确方式。
**重要**：坐标轴、柱子、折线、扇形、图例、标签的坐标全部由布局引擎自动计算，并被严格裁剪在卡片内部，**绝不会超出面板范围**。
你**只需给出数据**（kind + title + data:[{label,value}]）。
**禁止**用 create_display_rect / create_display_pie / create_display_polyline / create_display_line 手工拼图表——那必然导致内容溢出面板。
一次调用产出整张图表卡片。`,
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '卡片左上角 x 坐标(px)' },
          y: { type: 'number', description: '卡片左上角 y 坐标(px)' },
          width: { type: 'number', description: '卡片宽度(px)，建议 ≥ 260' },
          height: { type: 'number', description: '卡片高度(px)，建议 ≥ 180' },
          kind: { type: 'string', enum: ['bar', 'line', 'pie'], description: '图表类型：bar柱状图（对比/统计）/line折线图（趋势）/pie饼图（占比，自带右侧图例与百分比）' },
          title: { type: 'string', description: '卡片标题' },
          data: {
            type: 'array',
            description: '数据点数组，每项 {label, value, color?}；柱状/折线建议 4-12 项，饼图建议 3-6 项',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '分类名 / 时间点标签' },
                value: { type: 'number', description: '数值（非负）' },
                color: { type: 'string', description: '该项颜色，省略则自动取科技感调色板' },
              },
              required: ['label', 'value'],
            },
          },
          unit: { type: 'string', description: '数值单位，显示在标题后，如 "t/h"' },
          maxValue: { type: 'number', description: '柱状/折线的纵轴最大值，省略则按数据自适应' },
          titleColor: { type: 'string', description: '标题颜色，默认 #00d4ff' },
          labelColor: { type: 'string', description: '标签颜色，默认 #aabbcc' },
          axisColor: { type: 'string', description: '坐标轴/网格颜色，默认 #1e3a50' },
          panelFill: { type: 'string', description: '卡片背景色，默认 #101830' },
          panelStroke: { type: 'string', description: '卡片边框色，默认 #1e3a50' },
          palette: { type: 'array', items: { type: 'string' }, description: '自定义调色板（颜色数组）' },
        },
        required: ['x', 'y', 'width', 'height', 'kind', 'title', 'data'],
      },
    },
  },
}
