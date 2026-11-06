import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

// CP-6 (FE-P2-12, PLAN.md CP-6): src/pages/staff/ViewingsPage.tsx, src/features/viewings/ViewingCard.tsx.
// Spec/PLAN: VIEW-04, VIEW-07..10, VIEW-13, PRC-11, SCOPE-02, UI-01, UI-03, UI-08, UI-09,
// Q-P6-2, Q-P6-3, Q-FE8B-4 (tel:/Zalo links), Q-FE8B-5 (default date range today..+30).
//
// ACCEPTED BEHAVIOR NOTE (reported to the owner for review): "Hủy lịch" and "Không thành" are two-step in the
// draft: the button only opens a small note panel (OutcomePanel); the PATCH is sent only after "Lưu" inside
// that panel. PLAN's scenario table phrases this as "bấm Hủy lịch -> gửi được" / "bấm Không thành -> gửi với
// ghi chú ...". This file tests the two-step flow as built (click the action button, then click "Lưu" inside
// the panel) rather than assuming a single click submits directly. This interpretation needs the owner's
// sign-off at review time.
//
// Outside edges faked: globalThis.fetch (network) and the minimal fake DOM below (same shape as
// fe12-viewing-form.test.mjs / cp7-rooms.test.mjs; Node has none, no jsdom installed). Every module under test
// (ViewingsPage, ViewingCard, viewings/{api,schemas}.ts, pricing/labels.ts) is transpiled and run unmodified,
// mounted with real react-dom/client, real @tanstack/react-query, real react-hook-form + zod. Neither page nor
// card reads auth context or router, so both mount under a plain QueryClientProvider (+ BuildingSelectionContext
// for the page).

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = draftSrcRoot // approved fix 2026-11-05-FE-P2-8a-test-path-fix: path-depth independent

// ---------- minimal real DOM (same shape as fe12-viewing-form.test.mjs) ----------
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
    if (this.tagName === 'SELECT') this.type = 'select-one'
    if (this.tagName === 'TEXTAREA') this.type = 'textarea'
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
  get options() { return this.childNodes.filter(n => n.nodeType === 1 && n.tagName === 'OPTION') }
  get multiple() { return this.hasAttribute('multiple') }
  set multiple(v) { v ? this.setAttribute('multiple', '') : this.removeAttribute('multiple') }
  get size() { return this._size ?? 0 }
  set size(v) { this._size = v }
  get selected() { return this._selected ?? this.hasAttribute('selected') }
  set selected(v) { this._selected = !!v }
  get defaultSelected() { return this.hasAttribute('selected') }
  get selectedIndex() { return this.options.findIndex(o => o.value === this.value) }
  set selectedIndex(i) { const opts = this.options; if (opts[i]) this.value = opts[i].value }
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
const windowOpenSpy = { calls: 0 }
const fakeWindow = {
  document: fakeDocument, event: undefined, HTMLIFrameElement: FakeIFrame, HTMLElement: FakeElement, Element: FakeElement, Node: FakeNode,
  addEventListener() {}, removeEventListener() {},
  location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '', hash: '' },
  history: { state: null, pushState() {}, replaceState() {}, scrollRestoration: 'auto' },
  getComputedStyle: () => ({}), matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  open: () => { windowOpenSpy.calls += 1; return null },
}
fakeDocument.defaultView = fakeWindow
Object.assign(globalThis, { window: fakeWindow, document: fakeDocument, HTMLElement: FakeElement, Element: FakeElement, Node: FakeNode, HTMLIFrameElement: FakeIFrame })

// ---------- TS/TSX module loader: relative imports missing from the draft fall back to main src/ ----------
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
const { QueryClient, QueryClientProvider, useQuery } = nodeRequire('@tanstack/react-query')

