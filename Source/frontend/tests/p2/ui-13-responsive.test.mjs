import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function findFrontendRoot(start) {
  let current = start
  for (;;) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'src/layouts/layouts.css'))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error(`Không tìm thấy Source/frontend từ ${start}`)
    current = parent
  }
}

const frontendRoot = findFrontendRoot(dirname(fileURLToPath(import.meta.url)))
const css = readFileSync(join(frontendRoot, 'src/layouts/layouts.css'), 'utf8')

test('UI-13: internal layouts contain long content without widening the page', () => {
  assert.match(css, /\.layout-main[\s\S]*min-width:\s*0/)
  assert.match(css, /overflow-wrap:\s*anywhere/)
})

test('UI-13: pricing tier tables scroll inside their own frame on narrow screens', () => {
  assert.match(css, /table\.pricing-tiers[\s\S]*overflow-x:\s*auto/)
  assert.match(css, /overscroll-behavior-inline:\s*contain/)
})

test('UI-13: narrow action groups wrap readable buttons instead of overflowing', () => {
  assert.match(css, /@media \(max-width:\s*480px\)/)
  assert.match(css, /\.viewings-actions[\s\S]*white-space:\s*normal/)
})

test('UI-13: native field selects reserve space and position their indicator 14px from the edge', () => {
  const fieldSelect = css.match(/select\.rooms-field-input\s*{([^}]*)}/)?.[1] ?? ''
  const fieldPadding = Number(fieldSelect.match(/padding-right:\s*(\d+)px/)?.[1] ?? 0)
  assert.ok(fieldPadding >= 32, `expected select.rooms-field-input padding-right >= 32px, got ${fieldPadding}px`)
  assert.match(fieldSelect, /appearance:\s*none/)
  assert.match(fieldSelect, /background-position:\s*right\s+14px\s+center/)
})

