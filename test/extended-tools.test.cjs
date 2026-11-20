const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { createSession, executeToolCall } = require('../dist/tools')
const { getToolsForType, lintRegistry } = require('../dist/tools')
const { selectTools } = require('../dist/agent/tool-routing')
const { transformElement, getElementBounds } = require('../dist/tools/lib/element-geometry')
const { parsePointTable, expandTemplate } = require('../dist/tools/batch/batch-utils')
const { lintDisplay } = require('../dist/tools/inspect/lint-display')
const { runScriptInSandbox } = require('../dist/tools/feature/script-sandbox')
const { decodeText } = require('../dist/tools/lib/element-lookup')

const run = (name, args, session) => JSON.parse(executeToolCall(name, args, session, () => {}, () => {}))

// 返回会话中的真实图元（而不是 JSON 拷贝），便于断言工具对其的修改
const rect = (session, args) => {
  run('create_display_rect', { width: 100, height: 50, ...args }, session)
  return session.workingElements[session.workingElements.length - 1]
}
const boundsOf = el => getElementBounds(el)

describe('扩展工具注册', () => {
  it('注册表与 handler 一一对应', () => {
    assert.deepEqual(lintRegistry(), [])
  })

  it('图纸与图符都有特性读写工具，批量/排版仅图纸有', () => {
    const display = getToolsForType('display').map(t => t.function.name)
    const symbol = getToolsForType('symbol').map(t => t.function.name)
    for (const name of ['list_features', 'remove_feature', 'update_feature', 'get_element_detail', 'check_feature_conditions', 'test_script']) {
      assert.ok(display.includes(name), `display 缺少 ${name}`)
      assert.ok(symbol.includes(name), `symbol 缺少 ${name}`)
    }
    for (const name of ['clone_element_grid', 'align_elements', 'set_page_property', 'lint_display']) {
      assert.ok(display.includes(name))
      assert.ok(!symbol.includes(name))
    }
  })

  it('首轮生成按关键词下发，编辑模式全部下发', () => {
    const names = tools => tools.map(t => t.function.name)
    const plain = names(selectTools('display', { prompt: '画一个红色矩形', isEditing: false }))
    assert.ok(!plain.includes('clone_element_grid'))
    assert.ok(!plain.includes('align_elements'))
    const batch = names(selectTools('display', { prompt: '批量复制 8 台泵', isEditing: false }))
    assert.ok(batch.includes('clone_element_grid'))
    const editing = names(selectTools('display', { prompt: '改一下', isEditing: true }))
    for (const name of ['clone_element_grid', 'align_elements', 'lint_display', 'list_features', 'set_page_property']) {
      assert.ok(editing.includes(name), `编辑模式缺少 ${name}`)
    }
  })
})

describe('几何变换', () => {
  it('缩放同步变换 localRect / roatePos / 尺寸与文字字号', () => {
    const session = createSession('display')
    const text = run('create_display_text', { text: '标题', x: 100, y: 100, width: 200, height: 40, fontSize: 20 }, session)
    const scaled = transformElement(text, { scale: 0.5, originX: 0, originY: 0, dx: 10, dy: 20 })
    assert.deepEqual(boundsOf(scaled), { x: 60, y: 70, width: 100, height: 20 })
    assert.equal(scaled.width, 100)
    assert.equal(scaled._originInfo.width, 100)
    assert.equal(scaled.font.split(',')[1], '10')
    assert.deepEqual(scaled.roatePos, { x: 110, y: 80 })
  })

  it('平移 Line / Pie / Polygon 的专有坐标字段', () => {
    const session = createSession('display')
    const line = run('create_display_line', { x1: 0, y1: 0, x2: 100, y2: 50 }, session)
    const moved = transformElement(line, { dx: 5, dy: 7 })
    assert.equal(moved.x1, 5)
    assert.equal(moved.y2, 57)
    const pie = run('create_display_pie', { cx: 50, cy: 50, radius: 20, startAngle: 0, endAngle: 90 }, session)
    const pieMoved = transformElement(pie, { dx: 10, dy: 0 })
    assert.equal(pieMoved.cx, 60)
    assert.deepEqual(boundsOf(pieMoved), { x: 40, y: 30, width: 40, height: 40 })
  })
})

