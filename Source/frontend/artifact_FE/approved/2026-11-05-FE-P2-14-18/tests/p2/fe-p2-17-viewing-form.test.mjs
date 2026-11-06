// CP-5 (FE-P2-17): src/features/public/ViewingForm.tsx + viewing-schema.ts. Spec/PLAN: VIEW-01/02/08/11/12,
// UI-05/08/09; decision D-3 (success screen wording). Scenarios #1..#20 from PLAN.md CP-5.
//
// Outside edges faked: `fetch` (fakeFetch) and the fake DOM (public-dom.mjs; Node has no real DOM, no jsdom
// installed), same harness as the other p2 test files. ViewingForm.tsx and viewing-schema.ts run unmodified via
// `loadModule`/`draftFirst`, not mocked.
//
// Extra outside edge mocked HERE ONLY: the clock. `hanoiToday()`/`maxVisitDate()`/`startedSlots()` all default
// their `now` parameter to `new Date()` (real wall-clock), and ViewingForm.tsx calls them with no argument at
// render/validation time — it has no prop or context to inject a fixed "now" (PLAN's claim that "now" is
// "bơm vào qua tham số `now`" only holds for viewing-schema.ts's own exports when called directly with an
// argument, not for how ViewingForm.tsx uses them). To test date/time boundaries deterministically instead of
// depending on the real machine clock, `installFixedNow()` below temporarily replaces `globalThis.Date` so that
// zero-argument `new Date()` returns a fixed instant, while `Date.now()` (used by this harness's own `until()`
// timeout loop) keeps ticking on the real clock. This mocks only the clock, never the unit under test.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import {
  draftFirst, loadModule, mount, find, dispatch, fill, check, until, wait,
  fakeFetch, ok, fail, alerts, buttonByText, isDisabled,
} from './public-dom.mjs'

const nodeRequire = createRequire(import.meta.url)

// @tanstack/react-query is not used by ViewingForm, but other p2 files keep the process alive via timers;
// mirror the same end-of-file convention so this file does not hang on an open handle.
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

// ---------- clock mock (outside edge) ----------
const HANOI_OFFSET_MS = 7 * 3600_000

// Builds a real epoch instant such that, inside viewing-schema.ts's own math (which adds +7h before reading the
// date), the Hanoi calendar date is `day` and the Hanoi local time-of-day is `hour`:`minute`. Inverts the
// schema's own `(now.getTime() + HANOI_OFFSET_MS)` formula so the fixture is independent of any one date's
// wall-clock offset.
function hanoiInstant(day, hour = 0, minute = 0) {
  const localMs = Date.parse(`${day}T00:00:00Z`) + (hour * 60 + minute) * 60_000
  return new Date(localMs - HANOI_OFFSET_MS)
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

// Baseline "now" for every scenario that is not itself about date/time boundaries: 2026-11-10 09:00 Hanoi, well
// before any slot's start hour (8/14/18), so no radio is ever disabled as a side effect.
const BASE_DAY = '2026-11-10'
const TOMORROW = '2026-11-11'

// ---------- mount + fetch helpers ----------
function viewingRule(result) { return { prefix: '/public/viewings', method: 'POST', handler: () => result } }
function viewingDelayed(result, ms) { return { prefix: '/public/viewings', method: 'POST', handler: async () => { await wait(ms); return result } } }
function viewingThrows() { return { prefix: '/public/viewings', method: 'POST', handler: () => { throw new Error('network down') } } }
const viewingCalls = calls => calls.filter(c => c.url.includes('/public/viewings'))

async function mountForm(roomId, rules, nowMs = hanoiInstant(BASE_DAY, 9, 0).getTime()) {
  const restoreClock = installFixedNow(nowMs)
  const calls = fakeFetch(rules)
  const React = nodeRequire('react')
  const { ViewingForm } = loadModule(draftFirst('src/features/public/ViewingForm.tsx'))
  const app = await mount(React.createElement(ViewingForm, { roomId }))
  return { ...app, calls, async stopAll() { await app.stop(); restoreClock() } }
}

// ---------- DOM query helpers (label -> input -> adjacent error paragraph, mirrors auth-login-flow.test.mjs) ----------
function inputByLabel(container, label) {
  const lab = find(container, n => n.tagName === 'LABEL' && n.textContent.trim() === label)[0]
  if (!lab) return undefined
  return find(container, n => n.attributes.id === lab.attributes.for)[0]
}
function errorFor(container, label) {
  const input = inputByLabel(container, label)
  if (!input) return undefined
  return find(container, n => n.attributes.id === `${input.attributes.id}-error`)[0]?.textContent
}
function formEl(container) { return find(container, n => n.tagName === 'FORM')[0] }
const submit = container => dispatch(container, formEl(container), 'submit')
const radios = container => find(container, n => n.tagName === 'INPUT' && n.type === 'radio')
const radioByLabel = (container, label) => radios(container).find(r => r.parentNode.textContent.includes(label))
const slotsFieldset = container => find(container, n => n.tagName === 'FIELDSET')[0]
const statusBlocks = container => find(container, n => n.attributes.role === 'status')
const lastViewingBody = calls => JSON.parse(viewingCalls(calls).at(-1).body)

const SLOT_LABELS = ['Sáng (8:00–11:00)', 'Chiều (14:00–17:00)', 'Tối (18:00–20:00)']

// ======================================================================================
// #1
// ======================================================================================
test('FE-P2-17 #1 (VIEW-01): a valid submission sends exactly {roomId, guestName, guestPhone, visitDate, timeSlot}, no note/website keys when both are empty', async () => {
  const app = await mountForm(10, [viewingRule(ok({ received: true }))])
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    await until(() => viewingCalls(app.calls).length === 1, 'viewing request sent')
    const body = lastViewingBody(app.calls)
    assert.deepEqual(Object.keys(body).sort(), ['guestName', 'guestPhone', 'roomId', 'timeSlot', 'visitDate'].sort())
    assert.equal(body.roomId, 10)
    assert.equal(body.guestName, 'Nguyễn Văn An')
    assert.equal(body.guestPhone, '0900000004')
    assert.equal(body.visitDate, TOMORROW)
    assert.equal(body.timeSlot, 'MORNING')
  } finally { await app.stopAll() }
})

