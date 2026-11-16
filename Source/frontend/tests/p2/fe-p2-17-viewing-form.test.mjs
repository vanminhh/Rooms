import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { buttonByText, byName, dispatch, fakeFetch, fill, find, loadModule, draftFirst, mount, ok, fail, until, wait } from './public-dom.mjs'
const require = createRequire(import.meta.url), React = require('react')
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
const { MemoryRouter } = require('react-router')
const mod = p => loadModule(draftFirst(`src/${p}`))
const { ViewingForm } = mod('features/public/ViewingForm.tsx')
const { AuthContext } = mod('app/auth-context.ts')
const { I18nProvider, useI18n, setStoredLang } = mod('shared/i18n/index.ts')
const { todayHanoi, plusDays, hourInstant } = mod('features/viewings/time.ts')
const guest = { id: 4, role: 'GUEST', email: 'guest@example.test' }
const day = plusDays(todayHanoi(), 1), at = hourInstant(day, 10)
const saved = { id: 81, roomId: 7, roomCode: 'A101', visitAt: at, visitDate: null, timeSlot: null, contact: { phone: '0911111111' }, bossContact: { phone: '0922222222' } }
function Switch() { const { setLang } = useI18n(); return React.createElement('button', { onClick: () => setLang('en') }, 'English') }
async function setup({ user = guest, response = () => ok(saved), hours = [at], lang = 'vi' } = {}) {
  setStoredLang(lang)
  const calls = fakeFetch([
    { prefix: '/me/viewings', method: 'POST', handler: response },
    { prefix: '/me/rooms/7/viewing-times', handler: () => ok([{ date: day, hours: typeof hours === 'function' ? hours() : hours }]) },
    { prefix: '/public/rooms/7/viewing-times', handler: () => ok([{ date: day, hours }]) },
  ])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = u => React.createElement(I18nProvider, null, React.createElement(AuthContext.Provider, { value: { status: 'ready', user: u } },
    React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, null, React.createElement(Switch), React.createElement(ViewingForm, { roomId: 7, roomCode: 'A101' })))))
  const app = await mount(tree(user))
  await until(() => app.container.textContent.includes(lang === 'en' ? 'Viewing time' : 'Giờ xem'), 'availability')
  return { ...app, calls, client, tree }
}
async function choose(app) {
  if (!find(app.container, n => n.attributes?.['aria-label']?.startsWith(day)).length) {
    dispatch(app.container, find(app.container, n => n.attributes?.['aria-label'] === 'Tháng sau' || n.attributes?.['aria-label'] === 'Next month')[0], 'click'); await wait(20)
  }
  dispatch(app.container, find(app.container, n => n.attributes?.['aria-label']?.startsWith(day))[0], 'click')
  await until(() => buttonByText(app.container, '10:00'), 'hours')
  dispatch(app.container, buttonByText(app.container, '10:00'), 'click'); await wait(10)
}
const submit = app => dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
const dialog = app => find(app.container, n => n.attributes?.role === 'dialog')[0]

test('VIEW-14/UI-08: success opens a popup, closing retains the result and moves focus to it', async () => {
  const app = await setup()
  try {
    await choose(app); submit(app)
    await until(() => dialog(app), 'success popup')
    assert.match(dialog(app).textContent, /Quản lý tòa sẽ liên hệ với bạn/)
    assert.match(dialog(app).textContent, /A101/)
    assert.match(dialog(app).textContent, /0911111111/)
    assert.ok(buttonByText(app.container, 'Xem lịch hẹn'))
    dispatch(app.container, buttonByText(app.container, 'Đóng'), 'click')
    await until(() => !dialog(app), 'popup closed')
    const result = find(app.container, n => n.attributes?.role === 'status' && n.textContent.includes('Đặt lịch thành công'))[0]
    assert.ok(result)
    assert.equal(document.activeElement, result)
    assert.equal(find(app.container, n => n.attributes?.href === '/toi/lich-hen/81').length, 1)
  } finally { await app.stop() }
})

