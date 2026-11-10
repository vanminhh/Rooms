import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

// CP-7 (FE-P2-07 phòng): src/pages/staff/RoomsPage.tsx; src/features/rooms/{schemas,RoomGrid,RoomForm,RoomInspector}.tsx
// (api.ts is CP-4, out of scope here). Spec/PLAN: ROOM-01..06/09, PRC-07/10, VIEW-13, UI-03/05/09, SCOPE-02;
// decisions Q-FE8A-2/3 (one GET /rooms/:id carrying both pendingViewingCount and images, endpoint pending on the
// backend — tested here only through a mock fetch) and Q6 CP-4 (pendingViewingCount is never defaulted to 0).
//
// CP-2 (FE-P2-09, PLAN §4 CP-2) update by the tester: RoomInspector no longer renders a <Link to="/ql/don-gia">
// for "Đề xuất giá"/"Đề xuất lại" — it opens RoomPriceDialog in place. The last two tests below (originally
// "renders as a link to /ql/don-gia") are rewritten to assert a <button> that opens the dialog (role="dialog"),
// per PLAN §4 CP-2 "Cập nhật cp7-rooms.test.mjs". Everything else in this file is unchanged from P2-8a.
// Changed asserts and why:
//   - was: find <A> with text "Đề xuất giá"/"Đề xuất lại", assert href="/ql/don-gia".
//   - now: find <BUTTON> with that same text, click it, assert a role="dialog" opens with the matching
//     title ("Đề xuất giá phòng {code}" / "Đề xuất lại giá phòng {code}"), because CP-2 replaced the link
//     with RoomPriceDialog ([ASSUMPTION FE8B-13]); the button text itself (PRC-07/PRC-10) is unchanged.
//
// Outside edges faked: globalThis.fetch (network) and the minimal fake DOM below (Node has none; no jsdom
// installed), same shape as cp5/cp6. Every module under test (RoomsPage, RoomGrid, RoomForm, RoomInspector,
// RoomPriceDialog, schemas.ts, pricing/api.ts, pricing/schemas.ts, pricing/labels.ts) is transpiled and run
// unmodified, mounted with real react-dom/client, real @tanstack/react-query, real react-hook-form + zod and
// the real react-router (MemoryRouter). RoomPriceDialog reads useAuth(), so these mounts now also wrap an
// AuthContext.Provider (a fixture value, not a mock of the unit under test). The kit (RoomsButton, Checkbox,
// ConfirmDialog, FormError, Spinner, StatusBadge, TextField, SectionHeading) and shared/{formatters,form-errors,
// status-labels}.ts, features/buildings/{building-selection,fields,api}.ts are loaded unmodified via the same
// relative-import fallback to main `src/` the other cp*.test.mjs files use.

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = draftSrcRoot // approved fix 2026-11-05-FE-P2-8a-test-path-fix: path-depth independent

// ---------- minimal real DOM (same shape as cp5/cp6) ----------
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
    this._value = ''
    if (this.tagName === 'INPUT') this.type = 'text'
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1) }
  get name() { return this._name ?? '' }
  set name(v) { this._name = v == null ? '' : String(v) }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'name') this._name = String(v) }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null }
  hasAttribute(k) { return k in this.attributes }
  removeAttribute(k) { delete this.attributes[k] }
  addEventListener(type, listener, options) { this.listeners.push({ type, listener, capture: options === true || options?.capture === true }) }
  removeEventListener(type, listener) { this.listeners = this.listeners.filter(l => !(l.type === type && l.listener === listener)) }
  focus() { fakeDocument.activeElement = this }
  blur() { if (fakeDocument.activeElement === this) fakeDocument.activeElement = fakeDocument.body }
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
  get value() { return this._value }
  set value(v) { this._value = v == null ? '' : String(v) }
  get valueAsNumber() { return this._value === '' ? NaN : Number(this._value) }
  set valueAsNumber(v) { this._value = Number.isNaN(v) ? '' : String(v) }
  get checked() { return this._checked ?? false }
  set checked(v) { this._checked = !!v }
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
// Entry points (as opposed to relative imports resolved by resolveRelative above) were previously read
// straight from draftSrcRoot with no main fallback; a draft that does not touch these CP-7 files (this one,
// PLAN.md CP-6, the P2-8a lesson) has none of them in its own src/, so every entry point must fall back too.
function entryPath(relPath) {
  return resolveFile(resolve(draftSrcRoot, relPath)) ?? resolveFile(resolve(mainSrcRoot, relPath)) ?? resolve(draftSrcRoot, relPath)
}

const React = nodeRequire('react')
const { createRoot } = nodeRequire('react-dom/client')
const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
const { MemoryRouter } = nodeRequire('react-router')

