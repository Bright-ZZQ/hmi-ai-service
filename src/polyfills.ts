/**
 * Node 18 兼容：全局 Web Crypto 在 Node 18 中默认不可用，而 MCP SDK 直接引用全局 crypto。
 */
import { webcrypto } from 'node:crypto'

const runtime = globalThis as { crypto?: unknown }

if (!runtime.crypto) {
  runtime.crypto = webcrypto
}
