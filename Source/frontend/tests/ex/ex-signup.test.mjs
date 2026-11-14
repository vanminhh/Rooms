import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import {
  alerts, buttonByText, byName, dispatch, fail, fakeFetch, fill, find, isDisabled, loadModule, draftFirst, mount, ok, until, wait,
} from '../p2/public-dom.mjs'

// Phase Extra EX-2, FE-EX-01..04 (AUTH-06, AUTH-11, AUTH-12, AUTH-13, UI-05). Outside edges faked: fetch (the API),
// the fake DOM, sessionStorage. Pages, guards, schemas, api client, react-router, react-hook-form, zod and the kit run unmodified.

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')
const mod = path => loadModule(draftFirst(`src/${path}`))

// ---- outside edge: sessionStorage and timers on the fake window ----
const store = new Map()
globalThis.window.sessionStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: k => { store.delete(k) },
}
globalThis.window.setInterval = globalThis.setInterval
globalThis.window.clearInterval = globalThis.clearInterval

const guards = mod('app/guards.ts')
const { t } = mod('shared/i18n/index.ts')
const schemas = Object.fromEntries(Object.entries(mod('features/auth/schemas.ts')).map(([name, factory]) => [name, factory((key, params) => t(key, params, 'vi'))]))
const pending = mod('features/auth/pendingVerification.ts')
const api = mod('features/auth/api.ts')

const guest = { role: 'GUEST', mustChangePassword: false }
const tenant = { role: 'TENANT', mustChangePassword: false }
const boss = { role: 'BOSS', mustChangePassword: false }
const manager = { role: 'MANAGER', mustChangePassword: false }
const where = path => ({ pathname: path, search: '' })

// ---------- FE-EX-01: roles and guard ----------

test('AUTH-06: homeOf gives each of the 4 roles its own area', () => {
  assert.equal(guards.homeOf('GUEST'), '/toi')
  assert.equal(guards.homeOf('TENANT'), '/thue')
  assert.equal(guards.homeOf('MANAGER'), '/ql')
  assert.equal(guards.homeOf('BOSS'), '/ql')
})

test('AUTH-06: a GUEST opening /thue or /ql lands on /toi', () => {
  assert.equal(guards.guardRedirect(guest, where('/thue'), ['TENANT']), '/toi')
  assert.equal(guards.guardRedirect(guest, where('/ql/phong'), ['MANAGER', 'BOSS']), '/toi')
  assert.equal(guards.guardRedirect(guest, where('/ql/nhan-su'), ['BOSS']), '/toi')
})

test('AUTH-06, SCOPE-03: /toi lets GUEST and TENANT in and sends staff to /ql', () => {
  const allow = ['GUEST', 'TENANT']
  assert.equal(guards.guardRedirect(guest, where('/toi'), allow), null)
  assert.equal(guards.guardRedirect(tenant, where('/toi/tai-khoan'), allow), null)
  assert.equal(guards.guardRedirect(manager, where('/toi'), allow), '/ql')
  assert.equal(guards.guardRedirect(boss, where('/toi'), allow), '/ql')
})

test('AUTH-06: signed out on /toi -> /dang-nhap with next; a TENANT still opens /thue', () => {
  assert.equal(guards.guardRedirect(null, { pathname: '/toi', search: '?a=1' }, ['GUEST', 'TENANT']), '/dang-nhap?next=%2Ftoi%3Fa%3D1')
  assert.equal(guards.guardRedirect(tenant, where('/thue'), ['TENANT']), null)
})

test('AUTH-05 before AUTH-06: a flagged TENANT on /toi goes to /doi-mat-khau', () => {
  assert.equal(guards.guardRedirect({ role: 'TENANT', mustChangePassword: true }, where('/toi'), ['GUEST', 'TENANT']), '/doi-mat-khau')
})

test('AUTH-06: ?next= still wins after login, else the role home; the sign-up pages are never a next target', () => {
  assert.equal(guards.postLoginPath('GUEST', '/phong/5'), '/phong/5')
  assert.equal(guards.postLoginPath('GUEST', null), '/toi')
  assert.equal(guards.postLoginPath('TENANT', null), '/thue')
  for (const bad of ['/dang-nhap', '/dang-ky', '/xac-minh-email?x=1', '//evil.example', 'https://evil.example/']) {
    assert.equal(guards.safeNext(bad), null, bad)
  }
  assert.equal(guards.safeNext('/toi'), '/toi')
})

