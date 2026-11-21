const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { createSession, executeToolCall } = require('../dist/tools')
const { buildColorObj } = require('../dist/tools/lib/element-builders')
const { lintDisplay } = require('../dist/tools/inspect/lint-display')

const run = (name, args, session) => JSON.parse(executeToolCall(name, args, session, () => {}, () => {}))
const last = session => session.workingElements[session.workingElements.length - 1]
const near = (a, b) => Math.abs(a - b) < 0.02

describe('渐变颜色格式', () => {
  it('输出编辑器识别的 gradientMode / centerX / centerY，并对调起止色以匹配编辑器渲染顺序', () => {
    // 编辑器渲染为 [0, endColor, 1, startColor]：JSON 的 endColor 在渐变起点（top），startColor 在终点
    assert.deepEqual(buildColorObj('#fff', '#000', 'top linear'), {
      startColor: '#000', endColor: '#fff', gradientMode: 'linear', centerX: 0.5, centerY: 0,
    })
    const radial = buildColorObj('#fff', undefined, 'center radial')
    assert.equal(radial.gradientMode, 'radial')
    assert.equal(radial.centerX, 0.5)
    assert.equal(radial.centerY, 0.5)
    assert.equal(radial.endColor, '#fff')
    assert.equal(radial.startColor, '#fff')
    assert.equal(buildColorObj('#fff', '#000', 'leftBottom double_spread').centerY, 1)
  })

  it('无渐变或无法识别时按纯色处理', () => {
    assert.deepEqual(buildColorObj('#fff'), { startColor: '#fff' })
    assert.deepEqual(buildColorObj('#fff', '#000', 'sideways wavy'), { startColor: '#fff' })
    assert.deepEqual(buildColorObj('#fff', '#000', 'constructor linear'), { startColor: '#fff' })
  })
})

describe('图符视觉细节', () => {
  it('渐变：起点色写入 store.gradientColor，终点色写入 attrs.fill', () => {
    const session = createSession('symbol')
    run('create_symbol_rect', { width: 100, height: 50, fill: '#ffffff', fillEndColor: '#0000ff', fillGradient: 'top linear' }, session)
    const comp = last(session)
    assert.equal(comp.attrs.fill, '#0000ff')
    assert.equal(comp.store.gradientColor, '#ffffff')
    assert.equal(comp.store.gradientMode, 'top linear')
  })

  it('边框渐变同样对调，无法识别的渐变按纯色', () => {
    const session = createSession('symbol')
    run('create_symbol_line', { x1: 0, y1: 0, x2: 50, y2: 0, stroke: '#ff0000', strokeEndColor: '#00ff00', strokeGradient: 'left linear' }, session)
    const line = last(session)
    assert.equal(line.attrs.stroke, '#00ff00')
    assert.equal(line.store.borderGradientColor, '#ff0000')
    run('create_symbol_rect', { width: 10, height: 10, fill: '#111111', fillEndColor: '#222222', fillGradient: 'bogus' }, session)
    const rect = last(session)
    assert.equal(rect.attrs.fill, '#111111')
    assert.equal(rect.store.gradientMode, undefined)
  })

  it('边框线型、箭头、不透明度仅在传入时写入', () => {
    const session = createSession('symbol')
    run('create_symbol_rect', { width: 10, height: 10 }, session)
    const plain = last(session)
    assert.equal(plain.attrs.dash, undefined)
    assert.equal(plain.attrs.opacity, undefined)
    assert.equal(plain.store.dashKey, undefined)
    run('create_symbol_rect', { width: 10, height: 10, borderStyle: 1, opacity: 0.5 }, session)
    const dashed = last(session)
    assert.deepEqual(dashed.attrs.dash, [5, 5])
    assert.equal(dashed.store.dashKey, 1)
    assert.equal(dashed.attrs.opacity, 0.5)
    run('create_symbol_line', { x1: 0, y1: 0, x2: 50, y2: 0, endArrowType: 1, endArrowSize: 6 }, session)
    assert.equal(last(session).attrs.endArrowType, 1)
    assert.equal(last(session).attrs.endArrowSize, 6)
    run('create_symbol_polygon', { points: [0, 0, 10, 0, 5, 10], endArrowType: 1 }, session)
    assert.equal(last(session).attrs.endArrowType, undefined)
  })
})

