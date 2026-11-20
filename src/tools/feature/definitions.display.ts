/**
 * Display 图纸组 — 动态/交互特性工具
 *
 * 动态特性：旋转 / 移动 / 闪烁 / 变色 / 数值显示 / 显隐 / 缩放 / 填充 / 流动 / 操作使能 / 多状态文字 / 多状态颜色，写入 store.dynamicDyna。
 * 交互特性：写值 / 打开页面 / Tip 显示 / 置位，写入 store.interactiveDyna。
 * 这些特性的 toolDef 会被 symbol/features.ts 复用（仅改 group）。
 */

import type { SkillRegistryEntry } from '../../types'
import { FEATURE_CONDITION_PROPS, ROTATE_PIVOT_PROPS } from '../_shared/fragments'
import { ACTION_KINDS, DISPLAY_TRIGGERS, MOUSE_EVENT_TYPES, SCHEDULE_TYPES, SCRIPT_API_REFERENCE } from './event-definition'
import { PAGE_SCRIPT_API_REFERENCE, PIPE_SCRIPT_API_REFERENCE } from './script-tools'

export const ADD_EVENT_DEFINITION: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_event_definition',
      description: `添加“事件定义”（属性栏 - 控制 - 事件定义），支持图元级与图纸级，一个事件对应一个动作。
- scope=element：图元鼠标事件（eventType），写入该图元 store.events，需 elementName（来自 find_elements 的 id）。
- scope=display：图纸级事件，写入 pageProperty.events，用 trigger 指定触发方式：
  respond=事件响应(需 handleId)；schedule=定时执行(scheduleType+time/intervalSeconds/dayOfWeek/dayOfMonth)；valueChanged=数值变化(dataSourceKeys 测点全路径，如 "100:XAM_001.AV")；onOpenBefore=画面打开前(仅 script)；onOpenAfter=画面打开后。
- 动作选择：旋转、移动、显隐、缩放、尺寸、变色优先使用对应内置动作（rotate/move/visible/scale/size/color）；持续/条件生效的旋转、移动、显隐应改用 add_feature_* 动态特性。用户提供测点控制效果时，优先 add_feature_* 的测点条件 + 交互特性（写值/置位等），或 trigger=valueChanged 搭配内置动作。仅当内置动作与动态特性都无法实现（如多图元联动、状态切换、绕公共圆心公转、读写页面参数、复杂分支）或用户明确指定脚本时才用 action=script。
- action 动作：script 脚本(script)；visible 显隐(visible: 0隐藏/1显示/2切换)；move 移动(moveType moveBy|moveTo, x, y)；rotate 旋转(angle, clockwise)；scale 缩放(scaleX, scaleY)；size 尺寸(width, height)；color 变色(textColor/borderColor/backgroundColor 至少一个)；openDialog 弹窗(url,width,height,dialogPosition)；openWindow 新窗口(url)。
- 动作作用于 targetElements 指定的图元 id 列表；图元级缺省作用于自身（脚本的 data 即为自身）；图纸级必须指定，openDialog/openWindow 除外。
- 脚本中要使用 data 时必须配置目标图元（图纸级需传 targetElements），否则 data 为 undefined；未配置目标图元的脚本只能用 gv.findNodeByIdEx("图元ID") 操作图元，不得访问 data。
- 图元级 eventScope=other + handleId：向其他图纸/图纸级“事件响应”广播事件，此时无需 action。
用户不会提供图元 ID：用 find_elements 定位，不确定则 ask_user，不得猜测。成功后调用 assemble_display 输出完整图纸。
${SCRIPT_API_REFERENCE}`,
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['element', 'display'], description: 'element=图元事件，display=图纸事件，默认 element' },
          title: { type: 'string', description: '事件名称，不超过 12 字，如“点击随机变色”' },
          elementName: { type: 'string', description: 'scope=element 时的所属图元 id（来自 find_elements）' },
          eventType: { type: 'string', enum: [...MOUSE_EVENT_TYPES], description: 'scope=element 的鼠标事件：onClick=单击，onDoubleClick=双击，onEnter=移入，onLeave=离开，onHover=悬停，onDown=按下，onUp=抬起，默认 onClick' },
          eventScope: { type: 'string', enum: ['current', 'other'], description: '图元事件：current=在当前图纸执行动作（默认）；other=向其他图纸发送事件' },
          trigger: { type: 'string', enum: [...DISPLAY_TRIGGERS], description: 'scope=display 的触发方式' },
          handleId: { type: 'string', description: '事件标识：respond 事件响应、eventScope=other 发送事件时必填，两端需一致' },
          scheduleType: { type: 'string', enum: [...SCHEDULE_TYPES], description: 'trigger=schedule：interval=每隔 N 秒，daily=每天，weekly=每周，monthly=每月' },
          intervalSeconds: { type: 'number', description: 'scheduleType=interval 的间隔秒数' },
          time: { type: 'string', description: 'daily/weekly/monthly 的执行时刻 HH:mm 或 HH:mm:ss' },
          dayOfWeek: { type: 'number', description: 'weekly：1-7，1=周一，7=周日' },
          dayOfMonth: { type: 'number', description: 'monthly：1-31' },
          dataSourceKeys: { type: 'array', items: { type: 'string' }, description: 'trigger=valueChanged 监听的测点全路径列表' },
          action: { type: 'string', enum: [...ACTION_KINDS], description: '动作类型，默认 script' },
          targetElements: { type: 'array', items: { type: 'string' }, description: '动作作用的图元 id 列表（来自 find_elements）；"node-self" 表示触发事件的图元自身' },
          script: { type: 'string', description: 'action=script 的脚本函数体' },
          visible: { type: 'number', enum: [0, 1, 2], description: 'action=visible：0隐藏，1显示，2切换' },
          moveType: { type: 'string', enum: ['moveBy', 'moveTo'], description: 'action=move' },
          x: { type: 'number', description: 'action=move 的 x' },
          y: { type: 'number', description: 'action=move 的 y' },
          angle: { type: 'number', description: 'action=rotate 的角度' },
          clockwise: { type: 'boolean', description: 'action=rotate 是否顺时针，默认 true' },
          scaleX: { type: 'number', description: 'action=scale' },
          scaleY: { type: 'number', description: 'action=scale' },
          width: { type: 'number', description: 'action=size / openDialog 的宽' },
          height: { type: 'number', description: 'action=size / openDialog 的高' },
          textColor: { type: 'string', description: 'action=color 文本色，如 #ff0000' },
          borderColor: { type: 'string', description: 'action=color 边框色' },
          backgroundColor: { type: 'string', description: 'action=color 背景色' },
          url: { type: 'string', description: 'action=openDialog/openWindow 的地址' },
          dialogPosition: { type: 'string', enum: ['center', 'left-top', 'right-top', 'left-bottom', 'right-bottom'], description: 'action=openDialog 弹窗位置，默认 center' },
          params: { type: 'string', description: 'eventScope=other 时随事件发送的参数 JSON 字符串，默认 {}' },
          ...ROTATE_PIVOT_PROPS,
        },
        required: ['scope'],
      },
    },
  },
}

