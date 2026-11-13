/**
 * Display 图纸组 — 动态/交互特性工具
 *
 * 动态特性：旋转 / 移动 / 闪烁 / 变色 / 数值显示 / 显隐，写入 store.dynamicDyna。
 * 交互特性：写值 / 打开页面，写入 store.interactiveDyna。
 * 其中旋转/移动/闪烁/变色/数值显示/显隐/写值/打开页面的 toolDef 会被 symbol/features.ts 复用（仅改 group）。
 */

import type { SkillRegistryEntry } from '../../../types'
import { FEATURE_CONDITION_PROPS } from '../_shared'
import { ACTION_KINDS, DISPLAY_TRIGGERS, MOUSE_EVENT_TYPES, SCHEDULE_TYPES, SCRIPT_API_REFERENCE } from '../../event-definition'
import { PAGE_SCRIPT_API_REFERENCE, PIPE_SCRIPT_API_REFERENCE } from '../../script-tools'

export const FIND_DISPLAY_ELEMENTS: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'find_elements',
      description: `在当前图纸中按名称或文字图元的文字内容（服务端已解码 base64）查找候选图元，返回 id、name、type、text、坐标尺寸及相对画布的大致位置（如“右上”）。
用户用自然语言指代图元（如“名为XX的按钮”“文字为‘启动’的图元”）时先调用此工具，再用返回的 id 作为 elementName 调用后续工具。keyword 为空则列出全部图元。`,
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '名称或文字内容关键词，可为空' },
        },
        required: [],
      },
    },
  },
}

export const ASK_USER: SkillRegistryEntry = {
  group: 'display',
  toolDef: {
    type: 'function',
    function: {
      name: 'ask_user',
      description: `无法确定用户所指图元（find_elements 返回 0 个或多个候选）时，向用户提问并结束本轮，等待用户回答后再继续。
不要猜测目标图元。问题应简短、可直接回答，可基于候选的位置/相邻关系提问，例如“该图元是否在图纸右上方？”“该图元是否在‘XX’图元旁边？”，也可列出候选让用户选择。`,
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '向用户提出的问题' },
          options: { type: 'array', items: { type: 'string' }, description: '可选的快捷回答（如“是”“否”或候选图元描述），可省略' },
        },
        required: ['question'],
      },
    },
  },
}

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
- action 动作：script 脚本(script)；visible 显隐(visible: 0隐藏/1显示/2切换)；move 移动(moveType moveBy|moveTo, x, y)；rotate 旋转(angle, clockwise)；scale 缩放(scaleX, scaleY)；size 尺寸(width, height)；color 变色(textColor/borderColor/backgroundColor 至少一个)；openDialog 弹窗(url,width,height,dialogPosition)；openWindow 新窗口(url)。
- 除 script/openDialog/openWindow 外，动作作用于 targetElements 指定的图元 id 列表；图元级缺省作用于自身，图纸级必须指定。
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
需要由用户操作、定时或数值变化触发的逻辑应使用 add_event_definition，而不是本工具。
${PAGE_SCRIPT_API_REFERENCE}`,
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: '图纸脚本函数体' },
          mode: { type: 'string', enum: ['append', 'replace'], description: 'append=追加到已有脚本之后（默认，保留原脚本）；replace=完全替换已有脚本，仅在用户明确要求修改/替换原脚本时使用' },
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
禁止自行推断条件；用户未明确指定条件时特性持续按 isVisible 生效。存储到 store.dynamicDyna，type 为 GraphDynaVisible。`,
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
对齐方式、工程单位、开关量置0/置1说明、时间格式化，以及质量位无效时闪烁。存储到 store.dynamicDyna，type 为 GraphDynaValDisplay。`,
      parameters: {
        type: 'object',
        properties: {
          elementName: { type: 'string', description: '目标图元名称（node_id 或 name）' },
          ...FEATURE_CONDITION_PROPS,
          dataSourceKey: { type: 'string', description: '要显示的数值测点全路径（必需），形如 "100:XAM_001.AV"；服务端按最后一个 "." 拆分为 tagName 与 itemName' },
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
          useTime: { type: 'number', description: '是否将数值按时间戳格式化：0=否，1=是，默认 0' },
          timeFormat: { type: 'number', enum: [0, 1, 2, 3], description: '时间格式：0=YYYY-MM-DD HH:mm:ss，1=YYYY-MM-DD，2=HH:mm:ss，3=HH:mm:ss.SSS，默认 0（useTime=1 时有效）' },
          not: { type: 'boolean', description: '条件取反，默认 false' },
        },
        required: ['elementName', 'dataSourceKey'],
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