test('VIEW-16a: warning can be dismissed; only Vẫn đặt resends the unchanged request once with acknowledgement', async () => {
  const text = 'Khách đã có lịch xem ở tòa thuộc quận khác vào cùng giờ. Vui lòng cân nhắc thời gian di chuyển trước khi tiếp tục.'
  const app = await setup({ response: async call => {
    if (JSON.parse(call.body).acceptOverlap) { await wait(40); return ok(saved) }
    return fail(409, 'VIEWING_OVERLAP_WARNING', 'Cần xác nhận', { visitAt: text })
  } })
  try {
    await choose(app); fill(app.container, byName(app.container, 'note'), 'giữ nội dung'); submit(app)
    await until(() => dialog(app), 'overlap warning')
    assert.match(dialog(app).textContent, /quận khác/)
    assert.doesNotMatch(app.container.textContent, /Đặt lịch thành công/)
    assert.equal(byName(app.container, 'note').hasAttribute('disabled'), true)
    dispatch(app.container, buttonByText(app.container, 'Chọn giờ khác'), 'click')
    await until(() => !dialog(app), 'warning dismissed')
    assert.equal(app.calls.filter(c => c.method === 'POST').length, 1)
    assert.equal(byName(app.container, 'note').value, 'giữ nội dung')
    submit(app); await until(() => dialog(app), 'warning again')
    const confirm = buttonByText(app.container, 'Vẫn đặt')
    dispatch(app.container, confirm, 'click'); dispatch(app.container, confirm, 'click')
    await until(() => app.container.textContent.includes('Đặt lịch thành công.'), 'saved after acknowledgement')
    const posts = app.calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body))
    assert.equal(posts.length, 3)
    assert.deepEqual(posts[2], { ...posts[1], acceptOverlap: true })
    assert.equal('acceptOverlap' in posts[1], false)
  } finally { await app.stop() }
})

test('VIEW-16a/16: an accepted retry can still fail capacity and never shows success', async () => {
  const app = await setup({ response: call => JSON.parse(call.body).acceptOverlap
    ? fail(409, 'VIEWING_TIME_TAKEN', 'Giờ vừa hết chỗ')
    : fail(409, 'VIEWING_OVERLAP_WARNING', 'Cùng giờ ở tòa khác') })
  try {
    await choose(app); submit(app); await until(() => dialog(app), 'warning')
    dispatch(app.container, buttonByText(app.container, 'Vẫn đặt'), 'click')
    await until(() => app.container.textContent.includes('Giờ vừa hết chỗ'), 'hard error')
    assert.equal(dialog(app), undefined)
    assert.doesNotMatch(app.container.textContent, /Đặt lịch thành công/)
    assert.equal(app.calls.filter(c => c.method === 'POST').length, 2)
  } finally { await app.stop() }
})

test('VIEW-16a/LOC-01: English warning actions and success popup are translated', async () => {
  const app = await setup({ lang: 'en', response: call => JSON.parse(call.body).acceptOverlap ? ok(saved)
    : fail(409, 'VIEWING_OVERLAP_WARNING', 'Another building at this time', { visitAt: 'Please consider travel time.' }) })
  try {
    await choose(app); submit(app); await until(() => dialog(app), 'English warning')
    assert.ok(buttonByText(app.container, 'Choose another time'))
    dispatch(app.container, buttonByText(app.container, 'Book anyway'), 'click')
    await until(() => dialog(app)?.textContent.includes('building manager will contact you'), 'English success')
    assert.ok(buttonByText(app.container, 'Close'))
  } finally { await app.stop() }
})
after(() => { setStoredLang('vi'); setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref() })

