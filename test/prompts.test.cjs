const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { describe, it } = require('node:test')
const { buildLoopSystemPrompt, buildMcpInstructions } = require('../dist/prompts')

const readFixture = name =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8').replace(/\r\n/g, '\n')

describe('系统提示词', () => {
  for (const type of ['display', 'symbol']) {
    it(`内部循环提示词（${type}）与快照逐字节一致`, () => {
      assert.equal(buildLoopSystemPrompt(type), readFixture(`loop-system-prompt.${type}.txt`))
    })
  }

  for (const type of ['display', 'symbol']) {
    it(`MCP instructions（${type}）不含内部循环专属内容`, () => {
      const text = buildMcpInstructions(type)
      for (const word of ['【结论】', 'ask_user', '按计划下发', '思考格式提醒', '输出要求（强制']) {
        assert.ok(!text.includes(word), `不应包含：${word}`)
      }
      assert.ok(text.includes('begin_session'))
      assert.ok(text.includes('export_result'))
      assert.ok(text.includes('.zip'))
      assert.ok(text.includes('逐张生成'))
    })
  }

  it('MCP instructions（display）包含图纸相关内容', () => {
    const text = buildMcpInstructions('display')
    for (const word of ['assemble_display', 'document']) {
      assert.ok(text.includes(word), `应包含：${word}`)
    }
  })

  it('MCP instructions（symbol）包含图符相关内容', () => {
    const text = buildMcpInstructions('symbol')
    for (const word of ['assemble_symbol', 'comps']) {
      assert.ok(text.includes(word), `应包含：${word}`)
    }
  })

  it('MCP instructions 含按图还原模式，并按类型给出对应工具对照', () => {
    const display = buildMcpInstructions('display')
    const symbol = buildMcpInstructions('symbol')
    for (const text of [display, symbol]) {
      assert.ok(text.includes('按图还原模式'))
      assert.ok(text.includes('先测量，再创建'))
      assert.ok(text.includes('不需要用户额外说“照图生成”'))
      assert.ok(text.includes('begin_session({ sourceImage: { width, height } })'))
      assert.ok(text.includes('只有用户明确要求放宽'))
      assert.ok(text.indexOf('按图还原模式') < text.indexOf('## 布局指南'))
    }
    assert.ok(display.includes('endArrowType') && display.includes('borderStyle'))
    assert.ok(!display.includes('图符（Symbol）细节工具对照'))
    assert.ok(symbol.includes('图符（Symbol）细节工具对照'))
    assert.ok(!symbol.includes('图纸（Display）细节工具对照'))
  })
})
