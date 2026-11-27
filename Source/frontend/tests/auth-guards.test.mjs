import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { draftFirst } from './draft-root.mjs'
// Restored FE-LOGIN-11 (StaffHomePage) test below reuses this fake DOM/fetch harness (its own two outside
// edges: globalThis.fetch and the DOM, see tests/p2/cp7-rooms.test.mjs and tests/p2/fe12-dashboard.test.mjs for
// the same shape); `find` is aliased, this file already declares its own `find` for the stub-JSX tree above.
import { loadModule, mount, fakeFetch, find as domFind, until } from './p2/public-dom.mjs'
import { mountContractPage } from './p3/contracts-dom.mjs'

// Mirrored from the main copy (PLAN.md CP-6, the P2-8a lesson): `read` now resolves draft-first / main-fallback
// via draft-root.mjs (replacing the old single-fixed-depth ENOENT fallback), so files this draft does touch
// (layouts/PublicLayout.tsx) come from the draft and everything else (guards.ts, RequireAuth.tsx, the other
// layouts, pages/tenant, features/auth) falls back to the applied main tree. Read-only: this never writes
// outside the draft.
function read(path) {
  return readFileSync(draftFirst(path.replace(/^(\.\.\/)+/, '')), 'utf8')
}

function compile(path, requireModule) {
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  Function('require', 'exports', code)(requireModule, exports)
  return exports
}

// guards.ts is pure (type-only import is erased): transpiled and run unmodified.
const guards = compile('../src/app/guards.ts', id => { throw new Error(`unexpected import ${id}`) })
const { homeOf, safeNext, guardRedirect } = guards

const tenant = { role: 'TENANT', mustChangePassword: false }
const manager = { role: 'MANAGER', mustChangePassword: false }
const boss = { role: 'BOSS', mustChangePassword: false }
const STAFF = ['MANAGER', 'BOSS']

test('AUTH-06: homeOf sends each role to its own area', () => {
  assert.equal(homeOf('TENANT'), '/thue')
  assert.equal(homeOf('MANAGER'), '/ql')
  assert.equal(homeOf('BOSS'), '/ql')
})

test('AUTH-06: not signed in -> /dang-nhap with the encoded original path and query', () => {
  assert.equal(
    guardRedirect(null, { pathname: '/thue/tai-khoan', search: '?a=1' }, ['TENANT']),
    '/dang-nhap?loi-vao=thue&next=%2Fthue%2Ftai-khoan%3Fa%3D1' // AUTH-16: the guard adds the entry of the area,
  )
  assert.equal(guardRedirect(null, { pathname: '/ql', search: '' }, STAFF), '/dang-nhap?loi-vao=quan-ly&next=%2Fql')
  assert.equal(guardRedirect(null, { pathname: '/doi-mat-khau', search: '' }, 'any'), '/dang-nhap?next=%2Fdoi-mat-khau')
})

test('AUTH-06: wrong role goes to the own home', () => {
  assert.equal(guardRedirect(tenant, { pathname: '/ql', search: '' }, STAFF), '/thue')
  assert.equal(guardRedirect(manager, { pathname: '/thue', search: '' }, ['TENANT']), '/ql')
  assert.equal(guardRedirect(boss, { pathname: '/thue', search: '' }, ['TENANT']), '/ql')
})

test('AUTH-06: right role, no forced change -> no redirect', () => {
  assert.equal(guardRedirect(tenant, { pathname: '/thue', search: '' }, ['TENANT']), null)
  assert.equal(guardRedirect(manager, { pathname: '/ql', search: '' }, STAFF), null)
  assert.equal(guardRedirect(boss, { pathname: '/ql/tai-khoan', search: '' }, STAFF), null)
  assert.equal(guardRedirect(tenant, { pathname: '/doi-mat-khau', search: '' }, 'any'), null)
})

test('AUTH-05: mustChangePassword forces /doi-mat-khau, but not when already there', () => {
  const forced = { role: 'TENANT', mustChangePassword: true }
  assert.equal(guardRedirect(forced, { pathname: '/thue', search: '' }, ['TENANT']), '/doi-mat-khau')
  assert.equal(guardRedirect(forced, { pathname: '/doi-mat-khau', search: '' }, 'any'), null)
})

test('AUTH-05: the forced change is checked before the role', () => {
  const forced = { role: 'TENANT', mustChangePassword: true }
  assert.equal(guardRedirect(forced, { pathname: '/ql', search: '' }, STAFF), '/doi-mat-khau')
  const forcedManager = { role: 'MANAGER', mustChangePassword: true }
  assert.equal(guardRedirect(forcedManager, { pathname: '/thue', search: '' }, ['TENANT']), '/doi-mat-khau')
})

test('A7: safeNext keeps in-app paths', () => {
  assert.equal(safeNext('/thue/tai-khoan'), '/thue/tai-khoan')
  assert.equal(safeNext('/ql?x=1'), '/ql?x=1')
})