export const SET_DISPLAY_SCRIPT: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'set_display_script',
      description: `设置图纸脚本（属性栏 - 图纸 - 脚本），写入 pageProperty.scriptFunc，画面加载完成后执行一次，用于画面初始化（如设置初始显隐/颜色/文本、读取页面参数、定时刷新）。
这是对当前图纸的修改，不得新建图元；不需要 elementName。设置后调用 assemble_display 输出完整图纸。
旋转、移动、显隐等效果优先用 add_feature_rotate / add_feature_move / add_feature_visible 等动态特性实现，仅在动态特性无法实现时才用脚本。
需要由用户操作、定时或数值变化触发的逻辑应使用 add_event_definition，而不是本工具。
${PAGE_SCRIPT_API_REFERENCE}`,
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: '图纸脚本函数体' },
          mode: { type: 'string', enum: ['append', 'replace'], description: 'append=追加到已有脚本之后（默认，保留原脚本）；replace=完全替换已有脚本，仅在用户明确要求修改/替换原脚本时使用' },
          ...ROTATE_PIVOT_PROPS,
        },
        required: ['script'],
      },
    },
  },
}

export const SET_PIPE_SCRIPT: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'set_pipe_script',
      description: `为管道图元（create_display_pipe 创建）设置管道脚本，写入 store.pipeScript，管道加入画布时执行，用于按条件控制管道流动动画（流动组开关、方向、速度、颜色）。
elementName 必须是管道图元（来自 create_display_pipe 返回或 find_elements 的 id）。管道含脚本后流动组默认关闭，脚本必须调用 data.setScriptEnabled(true) 才会流动。
${PIPE_SCRIPT_API_REFERENCE}`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '管道图元的 id、name 或 node_id' },
          script: { type: 'string', description: '管道脚本函数体' },
          enableFlowGroup: { type: 'boolean', description: '是否同时开启该管道的流动组显示（store.flowGroupEnabled=true），默认 true；脚本自行用 setStore 控制时可传 false' },
        },
        required: ['elementName', 'script'],
      },
    },
  },
}