describe('clone_element_grid', () => {
  it('按网格复制并携带特性，测点按序号替换', () => {
    const session = createSession('display')
    const pump = rect(session, { x: 100, y: 100, name: '泵1' })
    run('add_feature_num_display', { elementName: pump.id, dataSourceKey: '100:PUMP1.AV' }, session)

    const result = run('clone_element_grid', {
      target: pump.id,
      rows: 2,
      cols: 3,
      gapX: 10,
      gapY: 20,
      nameTemplate: '泵{n}',
      replace: [{ from: 'PUMP1', to: 'PUMP{n}' }],
    }, session)

    assert.equal(result.success, true)
    assert.equal(result.created, 5)
    assert.equal(session.workingElements.length, 6)
    const ids = new Set(session.workingElements.map(el => el.id))
    assert.equal(ids.size, 6)

    const clones = session.workingElements.slice(1)
    assert.deepEqual(clones.map(el => el.name), ['泵2', '泵3', '泵4', '泵5', '泵6'])
    // 第 2 行第 1 列：k=3 → 向下 (50+20)
    assert.deepEqual(boundsOf(clones[2]), { x: 100, y: 170, width: 100, height: 50 })
    // 第 1 行第 3 列：k=2 → 向右 2*(100+10)
    assert.deepEqual(boundsOf(clones[1]), { x: 320, y: 100, width: 100, height: 50 })

    const feature = clones[4].store.dynamicDyna[0]
    assert.equal(feature.pars.ds.original.nodeId, '100:PUMP6.AV')
    assert.equal(feature.pars.ds.original.tagName, '100:PUMP6')
    assert.notEqual(feature.id, pump.store.dynamicDyna[0].id)
    // 原图元不受影响
    assert.equal(pump.store.dynamicDyna[0].pars.ds.original.nodeId, '100:PUMP1.AV')
    // 特性登记到生成计划
    assert.equal(session.featureExecutions.filter(e => e.toolName === 'add_feature_num_display').length, 6)
  })

  it('超出上限与找不到目标时报错，超出画布时给出 warning', () => {
    const session = createSession('display')
    const box = rect(session, { x: 10, y: 10 })
    assert.equal(run('clone_element_grid', { target: 'nope', rows: 2 }, session).success, false)
    assert.equal(run('clone_element_grid', { target: box.id, rows: 20, cols: 20 }, session).success, false)
    const overflow = run('clone_element_grid', { target: box.id, rows: 1, cols: 30, gapX: 100 }, session)
    assert.equal(overflow.success, true)
    assert.match(overflow.warning, /超出当前画布/)
  })

  it('克隆组合时重建 pId 层级', () => {
    const session = createSession('display')
    const a = rect(session, { x: 0, y: 0, name: 'a' })
    const b = rect(session, { x: 120, y: 0, name: 'b' })
    const grouped = run('group_elements', { targets: [a.id, b.id], name: '设备' }, session)
    assert.equal(grouped.success, true)
    const result = run('clone_element_grid', { target: grouped.group.id, rows: 2, cols: 1, gapY: 10 }, session)
    assert.equal(result.success, true)
    const groups = session.workingElements.filter(el => el.type === 'Group')
    assert.equal(groups.length, 2)
    const cloneGroup = groups.find(g => g.id !== grouped.group.id)
    const children = session.workingElements.filter(el => el.pId === cloneGroup.id)
    assert.equal(children.length, 2)
    assert.ok(children.every(child => child.id !== a.id && child.id !== b.id))
  })
})

describe('bulk_apply_feature / copy_features', () => {
  it('批量添加特性，占位符展开为各自测点，失败项单独返回', () => {
    const session = createSession('display')
    const items = [1, 2, 3].map(n => rect(session, { x: n * 120, y: 10, name: `灯${n}` }))
    const result = run('bulk_apply_feature', {
      feature: 'add_feature_num_display',
      paramsJson: JSON.stringify({ dataSourceKey: '100:LAMP{n:2}.AV' }),
      targets: items.map(item => item.id),
    }, session)
    assert.equal(result.success, true)
    assert.equal(result.applied, 3)
    const nodeIds = session.workingElements.map(el => el.store.dynamicDyna[0].pars.ds.original.nodeId)
    assert.deepEqual(nodeIds, ['100:LAMP01.AV', '100:LAMP02.AV', '100:LAMP03.AV'])
    assert.equal(session.featureExecutions.length, 3)
  })

  it('filter 选择并拒绝非法 feature', () => {
    const session = createSession('display')
    rect(session, { x: 10, y: 10, name: '泵A' })
    rect(session, { x: 200, y: 10, name: '阀B' })
    const ok = run('bulk_apply_feature', {
      feature: 'add_feature_blink',
      paramsJson: '{}',
      filter: JSON.stringify({ nameContains: '泵' }),
    }, session)
    assert.equal(ok.success, true)
    assert.equal(ok.applied, 1)
    assert.equal(run('bulk_apply_feature', { feature: 'create_display_rect', paramsJson: '{}', targets: ['泵A'] }, session).success, false)
    const allFail = run('bulk_apply_feature', { feature: 'add_feature_num_display', paramsJson: '{}', targets: ['泵A'] }, session)
    assert.equal(allFail.success, false)
  })

  it('copy_features 复制特性并替换测点，append 与 replace 模式', () => {
    const session = createSession('display')
    const source = rect(session, { x: 0, y: 0, name: '源' })
    const t1 = rect(session, { x: 200, y: 0, name: 't1' })
    const t2 = rect(session, { x: 400, y: 0, name: 't2' })
    run('add_feature_num_display', { elementName: source.id, dataSourceKey: '100:A.AV' }, session)

    const first = run('copy_features', { from: source.id, to: [t1.id, t2.id], replace: [{ from: 'A.AV', to: 'B{n}.AV' }] }, session)
    assert.equal(first.success, true)
    assert.equal(first.copies, 2)
    assert.equal(t1.store.dynamicDyna[0].pars.ds.original.nodeId, '100:B1.AV')
    assert.equal(t2.store.dynamicDyna[0].pars.ds.original.nodeId, '100:B2.AV')
    assert.notEqual(t1.store.dynamicDyna[0].id, source.store.dynamicDyna[0].id)

    run('copy_features', { from: source.id, to: [t1.id] }, session)
    assert.equal(t1.store.dynamicDyna.length, 2)
    run('copy_features', { from: source.id, to: [t1.id], mode: 'replace' }, session)
    assert.equal(t1.store.dynamicDyna.length, 1)
    assert.equal(t1.store.dynamicDyna[0].pars.ds.original.nodeId, '100:A.AV')
    assert.equal(run('copy_features', { from: source.id, to: [source.id] }, session).success, false)
  })
})