test('A7: safeNext rejects empty, relative, protocol-relative, absolute and backslash URLs', () => {
  for (const bad of [null, '', 'thue', '//evil.com', '/\\evil.com', 'https://evil.com', '/x?u=https://a']) {
    assert.equal(safeNext(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
})

test('A7: safeNext never points back to the login page', () => {
  assert.equal(safeNext('/dang-nhap'), null)
  assert.equal(safeNext('/dang-nhap?next=/ql'), null)
})

// ---- RequireAuth / GuestOnly (Q6-A, AUTH-06): react-router, the kit and useAuth are the outside edges and are faked;
// RequireAuth.tsx and guards.ts run unmodified. Output is the element tree, so Navigate props can be read.
function loadRequireAuth(authValue, location = { pathname: '/thue', search: '' }) {
  const { t } = loadModule(draftFirst('src/shared/i18n/index.ts'))
  const jsx = (type, props) => ({ type, props })
  const Navigate = props => ({ navigate: props })
  const Outlet = () => ({ outlet: true })
  const Spinner = props => ({ spinner: props.label })
  const RoomsButton = props => ({ button: props })
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router': { Navigate, Outlet, useLocation: () => location },
    '../components': { RoomsButton, Spinner },
    './auth-context': { useAuth: () => authValue },
    './guards': guards,
    '../shared/i18n': { t, useI18n: () => ({ lang: 'vi', t: (key, params) => t(key, params, 'vi') }) },
  }
  const exports = compile('../src/app/RequireAuth.tsx', id => {
    if (id in modules) return modules[id]
    throw new Error(`unexpected import ${id}`)
  })
  return { ...exports, Navigate, Outlet, Spinner, RoomsButton }
}

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (!node || typeof node !== 'object') return [node]
  const { children } = node.props ?? {}
  return [node, ...(children === undefined ? [] : flatten(children))]
}
const texts = nodes => nodes.filter(n => typeof n === 'string')

test('Q6-A: RequireAuth while loading shows a Spinner "Đang tải" inside .rooms-theme', () => {
  const m = loadRequireAuth({ status: 'loading', user: null, retry() {} })
  const root = m.RequireAuth({ allow: 'any' })
  // UI-13 (10/11/2026): the startup screen fills the viewport (layout-startup) instead of leaving white below.
  assert.equal(root.props.className, 'rooms-theme layout-startup')
  const nodes = flatten(root)
  assert.ok(nodes.some(n => n.type === m.Spinner && n.props.label === 'Đang tải'))
})

test('Q6-A: RequireAuth on startup error shows the alert and "Thử lại" (retry), no redirect', () => {
  let retried = 0
  const m = loadRequireAuth({ status: 'error', user: null, retry: () => { retried++ } })
  const root = m.RequireAuth({ allow: ['TENANT'] })
  assert.equal(root.props.className, 'rooms-theme layout-startup')
  const nodes = flatten(root)
  const alert = nodes.find(n => n.type === 'p' && n.props.role === 'alert')
  assert.ok(alert)
  assert.deepEqual(texts(flatten(alert.props.children)), ['Không tải được phiên đăng nhập.'])
  assert.ok(!nodes.some(n => n.type === m.Navigate))
  const button = nodes.find(n => n.type === m.RoomsButton)
  assert.deepEqual(texts(flatten(button.props.children)), ['Thử lại'])
  button.props.onClick()
  assert.equal(retried, 1)
})

test('AUTH-06: RequireAuth redirects a signed-out visitor to /dang-nhap?next=, replace', () => {
  const m = loadRequireAuth({ status: 'ready', user: null, retry() {} }, { pathname: '/thue', search: '' })
  const out = m.RequireAuth({ allow: ['TENANT'] })
  assert.equal(out.type, m.Navigate)
  assert.equal(out.props.to, '/dang-nhap?loi-vao=thue&next=%2Fthue')
  assert.equal(out.props.replace, true)
})

test('AUTH-06: RequireAuth sends a tenant away from /ql, lets the right role through', () => {
  const wrong = loadRequireAuth({ status: 'ready', user: { role: 'TENANT', mustChangePassword: false } }, { pathname: '/ql', search: '' })
  assert.equal(wrong.RequireAuth({ allow: STAFF }).props.to, '/thue')
  const right = loadRequireAuth({ status: 'ready', user: { role: 'MANAGER', mustChangePassword: false } }, { pathname: '/ql', search: '' })
  assert.equal(right.RequireAuth({ allow: STAFF }).type, right.Outlet)
})

test('AUTH-05: RequireAuth sends a user who must change password to /doi-mat-khau', () => {
  const m = loadRequireAuth({ status: 'ready', user: { role: 'TENANT', mustChangePassword: true } }, { pathname: '/thue', search: '' })
  assert.equal(m.RequireAuth({ allow: ['TENANT'] }).props.to, '/doi-mat-khau')
})

test('AUTH-06: GuestOnly sends a signed-in user home, shows the page to guests and after a startup error', () => {
  const boss = loadRequireAuth({ status: 'ready', user: { role: 'BOSS', mustChangePassword: false } })
  assert.equal(boss.GuestOnly().props.to, '/ql')
  assert.equal(boss.GuestOnly().props.replace, true)
  const tenant = loadRequireAuth({ status: 'ready', user: { role: 'TENANT', mustChangePassword: false } })
  assert.equal(tenant.GuestOnly().props.to, '/thue')
  const guest = loadRequireAuth({ status: 'ready', user: null })
  assert.equal(guest.GuestOnly().type, guest.Outlet)
  const errored = loadRequireAuth({ status: 'error', user: null })
  assert.equal(errored.GuestOnly().type, errored.Outlet)
  const loading = loadRequireAuth({ status: 'loading', user: null })
  assert.equal(loading.GuestOnly().type, loading.Spinner)
})

// ================= CP-3: internal-links, layouts, useSignOut, pages, routes =================
// Outside edges faked: react, react-router, the kit, useAuth, usePublicContact, css. The files under test run unmodified.
const internalLinks = compile('../src/layouts/internal-links.ts', id => { throw new Error(`unexpected import ${id}`) })

function fakeClick({ href = '/thue', attrs = {}, noAnchor = false, outside = false, ...eventProps } = {}) {
  const attributes = { href, ...attrs }
  const anchor = { hasAttribute: name => name in attributes, getAttribute: name => (name in attributes ? attributes[name] : null) }
  const state = { prevented: 0, navigated: [] }
  const event = {
    defaultPrevented: false, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    target: { closest: selector => { assert.equal(selector, 'a[href]'); return noAnchor ? null : anchor } },
    currentTarget: { contains: node => !outside && node === anchor },
    preventDefault() { state.prevented++ },
    ...eventProps,
  }
  internalLinks.handleInternalLinkClick(event, to => state.navigated.push(to))
  return state
}

test('A2: a plain left click on an in-app link is prevented and handed to navigate', () => {
  assert.deepEqual(fakeClick({ href: '/thue' }), { prevented: 1, navigated: ['/thue'] })
  assert.deepEqual(fakeClick({ href: '/thue/tai-khoan?a=1' }), { prevented: 1, navigated: ['/thue/tai-khoan?a=1'] })
  assert.deepEqual(fakeClick({ href: '/x', attrs: { target: '_self' } }), { prevented: 1, navigated: ['/x'] })
})

test('A2: modifier keys and non-left buttons are left to the browser', () => {
  for (const props of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
    assert.deepEqual(fakeClick(props), { prevented: 0, navigated: [] }, JSON.stringify(props))
  }
})

test('A2: target=_blank, download, external, protocol-relative, hash, relative and mailto/tel links are left alone', () => {
  assert.deepEqual(fakeClick({ attrs: { target: '_blank' } }), { prevented: 0, navigated: [] })
  assert.deepEqual(fakeClick({ attrs: { download: '' } }), { prevented: 0, navigated: [] })
  for (const href of ['https://x', 'http://x', '//x', '#a', 'thue', 'mailto:a@b.c', 'tel:0900000001', '']) {
    assert.deepEqual(fakeClick({ href }), { prevented: 0, navigated: [] }, JSON.stringify(href))
  }
})

test('A2: an already prevented event, a click outside any link and a link outside the layout are ignored', () => {
  assert.deepEqual(fakeClick({ defaultPrevented: true }), { prevented: 0, navigated: [] })
  assert.deepEqual(fakeClick({ noAnchor: true }), { prevented: 0, navigated: [] })
  assert.deepEqual(fakeClick({ outside: true }), { prevented: 0, navigated: [] })
})

const jsxRuntime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' }
const textOf = node => Array.isArray(node) ? node.map(textOf).join('') : node && typeof node === 'object' ? textOf(node.props?.children) : node == null || node === false ? '' : String(node)
const find = (root, predicate) => flatten(root).find(n => n && typeof n === 'object' && predicate(n))
const findAll = (root, predicate) => flatten(root).filter(n => n && typeof n === 'object' && predicate(n))

function loadLayout(file, { auth = { status: 'ready', user: null }, contact = {}, signOutState = { signOut() {}, signingOut: false } } = {}) {
  const navigations = []
  const fakes = {
    Outlet: () => ({ outlet: true }),
    RoomsHeader: () => null,
    RoomsFooter: () => null,
    RoomsButton: () => null,
    LanguageSwitch: () => null,
    ContactInfo: () => null,
    // CP-2: StaffLayout now delegates the building pick to these two (tested on their own in tests/p2/),
    // so here they are outside edges just like the kit and useAuth.
    BuildingSelector: () => null,
    BuildingSelectionProvider: () => null,
  }
  const modules = {
    'react/jsx-runtime': jsxRuntime,
    'react': { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] },
    'react-router': { Outlet: fakes.Outlet, useLocation: () => ({ pathname: '/' }), useNavigate: () => to => navigations.push(to) },
    '../features/public/EntryScreen': { EntryScreen: () => null },
    '../features/public/entry-choice': { readEntryChoice: () => null, saveEntryChoice() {} },
    '../features/public/ChatWidget': { ChatWidget: () => null }, // CHAT-01, tested in tests/p6
    '../features/public/chat': { roomIdOfPath: () => undefined },
    '../components': fakes,
    '../app/auth-context': { useAuth: () => auth },
    '../shared/i18n': { I18nProvider: () => null, useI18n: () => ({ lang: 'vi', setLang() {}, t: key => loadModule(draftFirst('src/shared/i18n/index.ts')).t(key, undefined, 'vi') }) },
    '../app/guards': guards,
    '../features/auth/ContactInfo': { ContactInfo: fakes.ContactInfo },
    '../features/auth/usePublicContact': { usePublicContact: () => contact },
    '../features/auth/useSignOut': { useSignOut: () => signOutState },
    '../features/notifications/NotificationBell': { NotificationBell: function NotificationBell() { return null } }, // NOTI-11, tested in tests/p4
    '../features/buildings/BuildingSelector': { BuildingSelector: fakes.BuildingSelector },
    '../features/buildings/BuildingSelectionProvider': { BuildingSelectionProvider: fakes.BuildingSelectionProvider },
    './internal-links': internalLinks,
    './layouts.css': {},
  }
  const exports = compile(file, id => {
    if (id in modules) return modules[id]
    throw new Error(`unexpected import ${id}`)
  })
  return { exports, fakes, navigations }
}

