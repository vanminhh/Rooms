import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

// CP-7 (FE-P2-12, PLAN §4 CP-7): src/features/dashboard/api.ts (new), src/pages/staff/StaffHomePage.tsx (sửa).
// Spec/PLAN: NOTI-06, VIEW-07, PRC-11, Q-P6-2, FE8B-6, UI-02, UI-03, UI-09; chữ UI §2.5 của /ql.
//
// Outside edges faked: globalThis.fetch (network) and the minimal fake DOM below (Node has none; no jsdom
// installed), same shape as cp5/cp6/cp7. Every module under test (StaffHomePage, dashboard/api.ts,
// shared/{api,formatters}.ts, features/buildings/building-selection.ts, app/auth-context.ts) is transpiled
// and run unmodified, mounted with real react-dom/client, real @tanstack/react-query and the real
// react-router (MemoryRouter). useAuth()/useBuildingSelection() are real hooks fed through
// AuthContext.Provider / BuildingSelectionContext.Provider fixtures (fixture values, not mocks of the unit
// under test).

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = existsSync(draftSrcRoot) ? draftSrcRoot : resolve(draftRoot, '..', '..', 'src')
const sourceRoot = existsSync(draftSrcRoot) ? draftSrcRoot : mainSrcRoot

// ---------- minimal real DOM (same shape as cp7-rooms.test.mjs) ----------
class FakeNode {
  constructor(nodeType, nodeName, doc) { this.nodeType = nodeType; this.nodeName = nodeName; this.ownerDocument = doc; this.parentNode = null; this.childNodes = [] }
  get firstChild() { return this.childNodes[0] ?? null }
  appendChild(child) { child.parentNode?.removeChild(child); child.parentNode = this; this.childNodes.push(child); return child }
  insertBefore(child, ref) {
    if (!ref) return this.appendChild(child)
    child.parentNode?.removeChild(child)
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, child)
    child.parentNode = this
    return child
  }
  removeChild(child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; return child }
  contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false }
  addEventListener() {}
  removeEventListener() {}
}
class FakeText extends FakeNode {
  constructor(text, doc) { super(3, '#text', doc); this.nodeValue = text }
  get textContent() { return this.nodeValue }
  set textContent(v) { this.nodeValue = v }
}
class FakeElement extends FakeNode {
  constructor(tag, doc) {
    super(1, tag.toUpperCase(), doc)
    this.tagName = tag.toUpperCase(); this.attributes = {}; this.listeners = []; this.namespaceURI = 'http://www.w3.org/1999/xhtml'
    this.style = { setProperty() {}, removeProperty() {} }
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1) }
  setAttribute(k, v) { this.attributes[k] = String(v) }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null }
  hasAttribute(k) { return k in this.attributes }
  removeAttribute(k) { delete this.attributes[k] }
  addEventListener(type, listener, options) { this.listeners.push({ type, listener, capture: options === true || options?.capture === true }) }
  removeEventListener(type, listener) { this.listeners = this.listeners.filter(l => !(l.type === type && l.listener === listener)) }
  focus() {}
  matches() { return false }
  closest() { return null }
  querySelectorAll(selector) {
    const tag = selector.toUpperCase()
    const out = []
    const walk = n => { n.childNodes.forEach(c => { if (c.nodeType === 1) { if (c.tagName === tag) out.push(c); walk(c) } }) }
    walk(this)
    return out
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
  get textContent() { return this.childNodes.map(n => n.textContent ?? '').join('') }
  set textContent(v) { this.childNodes.forEach(n => { n.parentNode = null }); this.childNodes = []; if (v) this.appendChild(new FakeText(String(v), this.ownerDocument)) }
  get disabled() { return this._disabled ?? false }
  set disabled(v) { this._disabled = !!v }
}
const fakeDocument = {
  nodeType: 9, nodeName: '#document', childNodes: [], activeElement: null, listeners: [],
  createElement(tag) { return new FakeElement(tag, fakeDocument) },
  createElementNS(_ns, tag) { return new FakeElement(tag, fakeDocument) },
  createTextNode(text) { return new FakeText(String(text), fakeDocument) },
  addEventListener() {}, removeEventListener() {},
  oninput: null,
}
fakeDocument.body = new FakeElement('body', fakeDocument)
fakeDocument.documentElement = new FakeElement('html', fakeDocument)
fakeDocument.documentElement.appendChild(fakeDocument.body)
fakeDocument.activeElement = fakeDocument.body
fakeDocument.defaultView = null
class FakeIFrame {}
const fakeWindow = {
  document: fakeDocument, event: undefined, HTMLIFrameElement: FakeIFrame, HTMLElement: FakeElement, Element: FakeElement, Node: FakeNode,
  addEventListener() {}, removeEventListener() {},
  location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '', hash: '' },
  history: { state: null, pushState() {}, replaceState() {}, scrollRestoration: 'auto' },
  getComputedStyle: () => ({}), matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
}
fakeDocument.defaultView = fakeWindow
Object.assign(globalThis, { window: fakeWindow, document: fakeDocument, HTMLElement: FakeElement, Element: FakeElement, Node: FakeNode, HTMLIFrameElement: FakeIFrame })