export const ADD_FEATURE_VISIBLE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_visible',
      description: `为图元添加显隐动态特性（Visible）。条件满足时按 isVisible 控制图元显示或隐藏。
isVisible=1：条件满足显示、不满足隐藏；isVisible=0：条件满足隐藏、不满足显示。
禁止自行推断条件；用户未明确指定条件时特性持续按 isVisible 生效，因此未指定条件时 isVisible 必须为 1，无条件的 isVisible=0 会让图元永久不可见（会被服务端拒绝）；不要的图元请用 delete_element 删除。存储到 store.dynamicDyna，type 为 GraphDynaVisible。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          isVisible: { type: 'number', enum: [0, 1], description: '条件满足时是否显示：1=显示，0=隐藏，默认 1' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

export const ADD_FEATURE_WRITE_VALUE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_write_value',
      description: `为图元添加写值交互特性（WriteValue）。用户触发鼠标事件后向测点写入开关量或模拟量。
valueType=digital 生成 GraphTriggerWriteDigVal，valueType=analog 生成 GraphTriggerWriteAnaVal。
存储到 store.interactiveDyna，使用 act 字段定义触发事件。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          dataSourceKey: { type: 'string', description: '要写入的测点全路径（必需），形如 "100:XAM_001.AV"；服务端按最后一个 "." 拆分为 tagName 与 itemName' },
          valueType: { type: 'string', enum: ['digital', 'analog'], description: '写值类型：digital=开关量，analog=模拟量，默认 digital' },
          act: { type: 'number', enum: [2, 3, 4, 5, 6, 17], description: '触发事件：2=左键按下，3=左键抬起，4=右键按下，5=右键抬起，6=双击，17=单击，默认 17' },
          writeMode: { type: 'number', description: '写值格式。开关量：0=反转，1=固定值，默认 0。模拟量：0=比例，1=固定增量，2=固定值，3=弹窗输入，默认 0' },
          value: { type: 'number', description: '固定值/固定增量（开关量 writeMode=1 或模拟量 writeMode=1/2 时使用），开关量固定值仅 0 或 1' },
          rate: { type: 'number', description: '模拟量比例系数（writeMode=0 时），范围 -1~1，默认 0' },
          rangeMode: { type: 'number', enum: [0, 1, 2], description: '模拟量量程格式：0=自定义，1=数据库量程，2=不使用量程，默认 0' },
          mu: { type: 'number', description: '自定义量程上限（rangeMode=0 时），默认 100' },
          md: { type: 'number', description: '自定义量程下限（rangeMode=0 时），默认 0' },
          muDataSourceKey: { type: 'string', description: '数据库量程上限测点全路径（rangeMode=1 时）' },
          mdDataSourceKey: { type: 'string', description: '数据库量程下限测点全路径（rangeMode=1 时）' },
          readItemDataSourceKey: { type: 'string', description: '开关量反转时的读项测点全路径（writeMode=0 时可选；省略则读取写入测点当前值后反转）' },
          confirmEnable: { type: 'number', enum: [0, 1], description: '是否二次确认：0=否，1=是，默认 0' },
          confirmDes: { type: 'string', description: '模拟量二次确认描述（confirmEnable=1 时）' },
          confirmDes0: { type: 'string', description: '开关量当前为 0 时的二次确认描述（confirmEnable=1 时）' },
          confirmDes1: { type: 'string', description: '开关量当前为 1 时的二次确认描述（confirmEnable=1 时）' },
        },
        required: ['elementName', 'dataSourceKey'],
      },
    },
  },
}

