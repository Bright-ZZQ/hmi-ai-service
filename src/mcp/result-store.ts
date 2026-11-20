/**
 * 组装结果的短期下载存储：客户端用链接把 JSON 原样下载到用户本地，不经过模型转写。
 */
import { randomUUID } from 'node:crypto'

export interface StoredResult {
  id: string
  filename: string
  contentType: string
  body: Buffer
  expiresAt: number
}

export interface ResultStoreOptions {
  ttlMs: number
  maxEntries: number
}

export const RESULT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const FALLBACK_NAMES = { display: 'hmi-display', symbol: 'hmi-symbol' }
const MAX_NAME_LENGTH = 60

/** 取图纸/图符名称作文件名：去掉路径与非法字符，空则回退默认名 */
export function toFilename(name: unknown, kind: keyof typeof FALLBACK_NAMES): string {
  const cleaned = (typeof name === 'string' ? name : '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
  return `${cleaned || FALLBACK_NAMES[kind]}.json`
}

export class ResultStore {
  private readonly entries = new Map<string, StoredResult>()

  constructor(private readonly options: ResultStoreOptions) {}

  put(filename: string, body: Buffer, contentType: string): StoredResult {
    this.sweep()
    // Map 保持插入顺序，超限时淘汰最早的结果
    while (this.entries.size >= this.options.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    const entry: StoredResult = { id: randomUUID(), filename, contentType, body, expiresAt: Date.now() + this.options.ttlMs }
    this.entries.set(entry.id, entry)
    return entry
  }

  get(id: string): StoredResult | undefined {
    const entry = this.entries.get(id)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(id)
      return undefined
    }
    return entry
  }

  sweep(): void {
    const now = Date.now()
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id)
    }
  }

  get size(): number {
    return this.entries.size
  }
}