const headerOf = (root, fakes) => find(root, n => n.type === fakes.RoomsHeader)

// D-5 (PLAN.md CP-2, this draft): PublicLayout now always leads with { label: 'Tìm phòng', href: '/phong' }
// before the account link, except while loading (menu still []). Mirrors the same D-5 update already made to
// tests/auth-login-flow.test.mjs's FE-LOGIN-10 tests.
test('FE-LOGIN-10/D-5: PublicLayout menu is empty while loading, "Tìm phòng"+"Đăng nhập" when signed out or after a startup error', () => {
  for (const status of ['ready', 'error']) {
    const { exports, fakes } = loadLayout('../src/layouts/PublicLayout.tsx', { auth: { status, user: null } })
    assert.deepEqual(headerOf(exports.PublicLayout(), fakes).props.links, [{ label: 'Tìm phòng', href: '/phong' }, { label: 'Đăng nhập', href: '/dang-nhap' }], status)
  }
  const loading = loadLayout('../src/layouts/PublicLayout.tsx', { auth: { status: 'loading', user: null } })
  assert.deepEqual(headerOf(loading.exports.PublicLayout(), loading.fakes).props.links, [])
})

test('AUTH-06/D-5: PublicLayout shows "Tìm phòng" then "Trang của tôi" pointing at the role home', () => {
  const expected = { TENANT: '/thue', MANAGER: '/ql', BOSS: '/ql' }
  for (const [role, href] of Object.entries(expected)) {
    const { exports, fakes } = loadLayout('../src/layouts/PublicLayout.tsx', { auth: { status: 'ready', user: { role } } })
    assert.deepEqual(headerOf(exports.PublicLayout(), fakes).props.links, [{ label: 'Tìm phòng', href: '/phong' }, { label: 'Trang của tôi', href }], role)
  }
})

