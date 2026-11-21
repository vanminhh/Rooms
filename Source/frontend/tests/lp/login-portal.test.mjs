import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import {
  alerts, byName, dispatch, fail, fakeFetch, fill, find, loadModule, draftFirst, mount, ok, until, wait,
} from '../p2/public-dom.mjs'

// Login by entry (owner 20/11/2026): AUTH-16, D-43, UI-11. Outside edges faked: fetch and the fake DOM; `login` of the auth context
// is a spy, so the test sees exactly what LoginPage sends. Guards, LoginPage, react-router, react-hook-form and the kit run unmodified.

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')
const mod = path => loadModule(draftFirst(`src/${path}`))
const guards = mod('app/guards.ts')

const store = new Map()
globalThis.window.sessionStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: k => { store.delete(k) },
}

// ---------- FE-LP-01: guards ----------

test('AUTH-16: portalOf maps the entry parameter; anything else is a plain login', () => {
  assert.equal(guards.portalOf('thue'), 'TENANT')
  assert.equal(guards.portalOf('quan-ly'), 'STAFF')
  for (const other of [null, '', 'admin', 'THUE', 'tenant', 'thue ']) assert.equal(guards.portalOf(other), undefined, String(other))
})

test('AUTH-16: a signed-out visitor of /thue... or /ql... is sent to the login with the entry of that area, before next', () => {
  const to = (pathname, search = '') => guards.guardRedirect(null, { pathname, search }, 'any')
  assert.equal(to('/thue'), '/dang-nhap?loi-vao=thue&next=%2Fthue')
  assert.equal(to('/thue/hop-dong/4', '?x=1'), '/dang-nhap?loi-vao=thue&next=%2Fthue%2Fhop-dong%2F4%3Fx%3D1')
  assert.equal(to('/ql'), '/dang-nhap?loi-vao=quan-ly&next=%2Fql')
  assert.equal(to('/ql/phong'), '/dang-nhap?loi-vao=quan-ly&next=%2Fql%2Fphong')
})

test('AUTH-16, UI-11: every other area keeps the plain login, and a path that only starts with the same letters is not an area', () => {
  const to = pathname => guards.guardRedirect(null, { pathname, search: '' }, 'any')
  assert.equal(to('/toi'), '/dang-nhap?next=%2Ftoi')
  assert.equal(to('/doi-mat-khau'), '/dang-nhap?next=%2Fdoi-mat-khau')
  assert.equal(to('/thuexyz'), '/dang-nhap?next=%2Fthuexyz')
  assert.equal(to('/qlx'), '/dang-nhap?next=%2Fqlx')
})

test('AUTH-16: the entry never changes where a signed-in user goes (AUTH-06): wrong role still goes to its own home', () => {
  const manager = { role: 'MANAGER', mustChangePassword: false }
  assert.equal(guards.guardRedirect(manager, { pathname: '/thue', search: '' }, ['TENANT']), '/ql')
})

// ---------- FE-LP-02: the login page ----------

async function mountLogin(url, login, Provider = React.Fragment) {
  const { MemoryRouter, Routes, Route, useLocation } = nodeRequire('react-router')
  const { AuthContext } = mod('app/auth-context.ts')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { LoginPage } = mod('pages/public/LoginPage.tsx')
  fakeFetch([{ prefix: '/public/contact', handler: () => ok(null) }])
  const sent = []
  const value = {
    status: 'ready', user: null, logout: async () => {}, refreshMe: async () => null, retry() {}, acceptSession: d => d.user,
    login: async input => { sent.push(input); return login(input) },
  }
  const Where = ({ name }) => React.createElement('p', { 'data-where': name }, `${name}${useLocation().search}`)
  const app = await mount(React.createElement(Provider, null, React.createElement(QueryClientProvider, { client: new QueryClient() },
    React.createElement(AuthContext.Provider, { value },
      React.createElement(MemoryRouter, { initialEntries: [url] },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/dang-nhap', element: React.createElement(LoginPage) }),
          React.createElement(Route, { path: '/thue', element: React.createElement(Where, { name: 'TENANT-HOME' }) }),
          React.createElement(Route, { path: '/ql', element: React.createElement(Where, { name: 'STAFF-HOME' }) })))))))
  return { ...app, sent }
}
const text = c => find(c, () => true).map(n => n.textContent).join(' ')
const form = c => find(c, n => n.tagName === 'FORM')[0]
const link = (c, label) => find(c, n => n.tagName === 'A' && n.textContent.trim() === label)[0]
const submit = (app, phone = '0912345678', password = 'Matkhau@1') => {
  fill(app.container, byName(app.container, 'phone'), phone)
  fill(app.container, byName(app.container, 'password'), password)
  dispatch(app.container, form(app.container), 'submit')
}
const wrongPortal = new (mod('shared/api.ts').ApiError)({
  code: 'WRONG_PORTAL', status: 403,
  message: 'Tài khoản này không đăng nhập được ở lối vào này. Hãy chọn đúng lối vào.',
})

