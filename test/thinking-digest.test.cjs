const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { ThinkingDigest } = require('../dist/agent/thinking-digest')

describe('ThinkingDigest 思考摘要', () => {
  it('只摘出【结论】标记行，跨分片拼接，其余推演忽略', () => {
    let t = 0
    const digest = new ThinkingDigest({ now: () => t })
    assert.deepEqual(digest.push('让我想想布局。\n坐标 x=60，宽 280。\n【结'), [])
    assert.deepEqual(digest.push('论】左侧 6 个按钮、右侧 6 个对象，按行一一对应\n继续推演……\n'), ['左侧 6 个按钮、右侧 6 个对象，按行一一对应'])
    assert.deepEqual(digest.push('- **【结论】** 第 1 行放两个并排按钮\n'), ['第 1 行放两个并排按钮'])
  })

  it('去重、限量、截断过长结论，flush 输出最后一行', () => {
    const digest = new ThinkingDigest({ maxItems: 2, now: () => 0 })
    assert.equal(digest.push('【结论】A 方案\n【结论】A 方案\n').length, 1)
    assert.equal(digest.push(`【结论】${'长'.repeat(300)}\n`)[0].length, 121)
    assert.deepEqual(digest.push('【结论】第三条\n'), [])
    const last = new ThinkingDigest({ now: () => 0 })
    assert.deepEqual(last.push('【结论】结尾没有换行'), [])
    assert.deepEqual(last.flush(), ['结尾没有换行'])
  })

  it('模型不标注且没有决策句时不输出任何内容（进度提示由调用方负责）', () => {
    let t = 0
    const digest = new ThinkingDigest({ now: () => t })
    t = 60000
    assert.deepEqual(digest.push('推演中，x 等于 60 加 280。\n继续计算 y 坐标。\n'), [])
  })

  it('模型不标注时，兜底只挑低噪声的中文决策句，限频', () => {
    let t = 0
    const digest = new ThinkingDigest({ now: () => t })
    t = 13000
    const text = '算一下 x=60+280=340，y=(200+300)/2=250，这样排版没问题。'
      + '我决定左侧放六个按钮，右侧放六个对应的被控对象。'
      + '标题是“交互控制动态特性演示”，位置居中。'
    const first = digest.push(text)
    assert.deepEqual(first, ['我决定左侧放六个按钮，右侧放六个对应的被控对象'])
    t = 14000
    assert.deepEqual(digest.push('最终方案是按行一一对应排列所有对象。'), [])
    t = 26000
    assert.deepEqual(digest.push('最终方案是按行一一对应排列所有对象。'), ['最终方案是按行一一对应排列所有对象'])
  })

  it('没有换行的超长文本不会无限占用缓冲', () => {
    const digest = new ThinkingDigest({ now: () => 0 })
    assert.deepEqual(digest.push('推演'.repeat(2000)), [])
    assert.deepEqual(digest.push('\n【结论】之后仍可识别\n'), ['之后仍可识别'])
  })
})