const { RoomsPage } = load(entryPath('pages/staff/RoomsPage.tsx'))
const { RoomGrid } = load(entryPath('features/rooms/RoomGrid.tsx'))
const { RoomForm } = load(entryPath('features/rooms/RoomForm.tsx'))
const { RoomInspector } = load(entryPath('features/rooms/RoomInspector.tsx'))
const { roomFormSchema } = load(entryPath('features/rooms/schemas.ts'))
const { BuildingSelectionContext } = load(entryPath('features/buildings/building-selection.ts'))
const { AuthContext } = load(entryPath('app/auth-context.ts'))

// ---------- DOM query / event helpers (same style as the other cp*.test.mjs files) ----------
const wait = ms => new Promise(r => setTimeout(r, ms))
const walkTree = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
const find = (root, pred) => walkTree(root).filter(n => n.nodeType === 1 && pred(n))
const buttons = container => find(container, n => n.tagName === 'BUTTON')
const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
const byName = (container, name) => find(container, n => ['INPUT', 'SELECT', 'TEXTAREA'].includes(n.tagName) && n.name === name)[0]
const isDisabled = el => el?.disabled === true || el?.hasAttribute('disabled')

function dispatch(container, target, type, extra = {}) {
  const rootListeners = container.listeners.filter(l => l.type === type && !l.capture)
  assert.ok(rootListeners.length > 0, `no root listener for ${type}`)
  const event = { type, target, srcElement: target, currentTarget: container, bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...extra }
  rootListeners.forEach(l => l.listener(event))
}

const nativeValueSetter = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'value').set
const nativeCheckedSetter = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'checked').set

function fill(container, el, value) {
  nativeValueSetter.call(el, String(value))
  dispatch(container, el, 'input', { target: el })
}
function check(container, el, value) {
  nativeCheckedSetter.call(el, value)
  dispatch(container, el, 'click', { target: el })
}

async function mount(element) {
  const container = fakeDocument.createElement('div')
  fakeDocument.body.appendChild(container)
  const root = createRoot(container)
  root.render(element)
  await wait(30)
  return { container, rerender: async next => { root.render(next); await wait(30) }, stop: async () => { root.unmount(); await wait(10) } }
}

// gcTime short, not the default 5 minutes, so these tests exit promptly (same reasoning as cp6-managers.test.mjs).
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 }, mutations: { retry: false, gcTime: 1000 } } })
}
function withRouter(children, client) {
  return React.createElement(QueryClientProvider, { client: client ?? newClient() }, React.createElement(MemoryRouter, null, children))
}

// BOSS fixture for RoomPriceDialog's useAuth() (CP-2): a context value, not a mock of RoomInspector/RoomPriceDialog.
const BOSS_USER = { id: 1, role: 'BOSS', phone: '0900000001', fullName: 'Chủ nhà', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [] }
function withAuthedRouter(children, client) {
  const authValue = { status: 'ready', user: BOSS_USER, login: async () => { throw new Error('unused in test') }, logout: async () => {}, refreshMe: async () => null, retry() {} }
  return React.createElement(QueryClientProvider, { client: client ?? newClient() },
    React.createElement(AuthContext.Provider, { value: authValue },
      React.createElement(MemoryRouter, null, children)))
}

// ---------- fetch fake: routes by URL prefix, outside edge only ----------
const json = (status, body) => ({ status, body })
const ok = (data, meta) => json(200, { data, ...(meta ? { meta } : {}) })
const fail = (status, code, message, fields) => json(status, { error: { code, message, ...(fields ? { fields } : {}) } })
const pageMeta = (data, limit = 20) => ({ page: 1, limit, total: data.length })

function fakeFetch(rules) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const call = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body }
    calls.push(call)
    const rule = rules.find(r => call.url.startsWith(`/api/v1${r.prefix}`) && (!r.method || r.method === call.method))
    const result = rule ? await rule.handler(call) : ok([], pageMeta([]))
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } })
  }
  return calls
}
const queryOf = url => new URL(url, 'http://x').searchParams

// RoomGridItem fixture (listRooms shape — no furniture/description/images/pendingViewingCount).
function baseRoomGridItem(overrides = {}) {
  return {
    id: 10, buildingId: 5, code: 'A101', floor: 1, areaM2: 20, price: 3_000_000, maxOccupants: 2,
    underMaintenance: false, isActive: true, status: 'Trống', pendingProposal: null, imageCount: 0,
    ...overrides,
  }
}

// Full RoomView fixture (GET /rooms/:id — getRoom — Q-FE8A-2/3), pendingViewingCount always present.
function baseRoomView(overrides = {}) {
  return {
    id: 10, buildingId: 5, code: 'A101', floor: 1, areaM2: 20, price: 3_000_000, maxOccupants: 2,
    furniture: ['Giường', 'Tủ'], description: 'Phòng góc', underMaintenance: false, isActive: true,
    status: 'Trống', images: [], pendingViewingCount: 0,
    ...overrides,
  }
}

