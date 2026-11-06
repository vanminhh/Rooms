import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { draftFirst } from '../draft-root.mjs'

// CP-2 (FE-P2-02/03): status-labels, StaffLayout menu/building-selector wiring, and the building-selection
// logic (BuildingSelector, BuildingSelectionProvider, building-selection.ts). Spec: PLAN.md CP-2,
// ROOM-05/VIEW-10/PRC-10/KIT-06 (labels), SCOPE-02/AUTH-08 (scope), UI-08 (a11y).
// Outside edges faked: react, react-router, the kit, useAuth. status-labels.ts and building-selection.ts
// have no outside deps and run fully unmodified; BuildingSelector/BuildingSelectionProvider run unmodified
// too, wired to a real (unmodified) building-selection.ts so the sessionStorage/resolveSelection logic is
// genuinely exercised, not mocked.
// Mirrored from the main copy (PLAN.md CP-6, the P2-8a lesson): `read` resolves draft-first / main-fallback via
// draft-root.mjs instead of a literal relative path (none of these files are touched by this draft).
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

// ================= status-labels.ts (ROOM-05/KIT-06, VIEW-10, PRC-10) =================
const statusLabels = compile('../../src/shared/status-labels.ts', id => { throw new Error(`unexpected import ${id}`) })

test('ROOM-05, KIT-06: roomStatusLabels maps the 4 derived statuses to the kit\'s exact label + StatusBadge tone', () => {
  assert.deepEqual(statusLabels.roomStatusLabels, {
    'Trống': { label: 'Trống', tone: 'available' },
    'Đã cọc': { label: 'Đã cọc', tone: 'reserved' },
    'Đang thuê': { label: 'Đang thuê', tone: 'occupied' },
    'Bảo trì': { label: 'Bảo trì', tone: 'maintenance' },
  })
})

test('VIEW-10: viewingStatusLabels has the 5 exact Vietnamese labels', () => {
  assert.deepEqual(statusLabels.viewingStatusLabels, {
    NEW: 'Mới', CONFIRMED: 'Đã xác nhận', WON: 'Đã chốt', LOST: 'Không thành', CANCELLED: 'Đã hủy',
  })
})

test('PRC-10: approvalStatusLabels has the 4 exact labels, plus the derived "Quá hạn" (PRC-07) kept separate', () => {
  assert.deepEqual(statusLabels.approvalStatusLabels, {
    PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', SUPERSEDED: 'Đã thay thế',
  })
  assert.deepEqual(statusLabels.derivedApprovalLabels, { expired: 'Quá hạn' })
})

// ================= FE-P2-02: StaffLayout menu role filter (loaded standalone, not via auth-guards.test.mjs) =================
function loadStaffLayout(user) {
  const navigations = []
  const fakes = { Outlet: () => null, RoomsHeader: () => null, RoomsButton: () => null, BuildingSelector: () => null, BuildingSelectionProvider: () => null }
  const modules = {
    'react/jsx-runtime': jsxRuntime,
    'react-router': { Outlet: fakes.Outlet, useNavigate: () => to => navigations.push(to) },
    '../components': fakes,
    '../app/auth-context': { useAuth: () => ({ user }) },
    '../features/buildings/BuildingSelector': { BuildingSelector: fakes.BuildingSelector },
    '../features/buildings/BuildingSelectionProvider': { BuildingSelectionProvider: fakes.BuildingSelectionProvider },
    '../features/auth/useSignOut': { useSignOut: () => ({ signOut() {}, signingOut: false }) },
    './internal-links': { handleInternalLinkClick: () => {} },
    './layouts.css': {},
  }
  const { StaffLayout } = compile('../../src/layouts/StaffLayout.tsx', id => { if (id in modules) return modules[id]; throw new Error(`unexpected import ${id}`) })
  const header = find(StaffLayout(), n => n.type === fakes.RoomsHeader)
  return header.props.links
}