test('KIT-01/KIT-10: PublicLayout root is .rooms-theme, header uses the logo and "/" home, Outlet inside <main>', () => {
  const { exports, fakes } = loadLayout('../src/layouts/PublicLayout.tsx')
  const root = exports.PublicLayout()
  assert.equal(root.props.className, 'rooms-theme')
  const header = headerOf(root, fakes)
  assert.equal(header.props.homeHref, '/')
  assert.equal(header.props.logoSrc, '/images/rooms-folder-back.svg')
  const main = find(root, n => n.type === 'main')
  assert.ok(find(main, n => n.type === fakes.Outlet))
})

test('UI-11/Q3-A: PublicLayout footer carries the Hà Nội description, room link and Boss contact', () => {
  const data = { phone: '0900000001', zaloUrl: null, facebookUrl: null }
  const { exports, fakes } = loadLayout('../src/layouts/PublicLayout.tsx', { contact: { data } })
  const footer = find(exports.PublicLayout(), n => n.type === fakes.RoomsFooter)
  assert.equal(footer.props.description, 'Chung cư mini cho thuê tại Hà Nội.')
  assert.deepEqual(footer.props.links, [{ label: 'Xem phòng trống', href: '/phong' }])
  // UI review 10/11/2026: the "Khu vực" column links to the district section of the home page.
  assert.deepEqual(footer.props.areaLinks, [{ label: 'Xem các khu vực', href: '/#khu-vuc' }])
  assert.equal(footer.props.contact.type, fakes.ContactInfo)
  assert.equal(footer.props.contact.props.contact, data)
})

test('A11: PublicLayout footer still renders when the contact fails to load (no data) or is null', () => {
  for (const contact of [{ data: undefined, isError: true }, { data: null }]) {
    const { exports, fakes } = loadLayout('../src/layouts/PublicLayout.tsx', { contact })
    const footer = find(exports.PublicLayout(), n => n.type === fakes.RoomsFooter)
    assert.ok(footer)
    assert.equal(footer.props.contact.props.contact, null)
  }
})

test('A2: PublicLayout root onClick turns an in-app link click into navigate, leaves external ones', () => {
  const { exports, navigations } = loadLayout('../src/layouts/PublicLayout.tsx')
  const root = exports.PublicLayout()
  const anchor = { hasAttribute: () => false, getAttribute: name => (name === 'href' ? '/dang-nhap' : null) }
  let prevented = 0
  root.props.onClick({
    defaultPrevented: false, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    target: { closest: () => anchor }, currentTarget: { contains: () => true }, preventDefault: () => prevented++,
  })
  assert.deepEqual(navigations, ['/dang-nhap'])
  assert.equal(prevented, 1)
})

test('Q3-A, Q2-A, FE-P3-01: TenantLayout has the tenant menu including announcements and requests, the sign-out button and no footer', () => {
  const calls = []
  const { exports, fakes } = loadLayout('../src/layouts/TenantLayout.tsx', { signOutState: { signOut: () => calls.push('out'), signingOut: false } })
  const root = exports.TenantLayout()
  assert.equal(root.props.className, 'rooms-theme')
  const header = headerOf(root, fakes)
  assert.equal(header.props.homeHref, '/thue')
  assert.equal(header.props.logoSrc, '/images/rooms-folder-back.svg')
  assert.deepEqual(header.props.links, [{ label: 'Tổng quan', href: '/thue' }, { label: 'Hợp đồng', href: '/thue/hop-dong' }, { label: 'Hóa đơn', href: '/thue/hoa-don' }, { label: 'Thông báo', href: '/thue/thong-bao' }, { label: 'Yêu cầu', href: '/thue/yeu-cau' }, { label: 'Tài khoản', href: '/thue/tai-khoan' }, { label: 'Lịch hẹn xem phòng', href: '/toi' }])
  assert.equal(find(root, n => n.type === fakes.RoomsFooter), undefined)
  assert.equal(find(root, n => n.props?.className === 'layout-buildings'), undefined)
  const button = find(header.props.action, n => n.type === fakes.RoomsButton)
  assert.equal(button.type, fakes.RoomsButton)
  assert.equal(button.props.variant, 'outline')
  assert.equal(button.props.type, 'button')
  assert.equal(button.props.disabled, false)
  assert.equal(textOf(button.props.children), 'Đăng xuất')
  button.props.onClick()
  assert.deepEqual(calls, ['out'])
})