// ======================================================================================
// schemas.ts — roomFormSchema mirrors CreateRoomDto/UpdateRoomDto (ROOM-01/06)
// ======================================================================================

test('ROOM-01: code must be 1..10 chars — empty and 11 chars fail, 1 and 10 chars pass', () => {
  const base = { floor: 1, areaM2: 20, maxOccupants: 2, furniture: '', description: '' }
  assert.equal(roomFormSchema.safeParse({ ...base, code: '' }).success, false, 'empty code must fail')
  assert.equal(roomFormSchema.safeParse({ ...base, code: 'A' }).success, true, '1 char must pass')
  assert.equal(roomFormSchema.safeParse({ ...base, code: 'A'.repeat(10) }).success, true, '10 chars must pass')
  assert.equal(roomFormSchema.safeParse({ ...base, code: 'A'.repeat(11) }).success, false, '11 chars must fail')
})

test('ROOM-01: floor is an integer from 1 to 2147483647 — 0 and 2147483648 fail, 1 and 2147483647 pass', () => {
  const base = { code: 'A1', areaM2: 20, maxOccupants: 2, furniture: '', description: '' }
  assert.equal(roomFormSchema.safeParse({ ...base, floor: 0 }).success, false, 'floor 0 must fail')
  assert.equal(roomFormSchema.safeParse({ ...base, floor: 1 }).success, true, 'floor 1 must pass')
  assert.equal(roomFormSchema.safeParse({ ...base, floor: 2147483647 }).success, true, 'floor INT_MAX must pass')
  assert.equal(roomFormSchema.safeParse({ ...base, floor: 2147483648 }).success, false, 'floor INT_MAX+1 must fail')
  assert.equal(roomFormSchema.safeParse({ ...base, floor: 1.5 }).success, false, 'a non-integer floor must fail')
})

test('ROOM-01: areaM2 must be >0, <=9999.9, at most one decimal place', () => {
  const base = { code: 'A1', floor: 1, maxOccupants: 2, furniture: '', description: '' }
  assert.equal(roomFormSchema.safeParse({ ...base, areaM2: 0 }).success, false, 'area 0 must fail')
  assert.equal(roomFormSchema.safeParse({ ...base, areaM2: 0.1 }).success, true, 'area 0.1 must pass')
  assert.equal(roomFormSchema.safeParse({ ...base, areaM2: 9999.9 }).success, true, 'area 9999.9 (the max) must pass')
  assert.equal(roomFormSchema.safeParse({ ...base, areaM2: 10000 }).success, false, 'area 10000 (over the max) must fail')
  assert.equal(roomFormSchema.safeParse({ ...base, areaM2: 1.25 }).success, false, 'area with two decimals must fail')
})

test('ROOM-01: maxOccupants is an integer >=1 — 0 and negative fail, 1 passes', () => {
  const base = { code: 'A1', floor: 1, areaM2: 20, furniture: '', description: '' }
  assert.equal(roomFormSchema.safeParse({ ...base, maxOccupants: 0 }).success, false, 'maxOccupants 0 must fail')
  assert.equal(roomFormSchema.safeParse({ ...base, maxOccupants: -1 }).success, false, 'negative maxOccupants must fail')
  assert.equal(roomFormSchema.safeParse({ ...base, maxOccupants: 1 }).success, true, 'maxOccupants 1 must pass')
  assert.equal(roomFormSchema.safeParse({ ...base, maxOccupants: 1.5 }).success, false, 'a non-integer maxOccupants must fail')
})

test('ROOM-01/ROOM-02: roomFormSchema has no "price" field at all — the form can never write price', () => {
  assert.equal('price' in roomFormSchema.shape, false)
})

// ======================================================================================
// RoomForm — create: boundaries, defaults, no price sent (ROOM-01/02)
// ======================================================================================

test('ROOM-02: creating a room sends buildingId/code/floor/areaM2/maxOccupants/furniture/description, never price, and defaults maxOccupants to 2 when left untouched', async () => {
  const calls = fakeFetch([{ prefix: '/rooms', method: 'POST', handler: () => ok(baseRoomView()) }])
  const app = await mountRoomForm()
  fill(app.container, byName(app.container, 'code'), 'A101')
  fill(app.container, byName(app.container, 'floor'), '3')
  fill(app.container, byName(app.container, 'areaM2'), '20.5')
  // maxOccupants intentionally left untouched: the form's own default (2) must be what gets sent.
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post, 'POST /rooms was never sent (form stayed invalid)')
  const sent = JSON.parse(post.body)
  assert.deepEqual(sent, { buildingId: 5, code: 'A101', floor: 3, areaM2: 20.5, maxOccupants: 2, furniture: [], description: null })
  assert.equal('price' in sent, false, 'ROOM-02: price must never be sent by the form')
  await app.stop()
})

