/**
 * MCP Streamable HTTP 入口：/mcp/display、/mcp/symbol
 *
 * 每个 MCP 会话（Mcp-Session-Id）对应一个独立的 Server 与 SessionState，
 * 入口决定编辑器类型与可用工具集。
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import type { Request, Response } from 'express'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { EditorType, ModelPointApiConfig } from '../types'
import { createHmiMcpServer } from './server'
import type { ExportedResult, HmiMcpServerOptions, RequestHeaders } from './server'
import { RESULT_ID_PATTERN, ResultStore } from './result-store'
import { bundleResults } from './bundle'

export interface McpRouterOptions {
  /** 设置后要求请求头 x-mcp-token 与之一致；Authorization 留给编辑器网关透传 */
  authToken?: string
  /** 设置后，带 Origin 头的请求必须命中该名单 */
  allowedOrigins?: string[]
  maxSessions?: number
  sessionTtlMs?: number
  /** 服务对外可访问的源地址（不含 /mcp），用于生成结果下载链接；不配置则从请求头推断 */
  publicBaseUrl?: string
  resultTtlMs?: number
  maxResults?: number
  /** 查询点信息的编辑器后端地址；优先取请求头 editorSvcUrl，再读 MCP_EDITOR_SVC_URL */
  editorSvcUrl?: string
  /** 查询点信息的鉴权（Authorization 完整值）；优先取请求头 editorAuthorization，再读 MCP_EDITOR_AUTHORIZATION */
  editorAuthorization?: string
  /** 查询点信息的工程编码；优先取请求头 projectCode，再读 MCP_PROJECT_CODE */
  projectCode?: string
}

interface SessionEntry {
  editorType: EditorType
  transport: StreamableHTTPServerTransport
  server: Server
  touchedAt: number
}

const DEFAULT_MAX_SESSIONS = 100
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000
const DEFAULT_RESULT_TTL_MS = 10 * 60 * 1000
const DEFAULT_MAX_RESULTS = 100
const SWEEP_INTERVAL_MS = 60 * 1000

function envInt(name: string, fallback: number): number {
  const value = parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** 查询点信息所用的编辑器后端配置；mcp.json 请求头优先，未提供的项取 MCP_* 环境变量 */
function createModelPointApiResolver(options: McpRouterOptions) {
  const baseUrl = (options.editorSvcUrl ?? process.env.MCP_EDITOR_SVC_URL ?? '').trim()
  const authorization = (options.editorAuthorization ?? process.env.MCP_EDITOR_AUTHORIZATION ?? '').trim()
  const projectCode = (options.projectCode ?? process.env.MCP_PROJECT_CODE ?? '').trim()
  // Node 会把请求头名转成小写
  const headerValue = (headers: RequestHeaders, name: string): string =>
    (firstHeader(headers[name]) ?? '').trim()
  return (headers: RequestHeaders): ModelPointApiConfig | undefined => {
    const resolvedBaseUrl = headerValue(headers, 'editorsvcurl') || baseUrl
    if (!resolvedBaseUrl) return undefined
    return {
      baseUrl: resolvedBaseUrl,
      authorization: headerValue(headers, 'editorauthorization') || authorization || undefined,
      namespace: headerValue(headers, 'projectcode') || projectCode || undefined,
    }
  }
}

function derivePublicBaseUrl(headers: RequestHeaders): string {
  const proto = firstHeader(headers['x-forwarded-proto'])?.split(',')[0].trim() || 'http'
  const host = firstHeader(headers['x-forwarded-host'])?.split(',')[0].trim() || firstHeader(headers.host) || 'localhost'
  return `${proto}://${host}`
}

function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(given), digest(expected))
}

function reject(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null })
}

