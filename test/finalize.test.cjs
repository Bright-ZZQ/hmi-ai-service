const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { createSession, executeToolCall } = require('../dist/agent/agent-service')
const { validateSessionOutput } = require('../dist/agent/tools')

const run = (name, args, session) => JSON.parse(executeToolCall(name, args, session, () => {}, () => {}))
const planErrors = errors => errors.filter(error => error.path === 'generationPlan')

const buildDisplaySession = () => {
  const session = createSession('display')
  run('create_display_rect', { x: 100, y: 100, width: 200, height: 100, name: '底板' }, session)
  run('assemble_display', { pageName: '测试图纸' }, session)
  assert.ok(session.finalJson)
  return session
}

describe('validateSessionOutput', () => {
  it('未声明计划时 requirePlan 决定是否校验计划', () => {
    const session = buildDisplaySession()

    assert.ok(planErrors(validateSessionOutput(session, session.finalJson, { requirePlan: true })).length > 0)
    assert.equal(planErrors(validateSessionOutput(session, session.finalJson, { requirePlan: false })).length, 0)
  })

  it('已声明的计划即使 requirePlan=false 也照常校验', () => {
    const session = buildDisplaySession()
    run('declare_generation_plan', { summary: '数量不符', expectedElementCount: 3 }, session)

    assert.ok(planErrors(validateSessionOutput(session, session.finalJson, { requirePlan: false })).length > 0)
  })

  it('编辑场景下数量只统计本轮新增图元', () => {
    const base = buildDisplaySession()
    const session = createSession('display', base.finalJson)
    run('create_display_rect', { x: 400, y: 100, width: 200, height: 100, name: '新增' }, session)
    run('declare_generation_plan', { summary: '新增一个', expectedElementCount: 1 }, session)
    run('assemble_display', { pageName: '测试图纸' }, session)
    assert.ok(session.finalJson)

    assert.equal(planErrors(validateSessionOutput(session, session.finalJson, { requirePlan: true })).length, 0)
  })
})
