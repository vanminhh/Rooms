import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

// CP-5 (FE-P2-12, PLAN.md CP-5): src/features/viewings/api.ts, src/features/viewings/schemas.ts,
// src/features/viewings/ViewingForm.tsx. Spec/PLAN: VIEW-01, VIEW-03, VIEW-08, SCOPE-02, UI-05, UI-08, UI-09.
// PLAN CP-5 explicitly has NO Idempotency-Key for createViewing/updateViewing (unlike pricing's CP-1..CP-4);
// ViewingForm invalidates both ['viewings'] and ['dashboard'] on success (StaffHomePage's two cards, CP-7).
//
// Outside edges faked: globalThis.fetch (network) and the minimal fake DOM below (same shape as
// fe09-room-price.test.mjs / cp7-rooms.test.mjs; Node has none, no jsdom installed). Every module under test
// (ViewingForm, viewings/api.ts, viewings/schemas.ts) is transpiled and run unmodified, mounted with real
// react-dom/client, real @tanstack/react-query, real react-hook-form + zod. ViewingForm reads no auth context,
// so it is mounted under a plain QueryClientProvider.

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = draftSrcRoot // approved fix 2026-11-05-FE-P2-8a-test-path-fix: path-depth independent

// ---------- minimal real DOM (same shape as fe09-room-price.test.mjs) ----------
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
    // Real browsers set a non-empty .type on <input>/<select>/<textarea> (e.g. HTMLSelectElement.type ===
    // 'select-one'); react-hook-form's onChange handler branches on `target.type` to decide whether to apply
    // valueAsNumber (getFieldValue) or not (getEventValue). Without this, <select valueAsNumber> would silently
    // stop converting in this fake DOM even though it works in a real browser.
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
  // Minimal HTMLSelectElement/HTMLOptionElement surface: react-hook-form's register() ref callback reads
  // select.options/.multiple/.size/.selectedIndex (to compute an "edited before ready" flag) once a <select>
  // reports a real .type ('select-one'), which a real browser always does. Only the bits that code touches.
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

const { ViewingForm } = load(resolve(draftSrcRoot, 'features/viewings/ViewingForm.tsx'))

// ---------- DOM query / event helpers (same style as fe09-room-price.test.mjs) ----------
const wait = ms => new Promise(r => setTimeout(r, ms))
const walkTree = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
const find = (root, pred) => walkTree(root).filter(n => n.nodeType === 1 && pred(n))
const buttons = container => find(container, n => n.tagName === 'BUTTON')
const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
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

// React's ChangeEventPlugin only recognizes a <select> value change on the native 'change' event (verified
// against node_modules/react-dom: getTargetInstForChangeEvent returns a fiber only when domEventName === 'change');
// text <input>/<textarea> are tracked via the native 'input' event instead. fill() picks the right one so
// react-hook-form's registered onChange actually fires for both kinds of controls.
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

// Probe queries so UI-09 can tell whether invalidateQueries(['viewings']) and (['dashboard']) actually mark
// those keys as needing a refetch — this is test harness, not a stub of ViewingForm itself.
function ViewingsProbe() {
  useQuery({ queryKey: ['viewings'], queryFn: () => fetch('/api/v1/__probe_viewings').then(r => r.json()) })
  return null
}
function DashboardProbe() {
  useQuery({ queryKey: ['dashboard'], queryFn: () => fetch('/api/v1/__probe_dashboard').then(r => r.json()) })
  return null
}

const onSavedSpy = { calls: 0, fn: () => { onSavedSpy.calls += 1 } }
const onCancelSpy = { calls: 0, fn: () => { onCancelSpy.calls += 1 } }

