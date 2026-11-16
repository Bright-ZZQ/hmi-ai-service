const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { createSession, executeToolCall } = require('../dist/agent/agent-service')
const { validateScript } = require('../dist/agent/event-definition')
const { collectPageParamNames, ensurePageParams } = require('../dist/agent/page-params')
const { findDisplayInteractionIssues, normalizeRotatePivots } = require('../dist/agent/display-integrity')
const { encodeText } = require('../dist/agent/element-lookup')

const run = (name, args, session) => JSON.parse(executeToolCall(name, args, session, () => {}, () => {}))

const SPIN_SCRIPT = [
  'if (!data) return;',
  'gv.setPageParamsEx("fanRunning", 1);',
  'var tick = function () {',
  '  if (Number(gv.getPageParamsEx("fanRunning")) !== 1) return;',
  '  data.setRotationEx((Number(data.getRotationEx()) || 0) + 9);',
  '  setTimeout(tick, 50);',
  '};',
  'tick();',
].join('\n')

describe('页面参数自动声明', () => {
  it('收集脚本中字面量引用的参数名并去重', () => {
    const names = collectPageParamNames([{ events: [{ actions: [{ payload: SPIN_SCRIPT }] }] }])
    assert.deepEqual(names, ['fanRunning'])
  })

  it('补充缺失声明且保留已有参数', () => {
    const existing = [{ id: 'a', name: 'keep', desc: '', type: 3, value: 'x', editMode: 0 }]
    const params = ensurePageParams(existing, ['keep', 'fanRunning'])

    assert.equal(params.length, 2)
    assert.deepEqual(params[0], existing[0])
    assert.equal(params[1].name, 'fanRunning')
    assert.equal(params[1].value, 0)
  })

  it('组装图纸时为事件脚本声明页面参数', () => {
    const session = createSession('display')
    const fan = run('create_display_ellipse', { x: 100, y: 100, width: 80, height: 80, name: '风机' }, session)
    run('create_display_rect', { x: 10, y: 10, width: 100, height: 40, name: '启动按钮' }, session)
    session.workingElements[1].store = {
      events: [{
        title: '启动', type: 'onClick', scope: 'current', nodes: [fan.id],
        actions: [{ fnName: 'hmi:script', payload: SPIN_SCRIPT }],
      }],
    }
    run('assemble_display', { pageName: 't' }, session)

    const { pageParams } = session.finalJson.document
    assert.deepEqual(pageParams.map(param => param.name), ['fanRunning'])
  })

  it('脚本用变量作页面参数名时被拒绝', () => {
    assert.match(validateScript('var n = "a"; gv.getPageParamsEx(n)', ['data', 'gv']), /字符串字面量/)
    assert.equal(validateScript(SPIN_SCRIPT, ['data', 'gv']), null)
  })
})

describe('图纸交互完整性', () => {
  const hidden = { id: 'old', name: '旧扇叶', dynamicDyna: [{ type: 'GraphDynaVisible', conditions: [], not: false, pars: { isVisible: { original: 0 } } }] }
  const alive = { id: 'new', name: '新扇叶' }

  it('检出无条件隐藏的图元与指向它的事件', () => {
    const button = { id: 'btn', name: '按钮', events: [{ title: '启动', nodes: ['old', 'new', 'node-self'] }] }
    const issues = findDisplayInteractionIssues([hidden, alive, button])

    assert.equal(issues.length, 2)
    assert.match(issues[0], /旧扇叶.*无条件隐藏/)
    assert.match(issues[1], /永久隐藏的图元 "旧扇叶"/)
  })

  it('检出指向不存在图元的事件，并兼容 store 下的特性', () => {
    const button = { id: 'btn', name: '按钮', store: { events: [{ title: '启动', nodes: ['gone'] }] } }
    const storeHidden = { id: 's', name: '店内', store: hidden }

    assert.match(findDisplayInteractionIssues([button])[0], /不存在的图元 gone/)
    assert.equal(findDisplayInteractionIssues([storeHidden]).length, 1)
  })

  it('有触发条件的隐藏、取反或显示不视为问题', () => {
    const withCondition = { id: 'c', dynamicDyna: [{ type: 'GraphDynaVisible', conditions: [{}], pars: { isVisible: { original: 0 } } }] }
    const inverted = { id: 'i', dynamicDyna: [{ type: 'GraphDynaVisible', conditions: [], not: true, pars: { isVisible: { original: 0 } } }] }
    const shown = { id: 's', dynamicDyna: [{ type: 'GraphDynaVisible', conditions: [], pars: { isVisible: { original: 1 } } }] }

    assert.deepEqual(findDisplayInteractionIssues([withCondition, inverted, shown]), [])
  })

  it('add_feature_visible 拒绝无条件隐藏，允许无条件显示', () => {
    const session = createSession('display')
    run('create_display_rect', { x: 10, y: 10, width: 50, height: 50, name: '块' }, session)

    const rejected = run('add_feature_visible', { elementName: '块', isVisible: 0 }, session)
    assert.equal(rejected.success, false)
    assert.match(rejected.error, /delete_element/)

    const accepted = run('add_feature_visible', { elementName: '块', isVisible: 1 }, session)
    assert.equal(accepted.success, true)
  })
})