test('ROOM-01: a one-character code (1) and a ten-character code (10) both pass client validation and reach POST /rooms', async () => {
  for (const code of ['A', 'A123456789']) {
    const calls = fakeFetch([{ prefix: '/rooms', method: 'POST', handler: () => ok(baseRoomView({ code })) }])
    const app = await mountRoomForm()
    fill(app.container, byName(app.container, 'code'), code)
    fill(app.container, byName(app.container, 'floor'), '1')
    fill(app.container, byName(app.container, 'areaM2'), '10')
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await wait(30)
    const post = calls.find(c => c.method === 'POST')
    assert.ok(post, `code "${code}" (length ${code.length}) must pass client validation`)
    assert.equal(JSON.parse(post.body).code, code)
    await app.stop()
  }
})

test('ROOM-01: an 11-character code fails client-side; POST /rooms is never sent', async () => {
  const calls = fakeFetch([{ prefix: '/rooms', method: 'POST', handler: () => ok(baseRoomView()) }])
  const app = await mountRoomForm()
  fill(app.container, byName(app.container, 'code'), 'A'.repeat(11))
  fill(app.container, byName(app.container, 'floor'), '1')
  fill(app.container, byName(app.container, 'areaM2'), '10')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.length, 0, 'an 11-character code must never reach the API')
  await app.stop()
})

test('ROOM-01: furniture text "Giường, Tủ" becomes ["Giường","Tủ"] in the request body', async () => {
  const calls = fakeFetch([{ prefix: '/rooms', method: 'POST', handler: () => ok(baseRoomView()) }])
  const app = await mountRoomForm()
  fill(app.container, byName(app.container, 'code'), 'A101')
  fill(app.container, byName(app.container, 'floor'), '1')
  fill(app.container, byName(app.container, 'areaM2'), '10')
  fill(app.container, byName(app.container, 'furniture'), 'Giường,  Tủ ')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.deepEqual(JSON.parse(calls[0].body).furniture, ['Giường', 'Tủ'])
  await app.stop()
})

test('ROOM-01: a 409 CONFLICT_STATE from a duplicate code (even against a locked room) is shown as the form message', async () => {
  const calls = fakeFetch([{ prefix: '/rooms', method: 'POST', handler: () => fail(400, 'VALIDATION_FAILED', 'Mã phòng đã tồn tại trong tòa này', { code: 'Mã phòng đã tồn tại trong tòa này' }) }])
  const app = await mountRoomForm()
  fill(app.container, byName(app.container, 'code'), 'A101')
  fill(app.container, byName(app.container, 'floor'), '1')
  fill(app.container, byName(app.container, 'areaM2'), '10')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.length, 1)
  assert.ok(app.container.textContent.includes('Mã phòng đã tồn tại trong tòa này'), 'the duplicate-code message must render on the code field')
  await app.stop()
})

// ======================================================================================
// RoomGrid — floor grid, 4 statuses, pagination 20, labels (ROOM-05/06, UI-03, SCOPE-02)
// ======================================================================================

test('SCOPE-02: RoomGrid with selection=5 sends buildingId=5; "all" and null send no buildingId; sort is always -floor, limit 20', async () => {
  for (const selection of [5, 'all', null]) {
    const calls = fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([baseRoomGridItem()], pageMeta([1])) }])
    const app = await mount(withRouter(React.createElement(RoomGrid, { selection })))
    await wait(30)
    const q = queryOf(calls[0].url)
    assert.equal(q.get('buildingId'), typeof selection === 'number' ? '5' : null, `selection ${selection}`)
    assert.equal(q.get('sort'), '-floor')
    assert.equal(q.get('page'), '1')
    assert.equal(q.get('limit'), '20')
    await app.stop()
  }
})

test('ROOM-05: the floor grid renders floors in the order the API returns them (descending, sort=-floor), one <section> per floor', async () => {
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([
    baseRoomGridItem({ id: 1, floor: 5, code: 'A501' }),
    baseRoomGridItem({ id: 2, floor: 3, code: 'A301' }),
    baseRoomGridItem({ id: 3, floor: 1, code: 'A101' }),
  ], pageMeta([1, 2, 3])) }])
  const app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  await wait(30)
  const headings = find(app.container, n => n.tagName === 'H3').map(h => h.textContent.trim())
  assert.deepEqual(headings, ['Tầng 5', 'Tầng 3', 'Tầng 1'], 'floors must render top-first, matching the API order')
  await app.stop()
})