// ======================================================================================
// #2
// ======================================================================================
test('FE-P2-17 #2 (VIEW-08): exactly 3 time-slot radios with the labels "Sáng (8:00–11:00)", "Chiều (14:00–17:00)", "Tối (18:00–20:00)"', async () => {
  const app = await mountForm(10, [viewingRule(ok({ received: true }))])
  try {
    const found = radios(app.container)
    assert.equal(found.length, 3)
    assert.deepEqual(found.map(r => r.parentNode.textContent.replace('Đã bắt đầu', '').trim()), SLOT_LABELS)
  } finally { await app.stopAll() }
})

// ======================================================================================
// #3
// ======================================================================================
test('FE-P2-17 #3 (VIEW-08): at 15:00 Hanoi, picking today disables Sáng and Chiều with label "Đã bắt đầu"; Tối stays pickable', async () => {
  const app = await mountForm(10, [viewingRule(ok({ received: true }))], hanoiInstant(BASE_DAY, 15, 0).getTime())
  try {
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), BASE_DAY)
    await until(() => isDisabled(radioByLabel(app.container, 'Sáng (8:00–11:00)')), 'morning disabled')
    assert.ok(radioByLabel(app.container, 'Sáng (8:00–11:00)').parentNode.textContent.includes('Đã bắt đầu'))
    assert.ok(isDisabled(radioByLabel(app.container, 'Chiều (14:00–17:00)')))
    assert.ok(radioByLabel(app.container, 'Chiều (14:00–17:00)').parentNode.textContent.includes('Đã bắt đầu'))
    assert.ok(!isDisabled(radioByLabel(app.container, 'Tối (18:00–20:00)')))
    assert.ok(!radioByLabel(app.container, 'Tối (18:00–20:00)').parentNode.textContent.includes('Đã bắt đầu'))
  } finally { await app.stopAll() }
})