describe('import_point_table', () => {
  const CSV = '位号,描述,单位\n100:T1.AV,一段温度,℃\n100:P1.AV,"压力,出口",MPa\n'

  it('解析 CSV 表头别名与带引号字段', () => {
    const table = parsePointTable(CSV)
    assert.equal(table.rows.length, 2)
    assert.deepEqual(table.rows[1], { point: '100:P1.AV', name: '压力,出口', unit: 'MPa', min: '', max: '', device: '' })
    assert.ok(parsePointTable('a,b\n1,2').error)
    assert.equal(parsePointTable('[{"point":"x","name":"n"}]').rows[0].point, 'x')
    assert.equal(expandTemplate('P{n:3}-{x}', { n: 7 }), 'P007-{x}')
  })

  it('内置样式：每行 名称 + 数值(绑定测点) + 单位', () => {
    const session = createSession('display')
    const result = run('import_point_table', { data: CSV, cols: 1 }, session)
    assert.equal(result.success, true)
    assert.equal(result.rows, 2)
    assert.equal(session.workingElements.length, 6)
    const values = session.workingElements.filter(el => el.name.endsWith('-数值'))
    assert.deepEqual(values.map(el => el.store.dynamicDyna[0].pars.ds.original.nodeId), ['100:T1.AV', '100:P1.AV'])
    const units = session.workingElements.filter(el => el.name.endsWith('-单位')).map(el => decodeText(el.text))
    assert.deepEqual(units, ['℃', 'MPa'])
    // 行与行不重叠
    const [first, second] = values.map(boundsOf)
    assert.ok(second.y >= first.y + first.height)
  })

  it('模板模式：占位符替换文字与测点，并移除本轮新建的模板', () => {
    const session = createSession('display')
    const tpl = run('create_display_text', { text: '{name}:', x: 50, y: 50, width: 160, height: 30, name: '模板' }, session)
    run('add_feature_num_display', { elementName: tpl.id, dataSourceKey: '{point}' }, session)

    const result = run('import_point_table', { data: CSV, templateTarget: tpl.id, cellHeight: 40, gapY: 10 }, session)
    assert.equal(result.success, true)
    assert.equal(result.templateRemoved, true)
    assert.equal(session.workingElements.length, 2)
    const [a, b] = session.workingElements
    assert.equal(decodeText(a.text), '一段温度:')
    assert.equal(a.store.dynamicDyna[0].pars.ds.original.nodeId, '100:T1.AV')
    assert.equal(a.store.dynamicDyna[0].pars.ds.original.tagName, '100:T1')
    assert.equal(a.store.dynamicDyna[0].pars.ds.original.itemName, 'AV')
    assert.equal(b.store.dynamicDyna[0].pars.ds.original.nodeId, '100:P1.AV')
    assert.equal(boundsOf(b).y, boundsOf(a).y + 50)
  })

  it('不会删除画布上已有的模板图元', () => {
    const base = { document: { name: 'x', elements: [], pageProperty: { pageWidth: 1880, pageHeight: 962 } } }
    const seed = createSession('display')
    const tpl = run('create_display_text', { text: '{name}', x: 10, y: 10, width: 100, height: 30, name: '模板' }, seed)
    base.document.elements = [tpl]
    const session = createSession('display', base)
    const result = run('import_point_table', { data: CSV, templateTarget: tpl.id }, session)
    assert.equal(result.success, true)
    assert.equal(result.templateRemoved, false)
    assert.equal(session.workingElements.length, 3)
  })
})

describe('group / ungroup', () => {
  it('组合后成员 pId 指向组合，取消组合后恢复顶层', () => {
    const session = createSession('display')
    const a = rect(session, { x: 10, y: 10, name: 'a' })
    const b = rect(session, { x: 200, y: 100, name: 'b' })
    const c = rect(session, { x: 400, y: 10, name: 'c' })
    const grouped = run('group_elements', { targets: [a.id, b.id] }, session)
    assert.equal(grouped.success, true)
    const group = session.workingElements.find(el => el.id === grouped.group.id)
    assert.equal(group.type, 'Group')
    assert.deepEqual(boundsOf(group), { x: 10, y: 10, width: 290, height: 140 })
    assert.equal(session.workingElements.find(el => el.id === a.id).pId, group.id)
    assert.equal(session.workingElements.find(el => el.id === c.id).pId, '0')

    const released = run('ungroup_elements', { target: group.id }, session)
    assert.equal(released.released, 2)
    assert.equal(session.workingElements.some(el => el.type === 'Group'), false)
    assert.equal(session.workingElements.find(el => el.id === a.id).pId, '0')
  })

  it('取消组合后同级 zIndex 连续无重复，保持原有叠放顺序', () => {
    const session = createSession('display')
    const a = rect(session, { x: 0, y: 0, name: 'a' })
    const b = rect(session, { x: 120, y: 0, name: 'b' })
    const c = rect(session, { x: 240, y: 0, name: 'c' })
    const d = rect(session, { x: 360, y: 0, name: 'd' })
    const grouped = run('group_elements', { targets: [b.id, c.id] }, session)
    run('ungroup_elements', { target: grouped.group.id }, session)
    const order = session.workingElements.filter(el => el.pId === '0')
    assert.deepEqual(order.map(el => el.name), ['a', 'b', 'c', 'd'])
    assert.deepEqual(order.map(el => el.zIndex), [0, 1, 2, 3])
    assert.ok(a && d)
  })

  it('拒绝单个图元组合与带缩放的组合拆分', () => {
    const session = createSession('display')
    const a = rect(session, { x: 0, y: 0 })
    assert.equal(run('group_elements', { targets: [a.id] }, session).success, false)
    session.workingElements.push({ id: 'g1', type: 'Group', pId: '0', scaleX: 2, scaleY: 1, roateAngle: 0 })
    assert.equal(run('ungroup_elements', { target: 'g1' }, session).success, false)
  })
})