function mountForm({ buildingId = 5, client, withProbes = false } = {}) {
  const theClient = client ?? newClient()
  const probes = withProbes ? [React.createElement(ViewingsProbe, { key: 'vp' }), React.createElement(DashboardProbe, { key: 'dp' })] : []
  const tree = React.createElement(QueryClientProvider, { client: theClient },
    ...probes, React.createElement(ViewingForm, { buildingId, onSaved: onSavedSpy.fn, onCancel: onCancelSpy.fn }))
  return { client: theClient, tree }
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

function roomsRule(rooms = [{ id: 10, buildingId: 5, code: 'A101', floor: 1, areaM2: 20, price: 3_000_000, maxOccupants: 2, underMaintenance: false, isActive: true, status: 'Trống', pendingProposal: null, imageCount: 0 }]) {
  return { prefix: '/rooms', method: 'GET', handler: () => ok(rooms, pageMeta(rooms, 100)) }
}

const { todayHanoi, plusDays } = load(resolve(draftSrcRoot, 'features/pricing/labels.ts'))

// Fills every field with a value known to be valid, then overrides with `overrides` before returning the fns
// needed to submit. Centralizing the "valid baseline" keeps each scenario below to a single varied field.
async function fillValidForm(app, overrides = {}) {
  const by = byLabel(app.container)
  const roomSelect = by('Phòng', 'SELECT')
  fill(app.container, roomSelect, overrides.roomId ?? '10')
  fill(app.container, by('Họ tên khách'), overrides.guestName ?? 'Nguyễn Văn A')
  fill(app.container, by('Số điện thoại'), overrides.guestPhone ?? '0901234567')
  fill(app.container, by('Ngày xem'), overrides.visitDate ?? todayHanoi())
  fill(app.container, by('Khung giờ', 'SELECT'), overrides.timeSlot ?? 'MORNING')
  if (overrides.note !== undefined) fill(app.container, by('Ghi chú', 'TEXTAREA'), overrides.note)
}

function submit(app) {
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
}

test.beforeEach(() => { onSavedSpy.calls = 0; onCancelSpy.calls = 0 })

// ======================================================================================
// VIEW-03 — the happy path: exact POST body, no extra fields, no "source"
// ======================================================================================

test('VIEW-03: filling every field and submitting POSTs /viewings with exactly roomId/guestName/guestPhone/visitDate/timeSlot/note, no "source"', async () => {
  const calls = fakeFetch([roomsRule(), { prefix: '/viewings', method: 'POST', handler: () => ok({ id: 1, roomId: 10, roomCode: 'A101', buildingId: 5, buildingName: 'Tòa B1', guestName: 'Nguyễn Văn A', guestPhone: '0901234567', visitDate: todayHanoi(), timeSlot: 'MORNING', timeSlotLabel: 'Sáng (8:00–11:00)', note: 'Khách hẹn xem chiều', source: 'MANUAL', status: 'NEW', statusLabel: 'Mới', handledById: null, outcomeNote: null, createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' }) }])
  const { tree } = mountForm()
  const app = await mount(tree)
  await fillValidForm(app, { note: 'Khách hẹn xem chiều' })
  submit(app)
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post, 'POST /viewings must have been sent')
  const body = JSON.parse(post.body)
  assert.deepEqual(body, { roomId: 10, guestName: 'Nguyễn Văn A', guestPhone: '0901234567', visitDate: todayHanoi(), timeSlot: 'MORNING', note: 'Khách hẹn xem chiều' })
  assert.ok(!('source' in body), 'the FE must never send "source"; the API decides WEB vs MANUAL')
  await app.stop()
})

// ======================================================================================
// VIEW-01 — guestPhone / guestName boundaries
// ======================================================================================

test('VIEW-01: guestPhone — 10 digits starting with 0 passes; 9 digits, leading 1, and 11 digits are all blocked client-side', async () => {
  for (const [phone, shouldSend] of [['0901234567', true], ['090123456', false], ['1901234567', false], ['09012345678', false]]) {
    const calls = fakeFetch([roomsRule(), { prefix: '/viewings', method: 'POST', handler: () => ok({}) }])
    const { tree } = mountForm()
    const app = await mount(tree)
    await fillValidForm(app, { guestPhone: phone })
    submit(app)
    await wait(30)
    const sent = calls.some(c => c.method === 'POST')
    assert.equal(sent, shouldSend, `guestPhone "${phone}": expected request sent = ${shouldSend}`)
    await app.stop()
  }
})

test('VIEW-01: guestName — 1 char is blocked, 2 and 100 chars pass, 101 chars is blocked', async () => {
  for (const [length, shouldSend] of [[1, false], [2, true], [100, true], [101, false]]) {
    const calls = fakeFetch([roomsRule(), { prefix: '/viewings', method: 'POST', handler: () => ok({}) }])
    const { tree } = mountForm()
    const app = await mount(tree)
    await fillValidForm(app, { guestName: 'A'.repeat(length) })
    submit(app)
    await wait(30)
    const sent = calls.some(c => c.method === 'POST')
    assert.equal(sent, shouldSend, `guestName length ${length}: expected request sent = ${shouldSend}`)
    await app.stop()
  }
})

// ======================================================================================
// VIEW-08 — visitDate boundary (today .. today+30, Asia/Ho_Chi_Minh), slot labels, BE slot-started error
// ======================================================================================

test('VIEW-08: visitDate — yesterday is blocked, today and today+30 pass, today+31 is blocked (boundary via todayHanoi/plusDays, Asia/Ho_Chi_Minh)', async () => {
  const cases = [[plusDays(todayHanoi(), -1), false], [todayHanoi(), true], [plusDays(todayHanoi(), 30), true], [plusDays(todayHanoi(), 31), false]]
  for (const [date, shouldSend] of cases) {
    const calls = fakeFetch([roomsRule(), { prefix: '/viewings', method: 'POST', handler: () => ok({}) }])
    const { tree } = mountForm()
    const app = await mount(tree)
    await fillValidForm(app, { visitDate: date })
    submit(app)
    await wait(30)
    const sent = calls.some(c => c.method === 'POST')
    assert.equal(sent, shouldSend, `visitDate ${date}: expected request sent = ${shouldSend}`)
    await app.stop()
  }
})

test('VIEW-08: the three time-slot options read exactly "Sáng (8:00–11:00)", "Chiều (14:00–17:00)", "Tối (18:00–20:00)"', async () => {
  const { tree } = mountForm()
  const app = await mount(tree)
  const by = byLabel(app.container)
  const select = by('Khung giờ', 'SELECT')
  const optionTexts = find(select, n => n.tagName === 'OPTION').map(o => o.textContent.trim())
  assert.deepEqual(optionTexts, ['—', 'Sáng (8:00–11:00)', 'Chiều (14:00–17:00)', 'Tối (18:00–20:00)'])
  await app.stop()
})

test('VIEW-08: a 400 fields.timeSlot "Khung giờ này hôm nay đã bắt đầu, vui lòng chọn khung giờ khác" is shown next to the time-slot field (the FE never computes this itself)', async () => {
  fakeFetch([roomsRule(), { prefix: '/viewings', method: 'POST', handler: () => fail(400, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ', { timeSlot: 'Khung giờ này hôm nay đã bắt đầu, vui lòng chọn khung giờ khác' }) }])
  const { tree } = mountForm()
  const app = await mount(tree)
  await fillValidForm(app)
  submit(app)
  await wait(30)
  assert.ok(app.container.textContent.includes('Khung giờ này hôm nay đã bắt đầu, vui lòng chọn khung giờ khác'))
  await app.stop()
})

// ======================================================================================
// VIEW-03 — note boundary, 409 CONFLICT_STATE, SCOPE-02 OUT_OF_SCOPE
// ======================================================================================

test('VIEW-03: note — 500 chars passes, 501 chars is blocked client-side', async () => {
  for (const [length, shouldSend] of [[500, true], [501, false]]) {
    const calls = fakeFetch([roomsRule(), { prefix: '/viewings', method: 'POST', handler: () => ok({}) }])
    const { tree } = mountForm()
    const app = await mount(tree)
    await fillValidForm(app, { note: 'x'.repeat(length) })
    submit(app)
    await wait(30)
    const sent = calls.some(c => c.method === 'POST')
    assert.equal(sent, shouldSend, `note length ${length}: expected request sent = ${shouldSend}`)
    await app.stop()
  }
})

test('VIEW-03: a 409 CONFLICT_STATE (room just got locked) shows error.message and does not close the form (onSaved not called)', async () => {
  fakeFetch([roomsRule(), { prefix: '/viewings', method: 'POST', handler: () => fail(409, 'CONFLICT_STATE', 'Phòng đã bị khóa, không thể thêm lịch hẹn') }])
  const { tree } = mountForm()
  const app = await mount(tree)
  await fillValidForm(app)
  submit(app)
  await wait(30)
  assert.ok(app.container.textContent.includes('Phòng đã bị khóa, không thể thêm lịch hẹn'))
  assert.equal(onSavedSpy.calls, 0, 'onSaved must not be called after a failed submit')
  await app.stop()
})

test('SCOPE-02: a 403 OUT_OF_SCOPE shows error.message', async () => {
  fakeFetch([roomsRule(), { prefix: '/viewings', method: 'POST', handler: () => fail(403, 'OUT_OF_SCOPE', 'Bạn không có quyền với tòa này') }])
  const { tree } = mountForm()
  const app = await mount(tree)
  await fillValidForm(app)
  submit(app)
  await wait(30)
  assert.ok(app.container.textContent.includes('Bạn không có quyền với tòa này'))
  assert.equal(onSavedSpy.calls, 0)
  await app.stop()
})

// ======================================================================================
// UI-09 — invalidate BOTH ['viewings'] and ['dashboard'] on success, then close
// ======================================================================================

test('UI-09: a successful submit invalidates both ["viewings"] and ["dashboard"], and closes the form (onSaved called once)', async () => {
  const calls = fakeFetch([
    roomsRule(),
    { prefix: '/viewings', method: 'POST', handler: () => ok({ id: 1 }) },
    { prefix: '/__probe_viewings', method: 'GET', handler: () => ok({ probe: 'viewings' }) },
    { prefix: '/__probe_dashboard', method: 'GET', handler: () => ok({ probe: 'dashboard' }) },
  ])
  const client = newClient()
  const { tree } = mountForm({ client, withProbes: true })
  const app = await mount(tree)
  await wait(30)
  const before = { viewings: calls.filter(c => c.url.includes('__probe_viewings')).length, dashboard: calls.filter(c => c.url.includes('__probe_dashboard')).length }
  await fillValidForm(app)
  submit(app)
  await wait(60)
  const after = { viewings: calls.filter(c => c.url.includes('__probe_viewings')).length, dashboard: calls.filter(c => c.url.includes('__probe_dashboard')).length }
  assert.ok(after.viewings > before.viewings, 'invalidateQueries(["viewings"]) must trigger a refetch of the active ["viewings"] probe query')
  assert.ok(after.dashboard > before.dashboard, 'invalidateQueries(["dashboard"]) must trigger a refetch of the active ["dashboard"] probe query')
  assert.equal(onSavedSpy.calls, 1, 'onSaved must be called exactly once after a successful submit')
  await app.stop()
})

// ======================================================================================
// PLAN CP-5 note: unlike pricing's propose/approve/reject, createViewing/updateViewing carry NO Idempotency-Key
// ======================================================================================

test('CP-5 (PLAN note): POST /viewings carries no "Idempotency-Key" header', async () => {
  const calls = fakeFetch([roomsRule(), { prefix: '/viewings', method: 'POST', handler: () => ok({ id: 1 }) }])
  const { tree } = mountForm()
  const app = await mount(tree)
  await fillValidForm(app)
  submit(app)
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post)
  assert.ok(!('Idempotency-Key' in post.headers), 'CP-5 (PLAN.md): createViewing must not send an Idempotency-Key header')
  await app.stop()
})

// ======================================================================================
// UI-08 — accessible markup; literal "—" placeholder and "Hủy" cancel button
// ======================================================================================

test('UI-08: every control has its own <label>, actions are real <button>s, and the two selects start with the placeholder "—"', async () => {
  const { tree } = mountForm()
  const app = await mount(tree)
  const by = byLabel(app.container)
  const roomSelect = by('Phòng', 'SELECT')
  const nameInput = by('Họ tên khách', 'INPUT')
  const phoneInput = by('Số điện thoại', 'INPUT')
  const dateInput = by('Ngày xem', 'INPUT')
  const slotSelect = by('Khung giờ', 'SELECT')
  const noteArea = by('Ghi chú', 'TEXTAREA')
  for (const el of [roomSelect, nameInput, phoneInput, dateInput, slotSelect, noteArea]) {
    assert.equal(find(app.container, n => n.tagName === 'LABEL' && n.getAttribute('for') === el.getAttribute('id')).length, 1)
  }
  assert.equal(find(roomSelect, n => n.tagName === 'OPTION')[0].textContent.trim(), '—', 'the room select must start with the "—" placeholder')
  assert.equal(find(slotSelect, n => n.tagName === 'OPTION')[0].textContent.trim(), '—', 'the time-slot select must start with the "—" placeholder')
  assert.ok(buttonByText(app.container, 'Lưu'))
  assert.ok(buttonByText(app.container, 'Hủy'))
  await app.stop()
})

test('UI-08/onCancel: clicking "Hủy" calls onCancel and sends no request', async () => {
  const calls = fakeFetch([roomsRule()])
  const { tree } = mountForm()
  const app = await mount(tree)
  await wait(30)
  const requestsBefore = calls.length
  dispatch(app.container, buttonByText(app.container, 'Hủy'), 'click')
  await wait(20)
  assert.equal(onCancelSpy.calls, 1)
  assert.equal(calls.length, requestsBefore, '"Hủy" must not send any request')
  await app.stop()
})