test('VIEW-01/21: anonymous uses public availability and a sign-in link returning to the same room', async () => {
  const app = await setup({ user: null })
  try { assert.match(app.calls[0].url, /\/public\/rooms\/7\/viewing-times/); assert.equal(find(app.container, n => n.tagName === 'A' && n.attributes.href?.startsWith('/dang-nhap'))[0].attributes.href, '/dang-nhap?next=%2Fphong%2F7'); assert.equal(byName(app.container, 'guestPhone'), undefined) }
  finally { await app.stop() }
})
test('VIEW-01/AUTH-12: tenant missing email links to account; unverified email can book', async () => {
  let app = await setup({ user: { id: 5, role: 'TENANT', email: null } })
  try { assert.match(app.container.textContent, /Không cần xác minh email/); assert.equal(find(app.container, n => n.tagName === 'A' && n.attributes.href === '/toi/tai-khoan').length, 1); assert.equal(buttonByText(app.container, 'Gửi yêu cầu'), undefined) } finally { await app.stop() }
  app = await setup({ user: { id: 5, role: 'TENANT', email: 'tenant@example.test', emailVerifiedAt: null } })
  try { await choose(app); submit(app); await until(() => app.container.textContent.includes('Đặt lịch thành công.'), 'tenant booked') } finally { await app.stop() }
})
test('VIEW-01: staff cannot send a guest booking', async () => {
  const app = await setup({ user: { id: 2, role: 'MANAGER' } })
  try { assert.match(app.container.textContent, /dành cho tài khoản khách và người thuê/); assert.equal(buttonByText(app.container, 'Gửi yêu cầu'), undefined) } finally { await app.stop() }
})
for (const contact of [saved.contact, null]) test(`VIEW-14: success shows appointment, ${contact ? 'manager and Boss' : 'Boss only'} and own detail`, async () => {
  const app = await setup({ response: () => ok({ ...saved, contact }) })
  try {
    await choose(app); fill(app.container, byName(app.container, 'note'), 'Nội dung người dùng'); submit(app); submit(app)
    await until(() => app.container.textContent.includes('Đặt lịch thành công. Vui lòng đợi Rooms xác nhận.'), 'success')
    const posts = app.calls.filter(c => c.method === 'POST'); assert.equal(posts.length, 1)
    assert.deepEqual(JSON.parse(posts[0].body), { roomId: 7, visitAt: at, note: 'Nội dung người dùng' })
    assert.equal(app.container.textContent.includes('0911111111'), !!contact); assert.match(app.container.textContent, /0922222222/)
    assert.equal(find(app.container, n => n.attributes?.href === '/toi/lich-hen/81').length, 1)
  } finally { await app.stop() }
})
for (const [code, status] of [['VIEWING_TIME_TAKEN', 409], ['ROOM_NOT_AVAILABLE', 409], ['TOO_MANY_REQUESTS', 429], ['CONFLICT_STATE', 409]]) test(`VIEW-01/02/16: ${code} stays an error with note preserved`, async () => {
  const app = await setup({ response: () => fail(status, code, code) })
  try { await choose(app); fill(app.container, byName(app.container, 'note'), 'giữ nguyên'); submit(app); await until(() => app.container.textContent.includes(code), code); assert.equal(byName(app.container, 'note').value, 'giữ nguyên'); assert.doesNotMatch(app.container.textContent, /Đặt lịch thành công/); if (code === 'VIEWING_TIME_TAKEN') assert.ok(app.calls.filter(c => c.method === 'GET').length >= 2) } finally { await app.stop() }
})
test('LOC-01/UI-12: switching language updates validation and keeps user input', async () => {
  const app = await setup()
  try { fill(app.container, byName(app.container, 'note'), 'x'.repeat(501)); submit(app); await until(() => app.container.textContent.includes('Ghi chú tối đa'), 'VI'); dispatch(app.container, buttonByText(app.container, 'English'), 'click'); await until(() => app.container.textContent.includes('Note must be 500'), 'EN'); assert.equal(byName(app.container, 'note').value.length, 501) } finally { await app.stop() }
})
test('VIEW-21: switching accounts fetches private availability under a different cache key', async () => {
  const app = await setup()
  try { await app.rerender(app.tree({ ...guest, id: 6 })); await until(() => app.calls.length >= 2, 'new account fetch'); assert.ok(app.client.getQueryCache().getAll().some(q => q.queryKey[1] === 6)); assert.equal(app.calls.some(c => /phone|userId/.test(c.url)), false) } finally { await app.stop() }
})

test('VIEW-21/UI-12: TIME_TAKEN removes a lost hour without resubmitting or losing note', async () => {
  let taken = false
  const later = hourInstant(day, 11)
  const app = await setup({ hours: () => taken ? [later] : [at, later], response: () => { taken = true; return fail(409, 'VIEWING_TIME_TAKEN', 'Giờ đã kín') } })
  try {
    await choose(app); fill(app.container, byName(app.container, 'note'), 'giữ lại nội dung'); submit(app)
    await until(() => buttonByText(app.container, '10:00')?.hasAttribute('disabled') && buttonByText(app.container, '10:00')?.attributes['aria-pressed'] === 'false', 'lost hour cleared')
    assert.equal(buttonByText(app.container, '10:00').attributes['aria-pressed'], 'false')
    submit(app); await until(() => app.container.textContent.includes('Vui lòng chọn ngày và giờ xem'), 'must reselect')
    assert.equal(app.calls.filter(c => c.method === 'POST').length, 1)
    assert.equal(byName(app.container, 'note').value, 'giữ lại nội dung')
    dispatch(app.container, buttonByText(app.container, '11:00'), 'click'); await wait(10); submit(app)
    await until(() => app.calls.filter(c => c.method === 'POST').length === 2, 'explicit new choice')
    assert.equal(JSON.parse(app.calls.filter(c => c.method === 'POST')[1].body).visitAt, later)
  } finally { await app.stop() }
})
