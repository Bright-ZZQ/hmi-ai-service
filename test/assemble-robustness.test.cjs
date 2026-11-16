const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { createSession, executeToolCall } = require('../dist/agent/agent-service')
const { validateGenerationPlan } = require('../dist/agent/generation-plan')

const run = (name, args, session) => JSON.parse(executeToolCall(name, args, session, () => {}, () => {}))

describe('组装与校验健壮性', () => {
  it('缺少尺寸的图元被拒绝，不进入工作区', () => {
    const session = createSession('display')
    const result = run('create_display_rect', { x: 10, y: 10 }, session)

    assert.equal(result.success, false)
    assert.equal(session.workingElements.length, 0)
  })

  it('文本图元缺少 text 时不抛错', () => {
    const session = createSession('display')
    const result = run('create_display_text', { x: 10, y: 10 }, session)

    assert.equal(result.type, 'Text')
    assert.equal(session.workingElements.length, 1)
  })

  it('显式传入 elementsData 时回溯到带特性的原图元', () => {
    const session = createSession('display')
    const rect = run('create_display_rect', { x: 10, y: 10, width: 50, height: 50, name: '风机' }, session)
    run('create_display_rect', { x: 100, y: 10, width: 50, height: 50, name: '灯' }, session)
    session.workingElements[0].store = { dynamicDyna: [{ type: 'rotate' }] }

    // 模型转写的副本丢失了 store
    const copy = { ...rect, store: undefined }
    run('assemble_display', { pageName: 't', elementsData: [copy] }, session)

    const elements = session.finalJson.document.elements
    assert.equal(elements.length, 1)
    assert.deepEqual(elements[0].store.dynamicDyna, [{ type: 'rotate' }])
  })

  it('计划校验失败信息指出缺少的特性工具', () => {
    const plan = { summary: '', requiredFeatureTools: ['a', 'a', 'b'], distinctFeatureTargets: false }
    const [message] = validateGenerationPlan(plan, 0, [{ toolName: 'a', elementKey: 'x' }])

    assert.match(message, /a 还缺 1 次/)
    assert.match(message, /b 还缺 1 次/)
  })
})