export const ADD_FEATURE_NUM_DISPLAY: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_num_display',
      description: `为图元添加数值显示动态特性（NumDisplay）。将数据源的实时值显示为图元文本，支持显示格式（小数位/数据库格式）、
对齐方式、工程单位、开关量置0/置1说明、时间格式化（测点时间戳或当前系统时间），以及质量位无效时闪烁。存储到 store.dynamicDyna，type 为 GraphDynaValDisplay。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          dataSourceKey: { type: 'string', description: '要显示的数值测点全路径，形如 "100:XAM_001.AV"；服务端按最后一个 "." 拆分为 tagName 与 itemName。除“显示当前系统时间”(useTime=1 且 parTimeTy=0)外必需' },
          align: { type: 'number', enum: [0, 1, 2, 3], description: '对齐方式：0=左对齐，1=居中，2=右对齐，3=沿用图元自身文本对齐，默认 3' },
          blink: { type: 'number', description: '质量位无效时是否闪烁：0=否，1=是，默认 0' },
          isOfData: { type: 'number', description: '显示格式来源：0=按配置格式（ofShow），1=按数据库格式（ofItem），默认 0' },
          ofShow: { type: 'number', enum: [-1, 0, 1, 2, 3, 4, 5, 6], description: '配置显示格式：-1=无格式（跟随全局小数位），0=整数，1~6=保留对应小数位数，默认 -1' },
          ofItemDataSourceKey: { type: 'string', description: '数据库格式测点全路径（isOfData=1 时必需），形如 "100:XAM_001.OF"' },
          showUT: { type: 'number', description: '是否显示工程单位：0=否，1=是，默认 0' },
          unitDataSourceKey: { type: 'string', description: '工程单位测点全路径（showUT=1 时必需），形如 "100:XAM_001.UT"' },
          showE0E1: { type: 'number', description: '开关量是否显示置0/置1说明：0=否，1=是，默认 0' },
          showDbE0E1: { type: 'number', description: '置0/置1说明来源：0=直接配置文本，1=取自数据库模型点，默认 0（showE0E1=1 时有效）' },
          e0Des: { type: 'string', description: '置0说明文本（showDbE0E1=0 时使用），如 "停止"' },
          e1Des: { type: 'string', description: '置1说明文本（showDbE0E1=0 时使用），如 "运行"' },
          e0DesDataSourceKey: { type: 'string', description: '置0说明测点全路径（showDbE0E1=1 时使用），形如 "100:XAM_001.E0"' },
          e1DesDataSourceKey: { type: 'string', description: '置1说明测点全路径（showDbE0E1=1 时使用），形如 "100:XAM_001.E1"' },
          useTime: { type: 'number', description: '是否按时间格式显示：0=否，1=是，默认 0。配合 parTimeTy 可显示测点时间戳或当前系统时间' },
          parTimeTy: { type: 'number', enum: [0, 1], description: '时间来源（useTime=1 时有效）：1=测点值时间戳（默认），0=当前系统时间（每秒刷新，此时无需 dataSourceKey）' },
          timeFormat: { type: 'number', enum: [0, 1, 2, 3], description: '时间格式：0=YYYY-MM-DD HH:mm:ss，1=YYYY-MM-DD，2=HH:mm:ss，3=HH:mm:ss.SSS，默认 0（useTime=1 时有效）' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

export const ADD_FEATURE_CHANGE_COLOR: SkillRegistryEntry = {
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

export const ADD_FEATURE_BLINK: SkillRegistryEntry = {
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

export const ADD_FEATURE_MOVE: SkillRegistryEntry = {
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

export const ADD_FEATURE_OPEN_PAGE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_open_page',
      description: `为图元添加打开页面交互特性（OpenPage）。支持通过鼠标事件触发图纸跳转、网页打开或弹窗。
pageType=0 时 pageName 为图纸名称；pageType=1 时必须传 webPath。存储到 store.interactiveDyna，type 为 GraphTriggerOpenPage。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          act: { type: 'number', enum: [2, 3, 4, 5, 6, 14, 15, 17], description: '触发事件：2=左键按下，3=左键抬起，4=右键按下，5=右键抬起，6=双击，14=鼠标进入，15=鼠标离开，17=单击，默认 17' },
          pageType: { type: 'number', enum: [0, 1, 2, 3], description: '页面类型：0=图纸，1=网页，2=场景，3=预设面板，默认 0' },
          popType: { type: 'number', enum: [0, 1, 2], description: '打开方式：0=页面内，1=弹窗，2=新窗口，默认 0' },
          pageName: { type: 'string', description: '目标图纸名称（pageType=0 时必需）' },
          pageCode: { type: 'string', description: '目标图纸编码（pageType=0 时）' },
          pagePath: { type: 'string', description: '目标图纸路径（pageType=0 时）' },
          webPath: { type: 'string', description: '网页 URL（pageType=1 时必需）' },
          panelPath: { type: 'string', description: '预设面板路径（pageType=3 时）' },
          panelCode: { type: 'string', description: '预设面板编码（pageType=3 时）' },
          defaultPanelPath: { type: 'string', description: '预设面板默认路径（pageType=3 时）' },
          defaultPanelType: { type: 'number', description: '预设面板类型（pageType=3 时），默认 0' },
          windowPos: { type: 'number', enum: [0, 1, 2, 3, 4, 5, 6], description: '弹窗位置：0=鼠标，1=左上，2=右下，3=自定义，4=左下，5=右上，6=居中，默认 0（popType=1 时）' },
          posX: { type: 'number', description: '自定义位置 X（windowPos=3 时），默认 0' },
          posY: { type: 'number', description: '自定义位置 Y（windowPos=3 时），默认 0' },
          customSize: { type: 'number', enum: [0, 1], description: '弹窗大小模式：0=自适应内容，1=自定义，默认 0' },
          width: { type: 'number', description: '弹窗宽度（customSize=1 时），默认 400' },
          height: { type: 'number', description: '弹窗高度（customSize=1 时），默认 300' },
          title: { type: 'string', description: '弹窗标题，默认空' },
          defaultFullscreen: { type: 'number', enum: [0, 1], description: '是否默认全屏：0=否，1=是，默认 0' },
          titleTextClr: { type: 'string', description: '标题文字颜色，默认 #000000' },
          titleBgClr: { type: 'string', description: '标题背景色，默认 #FFFFFF' },
          borderClr: { type: 'string', description: '边框颜色，默认 #000000' },
          checkEnable: { type: 'number', enum: [0, 1], description: '是否启用操作使能检查：0=否，1=是，默认 0' },
          checkDataSourceKey: { type: 'string', description: '操作使能测点全路径（checkEnable=1 时必需）' },
        },
        required: ['elementName'],
      },
    },
  },
}

