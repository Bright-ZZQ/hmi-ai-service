/**
 * 导出打包：单个结果直接导出 JSON，多个结果打成一个 zip（内含每张的 JSON）。
 */
import { strToU8, zipSync } from 'fflate'
import type { EditorType } from '../types'

export interface BundleFile {
  filename: string
  body: string
}

export interface Bundle {
  filename: string
  contentType: string
  body: Buffer
  /** 包内各 JSON 文件名（单个结果时就是它自己） */
  files: string[]
}

/** 同名文件依次加 -2、-3 后缀，避免压缩包内相互覆盖 */
export function uniqueFilenames(filenames: string[]): string[] {
  const used = new Set<string>()
  return filenames.map((filename) => {
    const stem = filename.replace(/\.json$/, '')
    let candidate = filename
    for (let n = 2; used.has(candidate); n++) candidate = `${stem}-${n}.json`
    used.add(candidate)
    return candidate
  })
}

export function bundleResults(files: BundleFile[], editorType: EditorType): Bundle {
  const names = uniqueFilenames(files.map(file => file.filename))
  if (files.length === 1) {
    return {
      filename: names[0],
      contentType: 'application/json; charset=utf-8',
      body: Buffer.from(files[0].body, 'utf8'),
      files: names,
    }
  }
  const entries = Object.fromEntries(files.map((file, index) => [names[index], strToU8(file.body)]))
  return {
    filename: `hmi-${editorType}s-${files.length}.zip`,
    contentType: 'application/zip',
    body: Buffer.from(zipSync(entries, { level: 6 })),
    files: names,
  }
}