// ---------- TS/TSX module loader: relative imports missing from the draft fall back to main src/ ----------
import { createRequire } from 'node:module'
import { existsSync, statSync } from 'node:fs'
const nodeRequire = createRequire(import.meta.url)
const cache = new Map()
function compileFile(absPath) {
  const code = ts.transpileModule(readFileSync(absPath, 'utf8'), {
    fileName: absPath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const mod = { exports: {} }
  Function('require', 'exports', 'module', code)(id => requireFrom(dirname(absPath), id), mod.exports, mod)
  return mod.exports
}
function load(absPath) {
  if (cache.has(absPath)) return cache.get(absPath)
  const exp = compileFile(absPath)
  cache.set(absPath, exp)
  return exp
}
function resolveFile(candidate) {
  for (const ext of ['.ts', '.tsx']) if (existsSync(candidate + ext)) return candidate + ext
  for (const ext of ['/index.ts', '/index.tsx']) if (existsSync(candidate + ext)) return candidate + ext
  if (existsSync(candidate)) {
    try { if (statSync(candidate).isFile()) return candidate } catch { /* not a plain file */ }
  }
  return null
}
function resolveRelative(dir, id) {
  const candidate = resolve(dir, id)
  const draftCandidate = candidate.startsWith(mainSrcRoot) ? candidate.replace(mainSrcRoot, draftSrcRoot) : candidate
  const draftFile = resolveFile(draftCandidate)
  if (draftFile) return draftFile
  const mainCandidate = candidate.startsWith(draftSrcRoot) ? candidate.replace(draftSrcRoot, mainSrcRoot) : candidate
  const mainFile = resolveFile(mainCandidate)
  if (mainFile) return mainFile
  throw new Error(`cannot resolve ${id} from ${dir}`)
}
function requireFrom(dir, id) {
  if (!id.startsWith('.')) return nodeRequire(id)
  if (id.endsWith('.css')) return {}
  return load(resolveRelative(dir, id))
}

const React = nodeRequire('react')
const { createRoot } = nodeRequire('react-dom/client')
const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
const { MemoryRouter } = nodeRequire('react-router')

const { StaffHomePage } = load(resolve(sourceRoot, 'pages/staff/StaffHomePage.tsx'))
const { BuildingSelectionContext } = load(resolve(sourceRoot, 'features/buildings/building-selection.ts'))
const { AuthContext } = load(resolve(sourceRoot, 'app/auth-context.ts'))

// ---------- DOM query / event helpers (same style as the other cp*.test.mjs files) ----------
const wait = ms => new Promise(r => setTimeout(r, ms))
async function until(cond, what, ms = 3000) {
  const start = Date.now()
  while (Date.now() - start < ms) { if (cond()) return; await wait(5) }
  throw new Error(`timeout waiting for ${what}`)
}
const walkTree = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
const find = (root, pred) => walkTree(root).filter(n => n.nodeType === 1 && pred(n))
const buttons = container => find(container, n => n.tagName === 'BUTTON')
const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
const links = container => find(container, n => n.tagName === 'A')

function dispatch(container, target, type, extra = {}) {
  const rootListeners = container.listeners.filter(l => l.type === type && !l.capture)
  assert.ok(rootListeners.length > 0, `no root listener for ${type}`)
  const event = { type, target, srcElement: target, currentTarget: container, bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...extra }
  rootListeners.forEach(l => l.listener(event))
}

async function mount(element) {
  const container = fakeDocument.createElement('div')
  fakeDocument.body.appendChild(container)
  const root = createRoot(container)
  root.render(element)
  await wait(30)
  return { container, rerender: async next => { root.render(next); await wait(30) }, stop: async () => { root.unmount(); await wait(10) } }
}

// retry:false, gcTime short — a test-harness choice (not app code): every other p2 cp*.test.mjs file uses
// the same QueryClient override so error states appear in ~30ms instead of the app's real ~7s default retry
// backoff (confirmed separately against tests/auth-login-flow.test.mjs, which mounts through the real
// AppProviders QueryClient and still shows "Việc hôm nay"/"Xin chào, {fullName}" while /dashboard is pending
// or erroring, see test report).
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 }, mutations: { retry: false, gcTime: 1000 } } })
}