// ---------- FE-EX-02: schemas, API, countdown ----------

const goodRegister = { fullName: 'Đỗ Thị Khách', phone: '0912345678', email: 'khach@example.com', password: 'Matkhau@1' }

test('AUTH-11, G-04, AUTH-03: registerSchema takes the spec values and refuses the others, with the BE words', () => {
  assert.equal(schemas.registerSchema.safeParse(goodRegister).success, true)
  const first = (patch) => {
    const r = schemas.registerSchema.safeParse({ ...goodRegister, ...patch })
    return r.success ? null : r.error.issues[0].message
  }
  assert.equal(first({ phone: '091234567' }), 'Số điện thoại không hợp lệ')
  assert.equal(first({ phone: '1912345678' }), 'Số điện thoại không hợp lệ')
  assert.equal(first({ email: 'khong-phai-email' }), 'Email không hợp lệ')
  assert.equal(first({ email: '' }), 'Email không hợp lệ')
  assert.equal(first({ password: '1234567' }), 'Mật khẩu tối thiểu 8 ký tự')
  assert.equal(schemas.registerSchema.safeParse({ ...goodRegister, password: '12345678' }).success, true)
  assert.equal(first({ fullName: '   ' }), 'Vui lòng nhập họ tên')
  assert.equal(first({ fullName: 'a'.repeat(101) }), 'Họ tên tối đa 100 ký tự')
  assert.equal(schemas.registerSchema.safeParse({ ...goodRegister, fullName: 'a'.repeat(100) }).success, true)
})

test('AUTH-12: verifyEmailSchema accepts exactly 6 digits', () => {
  for (const code of ['123456', '000000']) assert.equal(schemas.verifyEmailSchema.safeParse({ code }).success, true, code)
  for (const code of ['12345', '1234567', 'abcdef', '12 456', '']) {
    const r = schemas.verifyEmailSchema.safeParse({ code })
    assert.equal(r.success, false, code)
    assert.equal(r.error.issues[0].message, 'Mã gồm 6 chữ số')
  }
})

test('AUTH-13: secondsLeft counts 60 s down from the send time and is 0 when nothing was sent', () => {
  const t = 1_000_000
  assert.equal(pending.secondsLeft(null, t), 0)
  assert.equal(pending.secondsLeft(t, t), 60)
  assert.equal(pending.secondsLeft(t, t + 30_000), 30)
  assert.equal(pending.secondsLeft(t, t + 59_001), 1)
  assert.equal(pending.secondsLeft(t, t + 60_000), 0)
  assert.equal(pending.secondsLeft(t, t + 90_000), 0)
})

test('AUTH-12: the pending state survives a reload (sessionStorage), garbage in it is ignored', () => {
  store.clear()
  assert.equal(pending.readPending(), null)
  pending.writePending({ phone: '0912345678', email: 'a@b.vn', sentAt: 5 })
  assert.deepEqual(pending.readPending(), { phone: '0912345678', email: 'a@b.vn', sentAt: 5 })
  pending.clearPending()
  assert.equal(pending.readPending(), null)
  store.set('rooms.pendingVerification', '{"phone":"abc"}')
  assert.equal(pending.readPending(), null)
  store.set('rooms.pendingVerification', 'not json')
  assert.equal(pending.readPending(), null)
})

test('AUTH-11..13: the three requests send exactly the contract fields', async () => {
  const calls = fakeFetch([
    { prefix: '/auth/register', handler: () => ok(null) },
    { prefix: '/auth/verify-email', handler: () => ok({ accessToken: 't', user: {} }) },
    { prefix: '/auth/resend-code', handler: () => ok(null) },
  ])
  await api.registerRequest({ ...goodRegister, confirmPassword: 'x' })
  await api.verifyEmailRequest({ phone: '0912345678', code: '123456', extra: 1 })
  await api.resendCodeRequest({ phone: '0912345678', extra: 1 })
  assert.deepEqual(calls.map(c => [c.method, c.url]), [
    ['POST', '/api/v1/auth/register'], ['POST', '/api/v1/auth/verify-email'], ['POST', '/api/v1/auth/resend-code'],
  ])
  assert.deepEqual(JSON.parse(calls[0].body), goodRegister)
  assert.deepEqual(JSON.parse(calls[1].body), { phone: '0912345678', code: '123456' })
  assert.deepEqual(JSON.parse(calls[2].body), { phone: '0912345678' })
})