test('ROOM-05/KIT-06: the 4 room statuses show their roomStatusLabels text', async () => {
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([
    baseRoomGridItem({ id: 1, code: 'A1', status: 'Trống' }),
    baseRoomGridItem({ id: 2, code: 'A2', status: 'Đã cọc' }),
    baseRoomGridItem({ id: 3, code: 'A3', status: 'Đang thuê' }),
    baseRoomGridItem({ id: 4, code: 'A4', status: 'Bảo trì' }),
  ], pageMeta([1, 2, 3, 4])) }])
  const app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  await wait(30)
  for (const label of ['Trống', 'Đã cọc', 'Đang thuê', 'Bảo trì']) {
    assert.ok(app.container.textContent.includes(label), `status label "${label}" must render`)
  }
  await app.stop()
})

test('ROOM-06: a null price shows "Chưa có giá", not 0 or blank', async () => {
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([baseRoomGridItem({ price: null })], pageMeta([1])) }])
  const app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  await wait(30)
  assert.ok(app.container.textContent.includes('Chưa có giá'))
  await app.stop()
})

test('ROOM-06: a locked room (isActive:false) shows "Đã khóa" on its card', async () => {
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([baseRoomGridItem({ isActive: false })], pageMeta([1])) }])
  const app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5, includeInactive: true })))
  await wait(30)
  assert.ok(app.container.textContent.includes('Đã khóa'))
  await app.stop()
})

test('PRC-07/PRC-10: an expired pending price proposal shows "Đề xuất giá: Quá hạn" on the card', async () => {
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([baseRoomGridItem({ pendingProposal: { id: 1, effectiveFrom: '2026-01-01', expired: true } })], pageMeta([1])) }])
  const app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  await wait(30)
  assert.ok(app.container.textContent.includes('Đề xuất giá: Quá hạn'))
  await app.stop()
})

test('UI-03: a non-expired pending proposal does NOT show "Quá hạn" on the card', async () => {
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([baseRoomGridItem({ pendingProposal: { id: 1, effectiveFrom: '2026-01-01', expired: false } })], pageMeta([1])) }])
  const app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  await wait(30)
  assert.ok(!app.container.textContent.includes('Quá hạn'))
  await app.stop()
})

test('UI-03: pagination 20 — a floor split across two pages renders only that page\'s rooms, and "Trang sau" requests page=2', async () => {
  // Page 1: 20 rooms, the last one on floor 2 (the split floor). Page 2: 1 more room on floor 2, plus floor 1.
  const page1 = Array.from({ length: 19 }, (_, i) => baseRoomGridItem({ id: i + 1, floor: 3, code: `A30${i}` }))
    .concat([baseRoomGridItem({ id: 20, floor: 2, code: 'A201' })])
  const page2 = [baseRoomGridItem({ id: 21, floor: 2, code: 'A202' }), baseRoomGridItem({ id: 22, floor: 1, code: 'A101' })]
  const calls = fakeFetch([{
    prefix: '/rooms', method: 'GET',
    handler: call => queryOf(call.url).get('page') === '2' ? ok(page2, { page: 2, limit: 20, total: 22 }) : ok(page1, { page: 1, limit: 20, total: 22 }),
  }])
  const app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  await wait(30)
  assert.ok(app.container.textContent.includes('A201'), 'page 1 must render its own floor-2 room')
  assert.ok(!app.container.textContent.includes('A202'), 'page 1 must not show page 2\'s floor-2 room')
  const next = buttonByText(app.container, 'Trang sau')
  assert.ok(next && !isDisabled(next), 'with total=22 > limit=20, "Trang sau" must be enabled')
  dispatch(app.container, next, 'click')
  await wait(30)
  assert.ok(calls.some(c => queryOf(c.url).get('page') === '2'), 'clicking "Trang sau" must request page=2')
  assert.ok(app.container.textContent.includes('A202'), 'page 2 must render its own floor-2 room')
  assert.ok(app.container.textContent.includes('A101'), 'page 2 must also render the floor-1 room')
  await app.stop()
})

test('UI-03: no pagination nav when every row fits on one page (total <= 20)', async () => {
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([baseRoomGridItem()], pageMeta([1])) }])
  const app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  await wait(30)
  assert.equal(buttonByText(app.container, 'Trang sau'), undefined)
  await app.stop()
})