const MANAGER_USER = { id: 2, role: 'MANAGER', phone: '0900000002', fullName: 'Nguyễn Thu Hà', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [{ id: 5, code: 'A01', name: 'Tòa A' }] }
const BOSS_USER = { id: 1, role: 'BOSS', phone: '0900000001', fullName: 'Phạm Minh Đức', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [] }

function mountHome({ user = BOSS_USER, selection = 'all', client } = {}) {
  const authValue = { status: 'ready', user, login: async () => { throw new Error('unused in test') }, logout: async () => {}, refreshMe: async () => null, retry() {} }
  const selectionValue = { selectedBuildingId: selection, setSelectedBuildingId: () => {} }
  return mount(
    React.createElement(QueryClientProvider, { client: client ?? newClient() },
      React.createElement(AuthContext.Provider, { value: authValue },
        React.createElement(BuildingSelectionContext.Provider, { value: selectionValue },
          React.createElement(MemoryRouter, null, React.createElement(StaffHomePage))))))
}

// ---------- fetch fake: routes by URL prefix, outside edge only ----------
const json = (status, body) => ({ status, body })
const ok = data => json(200, { data })
const fail = (status, code, message, fields) => json(status, { error: { code, message, ...(fields ? { fields } : {}) } })

function fakeFetch(rules) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const call = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body }
    calls.push(call)
    const rule = rules.find(r => call.url.startsWith(`/api/v1${r.prefix}`) && (!r.method || r.method === call.method))
    const result = rule ? await rule.handler(call) : fail(404, 'NOT_FOUND', 'Không tìm thấy')
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } })
  }
  return calls
}
const queryOf = url => new URL(url, 'http://x').searchParams

// DashboardView fixture (GET /dashboard — NOTI-06).
function baseDashboard(overrides = {}) {
  return {
    newViewings: { count: 0, items: [] },
    pendingPrices: { count: 0, rooms: 0, ratePlans: 0 },
    ...overrides,
  }
}
function baseViewing(overrides = {}) {
  return {
    id: 1, roomId: 10, roomCode: 'A101', buildingId: 5, buildingName: 'Tòa A',
    guestName: 'Nguyễn Văn Khách', guestPhone: '0901234567', visitDate: '2026-11-10',
    timeSlot: 'MORNING', timeSlotLabel: 'Sáng (8:00–11:00)', note: null, source: 'WEB',
    status: 'NEW', statusLabel: 'Mới', handledById: null, outcomeNote: null,
    createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z',
    ...overrides,
  }
}

// ======================================================================================
// FE8B-6 / NOTI-06: "Giá chờ duyệt" card only when pendingPrices !== null
// ======================================================================================

test('FE8B-6/NOTI-06: pendingPrices null (manager) hides "Giá chờ duyệt" but "Lịch hẹn mới" still renders', async () => {
  fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => ok(baseDashboard({ pendingPrices: null })) }])
  const app = await mountHome({ user: MANAGER_USER, selection: 5 })
  await until(() => app.container.textContent.includes('Lịch hẹn mới'), 'manager dashboard data')
  assert.ok(app.container.textContent.includes('Lịch hẹn mới'), '"Lịch hẹn mới" card must still render')
  assert.ok(!app.container.textContent.includes('Giá chờ duyệt'), 'pendingPrices:null must hide the "Giá chờ duyệt" card entirely')
  await app.stop()
})