describe('排版工具', () => {
  const makeRow = () => {
    const session = createSession('display')
    const a = rect(session, { x: 100, y: 100, width: 100, height: 50, name: 'a' })
    const b = rect(session, { x: 300, y: 130, width: 60, height: 80, name: 'b' })
    const c = rect(session, { x: 700, y: 90, width: 100, height: 50, name: 'c' })
    return { session, a, b, c }
  }
  const find = (session, id) => session.workingElements.find(el => el.id === id)

  it('align_elements 左对齐与对齐画布居中', () => {
    const { session, a, b, c } = makeRow()
    assert.equal(run('align_elements', { targets: [a.id, b.id, c.id], mode: 'left' }, session).success, true)
    for (const id of [a.id, b.id, c.id]) assert.equal(boundsOf(find(session, id)).x, 100)

    run('align_elements', { targets: [a.id], mode: 'center', reference: 'canvas' }, session)
    assert.equal(boundsOf(find(session, a.id)).x, 1880 / 2 - 50)
    assert.equal(run('align_elements', { targets: [a.id], mode: 'top' }, session).success, false)
  })

  it('distribute_elements 在首尾之间等距，或按固定间隙排开', () => {
    const { session, a, b, c } = makeRow()
    const result = run('distribute_elements', { targets: [a.id, b.id, c.id], axis: 'horizontal' }, session)
    assert.equal(result.success, true)
    const [ba, bb, bc] = [a, b, c].map(el => boundsOf(find(session, el.id)))
    assert.equal(ba.x, 100)
    assert.equal(bc.x, 700)
    assert.ok(Math.abs((bb.x - (ba.x + ba.width)) - (bc.x - (bb.x + bb.width))) < 0.01)

    run('distribute_elements', { targets: [a.id, b.id, c.id], axis: 'vertical', gap: 10 }, session)
    const [va, vb] = [a, b].map(el => boundsOf(find(session, el.id)))
    assert.equal(vb.y, va.y + va.height + 10)
  })

  it('fit_to_canvas 缩小越界内容并居中，背景底板保持不动', () => {
    const session = createSession('display')
    const bg = rect(session, { x: 0, y: 0, width: 1880, height: 962, name: '背景' })
    const wide = rect(session, { x: 1000, y: 100, width: 2000, height: 400, name: '宽' })
    const text = run('create_display_text', { text: 'T', x: 1500, y: 700, width: 200, height: 40, fontSize: 20 }, session)
    const result = run('fit_to_canvas', {}, session)
    assert.equal(result.success, true)
    assert.ok(result.scale < 1)
    const box = [wide, text].map(el => boundsOf(find(session, el.id)))
    const left = Math.min(...box.map(b => b.x))
    const right = Math.max(...box.map(b => b.x + b.width))
    assert.ok(left >= 20 - 0.01 && right <= 1860 + 0.01)
    assert.ok(Math.abs(left - (1880 - right)) < 0.01, '水平居中')
    assert.deepEqual(boundsOf(find(session, bg.id)), { x: 0, y: 0, width: 1880, height: 962 })
    assert.ok(Number(find(session, text.id).font.split(',')[1]) < 20)
    // 已在画布内时无需调整
    assert.equal(run('fit_to_canvas', { mode: 'shrink', center: false }, session).changed, false)
  })

  it('set_z_order 在组装时生效（新建模式）', () => {
    const session = createSession('display')
    const a = rect(session, { x: 0, y: 0, name: 'a' })
    rect(session, { x: 10, y: 10, name: 'b' })
    rect(session, { x: 20, y: 20, name: 'c' })
    assert.equal(run('set_z_order', { targets: [a.id], action: 'front' }, session).success, true)
    const final = run('assemble_display', { pageName: 'z' }, session)
    const order = [...final.document.elements].sort((x, y) => x.zIndex - y.zIndex).map(el => el.name)
    assert.deepEqual(order, ['b', 'c', 'a'])

    const s2 = createSession('display')
    rect(s2, { x: 0, y: 0, name: 'a' })
    rect(s2, { x: 10, y: 10, name: 'b' })
    const c2 = rect(s2, { x: 20, y: 20, name: 'c' })
    run('set_z_order', { targets: [c2.id], action: 'down' }, s2)
    const order2 = [...run('assemble_display', { pageName: 'z' }, s2).document.elements].sort((x, y) => x.zIndex - y.zIndex).map(el => el.name)
    assert.deepEqual(order2, ['a', 'c', 'b'])
  })

  it('set_z_order 编辑模式下新增图元可置底', () => {
    const seed = createSession('display')
    const old1 = rect(seed, { x: 0, y: 0, name: 'old1' })
    const old2 = rect(seed, { x: 10, y: 10, name: 'old2' })
    const base = run('assemble_display', { pageName: 'base' }, seed)
    const session = createSession('display', base)
    const fresh = rect(session, { x: 30, y: 30, name: 'fresh' })
    run('set_z_order', { targets: [fresh.id], action: 'back' }, session)
    const final = run('assemble_display', { pageName: 'base' }, session)
    const order = [...final.document.elements].sort((x, y) => x.zIndex - y.zIndex).map(el => el.name)
    assert.deepEqual(order, ['fresh', 'old1', 'old2'])
    assert.ok(old1 && old2)
  })
})

