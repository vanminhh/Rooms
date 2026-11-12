import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import {
  alerts, buttonByText, byName, dispatch, fakeFetch, fill, find, loadModule, draftFirst, mount, ok, until,
} from '../p2/public-dom.mjs'

// Phase Extra EX-2, FE-EX-05 and FE-EX-06 (AUTH-09, AUTH-10, AUTH-12, VIEW-20). Outside edges faked: fetch, the fake DOM, sessionStorage.
// LoginPage, GuestLayout, the guest pages, TenantLayout, PublicLayout, react-router, react-hook-form and the kit run unmodified.

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')
const mod = path => loadModule(draftFirst(`src/${path}`))

const store = new Map()
globalThis.window.sessionStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: k => { store.delete(k) },
}
globalThis.window.setInterval = globalThis.setInterval
globalThis.window.clearInterval = globalThis.clearInterval

const pending = mod('features/auth/pendingVerification.ts')
const text = c => find(c, () => true).map(n => n.textContent).join(' ')
const whereIs = (c, name) => find(c, n => n.attributes['data-where'] === name).length > 0
const form = c => find(c, n => n.tagName === 'FORM')[0]
const guestUser = { id: 9, role: 'GUEST', phone: '0912345678', fullName: 'Đỗ Thị Khách', email: 'khach@example.com', emailVerified: true, locale: 'vi', mustChangePassword: false }

async function mountPage(url, element, user, extra = {}) {
  const { MemoryRouter, Routes, Route, useLocation } = nodeRequire('react-router')
  const { AuthContext } = mod('app/auth-context.ts')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const value = {
    status: 'ready', user, login: async () => { throw new Error('unused') }, logout: async () => {}, refreshMe: async () => user,
    retry() {}, acceptSession: d => d.user, ...extra,
  }
  const Where = ({ name }) => { const l = useLocation(); return React.createElement('p', { 'data-where': name }, `${name}${l.search}`) }
  const tree = React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    React.createElement(AuthContext.Provider, { value },
      React.createElement(MemoryRouter, { initialEntries: [url] },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/xac-minh-email', element: React.createElement(Where, { name: 'VERIFY' }) }),
          React.createElement(Route, { path: '*', element })))))
  return mount(tree)
}

test('AUTH-12: a login answered with EMAIL_NOT_VERIFIED opens /xac-minh-email for that phone, keeps ?next=, sends no code', async () => {
  store.clear()
  const { ApiError } = mod('shared/api.ts')
  const { LoginPage } = mod('pages/public/LoginPage.tsx')
  const calls = fakeFetch([{ prefix: '/public/contact', handler: () => ok(null) }])
  const login = async () => { throw new ApiError({ code: 'EMAIL_NOT_VERIFIED', message: 'Email chưa được xác minh', status: 403 }) }
  const app = await mountPage('/dang-nhap?next=%2Fphong%2F7', React.createElement(LoginPage), null, { login })
  fill(app.container, byName(app.container, 'phone'), '0912345678')
  fill(app.container, byName(app.container, 'password'), 'Matkhau@1')
  dispatch(app.container, form(app.container), 'submit')
  await until(() => whereIs(app.container, 'VERIFY'), 'redirect to the code page')
  assert.ok(text(app.container).includes('VERIFY?next=%2Fphong%2F7'))
  assert.deepEqual(pending.readPending(), { phone: '0912345678', email: null, sentAt: null })
  assert.equal(calls.filter(c => c.url.includes('/auth/')).length, 0)
  await app.stop()
})

test('AUTH-12: any other login error stays on /dang-nhap with the API message and remembers nothing', async () => {
  store.clear()
  const { ApiError } = mod('shared/api.ts')
  const { LoginPage } = mod('pages/public/LoginPage.tsx')
  fakeFetch([{ prefix: '/public/contact', handler: () => ok(null) }])
  const login = async () => { throw new ApiError({ code: 'INVALID_CREDENTIALS', message: 'Số điện thoại hoặc mật khẩu không đúng', status: 401 }) }
  const app = await mountPage('/dang-nhap', React.createElement(LoginPage), null, { login })
  fill(app.container, byName(app.container, 'phone'), '0912345678')
  fill(app.container, byName(app.container, 'password'), 'sai')
  dispatch(app.container, form(app.container), 'submit')
  await until(() => alerts(app.container).includes('Số điện thoại hoặc mật khẩu không đúng'), 'login error')
  assert.equal(pending.readPending(), null)
  await app.stop()
})

