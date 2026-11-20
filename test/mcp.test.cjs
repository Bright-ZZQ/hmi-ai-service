const assert = require('node:assert/strict')
const http = require('node:http')
const { afterEach, describe, it } = require('node:test')
const express = require('express')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')
const { createHmiMcpServer } = require('../dist/mcp/server')
const { createMcpRouter } = require('../dist/mcp/http')
const { ResultStore, toFilename } = require('../dist/mcp/result-store')
const { bundleResults, uniqueFilenames } = require('../dist/mcp/bundle')
const { strFromU8, unzipSync } = require('fflate')

const cleanups = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

const connect = async (editorType) => {
  const server = createHmiMcpServer({ editorType })
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  cleanups.push(() => client.close())
  return client
}

const call = async (client, name, args = {}) => {
  const result = await client.callTool({ name, arguments: args })
  return { ...result, text: result.content[0].text }
}
const callJson = async (client, name, args) => JSON.parse((await call(client, name, args)).text)

const RECT = { x: 100, y: 100, width: 200, height: 100, name: '底板' }

describe('MCP 工具暴露', () => {
  it('图纸入口只暴露图纸工具，且不暴露 ask_user', async () => {
    const client = await connect('display')
    const names = (await client.listTools()).tools.map(tool => tool.name)

    for (const name of ['begin_session', 'get_session_state', 'declare_generation_plan', 'create_display_rect', 'assemble_display']) {
      assert.ok(names.includes(name), `缺少 ${name}`)
    }
    assert.ok(!names.includes('ask_user'))
    assert.ok(!names.includes('create_symbol_rect'))
    assert.ok(!names.includes('assemble_symbol'))
    assert.equal(new Set(names).size, names.length)
  })

  it('图符入口只暴露图符工具', async () => {
    const client = await connect('symbol')
    const names = (await client.listTools()).tools.map(tool => tool.name)

    assert.ok(names.includes('create_symbol_rect'))
    assert.ok(names.includes('assemble_symbol'))
    assert.ok(!names.includes('assemble_display'))
    assert.ok(!names.includes('create_display_rect'))
  })

  it('工具入参 schema 取自工具注册表', async () => {
    const client = await connect('display')
    const rect = (await client.listTools()).tools.find(tool => tool.name === 'create_display_rect')

    assert.equal(rect.inputSchema.type, 'object')
    assert.ok(rect.inputSchema.properties.x)
    assert.ok(rect.description.length > 0)
  })

  it('未接入导出能力时不暴露 export_result', async () => {
    const client = await connect('display')
    const names = (await client.listTools()).tools.map(tool => tool.name)

    assert.ok(!names.includes('export_result'))
    assert.equal((await call(client, 'export_result')).isError, true)
  })

  it('instructions 提供领域规则且不含内部循环专属内容', async () => {
    const client = await connect('display')
    const instructions = client.getInstructions()

    assert.ok(instructions.includes('assemble_display'))
    assert.ok(instructions.includes('begin_session'))
    assert.ok(!instructions.includes('ask_user'))
    assert.ok(!instructions.includes('【结论】'))
  })
})