describe('图纸属性与页面参数', () => {
  it('set_page_property 写入组装结果并更新画布', () => {
    const session = createSession('display')
    rect(session, { x: 10, y: 10 })
    const result = run('set_page_property', { pageWidth: 2400, pageHeight: 1350, bgColor: '#0b1a2e', fitMode: 5, refreshCycle: 500, zoomEnable: false }, session)
    assert.equal(result.success, true)
    assert.equal(session.canvas.pageWidth, 2400)
    const pageProperty = run('assemble_display', { pageName: 'p' }, session).document.pageProperty
    assert.equal(pageProperty.pageWidth, 2400)
    assert.equal(pageProperty.width, 2400)
    assert.equal(pageProperty.bgColor, '#0b1a2e')
    assert.equal(pageProperty.fitMode, 5)
    assert.equal(pageProperty.refreshCycle, 500)
    assert.equal(pageProperty.zoomEnable, false)
  })

  it('set_page_property 拒绝非法值，symbol 不可用', () => {
    const session = createSession('display')
    assert.equal(run('set_page_property', { pageWidth: -1 }, session).success, false)
    assert.equal(run('set_page_property', { fitMode: 9 }, session).success, false)
    assert.equal(run('set_page_property', {}, session).success, false)
    assert.equal(run('set_page_property', { pageWidth: 100 }, createSession('symbol')).success, false)
  })

  it('declare_page_params 声明类型化参数，同名默认不覆盖', () => {
    const session = createSession('display')
    rect(session, { x: 10, y: 10 })
    const result = run('declare_page_params', {
      params: [
        { name: 'mode', type: 'int', value: '2', desc: '模式' },
        { name: 'dev', type: 'string_tp', value: 'P1', tpIndex: 1 },
        { name: 'on', type: 'boolean', value: true },
      ],
    }, session)
    assert.equal(result.success, true)
    const params = run('assemble_display', { pageName: 'p' }, session).document.pageParams
    const byName = Object.fromEntries(params.map(p => [p.name, p]))
    assert.equal(byName.mode.type, 0)
    assert.equal(byName.mode.value, 2)
    assert.equal(byName.dev.type, 9)
    assert.equal(byName.dev.tpIndex, 1)
    assert.equal(byName.on.value, 1)
    assert.ok(!('overwrite' in byName.mode))

    // 编辑模式：同名保持原样，overwrite 才覆盖
    const base = run('assemble_display', { pageName: 'p' }, session)
    const edit = createSession('display', base)
    run('declare_page_params', { params: [{ name: 'mode', type: 'int', value: 9 }] }, edit)
    assert.equal(run('assemble_display', { pageName: 'p' }, edit).document.pageParams.find(p => p.name === 'mode').value, 2)
    const edit2 = createSession('display', base)
    run('declare_page_params', { params: [{ name: 'mode', type: 'int', value: 9 }], overwrite: true }, edit2)
    assert.equal(run('assemble_display', { pageName: 'p' }, edit2).document.pageParams.find(p => p.name === 'mode').value, 9)
  })

  it('declare_page_params 校验 TP 序号与参数名', () => {
    const session = createSession('display')
    assert.equal(run('declare_page_params', { params: [{ name: 'a', type: 'tag_tp' }] }, session).success, false)
    assert.equal(run('declare_page_params', { params: [{ name: 'a b', type: 'int' }] }, session).success, false)
    assert.equal(run('declare_page_params', { params: [{ name: 'a', type: 'tag_tp', tpIndex: 1 }, { name: 'b', type: 'tag_tp', tpIndex: 1 }] }, session).success, false)
    assert.equal(run('declare_page_params', { params: [{ name: 'a', type: 'unknown' }] }, session).success, false)
  })
})