test('AUTH-10: /dang-nhap says "Chưa có tài khoản? Đăng ký" with a link to /dang-ky that keeps ?next=', async () => {
  fakeFetch([{ prefix: '/public/contact', handler: () => ok(null) }])
  const { LoginPage } = mod('pages/public/LoginPage.tsx')
  const app = await mountPage('/dang-nhap?next=%2Fphong%2F7', React.createElement(LoginPage), null)
  assert.ok(text(app.container).includes('Chưa có tài khoản? Đăng ký'))
  assert.ok(!text(app.container).includes('Tài khoản được cấp khi ký hợp đồng'))
  const link = find(app.container, n => n.tagName === 'A' && n.textContent === 'Đăng ký')[0]
  assert.equal(link.attributes.href, '/dang-ky?next=%2Fphong%2F7')
  await app.stop()
})

test('FE-EX-06: GuestLayout links to Lịch hẹn, Tài khoản and Tìm phòng, with a sign-out button', async () => {
  fakeFetch([])
  const { GuestLayout } = mod('layouts/GuestLayout.tsx')
  const app = await mountPage('/toi', React.createElement(GuestLayout), guestUser)
  const hrefs = find(app.container, n => n.tagName === 'A').map(a => a.attributes.href)
  for (const href of ['/toi', '/toi/tai-khoan', '/phong']) assert.ok(hrefs.includes(href), href)
  assert.ok(buttonByText(app.container, 'Đăng xuất'))
  await app.stop()
})

test('VIEW-20, FE-EX-06: /toi shows the empty state with a "Tìm phòng" link to /phong', async () => {
  fakeFetch([])
  const { GuestHomePage } = mod('pages/guest/GuestHomePage.tsx')
  const app = await mountPage('/toi', React.createElement(GuestHomePage), guestUser)
  assert.ok(text(app.container).includes('Lịch hẹn của tôi'))
  assert.ok(text(app.container).includes('Bạn chưa có lịch hẹn xem phòng nào.'))
  const link = find(app.container, n => n.tagName === 'A' && n.textContent === 'Tìm phòng')[0]
  assert.equal(link.attributes.href, '/phong')
  await app.stop()
})

test('AUTH-09, FE-EX-06: /toi/tai-khoan shows name and phone read only, the email form and change password', async () => {
  fakeFetch([])
  const { GuestAccountPage } = mod('pages/guest/GuestAccountPage.tsx')
  const app = await mountPage('/toi/tai-khoan', React.createElement(GuestAccountPage), guestUser)
  const readOnly = find(app.container, n => n.tagName === 'INPUT' && n.hasAttribute('readonly'))
  assert.deepEqual(readOnly.map(n => n.value).sort(), ['0912345678', 'Đỗ Thị Khách'])
  assert.equal(byName(app.container, 'email').value, 'khach@example.com')
  assert.ok(text(app.container).includes('Đổi mật khẩu'))
  await app.stop()
})

test('FE-EX-06: TenantLayout gets "Lịch hẹn xem phòng" to /toi; PublicLayout "Trang của tôi" goes to the role home', async () => {
  fakeFetch([{ prefix: '/public/contact', handler: () => ok(null) }])
  const { TenantLayout } = mod('layouts/TenantLayout.tsx')
  let app = await mountPage('/thue', React.createElement(TenantLayout), { ...guestUser, role: 'TENANT' })
  const link = find(app.container, n => n.tagName === 'A' && n.textContent === 'Lịch hẹn xem phòng')[0]
  assert.equal(link.attributes.href, '/toi')
  await app.stop()
  const { PublicLayout } = mod('layouts/PublicLayout.tsx')
  app = await mountPage('/phong', React.createElement(PublicLayout), guestUser)
  const mine = find(app.container, n => n.tagName === 'A' && n.textContent === 'Trang của tôi')[0]
  assert.equal(mine.attributes.href, '/toi')
  await app.stop()
})
