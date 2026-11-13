import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { draftFirst, loadModule, mount, find, dispatch, fill, byName, until, fakeFetch, ok, fail } from '../p2/public-dom.mjs'

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

const React = createRequire(import.meta.url)('react')
const mod = path => loadModule(draftFirst(`src/${path}`))
const store = new Map()
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => { store.set(key, String(value)) },
  removeItem: key => { store.delete(key) },
}

const guest = { id: 9, role: 'GUEST', phone: '0912345678', fullName: 'Khách', email: 'khach@example.com', emailVerified: true, locale: 'vi', mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null }

function boot(user, patch = call => ok({ ...user, ...JSON.parse(call.body) })) {
  return fakeFetch([
    { prefix: '/auth/refresh', handler: () => ok({ accessToken: 'valid-token' }) },
    { prefix: '/auth/me', method: 'GET', handler: () => ok(user) },
    { prefix: '/auth/me', method: 'PATCH', handler: patch },
  ])
}

function Probe() {
  const { lang, setLang } = mod('shared/i18n/index.ts').useI18n()
  const { status } = mod('app/auth-context.ts').useAuth()
  return React.createElement('button', { type: 'button', onClick: () => setLang('en') }, `${status}:${lang}`)
}

test('KIT-04, KIT-07, FE-EX-09: kit switch uses supplied labels and exposes the selected language', async () => {
  const { LanguageSwitch } = mod('components/LanguageSwitch.tsx')
  const selected = []
  const app = await mount(React.createElement(LanguageSwitch, {
    value: 'vi', viLabel: 'Tiếng Việt', enLabel: 'English', groupLabel: 'Ngôn ngữ', onChange: next => selected.push(next),
  }))
  try {
    const group = find(app.container, n => n.attributes.role === 'group')[0]
    const buttons = find(group, n => n.tagName === 'BUTTON')
    assert.equal(group.getAttribute('aria-label'), 'Ngôn ngữ')
    assert.deepEqual(buttons.map(b => [b.textContent, b.getAttribute('aria-pressed'), b.getAttribute('type')]), [
      ['Tiếng Việt', 'true', 'button'], ['English', 'false', 'button'],
    ])
    dispatch(app.container, buttons[1], 'click')
    assert.deepEqual(selected, ['en'])
  } finally {
    await app.stop()
  }
})

test('LOC-02, FE-EX-09: public, refresh and staff requests all send the chosen Accept-Language', async () => {
  const api = mod('shared/api.ts')
  api.setAccessToken(null)
  const calls = fakeFetch([
    { prefix: '/public/rooms', handler: () => ok([]) },
    { prefix: '/auth/refresh', handler: () => ok({ accessToken: 'valid-token' }) },
    { prefix: '/buildings', handler: () => ok([]) },
  ])
  api.setLanguage('en')
  await api.apiRequest('/public/rooms')
  await api.refreshAccessToken()
  await api.apiRequest('/buildings')
  assert.deepEqual(calls.map(c => c.headers['Accept-Language']), ['en', 'en', 'en'])
  api.setLanguage('vi')
  await api.apiRequest('/public/rooms')
  assert.equal(calls.at(-1).headers['Accept-Language'], 'vi')
  api.setAccessToken(null)
})

test('LOC-03, AUTH-15, FE-EX-09: on login a server locale wins when this browser has no saved choice', async () => {
  store.clear()
  const api = mod('shared/api.ts')
  api.setAccessToken(null)
  const calls = boot({ ...guest, locale: 'en' })
  const { AppProviders } = mod('app/AppProviders.tsx')
  const app = await mount(React.createElement(AppProviders, null, React.createElement(Probe)))
  try {
    await until(() => find(app.container, n => n.tagName === 'BUTTON')[0]?.textContent === 'ready:en', 'server locale')
    assert.equal(store.get('rooms.lang'), 'en')
    assert.equal(calls.filter(c => c.method === 'PATCH').length, 0)
  } finally {
    await app.stop()
    api.setAccessToken(null)
  }
})

