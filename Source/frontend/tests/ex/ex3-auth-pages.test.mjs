import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { byName, buttonByText, dispatch, fail, fakeFetch, fill, find, loadModule, draftFirst, mount, ok, until } from '../p2/public-dom.mjs'

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })
const require = createRequire(import.meta.url)
const React = require('react')
const { MemoryRouter, Routes, Route } = require('react-router')
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
const mod = path => loadModule(draftFirst(`src/${path}`))
const { I18nProvider, useI18n, t, setStoredLang } = mod('shared/i18n/index.ts')
const { AuthContext } = mod('app/auth-context.ts')
const guest = { id: 9, role: 'GUEST', fullName: 'Đỗ Thị Khách', phone: '0912345678', email: 'guest@example.com', locale: 'en', mustChangePassword: false }
const store = new Map()
window.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
window.setInterval = globalThis.setInterval
window.clearInterval = globalThis.clearInterval
const pending = mod('features/auth/pendingVerification.ts')
const form = c => find(c, n => n.tagName === 'FORM')[0]
function Switch() {
  const { setLang } = useI18n()
  return React.createElement('button', { onClick: () => setLang('en') }, 'English')
}
async function page(element, { lang = 'en', user = null, url = '/', auth = {}, routes = [], fixed = false } = {}) {
  setStoredLang(lang)
  const value = { status: 'ready', user, login: async () => guest, logout: async () => {}, refreshMe: async () => user, retry() {}, acceptSession: data => data.user, ...auth }
  const app = await mount(React.createElement(I18nProvider, fixed ? { locale: lang } : null,
    React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(AuthContext.Provider, { value },
        React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Switch),
          React.createElement(Routes, null, ...routes,
            React.createElement(Route, { path: '*', element })))))))
  const stop = app.stop
  app.stop = async () => { await stop(); setStoredLang('vi') }
  return app
}

test('AUTH-03, AUTH-11, AUTH-13, LOC-01: schema factories preserve spec boundaries in both languages', () => {
  const schemas = mod('features/auth/schemas.ts')
  for (const lang of ['vi', 'en']) {
    const translate = (key, params) => t(key, params, lang)
    const register = schemas.registerSchema(translate)
    const valid = { fullName: 'A'.repeat(100), phone: '0912345678', email: 'a@example.com', password: '12345678' }
    assert.equal(register.safeParse(valid).success, true)
    for (const patch of [{ fullName: '' }, { fullName: 'A'.repeat(101) }, { email: 'abc' }, { password: '1234567' }]) assert.equal(register.safeParse({ ...valid, ...patch }).success, false)
    const verify = schemas.verifyEmailSchema(translate)
    for (const [code, valid] of [['12345', false], ['123456', true], ['1234567', false]]) assert.equal(verify.safeParse({ code }).success, valid)
    const result = schemas.changePasswordSchema(translate).safeParse({ currentPassword: 'old', newPassword: '12345678', confirmPassword: 'different' })
    assert.equal(result.success, false)
    assert.deepEqual(result.error.issues[0].path, ['confirmPassword'])
    assert.equal(result.error.issues[0].message, lang === 'en' ? 'Passwords do not match' : 'Mật khẩu nhập lại không khớp')
  }
})

test('UI-12, LOC-01: login switches existing validation and password toggles without replacing typed inputs', async () => {
  fakeFetch([{ prefix: '/public/contact', handler: () => ok(null) }])
  const { LoginPage } = mod('pages/public/LoginPage.tsx')
  const app = await page(React.createElement(LoginPage), { lang: 'vi' })
  try {
    const phone = byName(app.container, 'phone')
    fill(app.container, phone, '123')
    fill(app.container, byName(app.container, 'password'), 'secret')
    dispatch(app.container, form(app.container), 'submit')
    await until(() => app.container.textContent.includes('Số điện thoại không hợp lệ'), 'Vietnamese validation')
    dispatch(app.container, buttonByText(app.container, 'English'), 'click')
    await until(() => app.container.textContent.includes('Invalid phone number'), 'English validation')
    assert.equal(byName(app.container, 'phone'), phone)
    assert.equal(phone.value, '123')
    assert.equal(byName(app.container, 'password').value, 'secret')
    assert.match(app.container.textContent, /Welcome back to ROOMS/)
    const show = find(app.container, n => n.getAttribute?.('aria-label') === 'Show password')[0]
    assert.ok(show)
    dispatch(app.container, show, 'click')
    await until(() => show.getAttribute('aria-label') === 'Hide password', 'password visibility toggle')
  } finally { await app.stop() }
})

