const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { createSession, executeToolCall } = require('../dist/tools')
const {
  countNewElements,
  omitUnchangedBaseElementErrors,
  stackNewElementsOnTop,
} = require('../dist/tools/assembly/edit-context')

const base = [
  { id: 'a', type: 'Rect', zIndex: 0, width: 100, height: 50 },
  { id: 'b', type: 'Line', zIndex: 7, width: 0, height: 0 },
]

describe('基于已有图纸修改', () => {
  it('新增图元叠放在原有最高层级之上，原有图元不变', () => {
    const created = [{ id: 'c', zIndex: 0 }, { id: 'd', zIndex: 0 }]
    const result = stackNewElementsOnTop([...base, ...created], base)

    assert.deepEqual(result.slice(0, 2), base)
    assert.deepEqual(result.slice(2).map(e => e.zIndex), [8, 9])
  })

  it('只统计本轮新增的图元', () => {
    assert.equal(countNewElements(base, base), 0)
    assert.equal(countNewElements([...base, { id: 'c' }], base), 1)
    assert.equal(countNewElements([base[0], { id: 'c' }], base), 1)
  })

  it('忽略未改动的原有图元的校验错误，仍校验新增和被修改的图元', () => {
    const modified = { ...base[0], width: 0 }
    const created = { id: 'c', zIndex: 8, width: 0 }
    const elements = [modified, base[1], created]
    const errors = [
      { path: 'document.elements[0].width', message: 'modified' },
      { path: 'document.elements[1].width', message: 'unchanged' },
      { path: 'document.elements[2].width', message: 'created' },
      { path: 'document.pageProperty', message: 'page' },
    ]

    const result = omitUnchangedBaseElementErrors(errors, elements, base)
    assert.deepEqual(result.map(e => e.message), ['modified', 'created', 'page'])
  })

  it('图符以 store.node_id 识别原有图元', () => {
    const comps = [{ className: 'Rect', store: { node_id: 'n1' } }]
    assert.equal(countNewElements(comps, comps), 0)
    assert.equal(countNewElements([...comps, { className: 'Rect', store: { node_id: 'n2' } }], comps), 1)
  })

  it('没有 id 的原有图元不会被误算为新增', () => {
    const idless = [{ type: 'Text', text: 'a' }]
    assert.equal(countNewElements(idless, idless), 0)
    assert.equal(countNewElements([...idless, { type: 'Text', text: 'b' }], idless), 1)
  })

  it('组装图纸时保留原图元层级与 latestIndex，新增图元在最上层', () => {
    const currentJson = {
      document: {
        name: '已有图纸',
        code: 'old-code',
        pageProperty: { pageWidth: 1000, pageHeight: 800, bgColor: '#fff', latestIndex: 999999 },
        elements: base,
      },
    }
    const session = createSession('display', currentJson)
    executeToolCall('create_display_rect', { x: 10, y: 10, width: 20, height: 20 }, session, () => {}, () => {})
    executeToolCall('assemble_display', { pageName: '已有图纸' }, session, () => {}, () => {})

    const { document } = session.finalJson
    assert.equal(document.elements.length, 3)
    assert.deepEqual(document.elements.slice(0, 2), base)
    assert.equal(document.elements[2].zIndex, 8)
    assert.equal(document.pageProperty.latestIndex, 999999)
    assert.equal(document.pageProperty.pageWidth, 1000)
  })
})
