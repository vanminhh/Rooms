import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Resolves to src/layouts/layouts.css of the same tree (main app or draft folder).
const css = readFileSync(new URL('../../src/layouts/layouts.css', import.meta.url), 'utf8')

test('UI-40: layout roots fill the viewport so short pages keep the sand background', () => {
  const rule = css.match(/\.rooms-theme:has\(>\s*\.layout-main\)\s*{([^}]*)}/)?.[1] ?? ''
  assert.match(rule, /min-height:\s*100vh/)
  assert.match(rule, /min-height:\s*100dvh/)
})