test('AUTH-09, AUTH-12, LOC-01: guest email stays read-only in English; tenant account still offers email editing', async () => {
  const { GuestAccountPage } = mod('pages/guest/GuestAccountPage.tsx')
  for (const role of ['GUEST', 'TENANT']) {
    const app = await page(React.createElement(GuestAccountPage), { user: { ...guest, role } })
    try {
      const email = find(app.container, n => n.tagName === 'INPUT' && (n.type === 'email' || n.getAttribute('type') === 'email'))[0]
      assert.ok(email)
      assert.equal(Boolean(email.readOnly || email.getAttribute('readonly') !== null), role === 'GUEST')
      assert.equal(find(app.container, n => n.tagName === 'BUTTON' && n.textContent.startsWith('Save email')).length, role === 'TENANT' ? 1 : 0)
      assert.match(app.container.textContent, /Account details/)
      assert.match(app.container.textContent, /Change password/)
    } finally { await app.stop() }
  }
})

test('LOC-01, LOC-04, VIEW-20: guest and tenant home translate fixed copy and preserve the user name', async () => {
  fakeFetch([{ prefix: '/me/viewings', handler: () => ok([], { page: 1, limit: 20, total: 0 }) }, { prefix: '/me/contracts', handler: () => ok([], { page: 1, limit: 100, total: 0 }) }])
  const { GuestHomePage } = mod('pages/guest/GuestHomePage.tsx')
  const { TenantHomePage } = mod('pages/tenant/TenantHomePage.tsx')
  const app = await page(React.createElement(GuestHomePage), { user: guest })
  try {
    assert.match(app.container.textContent, /My viewings/)
    await until(() => app.container.textContent.includes('You have no room viewings yet'), 'empty list')
    assert.match(app.container.textContent, /Find a room/)
  } finally { await app.stop() }
  const tenantApp = await page(React.createElement(TenantHomePage), { user: { ...guest, role: 'TENANT' } })
  try {
    await until(() => tenantApp.container.textContent.includes('You have no contracts yet'), 'tenant empty overview')
    assert.match(tenantApp.container.textContent, /Hello, Đỗ Thị Khách/)
  } finally { await tenantApp.stop() }
})