export const ADD_FEATURE_ROTATE: SkillRegistryEntry = {
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
          pivotX: { type: 'number', description: '仅图纸：旋转中心的画布绝对 x 坐标。图元视觉中心与包围盒中心不重合时（如 3 叶片扇叶绕轮毂圆心旋转）必须与 pivotY 一起传轮毂圆心，服务端会把旋转中心设为该点' },
          pivotY: { type: 'number', description: '仅图纸：旋转中心的画布绝对 y 坐标，与 pivotX 配合使用' },
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

export const ADD_FEATURE_SCALE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_scale',
      description: `为图元添加缩放动态特性（Scale）。将数据源的值按量程线性映射为缩放比例（zoomMin~zoomMax），数据源是必需的。
zoomMode=0 等比缩放：宽高同比例，使用 dsDataSourceKey/pos/zoomMin/zoomMax 及量程；zoomMode=1 分别缩放：用 hZoom/vZoom 分别开启水平/垂直方向，各自配置 h* / v* 参数。
缩放比例范围 0~10，zoomMax 必须大于 zoomMin。存储到 store.dynamicDyna，type 为 GraphDynaZoom。
缩放中心默认是图元中心（pos/hPos/vPos=0），图元会向两侧同时伸缩。用缩放做进度条/液位条（强制）：
- 目标图元（如 barFill）的位置和宽高与轨道（barBg）一致，代表满量程；比例 zoomMin=0、zoomMax=1，量程与测点量程一致。
- 必须把缩放中心固定在起点侧，否则条会从中间向两边变长，起点处出现空隙：横向条用 zoomMode=1 且 hZoom=1、hPos=3（左端固定）、vZoom=0；纵向条用 vZoom=1、vPos=2（底端固定）、hZoom=0。
- 优先考虑 add_feature_fill（按比例填充，天然从起点开始）。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          zoomMode: { type: 'number', enum: [0, 1], description: '缩放方式：0=等比缩放，1=分别缩放（水平/垂直独立），默认 0' },
          dsDataSourceKey: { type: 'string', description: '等比缩放的驱动测点全路径（zoomMode=0 时必需），形如 "100:XAM_001.AV"' },
          pos: { type: 'number', enum: [0, 1, 2, 3, 4], description: '等比缩放中心：0=中心，1=上，2=下，3=左，4=右，默认 0' },
          zoomMin: { type: 'number', description: '最小缩放比例（对应量程下限），默认 1，范围 0~10' },
          zoomMax: { type: 'number', description: '最大缩放比例（对应量程上限），默认 3，范围 0~10' },
          useDB: { type: 'number', enum: [0, 1], description: '是否使用数据库量程：0=自定义 mu/md，1=数据库量程，默认 0' },
          mu: { type: 'number', description: '量程上限（useDB=0 时），默认 100' },
          md: { type: 'number', description: '量程下限（useDB=0 时），默认 0' },
          muDataSourceKey: { type: 'string', description: '数据库量程上限测点全路径（useDB=1 时）' },
          mdDataSourceKey: { type: 'string', description: '数据库量程下限测点全路径（useDB=1 时）' },
          hZoom: { type: 'number', enum: [0, 1], description: 'zoomMode=1：是否开启水平缩放，默认 1' },
          hDataSourceKey: { type: 'string', description: 'zoomMode=1：水平缩放驱动测点全路径' },
          hPos: { type: 'number', enum: [0, 3, 4], description: '水平缩放中心：0=中心，3=左，4=右，默认 0' },
          hZoomMin: { type: 'number', description: '水平最小缩放比例，默认 1' },
          hZoomMax: { type: 'number', description: '水平最大缩放比例，默认 3' },
          hUseDB: { type: 'number', enum: [0, 1], description: '水平是否使用数据库量程，默认 0' },
          hMu: { type: 'number', description: '水平量程上限（hUseDB=0 时），默认 100' },
          hMd: { type: 'number', description: '水平量程下限（hUseDB=0 时），默认 0' },
          hMuDataSourceKey: { type: 'string', description: '水平数据库量程上限测点（hUseDB=1 时）' },
          hMdDataSourceKey: { type: 'string', description: '水平数据库量程下限测点（hUseDB=1 时）' },
          vZoom: { type: 'number', enum: [0, 1], description: 'zoomMode=1：是否开启垂直缩放，默认 1' },
          vDataSourceKey: { type: 'string', description: 'zoomMode=1：垂直缩放驱动测点全路径' },
          vPos: { type: 'number', enum: [0, 1, 2], description: '垂直缩放中心：0=中心，1=上，2=下，默认 0' },
          vZoomMin: { type: 'number', description: '垂直最小缩放比例，默认 1' },
          vZoomMax: { type: 'number', description: '垂直最大缩放比例，默认 3' },
          vUseDB: { type: 'number', enum: [0, 1], description: '垂直是否使用数据库量程，默认 0' },
          vMu: { type: 'number', description: '垂直量程上限（vUseDB=0 时），默认 100' },
          vMd: { type: 'number', description: '垂直量程下限（vUseDB=0 时），默认 0' },
          vMuDataSourceKey: { type: 'string', description: '垂直数据库量程上限测点（vUseDB=1 时）' },
          vMdDataSourceKey: { type: 'string', description: '垂直数据库量程下限测点（vUseDB=1 时）' },
          recover: { type: 'number', enum: [0, 1], description: '条件不满足时是否恢复为缩放前的大小：1=是，0=否，默认 0（等比与分别缩放均有效）' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

export const ADD_FEATURE_FILL: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_fill',
      description: `为图元添加填充动态特性（Fill）。按数据源值在量程内的比例，以 fillClr 颜色按 fillDir 方向填充图元（如液位、进度条、储罐液面），数据源是必需的。
填充比例范围由 minFill~maxFill（0~100%）对应量程下限~上限。存储到 store.dynamicDyna，type 为 GraphDynaFillColor。
填充按目标图元自身的外框计算：填充区从 fillDir 指定的一侧开始，占图元长度/高度的“比例”，剩余部分显示图元原有填充色。
进度条/液位条的使用要求（强制）：
- 目标图元（如 barFill）的宽高必须与轨道（barBg）完全相同、位置对齐，代表“满量程”；禁止按当前值把它做成更短的矩形，否则填充区与轨道起点之间会出现空隙。
- 图元自身的填充色应与轨道背景一致或为透明，fillClr 必须显式传入进度颜色（不要用默认黑色，否则深色背景下填充区看起来像“没有从头开始”）。
- 横向进度条 fillDir=2（从左到右），纵向液位 fillDir=1（从下到上），不要依赖默认值。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          dsDataSourceKey: { type: 'string', description: '驱动填充的测点全路径（必需），形如 "100:XAM_001.AV"' },
          fillDir: { type: 'number', enum: [0, 1, 2, 3], description: '填充方向：0=从上到下，1=从下到上，2=从左到右，3=从右到左，默认 1' },
          fillClr: { type: 'string', description: '填充颜色，默认 rgb(0, 0, 0)' },
          fillGra: { type: 'string', description: '填充渐变模式，默认空（无渐变）；仅图纸图元支持' },
          fillGraClr: { type: 'string', description: '填充渐变色，默认 rgb(255, 255, 255)' },
          minFill: { type: 'number', description: '最小填充比例 0~100（对应量程下限），默认 0' },
          maxFill: { type: 'number', description: '最大填充比例 0~100（对应量程上限），默认 100' },
          useDB: { type: 'number', enum: [0, 1], description: '是否使用数据库量程：0=自定义 mu/md，1=数据库量程，默认 0' },
          mu: { type: 'number', description: '量程上限（useDB=0 时），默认 100' },
          md: { type: 'number', description: '量程下限（useDB=0 时），默认 0' },
          muDataSourceKey: { type: 'string', description: '数据库量程上限测点全路径（useDB=1 时）' },
          mdDataSourceKey: { type: 'string', description: '数据库量程下限测点全路径（useDB=1 时）' },
          reSet: { type: 'number', enum: [0, 1], description: '条件不满足时是否恢复为未填充：1=是，0=否，默认 0' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName', 'dsDataSourceKey'],
      },
    },
  },
}

