/**
 * Dynamic Feature Builders Tests
 */

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { buildDynamicFeature, buildInteractiveFeature } = require('../dist/agent/dynamic-feature-builders')
const { buildEquipment } = require('../dist/agent/element-builders')
const { buildGenerationPlan, validateGenerationPlan } = require('../dist/agent/generation-plan')
const { validateOutput } = require('../dist/agent/schema-validator')
const { getToolsForType } = require('../dist/agent/skill-registry')

const featureTools = [
  'add_feature_rotate',
  'add_feature_move',
  'add_feature_blink',
  'add_feature_change_color',
  'add_feature_num_display',
  'add_feature_visible',
]

const interactiveFeatureTools = [
  'add_feature_write_value',
  'add_feature_open_page',
]

describe('dynamic feature tool registration', () => {
  for (const editorType of ['display', 'symbol']) {
    it(`registers all feature tools for ${editorType}`, () => {
      const names = getToolsForType(editorType).map(tool => tool.function.name)
      assert.ok(names.includes('declare_generation_plan'))
      for (const name of featureTools) assert.ok(names.includes(name))
      for (const name of interactiveFeatureTools) assert.ok(names.includes(name))
    })
  }

  it('describes automatic rotation as degrees per second', () => {
    const rotate = getToolsForType('display')
      .find(tool => tool.function.name === 'add_feature_rotate')

    assert.match(rotate.function.parameters.properties.rotAngle.description, /度\/秒/)
  })

  it('tells the model to prefer visibility blinking for filled elements', () => {
    const blink = getToolsForType('display')
      .find(tool => tool.function.name === 'add_feature_blink')

    assert.match(blink.function.description, /默认使用显隐闪烁/)
    assert.match(blink.function.parameters.properties.forceColorBlink.description, /用户明确要求/)
  })

  it('forbids every feature tool from inventing conditions', () => {
    const tools = getToolsForType('display')
      .filter(tool => featureTools.includes(tool.function.name))

    for (const tool of tools) {
      const conditionFlag = tool.function.parameters.properties.conditionSpecifiedByUser
      assert.ok(conditionFlag, `${tool.function.name} should expose the condition gate`)
      assert.match(conditionFlag.description, /禁止.*自行推断|禁止根据场景自行推断/)
    }
  })
})