// ======================================================================================
// #4
// ======================================================================================
// PLAN's scenario text asks for "a suggestion to pick another date" in addition to disabling all 3 slots. The
// coder's finalized copy (confirmed by the task) has NO such sentence — only the "Đã bắt đầu" label on each
// disabled radio, same as #3. This test asserts the actual, approved-wording-only behavior (3x "Đã bắt đầu",
// no extra sentence) and that no request can be sent; the missing suggestion sentence is reported as a PLAN/
// code mismatch, not asserted here, per the task's instruction.
test('FE-P2-17 #4 (VIEW-08): at 19:00 Hanoi, picking today disables all 3 slots (each "Đã bắt đầu"); no slot can be chosen so no request is sent', async () => {
  const app = await mountForm(10, [viewingRule(ok({ received: true }))], hanoiInstant(BASE_DAY, 19, 0).getTime())
  try {
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), BASE_DAY)
    await until(() => SLOT_LABELS.every(label => isDisabled(radioByLabel(app.container, label))), 'all 3 slots disabled')
    for (const label of SLOT_LABELS) assert.ok(radioByLabel(app.container, label).parentNode.textContent.includes('Đã bắt đầu'), label)
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    submit(app.container)
    await wait(80)
    assert.equal(viewingCalls(app.calls).length, 0, 'no slot could be checked, so no request is sent')
  } finally { await app.stopAll() }
})

// ======================================================================================
// #5
// ======================================================================================
test('FE-P2-17 #5 (VIEW-08): at 15:00 Hanoi, picking tomorrow leaves all 3 slots pickable', async () => {
  const app = await mountForm(10, [viewingRule(ok({ received: true }))], hanoiInstant(BASE_DAY, 15, 0).getTime())
  try {
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    await until(() => inputByLabel(app.container, 'Ngày muốn xem').value === TOMORROW, 'date filled')
    await wait(50)
    for (const label of SLOT_LABELS) {
      assert.ok(!isDisabled(radioByLabel(app.container, label)), label)
      assert.ok(!radioByLabel(app.container, label).parentNode.textContent.includes('Đã bắt đầu'), label)
    }
  } finally { await app.stopAll() }
})

// ======================================================================================
// #6
// ======================================================================================
test('FE-P2-17 #6 (VIEW-08): the date input min/max are today/+30, and both boundary dates can be submitted', async () => {
  const now = hanoiInstant(BASE_DAY, 10, 0).getTime() // BASE_DAY has 30 days left in Nov, so today+30 = 2026-12-10
  const today = BASE_DAY
  const maxDate = '2026-12-10'
  let app = await mountForm(10, [viewingRule(ok({ received: true }))], now)
  try {
    const dateInput = inputByLabel(app.container, 'Ngày muốn xem')
    assert.equal(dateInput.getAttribute('min'), today)
    assert.equal(dateInput.getAttribute('max'), maxDate)
  } finally { await app.stopAll() }

  app = await mountForm(11, [viewingRule(ok({ received: true }))], now)
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), today)
    check(app.container, radioByLabel(app.container, 'Tối (18:00–20:00)'), true)
    submit(app.container)
    await until(() => viewingCalls(app.calls).length === 1, 'today boundary accepted')
    assert.equal(lastViewingBody(app.calls).visitDate, today)
  } finally { await app.stopAll() }

  app = await mountForm(12, [viewingRule(ok({ received: true }))], now)
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), maxDate)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    await until(() => viewingCalls(app.calls).length === 1, 'today+30 boundary accepted')
    assert.equal(lastViewingBody(app.calls).visitDate, maxDate)
  } finally { await app.stopAll() }
})

// ======================================================================================
// #7
// ======================================================================================
test('FE-P2-17 #7 (VIEW-08): yesterday and today+31 are rejected with "Ngày xem phải từ hôm nay đến 30 ngày tới"; no request sent', async () => {
  const now = hanoiInstant(BASE_DAY, 10, 0).getTime()
  const yesterday = '2026-11-09'
  const beyondMax = '2026-12-11' // today+30 = 2026-12-10, so +31 = 2026-12-11

  for (const bad of [yesterday, beyondMax]) {
    const app = await mountForm(10, [viewingRule(ok({ received: true }))], now)
    try {
      fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
      fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
      fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), bad)
      check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
      submit(app.container)
      await until(() => errorFor(app.container, 'Ngày muốn xem') !== undefined, `error for ${bad}`)
      assert.equal(errorFor(app.container, 'Ngày muốn xem'), 'Ngày xem phải từ hôm nay đến 30 ngày tới')
      assert.equal(viewingCalls(app.calls).length, 0, `no request for ${bad}`)
    } finally { await app.stopAll() }
  }
})