describe('特性读写', () => {
  const setup = () => {
    const session = createSession('display')
    const el = rect(session, { x: 10, y: 10, name: '泵' })
    run('add_feature_num_display', { elementName: el.id, dataSourceKey: '100:P.AV' }, session)
    run('add_feature_rotate', { elementName: el.id, rotMode: 0, rotAngle: 5 }, session)
    run('add_feature_blink', { elementName: el.id, conditionSpecifiedByUser: true, dataSourceKey: '100:P.RUN', conditionOperator: 0, conditionValue: '1' }, session)
    return { session, el }
  }

  it('list_features 给出序号、工具名、条件与测点', () => {
    const { session, el } = setup()
    const result = run('list_features', { target: el.id }, session)
    assert.equal(result.total, 3)
    assert.deepEqual(result.features.map(f => f.tool), ['add_feature_num_display', 'add_feature_rotate', 'add_feature_blink'])
    assert.deepEqual(result.features[0].points, ['ds=100:P.AV'])
    assert.deepEqual(result.features[2].conditions, ['100:P.RUN = 1'])
    const overview = run('list_features', {}, session)
    assert.equal(overview.elementCount, 1)
  })

  it('remove_feature 按 index / 类型删除，多匹配需要 all，并同步生成计划执行记录', () => {
    const { session, el } = setup()
    assert.equal(session.featureExecutions.length, 3)
    assert.equal(run('remove_feature', { target: el.id }, session).success, false)
    const removed = run('remove_feature', { target: el.id, featureType: 'add_feature_rotate' }, session)
    assert.equal(removed.success, true)
    assert.equal(el.store.dynamicDyna.length, 2)
    assert.equal(session.featureExecutions.some(e => e.toolName === 'add_feature_rotate'), false)

    run('copy_features', { from: el.id, to: [rect(session, { x: 300, y: 10 }).id] }, session)
    const dup = run('remove_feature', { target: el.id, featureType: 'GraphDynaBlink' }, session)
    assert.equal(dup.success, true)
    assert.equal(run('remove_feature', { target: el.id, index: 99 }, session).success, false)
  })

  it('update_feature 校验失败时不留下部分修改', () => {
    const { session, el } = setup()
    const rotate = el.store.dynamicDyna[1]
    const before = JSON.stringify(rotate)
    const result = run('update_feature', { target: el.id, featureId: rotate.id, changesJson: '{"pars":{"rotAngle":99},"not":"yes"}' }, session)
    assert.equal(result.success, false)
    assert.equal(JSON.stringify(rotate), before)
  })

  it('copy_features 复制事件时，指向源图元自身的目标改为新图元', () => {
    const session = createSession('display')
    const source = rect(session, { x: 0, y: 0, name: '源' })
    const other = rect(session, { x: 200, y: 0, name: '目标' })
    const third = rect(session, { x: 400, y: 0, name: '第三' })
    const event = run('add_event_definition', { scope: 'element', elementName: source.id, action: 'visible', visible: 2, targetElements: [source.id, third.id] }, session)
    assert.equal(event.success, true)
    const result = run('copy_features', { from: source.id, to: [other.id], kinds: ['event'] }, session)
    assert.equal(result.success, true)
    const copied = other.store.events[0]
    assert.deepEqual(copied.nodes, [other.id, third.id])
    assert.notEqual(copied.name, source.store.events[0].name)
  })

  it('update_feature 修改参数与条件，拒绝不存在的参数', () => {
    const { session, el } = setup()
    const rotate = el.store.dynamicDyna[1]
    const updated = run('update_feature', { target: el.id, featureId: rotate.id, changesJson: '{"pars":{"rotAngle":"12"}}' }, session)
    assert.equal(updated.success, true)
    assert.equal(rotate.pars.rotAngle.original, 12)

    run('update_feature', { target: el.id, index: 1, changesJson: '{"pars":{"ds":"100:Q.AV"}}' }, session)
    assert.equal(el.store.dynamicDyna[0].pars.ds.original.nodeId, '100:Q.AV')
    assert.equal(el.store.dynamicDyna[0].pars.ds.original.tagName, '100:Q')

    assert.equal(run('update_feature', { target: el.id, index: 2, changesJson: '{"pars":{"nope":1}}' }, session).success, false)
    run('update_feature', { target: el.id, index: 3, dataSourceKey: '100:P.RUN', conditionOperator: 4, conditionValue: '3' }, session)
    assert.equal(el.store.dynamicDyna[2].conditions[0].sign, 4)
    run('update_feature', { target: el.id, index: 3, clearConditions: true }, session)
    assert.equal(el.store.dynamicDyna[2].conditions.length, 0)
    assert.equal(run('update_feature', { target: el.id, index: 3 }, session).success, false)
  })

  it('图符编辑器同样可以读写特性', () => {
    const session = createSession('symbol')
    run('create_symbol_rect', { x: 0, y: 0, width: 50, height: 50 }, session)
    const comp = session.workingElements[0]
    const id = comp.store.node_id
    run('add_feature_blink', { elementName: id }, session)
    const listed = run('list_features', { target: id }, session)
    assert.equal(listed.total, 1)
    assert.equal(run('remove_feature', { target: id, index: 1 }, session).success, true)
    assert.equal(comp.store.dynamicDyna.length, 0)
  })

  it('get_element_detail 概要与按路径读取', () => {
    const { session, el } = setup()
    const summary = run('get_element_detail', { target: el.id }, session)
    assert.equal(summary.element.features, 3)
    assert.deepEqual(summary.element.bounds, { x: 10, y: 10, width: 100, height: 50 })
    const detail = run('get_element_detail', { target: el.id, paths: ['localRect[1].x', 'store.dynamicDyna[0].type', 'missing.path', '__proto__.x'] }, session)
    assert.equal(detail.values['localRect[1].x'], 110)
    assert.equal(detail.values['store.dynamicDyna[0].type'], 'GraphDynaValDisplay')
    assert.deepEqual(detail.missing, ['missing.path', '__proto__.x'])
  })

  it('check_feature_conditions 发现数值比较的非数字值、空测点与重复状态', () => {
    const { session, el } = setup()
    assert.equal(run('check_feature_conditions', {}, session).errors, 0)

    const blink = el.store.dynamicDyna[2]
    blink.conditions[0].sign = 2
    blink.conditions[0].rightValue.original = '运行'
    const bad = run('check_feature_conditions', { target: el.id }, session)
    assert.equal(bad.errors, 1)
    assert.match(bad.issues[0].message, /不是数字/)

    blink.conditions[0].leftValue = {}
    blink.conditions[0].sign = 99
    const worse = run('check_feature_conditions', {}, session)
    assert.ok(worse.issues.some(issue => /没有测点/.test(issue.message)))
    assert.ok(worse.issues.some(issue => /不合法/.test(issue.message)))

    el.store.dynamicDyna[0].pars.ds.original = { nodeId: '', tagName: '', itemName: '' }
    assert.ok(run('check_feature_conditions', {}, session).issues.some(issue => /数据源 ds 为空/.test(issue.message)))

    const multi = rect(session, { x: 400, y: 10, name: '多态' })
    const states = [0, 1].map(() => ({ dataSourceKey: '100:S.AV', conditionOperator: 0, conditionValue: '1', text: 'x' }))
    run('add_feature_multistate_text', { elementName: multi.id, states }, session)
    assert.ok(run('check_feature_conditions', { target: multi.id }, session).issues.some(issue => /相同条件/.test(issue.message)))
  })
})