test('AUTH-11, AUTH-12, AUTH-13, UI-05, LOC-02: English signup to verification keeps API fields, handles wrong code and opens the guest area', async () => {
  store.clear()
  let attempts = 0
  const calls = fakeFetch([
    { prefix: '/auth/register', handler: () => ok(null) },
    { prefix: '/auth/verify-email', handler: () => ++attempts === 1 ? fail(400, 'OTP_INVALID', 'Invalid verification code') : ok({ accessToken: 'test-token', user: guest }) },
  ])
  const { RegisterPage } = mod('pages/public/RegisterPage.tsx')
  const { VerifyEmailPage } = mod('pages/public/VerifyEmailPage.tsx')
  const { GuestHomePage } = mod('pages/guest/GuestHomePage.tsx')
  const app = await page(React.createElement(RegisterPage), { url: '/dang-ky', routes: [
    React.createElement(Route, { key: 'verify', path: '/xac-minh-email', element: React.createElement(VerifyEmailPage) }),
    React.createElement(Route, { key: 'home', path: '/toi', element: React.createElement('p', null, 'My viewings') }),
  ] })
  try {
    for (const [name, value] of Object.entries({ fullName: guest.fullName, phone: guest.phone, email: guest.email, password: '12345678' })) fill(app.container, byName(app.container, name), value)
    dispatch(app.container, form(app.container), 'submit')
    await until(() => app.container.textContent.includes('Verify your email'), 'verification page')
    assert.match(app.container.textContent, /guest@example.com/)
    assert.match(app.container.textContent, /Resend code \(/)
    fill(app.container, byName(app.container, 'code'), '111111')
    dispatch(app.container, form(app.container), 'submit')
    await until(() => app.container.textContent.includes('Invalid verification code'), 'API error verbatim')
    fill(app.container, byName(app.container, 'code'), '123456')
    dispatch(app.container, form(app.container), 'submit')
    await until(() => app.container.textContent.includes('My viewings'), 'guest home')
    assert.equal(pending.readPending(), null)
    assert.ok(calls.filter(c => c.url.includes('/auth/')).every(c => c.headers['Accept-Language'] === 'en'))
  } finally { await app.stop() }
})

test('AUTH-11, UI-05, UI-12: PHONE_TAKEN keeps the API field text when switching language', async () => {
  fakeFetch([{ prefix: '/auth/register', handler: () => fail(409, 'PHONE_TAKEN', 'Generic conflict', { phone: 'This phone already has an account. Sign in or reset your password.' }) }])
  const { RegisterPage } = mod('pages/public/RegisterPage.tsx')
  const app = await page(React.createElement(RegisterPage), { lang: 'vi' })
  try {
    for (const [name, value] of Object.entries({ fullName: guest.fullName, phone: guest.phone, email: guest.email, password: '12345678' })) fill(app.container, byName(app.container, name), value)
    dispatch(app.container, form(app.container), 'submit')
    await until(() => app.container.textContent.includes('This phone already has an account.'), 'field message')
    dispatch(app.container, buttonByText(app.container, 'English'), 'click')
    await until(() => app.container.textContent.includes('Create an account to book'), 'English copy')
    assert.match(app.container.textContent, /This phone already has an account\. Sign in or reset your password\./)
    assert.doesNotMatch(app.container.textContent, /Generic conflict/)
    assert.equal(byName(app.container, 'phone').value, guest.phone)
  } finally { await app.stop() }
})

test('AUTH-07, LOC-01: recovery success and invalid reset link use English copy', async () => {
  fakeFetch([
    { prefix: '/public/contact', handler: () => ok(null) },
    { prefix: '/auth/forgot-password', handler: () => ok(null) },
    { prefix: '/auth/reset-password', handler: () => fail(400, 'VALIDATION_FAILED', 'Invalid input', { token: 'Invalid token' }) },
  ])
  const { ForgotPasswordPage } = mod('pages/public/ForgotPasswordPage.tsx')
  let app = await page(React.createElement(ForgotPasswordPage), { url: '/quen-mat-khau' })
  try {
    fill(app.container, byName(app.container, 'phone'), guest.phone)
    dispatch(app.container, form(app.container), 'submit')
    await until(() => app.container.textContent.includes('If this phone number has an email address'), 'non-enumerating success')
  } finally { await app.stop() }
  app = await page(React.createElement(ForgotPasswordPage), { url: '/quen-mat-khau?token=expired' })
  try {
    fill(app.container, byName(app.container, 'newPassword'), '12345678')
    fill(app.container, byName(app.container, 'confirmPassword'), '12345678')
    dispatch(app.container, form(app.container), 'submit')
    await until(() => app.container.textContent.includes('The password reset link is invalid or has expired'), 'invalid link')
    assert.match(app.container.textContent, /Request a new link/)
  } finally { await app.stop() }
})

test('LOC-01, LOC-02, AUTH-09: shared staff forms and their API requests stay Vietnamese', async () => {
  const { StaffAccountPage } = mod('pages/staff/StaffAccountPage.tsx')
  const staff = { ...guest, role: 'BOSS' }
  const calls = fakeFetch([{ prefix: '/auth/me', handler: () => ok(staff) }])
  const { StaffLayout } = mod('layouts/StaffLayout.tsx')
  const app = await page(React.createElement(StaffLayout), { user: staff, url: '/ql/tai-khoan', routes: [
    React.createElement(Route, { key: 'staff', path: '/ql', element: React.createElement(StaffLayout) },
      React.createElement(Route, { path: 'tai-khoan', element: React.createElement(StaffAccountPage) })),
  ] })
  try {
    assert.match(app.container.textContent, /Lưu email/)
    assert.match(app.container.textContent, /Đổi mật khẩu/)
    fill(app.container, byName(app.container, 'email'), 'boss@example.com')
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM' && n.textContent.includes('Lưu email'))[0], 'submit')
    await until(() => app.container.textContent.includes('Đã lưu.'), 'staff save')
    assert.ok(calls.filter(c => c.url.includes('/auth/me')).every(c => c.headers['Accept-Language'] === 'vi'))
  } finally { await app.stop() }
})