// ---------- FE-EX-03 / FE-EX-04: the pages ----------

async function mountAt(url, session = {}) {
  const { MemoryRouter, Routes, Route, useLocation } = nodeRequire('react-router')
  const { AuthContext } = mod('app/auth-context.ts')
  const { RegisterPage } = mod('pages/public/RegisterPage.tsx')
  const { VerifyEmailPage } = mod('pages/public/VerifyEmailPage.tsx')
  const accepted = []
  const value = {
    status: 'ready', user: null, login: async () => { throw new Error('unused') }, logout: async () => {}, refreshMe: async () => null,
    retry() {}, acceptSession: data => { accepted.push(data); return data.user }, ...session,
  }
  const Where = ({ name }) => { const l = useLocation(); return React.createElement('p', { 'data-where': name }, `${name}${l.search}`) }
  const tree = React.createElement(AuthContext.Provider, { value },
    React.createElement(MemoryRouter, { initialEntries: [url] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/dang-ky', element: React.createElement(RegisterPage) }),
        React.createElement(Route, { path: '/xac-minh-email', element: React.createElement(VerifyEmailPage) }),
        React.createElement(Route, { path: '/dang-nhap', element: React.createElement(Where, { name: 'LOGIN' }) }),
        React.createElement(Route, { path: '/toi', element: React.createElement(Where, { name: 'GUEST-HOME' }) }),
        React.createElement(Route, { path: '/phong/:id', element: React.createElement(Where, { name: 'ROOM' }) }),
      )))
  const app = await mount(tree)
  return { ...app, accepted }
}
const text = c => find(c, () => true).map(n => n.textContent).join(' ')
const whereIs = (c, name) => find(c, n => n.attributes['data-where'] === name).length > 0
const form = c => find(c, n => n.tagName === 'FORM')[0]
const fillRegister = (c, v = goodRegister) => {
  for (const [name, value] of Object.entries(v)) fill(c, byName(c, name), value)
}

test('AUTH-11: /dang-ky posts the form, remembers the phone and email, and moves to /xac-minh-email keeping ?next=', async () => {
  store.clear()
  const calls = fakeFetch([{ prefix: '/auth/register', handler: () => ok(null) }])
  const app = await mountAt('/dang-ky?next=%2Fphong%2F7')
  assert.ok(text(app.container).includes('Đã có tài khoản?'))
  fillRegister(app.container)
  dispatch(app.container, form(app.container), 'submit')
  await until(() => calls.length === 1, 'register call')
  assert.deepEqual(JSON.parse(calls[0].body), goodRegister)
  await until(() => text(app.container).includes('Mã xác minh'), 'code step')
  const saved = pending.readPending()
  assert.equal(saved.phone, '0912345678')
  assert.equal(saved.email, 'khach@example.com')
  assert.ok(saved.sentAt > 0)
  assert.ok(text(app.container).includes('khach@example.com'))
  await app.stop()
})

test('UI-05: /dang-ky validates before sending (no request) and shows the BE words on the fields', async () => {
  store.clear()
  const calls = fakeFetch([])
  const app = await mountAt('/dang-ky')
  fillRegister(app.container, { fullName: '', phone: '123', email: 'x', password: '1' })
  dispatch(app.container, form(app.container), 'submit')
  await until(() => text(app.container).includes('Số điện thoại không hợp lệ'), 'validation')
  for (const msg of ['Vui lòng nhập họ tên', 'Email không hợp lệ', 'Mật khẩu tối thiểu 8 ký tự']) assert.ok(text(app.container).includes(msg), msg)
  assert.equal(calls.length, 0)
  await app.stop()
})