// FE-P3-01: contracts and vehicle lookup bring the Boss menu to 10 items; a manager gets the same menu minus
// "Nhân sự"/"Duyệt giá" (AUTH-06/UI-08 still guard the URLs directly, covered in cp1-routes.test.mjs).
test('Q2-A, FE-P3-01: StaffLayout menu follows role (manager: 10 minus Nhân sự/Duyệt giá), sign-out disabled while signing out, no footer', () => {
  const { exports, fakes } = loadLayout('../src/layouts/StaffLayout.tsx', {
    auth: { status: 'ready', user: { role: 'MANAGER', buildings: [] } },
    signOutState: { signOut() {}, signingOut: true },
  })
  const root = exports.StaffLayout()
  const header = headerOf(root, fakes)
  assert.equal(header.props.homeHref, '/ql')
  assert.deepEqual(header.props.links, [
    { label: 'Việc hôm nay', href: '/ql' },
    { label: 'Tòa nhà', href: '/ql/toa-nha' },
    { label: 'Phòng', href: '/ql/phong' },
    { label: 'Đơn giá', href: '/ql/don-gia' },
    { label: 'Lịch hẹn', href: '/ql/lich-hen' },
    { label: 'Hợp đồng', href: '/ql/hop-dong' },
    { label: 'Chốt chỉ số', href: '/ql/chi-so' },
    { label: 'Hóa đơn', href: '/ql/hoa-don' },
    { label: 'Tra cứu xe', href: '/ql/xe' },
    { label: 'Yêu cầu', href: '/ql/yeu-cau' },
    { label: 'Thông báo', href: '/ql/thong-bao' },
    { label: 'Báo cáo', href: '/ql/bao-cao' },
    { label: 'Tài khoản', href: '/ql/tai-khoan' },
  ])
  assert.equal(find(root, n => n.type === fakes.RoomsFooter), undefined)
  // FE-P4-08a: the header action is the staff bell (NOTI-11) followed by the sign-out button.
  const [bell, signOutButton] = header.props.action.props.children
  assert.equal(bell.type.name, 'NotificationBell')
  assert.equal(signOutButton.type, fakes.RoomsButton)
  assert.equal(signOutButton.props.disabled, true)
  assert.equal(signOutButton.props.type, 'button')
  assert.equal(textOf(signOutButton.props.children), 'Đăng xuất')
  assert.ok(find(find(root, n => n.type === 'main'), n => n.type === fakes.Outlet))
})

test('Q2-A, FE-P3-01, FE-P4-01: a Boss gets all 13 menu items, including Nhân sự, Duyệt giá and Giao dịch ngân hàng', () => {
  const { exports, fakes } = loadLayout('../src/layouts/StaffLayout.tsx', { auth: { status: 'ready', user: { role: 'BOSS', buildings: [] } } })
  const header = headerOf(exports.StaffLayout(), fakes)
  assert.deepEqual(header.props.links, [
    { label: 'Việc hôm nay', href: '/ql' },
    { label: 'Tòa nhà', href: '/ql/toa-nha' },
    { label: 'Nhân sự', href: '/ql/nhan-su' },
    { label: 'Phòng', href: '/ql/phong' },
    { label: 'Đơn giá', href: '/ql/don-gia' },
    { label: 'Duyệt giá', href: '/ql/duyet-gia' },
    { label: 'Lịch hẹn', href: '/ql/lich-hen' },
    { label: 'Hợp đồng', href: '/ql/hop-dong' },
    { label: 'Chốt chỉ số', href: '/ql/chi-so' },
    { label: 'Hóa đơn', href: '/ql/hoa-don' },
    { label: 'Giao dịch ngân hàng', href: '/ql/giao-dich' },
    { label: 'Tra cứu xe', href: '/ql/xe' },
    { label: 'Yêu cầu', href: '/ql/yeu-cau' },
    { label: 'Thông báo', href: '/ql/thong-bao' },
    { label: 'Báo cáo', href: '/ql/bao-cao' },
    { label: 'Nhật ký', href: '/ql/nhat-ky' },
    { label: 'Cài đặt', href: '/ql/cai-dat' },
    { label: 'Tài khoản', href: '/ql/tai-khoan' },
  ])
})

// FE-P2-03 (PLAN.md CP-2): the old read-only "Tòa đang quản lý: …" line and its bare <select> are gone;
// the pick is now delegated to BuildingSelectionProvider/BuildingSelector (their own behavior — manager
// placeholder, Boss "Tất cả tòa", no-building account — is tested directly, unfaked, in tests/p2/).
function staffMain(user) {
  const { exports, fakes } = loadLayout('../src/layouts/StaffLayout.tsx', { auth: { status: 'ready', user } })
  const root = exports.StaffLayout()
  return { root, fakes, main: find(root, n => n.type === 'main') }
}

test('Q5-A: StaffLayout no longer renders the old read-only building line or a bare <select>, for a manager with 2 buildings, a Boss, and an account with none', () => {
  for (const user of [
    { role: 'MANAGER', buildings: [{ id: 1, code: 'A01', name: 'Tòa Hà Đông' }, { id: 2, code: 'A02', name: 'Tòa Cầu Giấy' }] },
    { role: 'BOSS', buildings: [{ id: 1, code: 'A01', name: 'X' }, { id: 2, code: 'A02', name: 'Y' }, { id: 3, code: 'B01', name: 'Z' }] },
    { role: 'MANAGER', buildings: [] },
    { role: 'MANAGER' },
  ]) {
    const { root } = staffMain(user)
    assert.equal(find(root, n => n.type === 'p' && n.props?.className === 'layout-buildings'), undefined, JSON.stringify(user))
    assert.equal(find(root, n => n.type === 'select'), undefined, JSON.stringify(user))
  }
})

test('Q5-A: StaffLayout wraps BuildingSelector + Outlet in BuildingSelectionProvider inside <main>, regardless of role or building count', () => {
  for (const user of [
    { role: 'MANAGER', buildings: [{ id: 1, code: 'A01', name: 'Tòa Hà Đông' }, { id: 2, code: 'A02', name: 'Tòa Cầu Giấy' }] },
    { role: 'BOSS', buildings: [] },
    { role: 'MANAGER', buildings: [] },
  ]) {
    const { main, fakes } = staffMain(user)
    const provider = find(main, n => n.type === fakes.BuildingSelectionProvider)
    assert.ok(provider, JSON.stringify(user))
    assert.ok(find(provider, n => n.type === fakes.BuildingSelector), JSON.stringify(user))
    assert.ok(find(provider, n => n.type === fakes.Outlet), JSON.stringify(user))
  }
})

