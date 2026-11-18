/**
 * 思考摘要：从推理模型的思考流（reasoning_content）里只摘出“关键结论”实时展示，
 * 既让用户看到分析进展，又不把冗长的推演草稿刷到界面上。
 *
 * 约定模型在思考中把关键决策单独起一行并以“【结论】”开头（见系统提示词）。优先展示这些标记行；
 * 模型没有标注时，用严格的启发式从推演里挑少量“决策类”中文句子兜底（低频、限量）。
 * 长时间无输出时的进度提示由调用方（agent-service 的进度计时器）负责。
 */

const MARKER = '【结论】'
const MAX_CONCLUSION_LENGTH = 120
const MAX_PENDING_CHARS = 600
const DEFAULT_MAX_ITEMS = 12

// 兜底：模型不遵守标注约定时，从推演中挑“决策类”的完整中文句子，低频、限量
const DECISION_WORDS = /决定|选择|采用|改用|方案|布局|分区|矛盾|冲突|最终|就这么|这样做|更好的做法|最简单|注意到|歧义/
const FALLBACK_SENTENCE_END = /[。！？!?；;\n]/
const FALLBACK_MIN_LENGTH = 14
const FALLBACK_MAX_LENGTH = 80
const FALLBACK_MIN_CJK_RATIO = 0.6
const FALLBACK_MAX_NOISE_RATIO = 0.12
const FALLBACK_INTERVAL_MS = 12000
const FALLBACK_MAX_ITEMS = 5
const QUOTED = /[“"「『][^”"」』]*[”"」』]/g
const FILLER_START = /^(好的|嗯|让我|我来|我们来|等一下|等等|不对|哦|再看|再读|再仔细|想想)/

export interface ThinkingDigestOptions {
  /** 单次模型调用最多展示的结论条数 */
  maxItems?: number
  now?: () => number
}

function isDecisionSentence(raw: string): boolean {
  const sentence = raw.replace(/[`*_#>]+/g, '').replace(/\s+/g, ' ').trim()
  if (sentence.length < FALLBACK_MIN_LENGTH || sentence.length > FALLBACK_MAX_LENGTH || FILLER_START.test(sentence)) return false
  // 引号里是用户需求原文（如标题文字），不能拿来判断是否为关键结论
  const body = sentence.replace(QUOTED, '')
  if (!DECISION_WORDS.test(body) || body.length === 0) return false
  const cjk = body.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const noise = body.match(/[A-Za-z0-9=<>{}()\[\]_/\\*+\-:#]/g)?.length ?? 0
  return cjk / body.length >= FALLBACK_MIN_CJK_RATIO && noise / body.length <= FALLBACK_MAX_NOISE_RATIO
}

export class ThinkingDigest {
  private pending = ''
  private fallbackPending = ''
  private emitted = 0
  private fallbackEmitted = 0
  private lastFallbackAt: number
  private readonly seen = new Set<string>()
  private readonly maxItems: number
  private readonly now: () => number

  constructor(options: ThinkingDigestOptions = {}) {
    this.now = options.now ?? Date.now
    this.maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS
    this.lastFallbackAt = this.now()
  }

  /** 喂入一段思考文本，返回本次应展示的结论（可能为空） */
  push(chunk: string): string[] {
    this.pending += chunk
    this.fallbackPending += chunk
    const out: string[] = []
    let newline = this.pending.indexOf('\n')
    while (newline >= 0) {
      const line = this.pending.slice(0, newline)
      this.pending = this.pending.slice(newline + 1)
      const picked = this.pick(line)
      if (picked) out.push(picked)
      newline = this.pending.indexOf('\n')
    }
    // 没有换行的超长文本不会无限占用缓冲
    if (this.pending.length > MAX_PENDING_CHARS) this.pending = this.pending.slice(-MAX_PENDING_CHARS)

    out.push(...this.pickFallback())
    return out
  }

  /** 思考流结束时调用，输出缓冲中最后一行（如果它是结论） */
  flush(): string[] {
    const picked = this.pick(this.pending)
    this.pending = ''
    this.fallbackPending = ''
    return picked ? [picked] : []
  }

  private pick(line: string): string | undefined {
    const at = line.indexOf(MARKER)
    if (at < 0 || this.emitted >= this.maxItems) return undefined
    const text = line
      .slice(at + MARKER.length)
      .replace(/[`*_#>]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text || this.seen.has(text)) return undefined
    this.seen.add(text)
    this.emitted++
    return text.length > MAX_CONCLUSION_LENGTH ? `${text.slice(0, MAX_CONCLUSION_LENGTH)}…` : text
  }

  private pickFallback(): string[] {
    const out: string[] = []
    let match = FALLBACK_SENTENCE_END.exec(this.fallbackPending)
    while (match) {
      const sentence = this.fallbackPending.slice(0, match.index)
      this.fallbackPending = this.fallbackPending.slice(match.index + 1)
      const at = this.now()
      if (
        this.fallbackEmitted < FALLBACK_MAX_ITEMS
        && at - this.lastFallbackAt >= FALLBACK_INTERVAL_MS
        && !sentence.includes(MARKER)
        && isDecisionSentence(sentence)
      ) {
        const text = sentence.replace(/[`*_#>]+/g, '').replace(/\s+/g, ' ').trim()
        if (!this.seen.has(text)) {
          this.seen.add(text)
          this.fallbackEmitted++
          this.lastFallbackAt = at
          out.push(text)
        }
      }
      match = FALLBACK_SENTENCE_END.exec(this.fallbackPending)
    }
    if (this.fallbackPending.length > MAX_PENDING_CHARS) this.fallbackPending = ''
    return out
  }
}
