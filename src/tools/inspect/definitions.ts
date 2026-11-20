/**
 * 图纸 / 图符共用的特性读写与调试工具
 *
 * list_features / remove_feature / update_feature / get_element_detail / check_feature_conditions / test_script
 * 同名工具在两个编辑器中共用同一套执行逻辑（inspect-tools.ts）。
 */

import type { EditorType, SkillRegistryEntry } from '../../types'
import { SCRIPT_KINDS } from '../feature/script-sandbox'

export function createInspectSkills(group: EditorType): SkillRegistryEntry[] {
  const featureHint = group === 'symbol' ? '图符图元' : '图元'
  const scriptKinds = group === 'symbol'
    ? ['symbol_func']
    : SCRIPT_KINDS.filter(kind => kind !== 'symbol_func')

  return [
    {
      group,
      toolDef: {
        type: 'function',
        function: {
          name: 'list_features',
          description: `列出${featureHint}上已配置的动态特性、交互特性与事件定义（含条件、绑定的测点、关键参数）。
传 target 返回该图元的完整特性列表（带序号 index 与 id，供 remove_feature / update_feature 使用）；不传则概览所有带特性的图元。
修改或删除已有特性前先调用本工具，不要凭空猜测特性 id。`,
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: '图元 id 或名称；省略则列出所有带特性的图元' },
            },
            required: [],
          },
        },
      },
    },
    {
      group,
      toolDef: {
        type: 'function',
        function: {
          name: 'remove_feature',
          description: `删除${featureHint}上的某个特性或事件定义。用 featureId 或 index（均来自 list_features）精确指定；也可用 featureType（特性 type 或 add_feature_* 工具名）指定一类，匹配多个时需 all=true 才会全部删除。
删除后调用 assemble 工具输出完整结果。`,
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: '图元 id 或名称' },
              featureId: { type: 'string', description: '特性 id（事件为其 name），来自 list_features' },
              index: { type: 'number', description: 'list_features 返回的序号（从 1 开始）' },
              featureType: { type: 'string', description: '特性 type（如 GraphDynaBlink）或工具名（如 add_feature_blink）' },
              all: { type: 'boolean', description: '匹配到多个特性时是否全部删除，默认 false' },
            },
            required: ['target'],
          },
        },
      },
    },
    {
      group,
      toolDef: {
        type: 'function',
        function: {
          name: 'update_feature',
          description: `修改${featureHint}上已有特性的参数，保留特性 id 与其余配置。用 featureId 或 index（来自 list_features）指定特性。
changesJson 为 JSON 对象字符串，支持 {"pars":{"参数名":新值,...},"not":true,"act":17}：pars 只能改特性已有的参数（测点参数直接传测点全路径字符串即可，数值字符串会按原类型转换）；需要不同模式的参数请删除后用 add_feature_* 重新添加。
修改触发条件用 dataSourceKey + conditionOperator + conditionValue（整体替换为这一个条件）或 clearConditions=true 清空；与 add_feature_* 相同，条件必须来自用户明确描述，不得自行推断。多状态特性的条件不可用此方式修改。
修改后调用 assemble 工具输出完整结果。`,
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: '图元 id 或名称' },
              featureId: { type: 'string', description: '特性 id，来自 list_features' },
              index: { type: 'number', description: 'list_features 返回的序号（从 1 开始）' },
              featureType: { type: 'string', description: '特性 type 或工具名；仅在该图元上此类型唯一时可单独使用' },
              changesJson: { type: 'string', description: '修改内容 JSON 对象字符串，如 {"pars":{"rotAngle":10}}' },
              dataSourceKey: { type: 'string', description: '新条件的测点全路径（替换原有条件，须来自用户明确描述）' },
              conditionOperator: { type: 'number', description: '新条件运算符：0=, 1=!=, 2=>, 3=<, 4=>=, 5=<=, 6=包含, 7=不包含, 8=在之间, 9=不在之间, 10=位运算' },
              conditionValue: { type: 'string', description: '新条件的比较值' },
              clearConditions: { type: 'boolean', description: '清空触发条件（特性变为持续生效）' },
            },
            required: ['target'],
          },
        },
      },
    },
    {
      group,
      toolDef: {
        type: 'function',
        function: {
          name: 'get_element_detail',
          description: `按需读取单个${featureHint}的详细内容，避免把整份画布 JSON 塞进上下文。
不传 paths：返回概要（类型、位置尺寸、文字内容、颜色等标量字段、嵌套字段的键名、特性数量）。
传 paths（点路径，如 "store.dynamicDyna"、"fillColor.startColor"、"localRect[0]"）：返回这些字段的完整值，单个值超过 6000 字符会被截断。`,
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: '图元 id 或名称' },
              paths: { type: 'array', items: { type: 'string' }, description: '要读取的字段路径列表（最多 20 个）' },
            },
            required: ['target'],
          },
        },
      },
    },
    {
      group,
      toolDef: {
        type: 'function',
        function: {
          name: 'check_feature_conditions',
          description: `检查特性条件是否合理（只读）：条件测点为空、运算符越界、数值比较（> < >= <=）的比较值不是数字、位运算比较值不是整数、多状态特性无状态或状态条件重复、特性数据源 ds 为空。
不传 target 检查全部图元。返回 errors / warnings 及具体位置，按结果用 update_feature 修正。`,
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: '图元 id 或名称；省略则检查全部图元' },
            },
            required: [],
          },
        },
      },
    },
    {
      group,
      toolDef: {
        type: 'function',
        function: {
          name: 'test_script',
          description: `在隔离沙箱里用模拟对象试跑脚本，发现静态校验查不出的问题：拼错的方法名、读空对象成员、死循环、定时器未清理、遗漏 return 等。不会修改任何图元。
试跑基于模拟的 data / gv / 测点值，仅验证 API 用法与基本逻辑；返回执行记录 calls（脚本对图元/页面参数/测点的操作）、warnings 与 returned（属性函数的返回值）。
kind：${scriptKinds.join(' / ')}。${group === 'symbol'
            ? 'symbol_func=图符属性绑定函数 function(data)，用 bindings 提供数据绑定的模拟值，data.a(name) 读取。'
            : 'event=事件/事件响应/定时 function(data, gv, params)；value_changed=数值变化 function(data, gv, value)；before_open=画面打开前 function(gv)；page=图纸脚本 function(data=gv, core, cache)；pipe=管道脚本 function(data, gv)，需 target 指向管道图元。'}
脚本是函数体，规则与对应的设置工具一致。`,
          parameters: {
            type: 'object',
            properties: {
              script: { type: 'string', description: '脚本函数体' },
              kind: { type: 'string', enum: scriptKinds, description: '脚本类型' },
              target: { type: 'string', description: group === 'symbol' ? '（图符脚本无需填写）' : 'event/value_changed 作为 data 的图元 id 或名称（省略则 data 为 undefined）；pipe 必填' },
              points: { type: 'string', description: '模拟测点值 JSON 对象字符串：测点全路径 → 值，如 {"100:XAM_001.AV": 85}' },
              bindings: { type: 'string', description: 'symbol_func 的数据绑定模拟值 JSON 对象字符串：绑定名 → 值，如 {"temp": 90}' },
              mainValue: { type: 'number', description: 'symbol_func 中 data.getValue() 返回的主数据值' },
              maxTimerRuns: { type: 'number', description: '最多模拟执行多少次定时器回调，默认 5，最大 30' },
            },
            required: ['script', 'kind'],
          },
        },
      },
    },
  ]
}