const rectOf = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
const textEl = (name, text, x, y, w, h = 22) => ({
  id: name, name, type: 'Text', text: encodeText(text), font: 'Microsoft YaHei,15,-1,5,0,0,0,0,0,0', localRect: rectOf(x, y, w, h),
})

describe('文字重叠检测', () => {
  it('新增说明文字压在旧说明文字上时被检出', () => {
    const issues = findDisplayInteractionIssues([
      textEl('说明_小车', '移动特性 · 左右平移 300px', 1190, 382, 350),
      textEl('说明_小车_测点', '动态特性 · 移动往返（XAS_003.AV = 1 时运行）', 1180, 382, 400),
      textEl('说明_指示块', '变色特性 · 红 / 绿', 1000, 650, 350),
      textEl('说明_指示块_测点', '动态特性 · 变色（XAS_005.AV = 1 时变色）', 1000, 650, 350),
    ])

    assert.equal(issues.length, 2)
    assert.match(issues[0], /说明_小车.*说明_小车_测点.*重叠/)
    assert.match(issues[1], /说明_指示块.*说明_指示块_测点.*重叠/)
  })

  it('错开排布或文字框重叠但文字本身不相交时不报', () => {
    assert.deepEqual(findDisplayInteractionIssues([
      textEl('a', '说明', 100, 100, 400),
      textEl('b', '说明', 100, 130, 400),
      { ...textEl('c', '左', 100, 200, 400), textHAlign: 0 },
      { ...textEl('d', '右', 100, 200, 400), textHAlign: 2 },
    ]), [])
  })
})

describe('旋转中心归一', () => {
  const rotate = (rotCenter) => ({ type: 'GraphDynaRotate', pars: { rotMode: { original: 0 }, rotCenter: { original: rotCenter } } })
  // 3 叶片扇叶：包围盒中心 y=215.75，轮毂圆心 y=222
  const blade = (rotCenter) => ({
    id: 'blade', type: 'Polygon', localRect: rectOf(855.54, 190.24, 58.92, 51.02),
    roatePos: { x: 885, y: 222 }, dynamicDyna: [rotate(rotCenter)],
  })
  const centerOf = element => element.dynamicDyna[0].pars.rotCenter.original

  it('roatePos 偏离包围盒中心时 rotCenter 5 改为 0', () => {
    const [fixed] = normalizeRotatePivots([blade(5)])

    assert.equal(centerOf(fixed), 0)
    assert.equal(centerOf(blade(5)), 5)
  })

  it('roatePos 与包围盒中心一致、或已指定其他旋转中心时保持不变', () => {
    const centered = { ...blade(5), roatePos: { x: 885, y: 215.75 } }

    assert.equal(centerOf(normalizeRotatePivots([centered])[0]), 5)
    assert.equal(centerOf(normalizeRotatePivots([blade(6)])[0]), 6)
  })

  it('未改动的已有图元不被校正，store 下的特性同样处理', () => {
    const base = blade(5)
    assert.equal(centerOf(normalizeRotatePivots([structuredClone(base)], [base])[0]), 5)

    const stored = { id: 's', type: 'Polygon', localRect: base.localRect, roatePos: base.roatePos, store: { dynamicDyna: [rotate(5)] } }
    assert.equal(normalizeRotatePivots([stored])[0].store.dynamicDyna[0].pars.rotCenter.original, 0)
  })

  it('add_feature_rotate 带 pivotX/pivotY 时写入 roatePos 并使用偏移中心', () => {
    const session = createSession('display')
    run('create_display_polygon', {
      name: '扇叶',
      points: [{ x: 882.79, y: 214.31 }, { x: 881.1, y: 190.24 }, { x: 888.9, y: 190.24 }, { x: 859.44, y: 241.26 }, { x: 910.56, y: 241.26 }],
    }, session)

    const result = run('add_feature_rotate', { elementName: '扇叶', rotAngle: 90, pivotX: 885, pivotY: 222 }, session)

    assert.equal(result.success, true)
    assert.deepEqual(result.element.roatePos, { x: 885, y: 222 })
    assert.equal(result.element.store.dynamicDyna[0].pars.rotCenter.original, 0)
  })
})