describe('图纸图元视觉细节', () => {
  it('未传新参数时输出与原来一致', () => {
    const session = createSession('display')
    run('create_display_rect', { x: 10, y: 20, width: 100, height: 50 }, session)
    const el = last(session)
    assert.equal(el.roateAngle, undefined)
    assert.equal(el.borderStyle, undefined)
    assert.equal(el.shadowOpacity, 0)
    assert.deepEqual(el.localRect[0], { x: 10, y: 20 })
  })

  it('rotation 绕包围盒中心旋转 localRect，并写入 roateAngle', () => {
    const session = createSession('display')
    run('create_display_rect', { x: 100, y: 100, width: 100, height: 20, rotation: 90 }, session)
    const el = last(session)
    assert.equal(el.roateAngle, 90)
    assert.deepEqual(el.roatePos, { x: 150, y: 110 })
    // 未旋转左上角 (100,100) 绕 (150,110) 顺时针 90° → (160,60)
    assert.ok(near(el.localRect[0].x, 160) && near(el.localRect[0].y, 60))
    assert.ok(near(el.localRect[2].x, 140) && near(el.localRect[2].y, 160))
    assert.equal(el.width, 100)
    assert.equal(el.height, 20)
  })

  it('rotation 与 pivot 同时给出时绕 pivot 旋转', () => {
    const session = createSession('display')
    run('create_display_rect', { x: 100, y: 0, width: 20, height: 20, rotation: 180, pivotX: 100, pivotY: 0 }, session)
    const el = last(session)
    assert.deepEqual(el.roatePos, { x: 100, y: 0 })
    assert.ok(near(el.localRect[0].x, 100) && near(el.localRect[0].y, 0))
    assert.ok(near(el.localRect[2].x, 80) && near(el.localRect[2].y, -20))
  })

  it('rotation 为 0 或在不支持的图元上忽略', () => {
    const session = createSession('display')
    run('create_display_rect', { x: 0, y: 0, width: 10, height: 10, rotation: 360 }, session)
    assert.equal(last(session).roateAngle, undefined)
    run('create_display_polygon', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }], rotation: 45 }, session)
    assert.equal(last(session).roateAngle, undefined)
  })

  it('阴影、边框线型被限制在合法范围内', () => {
    const session = createSession('display')
    run('create_display_ellipse', {
      x: 0, y: 0, width: 40, height: 40, shadowOpacity: 3, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: -2, shadowOffsetY: 4, borderStyle: 9,
    }, session)
    const el = last(session)
    assert.equal(el.shadowOpacity, 1)
    assert.equal(el.shadowColor, '#000000')
    assert.equal(el.shadowBlur, 10)
    assert.equal(el.shadowOffsetX, -2)
    assert.equal(el.shadowOffsetY, 4)
    assert.equal(el.borderStyle, 4)
  })

  it('直线支持两端箭头，其他图元不写箭头字段', () => {
    const session = createSession('display')
    run('create_display_line', { x1: 0, y1: 0, x2: 100, y2: 0, endArrowType: 1, endArrowSize: 6 }, session)
    const line = last(session)
    assert.equal(line.endArrowType, 1)
    assert.equal(line.endArrowSize, 6)
    assert.equal(line.startArrowType, undefined)
    run('create_display_rect', { x: 0, y: 0, width: 10, height: 10, endArrowType: 1 }, session)
    assert.equal(last(session).endArrowType, undefined)
  })

  it('文字支持字间距、换行方式、删除线，并写入 font', () => {
    const session = createSession('display')
    run('create_display_text', { text: '进水', x: 0, y: 0, letterSpacing: 4, wrap: 'none', deleteline: true, rotation: 90 }, session)
    const el = last(session)
    assert.equal(el.font.split(',')[7], '1')
    assert.equal(el.font.split(',')[8], '4')
    assert.equal(el.textWrap, 2)
    assert.equal(el.deleteline, true)
    assert.equal(el.roateAngle, 90)
  })

  it('文字未传新参数时保持默认', () => {
    const session = createSession('display')
    run('create_display_text', { text: 'A', x: 0, y: 0 }, session)
    const el = last(session)
    assert.equal(el.font.split(',')[8], '0')
    assert.equal(el.textWrap, 0)
  })

  it('旋转后的文字不会按外接矩形误报溢出', () => {
    const session = createSession('display')
    run('create_display_text', { text: '竖排文字标签', x: 100, y: 100, width: 120, height: 24, rotation: 90, fontSize: 14 }, session)
    const issues = lintDisplay(session.workingElements, { pageWidth: 800, pageHeight: 600, bgColor: '#ffffff' })
    assert.equal(issues.filter(issue => issue.code === 'text_overflow').length, 0)
  })
})