test('NOTI-06/PRC-11: pendingPrices {count:3,rooms:2,ratePlans:1} (Boss) shows "3 đề xuất chờ duyệt (2 giá phòng, 1 đơn giá)" with the API\'s own numbers', async () => {
  fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => ok(baseDashboard({ pendingPrices: { count: 3, rooms: 2, ratePlans: 1 } })) }])
  const app = await mountHome({ user: BOSS_USER, selection: 'all' })
  await until(() => app.container.textContent.includes('3 đề xuất chờ duyệt (2 giá phòng, 1 đơn giá)'), 'pending price summary')
  assert.ok(app.container.textContent.includes('Giá chờ duyệt'), '"Giá chờ duyệt" card must render for a non-null pendingPrices')
  assert.ok(app.container.textContent.includes('3 đề xuất chờ duyệt (2 giá phòng, 1 đơn giá)'), `exact count sentence missing; text: ${app.container.textContent}`)
  const link = links(app.container).find(a => a.textContent.trim() === 'Sang trang duyệt giá')
  assert.ok(link, '"Sang trang duyệt giá" link must render')
  assert.equal(link.attributes.href, '/ql/duyet-gia')
  await app.stop()
})

test('UI-06: pendingPrices numbers are shown exactly as the API sends them, even if rooms+ratePlans !== count (FE never re-derives them)', async () => {
  fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => ok(baseDashboard({ pendingPrices: { count: 9, rooms: 1, ratePlans: 1 } })) }])
  const app = await mountHome({ user: BOSS_USER })
  await until(() => app.container.textContent.includes('9 đề xuất chờ duyệt (1 giá phòng, 1 đơn giá)'), 'API pending price count')
  assert.ok(app.container.textContent.includes('9 đề xuất chờ duyệt (1 giá phòng, 1 đơn giá)'), `FE must not recompute 9 as 1+1; text: ${app.container.textContent}`)
  await app.stop()
})

// ======================================================================================
// VIEW-07/Q-P6-2: newViewings count vs items (at most 5), empty state
// ======================================================================================

test('VIEW-07/Q-P6-2: newViewings.count:12 with 5 items shows "12 lịch hẹn mới" (not 5) and renders exactly the 5 items given', async () => {
  const items = Array.from({ length: 5 }, (_, i) => baseViewing({ id: i + 1, guestName: `Khách ${i + 1}` }))
  fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => ok(baseDashboard({ newViewings: { count: 12, items } })) }])
  const app = await mountHome({ user: BOSS_USER })
  await until(() => app.container.textContent.includes('12 lịch hẹn mới'), 'new viewing count')
  assert.ok(app.container.textContent.includes('12 lịch hẹn mới'), 'the count shown must be the API count (12), not the item-array length')
  const listItems = find(app.container, n => n.tagName === 'LI')
  assert.equal(listItems.length, 5, 'exactly the 5 items from the API must render, no more, no fewer')
  for (const item of items) assert.ok(app.container.textContent.includes(item.guestName), `item ${item.guestName} must render`)
  await app.stop()
})

test('VIEW-07: newViewings.count:0 with items:[] shows the empty state "Chưa có việc nào hôm nay", not an empty list or "0 lịch hẹn mới"', async () => {
  fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => ok(baseDashboard({ newViewings: { count: 0, items: [] } })) }])
  const app = await mountHome({ user: BOSS_USER })
  await until(() => app.container.textContent.includes('Chưa có việc nào hôm nay'), 'empty dashboard state')
  assert.ok(app.container.textContent.includes('Chưa có việc nào hôm nay'), 'empty state copy must render')
  assert.ok(!app.container.textContent.includes('0 lịch hẹn mới'), 'must not show "0 lịch hẹn mới" literally')
  assert.equal(find(app.container, n => n.tagName === 'LI').length, 0, 'no <li> when there are no new viewings')
  await app.stop()
})

test('UI-02: an item\'s timeSlotLabel renders exactly as the API sends it (no FE remapping of the label)', async () => {
  const items = [baseViewing({ id: 1, timeSlot: 'EVENING', timeSlotLabel: 'Buổi lạ không giống chữ chuẩn' })]
  fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => ok(baseDashboard({ newViewings: { count: 1, items } })) }])
  const app = await mountHome({ user: BOSS_USER })
  await until(() => app.container.textContent.includes('Buổi lạ không giống chữ chuẩn'), 'API time-slot label')
  assert.ok(app.container.textContent.includes('Buổi lạ không giống chữ chuẩn'), 'the FE must show the API\'s own timeSlotLabel text verbatim, not a label it computed itself')
  await app.stop()
})

test('"Xem tất cả lịch hẹn" always links to /ql/lich-hen', async () => {
  fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => ok(baseDashboard()) }])
  const app = await mountHome({ user: BOSS_USER })
  await until(() => links(app.container).some(a => a.textContent.trim() === 'Xem tất cả lịch hẹn'), 'viewings link')
  const link = links(app.container).find(a => a.textContent.trim() === 'Xem tất cả lịch hẹn')
  assert.ok(link, '"Xem tất cả lịch hẹn" link must render')
  assert.equal(link.attributes.href, '/ql/lich-hen')
  await app.stop()
})