// ======================================================================================
// #8
// ======================================================================================
test('FE-P2-17 #8 (G-02): month-end rollover (31/10 -> +30 = 30/11) and Hanoi date computed from a UTC instant on a different calendar date', async () => {
  const { hanoiToday, maxVisitDate } = loadModule(draftFirst('src/features/public/viewing-schema.ts'))
  // Pure month-end check: today = 2026-10-31 (noon Hanoi, no day-boundary ambiguity) -> +30 days = 2026-11-30.
  assert.equal(maxVisitDate(hanoiInstant('2026-10-31', 12, 0)), '2026-11-30')
  // Asia/Ho_Chi_Minh check: this instant's own UTC calendar date is 2026-10-31, but +7h puts it at
  // 2026-11-01T02:00 Hanoi time, so hanoiToday must read 2026-11-01, not the UTC date.
  const crossing = new Date('2026-10-31T19:00:00Z')
  assert.equal(crossing.toISOString().slice(0, 10), '2026-10-31', 'fixture\'s own UTC date is 31/10')
  assert.equal(hanoiToday(crossing), '2026-11-01', 'Hanoi date is already 01/11, not the UTC date')
})

// ======================================================================================
// #9
// ======================================================================================
test('FE-P2-17 #9 (DTO BE): invalid phone formats show "Số điện thoại không hợp lệ"; no request', async () => {
  for (const bad of ['090000000', '1900000000', '0900 000 004']) {
    const app = await mountForm(10, [viewingRule(ok({ received: true }))])
    try {
      fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
      fill(app.container, inputByLabel(app.container, 'Số điện thoại'), bad)
      fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
      check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
      submit(app.container)
      await until(() => errorFor(app.container, 'Số điện thoại') !== undefined, `error for phone "${bad}"`)
      assert.equal(errorFor(app.container, 'Số điện thoại'), 'Số điện thoại không hợp lệ')
      assert.equal(viewingCalls(app.calls).length, 0, `no request for phone "${bad}"`)
    } finally { await app.stopAll() }
  }
})

// ======================================================================================
// #10
// ======================================================================================
test('FE-P2-17 #10 (DTO BE): name length 1 or 101 shows "Họ tên phải từ 2 đến 100 ký tự"; length 2 and 100 submit', async () => {
  for (const bad of ['A', 'A'.repeat(101)]) {
    const app = await mountForm(10, [viewingRule(ok({ received: true }))])
    try {
      fill(app.container, inputByLabel(app.container, 'Họ và tên'), bad)
      fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
      fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
      check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
      submit(app.container)
      await until(() => errorFor(app.container, 'Họ và tên') !== undefined, `error for name length ${bad.length}`)
      assert.equal(errorFor(app.container, 'Họ và tên'), 'Họ tên phải từ 2 đến 100 ký tự')
      assert.equal(viewingCalls(app.calls).length, 0, `no request for name length ${bad.length}`)
    } finally { await app.stopAll() }
  }

  for (const good of ['AB', 'A'.repeat(100)]) {
    const app = await mountForm(10, [viewingRule(ok({ received: true }))])
    try {
      fill(app.container, inputByLabel(app.container, 'Họ và tên'), good)
      fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
      fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
      check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
      submit(app.container)
      await until(() => viewingCalls(app.calls).length === 1, `request sent for name length ${good.length}`)
      assert.equal(lastViewingBody(app.calls).guestName, good)
    } finally { await app.stopAll() }
  }
})

// ======================================================================================
// #11
// ======================================================================================
test('FE-P2-17 #11 (DTO BE): note length 501 shows "Ghi chú tối đa 500 ký tự", no request; length 500 submits', async () => {
  let app = await mountForm(10, [viewingRule(ok({ received: true }))])
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    fill(app.container, inputByLabel(app.container, 'Lời nhắn (không bắt buộc)'), 'x'.repeat(501))
    submit(app.container)
    await until(() => errorFor(app.container, 'Lời nhắn (không bắt buộc)') !== undefined, 'note error')
    assert.equal(errorFor(app.container, 'Lời nhắn (không bắt buộc)'), 'Ghi chú tối đa 500 ký tự')
    assert.equal(viewingCalls(app.calls).length, 0)
  } finally { await app.stopAll() }

  app = await mountForm(10, [viewingRule(ok({ received: true }))])
  try {
    const note500 = 'x'.repeat(500)
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    fill(app.container, inputByLabel(app.container, 'Lời nhắn (không bắt buộc)'), note500)
    submit(app.container)
    await until(() => viewingCalls(app.calls).length === 1, 'note 500 submits')
    assert.equal(lastViewingBody(app.calls).note, note500)
  } finally { await app.stopAll() }
})

