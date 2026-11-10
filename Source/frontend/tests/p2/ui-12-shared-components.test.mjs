import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

function findAncestor(start, predicate) {
  let current = start
  for (;;) {
    if (predicate(current)) return current
    const parent = dirname(current)
    if (parent === current) throw new Error(`Không tìm thấy gốc từ ${start}`)
    current = parent
  }
}

const root = findAncestor(here, dir => existsSync(join(dir, 'src', 'components', 'SharedPrimitives.tsx')))
const source = readFileSync(join(root, 'src', 'components', 'SharedPrimitives.tsx'), 'utf8')
const css = readFileSync(join(root, 'src', 'components', 'shared-primitives.css'), 'utf8')
const index = readFileSync(join(root, 'src', 'components', 'index.ts'), 'utf8')
const preview = readFileSync(join(root, 'src', 'pages', 'ComponentPreview.tsx'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const module = { exports: {} }
Function('require', 'exports', 'module', compiled)(require, module.exports, module)
const { ElevatedCard, FilterChip, IllustrationLabel } = module.exports
const { renderToStaticMarkup } = require('react-dom/server')
const React = require('react')

test('UI-12/KIT-07: FilterChip công bố trạng thái chọn và số đếm', () => {
  const html = renderToStaticMarkup(React.createElement(FilterChip, { selected: true, count: 12 }, 'Ba Đình'))
  assert.match(html, /type="button"/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /rooms-filter-chip-count[^>]*>12</)
  assert.match(html, />Ba Đình</)
})

test('UI-12/KIT-07: card và nhãn ảnh giữ class tùy biến, nhãn có chữ mặc định', () => {
  const card = renderToStaticMarkup(React.createElement(ElevatedCard, { className: 'demo-card' }, 'Nội dung'))
  const label = renderToStaticMarkup(React.createElement(IllustrationLabel, { className: 'demo-label' }))
  assert.match(card, /class="rooms-elevated-card demo-card"/)
  assert.match(label, /class="rooms-illustration-label demo-label"/)
  assert.match(label, />Ảnh minh họa</)
})

test('UI-12/KIT-05: chip có focus, vùng chạm, hover đúng thiết bị và reduced motion', () => {
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /\.rooms-filter-chip:focus-visible/)
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('UI-12/KIT-06: bốn tone StatusBadge có viền và nền riêng', () => {
  for (const tone of ['available', 'occupied', 'reserved', 'maintenance']) {
    assert.match(css, new RegExp(`\\.rooms-status--${tone}\\s*\\{[^}]*border-color:`))
  }
})

test('UI-12/KIT-07: kit export ba component và preview có mẫu dùng chung', () => {
  for (const name of ['FilterChip', 'ElevatedCard', 'IllustrationLabel']) assert.match(index, new RegExp(`\\b${name}\\b`))
  assert.match(index, /shared-primitives\.css/)
  assert.match(preview, /id="shared"/)
  assert.match(preview, /<FilterChip/)
  assert.match(preview, /<ElevatedCard/)
  assert.match(preview, /<IllustrationLabel/)
})