describe('buildDynamicFeature', () => {
  it('builds native feature types and conditions', () => {
    const cases = [
      ['add_feature_rotate', 'GraphDynaRotate'],
      ['add_feature_move', 'GraphDynaMove'],
      ['add_feature_blink', 'GraphDynaBlink'],
      ['add_feature_visible', 'GraphDynaVisible'],
      ['add_feature_change_color', 'GraphDynaChangeClr'],
    ]

    for (const [toolName, featureType] of cases) {
      const feature = buildDynamicFeature(toolName, {
        conditionSpecifiedByUser: true,
        dataSourceKey: '101:XAS_001.AV',
        conditionOperator: 0,
        conditionValue: '1',
      })
      assert.equal(feature.name, featureType)
      assert.equal(feature.type, featureType)
      assert.equal(feature.conditions.length, 1)
      const condition = feature.conditions[0]
      assert.equal(condition.leftValue.tagName, '101:XAS_001')
      assert.equal(condition.leftValue.itemName, 'AV')
      assert.equal(condition.leftValue.nodeId, '101:XAS_001.AV')
      assert.equal(condition.leftValue.type, 'm')
      assert.equal(condition.leftValue.domain, '-1')
      assert.equal(condition.logic, '101:XAS_001.AV')
      assert.notEqual(condition.num, '')
      assert.equal(condition.rightValue.original, '1')
      assert.equal(Object.keys(feature.pars).some(key => key.endsWith('Ref')), false)
    }
  })

  it('drops condition arguments that were not explicitly specified by the user', () => {
    const feature = buildDynamicFeature('add_feature_blink', {
      dataSourceKey: 'invented.status',
      conditionOperator: 0,
      conditionValue: '1',
      not: true,
    })

    assert.deepEqual(feature.conditions, [])
    assert.equal(feature.not, false)
  })

  it('keeps only parameter-rotation fields', () => {
    const feature = buildDynamicFeature('add_feature_rotate', {
      rotMode: 1,
      dsDataSourceKey: 'motor.rpm',
      maxAngle: 270,
      minAngle: -90,
      useDB: 0,
      mu: 3000,
      md: 0,
    })

    assert.equal(feature.pars.ds.original.tagName, 'motor')
    assert.equal(feature.pars.ds.original.itemName, 'rpm')
    assert.equal(feature.pars.ds.original.nodeId, 'motor.rpm')
    assert.equal(feature.pars.mu.original, 3000)
    assert.equal('rotAngle' in feature.pars, false)
  })

  it('keeps only enabled parameter-move axes', () => {
    const feature = buildDynamicFeature('add_feature_move', {
      moveMode: 1,
      hMove: 1,
      vMove: 0,
      hDataSourceKey: 'valve.position',
      hDistance: 120,
    })

    assert.equal(feature.pars.hDs.original.tagName, 'valve')
    assert.equal(feature.pars.hDs.original.itemName, 'position')
    assert.equal(feature.pars.hDistance.original, 120)
    assert.equal('vDs' in feature.pars, false)
  })

  it('uses editor-compatible blink and color defaults', () => {
    const blink = buildDynamicFeature('add_feature_blink', {})
    const color = buildDynamicFeature('add_feature_change_color', {})

    assert.equal(blink.pars.blinkFreq.original, 0)
    assert.equal(blink.pars.blinkMethod.original, 0)
    assert.equal(blink.pars.blinkBacGraClr.original, 'rgb(255, 255, 255)')
    assert.equal(color.pars.isRecover.original, 0)
    assert.equal(color.pars.recBacGraClr.original, 'rgb(255, 255, 255)')
  })

  it('prefers visibility blinking for an element with a visible fill', () => {
    const feature = buildDynamicFeature('add_feature_blink', {
      blinkMethod: 1,
      elementFillColor: '#4488FF',
      blinkBacClr: '#FF0000',
    })

    assert.equal(feature.pars.blinkMethod.original, 0)
  })

  it('keeps explicitly requested color blinking and replaces a low-contrast color', () => {
    const dark = buildDynamicFeature('add_feature_blink', {
      blinkMethod: 1,
      forceColorBlink: true,
      elementFillColor: '#000000',
      blinkBacClr: 'rgb(20, 20, 20)',
    })
    const light = buildDynamicFeature('add_feature_blink', {
      blinkMethod: 1,
      forceColorBlink: true,
      elementFillColor: '#D8D8D8',
      blinkBacClr: '#FFFFFF',
    })

    assert.equal(dark.pars.blinkMethod.original, 1)
    assert.equal(light.pars.blinkMethod.original, 1)
    assert.equal(dark.pars.blinkBacClr.original, '#FFFFFF')
    assert.equal(light.pars.blinkBacClr.original, '#000000')
  })

  it('preserves a blink fill color that differs from the background', () => {
    const feature = buildDynamicFeature('add_feature_blink', {
      blinkMethod: 1,
      forceColorBlink: true,
      elementFillColor: '#112233',
      blinkBacClr: '#FF0000',
    })

    assert.equal(feature.pars.blinkBacClr.original, '#FF0000')
  })

  it('does not treat a transparent fill as a colored background', () => {
    const feature = buildDynamicFeature('add_feature_blink', {
      blinkMethod: 1,
      elementFillColor: 'rgba(216, 216, 216, 0)',
      blinkBacClr: '#FF0000',
    })

    assert.equal(feature.pars.blinkMethod.original, 1)
  })

  it('builds visible feature with isVisible and optional conditions', () => {
    const alwaysOn = buildDynamicFeature('add_feature_visible', {})
    const hiddenWhenTrue = buildDynamicFeature('add_feature_visible', {
      isVisible: 0,
      conditionSpecifiedByUser: true,
      dataSourceKey: 'pump.run',
      conditionOperator: 0,
      conditionValue: '1',
    })

    assert.equal(alwaysOn.type, 'GraphDynaVisible')
    assert.equal(alwaysOn.pars.isVisible.original, 1)
    assert.deepEqual(alwaysOn.conditions, [])
    assert.equal(hiddenWhenTrue.pars.isVisible.original, 0)
    assert.equal(hiddenWhenTrue.conditions[0].leftValue.tagName, 'pump')
    assert.equal(hiddenWhenTrue.conditions[0].leftValue.itemName, 'run')
  })
})

