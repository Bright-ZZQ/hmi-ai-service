const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { createSession, executeToolCall } = require('../dist/agent/agent-service')

const run = (name, args, session) => JSON.parse(executeToolCall(name, args, session, () => {}, () => {}))
const encode = text => Buffer.from(text, 'utf-8').toString('base64')

describe('文字图元 base64 编码', () => {
  it('update_element 修改 text 时自动 base64 编码', () => {
    const session = createSession('display')
    run('create_display_text', { x: 10, y: 10, text: '旧文字', name: '标题' }, session)
    run('update_element', { target: '标题', changesJson: JSON.stringify({ text: '新文字 New' }) }, session)

    assert.equal(session.workingElements[0].text, encode('新文字 New'))
  })

  it('assemble_display 修正显式传入的未编码文字', () => {
    const session = createSession('display')
    const text = run('create_display_text', { x: 10, y: 10, text: '原文', name: '标题' }, session)
    const copy = { ...text, id: undefined, name: '另一个', text: '未编码的文字' }
    run('assemble_display', { pageName: 't', elementsData: [copy] }, session)

    const [element] = session.finalJson.document.elements
    assert.equal(element.text, encode('未编码的文字'))
  })

  it('文字中的 HTML 转义实体还原为原字符', () => {
    const session = createSession('display')
    run('create_display_text', { x: 10, y: 10, text: '报警&gt;80 &amp;&lt; &amp;gt;', name: '标题' }, session)
    assert.equal(session.workingElements[0].text, encode('报警>80 &< &gt;'))

    run('update_element', { target: '标题', changesJson: JSON.stringify({ text: '温度&gt;90' }) }, session)
    assert.equal(session.workingElements[0].text, encode('温度>90'))
  })

  it('assemble_display 修正已编码文字中的 HTML 实体', () => {
    const session = createSession('display')
    const text = run('create_display_text', { x: 10, y: 10, text: 'x', name: '标题' }, session)
    const copy = { ...text, id: undefined, name: '另一个', text: encode('报警&gt;80') }
    run('assemble_display', { pageName: 't', elementsData: [copy] }, session)

    assert.equal(session.finalJson.document.elements[0].text, encode('报警>80'))
  })

  it('assemble_display 不会重复编码已合法的 base64', () => {
    const session = createSession('display')
    run('create_display_text', { x: 10, y: 10, text: 'Hello', name: '标题' }, session)
    run('assemble_display', { pageName: 't' }, session)

    assert.equal(session.finalJson.document.elements[0].text, encode('Hello'))
  })
})