// useSignOut: only react state, react-router navigate and useAuth.logout are faked.
function loadSignOut() {
  const slots = []
  let cursor = 0
  const log = []
  let finishLogout
  const auth = { logout: () => { log.push('logout'); return new Promise(resolve => { finishLogout = resolve }) } }
  const modules = {
    react: { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v }] } },
    'react-router': { useNavigate: () => (to, options) => log.push(['navigate', to, options]) },
    '../../app/auth-context': { useAuth: () => auth },
  }
  const { useSignOut } = compile('../src/features/auth/useSignOut.ts', id => { if (id in modules) return modules[id]; throw new Error(`unexpected import ${id}`) })
  const render = () => { cursor = 0; return useSignOut() }
  return { render, log, finish: () => finishLogout() }
}

test('AUTH-06 (T2): useSignOut navigates to "/" (replace) BEFORE logging out, so the guard adds no ?next=', async () => {
  const { render, log, finish } = loadSignOut()
  const first = render()
  assert.equal(first.signingOut, false)
  const pending = first.signOut()
  assert.deepEqual(log, [['navigate', '/', { replace: true }], 'logout'])
  finish()
  await pending
})

test('T2: useSignOut ignores a second click while signing out, and reports signingOut=true after the first', async () => {
  const { render, log, finish } = loadSignOut()
  const pending = render().signOut()
  const second = render()
  assert.equal(second.signingOut, true)
  await second.signOut()
  assert.equal(log.filter(entry => entry === 'logout').length, 1)
  assert.equal(log.filter(entry => Array.isArray(entry)).length, 1)
  finish()
  await pending
})

function loadPage(file, user, extra = {}) {
  const SectionHeading = () => null
  const { t } = loadModule(draftFirst('src/shared/i18n/core.ts'))
  const modules = {
    'react/jsx-runtime': jsxRuntime,
    'react-router': { Link: () => null },
    '../../components': { SectionHeading },
    '../../app/auth-context': { useAuth: () => ({ user }) },
    '../../shared/i18n': { useI18n: () => ({ t: (key, params) => t(key, params, 'vi') }) },
    ...extra,
  }
  return { exports: compile(file, id => { if (id in modules) return modules[id]; throw new Error(`unexpected import ${id}`) }), SectionHeading, Link: modules['react-router'].Link }
}

test('FE-LOGIN-11: TenantHomePage "Tổng quan" greets by full name while the real overview is loading', async () => {
  const { TenantHomePage } = loadModule(draftFirst('src/pages/tenant/TenantHomePage.tsx'))
  const app = await mountContractPage(TenantHomePage, { path: '/thue', user: { id: 4, role: 'TENANT', fullName: 'Nguyễn Văn An' }, rules: [{ prefix: '/me/contracts', handler: () => new Promise(() => {}) }] })
  try {
    assert.deepEqual(domFind(app.container, n => n.tagName === 'H2').map(n => n.textContent), ['Tổng quan'])
    assert.deepEqual(domFind(app.container, n => n.tagName === 'P').map(n => n.textContent), ['Xin chào, Nguyễn Văn An'])
  } finally { await app.stop() }
})

// FE-LOGIN-11 (StaffHomePage) restored (owner's request, 2026-11-06): this draft makes StaffHomePage call
// useQuery()/getDashboard() (NOTI-06) and read useBuildingSelection(), so it can no longer be called as a plain
// function through the minimal stub-JSX loader above (no QueryClient in scope). Mounted instead with a real
// react-dom render inside QueryClientProvider + AuthContext.Provider + BuildingSelectionContext.Provider
// (MemoryRouter for its <Link>s), reusing tests/p2/public-dom.mjs's fake DOM / fetch harness. StaffHomePage,
// dashboard/api.ts, auth-context.ts and building-selection.ts all run unmodified; only globalThis.fetch and the
// DOM are faked. GET /dashboard is faked to never resolve so the page stays in its pending state (a Spinner,
// not a <p>), isolating exactly what the original assertion checked: the heading and the single greeting <p>
// (or none, with no user).
test('FE-LOGIN-11: StaffHomePage "Việc hôm nay" greets by full name; no greeting without a user', async () => {
  const nodeRequire = createRequire(import.meta.url)
  const React = nodeRequire('react')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { MemoryRouter } = nodeRequire('react-router')
  const { StaffHomePage } = loadModule(draftFirst('src/pages/staff/StaffHomePage.tsx'))
  const { AuthContext } = loadModule(draftFirst('src/app/auth-context.ts'))
  const { BuildingSelectionContext } = loadModule(draftFirst('src/features/buildings/building-selection.ts'))
  const selectionValue = { selectedBuildingId: 'all', setSelectedBuildingId: () => {} }

  async function renderWith(staffUser) {
    fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => new Promise(() => {}) }]) // never resolves: isolates the pending state
    const authValue = { status: 'ready', user: staffUser, login: async () => { throw new Error('unused in test') }, logout: async () => {}, refreshMe: async () => null, retry() {} }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 } } })
    return mount(
      React.createElement(QueryClientProvider, { client },
        React.createElement(AuthContext.Provider, { value: authValue },
          React.createElement(BuildingSelectionContext.Provider, { value: selectionValue },
            React.createElement(MemoryRouter, null, React.createElement(StaffHomePage))))))
  }

  const withUser = await renderWith({ fullName: 'Nguyễn Thu Hà' })
  await until(() => domFind(withUser.container, n => n.tagName === 'H2').some(n => n.textContent === 'Việc hôm nay'), 'staff heading with user')
  await until(() => domFind(withUser.container, n => n.tagName === 'P').some(n => n.textContent === 'Xin chào, Nguyễn Thu Hà'), 'staff greeting with user')
  assert.deepEqual(domFind(withUser.container, n => n.tagName === 'H2').map(n => n.textContent), ['Việc hôm nay'])
  assert.deepEqual(domFind(withUser.container, n => n.tagName === 'P').map(n => n.textContent), ['Xin chào, Nguyễn Thu Hà'])
  await withUser.stop()

  const anon = await renderWith(null)
  await until(() => domFind(anon.container, n => n.tagName === 'H2').some(n => n.textContent === 'Việc hôm nay'), 'staff heading without user')
  assert.deepEqual(domFind(anon.container, n => n.tagName === 'H2').map(n => n.textContent), ['Việc hôm nay'])
  assert.deepEqual(domFind(anon.container, n => n.tagName === 'P'), [])
  await anon.stop()
})