describe('buildInteractiveFeature', () => {
  it('builds digital write-value as GraphTriggerWriteDigVal', () => {
    const feature = buildInteractiveFeature('add_feature_write_value', {
      dataSourceKey: '100:DO_001.PV',
      writeMode: 1,
      value: 1,
      confirmEnable: 1,
      confirmDes0: '确认置 0',
      confirmDes1: '确认置 1',
    })

    assert.equal(feature.type, 'GraphTriggerWriteDigVal')
    assert.equal(feature.act, 17)
    assert.equal(feature.pars.ds.original.tagName, '100:DO_001')
    assert.equal(feature.pars.ds.original.itemName, 'PV')
    assert.equal(feature.pars.writeMode.original, 1)
    assert.equal(feature.pars.value.original, 1)
    assert.equal(feature.pars.confirmDes0.original, '确认置 0')
    assert.equal('rangeMode' in feature.pars, false)
  })

  it('builds analog write-value as GraphTriggerWriteAnaVal', () => {
    const feature = buildInteractiveFeature('add_feature_write_value', {
      valueType: 'analog',
      dataSourceKey: '100:AI_001.AV',
      writeMode: 2,
      value: 36.5,
      rangeMode: 0,
      mu: 100,
      md: 0,
    })

    assert.equal(feature.type, 'GraphTriggerWriteAnaVal')
    assert.equal(feature.pars.ds.original.itemName, 'AV')
    assert.equal(feature.pars.value.original, 36.5)
    assert.equal(feature.pars.mu.original, 100)
    assert.equal('confirmDes0' in feature.pars, false)
  })

  it('builds open-page with pageName object and dialog fields', () => {
    const page = buildInteractiveFeature('add_feature_open_page', {
      pageName: '锅炉主画面',
      pageCode: 'BLR_001',
      pagePath: '/display/blr',
    })
    const dialog = buildInteractiveFeature('add_feature_open_page', {
      popType: 1,
      pageType: 1,
      webPath: 'https://example.com',
      act: 6,
      windowPos: 6,
      customSize: 1,
      width: 800,
      height: 600,
      title: '详情',
    })

    assert.equal(page.type, 'GraphTriggerOpenPage')
    assert.equal(page.pars.pageName.original.name, '锅炉主画面')
    assert.equal(page.pars.pageName.original.code, 'BLR_001')
    assert.equal('windowPos' in page.pars, false)
    assert.equal(dialog.act, 6)
    assert.equal(dialog.pars.webPath.original, 'https://example.com')
    assert.equal(dialog.pars.windowPos.original, 6)
    assert.equal(dialog.pars.width.original, 800)
    assert.equal('pageName' in dialog.pars, false)
  })
})

describe('generation plan validation', () => {
  const plan = buildGenerationPlan({
    summary: 'generic plan',
    expectedElementCount: 3,
    requiredFeatureTools: ['feature_alpha', 'feature_beta', 'feature_alpha'],
    distinctFeatureTargets: true,
  })

  it('accepts arbitrary required tools with multiplicity on distinct targets', () => {
    const executions = [
      { toolName: 'feature_alpha', elementKey: 'element-a' },
      { toolName: 'feature_beta', elementKey: 'element-b' },
      { toolName: 'feature_alpha', elementKey: 'element-c' },
    ]

    assert.deepEqual(validateGenerationPlan(plan, 3, executions), [])
  })

  it('rejects count mismatches and incomplete tool execution', () => {
    const errors = validateGenerationPlan(plan, 5, [
      { toolName: 'feature_alpha', elementKey: 'element-a' },
    ])

    assert.ok(errors.some(error => error.includes('实际为 5 个')))
    assert.ok(errors.some(error => error.includes('未按生成计划完整执行')))
  })

  it('rejects required executions that reuse a target', () => {
    const executions = [
      { toolName: 'feature_alpha', elementKey: 'element-a' },
      { toolName: 'feature_beta', elementKey: 'element-a' },
      { toolName: 'feature_alpha', elementKey: 'element-c' },
    ]

    assert.ok(validateGenerationPlan(plan, 3, executions).some(error => error.includes('互不相同')))
  })

  it('requires every generation to declare a plan', () => {
    assert.ok(validateGenerationPlan(undefined, 1, []).some(error => error.includes('declare_generation_plan')))
  })
})

describe('display geometry validation', () => {
  it('keeps wide column equipment dimensions positive', () => {
    const elements = buildEquipment({
      kind: 'column',
      x: 960,
      y: 520,
      width: 820,
      height: 420,
    })

    for (const element of elements) {
      assert.ok(element.width > 0, `${element.name} width should be positive`)
      assert.ok(element.height > 0, `${element.name} height should be positive`)
    }
  })

  it('rejects non-positive display element dimensions', () => {
    const errors = validateOutput({
      document: {
        name: 'invalid geometry',
        elements: [{
          id: 'element-1',
          type: 'Rectangle',
          width: 100,
          height: -20,
          zIndex: 0,
          localRect: [{}, {}, {}, {}],
        }],
        pageProperty: { pageWidth: 1880, pageHeight: 962 },
      },
    }, 'display')

    assert.ok(errors.some(error => error.path.endsWith('.height')))
  })
})