const BOSS_MENU = [
  { label: 'Việc hôm nay', href: '/ql' },
  { label: 'Tòa nhà', href: '/ql/toa-nha' },
  { label: 'Nhân sự', href: '/ql/nhan-su' },
  { label: 'Phòng', href: '/ql/phong' },
  { label: 'Đơn giá', href: '/ql/don-gia' },
  { label: 'Duyệt giá', href: '/ql/duyet-gia' },
  { label: 'Lịch hẹn', href: '/ql/lich-hen' },
  { label: 'Tài khoản', href: '/ql/tai-khoan' },
]
const MANAGER_MENU = BOSS_MENU.filter(item => item.label !== 'Nhân sự' && item.label !== 'Duyệt giá')

test('FE-P2-02: Boss sees exactly 8 menu items in the PLAN.md order', () => {
  assert.deepEqual(loadStaffLayout({ role: 'BOSS', buildings: [] }), BOSS_MENU)
  assert.equal(BOSS_MENU.length, 8)
})

test('FE-P2-02: a manager sees the same 8 minus "Nhân sự" and "Duyệt giá" (6 items)', () => {
  assert.deepEqual(loadStaffLayout({ role: 'MANAGER', buildings: [] }), MANAGER_MENU)
  assert.equal(MANAGER_MENU.length, 6)
  assert.ok(!MANAGER_MENU.some(item => item.label === 'Nhân sự' || item.label === 'Duyệt giá'))
})

// ================= building-selection.ts: resolveSelection + sessionStorage (SCOPE-02, AUTH-08) =================
function fakeSessionStorage() {
  let store = {}
  return {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value) },
    clear: () => { store = {} },
  }
}

function compileBuildingSelection() {
  const reactFake = { createContext: value => ({ _default: value, Provider: () => null }), useContext: () => { throw new Error('useContext not exercised here') } }
  return compile('../../src/features/buildings/building-selection.ts', id => { if (id === 'react') return reactFake; throw new Error(`unexpected import ${id}`) })
}

test('SCOPE-02: resolveSelection always gives a Boss "all", never null, regardless of buildings or a manager\'s stored pick', () => {
  const { resolveSelection } = compileBuildingSelection()
  assert.equal(resolveSelection({ id: 1, role: 'BOSS', buildings: [] }, null), 'all')
  assert.equal(resolveSelection({ id: 1, role: 'BOSS', buildings: [{ id: 5, code: 'A', name: 'X' }] }, null), 'all')
  assert.equal(resolveSelection({ id: 1, role: 'BOSS' }, { userId: 1, value: 7 }), 'all')
})

test('SCOPE-02: a manager with exactly 1 building defaults to it; 0 or 2+ default to null (not auto-picked)', () => {
  const { resolveSelection } = compileBuildingSelection()
  assert.equal(resolveSelection({ id: 1, role: 'MANAGER', buildings: [] }, null), null)
  assert.equal(resolveSelection({ id: 1, role: 'MANAGER', buildings: [{ id: 9, code: 'A', name: 'X' }] }, null), 9)
  assert.equal(resolveSelection({ id: 1, role: 'MANAGER', buildings: [{ id: 9, code: 'A', name: 'X' }, { id: 10, code: 'B', name: 'Y' }] }, null), null)
})

test('AUTH-08: a manager\'s stored pick survives a refresh of the same account while the building stays in scope', () => {
  const { resolveSelection } = compileBuildingSelection()
  const user = { id: 1, role: 'MANAGER', buildings: [{ id: 9, code: 'A', name: 'X' }, { id: 10, code: 'B', name: 'Y' }] }
  assert.equal(resolveSelection(user, { userId: 1, value: 10 }), 10)
})