// ======================================================================================
// SCOPE-02: buildingId only for a specific selection; no page/limit on /dashboard
// ======================================================================================

test('SCOPE-02: GET /dashboard carries buildingId=5 only for a specific building; "all" and a manager\'s null send no buildingId; never page/limit', async () => {
  for (const selection of [5, 'all', null]) {
    const calls = fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => ok(baseDashboard()) }])
    const app = await mountHome({ user: selection === null ? MANAGER_USER : BOSS_USER, selection })
    await until(() => calls.length === 1, `dashboard request for selection ${selection}`)
    assert.equal(calls.length, 1, `selection ${selection}: exactly one GET /dashboard`)
    const q = queryOf(calls[0].url)
    assert.equal(q.get('buildingId'), typeof selection === 'number' ? '5' : null, `selection ${selection}`)
    assert.equal(q.get('page'), null, 'GET /dashboard must never carry page')
    assert.equal(q.get('limit'), null, 'GET /dashboard must never carry limit')
    await app.stop()
  }
})

// ======================================================================================
// UI-03: 4 list states incl. error+retry, while "Việc hôm nay" / "Xin chào, {fullName}" always stay
// ======================================================================================

test('UI-03: while GET /dashboard is pending, "Việc hôm nay" and "Xin chào, {fullName}" already render', async () => {
  fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: async () => { await wait(200); return ok(baseDashboard()) } }])
  const app = await mountHome({ user: BOSS_USER })
  await until(() => app.container.textContent.includes('Việc hôm nay'), 'pending dashboard heading')
  await until(() => app.container.textContent.includes('Xin chào, Phạm Minh Đức'), 'pending dashboard greeting')
  assert.ok(app.container.textContent.includes('Việc hôm nay'), 'heading must render immediately, before the dashboard query settles')
  assert.ok(app.container.textContent.includes('Xin chào, Phạm Minh Đức'), 'greeting must render immediately')
  await wait(200)
  await app.stop()
})

test('UI-03: a 500 from GET /dashboard shows error.message + "Thử lại", and clicking "Thử lại" refetches; "Việc hôm nay"/"Xin chào" never disappear', async () => {
  let attempt = 0
  const calls = fakeFetch([{
    prefix: '/dashboard', method: 'GET',
    handler: () => { attempt += 1; return attempt === 1 ? fail(500, 'NETWORK_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : ok(baseDashboard({ newViewings: { count: 1, items: [baseViewing()] } })) },
  }])
  const app = await mountHome({ user: BOSS_USER })
  await until(() => app.container.textContent.includes('Có lỗi xảy ra, vui lòng thử lại sau'), 'dashboard error state')
  assert.ok(app.container.textContent.includes('Có lỗi xảy ra, vui lòng thử lại sau'), 'the API error message must render')
  assert.ok(buttonByText(app.container, 'Thử lại'), '"Thử lại" button must render on error')
  assert.ok(app.container.textContent.includes('Việc hôm nay'), 'heading must stay even on dashboard error')
  assert.ok(app.container.textContent.includes('Xin chào, Phạm Minh Đức'), 'greeting must stay even on dashboard error')
  dispatch(app.container, buttonByText(app.container, 'Thử lại'), 'click')
  await until(() => calls.length === 2, 'dashboard retry request')
  await until(() => app.container.textContent.includes('Lịch hẹn mới'), 'dashboard retry data')
  assert.equal(calls.length, 2, '"Thử lại" must refetch')
  assert.ok(app.container.textContent.includes('Lịch hẹn mới'), 'after a successful retry the data must render')
  await app.stop()
})

test('no user (defensive — RequireAuth never lets this happen, but the greeting line is guarded): no "Xin chào" line, heading still renders', async () => {
  fakeFetch([{ prefix: '/dashboard', method: 'GET', handler: () => ok(baseDashboard()) }])
  const app = await mountHome({ user: null, selection: 'all' })
  await until(() => app.container.textContent.includes('Việc hôm nay'), 'dashboard heading without user')
  assert.ok(app.container.textContent.includes('Việc hôm nay'))
  assert.ok(!app.container.textContent.includes('Xin chào'))
  await app.stop()
})