export function createMcpRouter(options: McpRouterOptions = {}): Router {
  const authToken = options.authToken ?? process.env.MCP_AUTH_TOKEN
  const allowedOrigins = options.allowedOrigins
    ?? (process.env.MCP_ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean)
  const maxSessions = options.maxSessions ?? envInt('MCP_MAX_SESSIONS', DEFAULT_MAX_SESSIONS)
  const sessionTtlMs = options.sessionTtlMs ?? envInt('MCP_SESSION_TTL_MS', DEFAULT_SESSION_TTL_MS)
  const publicBaseUrl = (options.publicBaseUrl ?? process.env.MCP_PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const resultTtlMs = options.resultTtlMs ?? envInt('MCP_RESULT_TTL_MS', DEFAULT_RESULT_TTL_MS)

  const resolveModelPointApi = createModelPointApiResolver(options)

  const sessions = new Map<string, SessionEntry>()
  const announcedEditorUrls = new Set<string>()
  const results = new ResultStore({
    ttlMs: resultTtlMs,
    maxEntries: options.maxResults ?? envInt('MCP_MAX_RESULTS', DEFAULT_MAX_RESULTS),
  })

  const exportResult = (payload: Parameters<NonNullable<HmiMcpServerOptions['exportResult']>>[0], headers: RequestHeaders): ExportedResult => {
    // 单个结果直接导出 JSON，多个结果打成 zip
    const bundle = bundleResults(payload.files, payload.editorType)
    const entry = results.put(bundle.filename, bundle.body, bundle.contentType)
    return {
      url: `${publicBaseUrl || derivePublicBaseUrl(headers)}/mcp/results/${entry.id}`,
      filename: entry.filename,
      files: bundle.files,
      fileCount: bundle.files.length,
      sizeBytes: entry.body.length,
      expiresInSeconds: Math.round(resultTtlMs / 1000),
    }
  }

  const sweeper = setInterval(() => {
    results.sweep()
    const now = Date.now()
    for (const [id, entry] of sessions) {
      if (now - entry.touchedAt <= sessionTtlMs) continue
      sessions.delete(id)
      void entry.transport.close().catch(() => {})
    }
  }, SWEEP_INTERVAL_MS)
  sweeper.unref()

  const openSession = async (editorType: EditorType): Promise<SessionEntry> => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { sessions.set(id, entry) },
    })
    const server = createHmiMcpServer({ editorType, resolveModelPointApi, exportResult })
    const entry: SessionEntry = { editorType, transport, server, touchedAt: Date.now() }
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId)
    }
    await server.connect(transport)
    return entry
  }

  const handle = (editorType: EditorType) => async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.header('mcp-session-id')
      let entry: SessionEntry | undefined
      if (sessionId) {
        entry = sessions.get(sessionId)
        if (!entry || entry.editorType !== editorType) {
          reject(res, 404, -32001, 'Session not found')
          return
        }
      } else if (req.method === 'POST' && isInitializeRequest(req.body)) {
        if (sessions.size >= maxSessions) {
          reject(res, 503, -32000, 'Too many sessions')
          return
        }
        entry = await openSession(editorType)
        // editorSvcUrl 来自 mcp.json 请求头，改后无需重启；每个地址只提示一次
        const baseUrl = resolveModelPointApi(req.headers)?.baseUrl
        if (baseUrl && !announcedEditorUrls.has(baseUrl)) {
          announcedEditorUrls.add(baseUrl)
          console.log(`[MCP] 查询测点: 可用 (${baseUrl})`)
        }
      } else {
        reject(res, 400, -32000, 'Bad Request: Mcp-Session-Id header is required')
        return
      }
      entry.touchedAt = Date.now()
      await entry.transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error('[MCP] 请求处理异常:', error)
      if (!res.headersSent) reject(res, 500, -32603, 'Internal server error')
    }
  }

  const router: Router = Router()

  // 下载链接靠不可猜测的 ID 和短时效保护，供终端直接下载，不经过 x-mcp-token 校验
  router.get('/results/:id', (req, res) => {
    const entry = RESULT_ID_PATTERN.test(req.params.id) ? results.get(req.params.id) : undefined
    if (!entry) {
      res.status(404).json({ error: 'Result not found or expired' })
      return
    }
    const asciiName = entry.filename.replace(/[^\x20-\x7e]/g, '_')
    res.setHeader('Content-Type', entry.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(entry.filename)}`)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(entry.body)
  })

  router.use((req, res, next) => {
    const origin = req.header('origin')
    if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      reject(res, 403, -32000, 'Origin not allowed')
      return
    }
    if (authToken && !sameSecret(req.header('x-mcp-token') ?? '', authToken)) {
      reject(res, 401, -32001, 'Unauthorized')
      return
    }
    next()
  })

  router.all('/display', handle('display'))
  router.all('/symbol', handle('symbol'))

  return router
}
