// 依赖方向检查：扫描 src/**/*.ts 的相对 import / export-from，违反方向规则时以非零码退出
//   tools/   不得引用 agent/ mcp/ routes/
//   mcp/     不得引用 agent/
//   prompts/ 不得引用 agent/ mcp/
const fs = require('node:fs')
const path = require('node:path')

const SRC = path.resolve(__dirname, '..', 'src')

const RULES = [
  { from: 'tools', forbidden: ['agent', 'mcp', 'routes'] },
  { from: 'mcp', forbidden: ['agent'] },
  { from: 'prompts', forbidden: ['agent', 'mcp'] },
]

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return full.endsWith('.ts') ? [full] : []
  })
}

const topDir = file => path.relative(SRC, file).split(path.sep)[0]
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+'(\.[^']*)'|import\s+'(\.[^']*)'|import\(\s*'(\.[^']*)'\s*\)/g

const violations = []
for (const file of walk(SRC)) {
  const from = topDir(file)
  const rule = RULES.find(r => r.from === from)
  if (!rule) continue
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2] ?? match[3]
    const target = topDir(path.resolve(path.dirname(file), spec))
    if (rule.forbidden.includes(target)) {
      violations.push(`${path.relative(SRC, file).replace(/\\/g, '/')} -> ${spec}（${from}/ 不得引用 ${target}/）`)
    }
  }
}

if (violations.length > 0) {
  console.error(`依赖方向检查失败（${violations.length} 处）：\n- ${violations.join('\n- ')}`)
  process.exit(1)
}
console.log('依赖方向检查通过')
