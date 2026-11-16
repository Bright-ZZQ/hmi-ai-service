const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * 模型输出的文字内容可能被 HTML 转义（如“报警&gt;80”），而图元文字是纯文本，
 * 需还原为原字符。单次扫描，避免 &amp;gt; 被二次解码。
 */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g, (match, dec, hex, name) => {
    if (name) {
      const key = name.toLowerCase()
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : match
    }
    const code = dec !== undefined ? Number(dec) : parseInt(hex, 16)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
  })
}