export const ADD_FEATURE_DASH_FLOW: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_dash_flow',
      description: `为线条/折线/管道等线形图元添加流动动态特性（DashFlow），沿路径呈现流体流动动画。条件满足时流动。
flowGroupType=background 为背景色块流动，particle 为粒子流动。存储到 store.dynamicDyna，type 为 GraphDynaDashFlow。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          flowDirection: { type: 'number', enum: [0, 1], description: '流动方向：0=正向，1=反向，默认 0' },
          flowSpeed: { type: 'number', enum: [10, 7, 5, 3, 1], description: '流动速度：10=极快，7=快，5=中速，3=慢，1=极慢，默认 5' },
          flowGroupType: { type: 'string', enum: ['background', 'particle'], description: '流动样式：background=背景色，particle=粒子，默认 background' },
          flowGroupColor: { type: 'string', description: '流动元素/粒子颜色，默认 #F3F77E' },
          flowGroupNum: { type: 'number', description: '流动组个数 0~100（background），默认 1' },
          flowGroupCount: { type: 'number', description: '每组流动元素数量 0~100（background），默认 10' },
          flowGroupGap: { type: 'number', description: '流动元素间距 0~100（background），默认 3.5' },
          flowGroupMax: { type: 'number', description: '元素最大尺寸 0~100（background），默认 7' },
          flowGroupMin: { type: 'number', description: '元素最小尺寸 0~100（background），默认 0' },
          keepDirection: { type: 'number', enum: [0, 1], description: '是否保持路径方向（background），默认 0' },
          flowAutoreverse: { type: 'number', enum: [0, 1], description: '是否正反交替流动，默认 0' },
          particleSize: { type: 'number', description: '粒子大小 1~50（particle），默认 10' },
          particleDensity: { type: 'number', description: '粒子密度 1~10（particle），默认 3' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

export const ADD_FEATURE_OPERATION_ENABLE: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_operation_enable',
      description: `为图元添加操作使能动态特性（OperationEnable），按条件控制图元的交互操作（写值、打开画面等）是否可用。
