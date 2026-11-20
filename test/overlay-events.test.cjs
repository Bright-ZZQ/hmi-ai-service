const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { propagateOverlayEvents, MIRROR_FLAG } = require('../dist/agent/overlay-events')
const { createSession, executeToolCall } = require('../dist/agent/agent-service')

const rectAt = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]

const clickEvent = (title, nodes = ['node-self']) => ({
  title,
  name: `event-${title}`,
  eventType: 'normal',
  type: 'onClick',
  scope: 'current',
  nodes,
  handleId: '',
  actions: [{ fnName: 'hmi:script', payload: 'gv.setPageParamsEx("run", 1);' }],
})

const hoverEvent = (type, nodes = ['node-self']) => ({
  title: type,
  name: `event-${type}-${nodes.join()}`,
  eventType: 'normal',
  type,
  scope: 'current',
  nodes,
  handleId: '',
  actions: [{ fnName: 'hmi:nodeChangeColor', payload: '{}' }],
})

function button(overrides = {}) {
  return {
    id: 'btn',
    name: 'btn启动',
    type: 'RoundRect',
    pId: '0',
    zIndex: 1,
    localRect: rectAt(50, 130, 168, 72),
    store: {
      events: [clickEvent('启动'), hoverEvent('onEnter'), hoverEvent('onLeave')],
      interactiveDyna: [{ id: 'open', type: 'GraphTriggerOpenPage', act: 17, pars: {} }],
    },
    ...overrides,
  }
}

function label(overrides = {}) {
  return {
    id: 'txt',
    name: 'txt启动',
    type: 'Text',
    pId: '0',
    zIndex: 2,
    localRect: rectAt(50, 151, 168, 30),
    ...overrides,
  }
}

const eventsOf = element => [...(element.store?.events ?? []), ...(element.events ?? [])]
const interactiveOf = element => [...(element.store?.interactiveDyna ?? []), ...(element.interactiveDyna ?? [])]