describe('MCP 绘制会话', () => {
  it('创建图元后组装，返回完整图纸 JSON', async () => {
    const client = await connect('display')
    const created = await call(client, 'create_display_rect', RECT)
    assert.ok(!created.isError)

    const state = await callJson(client, 'get_session_state')
    assert.equal(state.elementCount, 1)
    assert.equal(state.assembled, false)

    const assembled = await call(client, 'assemble_display', { pageName: '测试图纸' })
    assert.ok(!assembled.isError, assembled.text)
    const result = JSON.parse(assembled.text)
    assert.equal(result.success, undefined)
    assert.equal(result.document.elements.length, 1)
    assert.equal((await callJson(client, 'get_session_state')).assembled, true)
  })

  it('未声明计划也能组装；已声明但数量不符则校验失败并可修正', async () => {
    const client = await connect('display')
    await call(client, 'create_display_rect', RECT)
    const plan = { requiredFeatureTools: [], distinctFeatureTargets: false }
    const declared = await call(client, 'declare_generation_plan', { ...plan, summary: '数量不符', expectedElementCount: 3 })
    assert.ok(!declared.isError, declared.text)

    const failed = await call(client, 'assemble_display', { pageName: '测试图纸' })
    assert.equal(failed.isError, true)
    assert.ok(failed.text.includes('校验未通过'))
    assert.equal((await callJson(client, 'get_session_state')).assembled, false)

    await call(client, 'declare_generation_plan', { ...plan, summary: '修正为一个', expectedElementCount: 1 })
    const fixed = await call(client, 'assemble_display', { pageName: '测试图纸' })
    assert.ok(!fixed.isError, fixed.text)
  })

  it('图符会话可创建并组装', async () => {
    const client = await connect('symbol')
    const created = await call(client, 'create_symbol_rect', { x: 10, y: 10, width: 100, height: 60 })
    assert.ok(!created.isError, created.text)

    const assembled = await call(client, 'assemble_symbol', { symbolName: '测试图符' })
    assert.ok(!assembled.isError, assembled.text)
    assert.equal(JSON.parse(assembled.text).comps.length, 1)
  })

  it('没有图元时组装失败并返回错误', async () => {
    const client = await connect('symbol')
    const result = await call(client, 'assemble_symbol', { symbolName: '空图符' })

    assert.equal(result.isError, true)
    assert.ok(result.text.includes('create_symbol_'))
  })

  it('缺少必填参数与未知工具都返回错误', async () => {
    const client = await connect('display')
    const missing = await call(client, 'create_display_rect', {})
    const unknown = await call(client, 'no_such_tool', {})

    assert.equal(missing.isError, true)
    assert.ok(missing.text.includes('缺少必填参数'))
    assert.equal(unknown.isError, true)
    assert.ok(unknown.text.includes('未知工具'))
  })

  it('handler 失败时返回 isError', async () => {
    const client = await connect('display')
    const result = await call(client, 'update_element', { target: 'nope', changesJson: '{}' })

    assert.equal(result.isError, true)
  })

  it('begin_session 载入已有 JSON 后可增量修改，传入非对象时报错', async () => {
    const first = await connect('display')
    await call(first, 'create_display_rect', RECT)
    const json = await callJson(first, 'assemble_display', { pageName: '测试图纸' })

    const second = await connect('display')
    const begun = await callJson(second, 'begin_session', { currentJson: json })
    assert.equal(begun.elementCount, 1)

    await call(second, 'create_display_rect', { ...RECT, x: 500, name: '新增' })
    assert.equal((await callJson(second, 'get_session_state')).elementCount, 2)

    const reset = await callJson(second, 'begin_session', {})
    assert.equal(reset.elementCount, 0)

    const invalid = await call(second, 'begin_session', { currentJson: [] })
    assert.equal(invalid.isError, true)
  })

  it('不同连接的会话状态相互独立', async () => {
    const a = await connect('display')
    const b = await connect('display')
    await call(a, 'create_display_rect', RECT)

    assert.equal((await callJson(a, 'get_session_state')).elementCount, 1)
    assert.equal((await callJson(b, 'get_session_state')).elementCount, 0)
  })
})