test('UI-03: RoomGrid 4 list states — loading, empty (manager vs a specific building), error+retry, data', async () => {
  // loading
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: async () => { await wait(50); return ok([], pageMeta([])) } }])
  let app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  assert.ok(app.container.textContent.includes('Đang tải danh sách phòng'), 'the Spinner\'s loading label must show while the list is pending')
  await wait(60)
  await app.stop()

  // empty, number selection
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([], pageMeta([])) }])
  app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  await wait(30)
  assert.ok(app.container.textContent.includes('Chưa có phòng nào ở tòa này'))
  await app.stop()

  // empty, manager with no building picked (null) — different copy, not an error
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([], pageMeta([])) }])
  app = await mount(withRouter(React.createElement(RoomGrid, { selection: null })))
  await wait(30)
  assert.ok(app.container.textContent.includes('Chưa có phòng nào trong phạm vi của bạn'))
  await app.stop()

  // error + retry
  let attempt = 0
  const calls = fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => { attempt += 1; return attempt === 1 ? fail(500, 'NETWORK_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : ok([baseRoomGridItem()], pageMeta([1])) } }])
  app = await mount(withRouter(React.createElement(RoomGrid, { selection: 5 })))
  await wait(30)
  assert.ok(app.container.textContent.includes('Có lỗi xảy ra, vui lòng thử lại sau'))
  dispatch(app.container, buttonByText(app.container, 'Thử lại'), 'click')
  await wait(30)
  assert.ok(calls.length >= 2, 'retry must refetch')
  assert.ok(app.container.textContent.includes('A101'))
  await app.stop()
})

// ======================================================================================
// RoomsPage — "Thêm phòng" locked for "all"/null selection (ROOM-01, SCOPE-02)
// ======================================================================================

function withSelection(children, selectedBuildingId) {
  const value = { selectedBuildingId, setSelectedBuildingId: () => {} }
  return withRouter(React.createElement(BuildingSelectionContext.Provider, { value }, children))
}

test('ROOM-01: "Thêm phòng" is disabled and a hint shown when no building is selected (Boss "Tất cả tòa" or a manager with no pick)', async () => {
  for (const selection of ['all', null]) {
    fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([], pageMeta([])) }])
    const app = await mount(withSelection(React.createElement(RoomsPage), selection))
    await wait(30)
    const addButton = buttonByText(app.container, 'Thêm phòng')
    assert.ok(isDisabled(addButton), `selection ${selection}: "Thêm phòng" must be disabled`)
    assert.ok(app.container.textContent.includes('Chọn một tòa ở thanh chọn tòa để thêm phòng.'))
    await app.stop()
  }
})

test('ROOM-01: "Thêm phòng" is enabled for a specific building; clicking it mounts the create form', async () => {
  fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([], pageMeta([])) }])
  const app = await mount(withSelection(React.createElement(RoomsPage), 5))
  await wait(30)
  const addButton = buttonByText(app.container, 'Thêm phòng')
  assert.ok(!isDisabled(addButton), 'with a specific building selected, "Thêm phòng" must be enabled')
  dispatch(app.container, addButton, 'click')
  await wait(30)
  assert.ok(buttonByText(app.container, 'Lưu'), 'the create form (RoomForm) must mount with a "Lưu" button')
  await app.stop()
})

test('UI-03: "Hiện phòng đã khóa" checkbox adds includeInactive=true to the rooms request', async () => {
  const calls = fakeFetch([{ prefix: '/rooms', method: 'GET', handler: () => ok([], pageMeta([])) }])
  const app = await mount(withSelection(React.createElement(RoomsPage), 5))
  await wait(30)
  // react-dom sets <input type> as a direct property (element.type = 'checkbox'), never via setAttribute
  // (same note as cp5-buildings-services.test.mjs's "Hiện tòa đã khóa" checkbox lookup).
  const checkbox = find(app.container, n => n.tagName === 'INPUT' && n.type === 'checkbox')[0]
  assert.ok(checkbox, '"Hiện phòng đã khóa" checkbox not found')
  check(app.container, checkbox, true)
  await wait(30)
  assert.ok(calls.some(c => queryOf(c.url).get('includeInactive') === 'true'), 'checking "Hiện phòng đã khóa" must request includeInactive=true')
  await app.stop()
})

// ======================================================================================
// RoomInspector — lock/unlock, maintenance on/off via ConfirmDialog, getRoom(id) timing (ROOM-09, VIEW-13)
// ======================================================================================