describe('覆盖图元事件穿透', () => {
  it('按钮文字同步底板的单击事件与交互特性，node-self 指向底板', () => {
    const [, text] = propagateOverlayEvents([button(), label()])

    const click = eventsOf(text).find(event => event.type === 'onClick')
    assert.ok(click)
    assert.deepEqual(click.nodes, ['btn'])
    assert.equal(click[MIRROR_FLAG], 'btn')
    assert.notEqual(click.name, 'event-启动')
    assert.match(click.title, /跟随btn启动/)
    assert.deepEqual(eventsOf(text).map(event => event.type).sort(), ['onClick', 'onEnter', 'onLeave'])

    const [open] = interactiveOf(text)
    assert.equal(open.type, 'GraphTriggerOpenPage')
    assert.equal(open[MIRROR_FLAG], 'btn')
    assert.notEqual(open.id, 'open')
  })

  it('不修改入参，底板保持不变', () => {
    const source = [button(), label()]
    const snapshot = JSON.stringify(source)
    const result = propagateOverlayEvents(source)

    assert.equal(JSON.stringify(source), snapshot)
    assert.equal(result[0], source[0])
  })

  it('文字已手工转发悬停时只补单击，不重复悬停事件', () => {
    const text = label({ events: [hoverEvent('onEnter', ['btn']), hoverEvent('onLeave', ['btn'])] })
    const [, result] = propagateOverlayEvents([button(), text])

    const types = eventsOf(result).map(event => event.type)
    assert.equal(types.filter(type => type === 'onEnter').length, 1)
    assert.equal(types.filter(type => type === 'onLeave').length, 1)
    assert.equal(types.filter(type => type === 'onClick').length, 1)
    // 文字原本使用顶层 events，同步结果写回同一容器
    assert.equal(result.events.length, 3)
  })

  it('覆盖图元自身有点击动作时不同步底板的按压类事件与交互特性', () => {
    const text = label({ store: { events: [clickEvent('自己的点击')] } })
    const [, result] = propagateOverlayEvents([button(), text])

    assert.deepEqual(eventsOf(result).filter(event => event.type === 'onClick').map(event => event.title), ['自己的点击'])
    assert.equal(interactiveOf(result).length, 0)
    assert.deepEqual(eventsOf(result).map(event => event.type).sort(), ['onClick', 'onEnter', 'onLeave'])
  })

  it('重复组装幂等，底板事件修改后副本随之更新', () => {
    const once = propagateOverlayEvents([button(), label()])
    const twice = propagateOverlayEvents(once)
    assert.equal(eventsOf(twice[1]).length, eventsOf(once[1]).length)
    assert.equal(interactiveOf(twice[1]).length, 1)

    const changed = structuredClone(twice)
    changed[0].store.events[0].actions[0].payload = 'gv.setPageParamsEx("run", 0);'
    const updated = propagateOverlayEvents(changed)
    const click = eventsOf(updated[1]).filter(event => event.type === 'onClick')
    assert.equal(click.length, 1)
    assert.equal(click[0].actions[0].payload, 'gv.setPageParamsEx("run", 0);')
  })

  it('底板删除后清除残留副本', () => {
    const [, text] = propagateOverlayEvents([button(), label()])
    const [result] = propagateOverlayEvents([text])

    assert.equal(eventsOf(result).length, 0)
    assert.equal(interactiveOf(result).length, 0)
  })

  it('文字位于底板下层、未压在底板上或不同父级时不处理', () => {
    const below = propagateOverlayEvents([label({ zIndex: 0 }), button()])
    const apart = propagateOverlayEvents([button(), label({ localRect: rectAt(400, 151, 168, 30) })])
    const otherParent = propagateOverlayEvents([button(), label({ pId: 'group1' })])

    for (const list of [below, apart, otherParent]) {
      const text = list.find(element => element.id === 'txt')
      assert.equal(eventsOf(text).length, 0)
    }
  })

  it('中间隔着无交互的实心形状时不穿透；装饰层自身同步后可沿链传递', () => {
    const plain = { id: 'mask', type: 'Rectangle', pId: '0', zIndex: 2, localRect: rectAt(50, 130, 168, 72) }
    const blocked = propagateOverlayEvents([button({ store: { events: [clickEvent('启动')] } }), plain, label({ zIndex: 3 })])
    // 遮罩自身覆盖底板会同步事件，文字再从遮罩继承
    assert.equal(eventsOf(blocked[1])[0].nodes[0], 'btn')
    assert.deepEqual(eventsOf(blocked[2]).map(event => event.nodes[0]), ['btn'])
    assert.equal(eventsOf(blocked[2])[0][MIRROR_FLAG], 'btn')

    const wide = { id: 'panel', type: 'Rectangle', pId: '0', zIndex: 2, localRect: rectAt(0, 0, 1000, 800) }
    const stopped = propagateOverlayEvents([button(), wide, label({ zIndex: 3 })])
    assert.equal(eventsOf(stopped[2]).length, 0)
  })

  it('非鼠标触发的交互特性（启动在线/定时）不同步，同步操作使能特性', () => {
    const base = button({
      store: {
        interactiveDyna: [
          { id: 'ready', type: 'GraphTriggerWriteValue', act: 0, pars: {} },
          { id: 'write', type: 'GraphTriggerWriteValue', act: 17, pars: {} },
        ],
        dynamicDyna: [
          { id: 'enable', type: 'GraphDynaEnableEvent', pars: {}, conditions: [{ num: 'c1' }] },
          { id: 'blink', type: 'GraphDynaBlink', pars: {} },
        ],
      },
    })
    const [, text] = propagateOverlayEvents([base, label()])

    assert.deepEqual(interactiveOf(text).map(feature => feature.act), [17])
    assert.deepEqual(text.store.dynamicDyna.map(feature => feature.type), ['GraphDynaEnableEvent'])
    assert.notEqual(text.store.dynamicDyna[0].conditions[0].num, 'c1')
  })

  it('assemble_display 输出中按钮文字可响应底板点击', () => {
    const session = createSession('display')
    const run = (name, args) => JSON.parse(executeToolCall(name, args, session, () => {}, () => {}))
    const rect = run('create_display_rect', { x: 50, y: 130, width: 168, height: 72, cornerRadius: 12, name: 'btn启动' })
    run('create_display_text', { x: 50, y: 151, width: 168, height: 30, text: '启动', name: 'txt启动' })
    session.workingElements[0].store = { ...session.workingElements[0].store, events: [clickEvent('启动')] }

    run('assemble_display', { pageName: 't' })
    const [, text] = session.finalJson.document.elements
    const click = eventsOf(text).find(event => event.type === 'onClick')
    assert.ok(click)
    assert.deepEqual(click.nodes, [rect.id])
    assert.equal(session.workingElements[1].store?.events, undefined)
  })
})