const { ViewingsPage } = load(resolve(draftSrcRoot, 'pages/staff/ViewingsPage.tsx'))
const { ViewingCard } = load(resolve(draftSrcRoot, 'features/viewings/ViewingCard.tsx'))
const { BuildingSelectionContext } = load(resolve(draftSrcRoot, 'features/buildings/building-selection.ts'))
const { todayHanoi, plusDays } = load(resolve(draftSrcRoot, 'features/pricing/labels.ts'))
const { formatDate } = load(resolve(draftSrcRoot, 'shared/formatters.ts'))

// Source-level guard for Q-FE8B-4 "no window.open": static text search, not a mock of the units under test.
const viewingCardSource = readFileSync(resolve(draftSrcRoot, 'features/viewings/ViewingCard.tsx'), 'utf8')
const viewingsPageSource = readFileSync(resolve(draftSrcRoot, 'pages/staff/ViewingsPage.tsx'), 'utf8')

// ---------- DOM query / event helpers (same style as the other cp*.test.mjs files) ----------
const wait = ms => new Promise(r => setTimeout(r, ms))
const walkTree = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
const find = (root, pred) => walkTree(root).filter(n => n.nodeType === 1 && pred(n))
const buttons = container => find(container, n => n.tagName === 'BUTTON')
const anchors = container => find(container, n => n.tagName === 'A')
const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
const anchorByText = (container, label) => anchors(container).find(a => a.textContent.trim() === label)
const byLabel = container => (text, type) => {
  const labelNode = find(container, n => n.tagName === 'LABEL').find(l => l.textContent.trim() === text)
  assert.ok(labelNode, `no <label> with text "${text}"`)
  const id = labelNode.getAttribute('for')
  const el = find(container, n => n.getAttribute('id') === id)[0]
  assert.ok(el, `no input for label "${text}"`)
  if (type) assert.equal(el.tagName, type)
  return el
}

function dispatch(container, target, type, extra = {}) {
  const rootListeners = container.listeners.filter(l => l.type === type && !l.capture)
  assert.ok(rootListeners.length > 0, `no root listener for ${type}`)
  const event = { type, target, srcElement: target, currentTarget: container, bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...extra }
  rootListeners.forEach(l => l.listener(event))
}

const nativeValueSetter = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'value').set

function fill(container, el, value) {
  nativeValueSetter.call(el, String(value))
  dispatch(container, el, el.tagName === 'SELECT' ? 'change' : 'input', { target: el })
}

async function mount(element) {
  const container = fakeDocument.createElement('div')
  fakeDocument.body.appendChild(container)
  const root = createRoot(container)
  root.render(element)
  await wait(30)
  return { container, rerender: async next => { root.render(next); await wait(30) }, stop: async () => { root.unmount(); await wait(10) } }
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 }, mutations: { retry: false, gcTime: 1000 } } })
}

// ---------- fetch fake: routes by URL prefix + method, outside edge only ----------
const json = (status, body) => ({ status, body })
const ok = (data, meta) => json(200, { data, ...(meta ? { meta } : {}) })
const fail = (status, code, message, fields) => json(status, { error: { code, message, ...(fields ? { fields } : {}) } })
const pageMeta = (data, limit = 100) => ({ page: 1, limit, total: data.length })

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