test('ROOM-09/VIEW-13: locking an active room calls getRoom(id) first, shows "Còn N lịch hẹn chưa xử lý." with N from pendingViewingCount, and confirming PATCHes isActive:false only', async () => {
  const calls = fakeFetch([
    { prefix: '/rooms/10', method: 'GET', handler: () => ok(baseRoomView({ pendingViewingCount: 3 })) },
    { prefix: '/rooms/10', method: 'PATCH', handler: () => ok(baseRoomView({ isActive: false })) },
  ])
  const app = await mount(withRouter(React.createElement(RoomInspector, { room: baseRoomGridItem({ isActive: true }) })))
  dispatch(app.container, buttonByText(app.container, 'Khóa phòng'), 'click')
  await wait(30)
  assert.ok(calls.some(c => c.method === 'GET'), 'opening the lock dialog must call getRoom(id) first (Q-FE8A-2/3)')
  assert.ok(app.container.textContent.includes('Còn 3 lịch hẹn chưa xử lý.'), 'the dialog must show the real pendingViewingCount, not 0')
  const confirm = buttons(app.container)[buttons(app.container).length - 1]
  dispatch(app.container, confirm, 'click')
  await wait(30)
  const patch = calls.find(c => c.method === 'PATCH')
  assert.ok(patch)
  assert.deepEqual(JSON.parse(patch.body), { isActive: false })
  await app.stop()
})

test('ROOM-09: unlocking a locked room does NOT call getRoom(id) and shows no pending-viewing sentence; confirming PATCHes isActive:true only', async () => {
  const calls = fakeFetch([{ prefix: '/rooms/10', method: 'PATCH', handler: () => ok(baseRoomView({ isActive: true })) }])
  const app = await mount(withRouter(React.createElement(RoomInspector, { room: baseRoomGridItem({ isActive: false }) })))
  dispatch(app.container, buttonByText(app.container, 'Mở khóa phòng'), 'click')
  await wait(30)
  assert.equal(calls.filter(c => c.method === 'GET').length, 0, 'unlocking must never call getRoom(id)')
  assert.ok(app.container.textContent.includes('Phòng sẽ hiện lại trong danh sách.'))
  assert.ok(!app.container.textContent.includes('lịch hẹn chưa xử lý'), 'unlocking must not show the locking-only pending-viewing sentence')
  const confirm = buttons(app.container)[buttons(app.container).length - 1]
  dispatch(app.container, confirm, 'click')
  await wait(30)
  assert.deepEqual(JSON.parse(calls[0].body), { isActive: true })
  await app.stop()
})

test('ROOM-09/VIEW-13: turning maintenance ON calls getRoom(id) first and shows the pending-viewing count; confirming PATCHes underMaintenance:true only', async () => {
  const calls = fakeFetch([
    { prefix: '/rooms/10', method: 'GET', handler: () => ok(baseRoomView({ pendingViewingCount: 5 })) },
    { prefix: '/rooms/10', method: 'PATCH', handler: () => ok(baseRoomView({ underMaintenance: true })) },
  ])
  const app = await mount(withRouter(React.createElement(RoomInspector, { room: baseRoomGridItem({ underMaintenance: false }) })))
  dispatch(app.container, buttonByText(app.container, 'Bật bảo trì'), 'click')
  await wait(30)
  assert.ok(calls.some(c => c.method === 'GET'), 'turning maintenance ON must call getRoom(id) first')
  assert.ok(app.container.textContent.includes('Còn 5 lịch hẹn chưa xử lý.'))
  const confirm = buttons(app.container)[buttons(app.container).length - 1]
  dispatch(app.container, confirm, 'click')
  await wait(30)
  const patch = calls.find(c => c.method === 'PATCH')
  assert.deepEqual(JSON.parse(patch.body), { underMaintenance: true })
  await app.stop()
})

test('ROOM-09: turning maintenance OFF does NOT call getRoom(id); confirming PATCHes underMaintenance:false only', async () => {
  const calls = fakeFetch([{ prefix: '/rooms/10', method: 'PATCH', handler: () => ok(baseRoomView({ underMaintenance: false })) }])
  const app = await mount(withRouter(React.createElement(RoomInspector, { room: baseRoomGridItem({ underMaintenance: true }) })))
  dispatch(app.container, buttonByText(app.container, 'Tắt bảo trì'), 'click')
  await wait(30)
  assert.equal(calls.filter(c => c.method === 'GET').length, 0, 'turning maintenance OFF must never call getRoom(id)')
  assert.ok(app.container.textContent.includes('Trạng thái phòng sẽ được tính lại từ hợp đồng.'))
  const confirm = buttons(app.container)[buttons(app.container).length - 1]
  dispatch(app.container, confirm, 'click')
  await wait(30)
  assert.deepEqual(JSON.parse(calls[0].body), { underMaintenance: false })
  await app.stop()
})

