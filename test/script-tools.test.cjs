/**
 * Script tools tests — 图纸脚本 / 管道脚本 / 图符属性绑定函数
 */

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { createSession, executeToolCall } = require('../dist/agent/agent-service')
const { getToolsForType, lintRegistry, selectTools } = require('../dist/agent/skill-registry')
const { validateScript } = require('../dist/agent/event-definition')
const { extractReadBindings, mergePageScript } = require('../dist/agent/script-tools')

function run(session, name, args) {
  return JSON.parse(executeToolCall(name, args, session, () => {}, () => {}))
}

function toolNames(editorType) {
  return getToolsForType(editorType).map(tool => tool.function.name)
}

describe('script tool registration', () => {
  it('registers script tools in the matching editor group', () => {
    assert.ok(toolNames('display').includes('set_display_script'))
    assert.ok(toolNames('display').includes('set_pipe_script'))
    assert.ok(!toolNames('display').includes('set_symbol_attr_function'))
    assert.ok(toolNames('symbol').includes('set_symbol_attr_function'))
    assert.ok(!toolNames('symbol').includes('set_display_script'))
  })

  it('passes registry lint', () => {
    assert.deepEqual(lintRegistry(), [])
  })

  it('ships script tools when the prompt expresses script intent', () => {
    const displayNames = selectTools('display', { prompt: '管道脚本控制流动' }).map(t => t.function.name)
    assert.ok(displayNames.includes('set_pipe_script'))
    const symbolNames = selectTools('symbol', { prompt: '温度超过80变红' }).map(t => t.function.name)
    assert.ok(symbolNames.includes('set_symbol_attr_function'))
  })
})

describe('script validation', () => {
  it('rejects redeclaring a parameter as let', () => {
    assert.match(validateScript('let data = 1', ['data']), /语法错误/)
  })

  it('merges appended page scripts into an isolated block', () => {
    assert.equal(mergePageScript('', 'a()', false), 'a()')
    assert.equal(mergePageScript('x()', 'a()', true), 'a()')
    assert.equal(mergePageScript('x()', 'a()', false), 'x()\n{\na()\n}')
  })

  it('extracts data bindings read by a script', () => {
    assert.deepEqual(extractReadBindings("return data.a('t') + data.a(\"p\")"), ['t', 'p'])
  })
})

describe('set_display_script', () => {
  it('stores a validated script and rejects forbidden APIs', () => {
    const session = createSession('display')
    const bad = run(session, 'set_display_script', { script: 'fetch("/x")' })
    assert.equal(bad.success, false)
    assert.equal(session.displayScript, undefined)

    const ok = run(session, 'set_display_script', { script: 'const n = data.findNodeByIdEx("a"); if (n) n.setVisibleEx(false)' })
    assert.equal(ok.success, true)
    assert.match(session.displayScript.script, /findNodeByIdEx/)
    assert.equal(session.displayScript.replace, false)
  })

  it('unwraps a function shell the model may add', () => {
    const session = createSession('display')
    run(session, 'set_display_script', { script: 'function(data){ data.setZoomEx({x:1,y:1}) }' })
    assert.equal(session.displayScript.script, 'data.setZoomEx({x:1,y:1})')
  })
})

describe('set_pipe_script', () => {
  const pipeArgs = { polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }], name: '进水管' }

  it('writes pipeScript and enables the flow group on a pipe', () => {
    const session = createSession('display')
    run(session, 'create_display_pipe', pipeArgs)
    const result = run(session, 'set_pipe_script', { elementName: '进水管', script: 'data.setScriptEnabled(true)' })
    assert.equal(result.success, true)
    assert.equal(result.element.store.pipeScript, 'data.setScriptEnabled(true)')
    assert.equal(result.element.store.flowGroupEnabled, true)
    assert.equal(session.featureExecutions.at(-1).toolName, 'set_pipe_script')
  })

  it('does not touch flowGroupEnabled when enableFlowGroup is false', () => {
    const session = createSession('display')
    run(session, 'create_display_pipe', pipeArgs)
    const result = run(session, 'set_pipe_script', { elementName: '进水管', script: 'data.setScriptEnabled(true)', enableFlowGroup: false })
    assert.equal(result.element.store.flowGroupEnabled, undefined)
  })

  it('rejects non-pipe targets', () => {
    const session = createSession('display')
    run(session, 'create_display_rect', { width: 10, height: 10, x: 0, y: 0, name: '矩形A' })
    const result = run(session, 'set_pipe_script', { elementName: '矩形A', script: 'data.setScriptEnabled(true)' })
    assert.equal(result.success, false)
    assert.match(result.error, /不是管道/)
  })
})

describe('set_symbol_attr_function', () => {
  function symbolSession() {
    const session = createSession('symbol')
    run(session, 'create_symbol_rect', { name: '罐体', width: 100, height: 100 })
    return session
  }
  const binding = { attr: 'temp', name: '温度', valueType: 'number', defaultValue: 0 }

  it('writes { func, value } to attrs and records the data binding', () => {
    const session = symbolSession()
    const result = run(session, 'set_symbol_attr_function', {
      elementName: '罐体',
      attr: 'fill',
      script: "return Number(data.a('temp')) > 80 ? '#ff0000' : '#00b050'",
      dataBindings: [binding],
    })
    assert.equal(result.success, true)
    assert.equal(result.element.attrs.fill.value, '#D8D8D8')
    assert.match(result.element.attrs.fill.func, /return/)
    assert.deepEqual(session.symbolDataBindings.map(b => b.attr), ['temp'])
  })

  it('rejects undeclared bindings, missing return and unknown attributes', () => {
    const session = symbolSession()
    const base = { elementName: '罐体', attr: 'fill', dataBindings: [] }
    const undeclared = run(session, 'set_symbol_attr_function', { ...base, script: "return data.a('temp')" })
    assert.match(undeclared.error, /未声明的数据绑定/)
    const noReturn = run(session, 'set_symbol_attr_function', { ...base, script: 'var a = 1' })
    assert.match(noReturn.error, /return/)
    const unknownAttr = run(session, 'set_symbol_attr_function', { ...base, attr: 'nonexistent', script: 'return 1' })
    assert.match(unknownAttr.error, /不存在可绑定的属性/)
    assert.equal(session.symbolDataBindings.length, 0)
  })

  it('keeps the original value when the function is replaced', () => {
    const session = symbolSession()
    const args = { elementName: '罐体', attr: 'fill', dataBindings: [binding] }
    run(session, 'set_symbol_attr_function', { ...args, script: "return data.a('temp') > 1 ? '#111111' : '#222222'" })
    const second = run(session, 'set_symbol_attr_function', { ...args, script: "return '#333333'" })
    assert.equal(second.element.attrs.fill.value, '#D8D8D8')
    assert.equal(second.element.attrs.fill.func, "return '#333333'")
  })
})
