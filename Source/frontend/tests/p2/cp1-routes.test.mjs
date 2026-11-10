import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { draftFirst } from '../draft-root.mjs'

// CP-1 (FE-P2-01): route skeleton + placeholders + role guard. Spec: AUTH-05/06, UI-01/08, UI-03 (PLAN.md CP-1).
// Outside edges faked: react/jsx-runtime and every imported page/layout/kit module. The files under test
// (routes.tsx and the remaining placeholder pages) run unmodified, transpiled from source.
// Mirrored from the main copy (PLAN.md CP-6, the P2-8a lesson): `read` resolves draft-first / main-fallback via
// draft-root.mjs instead of a literal relative path.
const read = path => readFileSync(draftFirst(path.replace(/^(\.\.\/)+/, '')), 'utf8')

function compile(path, requireModule) {
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  Function('require', 'exports', code)(requireModule, exports)
  return exports
}

const jsxRuntime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' }
function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (!node || typeof node !== 'object') return [node]
  const { children } = node.props ?? {}
  return [node, ...(children === undefined ? [] : flatten(children))]
}
const textOf = node => Array.isArray(node) ? node.map(textOf).join('') : node && typeof node === 'object' ? textOf(node.props?.children) : node == null || node === false ? '' : String(node)
const find = (root, predicate) => flatten(root).find(n => n && typeof n === 'object' && predicate(n))
const findAll = (root, predicate) => flatten(root).filter(n => n && typeof n === 'object' && predicate(n))

// ---------------- UI-01/UI-03: the 3 public pages from CP-1 (/phong, /toa/:id, /phong/:id) ----------------
// PLAN.md CP-6 "Test cũ phải sửa": these 3 pages graduated from the shared "Đang làm" placeholder to real pages
// built by this very draft (FE-P2-15/16/17: PublicRoomsPage, PublicBuildingPage, PublicRoomPage) — exactly the
// same reasoning that already removed BuildingsPage/BuildingDetailPage/ManagersPage/RoomsPage from
// `staffPlaceholderPages` below. They now import react-query/react-router/features/public/* that this minimal
// CP-1 stub loader cannot satisfy; their real content is covered by fe-p2-15-search.test.mjs,
// fe-p2-16-detail.test.mjs and fe-p2-17-viewing-form.test.mjs instead. No placeholder pages remain to check
// here, so the old "each page has only Đang làm" test for this trio is removed rather than left empty.

// ---------------- UI-01/UI-03: no staff page is still a placeholder ----------------
// BuildingsPage/BuildingDetailPage (CP-5), ManagersPage (CP-6), RoomsPage (CP-7), PricesPage (P2-8b CP-3,
// FE-P2-10), ApprovalsPage (P2-8b CP-4, FE-P2-11) and now ViewingsPage (P2-8b CP-6, FE-P2-12, this draft)
// graduated from placeholder to real pages (PLAN.md §1: "Các route chưa thuộc phần 8a hiện đúng trang riêng
// với 'Đang làm'" — none of them is a placeholder by design any more). Their real content is covered by
// cp5-buildings-services.test.mjs, cp6-managers.test.mjs, cp7-rooms.test.mjs, fe10-rate-plans.test.mjs,
// fe11-approvals.test.mjs and (for ViewingsPage) fe12-viewings-page.test.mjs instead. There is no staff page
// left for this minimal CP-1 stub loader to check as "still just Đang làm" (the loader cannot satisfy the
// react-query/router/auth-context/building-selection imports those real pages need), so the test block that
// used to iterate `staffPlaceholderPages` (last entry: ViewingsPage) is removed rather than left to loop over
// an empty list, which would be an assertion-free no-op.

// ---------------- routes.tsx: 10 dedicated new routes, each its own component ----------------
function compileRoutes() {
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
    '../pages/public/LoginPage': stub('LoginPage'),
    '../pages/public/ChangePasswordPage': stub('ChangePasswordPage'),
    '../pages/public/ForgotPasswordPage': stub('ForgotPasswordPage'),
    './RequireAuth': { ...stub('RequireAuth'), ...stub('GuestOnly') },
  }
  const { routes } = compile('../../src/app/routes.tsx', id => { if (id in mods) return mods[id]; throw new Error(`unexpected import ${id}`) })
  return { routes, mods }
}