test('LOC-03, AUTH-15, FE-EX-09: an explicit browser choice syncs to the account once', async () => {
  store.clear()
  store.set('rooms.lang', 'vi')
  const api = mod('shared/api.ts')
  api.setAccessToken(null)
  const calls = boot({ ...guest, locale: 'en' })
  const { AppProviders } = mod('app/AppProviders.tsx')
  const app = await mount(React.createElement(AppProviders, null, React.createElement(Probe)))
  try {
    await until(() => calls.some(c => c.method === 'PATCH'), 'locale sync')
    assert.equal(find(app.container, n => n.tagName === 'BUTTON')[0].textContent, 'ready:vi')
    assert.deepEqual(calls.filter(c => c.method === 'PATCH').map(c => JSON.parse(c.body)), [{ locale: 'vi' }])
  } finally {
    await app.stop()
    api.setAccessToken(null)
  }
})

test('AUTH-15, UI-05, FE-EX-09: switching while signed in sends one PATCH and stays switched if it fails', async () => {
  store.clear()
  store.set('rooms.lang', 'vi')
  const api = mod('shared/api.ts')
  api.setAccessToken(null)
  const calls = boot(guest, () => fail(500, 'NETWORK_ERROR', 'Lỗi mạng'))
  const oldError = console.error
  console.error = () => {}
  const { AppProviders } = mod('app/AppProviders.tsx')
  const app = await mount(React.createElement(AppProviders, null, React.createElement(Probe)))
  try {
    const button = find(app.container, n => n.tagName === 'BUTTON')[0]
    await until(() => button.textContent === 'ready:vi', 'signed-in session')
    dispatch(app.container, button, 'click')
    await until(() => button.textContent === 'ready:en', 'English UI')
    await until(() => calls.some(c => c.method === 'PATCH'), 'locale PATCH')
    assert.deepEqual(calls.filter(c => c.method === 'PATCH').map(c => JSON.parse(c.body)), [{ locale: 'en' }])
    assert.equal(store.get('rooms.lang'), 'en')
  } finally {
    await app.stop()
    console.error = oldError
    api.setAccessToken(null)
  }
})

test('AUTH-15, FE-EX-09: a delayed locale response does not overwrite a newer account email', async () => {
  store.clear()
  store.set('rooms.lang', 'vi')
  const api = mod('shared/api.ts')
  api.setAccessToken(null)
  let account = { ...guest, email: 'before@example.com' }
  let finishPatch
  const calls = fakeFetch([
    { prefix: '/auth/refresh', handler: () => ok({ accessToken: 'valid-token' }) },
    { prefix: '/auth/me', method: 'GET', handler: () => ok(account) },
    { prefix: '/auth/me', method: 'PATCH', handler: () => new Promise(resolve => { finishPatch = resolve }) },
  ])
  function AccountProbe() {
    const { lang, setLang } = mod('shared/i18n/index.ts').useI18n()
    const { user, status, refreshMe } = mod('app/auth-context.ts').useAuth()
    return React.createElement('div', null,
      React.createElement('button', { type: 'button', onClick: () => setLang('en') }, `switch:${status}:${lang}`),
      React.createElement('button', { type: 'button', onClick: () => void refreshMe() }, 'refresh'),
      React.createElement('p', null, `${user?.locale ?? 'none'}:${user?.email ?? 'no email'}`))
  }
  const { AppProviders } = mod('app/AppProviders.tsx')
  const app = await mount(React.createElement(AppProviders, null, React.createElement(AccountProbe)))
  try {
    await until(() => app.container.textContent.includes('switch:ready:vi'), 'account ready')
    const buttons = find(app.container, n => n.tagName === 'BUTTON')
    dispatch(app.container, buttons[0], 'click')
    await until(() => calls.some(c => c.method === 'PATCH') && finishPatch, 'pending locale save')
    account = { ...account, email: 'new@example.com' }
    dispatch(app.container, buttons[1], 'click')
    await until(() => app.container.textContent.includes('new@example.com'), 'new account email')
    finishPatch(ok({ ...guest, locale: 'en', email: 'before@example.com' }))
    await until(() => app.container.textContent.includes('en:new@example.com') || app.container.textContent.includes('en:before@example.com'), 'locale response')
    assert.ok(app.container.textContent.includes('en:new@example.com'))
  } finally {
    await app.stop()
    api.setAccessToken(null)
  }
})