// The real API answers with the generic message of the code and puts the AUTH-11 sign-up wording in fields (auth.service.ts).
for (const [code, generic, field, message, label] of [
  ['PHONE_TAKEN', 'Số điện thoại đã được sử dụng', 'phone', 'Số điện thoại đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu', 'Số điện thoại'],
  ['EMAIL_TAKEN', 'Email đã được dùng cho tài khoản khác', 'email', 'Email đã được dùng cho tài khoản khác', 'Email'],
]) {
  test(`AUTH-11, UI-05: ${code} shows the sign-up wording from fields on its field with a link to login and stays on /dang-ky`, async () => {
    store.clear()
    fakeFetch([{ prefix: '/auth/register', handler: () => fail(409, code, generic, { [field]: message }) }])
    const app = await mountAt('/dang-ky')
    fillRegister(app.container)
    dispatch(app.container, form(app.container), 'submit')
    await until(() => text(app.container).includes(message), code)
    assert.ok(find(app.container, n => n.tagName === 'A' && n.textContent === 'Đăng nhập').length >= 1)
    assert.equal(pending.readPending(), null)
    assert.ok(label)
    await app.stop()
  })
}

test('AUTH-13: MAIL_UNAVAILABLE and 429 show the API message in the form alert; nothing is remembered', async () => {
  for (const [status, code, message] of [
    [503, 'MAIL_UNAVAILABLE', 'Chưa gửi được email, vui lòng thử lại sau'],
    [429, 'TOO_MANY_REQUESTS', 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau'],
  ]) {
    store.clear()
    fakeFetch([{ prefix: '/auth/register', handler: () => fail(status, code, message) }])
    const app = await mountAt('/dang-ky')
    fillRegister(app.container)
    dispatch(app.container, form(app.container), 'submit')
    await until(() => alerts(app.container).includes(message), code)
    assert.equal(pending.readPending(), null)
    await app.stop()
  }
})

test('AUTH-12: /xac-minh-email with nothing remembered goes back to /dang-nhap', async () => {
  store.clear()
  const app = await mountAt('/xac-minh-email')
  assert.equal(whereIs(app.container, 'LOGIN'), true)
  await app.stop()
})

test('AUTH-13: right after sign-up "Gửi lại mã" is disabled with a countdown; after 60 s it is enabled', async () => {
  store.clear()
  pending.writePending({ phone: '0912345678', email: 'khach@example.com', sentAt: Date.now() })
  let app = await mountAt('/xac-minh-email')
  assert.ok(text(app.container).includes('khach@example.com'))
  const waiting = find(app.container, n => n.tagName === 'BUTTON' && /^Gửi lại mã \(\d+s\)$/.test(n.textContent.trim()))[0]
  assert.ok(waiting, 'countdown label')
  assert.equal(isDisabled(waiting), true)
  await app.stop()

  pending.writePending({ phone: '0912345678', email: 'khach@example.com', sentAt: Date.now() - 61_000 })
  app = await mountAt('/xac-minh-email')
  assert.equal(isDisabled(buttonByText(app.container, 'Gửi lại mã')), false)
  await app.stop()
})

test('AUTH-13: resend calls /auth/resend-code with the phone and restarts the 60 s countdown', async () => {
  store.clear()
  pending.writePending({ phone: '0912345678', email: 'khach@example.com', sentAt: Date.now() - 61_000 })
  const calls = fakeFetch([{ prefix: '/auth/resend-code', handler: () => ok(null) }])
  const app = await mountAt('/xac-minh-email')
  dispatch(app.container, buttonByText(app.container, 'Gửi lại mã'), 'click')
  await until(() => calls.length === 1, 'resend call')
  assert.deepEqual(JSON.parse(calls[0].body), { phone: '0912345678' })
  await until(() => find(app.container, n => n.tagName === 'BUTTON' && /^Gửi lại mã \(\d+s\)$/.test(n.textContent.trim())).length === 1, 'countdown restarted')
  assert.ok(text(app.container).includes('Đã gửi mã'))
  await app.stop()
})

test('AUTH-12: arriving from a login with EMAIL_NOT_VERIFIED no code exists yet: "Gửi mã xác minh" is enabled and starts the countdown (ASSUMPTION)', async () => {
  store.clear()
  pending.writePending({ phone: '0912345678', email: null, sentAt: null })
  const calls = fakeFetch([{ prefix: '/auth/resend-code', handler: () => ok(null) }])
  const app = await mountAt('/xac-minh-email')
  assert.ok(text(app.container).includes('email bạn đã đăng ký'))
  const send = buttonByText(app.container, 'Gửi mã xác minh')
  assert.equal(isDisabled(send), false)
  dispatch(app.container, send, 'click')
  await until(() => calls.length === 1, 'send call')
  await until(() => buttonByText(app.container, 'Gửi mã xác minh') === undefined, 'label changed')
  await app.stop()
})

test('AUTH-13: a wrong code shows OTP_INVALID on the code field and keeps the page; a malformed code sends nothing', async () => {
  store.clear()
  pending.writePending({ phone: '0912345678', email: 'khach@example.com', sentAt: Date.now() })
  const calls = fakeFetch([{ prefix: '/auth/verify-email', handler: () => fail(400, 'OTP_INVALID', 'Mã xác minh không đúng hoặc đã hết hạn') }])
  const app = await mountAt('/xac-minh-email')
  fill(app.container, byName(app.container, 'code'), '12345')
  dispatch(app.container, form(app.container), 'submit')
  await until(() => text(app.container).includes('Mã gồm 6 chữ số'), 'format error')
  assert.equal(calls.length, 0)
  fill(app.container, byName(app.container, 'code'), '123456')
  dispatch(app.container, form(app.container), 'submit')
  await until(() => text(app.container).includes('Mã xác minh không đúng hoặc đã hết hạn'), 'OTP_INVALID')
  assert.deepEqual(JSON.parse(calls[0].body), { phone: '0912345678', code: '123456' })
  assert.notEqual(pending.readPending(), null)
  assert.equal(app.accepted.length, 0)
  await app.stop()
})

test('AUTH-12: the right code opens the session, clears the pending state and goes to ?next= or the role home', async () => {
  for (const [url, expected] of [['/xac-minh-email?next=%2Fphong%2F7', 'ROOM'], ['/xac-minh-email', 'GUEST-HOME']]) {
    store.clear()
    pending.writePending({ phone: '0912345678', email: 'khach@example.com', sentAt: Date.now() })
    const user = { id: 9, role: 'GUEST', mustChangePassword: false, emailVerified: true }
    fakeFetch([{ prefix: '/auth/verify-email', handler: () => ok({ accessToken: 'tok', user }) }])
    const app = await mountAt(url)
    fill(app.container, byName(app.container, 'code'), '123456')
    dispatch(app.container, form(app.container), 'submit')
    await until(() => whereIs(app.container, expected), `redirect to ${expected}`)
    assert.deepEqual(app.accepted, [{ accessToken: 'tok', user }])
    assert.equal(pending.readPending(), null)
    await app.stop()
  }
})

test('AUTH-13: 429 on verify shows the API message in the form alert', async () => {
  store.clear()
  pending.writePending({ phone: '0912345678', email: null, sentAt: Date.now() })
  fakeFetch([{ prefix: '/auth/verify-email', handler: () => fail(429, 'TOO_MANY_REQUESTS', 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau') }])
  const app = await mountAt('/xac-minh-email')
  fill(app.container, byName(app.container, 'code'), '123456')
  dispatch(app.container, form(app.container), 'submit')
  await until(() => alerts(app.container).includes('Bạn thao tác quá nhiều lần, vui lòng thử lại sau'), '429')
  await wait(5)
  await app.stop()
})

test('AUTH-06, SCOPE-03: routes.tsx opens /toi to GUEST and TENANT only and puts the sign-up pages under GuestOnly', () => {
  const { routes } = mod('app/routes.tsx')
  const toi = routes.find(r => r.path === '/toi')
  assert.deepEqual(toi.element.props.allow, ['GUEST', 'TENANT'])
  assert.deepEqual(toi.children[0].children.map(r => r.path ?? 'index'), ['index', 'tai-khoan']) // inside GuestLayout
  const pub = routes.find(r => r.element?.type?.name === 'PublicLayout')
  const guestOnly = pub.children.find(r => r.element?.type?.name === 'GuestOnly')
  assert.deepEqual(guestOnly.children.map(r => r.path), ['/dang-nhap', '/dang-ky', '/xac-minh-email'])
  const thue = routes.find(r => r.path === '/thue')
  assert.deepEqual(thue.element.props.allow, ['TENANT'])
})