test('Q-FE8A-2/3: when getRoom(id) fails before locking, the error message is shown and the dialog never opens (no "0" guessed)', async () => {
  fakeFetch([{ prefix: '/rooms/10', method: 'GET', handler: () => fail(500, 'NETWORK_ERROR', 'Không tải được thông tin phòng, vui lòng thử lại') }])
  const app = await mount(withRouter(React.createElement(RoomInspector, { room: baseRoomGridItem({ isActive: true }) })))
  dispatch(app.container, buttonByText(app.container, 'Khóa phòng'), 'click')
  await wait(30)
  assert.ok(app.container.textContent.includes('Không tải được thông tin phòng, vui lòng thử lại'), 'the getRoom error message must be shown')
  assert.ok(!app.container.textContent.includes('Còn 0 lịch hẹn'), 'a failed getRoom must never be guessed as 0 pending viewings')
  assert.equal(find(app.container, n => n.getAttribute('role') === 'dialog').length, 0, 'the confirm dialog must not open when getRoom(id) failed')
  await app.stop()
})

test('ROOM-09: a 409 CONFLICT_STATE on lock (open contract) keeps the dialog open and shows the message', async () => {
  const calls = fakeFetch([
    { prefix: '/rooms/10', method: 'GET', handler: () => ok(baseRoomView({ pendingViewingCount: 0 })) },
    { prefix: '/rooms/10', method: 'PATCH', handler: () => fail(409, 'CONFLICT_STATE', 'Thao tác không hợp lệ ở trạng thái hiện tại') },
  ])
  const app = await mount(withRouter(React.createElement(RoomInspector, { room: baseRoomGridItem({ isActive: true }) })))
  dispatch(app.container, buttonByText(app.container, 'Khóa phòng'), 'click')
  await wait(30)
  const confirm = buttons(app.container)[buttons(app.container).length - 1]
  dispatch(app.container, confirm, 'click')
  await wait(30)
  assert.ok(app.container.textContent.includes('Thao tác không hợp lệ ở trạng thái hiện tại'))
  assert.ok(app.container.textContent.includes('Khóa phòng'), 'the dialog must stay open, not silently close, after a failed lock')
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 1, 'only one PATCH attempt must have been sent')
  await app.stop()
})

// ======================================================================================
// RoomInspector — "Đề xuất giá" opens RoomPriceDialog (CP-2, PRC-07/10, [ASSUMPTION FE8B-13])
// ======================================================================================

test('PRC-10: "Đề xuất giá" renders as a <button> (not a link) when there is no pending proposal; clicking it opens the dialog', async () => {
  const app = await mount(withAuthedRouter(React.createElement(RoomInspector, { room: baseRoomGridItem({ pendingProposal: null }) })))
  const opener = buttonByText(app.container, 'Đề xuất giá')
  assert.ok(opener, 'the "Đề xuất giá" button must render')
  assert.equal(find(app.container, n => n.tagName === 'A').find(a => a.textContent.trim() === 'Đề xuất giá'), undefined, 'CP-2: this must no longer be a link')
  dispatch(app.container, opener, 'click')
  await wait(30)
  const dialog = find(app.container, n => n.getAttribute('role') === 'dialog')[0]
  assert.ok(dialog, 'clicking "Đề xuất giá" must open the RoomPriceDialog (role="dialog")')
  assert.ok(dialog.textContent.includes('Đề xuất giá phòng A101'), 'the dialog title must read "Đề xuất giá phòng {code}"')
  await app.stop()
})

test('PRC-07: an expired pending proposal changes the button text to "Đề xuất lại"; clicking it opens the dialog titled "Đề xuất lại giá phòng {code}"', async () => {
  const app = await mount(withAuthedRouter(React.createElement(RoomInspector, { room: baseRoomGridItem({ pendingProposal: { id: 1, effectiveFrom: '2026-01-01', expired: true } }) })))
  const opener = buttonByText(app.container, 'Đề xuất lại')
  assert.ok(opener, 'the expired-proposal button must read "Đề xuất lại"')
  assert.equal(buttonByText(app.container, 'Đề xuất giá'), undefined, 'the non-expired wording must not also render')
  dispatch(app.container, opener, 'click')
  await wait(30)
  const dialog = find(app.container, n => n.getAttribute('role') === 'dialog')[0]
  assert.ok(dialog, 'clicking "Đề xuất lại" must open the RoomPriceDialog')
  assert.ok(dialog.textContent.includes('Đề xuất lại giá phòng A101'), 'the dialog title must read "Đề xuất lại giá phòng {code}"')
  await app.stop()
})

// UI-40 flake fix: on a busy machine mount() can resolve before RoomForm has rendered its fields, so the first
// fill() got `undefined`. Wait (max 3 s) until the code input exists before a test starts typing.
async function mountRoomForm() {
  const app = await mount(withRouter(React.createElement(RoomForm, { buildingId: 5, onCancel: () => {} })))
  for (let tries = 0; tries < 300 && !byName(app.container, 'code'); tries++) await wait(10)
  assert.ok(byName(app.container, 'code'), 'RoomForm did not render its fields')
  return app
}
