const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { minimalAssembleArgs } = require('../dist/agent/agent-service')
const { createSession, executeToolCall } = require('../dist/tools')
const { compactToolResult } = require('../dist/tools/core/result-compactor')
const { selectTools, narrowToolsForRound } = require('../dist/agent/tool-routing')

const exec = (session, name, args) => executeToolCall(name, args, session, () => {}, () => {})

describe('工具结果精简', () => {
  it('创建 / 特性 / 组装结果只回传摘要，体积大幅缩小', () => {
    const session = createSession('display')
    exec(session, 'declare_generation_plan', { summary: 'x', requiredFeatureTools: [], distinctFeatureTargets: false })
    const rawCreate = exec(session, 'create_display_rect', { x: 10, y: 20, width: 100, height: 40, cornerRadius: 6, name: '按钮1' })
    const brief = JSON.parse(compactToolResult('create_display_rect', rawCreate))
    assert.equal(brief.success, true)
    assert.equal(brief.name, '按钮1')
    assert.equal(brief.type, 'RoundRect')
    assert.deepEqual([brief.x, brief.y, brief.width, brief.height], [10, 20, 100, 40])
    assert.equal(brief.id, JSON.parse(rawCreate).id)
    assert.ok(compactToolResult('create_display_rect', rawCreate).length < rawCreate.length / 3)

    const rawFeature = exec(session, 'add_feature_blink', { elementName: brief.id })
    const feature = JSON.parse(compactToolResult('add_feature_blink', rawFeature))
    assert.equal(feature.success, true)
    assert.equal(feature.element.features, 1)
    assert.equal(feature.element.id, brief.id)

    const rawText = exec(session, 'create_display_text', { text: '这是一段比较长的标题文字内容，用于测试摘要中文字预览的截断效果是否正常', x: 0, y: 0, width: 300, height: 30 })
    assert.match(JSON.parse(compactToolResult('create_display_text', rawText)).text, /…$/)

    const rawAssemble = exec(session, 'assemble_display', { pageName: 'p', pageWidth: 1600, pageHeight: 900 })
    const assembled = JSON.parse(compactToolResult('assemble_display', rawAssemble))
    assert.deepEqual(assembled, { success: true, message: '图纸已组装，服务端正在校验', elementCount: 2, pageWidth: 1600, pageHeight: 900 })
  })

  it('失败结果与普通结果保持原样，超长结果截断', () => {
    const failed = JSON.stringify({ success: false, error: '未找到图元: x' })
    assert.equal(compactToolResult('update_element', failed), failed)
    const plan = JSON.stringify({ success: true, plan: { summary: 's' } })
    assert.equal(compactToolResult('declare_generation_plan', plan), plan)
    assert.match(compactToolResult('lint_display', JSON.stringify({ success: true, issues: 'x'.repeat(9000) })), /已截断/)
    assert.equal(compactToolResult('x', 'not json'), 'not json')
  })

  it('图符图元按 node_id 与 attrs 生成摘要', () => {
    const session = createSession('symbol')
    const raw = exec(session, 'create_symbol_rect', { x: 5, y: 6, width: 50, height: 60, name: '矩形A' })
    const brief = JSON.parse(compactToolResult('create_symbol_rect', raw))
    assert.equal(brief.id, JSON.parse(raw).store.node_id)
    assert.equal(brief.name, '矩形A')
    assert.equal(brief.type, 'Rect')
  })
})

describe('组装参数截断', () => {
  it('只保留名称与画布参数，丢弃图元数据', () => {
    const raw = '{"pageName":"设备\\"控制\\"面板","pageWidth":1600,"pageHeight":900,"bgColor":"#101820","elementsData":[{"id":"a","name":"x","width":1'
    assert.deepEqual(JSON.parse(minimalAssembleArgs(raw)), { pageName: '设备"控制"面板', bgColor: '#101820', pageWidth: 1600, pageHeight: 900 })
    // 图元数据在前、名称在后，也不能把图元内部的 width/name 当作画布参数
    const reversed = '{"elementsData":[{"id":"a","pageName":"假的","width":5}],"pageName":"真的","width":800'
    assert.deepEqual(JSON.parse(minimalAssembleArgs(reversed)), { pageName: '真的', width: 800 })
    assert.deepEqual(JSON.parse(minimalAssembleArgs('{"elementsData":[')), {})
  })
})

describe('按轮次收窄工具', () => {
  const prompt = '左侧 6 个按钮，点击让风机旋转，报警灯闪烁，所有按钮鼠标移入变亮'
  const all = selectTools('display', { prompt, isEditing: false })
  const names = tools => tools.map(t => t.function.name)

  it('声明计划前不下发特性工具，其余工具保留', () => {
    const round1 = names(narrowToolsForRound(all, { prompt }))
    assert.ok(round1.includes('declare_generation_plan'))
    assert.ok(round1.includes('create_display_rect'))
    assert.ok(round1.includes('assemble_display'))
    assert.ok(!round1.some(name => name.startsWith('add_feature_')))
    assert.ok(!round1.includes('add_event_definition'))
    assert.ok(JSON.stringify(narrowToolsForRound(all, { prompt })).length < JSON.stringify(all).length * 0.6)
  })

  it('声明计划后只下发计划内特性工具，以及意图明确的事件定义', () => {
    const after = names(narrowToolsForRound(all, { prompt, plannedFeatureTools: ['add_feature_rotate', 'add_feature_blink'] }))
    assert.ok(after.includes('add_feature_rotate'))
    assert.ok(after.includes('add_feature_blink'))
    assert.ok(!after.includes('add_feature_scale'))
    assert.ok(after.includes('add_event_definition'), '提示词含“点击/移入”，事件定义按意图保留')
    assert.ok(!after.includes('set_pipe_script'))
  })
})