// ======================================================================================
// #12
// ======================================================================================
test('FE-P2-17 #12 (VIEW-02, D-3): the honeypot is hidden/not required, a filled value is still sent, and the success screen matches #18 exactly', async () => {
  const app = await mountForm(10, [viewingRule(ok({ received: true }))])
  try {
    const honeypot = find(app.container, n => n.tagName === 'INPUT' && n.name === 'website')[0]
    assert.ok(honeypot, 'honeypot input exists')
    const wrapper = honeypot.parentNode
    assert.ok(wrapper.hidden === true || wrapper.hasAttribute('hidden'), 'wrapper has hidden')
    assert.equal(wrapper.getAttribute('aria-hidden'), 'true')
    assert.equal(honeypot.attributes.tabindex ?? honeypot.getAttribute('tabindex'), '-1')
    assert.equal(honeypot.getAttribute('autocomplete'), 'off')
    assert.ok(!honeypot.hasAttribute('required'), 'honeypot is not required')
    // Bug fix in this test (not the harness, not src): honeypot has no `id` at all, so the original
    // `n.attributes.for === honeypot.attributes.id` matched every <label> that also has no `for` (the 3
    // radio-wrapping labels, which associate by wrapping, not by for/id) because `undefined === undefined`.
    // Guard the id side so the comparison only matches a real for/id pair.
    assert.ok(!find(app.container, n => n.tagName === 'LABEL' && n.attributes.for != null && n.attributes.for === honeypot.attributes.id).length, 'honeypot has no <label>')

    fill(app.container, honeypot, 'http://bot.example')
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    await until(() => viewingCalls(app.calls).length === 1, 'honeypot submission sent')
    assert.equal(lastViewingBody(app.calls).website, 'http://bot.example')
    await until(() => statusBlocks(app.container).length === 1, 'success screen shown for honeypot too')
    assert.equal(statusBlocks(app.container)[0].textContent,
      'Đã nhận yêu cầu xem phòng. Quản lý sẽ gọi lại để xác nhận lịch hẹn.Gửi yêu cầu chưa giữ chỗ phòng.')
  } finally { await app.stopAll() }
})

// ======================================================================================
// #13
// ======================================================================================
test('FE-P2-17 #13 (VIEW-01, UI-05): a 409 ROOM_NOT_AVAILABLE shows "Phòng không còn trống" and keeps the entered data, no success screen', async () => {
  const app = await mountForm(10, [viewingRule(fail(409, 'ROOM_NOT_AVAILABLE', 'Phòng không còn trống'))])
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    await until(() => alerts(app.container).includes('Phòng không còn trống'), '409 message shown')
    assert.equal(inputByLabel(app.container, 'Họ và tên').value, 'Nguyễn Văn An')
    assert.equal(statusBlocks(app.container).length, 0, 'no success screen')
  } finally { await app.stopAll() }
})

// ======================================================================================
// #14
// ======================================================================================
test('FE-P2-17 #14 (VIEW-02/11, UI-05): a 429 shows "Bạn thao tác quá nhiều lần, vui lòng thử lại sau"', async () => {
  const app = await mountForm(10, [viewingRule(fail(429, 'TOO_MANY_REQUESTS', 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau'))])
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    await until(() => alerts(app.container).includes('Bạn thao tác quá nhiều lần, vui lòng thử lại sau'), '429 message shown')
  } finally { await app.stopAll() }
})

// ======================================================================================
// #15
// ======================================================================================
test('FE-P2-17 #15 (VIEW-08, UI-05): a 400 VALIDATION_FAILED with fields.timeSlot shows the BE message under the time-slot fieldset', async () => {
  const message = 'Khung giờ này hôm nay đã bắt đầu, vui lòng chọn khung giờ khác'
  const app = await mountForm(10, [viewingRule(fail(400, 'VALIDATION_FAILED', 'Yêu cầu không hợp lệ', { timeSlot: message }))])
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    await until(() => find(app.container, n => n.attributes.id === 'viewing-time-slot-error').length === 1, 'time-slot server error shown')
    assert.equal(find(app.container, n => n.attributes.id === 'viewing-time-slot-error')[0].textContent, message)
  } finally { await app.stopAll() }
})

// ======================================================================================
// #16
// ======================================================================================
test('FE-P2-17 #16 (UI-05): a 400 VALIDATION_FAILED with fields.visitDate shows the BE message under the date field', async () => {
  const message = 'Ngày xem phải từ hôm nay đến 30 ngày tới'
  const app = await mountForm(10, [viewingRule(fail(400, 'VALIDATION_FAILED', 'Yêu cầu không hợp lệ', { visitDate: message }))])
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    await until(() => errorFor(app.container, 'Ngày muốn xem') === message, 'visitDate server error shown')
  } finally { await app.stopAll() }
})

// ======================================================================================
// #17
// ======================================================================================
test('FE-P2-17 #17 (UI-09): while sending, the submit button is disabled with label "Đang gửi…"; two quick submits send only 1 request', async () => {
  const app = await mountForm(10, [viewingDelayed(ok({ received: true }), 80)])
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    submit(app.container)
    await until(() => buttonByText(app.container, 'Đang gửi…') !== undefined, 'sending label shown')
    assert.ok(isDisabled(buttonByText(app.container, 'Đang gửi…')))
    await until(() => statusBlocks(app.container).length === 1, 'request finished')
    assert.equal(viewingCalls(app.calls).length, 1, 'only one request sent')
  } finally { await app.stopAll() }
})

