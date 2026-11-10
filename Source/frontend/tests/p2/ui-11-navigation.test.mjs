import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function findRoot(start) {
  let current = start
  for (;;) {
    if (existsSync(join(current, 'src', 'components', 'Navigation.tsx'))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error('Không tìm thấy thư mục gốc UI-11')
    current = parent
  }
}

const root = findRoot(dirname(fileURLToPath(import.meta.url)))
const read = path => readFileSync(join(root, path), 'utf8')
const navigation = read('src/components/Navigation.tsx')
const css = read('src/components/Navigation.css')
const publicLayout = read('src/layouts/PublicLayout.tsx')

test('UI-11/KIT-10: header renders the approved ROOMS / APARTMENTS HANOI wordmark', () => {
  assert.match(navigation, />ROOMS</)
  assert.match(navigation, />APARTMENTS HANOI</)
  assert.match(navigation, /rooms-brand-mark/)
})

test('UI-11/UI-08: compact menu exposes expanded state, controlled panel and Escape focus return', () => {
  assert.match(navigation, /aria-expanded=\{open\}/)
  assert.match(navigation, /aria-controls=\{panelId\}/)
  assert.match(navigation, /event\.key === 'Escape'/)
  assert.match(navigation, /toggle\.current\?\.focus\(\)/)
  assert.match(css, /@media \(max-width: 1120px\)/)
  assert.match(css, /min-height: 44px/)
})

test('UI-11/UI-01: public header maps every approved item and separates the account action', () => {
  for (const expected of [
    /Tìm phòng[^\n]*\/phong/,
    /Khu vực[^\n]*\/#khu-vuc/,
    /Liên hệ[^\n]*\/#lien-he/,
    /Lên lịch xem<\/a>/,
    /accountHref=/,
  ]) assert.match(publicLayout, expected)
})

test('UI-11/AUTH-10: footer is four columns and contact remains API-backed without a sample phone', () => {
  assert.match(css, /grid-template-columns: 1\.35fr repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(publicLayout, /usePublicContact\(\)/)
  assert.match(publicLayout, /ContactInfo contact=\{contact\.data \?\? null\}/)
  assert.doesNotMatch(navigation + publicLayout, /0900\d{6}/)
})

test('UI-11/KIT-05: navigation has 360px-safe stacking and reduced-motion treatment', () => {
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*grid-template-columns: 1fr/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.doesNotMatch(css, /min-width:\s*[4-9]\d\dpx/)
})

test('UI-11/KIT-09: header hover stays readable on sand and white hover is footer-only', () => {
  assert.match(css, /\.rooms-nav a:hover\s*\{[^}]*color:\s*var\(--rooms-gold-text\)/)
  assert.match(css, /\.rooms-nav \.rooms-account-link:hover\s*\{[^}]*background:\s*#153d3608[^}]*color:\s*var\(--rooms-ink\)/)
  assert.match(css, /\.rooms-footer a:hover\s*\{[^}]*color:\s*#fff/)
  assert.doesNotMatch(css, /\.rooms-nav a:hover\s*,\s*\.rooms-footer a:hover/)
})