describe('MCP HTTP 入口', () => {
  const startApp = async (routerOptions) => {
    const app = express()
    app.use(express.json())
    app.use('/mcp', createMcpRouter(routerOptions))
    const httpServer = http.createServer(app)
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise((resolve) => {
      httpServer.closeAllConnections?.()
      httpServer.close(resolve)
    }))
    return `http://127.0.0.1:${httpServer.address().port}`
  }

  const connectHttp = async (baseUrl, path, headers = {}) => {
    const client = new Client({ name: 'http-client', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp/${path}`), { requestInit: { headers } }))
    cleanups.push(() => client.close())
    return client
  }

  const initializeBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'raw', version: '1.0.0' } },
  }
  const postRaw = (url, body, headers = {}) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  })

  it('按 Mcp-Session-Id 隔离会话，入口决定工具集', async () => {
    const baseUrl = await startApp({ authToken: '' })
    const a = await connectHttp(baseUrl, 'display')
    const b = await connectHttp(baseUrl, 'display')
    const s = await connectHttp(baseUrl, 'symbol')

    await call(a, 'create_display_rect', RECT)
    assert.equal((await callJson(a, 'get_session_state')).elementCount, 1)
    assert.equal((await callJson(b, 'get_session_state')).elementCount, 0)
    assert.ok((await s.listTools()).tools.some(tool => tool.name === 'assemble_symbol'))
    assert.ok(!(await s.listTools()).tools.some(tool => tool.name === 'assemble_display'))
  })

  it('配置了 authToken 时校验 x-mcp-token', async () => {
    const baseUrl = await startApp({ authToken: 'secret' })

    const denied = await postRaw(`${baseUrl}/mcp/display`, initializeBody)
    assert.equal(denied.status, 401)
    const wrong = await postRaw(`${baseUrl}/mcp/display`, initializeBody, { 'x-mcp-token': 'wrong' })
    assert.equal(wrong.status, 401)

    const client = await connectHttp(baseUrl, 'display', { 'x-mcp-token': 'secret' })
    assert.ok((await client.listTools()).tools.length > 0)
  })

  it('配置了 allowedOrigins 时拒绝未授权的 Origin', async () => {
    const baseUrl = await startApp({ authToken: '', allowedOrigins: ['https://editor.example.com'] })

    const denied = await postRaw(`${baseUrl}/mcp/display`, initializeBody, { origin: 'https://evil.example.com' })
    assert.equal(denied.status, 403)
    const allowed = await postRaw(`${baseUrl}/mcp/display`, initializeBody, { origin: 'https://editor.example.com' })
    assert.equal(allowed.status, 200)
    await allowed.text()
  })

  it('未知会话、缺少会话头与会话数超限都被拒绝', async () => {
    const baseUrl = await startApp({ authToken: '', maxSessions: 1 })

    const noSession = await postRaw(`${baseUrl}/mcp/display`, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    assert.equal(noSession.status, 400)
    const unknown = await postRaw(`${baseUrl}/mcp/display`, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': 'nope' })
    assert.equal(unknown.status, 404)

    await connectHttp(baseUrl, 'display')
    const overflow = await postRaw(`${baseUrl}/mcp/symbol`, initializeBody)
    assert.equal(overflow.status, 503)
  })

  it('会话不能跨入口复用', async () => {
    const baseUrl = await startApp({ authToken: '' })
    const init = await postRaw(`${baseUrl}/mcp/display`, initializeBody)
    const sessionId = init.headers.get('mcp-session-id')
    await init.text()
    assert.ok(sessionId)

    const crossed = await postRaw(`${baseUrl}/mcp/symbol`, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': sessionId })
    assert.equal(crossed.status, 404)
  })

  it('export_result 返回下载链接，下载内容与组装结果一致', async () => {
    const baseUrl = await startApp({ authToken: '' })
    const client = await connectHttp(baseUrl, 'display')
    assert.ok((await client.listTools()).tools.some(tool => tool.name === 'export_result'))

    await call(client, 'create_display_rect', RECT)
    const assembled = await call(client, 'assemble_display', { pageName: '导出/测试:图纸' })
    assert.ok(!assembled.isError, assembled.text)

    const exported = await callJson(client, 'export_result')
    assert.equal(exported.filename, '导出_测试_图纸.json')
    assert.equal(exported.fileCount, 1)
    assert.deepEqual(exported.files, [exported.filename])
    assert.ok(exported.url.startsWith(`${baseUrl}/mcp/results/`))
    assert.equal(exported.sizeBytes, Buffer.byteLength(assembled.text))
    assert.equal(exported.expiresInSeconds, 600)

    const downloaded = await fetch(exported.url)
    assert.equal(downloaded.status, 200)
    assert.ok(downloaded.headers.get('content-type').startsWith('application/json'))
    assert.ok(downloaded.headers.get('content-disposition').includes(encodeURIComponent(exported.filename)))
    assert.equal(await downloaded.text(), assembled.text)
  })

  it('多张图纸逐张生成后导出为一个 zip，内容与各次组装结果一致', async () => {
    const baseUrl = await startApp({ authToken: '' })
    const client = await connectHttp(baseUrl, 'display')
    const texts = []
    for (const name of ['一号图', '二号图', '一号图']) {
      if (texts.length > 0) {
        const begun = await callJson(client, 'begin_session', {})
        assert.equal(begun.elementCount, 0)
        assert.equal(begun.pendingExportCount, texts.length)
      }
      await call(client, 'create_display_rect', { ...RECT, name: `${name}底板` })
      const assembled = await call(client, 'assemble_display', { pageName: name })
      assert.ok(!assembled.isError, assembled.text)
      assert.equal(JSON.parse(assembled.text).document.elements.length, 1)
      texts.push(assembled.text)
    }
    assert.equal((await callJson(client, 'get_session_state')).pendingExportCount, 3)

    const exported = await callJson(client, 'export_result')
    assert.equal(exported.fileCount, 3)
    assert.equal(exported.filename, 'hmi-displays-3.zip')
    assert.deepEqual(exported.files, ['一号图.json', '二号图.json', '一号图-2.json'])

    const downloaded = await fetch(exported.url)
    assert.equal(downloaded.headers.get('content-type'), 'application/zip')
    const bytes = new Uint8Array(await downloaded.arrayBuffer())
    assert.equal(exported.sizeBytes, bytes.length)
    const entries = unzipSync(bytes)
    assert.deepEqual(Object.keys(entries).sort(), [...exported.files].sort())
    exported.files.forEach((file, index) => assert.equal(strFromU8(entries[file]), texts[index]))
  })

  it('已导出的结果不会重复进入下一批，无新结果时可重新导出上一批', async () => {
    const baseUrl = await startApp({ authToken: '' })
    const client = await connectHttp(baseUrl, 'display')
    await call(client, 'create_display_rect', RECT)
    await call(client, 'assemble_display', { pageName: 'A图' })
    const first = await callJson(client, 'export_result')
    assert.equal(first.filename, 'A图.json')

    const begun = await callJson(client, 'begin_session', {})
    assert.equal(begun.pendingExportCount, 0)
    await call(client, 'create_display_rect', RECT)
    await call(client, 'assemble_display', { pageName: 'B图' })
    const second = await callJson(client, 'export_result')
    assert.equal(second.fileCount, 1)
    assert.equal(second.filename, 'B图.json')
    assert.equal((await callJson(client, 'get_session_state')).pendingExportCount, 0)

    const again = await callJson(client, 'export_result')
    assert.equal(again.filename, 'B图.json')
    assert.notEqual(again.url, second.url)
    assert.equal((await fetch(again.url)).status, 200)
  })

  it('校验失败的组装不会进入待导出列表', async () => {
    const baseUrl = await startApp({ authToken: '' })
    const client = await connectHttp(baseUrl, 'display')
    await call(client, 'create_display_rect', RECT)
    await call(client, 'declare_generation_plan', {
      summary: '数量不符', expectedElementCount: 3, requiredFeatureTools: [], distinctFeatureTargets: false,
    })
    assert.equal((await call(client, 'assemble_display', { pageName: '失败图' })).isError, true)

    const begun = await callJson(client, 'begin_session', {})
    assert.equal(begun.pendingExportCount, 0)
    assert.equal((await call(client, 'export_result')).isError, true)
  })

  it('尚未组装时 export_result 返回错误', async () => {
    const baseUrl = await startApp({ authToken: '' })
    const client = await connectHttp(baseUrl, 'display')
    const result = await call(client, 'export_result')

    assert.equal(result.isError, true)
    assert.ok(result.text.includes('assemble_display'))
  })

  it('下载链接无需 x-mcp-token，publicBaseUrl 覆盖链接源地址', async () => {
    const baseUrl = await startApp({ authToken: 'secret', publicBaseUrl: 'https://hmi.example.com/' })
    const client = await connectHttp(baseUrl, 'symbol', { 'x-mcp-token': 'secret' })
    await call(client, 'create_symbol_rect', { x: 10, y: 10, width: 100, height: 60 })
    await call(client, 'assemble_symbol', { symbolName: '测试图符' })

    const exported = await callJson(client, 'export_result')
    assert.ok(exported.url.startsWith('https://hmi.example.com/mcp/results/'))

    const id = exported.url.split('/').pop()
    const downloaded = await fetch(`${baseUrl}/mcp/results/${id}`)
    assert.equal(downloaded.status, 200)
    assert.equal(JSON.parse(await downloaded.text()).comps.length, 1)
  })

  it('未知、非法或过期的结果 ID 返回 404', async () => {
    const baseUrl = await startApp({ authToken: '', resultTtlMs: 50 })
    assert.equal((await fetch(`${baseUrl}/mcp/results/not-a-uuid`)).status, 404)
    assert.equal((await fetch(`${baseUrl}/mcp/results/00000000-0000-4000-8000-000000000000`)).status, 404)

    const client = await connectHttp(baseUrl, 'display')
    await call(client, 'create_display_rect', RECT)
    await call(client, 'assemble_display', { pageName: '测试图纸' })
    const exported = await callJson(client, 'export_result')
    await new Promise(resolve => setTimeout(resolve, 120))

    assert.equal((await fetch(exported.url)).status, 404)
  })
})

describe('ResultStore', () => {
  it('超出数量上限时淘汰最早的结果', () => {
    const store = new ResultStore({ ttlMs: 60_000, maxEntries: 2 })
    const first = store.put('a.json', Buffer.from('{}'), 'application/json')
    const second = store.put('b.json', Buffer.from('{}'), 'application/json')
    const third = store.put('c.json', Buffer.from('{}'), 'application/json')

    assert.equal(store.size, 2)
    assert.equal(store.get(first.id), undefined)
    assert.ok(store.get(second.id))
    assert.ok(store.get(third.id))
  })

  it('文件名去掉路径与非法字符，空名回退默认名', () => {
    assert.equal(toFilename('../a/b:c', 'display'), '_a_b_c.json')
    assert.equal(toFilename('  ', 'display'), 'hmi-display.json')
    assert.equal(toFilename(undefined, 'symbol'), 'hmi-symbol.json')
    assert.ok(toFilename('x'.repeat(200), 'display').length <= 65)
  })
})

describe('bundleResults', () => {
  it('同名文件依次加序号后缀', () => {
    assert.deepEqual(uniqueFilenames(['a.json', 'a.json', 'b.json', 'a.json']), ['a.json', 'a-2.json', 'b.json', 'a-3.json'])
  })

  it('单个结果直接导出 JSON，不打压缩包', () => {
    const bundle = bundleResults([{ filename: 'a.json', body: '{"x":1}' }], 'display')

    assert.equal(bundle.filename, 'a.json')
    assert.ok(bundle.contentType.startsWith('application/json'))
    assert.equal(bundle.body.toString('utf8'), '{"x":1}')
  })

  it('多个结果打成 zip，包内文件名支持中文', () => {
    const bundle = bundleResults([
      { filename: '图一.json', body: '{"a":1}' },
      { filename: '图二.json', body: '{"b":2}' },
    ], 'symbol')

    assert.equal(bundle.filename, 'hmi-symbols-2.zip')
    assert.equal(bundle.contentType, 'application/zip')
    const entries = unzipSync(new Uint8Array(bundle.body))
    assert.equal(strFromU8(entries['图一.json']), '{"a":1}')
    assert.equal(strFromU8(entries['图二.json']), '{"b":2}')
  })
})