test('AUTH-08: a stored pick is dropped when the building left the manager\'s scope (lock/reassign) or the account changed', () => {
  const { resolveSelection } = compileBuildingSelection()
  const user = { id: 1, role: 'MANAGER', buildings: [{ id: 9, code: 'A', name: 'X' }, { id: 10, code: 'B', name: 'Y' }] }
  // building 99 no longer in scope -> falls back to the 0/2+ default (null here, 2 buildings)
  assert.equal(resolveSelection(user, { userId: 1, value: 99 }), null)
  // stored by a different account (userId 2) is never inherited by account 1 (switch tài khoản)
  assert.equal(resolveSelection(user, { userId: 2, value: 9 }), null)
})

test('readStoredChoice/writeStoredChoice round-trip through sessionStorage, tagged with the user id, and fail safe on corrupt data', () => {
  globalThis.sessionStorage = fakeSessionStorage()
  const { readStoredChoice, writeStoredChoice } = compileBuildingSelection()
  assert.equal(readStoredChoice(), null)
  writeStoredChoice({ userId: 3, value: 42 })
  assert.deepEqual(readStoredChoice(), { userId: 3, value: 42 })
  globalThis.sessionStorage.setItem('rooms.buildingSelection', '{not json')
  assert.equal(readStoredChoice(), null, 'corrupt storage must fall back to null, not throw')
  delete globalThis.sessionStorage
})

// ================= BuildingSelectionProvider: integrates resolveSelection + sessionStorage with React state =================
function makeReactStateFake() {
  const slots = []
  let cursor = 0
  return {
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v }] },
      useCallback(fn) { return fn },
      useMemo(fn) { return fn() },
    },
    render(fn) { cursor = 0; return fn() },
  }
}

function loadProvider(user) {
  const buildingSelection = compileBuildingSelection()
  const { react, render } = makeReactStateFake()
  const modules = {
    'react/jsx-runtime': jsxRuntime,
    react,
    '../../app/auth-context': { useAuth: () => ({ user }) },
    './building-selection': buildingSelection,
  }
  const { BuildingSelectionProvider } = compile('../../src/features/buildings/BuildingSelectionProvider.tsx', id => { if (id in modules) return modules[id]; throw new Error(`unexpected import ${id}`) })
  return { render: () => render(() => BuildingSelectionProvider({ children: null })) }
}

test('SCOPE-02: BuildingSelectionProvider exposes the resolved selection and lets a manager set a building in scope, persisted to sessionStorage', () => {
  globalThis.sessionStorage = fakeSessionStorage()
  const user = { id: 1, role: 'MANAGER', buildings: [{ id: 9, code: 'A', name: 'X' }, { id: 10, code: 'B', name: 'Y' }] }
  const { render } = loadProvider(user)
  let value = render().props.value
  assert.equal(value.selectedBuildingId, null, 'manager with 2 buildings and no stored pick starts at null (Q-FE8A-4)')
  value.setSelectedBuildingId(10)
  value = render().props.value
  assert.equal(value.selectedBuildingId, 10)
  assert.deepEqual(JSON.parse(globalThis.sessionStorage.getItem('rooms.buildingSelection')), { userId: 1, value: 10 })
  delete globalThis.sessionStorage
})

test('SCOPE-02: a Boss\'s provider value is always "all", and setSelectedBuildingId("all") is accepted', () => {
  globalThis.sessionStorage = fakeSessionStorage()
  const user = { id: 2, role: 'BOSS', buildings: [{ id: 1, code: 'A', name: 'X' }] }
  const { render } = loadProvider(user)
  assert.equal(render().props.value.selectedBuildingId, 'all')
  render().props.value.setSelectedBuildingId('all')
  assert.equal(render().props.value.selectedBuildingId, 'all')
  delete globalThis.sessionStorage
})

