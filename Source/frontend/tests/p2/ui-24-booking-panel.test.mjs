import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { buttonByText, dispatch, find, mount, loadModule, draftFirst, wait } from './public-dom.mjs'
const require = createRequire(import.meta.url), React = require('react')
const { ViewingCalendar } = loadModule(draftFirst('src/features/public/ViewingCalendar.tsx'))
const { todayHanoi, plusDays, hourInstant } = loadModule(draftFirst('src/features/viewings/time.ts'))
const css = readFileSync(draftFirst('src/features/public/booking-panel.css'), 'utf8')
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref() })
test('VIEW-08/21: month calendar shows disabled days, available dates and selected state through day 30', async () => {
  const today = todayHanoi(), end = plusDays(today, 30), next = plusDays(end, 1)
  let selected
  const props = { days: [{ date: end, hours: [hourInstant(end, 19)] }, { date: next, hours: [hourInstant(next, 8)] }], selectedDay: end, onSelectDay: day => { selected = day } }
  const app = await mount(React.createElement(ViewingCalendar, props))
  try {
    for (let i = 0; i < 2 && !find(app.container, n => n.attributes?.['aria-label']?.startsWith(end)).length; i++) {
      dispatch(app.container, find(app.container, n => n.attributes?.['aria-label'] === 'Tháng sau')[0], 'click'); await wait(20)
    }
    const last = find(app.container, n => n.attributes?.['aria-label']?.startsWith(end))[0]
    assert.equal(last.disabled, false); assert.equal(last.attributes['aria-pressed'], 'true')
    dispatch(app.container, last, 'click'); assert.equal(selected, end)
    const outside = find(app.container, n => n.attributes?.['aria-label']?.startsWith(next))[0]
    if (outside) assert.equal(outside.hasAttribute('disabled'), true)
    assert.match(app.container.textContent, /Còn chỗKhông đặt đượcĐã chọn/)
  } finally { await app.stop() }
})
test('UI-24/KIT-05: sticky desktop, mobile flow, 360px grid and reduced motion remain explicit', () => {
  assert.match(css, /position:\s*sticky/)
  assert.match(css, /@media \(max-width: 979px\)[\s\S]*position:\s*static/)
  assert.match(css, /@media \(max-width: 420px\)/)
  assert.match(css, /repeat\(7, minmax\(0, 1fr\)\)/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})
test('UI-24: room detail still includes the booking jump anchor and form slot', () => {
  const source = readFileSync(draftFirst('src/pages/public/PublicRoomPage.tsx'), 'utf8')
  assert.match(source, /ViewingForm/); assert.match(readFileSync(draftFirst('src/pages/public/RoomDetailView.tsx'), 'utf8'), /BookingJumpBar/)
})
