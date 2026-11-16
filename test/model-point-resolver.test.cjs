/**
 * Model Point Resolver Tests
 */

const assert = require('node:assert/strict')
const http = require('node:http')
const { after, before, describe, it } = require('node:test')
const { buildDynamicFeature, buildInteractiveFeature } = require('../dist/agent/dynamic-feature-builders')
const { buildEventDefinition } = require('../dist/agent/event-definition')
const { enrichModelPoints } = require('../dist/agent/model-point-resolver')

const requests = []
let server
let baseUrl

before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      const { browseName } = JSON.parse(raw)
      requests.push({ url: req.url, headers: req.headers, browseName })
      res.setHeader('Content-Type', 'application/json')
      if (browseName === '101:XAS_001.AV') {
        res.end(JSON.stringify({
          status: 0,
          data: { itemType: 'dynamic', nodeClass: 'EQ', tagPath: '3887/3890' },
        }))
        return
      }
      res.end(JSON.stringify({ status: 1, message: 'not found' }))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(() => server.close())

function buildDocument(dataSourceKey) {
  const feature = buildDynamicFeature('add_feature_move', {
    conditionSpecifiedByUser: true,
    dataSourceKey,
    conditionOperator: 0,
    conditionValue: '1',
  })
  return { document: { elements: [{ store: { dynamicDyna: [feature] } }] }, feature }
}

describe('enrichModelPoints', () => {
  it('fills model info from validateTagItem and forwards auth headers', async () => {
    const { document, feature } = buildDocument('101:XAS_001.AV')
    requests.length = 0

    await enrichModelPoints(document, { baseUrl, authorization: 'token-1', namespace: 'proj-1' })

    assert.deepEqual(feature.conditions[0].leftValue, {
      type: 'm',
      domain: '-1',
      itemType: 'dynamic',
      tagName: '101:XAS_001',
      itemName: 'AV',
      nodeType: 'EQ',
      _unique: '3887/3890',
      nodeId: '101:XAS_001.AV',
    })
    assert.equal(feature.conditions[0].logic, '101:XAS_001.AV')
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, '/editorSvc/model/validateTagItem')
    assert.equal(requests[0].headers.authorization, 'token-1')
    assert.equal(requests[0].headers.namespace, 'proj-1')
  })

  it('keeps the generated point when the point cannot be validated', async () => {
    const { document, feature } = buildDocument('999:UNKNOWN.AV')

    await enrichModelPoints(document, { baseUrl })

    assert.equal(feature.conditions[0].leftValue.tagName, '999:UNKNOWN')
    assert.equal(feature.conditions[0].leftValue.nodeType, undefined)
  })

  it('enriches parameter-mode points and display event valueChanged points', async () => {
    const rotate = buildDynamicFeature('add_feature_rotate', { rotMode: 1, dsDataSourceKey: '101:XAS_001.AV' })
    const write = buildInteractiveFeature('add_feature_write_value', { dataSourceKey: '101:XAS_001.AV' })
    const event = buildEventDefinition({
      target: 'display',
      title: 't',
      nodeIds: [],
      mouseEvent: 'onClick',
      eventScope: 'current',
      trigger: 'valueChanged',
      handleId: '',
      schedule: {},
      dataSourceKeys: ['101:XAS_001.AV'],
      action: 'script',
      args: { script: 'return 1' },
    })
    assert.equal(event.error, undefined)
    const json = {
      document: {
        pageProperty: { events: [event] },
        elements: [{ store: { dynamicDyna: [rotate], interactiveDyna: [write] } }],
      },
    }

    await enrichModelPoints(json, { baseUrl })

    for (const point of [rotate.pars.ds.original, write.pars.ds.original, event.condition.value[0]]) {
      assert.equal(point.nodeType, 'EQ')
      assert.equal(point.itemType, 'dynamic')
      assert.equal(point._unique, '3887/3890')
      assert.equal(point.tagName, '101:XAS_001')
      assert.equal(point.itemName, 'AV')
    }
  })

  it('rejects scripts that use data without a target element', () => {
    const input = {
      target: 'display', title: 't', nodeIds: [], mouseEvent: 'onClick', eventScope: 'current',
      trigger: 'onOpenAfter', handleId: '', schedule: {}, dataSourceKeys: [], action: 'script',
    }
    const bad = buildEventDefinition({ ...input, args: { script: 'data.setVisibleEx(true)' } })
    assert.match(bad.error, /data/)
    const ok = buildEventDefinition({ ...input, nodeIds: ['n1'], args: { script: 'data.setVisibleEx(true)' } })
    assert.equal(ok.error, undefined)
    const viaGv = buildEventDefinition({ ...input, args: { script: 'gv.findNodeByIdEx("a")' } })
    assert.equal(viaGv.error, undefined)
  })

  it('enriches multistate condition points', async () => {
    const feature = buildDynamicFeature('add_feature_multistate_text', {
      states: [{ dataSourceKey: '101:XAS_001.AV', conditionValue: '1', text: '运行' }],
    })

    await enrichModelPoints({ elements: [{ store: { dynamicDyna: [feature] } }] }, { baseUrl })

    const leftValue = feature.multiStateConditions[0].conditions[0].leftValue
    assert.equal(leftValue.nodeType, 'EQ')
    assert.equal(leftValue._unique, '3887/3890')
    assert.equal(feature.multiStateConditions[0].conditions[0].logic, '101:XAS_001.AV')
  })

  it('does nothing when the editor service is not configured', async () => {
    const { document, feature } = buildDocument('101:XAS_001.AV')
    requests.length = 0

    await enrichModelPoints(document, undefined)

    assert.equal(requests.length, 0)
    assert.equal(feature.conditions[0].leftValue.nodeType, undefined)
  })
})