// ================= BuildingSelector.tsx: placeholder/option rendering (FE-P2-03, SCOPE-02, UI-08) =================
function loadSelector({ user, selectedBuildingId, setSelectedBuildingId = () => {} }) {
  const modules = {
    'react/jsx-runtime': jsxRuntime,
    react: { useId: () => 'bld-select' },
    '../../app/auth-context': { useAuth: () => ({ user }) },
    './building-selection': { useBuildingSelection: () => ({ selectedBuildingId, setSelectedBuildingId }) },
  }
  const { BuildingSelector } = compile('../../src/features/buildings/BuildingSelector.tsx', id => { if (id in modules) return modules[id]; throw new Error(`unexpected import ${id}`) })
  return BuildingSelector()
}

test('UI-08: the select\'s id and the label\'s htmlFor match (useId), so the label is reachable from the control', () => {
  const tree = loadSelector({ user: { role: 'BOSS', buildings: [] }, selectedBuildingId: 'all' })
  const label = find(tree, n => n.type === 'label')
  const select = find(tree, n => n.type === 'select')
  assert.equal(label.props.htmlFor, select.props.id)
  assert.equal(select.props.id, 'bld-select')
})

test('FE-P2-03: a manager with 2 buildings and no pick gets a disabled "Chọn tòa" placeholder (value=\'\'), control itself enabled, does not block', () => {
  const user = { role: 'MANAGER', buildings: [{ id: 1, code: 'A01', name: 'Tòa Hà Đông' }, { id: 2, code: 'A02', name: 'Tòa Cầu Giấy' }] }
  const tree = loadSelector({ user, selectedBuildingId: null })
  const select = find(tree, n => n.type === 'select')
  assert.equal(select.props.disabled, false, 'null must not disable/block the control (Q-FE8A-4)')
  assert.equal(select.props.value, '')
  const options = findAll(select, n => n.type === 'option')
  const placeholder = options.find(o => textOf(o) === 'Chọn tòa')
  assert.ok(placeholder, 'expected a "Chọn tòa" placeholder option')
  assert.equal(placeholder.props.value, '')
  assert.equal(placeholder.props.disabled, true)
  assert.deepEqual(options.map(o => o.props.value).filter(v => v !== ''), [1, 2])
})

test('FE-P2-03: a Boss gets a "Tất cả tòa" option with value=\'all\', selected by default', () => {
  const user = { role: 'BOSS', buildings: [{ id: 1, code: 'A01', name: 'X' }, { id: 2, code: 'A02', name: 'Y' }] }
  const tree = loadSelector({ user, selectedBuildingId: 'all' })
  const select = find(tree, n => n.type === 'select')
  assert.equal(select.props.value, 'all')
  assert.equal(select.props.disabled, false)
  const all = findAll(select, n => n.type === 'option').find(o => o.props.value === 'all')
  assert.ok(all, 'expected a "Tất cả tòa" option with value="all"')
  assert.equal(textOf(all), 'Tất cả tòa')
})

test('FE-P2-03: an account with no building gets a disabled control showing "Chưa được giao tòa nào"', () => {
  const user = { role: 'MANAGER', buildings: [] }
  const tree = loadSelector({ user, selectedBuildingId: null })
  const select = find(tree, n => n.type === 'select')
  assert.equal(select.props.disabled, true)
  const options = findAll(select, n => n.type === 'option')
  assert.equal(options.length, 1)
  assert.equal(textOf(options[0]), 'Chưa được giao tòa nào')
})

test('FE-P2-03: picking a building calls setSelectedBuildingId with a number, picking "Tất cả tòa" passes the string \'all\'', () => {
  const calls = []
  const user = { role: 'BOSS', buildings: [{ id: 7, code: 'A07', name: 'X' }] }
  const tree = loadSelector({ user, selectedBuildingId: 'all', setSelectedBuildingId: v => calls.push(v) })
  const select = find(tree, n => n.type === 'select')
  select.props.onChange({ target: { value: '7' } })
  select.props.onChange({ target: { value: 'all' } })
  assert.deepEqual(calls, [7, 'all'])
})