// ======================================================================================
// #18
// ======================================================================================
test('FE-P2-17 #18 (VIEW-12, D-3): on success the form is replaced by a role=status screen with exactly the two D-3 sentences, no id/date/time-slot leaked', async () => {
  const app = await mountForm(10, [viewingRule(ok({ received: true }))])
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    await until(() => statusBlocks(app.container).length === 1, 'success screen shown')
    const paras = find(app.container, n => n.tagName === 'P')
    assert.ok(paras.some(p => p.textContent === 'Đã nhận yêu cầu xem phòng. Quản lý sẽ gọi lại để xác nhận lịch hẹn.'))
    assert.ok(paras.some(p => p.textContent === 'Gửi yêu cầu chưa giữ chỗ phòng.'))
    assert.equal(statusBlocks(app.container)[0].textContent,
      'Đã nhận yêu cầu xem phòng. Quản lý sẽ gọi lại để xác nhận lịch hẹn.Gửi yêu cầu chưa giữ chỗ phòng.')
    assert.equal(formEl(app.container), undefined, 'form is gone')
  } finally { await app.stopAll() }
})

// ======================================================================================
// #19
// ======================================================================================
test('FE-P2-17 #19 (UI-05): a thrown fetch (network error) shows the shared generic message and leaves the form usable', async () => {
  const app = await mountForm(10, [viewingThrows()])
  try {
    fill(app.container, inputByLabel(app.container, 'Họ và tên'), 'Nguyễn Văn An')
    fill(app.container, inputByLabel(app.container, 'Số điện thoại'), '0900000004')
    fill(app.container, inputByLabel(app.container, 'Ngày muốn xem'), TOMORROW)
    check(app.container, radioByLabel(app.container, 'Sáng (8:00–11:00)'), true)
    submit(app.container)
    await until(() => alerts(app.container).includes('Có lỗi xảy ra, vui lòng thử lại sau'), 'generic network message shown')
    assert.equal(statusBlocks(app.container).length, 0)
    assert.ok(formEl(app.container), 'form is still there')
    assert.ok(!isDisabled(buttonByText(app.container, 'Gửi yêu cầu xem phòng')), 'submit button usable again')
  } finally { await app.stopAll() }
})

// ======================================================================================
// #20
// ======================================================================================
test('FE-P2-17 #20 (UI-08): every visible input has a <label>, the time slots are grouped in a fieldset/legend, and submit is a <button type="submit">', async () => {
  const app = await mountForm(10, [viewingRule(ok({ received: true }))])
  try {
    for (const label of ['Họ và tên', 'Số điện thoại', 'Ngày muốn xem', 'Lời nhắn (không bắt buộc)']) {
      assert.ok(inputByLabel(app.container, label), `input for "${label}" via its <label>`)
    }
    const fieldset = slotsFieldset(app.container)
    assert.ok(fieldset, 'fieldset exists')
    assert.ok(find(fieldset, n => n.tagName === 'LEGEND' && n.textContent === 'Khung giờ').length === 1, 'legend "Khung giờ"')
    const submitButton = find(app.container, n => n.tagName === 'BUTTON' && n.attributes.type === 'submit')[0]
    assert.ok(submitButton, 'submit button exists')
    assert.equal(submitButton.textContent, 'Gửi yêu cầu xem phòng')
  } finally { await app.stopAll() }
})