test('LOC-03, UI-12, FE-EX-09: public header changes without losing typed login input', async () => {
  store.clear()
  const api = mod('shared/api.ts')
  api.setAccessToken(null)
  const calls = fakeFetch([
    { prefix: '/auth/refresh', handler: () => fail(401, 'UNAUTHENTICATED', 'Chưa đăng nhập') },
    { prefix: '/public/contact', handler: () => ok(null) },
  ])
  const { MemoryRouter, Routes, Route } = createRequire(import.meta.url)('react-router')
  const { AppProviders } = mod('app/AppProviders.tsx')
  const { PublicLayout } = mod('layouts/PublicLayout.tsx')
  const { LoginPage } = mod('pages/public/LoginPage.tsx')
  const tree = React.createElement(AppProviders, null,
    React.createElement(MemoryRouter, { initialEntries: ['/dang-nhap'] },
      React.createElement(Routes, null,
        React.createElement(Route, { element: React.createElement(PublicLayout) },
          React.createElement(Route, { path: '/dang-nhap', element: React.createElement(LoginPage) })))))
  const app = await mount(tree)
  try {
    await until(() => byName(app.container, 'phone'), 'login form')
    const phone = byName(app.container, 'phone')
    fill(app.container, phone, '0912345678')
    const english = find(app.container, n => n.tagName === 'BUTTON' && n.textContent === 'English')[0]
    assert.ok(english, 'language switch in header')
    dispatch(app.container, english, 'click')
    await until(() => find(app.container, n => n.tagName === 'A' && n.textContent === 'Find a room').length > 0, 'English header')
    assert.equal(byName(app.container, 'phone'), phone)
    assert.equal(phone.value, '0912345678')
    assert.equal(store.get('rooms.lang'), 'en')
    assert.equal(calls.filter(c => c.method === 'PATCH').length, 0)
  } finally {
    await app.stop()
    api.setAccessToken(null)
  }
})

test('LOC-03, FE-EX-09: guest and tenant headers have a switch; staff has none', async () => {
  const { MemoryRouter } = createRequire(import.meta.url)('react-router')
  const { AuthContext } = mod('app/auth-context.ts')
  const { I18nProvider } = mod('shared/i18n/index.ts')
  const { GuestLayout } = mod('layouts/GuestLayout.tsx')
  const { TenantLayout } = mod('layouts/TenantLayout.tsx')
  const session = { status: 'ready', user: guest, logout: async () => {} }
  for (const Layout of [GuestLayout, TenantLayout]) {
    const app = await mount(React.createElement(I18nProvider, null,
      React.createElement(AuthContext.Provider, { value: session },
        React.createElement(MemoryRouter, null, React.createElement(Layout)))))
    try { assert.equal(find(app.container, n => n.attributes.role === 'group').length, 1) }
    finally { await app.stop() }
  }
})

test('LOC-01, FE-EX-09: staff content stays Vietnamese inside an English browser session', async () => {
  store.clear()
  store.set('rooms.lang', 'en')
  const { QueryClient, QueryClientProvider } = createRequire(import.meta.url)('@tanstack/react-query')
  const { MemoryRouter, Routes, Route } = createRequire(import.meta.url)('react-router')
  const { AuthContext } = mod('app/auth-context.ts')
  const { I18nProvider, useI18n } = mod('shared/i18n/index.ts')
  const { StaffLayout } = mod('layouts/StaffLayout.tsx')
  function StaffText() {
    const { lang, t } = useI18n()
    return React.createElement('p', { 'data-staff-lang': lang }, t('nav.findRoom'))
  }
  const session = { status: 'ready', user: { ...guest, role: 'MANAGER', buildings: [] }, logout: async () => {} }
  const app = await mount(React.createElement(I18nProvider, null,
    React.createElement(QueryClientProvider, { client: new QueryClient() },
      React.createElement(AuthContext.Provider, { value: session },
        React.createElement(MemoryRouter, { initialEntries: ['/ql'] },
          React.createElement(Routes, null,
            React.createElement(Route, { element: React.createElement(StaffLayout) },
              React.createElement(Route, { path: '/ql', element: React.createElement(StaffText) }))))))))
  try {
    const text = find(app.container, n => n.attributes['data-staff-lang'])[0]
    assert.equal(text.textContent, 'Tìm phòng')
    assert.equal(text.getAttribute('data-staff-lang'), 'vi')
    assert.equal(find(app.container, n => n.attributes.role === 'group').length, 0)
  } finally {
    await app.stop()
  }
})