// FE-P2-14/A-2 (PLAN.md CP-2, this draft): PlaceholderPage no longer shows the "Trang đang được xây dựng" text
// itself — the route still points at it so routes.tsx stays unchanged, but it now only wraps the real home page
// (src/pages/public/PublicHomePage.tsx), which has its own test file (tests/p2/fe-p2-14-home.test.mjs) and is
// too real (useQuery, the kit, react-router Link) to render through this minimal stub-JSX loader. NotFoundPage
// is unchanged by this draft and keeps its own check.
test('Q4-A/A-2: PlaceholderPage renders PublicHomePage (the real "/" page); not-found uses the agreed wording and links back to "/"', () => {
  const PublicHomePage = () => null
  const placeholder = loadPage('../src/pages/public/PlaceholderPage.tsx', null, { './PublicHomePage': { PublicHomePage } })
  assert.equal(placeholder.exports.PlaceholderPage().type, PublicHomePage)
  const notFound = loadPage('../src/pages/public/NotFoundPage.tsx', null)
  const tree = notFound.exports.NotFoundPage()
  assert.equal(textOf(find(tree, n => n.type === notFound.SectionHeading)), 'Không tìm thấy trang')
  const link = find(tree, n => n.type === notFound.Link)
  assert.equal(link.props.to, '/')
  assert.equal(textOf(link), 'Về trang chủ')
})