test('AUTH-16, UI-11: ?loi-vao=thue shows "Đăng nhập người thuê", no sign-up link and no link to a general login (owner 21/11/2026)', async () => {
  const app = await mountLogin('/dang-nhap?loi-vao=thue&next=%2Fphong%2F7', async () => ({ role: 'TENANT' }))
  assert.ok(find(app.container, n => n.tagName === 'H1' && n.textContent === 'Đăng nhập người thuê').length === 1)
  assert.ok(!text(app.container).includes('Chưa có tài khoản?'))
  assert.equal(link(app.container, 'Đăng ký'), undefined)
  assert.equal(link(app.container, 'Dùng trang đăng nhập chung'), undefined)
  await app.stop()
})

test('AUTH-16, UI-11: ?loi-vao=quan-ly shows "Đăng nhập quản lý" and no link to a general login', async () => {
  const app = await mountLogin('/dang-nhap?loi-vao=quan-ly', async () => ({ role: 'MANAGER' }))
  assert.ok(find(app.container, n => n.tagName === 'H1' && n.textContent === 'Đăng nhập quản lý').length === 1)
  assert.equal(link(app.container, 'Dùng trang đăng nhập chung'), undefined)
  await app.stop()
})

test('AUTH-16: the entry is sent as portal: thue -> TENANT, quan-ly -> STAFF; the plain page and an unknown value send none', async () => {
  for (const [url, expected, home] of [
    ['/dang-nhap?loi-vao=thue', 'TENANT', 'TENANT-HOME'],
    ['/dang-nhap?loi-vao=quan-ly', 'STAFF', 'STAFF-HOME'],
    ['/dang-nhap', undefined, 'TENANT-HOME'],
    ['/dang-nhap?loi-vao=admin', undefined, 'TENANT-HOME'],
  ]) {
    const app = await mountLogin(url, async () => ({ role: home === 'STAFF-HOME' ? 'MANAGER' : 'TENANT' }))
    submit(app)
    await until(() => app.sent.length === 1, `login call for ${url}`)
    assert.equal(app.sent[0].portal, expected, url)
    assert.equal(app.sent[0].phone, '0912345678')
    await until(() => find(app.container, n => n.attributes['data-where'] === home).length === 1, `home ${home} for ${url}`)
    await app.stop()
  }
})

test('AUTH-01, UI-11: the plain login page and an unknown entry still show "Đăng nhập" and the sign-up note', async () => {
  for (const url of ['/dang-nhap', '/dang-nhap?loi-vao=admin']) {
    const app = await mountLogin(url, async () => ({ role: 'TENANT' }))
    assert.ok(find(app.container, n => n.tagName === 'H1' && n.textContent === 'Đăng nhập').length === 1, url)
    assert.ok(text(app.container).includes('Chưa có tài khoản?'), url)
    assert.equal(link(app.container, 'Dùng trang đăng nhập chung'), undefined, url)
    await app.stop()
  }
})

test('AUTH-16: WRONG_PORTAL shows the API message in the form alert and the visitor stays on the login page', async () => {
  const app = await mountLogin('/dang-nhap?loi-vao=thue', async () => { throw wrongPortal })
  submit(app)
  await until(() => alerts(app.container).includes(wrongPortal.message), 'WRONG_PORTAL message')
  await wait(30)
  assert.equal(find(app.container, n => n.attributes['data-where'] !== undefined).length, 0, 'no navigation away')
  assert.ok(find(app.container, n => n.tagName === 'H1' && n.textContent === 'Đăng nhập người thuê').length === 1)
  await app.stop()
})

test('AUTH-16: the English page shows its own titles for both entries', async () => {
  const { I18nProvider, setStoredLang } = mod('shared/i18n/index.ts')
  setStoredLang('en')
  try {
    for (const [entry, title] of [['thue', 'Tenant sign in'], ['quan-ly', 'Staff sign in']]) {
      const app = await mountLogin(`/dang-nhap?loi-vao=${entry}`, async () => ({ role: 'TENANT' }), I18nProvider)
      assert.ok(find(app.container, n => n.tagName === 'H1' && n.textContent === title).length === 1, title)
      assert.equal(link(app.container, 'Use the general sign-in page'), undefined)
      await app.stop()
    }
  } finally {
    setStoredLang('vi')
  }
})