enableType=0 条件满足可操作、不满足不可操作；1 条件满足仅可操作；2 条件满足仅不可操作。必须有用户明确指定的条件才有意义。存储到 store.dynamicDyna，type 为 GraphDynaEnableEvent。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          enableType: { type: 'number', enum: [0, 1, 2], description: '使能类型：0=条件满足可操作且不满足不可操作，1=条件满足仅可操作，2=条件满足仅不可操作，默认 0' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

const MULTI_STATE_CONDITION_PROPS = {
  dataSourceKey: { type: 'string', description: '该状态的条件测点全路径（必需），形如 "100:XAM_001.AV"，必须来自用户请求' },
  conditionOperator: { type: 'number', description: '比较运算符：0=, 1=!=, 2=>, 3=<, 4=>=, 5=<=，默认 0' },
  conditionValue: { type: 'string', description: '比较值，必须来自用户请求' },
} as const

export const ADD_FEATURE_MULTISTATE_TEXT: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_multistate_text',
      description: `为文字图元添加多状态文字动态特性（MultiStateText）。按 states 顺序判断每个状态的条件，条件满足时显示对应文字，如“值=0 显示停止，值=1 显示运行”。
状态及其条件必须来自用户的明确描述，禁止自行推断。存储到 store.dynamicDyna，type 为 GraphDynaChangeStringMul。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标文字图元名称（node_id 或 name）' },
          states: {
            type: 'array',
            description: '状态列表，至少 1 个',
            items: {
              type: 'object',
              properties: {
                ...MULTI_STATE_CONDITION_PROPS,
                text: { type: 'string', description: '条件满足时显示的文字' },
              },
              required: ['dataSourceKey', 'conditionValue', 'text'],
            },
          },
        },
        required: ['elementName', 'states'],
      },
    },
  },
}

export const ADD_FEATURE_MULTISTATE_COLOR: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_multistate_color',
      description: `为图元添加多状态颜色动态特性（MultiStateColor）。按 states 顺序判断每个状态的条件，条件满足时把颜色应用到图元，如“值=0 灰色，值=1 绿色，值=2 红色”。
通过 isFullClr/isFrameClr/isTextClr 选择改变填充色、边框色、文字色，三者都不传时默认改变填充色。
状态及其条件必须来自用户的明确描述，禁止自行推断。存储到 store.dynamicDyna，type 为 GraphDynaChangeClrMul。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          states: {
            type: 'array',
            description: '状态列表，至少 1 个',
            items: {
              type: 'object',
              properties: {
                ...MULTI_STATE_CONDITION_PROPS,
                color: { type: 'string', description: '条件满足时的颜色（rgb/rgba/hex），如 #00ff00' },
              },
              required: ['dataSourceKey', 'conditionValue', 'color'],
            },
          },
          isFullClr: { type: 'number', enum: [0, 1], description: '是否改变填充色' },
          isFrameClr: { type: 'number', enum: [0, 1], description: '是否改变边框色' },
          isTextClr: { type: 'number', enum: [0, 1], description: '是否改变文字色' },
        },
        required: ['elementName', 'states'],
      },
    },
  },
}