test('AUTH-05/06, UI-01/08: the 10 new Phase 2 routes each render their own distinct page', () => {
  const { routes, mods } = compileRoutes()
  const [pub, , staffArea] = routes
  const byPath = Object.fromEntries(pub.children.filter(r => r.path).map(r => [r.path, r.element.type]))
  const staffChildren = staffArea.children[0].children
  const byStaffPath = Object.fromEntries(staffChildren.filter(r => r.path).map(r => [r.path, r.element.type]))
  const bossGroup = staffChildren.find(r => r.element?.type === mods['./RequireAuth'].RequireAuth)
  const byBossPath = Object.fromEntries(bossGroup.children.map(r => [r.path, r.element.type]))

  const routeMap = {
    '/phong': byPath['/phong'],
    '/toa/:id': byPath['/toa/:id'],
    '/phong/:id': byPath['/phong/:id'],
    'toa-nha': byStaffPath['toa-nha'],
    'toa-nha/:id': byStaffPath['toa-nha/:id'],
    'phong': byStaffPath['phong'],
    'don-gia': byStaffPath['don-gia'],
    'lich-hen': byStaffPath['lich-hen'],
    'nhan-su': byBossPath['nhan-su'],
    'duyet-gia': byBossPath['duyet-gia'],
  }
  const entries = Object.entries(routeMap)
  assert.equal(entries.length, 10, 'expected exactly the 10 new Phase 2 routes from PLAN.md CP-1')
  for (const [path, type] of entries) assert.ok(type, `route ${path} must have an element`)
  assert.equal(new Set(entries.map(([, type]) => type)).size, 10, 'each of the 10 routes must render its own distinct page, not a shared placeholder')
})

test('AUTH-06: the old auth/account routes still work unchanged (/dang-nhap, /quen-mat-khau, /doi-mat-khau, tai-khoan)', () => {
  const { routes, mods } = compileRoutes()
  const [pub, tenantArea, staffArea] = routes
  const guest = pub.children.find(r => r.element.type === mods['./RequireAuth'].GuestOnly)
  assert.equal(guest.children[0].element.type, mods['../pages/public/LoginPage'].LoginPage)
  const byPath = Object.fromEntries(pub.children.filter(r => r.path).map(r => [r.path, r.element.type]))
  assert.equal(byPath['/quen-mat-khau'], mods['../pages/public/ForgotPasswordPage'].ForgotPasswordPage)
  const anyRole = pub.children.find(r => r.element.type === mods['./RequireAuth'].RequireAuth && r.element.props.allow === 'any')
  assert.equal(anyRole.children[0].element.type, mods['../pages/public/ChangePasswordPage'].ChangePasswordPage)
  const tenantAccount = tenantArea.children[0].children.find(r => r.path === 'tai-khoan')
  assert.equal(tenantAccount.element.type, mods['../pages/tenant/TenantAccountPage'].TenantAccountPage)
  const staffAccount = staffArea.children[0].children.find(r => r.path === 'tai-khoan')
  assert.equal(staffAccount.element.type, mods['../pages/staff/StaffAccountPage'].StaffAccountPage)
})

// ---------------- AUTH-05/06, UI-08: manager typing the Boss-only URL is redirected, not just hidden from the menu ----------------
// guards.ts/RequireAuth.tsx are the real, unchanged implementation (outside edge of this checkpoint, already
// covered on their own in auth-guards.test.mjs); here they are combined with the draft's routes.tsx wiring to
// prove the actual guard behavior for a manager who opens /ql/nhan-su or /ql/duyet-gia directly by URL.
const guards = compile('../../src/app/guards.ts', id => { throw new Error(`unexpected import ${id}`) })

test('AUTH-06, UI-08: routes.tsx nests nhan-su/duyet-gia behind allow=["BOSS"], and guardRedirect sends a manager back to /ql while letting a Boss through', () => {
  const { routes, mods } = compileRoutes()
  const staffArea = routes[2]
  const staffChildren = staffArea.children[0].children
  const bossGroup = staffChildren.find(r => r.element?.type === mods['./RequireAuth'].RequireAuth)
  assert.deepEqual(bossGroup.element.props.allow, ['BOSS'])

  const manager = { role: 'MANAGER', mustChangePassword: false }
  const boss = { role: 'BOSS', mustChangePassword: false }
  for (const path of ['/ql/nhan-su', '/ql/duyet-gia']) {
    assert.equal(guards.guardRedirect(manager, { pathname: path, search: '' }, bossGroup.element.props.allow), '/ql', `manager hitting ${path} directly must be redirected, not just hidden from the menu`)
    assert.equal(guards.guardRedirect(boss, { pathname: path, search: '' }, bossGroup.element.props.allow), null, `Boss must be let through ${path}`)
  }
})
