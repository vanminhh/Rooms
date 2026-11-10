// P2 fixes from the UI review of 10/11/2026 (docs/phase-ui/feature_ui-mockup.md, Nhật ký lỗi):
// "Hôm nay" closes after the last slot started (VIEW-08), phone booking bar, startup screen, minimum text sizes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { draftFirst, loadModule, mount, find, buttonByText, isDisabled } from './public-dom.mjs'

const nodeRequire = createRequire(import.meta.url)
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

// Same clock mock as fe-p2-17: zero-argument `new Date()` returns a fixed instant (Hà Nội is UTC+7, no DST).
const HANOI_OFFSET_MS = 7 * 3600_000
function hanoiInstant(day, hour, minute = 0) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + (hour * 60 + minute) * 60_000 - HANOI_OFFSET_MS)
}
function installFixedNow(ms) {
  const RealDate = globalThis.Date
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate(ms)
      return new RealDate(...args)
    }
  }
  globalThis.Date = FixedDate
  return () => { globalThis.Date = RealDate }
}

async function mountViewingForm(nowMs) {
  const restore = installFixedNow(nowMs)
  const React = nodeRequire('react')
  const { ViewingForm } = loadModule(draftFirst('src/features/public/ViewingForm.tsx'))
  const app = await mount(React.createElement(ViewingForm, { roomId: 7, roomCode: '201' }))
  return { app, async stop() { await app.stop(); restore() } }
}
const dateInput = container => find(container, n => n.tagName === 'INPUT' && n.type === 'date')[0]

test('VIEW-08: at 19:00 Hà Nội every slot of today has started, so "Hôm nay" is disabled and the picker starts tomorrow', async () => {
  const { app, stop } = await mountViewingForm(hanoiInstant('2026-11-10', 19, 0).getTime())
  try {
    const todayButton = buttonByText(app.container, 'Hôm nay')
    assert.ok(isDisabled(todayButton), '"Hôm nay" must be disabled when no slot is left today')
    assert.equal(todayButton.attributes['aria-describedby'], 'viewing-today-closed')
    assert.ok(app.container.textContent.includes('Hôm nay đã hết buổi xem, vui lòng chọn từ ngày mai.'))
    assert.equal(dateInput(app.container).attributes.min, '2026-11-11')
    assert.ok(!isDisabled(buttonByText(app.container, 'Ngày mai')))
  } finally { await stop() }
})

test('VIEW-08: at 17:59 the evening slot is still open, so "Hôm nay" stays enabled and the picker starts today', async () => {
  const { app, stop } = await mountViewingForm(hanoiInstant('2026-11-10', 17, 59).getTime())
  try {
    assert.ok(!isDisabled(buttonByText(app.container, 'Hôm nay')))
    assert.ok(!app.container.textContent.includes('Hôm nay đã hết buổi xem'))
    assert.equal(dateInput(app.container).attributes.min, '2026-11-10')
  } finally { await stop() }
})

test('UI-24: the phone booking bar is rendered hidden and stays hidden without IntersectionObserver', async () => {
  const React = nodeRequire('react')
  const { BookingJumpBar } = loadModule(draftFirst('src/features/public/BookingJumpBar.tsx'))
  const app = await mount(React.createElement(BookingJumpBar, { target: { current: null }, roomCode: '201', priceLabel: '2.800.000 đ' }))
  const bar = find(app.container, n => n.attributes.class === 'public-booking-jump')[0]
  assert.ok(bar, 'bar exists')
  assert.ok(bar.hasAttribute('hidden'), 'hidden until the observer reports the card is below the viewport')
  assert.ok(buttonByText(app.container, 'Đặt lịch xem phòng 201'))
  await app.stop()
})

const read = rel => readFileSync(draftFirst(rel), 'utf8')

test('UI-24: the phone booking bar is hidden on wide screens and honours the hidden attribute', () => {
  const css = read('src/features/public/booking-panel.css')
  assert.match(css, /\.public-booking-jump\[hidden\]\s*\{\s*display:\s*none/)
  assert.match(css, /@media \(min-width: 980px\)\s*\{\s*\.rooms-theme \.public-booking-jump\s*\{\s*display:\s*none/)
  assert.match(css, /\.public-booking-jump button\s*\{[^}]*min-height:\s*44px/)
})

test('UI-13: the session check screen fills the viewport with the sand theme instead of a white page', () => {
  assert.match(read('src/app/RequireAuth.tsx'), /className="rooms-theme layout-startup"/)
  const rule = read('src/layouts/layouts.css').match(/\.rooms-theme\.layout-startup\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(rule, /min-height:\s*100vh/)
  assert.match(rule, /min-height:\s*100dvh/)
})

test('UI-11: no kit text below 9 px; eyebrows, search labels and the footer bottom line are at least 11 px', () => {
  const sizes = css => [...css.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]))
  for (const file of ['src/components/Navigation.css', 'src/components/rooms.css']) {
    const tooSmall = sizes(read(file)).filter(px => px < 9)
    assert.deepEqual(tooSmall, [], `${file} has font sizes below 9 px`)
  }
  const kit = read('src/components/rooms.css')
  assert.match(kit, /\.rooms-eyebrow \{ display: block; font-size: 11px;/)
  assert.match(kit, /\.rooms-search label \{[^}]*font-size: 11px;/)
  assert.match(read('src/components/Navigation.css'), /\.rooms-footer-bottom \{[^}]*font-size: 11px;/)
})