export const ADD_FEATURE_TIP_SHOW: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_tip_show',
      description: `为图元添加 Tip 显示交互特性（TipShow）。鼠标触发事件时在指定位置弹出提示：显示测点值（tipType=0）或静态文本（tipType=1）。
存储到 store.interactiveDyna，type 为 GraphTriggerTip，使用 act 定义触发事件（默认悬停）。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          act: { type: 'number', enum: [2, 3, 4, 5, 6, 10, 16, 17], description: '触发事件：2=左键按下，3=左键抬起，4=右键按下，5=右键抬起，6=双击，10=鼠标移动，16=悬停，17=单击，默认 16' },
          tipType: { type: 'number', enum: [0, 1], description: 'Tip 信息源：0=显示点值，1=显示静态文本，默认 0' },
          showPos: { type: 'number', enum: [0, 1, 2, 3, 4], description: '显示位置：0=鼠标位置，1=左上，2=左下，3=右上，4=右下，默认 0' },
          tipDataSourceKey: { type: 'string', description: '要显示的测点全路径（tipType=0 时必需）' },
          showPercent: { type: 'number', enum: [0, 1], description: '是否显示比例（tipType=0），默认 0' },
          calculatePercent: { type: 'number', enum: [0, 1], description: '是否按量程计算比例（showPercent=1），默认 0' },
          muDataSourceKey: { type: 'string', description: '量程上限测点全路径（calculatePercent=1 时）' },
          mdDataSourceKey: { type: 'string', description: '量程下限测点全路径（calculatePercent=1 时）' },
          itemNegative: { type: 'number', enum: [0, 1], description: '项值是否取反（showPercent=1），默认 0' },
          showText: { type: 'string', description: '静态文本内容（tipType=1 时必需）' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName'],
      },
    },
  },
}

export const ADD_FEATURE_RESET: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'add_feature_reset',
      description: `为图元添加置位交互特性（Reset）。用户触发鼠标事件后，对测点输出脉冲或电平（置0/置1），可指定按位置位，并可二次确认。
outType=1 脉冲输出（pulseType 0=置0脉冲，1=置1脉冲，pulseWidth 脉冲宽度）；outType=0 电平输出（levelType 0=置0电平，1=置1电平）。
存储到 store.interactiveDyna，type 为 GraphTriggerRegisterReset，使用 act 定义触发事件。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          dataSourceKey: { type: 'string', description: '要置位的测点全路径（必需），形如 "100:XAM_001.AV"' },
          act: { type: 'number', enum: [2, 3, 4, 5, 6], description: '触发事件：2=左键按下，3=左键抬起，4=右键按下，5=右键抬起，6=双击，默认 2' },
          outType: { type: 'number', enum: [0, 1], description: '输出方式：1=脉冲输出，0=电平输出，默认 1' },
          pulseType: { type: 'number', enum: [0, 1], description: '脉冲输出：0=置0脉冲，1=置1脉冲，默认 0（outType=1 时）' },
          pulseWidth: { type: 'number', description: '脉冲宽度 0~999（outType=1 时），默认 3' },
          levelType: { type: 'number', enum: [0, 1], description: '电平输出：0=置0电平，1=置1电平，默认 0（outType=0 时）' },
          bitEnable: { type: 'number', enum: [0, 1], description: '是否按位置位：0=否，1=是，默认 0' },
          bitNum: { type: 'number', description: '位号 0~31（bitEnable=1 时），默认 0' },
          confirmEnable: { type: 'number', enum: [0, 1], description: '是否二次确认：0=否，1=是，默认 0' },
          confirmDes: { type: 'string', description: '二次确认描述（confirmEnable=1 时）' },
          confirmPos: { type: 'number', enum: [0, 1, 2, 3, 4, 5, 6], description: '确认框位置：0=鼠标，1=左上，2=右下，3=自定义，4=左下，5=右上，6=居中，默认 0' },
          posX: { type: 'number', description: '自定义位置 X（confirmPos=3 时），默认 0' },
          posY: { type: 'number', description: '自定义位置 Y（confirmPos=3 时），默认 0' },
        },
        required: ['elementName', 'dataSourceKey'],
      },
    },
  },
}
