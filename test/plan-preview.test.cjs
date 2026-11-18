const assert = require('node:assert/strict')
const { describe, it, afterEach } = require('node:test')
const { generatePlanPreview } = require('../dist/agent/plan-preview')

const realFetch = global.fetch
const config = { modelApiUrl: 'http://x/v1', modelApiKey: 'k', model: 'm', previewBody: { thinking: { type: 'disabled' } } }

const sse = (chunks) => new Response(new ReadableStream({
  start(controller) {
    const enc = new TextEncoder()
    for (const delta of chunks) controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`))
    controller.enqueue(enc.encode('data: [DONE]\n\n'))
    controller.close()
  },
}), { status: 200 })

describe('generatePlanPreview 方案预览', () => {
  afterEach(() => { global.fetch = realFetch })

  it('流式返回正文并忽略 reasoning_content，请求体带 previewBody 且不带工具', async () => {
    let body
    global.fetch = async (_url, init) => { body = JSON.parse(init.body); return sse([{ reasoning_content: '想想' }, { content: '- 左侧按钮' }, { content: '\n- 右侧对象' }]) }
    const pieces = []
    const text = await generatePlanPreview('创建一张设备控制面板图纸，左侧按钮右侧对象', 'display', config, {}, t => pieces.push(t))
    assert.equal(text, '- 左侧按钮\n- 右侧对象')
    assert.deepEqual(pieces, ['- 左侧按钮', '\n- 右侧对象'])
    assert.deepEqual(body.thinking, { type: 'disabled' })
    assert.equal(body.tools, undefined)
    assert.equal(body.stream, true)
  })

  it('过短提示词不调用模型；失败/非 200 静默返回空串', async () => {
    let called = 0
    global.fetch = async () => { called++; return new Response('boom', { status: 500 }) }
    assert.equal(await generatePlanPreview('画个圆', 'display', config, {}, () => {}), '')
    assert.equal(called, 0)
    assert.equal(await generatePlanPreview('创建一张设备控制面板图纸，左侧按钮右侧对象', 'display', config, {}, () => {}), '')
    global.fetch = async () => { throw new Error('network') }
    assert.equal(await generatePlanPreview('创建一张设备控制面板图纸，左侧按钮右侧对象', 'display', config, {}, () => {}), '')
  })

  it('编辑模式把已有图元概况带给模型', async () => {
    let body
    global.fetch = async (_url, init) => { body = JSON.parse(init.body); return sse([{ content: '- ok' }]) }
    const currentJson = { document: { elements: [{ name: '风机' }, { name: '按钮' }] } }
    await generatePlanPreview('给风机增加一个启停按钮并加上闪烁效果提示', 'display', config, { currentJson }, () => {})
    assert.match(body.messages[0].content, /已有 2 个图元.*风机、按钮/)
  })
})