describe('lint_display', () => {
  const canvas = { pageWidth: 1000, pageHeight: 600, bgColor: '#ffffff' }

  it('检出越界、重叠、文字溢出与低对比度，不把容器关系当作重叠', () => {
    const session = createSession('display')
    rect(session, { x: 950, y: 10, width: 100, height: 50, name: '越界框' })
    const a = rect(session, { x: 100, y: 100, width: 100, height: 100, name: '甲' })
    rect(session, { x: 130, y: 130, width: 100, height: 100, name: '乙' })
    rect(session, { x: 400, y: 100, width: 300, height: 200, name: '卡片' })
    rect(session, { x: 420, y: 120, width: 100, height: 50, name: '卡片内' })
    run('create_display_text', { text: '这是一段明显很长很长很长的说明文字', x: 100, y: 400, width: 80, height: 20, fontSize: 20, fill: '#000000', name: '长文' }, session)
    run('create_display_text', { text: '浅字', x: 100, y: 450, width: 100, height: 30, fill: '#fefefe', name: '浅字' }, session)

    const issues = lintDisplay(session.workingElements, canvas)
    const codes = issues.map(issue => issue.code)
    assert.ok(codes.includes('out_of_canvas'))
    assert.ok(codes.includes('overlap'))
    assert.ok(codes.includes('text_overflow'))
    assert.ok(codes.includes('low_contrast'))
    const overlaps = issues.filter(issue => issue.code === 'overlap')
    assert.equal(overlaps.length, 1)
    assert.match(overlaps[0].message, /甲.*乙|乙.*甲/)
    assert.ok(a)

    const viaTool = run('lint_display', {}, session)
    assert.equal(viaTool.success, true)
    assert.ok(viaTool.issues.some(issue => issue.code === 'overlap'))
  })

  it('干净的图纸没有问题', () => {
    const session = createSession('display')
    rect(session, { x: 10, y: 10, name: 'a' })
    rect(session, { x: 200, y: 10, name: 'b' })
    assert.equal(run('lint_display', {}, session).issues.length, 0)
    assert.equal(run('lint_display', {}, createSession('symbol')).success, false)
  })
})