// ---------- ViewingView fixture (viewings.types.ts on main, already has roomCode/buildingName) ----------
function baseViewing(overrides = {}) {
  return {
    id: 1, roomId: 10, roomCode: 'A101', buildingId: 5, buildingName: 'Tòa Cầu Giấy',
    guestName: 'Nguyễn Văn A', guestPhone: '0901234567', visitDate: todayHanoi(), timeSlot: 'MORNING', timeSlotLabel: 'Sáng (8:00–11:00)',
    note: null, source: 'MANUAL', status: 'NEW', statusLabel: 'Mới', handledById: null, outcomeNote: null,
    createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

function mountCard(viewing, client) {
  const theClient = client ?? newClient()
  const tree = React.createElement(QueryClientProvider, { client: theClient }, React.createElement(ViewingCard, { viewing }))
  return { client: theClient, tree }
}

function mountPage(selectedBuildingId, client) {
  const theClient = client ?? newClient()
  const value = { selectedBuildingId, setSelectedBuildingId: () => {} }
  const tree = React.createElement(QueryClientProvider, { client: theClient },
    React.createElement(BuildingSelectionContext.Provider, { value }, React.createElement(ViewingsPage)))
  return { client: theClient, tree }
}

// Probe query so onSettled's invalidateQueries(['viewings']) can be observed to trigger a refetch, even on a
// failed mutation. Test harness, not a stub of ViewingCard/ViewingsPage.
function ViewingsProbe() {
  useQuery({ queryKey: ['viewings'], queryFn: () => fetch('/api/v1/__probe_viewings').then(r => r.json()) })
  return null
}

test.beforeEach(() => { windowOpenSpy.calls = 0 })

// ======================================================================================
// VIEW-04 — button set per status (hard table, no inference)
// ======================================================================================

test('VIEW-04: a NEW card shows "Xác nhận", "Hủy lịch", "Đổi ngày/giờ"; never "Không thành" or "Chốt"', async () => {
  const { tree } = mountCard(baseViewing({ status: 'NEW', statusLabel: 'Mới' }))
  const app = await mount(tree)
  assert.ok(buttonByText(app.container, 'Xác nhận'))
  assert.ok(buttonByText(app.container, 'Hủy lịch'))
  assert.ok(buttonByText(app.container, 'Đổi ngày/giờ'))
  assert.ok(!buttonByText(app.container, 'Không thành'))
  assert.ok(!buttonByText(app.container, 'Chốt'))
  await app.stop()
})

test('VIEW-04/05: a CONFIRMED card shows "Không thành", "Hủy lịch", "Đổi ngày/giờ" and a disabled "Chốt" (contracts are Phase 3); never "Xác nhận"', async () => {
  const { tree } = mountCard(baseViewing({ status: 'CONFIRMED', statusLabel: 'Đã xác nhận' }))
  const app = await mount(tree)
  assert.ok(buttonByText(app.container, 'Không thành'))
  assert.ok(buttonByText(app.container, 'Hủy lịch'))
  assert.ok(buttonByText(app.container, 'Đổi ngày/giờ'))
  assert.ok(!buttonByText(app.container, 'Xác nhận'))
  const won = buttonByText(app.container, 'Chốt')
  assert.ok(won, 'a CONFIRMED card shows "Chốt"')
  assert.ok(won.disabled === true || won.hasAttribute('disabled'), '"Chốt" must be disabled until contracts exist (VIEW-05)')
  await app.stop()
})

test('VIEW-04: WON, LOST and CANCELLED cards show no status-change button at all', async () => {
  for (const [status, statusLabel] of [['WON', 'Đã chốt'], ['LOST', 'Không thành'], ['CANCELLED', 'Đã hủy']]) {
    const { tree } = mountCard(baseViewing({ status, statusLabel }))
    const app = await mount(tree)
    for (const label of ['Xác nhận', 'Không thành', 'Hủy lịch', 'Đổi ngày/giờ', 'Chốt']) {
      assert.ok(!buttonByText(app.container, label), `status ${status} must not show button "${label}"`)
    }
    await app.stop()
  }
})

// ======================================================================================
// VIEW-04 — "Xác nhận" sends exactly {status:'CONFIRMED'}
// ======================================================================================

test('VIEW-04: clicking "Xác nhận" on a NEW card PATCHes /viewings/:id with body {status:"CONFIRMED"} only', async () => {
  const calls = fakeFetch([{ prefix: '/viewings/1', method: 'PATCH', handler: () => ok(baseViewing({ status: 'CONFIRMED', statusLabel: 'Đã xác nhận' })) }])
  const { tree } = mountCard(baseViewing({ status: 'NEW' }))
  const app = await mount(tree)
  dispatch(app.container, buttonByText(app.container, 'Xác nhận'), 'click')
  await wait(30)
  const patch = calls.find(c => c.method === 'PATCH')
  assert.ok(patch, 'PATCH /viewings/1 must have been sent')
  assert.deepEqual(JSON.parse(patch.body), { status: 'CONFIRMED' })
  await app.stop()
})

// ======================================================================================
// VIEW-04/Q-P6-3 — two-step "Không thành" (note REQUIRED) and "Hủy lịch" (note optional)
// ACCEPTED two-step behavior, see file header note.
// ======================================================================================

test('VIEW-04/Q-P6-3: "Không thành" opens a note panel; saving with an empty note is blocked client-side ("Cần ghi kết quả khi đánh dấu không thành"), filling it sends {status:"LOST", outcomeNote:...}', async () => {
  const calls = fakeFetch([{ prefix: '/viewings/1', method: 'PATCH', handler: () => ok(baseViewing({ status: 'LOST', statusLabel: 'Không thành' })) }])
  const { tree } = mountCard(baseViewing({ status: 'CONFIRMED' }))
  const app = await mount(tree)
  dispatch(app.container, buttonByText(app.container, 'Không thành'), 'click')
  await wait(20)
  assert.ok(buttonByText(app.container, 'Lưu'), 'the note panel must open with a "Lưu" button')
  // Step 1: save with an empty note is blocked by zod, no request sent.
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 0, 'empty required note must not be sent')
  assert.ok(app.container.textContent.includes('Cần ghi kết quả khi đánh dấu không thành'))
  // Step 2: fill the note, save again.
  const by = byLabel(app.container)
  fill(app.container, by('Ghi chú kết quả', 'TEXTAREA'), 'Khách chọn nơi khác')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  const patch = calls.find(c => c.method === 'PATCH')
  assert.ok(patch)
  assert.deepEqual(JSON.parse(patch.body), { status: 'LOST', outcomeNote: 'Khách chọn nơi khác' })
  await app.stop()
})

test('Q-P6-3: "Hủy lịch" opens a note panel but the note is optional — saving with no note still sends {status:"CANCELLED"}', async () => {
  const calls = fakeFetch([{ prefix: '/viewings/1', method: 'PATCH', handler: () => ok(baseViewing({ status: 'CANCELLED', statusLabel: 'Đã hủy' })) }])
  const { tree } = mountCard(baseViewing({ status: 'NEW' }))
  const app = await mount(tree)
  dispatch(app.container, buttonByText(app.container, 'Hủy lịch'), 'click')
  await wait(20)
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  const patch = calls.find(c => c.method === 'PATCH')
  assert.ok(patch, 'an empty, optional note must still be allowed to save')
  assert.deepEqual(JSON.parse(patch.body), { status: 'CANCELLED' })
  await app.stop()
})

// ======================================================================================
// VIEW-04 — never send status: 'WON' (set only by contract creation, Phase 3, out of scope here)
// ======================================================================================

test('VIEW-04: no card action (Xác nhận, Không thành+note, Hủy lịch, Đổi ngày/giờ) ever sends status "WON"', async () => {
  const calls = fakeFetch([
    { prefix: '/viewings/1', method: 'PATCH', handler: () => ok(baseViewing({ status: 'CONFIRMED' })) },
    { prefix: '/viewings/2', method: 'PATCH', handler: () => ok(baseViewing({ id: 2, status: 'LOST' })) },
    { prefix: '/viewings/3', method: 'PATCH', handler: () => ok(baseViewing({ id: 3, status: 'CANCELLED' })) },
    { prefix: '/viewings/4', method: 'PATCH', handler: () => ok(baseViewing({ id: 4 })) },
  ])
  const c1 = await mount(mountCard(baseViewing({ id: 1, status: 'NEW' })).tree)
  dispatch(c1.container, buttonByText(c1.container, 'Xác nhận'), 'click')
  await wait(30)

  const c2 = await mount(mountCard(baseViewing({ id: 2, status: 'CONFIRMED' })).tree)
  dispatch(c2.container, buttonByText(c2.container, 'Không thành'), 'click')
  await wait(20)
  fill(c2.container, byLabel(c2.container)('Ghi chú kết quả', 'TEXTAREA'), 'Khách đổi ý')
  dispatch(c2.container, find(c2.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)

  const c3 = await mount(mountCard(baseViewing({ id: 3, status: 'NEW' })).tree)
  dispatch(c3.container, buttonByText(c3.container, 'Hủy lịch'), 'click')
  await wait(20)
  dispatch(c3.container, find(c3.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)

  const c4 = await mount(mountCard(baseViewing({ id: 4, status: 'NEW' })).tree)
  dispatch(c4.container, buttonByText(c4.container, 'Đổi ngày/giờ'), 'click')
  await wait(20)
  dispatch(c4.container, find(c4.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)

  const patches = calls.filter(c => c.method === 'PATCH')
  assert.ok(patches.length >= 4, 'all four actions must have sent a PATCH')
  for (const p of patches) assert.ok(!p.body.includes('WON'), `request body must never contain "WON": ${p.body}`)
  await c1.stop(); await c2.stop(); await c3.stop(); await c4.stop()
})

// ======================================================================================
// VIEW-09 — "Đổi ngày/giờ" sends only visitDate/timeSlot, available at NEW and CONFIRMED
// ======================================================================================

test('VIEW-09: "Đổi ngày/giờ" on a NEW card PATCHes only {visitDate, timeSlot}, no status/outcomeNote', async () => {
  const calls = fakeFetch([{ prefix: '/viewings/1', method: 'PATCH', handler: () => ok(baseViewing({ status: 'NEW' })) }])
  const { tree } = mountCard(baseViewing({ status: 'NEW', visitDate: todayHanoi(), timeSlot: 'MORNING' }))
  const app = await mount(tree)
  dispatch(app.container, buttonByText(app.container, 'Đổi ngày/giờ'), 'click')
  await wait(20)
  const by = byLabel(app.container)
  fill(app.container, by('Ngày xem'), plusDays(todayHanoi(), 3))
  fill(app.container, by('Khung giờ', 'SELECT'), 'EVENING')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  const patch = calls.find(c => c.method === 'PATCH')
  assert.ok(patch)
  const body = JSON.parse(patch.body)
  assert.deepEqual(Object.keys(body).sort(), ['timeSlot', 'visitDate'])
  assert.deepEqual(body, { visitDate: plusDays(todayHanoi(), 3), timeSlot: 'EVENING' })
  await app.stop()
})

test('VIEW-09: "Đổi ngày/giờ" is also available on a CONFIRMED card', async () => {
  fakeFetch([{ prefix: '/viewings/1', method: 'PATCH', handler: () => ok(baseViewing({ status: 'CONFIRMED' })) }])
  const { tree } = mountCard(baseViewing({ status: 'CONFIRMED' }))
  const app = await mount(tree)
  assert.ok(buttonByText(app.container, 'Đổi ngày/giờ'))
  await app.stop()
})

test('VIEW-09: a 409 CONFLICT_STATE while rescheduling shows error.message and still refetches the viewings list (onSettled invalidates regardless of outcome)', async () => {
  const calls = fakeFetch([
    { prefix: '/viewings/1', method: 'PATCH', handler: () => fail(409, 'CONFLICT_STATE', 'Lịch hẹn vừa bị hủy, vui lòng tải lại') },
    { prefix: '/__probe_viewings', method: 'GET', handler: () => ok({ probe: 'viewings' }) },
  ])
  const client = newClient()
  const tree = React.createElement(QueryClientProvider, { client },
    React.createElement(ViewingsProbe), React.createElement(ViewingCard, { viewing: baseViewing({ status: 'NEW' }) }))
  const app = await mount(tree)
  await wait(30)
  const before = calls.filter(c => c.url.includes('__probe_viewings')).length
  dispatch(app.container, buttonByText(app.container, 'Đổi ngày/giờ'), 'click')
  await wait(20)
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(60)
  assert.ok(app.container.textContent.includes('Lịch hẹn vừa bị hủy, vui lòng tải lại'))
  const after = calls.filter(c => c.url.includes('__probe_viewings')).length
  assert.ok(after > before, 'invalidateQueries(["viewings"]) must still refetch after a failed mutation')
  await app.stop()
})

// ======================================================================================
// VIEW-08 — reschedule respects today..today+30 (FE never computes slot-started itself)
// ======================================================================================

test('VIEW-08: changing the reschedule date to today+31 is blocked client-side, no request sent', async () => {
  const calls = fakeFetch([{ prefix: '/viewings/1', method: 'PATCH', handler: () => ok(baseViewing({})) }])
  const { tree } = mountCard(baseViewing({ status: 'NEW' }))
  const app = await mount(tree)
  dispatch(app.container, buttonByText(app.container, 'Đổi ngày/giờ'), 'click')
  await wait(20)
  const by = byLabel(app.container)
  fill(app.container, by('Ngày xem'), plusDays(todayHanoi(), 31))
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 0, 'today+31 must be blocked by the FE schema before any request')
  await app.stop()
})

// ======================================================================================
// VIEW-10 — statusLabel is shown exactly as the API sends it, never recomputed by the FE
// ======================================================================================

test('VIEW-10: all 5 statuses render exactly the statusLabel the API sends (UI-02, no FE mapping)', async () => {
  const cases = [['NEW', 'Mới'], ['CONFIRMED', 'Đã xác nhận'], ['WON', 'Đã chốt'], ['LOST', 'Không thành'], ['CANCELLED', 'Đã hủy']]
  for (const [status, statusLabel] of cases) {
    const { tree } = mountCard(baseViewing({ status, statusLabel }))
    const app = await mount(tree)
    assert.ok(app.container.textContent.includes(statusLabel), `status ${status} must show its API statusLabel "${statusLabel}"`)
    await app.stop()
  }
  // Prove it is not hardcoded: an unusual label string from the API must still appear verbatim.
  const { tree } = mountCard(baseViewing({ status: 'NEW', statusLabel: 'Mới (kiểm tra)' }))
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('Mới (kiểm tra)'))
  await app.stop()
})

// ======================================================================================
// SCOPE-02 — buildingId only sent when a single building is selected
// ======================================================================================

test('SCOPE-02: GET /viewings carries buildingId=5 only when a single building is selected; "all" and null send none', async () => {
  for (const [selection, expectBuildingId] of [[5, '5'], ['all', null], [null, null]]) {
    const calls = fakeFetch([{ prefix: '/viewings', method: 'GET', handler: () => ok([], pageMeta([])) }])
    const { tree } = mountPage(selection)
    const app = await mount(tree)
    await wait(30)
    const get = calls.find(c => c.method === 'GET' && c.url.includes('/viewings?'))
    assert.ok(get, `selection ${selection}: a GET /viewings must have been sent`)
    assert.equal(queryOf(get.url).get('buildingId'), expectBuildingId, `selection ${selection}`)
    await app.stop()
  }
})

// ======================================================================================
// Q-FE8B-5 — default date range today..today+30, editable, from>to blocked
// ======================================================================================

test('Q-FE8B-5: the first load requests from=today and to=today+30 (Asia/Ho_Chi_Minh), and both date inputs show those values', async () => {
  const calls = fakeFetch([{ prefix: '/viewings', method: 'GET', handler: () => ok([], pageMeta([])) }])
  const { tree } = mountPage(5)
  const app = await mount(tree)
  await wait(30)
  const get = calls.find(c => c.method === 'GET' && c.url.includes('/viewings?'))
  assert.ok(get)
  assert.equal(queryOf(get.url).get('from'), todayHanoi())
  assert.equal(queryOf(get.url).get('to'), plusDays(todayHanoi(), 30))
  const by = byLabel(app.container)
  assert.equal(by('Từ ngày').value, todayHanoi())
  assert.equal(by('Đến ngày').value, plusDays(todayHanoi(), 30))
  await app.stop()
})

test('Q-FE8B-5: changing "Từ ngày" to today+5 sends a new request with that from, keeping to unchanged', async () => {
  const calls = fakeFetch([{ prefix: '/viewings', method: 'GET', handler: () => ok([], pageMeta([])) }])
  const { tree } = mountPage(5)
  const app = await mount(tree)
  await wait(30)
  const by = byLabel(app.container)
  fill(app.container, by('Từ ngày'), plusDays(todayHanoi(), 5))
  await wait(30)
  const gets = calls.filter(c => c.method === 'GET' && c.url.includes('/viewings?'))
  const last = gets[gets.length - 1]
  assert.equal(queryOf(last.url).get('from'), plusDays(todayHanoi(), 5))
  assert.equal(queryOf(last.url).get('to'), plusDays(todayHanoi(), 30))
  await app.stop()
})

test('Q-FE8B-5/ASSUMPTION FE8B-8: setting "Từ ngày" after "Đến ngày" blocks with "Từ ngày phải trước hoặc bằng Đến ngày" and sends no new request', async () => {
  const calls = fakeFetch([{ prefix: '/viewings', method: 'GET', handler: () => ok([], pageMeta([])) }])
  const { tree } = mountPage(5)
  const app = await mount(tree)
  await wait(30)
  const before = calls.length
  const by = byLabel(app.container)
  // Default "Đến ngày" is today+30; today+31 is after it.
  fill(app.container, by('Từ ngày'), plusDays(todayHanoi(), 31))
  await wait(30)
  assert.equal(calls.length, before, 'an invalid range must not fetch')
  assert.ok(app.container.textContent.includes('Từ ngày phải trước hoặc bằng Đến ngày'))
  await app.stop()
})

// ======================================================================================
// Q-FE8B-4 — "Gọi" (tel:, same tab) and "Zalo" (new tab, noopener+noreferrer), plain <a>, no window.open
// ======================================================================================

test('Q-FE8B-4: "Gọi" is <a href="tel:0901234567"> with no target', async () => {
  const { tree } = mountCard(baseViewing({ guestPhone: '0901234567' }))
  const app = await mount(tree)
  const call = anchorByText(app.container, 'Gọi')
  assert.ok(call)
  assert.equal(call.getAttribute('href'), 'tel:0901234567')
  assert.equal(call.getAttribute('target'), null)
  await app.stop()
})

test('Q-FE8B-4: "Zalo" is <a href="https://zalo.me/0901234567" target="_blank" rel="noopener noreferrer"> (both tokens required)', async () => {
  const { tree } = mountCard(baseViewing({ guestPhone: '0901234567' }))
  const app = await mount(tree)
  const zalo = anchorByText(app.container, 'Zalo')
  assert.ok(zalo)
  assert.equal(zalo.getAttribute('href'), 'https://zalo.me/0901234567')
  assert.equal(zalo.getAttribute('target'), '_blank')
  const rel = (zalo.getAttribute('rel') ?? '').split(/\s+/)
  assert.ok(rel.includes('noopener'), 'rel must include noopener')
  assert.ok(rel.includes('noreferrer'), 'rel must include noreferrer')
  await app.stop()
})

test('Q-FE8B-4: neither ViewingCard.tsx nor ViewingsPage.tsx calls window.open, and clicking the links never calls it', async () => {
  assert.ok(!viewingCardSource.includes('window.open'), 'ViewingCard.tsx must not use window.open')
  assert.ok(!viewingsPageSource.includes('window.open'), 'ViewingsPage.tsx must not use window.open')
  const { tree } = mountCard(baseViewing({ guestPhone: '0901234567' }))
  const app = await mount(tree)
  dispatch(app.container, anchorByText(app.container, 'Gọi'), 'click')
  dispatch(app.container, anchorByText(app.container, 'Zalo'), 'click')
  await wait(20)
  assert.equal(windowOpenSpy.calls, 0)
  await app.stop()
})

// ======================================================================================
// VIEW-03 — "Thêm lịch hẹn" disabled with a hint when no building is selected
// ======================================================================================

test('VIEW-03: with no building selected, "Thêm lịch hẹn" is disabled and the page shows "Chọn một tòa ở thanh chọn tòa để thêm lịch hẹn."', async () => {
  fakeFetch([{ prefix: '/viewings', method: 'GET', handler: () => ok([], pageMeta([])) }])
  const { tree } = mountPage(null)
  const app = await mount(tree)
  await wait(30)
  const addButton = buttonByText(app.container, 'Thêm lịch hẹn')
  assert.ok(addButton)
  assert.ok(addButton.disabled === true || addButton.hasAttribute('disabled'))
  assert.ok(app.container.textContent.includes('Chọn một tòa ở thanh chọn tòa để thêm lịch hẹn.'))
  await app.stop()
})

// ======================================================================================
// UI-03 — 4 list states: loading / empty / error+"Thử lại" / data
// ======================================================================================

test('UI-03: loading shows a Spinner ("Đang xử lý"); empty shows "Chưa có lịch hẹn nào trong khoảng ngày này"; error shows error.message + "Thử lại" which refetches; data renders the card', async () => {
  // loading: a fetch that never resolves within the observation window
  let resolveSlow
  globalThis.fetch = () => new Promise(r => { resolveSlow = r })
  const loadingApp = await mount(mountPage(5).tree)
  await wait(20)
  assert.ok(loadingApp.container.textContent.includes('Đang xử lý'))
  resolveSlow(new Response(JSON.stringify({ data: [], meta: { page: 1, limit: 100, total: 0 } }), { status: 200 }))
  await wait(20)
  await loadingApp.stop()

  // empty
  fakeFetch([{ prefix: '/viewings', method: 'GET', handler: () => ok([], pageMeta([])) }])
  const emptyApp = await mount(mountPage(5).tree)
  await wait(30)
  assert.ok(emptyApp.container.textContent.includes('Chưa có lịch hẹn nào trong khoảng ngày này'))
  await emptyApp.stop()

  // error + "Thử lại" triggers a refetch
  let errorCalls = 0
  globalThis.fetch = async () => { errorCalls += 1; return new Response(JSON.stringify({ error: { code: 'NETWORK_ERROR', message: 'Không tải được danh sách lịch hẹn' } }), { status: 500 }) }
  const errorApp = await mount(mountPage(5).tree)
  await wait(30)
  assert.ok(errorApp.container.textContent.includes('Không tải được danh sách lịch hẹn'))
  const retry = buttonByText(errorApp.container, 'Thử lại')
  assert.ok(retry)
  const before = errorCalls
  dispatch(errorApp.container, retry, 'click')
  await wait(30)
  assert.ok(errorCalls > before, '"Thử lại" must trigger a new request')
  await errorApp.stop()

  // data
  fakeFetch([{ prefix: '/viewings', method: 'GET', handler: () => ok([baseViewing({})], pageMeta([baseViewing({})])) }])
  const dataApp = await mount(mountPage(5).tree)
  await wait(30)
  assert.ok(dataApp.container.textContent.includes('A101'))
  assert.ok(dataApp.container.textContent.includes('Nguyễn Văn A'))
  await dataApp.stop()
})

// ======================================================================================
// UI-01 — the visit date heading is dd/mm/yyyy via formatDate, no timezone shift
// ======================================================================================

test('UI-01: the day heading shows the visitDate as dd/mm/yyyy via formatDate, with no timezone shift', async () => {
  fakeFetch([{ prefix: '/viewings', method: 'GET', handler: () => ok([baseViewing({ visitDate: '2026-02-05' })], pageMeta([baseViewing({})])) }])
  const { tree } = mountPage(5)
  const app = await mount(tree)
  await wait(30)
  assert.equal(formatDate('2026-02-05'), '05/02/2026')
  assert.ok(app.container.textContent.includes('05/02/2026'), 'the heading must show 05/02/2026, not shifted by timezone math')
  await app.stop()
})
