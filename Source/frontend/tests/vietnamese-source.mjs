import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const exports = {}
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/shared/i18n/vi.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports })

// Existing layout checks retain their literal Vietnamese expectations after copy moves to the dictionary.
export function vietnameseSource(source) {
  const text = key => {
    if (!(key in exports.vi)) throw new Error(`Missing Vietnamese key: ${key}`)
    return exports.vi[key]
  }
  return source
    .replace(/=\{t\('([^']+)'\)\}/g, (_, key) => `="${text(key)}"`)
    .replace(/\{t\('([^']+)'\)\}/g, (_, key) => text(key))
    .replace(/\bt\('([^']+)'\)/g, (_, key) => `'${text(key)}'`)
}