describe('test_script 沙箱', () => {
  const nodes = [{ id: 'n1', name: '灯', type: 'Ellipse' }]

  it('正常脚本返回操作记录，拼错的方法名被发现', () => {
    const good = runScriptInSandbox({ kind: 'event', script: 'data.setBackgroundColorEx("#ff0000"); gv.setPageParamsEx("x", 1)', nodes, target: 'n1' })
    assert.equal(good.ok, true)
    assert.ok(good.calls.some(call => call.includes('setBackgroundColorEx("#ff0000")')))

    const typo = runScriptInSandbox({ kind: 'event', script: 'data.setBackgrounColorEx("#ff0000")', nodes, target: 'n1' })
    assert.equal(typo.ok, false)
    assert.match(typo.error, /not a function/)
  })

  it('读取不存在的图元返回 null 并给出提示，未判空时报错', () => {
    const result = runScriptInSandbox({ kind: 'before_open', script: 'var n = gv.findNodeByIdEx("ghost"); n.setVisibleEx(false)', nodes })
    assert.equal(result.ok, false)
    assert.ok(result.warnings.some(w => /未找到该图元/.test(w)))
  })

  it('读写测点使用模拟值，定时器按虚拟时钟执行', () => {
    const script = [
      'var count = 0;',
      'var timer = setInterval(function () {',
      '  count++;',
      '  hmi.utils.readModelPoint({ projectCode: "p", points: ["100:A.AV"] }, function (res) {',
      '    gv.setPageParamsEx("last", Number(res["100:A.AV"]) + count);',
      '  });',
      '}, 1000);',
    ].join('\n')
    const result = runScriptInSandbox({ kind: 'before_open', script, nodes, points: { '100:A.AV': 10 }, maxTimerRuns: 3 })
    assert.equal(result.ok, true)
    assert.equal(result.timerRuns, 3)
    assert.ok(result.calls.some(call => call.includes('setPageParamsEx("last", 13)')))
    assert.ok(result.warnings.some(w => /仍有 1 个定时器/.test(w)))
  })

  it('死循环被超时终止', () => {
    const result = runScriptInSandbox({ kind: 'before_open', script: 'while (true) {}', nodes })
    assert.equal(result.ok, false)
    assert.match(result.error, /超过/)
  })

  it('未处理的 Promise 拒绝不会被误判为沙箱崩溃，Promise 死循环会超时终止', () => {
    const rejected = runScriptInSandbox({ kind: 'before_open', script: 'Promise.reject(new Error("x")); gv.setZoomEx(1)', nodes })
    assert.equal(rejected.ok, true)
    const loop = runScriptInSandbox({ kind: 'before_open', script: 'Promise.resolve().then(function f() { return Promise.resolve().then(f) })', nodes })
    assert.equal(loop.ok, false)
    assert.match(loop.error, /超过|内存/)
  })

  it('内存炸弹只终止沙箱子进程，服务不受影响', () => {
    const result = runScriptInSandbox({ kind: 'before_open', script: 'var a = []; while (true) { a.push(new Array(1e6).fill(1)) }', nodes })
    assert.equal(result.ok, false)
    assert.ok(result.error)
    assert.equal(runScriptInSandbox({ kind: 'before_open', script: 'gv.setZoomEx(1)', nodes }).ok, true)
  })

  it('无法通过原型链逃逸到宿主进程', () => {
    const script = [
      'var f = (function () {}).constructor("return typeof process === \'undefined\' ? \'safe\' : \'escaped\'");',
      'gv.setPageParamsEx("probe", f());',
      'var g = this && this.constructor ? this.constructor.constructor("return typeof require")() : "n/a";',
      'gv.setPageParamsEx("probe2", g);',
    ].join('\n')
    const result = runScriptInSandbox({ kind: 'before_open', script, nodes })
    assert.ok(result.calls.some(call => call.includes('"safe"')), JSON.stringify(result))
    assert.ok(!result.calls.some(call => call.includes('escaped')))
    assert.ok(!result.calls.some(call => call.includes('"function"')))
  })

  it('管道脚本检查 onScriptDestroy 清理与 setScriptEnabled', () => {
    const leak = runScriptInSandbox({ kind: 'pipe', script: 'data.setScriptEnabled(true); setInterval(function () {}, 500)', nodes, target: 'n1', maxTimerRuns: 1 })
    assert.ok(leak.warnings.some(w => /未清除/.test(w)))
    const noEnable = runScriptInSandbox({ kind: 'pipe', script: 'data.setStore("flowRate", 2)', nodes, target: 'n1' })
    assert.ok(noEnable.warnings.some(w => /setScriptEnabled/.test(w)))
    const clean = runScriptInSandbox({
      kind: 'pipe',
      script: 'data.setScriptEnabled(true); var t = setInterval(function () {}, 500); data.onScriptDestroy = function () { clearInterval(t) }',
      nodes,
      target: 'n1',
      maxTimerRuns: 1,
    })
    assert.equal(clean.warnings.some(w => /未清除/.test(w)), false)
  })

  it('图符属性函数返回值与缺少 return', () => {
    const good = runScriptInSandbox({ kind: 'symbol_func', script: 'return Number(data.a("temp")) > 80 ? "#ff0000" : "#00b050"', nodes: [], bindings: { temp: 90 } })
    assert.equal(good.ok, true)
    assert.equal(good.returned, '#ff0000')
    const missing = runScriptInSandbox({ kind: 'symbol_func', script: 'var x = data.a("temp")', nodes: [], bindings: { temp: 1 } })
    assert.equal(missing.ok, false)
  })

  it('通过工具调用：静态校验失败、非法 kind、管道缺 target', () => {
    const session = createSession('display')
    const el = rect(session, { x: 10, y: 10, name: '框' })
    assert.equal(run('test_script', { kind: 'event', script: 'fetch("x")' }, session).success, false)
    assert.equal(run('test_script', { kind: 'symbol_func', script: 'return 1' }, session).success, false)
    assert.equal(run('test_script', { kind: 'pipe', script: 'data.setScriptEnabled(true)' }, session).success, false)
    const result = run('test_script', { kind: 'event', script: 'data.setXEx(5)', target: el.id }, session)
    assert.equal(result.success, true)
    assert.ok(result.calls[0].includes('setXEx(5)'))

    const symbol = createSession('symbol')
    const out = run('test_script', { kind: 'symbol_func', script: 'return data.a("t") * 2', bindings: '{"t": 4}' }, symbol)
    assert.equal(out.success, true)
    assert.equal(out.returned, 8)
  })
})