// FE-P2-01 (CP-1): routes.tsx now carries the Phase 2 skeleton — 3 public pages (PublicRoomsPage,
// PublicBuildingPage, PublicRoomPage) replace the shared PlaceholderPage at /phong, and 7 staff pages
// (BuildingsPage, BuildingDetailPage, ManagersPage, RoomsPage, PricesPage, ApprovalsPage, ViewingsPage) are
// added under /ql, with nhan-su/duyet-gia nested behind a BOSS-only guard (AUTH-06, UI-08).
test('AUTH-06 / T3 / FE-P2-01: routes wire guards and layouts (tenant area TENANT only, staff area MANAGER+BOSS, Boss-only pages nested, 404 inside the public layout)', () => {
  const stub = name => ({ [name]: Object.assign(() => null, { displayName: name }) })
  const mods = {
    'react/jsx-runtime': jsxRuntime,
    '../layouts/PublicLayout': stub('PublicLayout'),
    '../layouts/TenantLayout': stub('TenantLayout'),
    '../layouts/StaffLayout': stub('StaffLayout'),
    '../pages/public/PlaceholderPage': stub('PlaceholderPage'),
    '../pages/public/PublicRoomsPage': stub('PublicRoomsPage'),
    '../pages/public/PublicBuildingPage': stub('PublicBuildingPage'),
    '../pages/public/PublicRoomPage': stub('PublicRoomPage'),
    '../pages/public/NotFoundPage': stub('NotFoundPage'),
    '../pages/tenant/TenantHomePage': stub('TenantHomePage'),
    '../pages/staff/StaffHomePage': stub('StaffHomePage'),
    '../pages/tenant/TenantAccountPage': stub('TenantAccountPage'),
    '../pages/staff/StaffAccountPage': stub('StaffAccountPage'),
    '../pages/staff/BuildingsPage': stub('BuildingsPage'),
    '../pages/staff/BuildingDetailPage': stub('BuildingDetailPage'),
    '../pages/staff/ManagersPage': stub('ManagersPage'),
    '../pages/staff/RoomsPage': stub('RoomsPage'),
    '../pages/staff/PricesPage': stub('PricesPage'),
    '../pages/staff/ApprovalsPage': stub('ApprovalsPage'),
    '../pages/staff/ViewingsPage': stub('ViewingsPage'),
    '../pages/staff/ContractsPage': stub('ContractsPage'),
    '../pages/staff/ContractCreatePage': stub('ContractCreatePage'),
    '../pages/staff/ContractDetailPage': stub('ContractDetailPage'),
    '../pages/staff/ContractPrintPage': stub('ContractPrintPage'),
    '../pages/staff/VehiclesPage': stub('VehiclesPage'),
    '../pages/staff/MetersPage': stub('MetersPage'),
    '../pages/staff/InvoicesPage': stub('InvoicesPage'),
    '../pages/staff/InvoiceDetailPage': stub('InvoiceDetailPage'),
    '../pages/OperationsPage': stub('OperationsPage'),
    '../pages/staff/RequestsPage': stub('RequestsPage'),
    '../pages/tenant/TenantInboxPage': stub('TenantInboxPage'),
    '../pages/tenant/TenantRequestsPage': stub('TenantRequestsPage'),
    '../pages/staff/ReportsPage': stub('ReportsPage'),
    '../pages/staff/AuditPage': stub('AuditPage'),
    '../pages/staff/SettingsPage': stub('SettingsPage'),
    '../pages/staff/AnnouncementsPage': stub('AnnouncementsPage'),
    '../pages/staff/RequestRenewalPage': stub('RequestRenewalPage'),
    '../pages/staff/BankTransactionsPage': stub('BankTransactionsPage'),
    '../pages/tenant/TenantContractsPage': stub('TenantContractsPage'),
    '../pages/tenant/TenantContractDetailPage': stub('TenantContractDetailPage'),
    '../pages/tenant/TenantContractPrintPage': stub('TenantContractPrintPage'),
    '../pages/tenant/TenantInvoicesPage': stub('TenantInvoicesPage'),
    '../pages/tenant/TenantInvoiceDetailPage': stub('TenantInvoiceDetailPage'),
    '../pages/public/LoginPage': stub('LoginPage'),
    '../pages/public/ChangePasswordPage': stub('ChangePasswordPage'),
    '../pages/public/ForgotPasswordPage': stub('ForgotPasswordPage'),
    '../layouts/GuestLayout': stub('GuestLayout'),
    '../pages/guest/GuestHomePage': stub('GuestHomePage'),
    '../pages/guest/GuestAccountPage': stub('GuestAccountPage'),
    '../pages/guest/GuestViewingPage': stub('GuestViewingPage'),
    '../pages/public/RegisterPage': stub('RegisterPage'),
    '../pages/public/VerifyEmailPage': stub('VerifyEmailPage'),
    './RequireAuth': { ...stub('RequireAuth'), ...stub('GuestOnly') },
  }
  const { routes } = compile('../src/app/routes.tsx', id => { if (id in mods) return mods[id]; throw new Error(`unexpected import ${id}`) })
  const [pub, tenantArea, staffArea] = routes
  assert.equal(routes.length, 4) // public, tenant, staff, then /toi (EX-2)
  assert.equal(pub.element.type, mods['../layouts/PublicLayout'].PublicLayout)
  const byPath = Object.fromEntries(pub.children.filter(r => r.path).map(r => [r.path, r.element.type]))
  assert.equal(byPath['/'], mods['../pages/public/PlaceholderPage'].PlaceholderPage)
  assert.equal(byPath['/phong'], mods['../pages/public/PublicRoomsPage'].PublicRoomsPage)
  assert.equal(byPath['/toa/:id'], mods['../pages/public/PublicBuildingPage'].PublicBuildingPage)
  assert.equal(byPath['/phong/:id'], mods['../pages/public/PublicRoomPage'].PublicRoomPage)
  assert.equal(byPath['*'], mods['../pages/public/NotFoundPage'].NotFoundPage)
  const RequireAuth = mods['./RequireAuth'].RequireAuth
  // T1 (CP-4): /dang-nhap sits under GuestOnly inside the public layout
  const guest = pub.children.find(r => r.element.type === mods['./RequireAuth'].GuestOnly)
  assert.equal(guest.children.length, 3) // /dang-nhap, /dang-ky, /xac-minh-email (EX-2)
  assert.equal(guest.children[0].path, '/dang-nhap')
  assert.equal(guest.children[0].element.type, mods['../pages/public/LoginPage'].LoginPage)
  // CP-5: /quen-mat-khau is public (no guard, A10); /doi-mat-khau needs a session of any role (AUTH-05)
  assert.equal(byPath['/quen-mat-khau'], mods['../pages/public/ForgotPasswordPage'].ForgotPasswordPage)
  const anyRole = pub.children.find(r => r.element.type === RequireAuth && r.element.props.allow === 'any')
  assert.equal(anyRole.children.length, 1)
  assert.equal(anyRole.children[0].path, '/doi-mat-khau')
  assert.equal(anyRole.children[0].element.type, mods['../pages/public/ChangePasswordPage'].ChangePasswordPage)
  assert.equal(tenantArea.path, '/thue')
  assert.equal(tenantArea.element.type, RequireAuth)
  assert.deepEqual(tenantArea.element.props.allow, ['TENANT'])
  assert.equal(tenantArea.children[0].element.type, mods['../layouts/TenantLayout'].TenantLayout)
  assert.equal(tenantArea.children[0].children[0].index, true)
  assert.equal(tenantArea.children[0].children[0].element.type, mods['../pages/tenant/TenantHomePage'].TenantHomePage)
  assert.equal(staffArea.path, '/ql')
  assert.equal(staffArea.element.type, RequireAuth)
  assert.deepEqual(staffArea.element.props.allow, ['MANAGER', 'BOSS'])
  assert.equal(staffArea.children[0].element.type, mods['../layouts/StaffLayout'].StaffLayout)
  const staffChildren = staffArea.children[0].children
  assert.equal(staffChildren[0].element.type, mods['../pages/staff/StaffHomePage'].StaffHomePage)
  const byStaffPath = Object.fromEntries(staffChildren.filter(r => r.path).map(r => [r.path, r.element.type]))
  assert.equal(byStaffPath['toa-nha'], mods['../pages/staff/BuildingsPage'].BuildingsPage)
  assert.equal(byStaffPath['toa-nha/:id'], mods['../pages/staff/BuildingDetailPage'].BuildingDetailPage)
  assert.equal(byStaffPath['phong'], mods['../pages/staff/RoomsPage'].RoomsPage)
  assert.equal(byStaffPath['don-gia'], mods['../pages/staff/PricesPage'].PricesPage)
  assert.equal(byStaffPath['lich-hen'], mods['../pages/staff/ViewingsPage'].ViewingsPage)
  // AUTH-06/UI-08: nhan-su and duyet-gia must redirect a manager who types the URL directly, not just hide the menu
  const bossGroup = staffChildren.find(r => r.element?.type === RequireAuth)
  assert.ok(bossGroup, 'expected a nested RequireAuth group for Boss-only staff pages')
  assert.deepEqual(bossGroup.element.props.allow, ['BOSS'])
  const byBossPath = Object.fromEntries(bossGroup.children.map(r => [r.path, r.element.type]))
  assert.equal(byBossPath['nhan-su'], mods['../pages/staff/ManagersPage'].ManagersPage)
  assert.equal(byBossPath['duyet-gia'], mods['../pages/staff/ApprovalsPage'].ApprovalsPage)
  // CP-6: the two account pages live inside their own role area and layout (AUTH-06, AUTH-09)
  const tenantAccount = tenantArea.children[0].children.find(r => r.path === 'tai-khoan')
  const staffAccount = staffChildren.find(r => r.path === 'tai-khoan')
  assert.equal(tenantAccount.element.type, mods['../pages/tenant/TenantAccountPage'].TenantAccountPage)
  assert.equal(staffAccount.element.type, mods['../pages/staff/StaffAccountPage'].StaffAccountPage)
})
