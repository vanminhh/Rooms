import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

// CP-5 (FE-P2-05): src/pages/staff/{BuildingsPage,BuildingDetailPage}.tsx and
// src/features/buildings/{BuildingForm,ServiceForm,ServicesPanel,BuildingLockControl,fields,labels}.tsx.
// Spec/PLAN: BLD-01/02/03/06/07, SVC-01/02/04, VIEW-13, UI-03/05/09, SCOPE-02, PLAN "Quyết định kỹ thuật CP-4"
// Q5 (BuildingDetailPage uses listBuildings({buildingId,limit:1,includeInactive}), there is no GET /buildings/:id).
//
// Outside edges faked: globalThis.fetch only (network). Every module under test (BuildingsPage,
// BuildingDetailPage, BuildingForm, BuildingNotesForm, BuildingLockControl, ServiceForm, ServicesPanel,
// fields.tsx, labels.ts) is transpiled and run unmodified, mounted with real react-dom/client on a minimal
// fake DOM (Node has none; no jsdom installed), real @tanstack/react-query, real react-hook-form + zod, and
// the real react-router (MemoryRouter/Routes/Route) so useParams/Link behave like the real router. The kit
// (RoomsButton, FormFields, SectionHeading, ConfirmDialog) and src/app/auth-context.ts are loaded unmodified
// via the same relative-import fallback to main `src/` that the preview tooling documents (draft does not
// redefine them for CP-5, only ConfirmDialog/ImageUploader from CP-3 are draft files).

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = resolve(draftRoot, '..', '..', 'src')
const nodeRequire = createRequire(import.meta.url)

// ---------- minimal real DOM (same shape as cp3-kit.test.mjs, plus value/valueAsNumber/checked helpers
// needed for text/number/select/checkbox form fields, which cp3 did not need) ----------
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
    // a real <input> with no explicit type attribute defaults its IDL .type to "text" (HTML spec); react-dom's
    // isTextInputElement() keys off elem.type to decide whether to treat an <input> as text-like at all, so
    // without this default every plain TextField input (code, name, amenities, ...) is invisible to the
    // ChangeEventPlugin and its onChange/register() handler never fires for it.
    if (this.tagName === 'INPUT') this.type = 'text'
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1) }
  // real <input>.name is set by react-dom as a direct property (ReactDOMInput), but <select>/<textarea>.name
  // only ever goes through setAttribute; a real browser reflects the "name" content attribute onto the IDL
  // property for every form control, so mirror that here instead of only matching React's input shortcut.
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
  // --- form field helpers: real <input>/<select> keep .value as a string and derive .valueAsNumber from it,
  // which react-hook-form (uncontrolled refs) and the number inputs here (dueDays, maxImages...) rely on.
  get value() { return this._value }
  set value(v) { this._value = v == null ? '' : String(v) }
  get valueAsNumber() { return this._value === '' ? NaN : Number(this._value) }
  set valueAsNumber(v) { this._value = Number.isNaN(v) ? '' : String(v) }
  get checked() { return this._checked ?? false }
  set checked(v) { this._checked = !!v }
  get selected() { return this._selected ?? false }
  set selected(v) { this._selected = !!v }
  get multiple() { return this._multiple ?? false }
  set multiple(v) { this._multiple = !!v }
  get disabled() { return this._disabled ?? false }
  set disabled(v) { this._disabled = !!v }
  // real <select>.options is a live HTMLOptionsCollection; react-dom's commit for <select> reads
  // node.options.length/node.options[i] directly (ReactDOMSelect updateOptions) to mark the matching
  // <option> selected, so without it every <select> throws during mount and silently drops from the tree.
  get options() { return this.tagName === 'SELECT' ? this.querySelectorAll('option') : undefined }
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
  // Always try the draft's copy of a module first, even when resolving from a file that itself only exists in
  // main and was reached via the main-fallback below (e.g. shared/form-errors.ts, unchanged in this CP,
  // importing its sibling './api'). Checking main first there would resolve straight to main's shared/api.ts,
  // a SEPARATE compiled module from the draft's shared/api.ts that features/buildings/api.ts throws its
  // ApiError from — two different classes with the same name, so `error instanceof ApiError` in
  // applyApiError would always be false. Routing every resolution through one canonical (draft-first) copy
  // of each file keeps a single module graph, matching the one tree the real app has after apply.
  const draftCandidate = candidate.startsWith(mainSrcRoot) ? candidate.replace(mainSrcRoot, draftSrcRoot) : candidate
  const draftFile = resolveFile(draftCandidate)
  if (draftFile) return draftFile
  // Not overridden in draft: fall back to main (covers both a draft-rooted candidate not present in draft,
  // e.g. components/index.ts importing the pre-existing ./Button, and a main-rooted candidate with no draft
  // override at all).
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
const { MemoryRouter, Routes, Route } = nodeRequire('react-router')

const { BuildingsPage } = load(resolve(draftSrcRoot, 'pages/staff/BuildingsPage.tsx'))
const { BuildingDetailPage } = load(resolve(draftSrcRoot, 'pages/staff/BuildingDetailPage.tsx'))
const { BuildingForm, BuildingNotesForm } = load(resolve(draftSrcRoot, 'features/buildings/BuildingForm.tsx'))
const { BuildingLockControl } = load(resolve(draftSrcRoot, 'features/buildings/BuildingLockControl.tsx'))
const { ServiceForm } = load(resolve(draftSrcRoot, 'features/buildings/ServiceForm.tsx'))
const { ServicesPanel } = load(resolve(draftSrcRoot, 'features/buildings/ServicesPanel.tsx'))
const labels = load(resolve(draftSrcRoot, 'features/buildings/labels.ts'))
const { BuildingSelectionContext } = load(resolve(draftSrcRoot, 'features/buildings/building-selection.ts'))
const { AuthContext } = load(resolve(mainSrcRoot, 'app/auth-context.ts'))

// ---------- DOM query / event helpers (same style as cp3-kit.test.mjs) ----------
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

// React installs an instance-level get/set wrapper on .value/.checked (inputValueTracking.js) that delegates
// to this very prototype setter but ALSO updates its own "last known value" cache on every write, including
// ours. Writing through el.value = x therefore updates the real value but leaves React's cache identical to
// it, so the ChangeEventPlugin sees "no change" and never fires the registered onChange/register() handler,
// and react-hook-form (which updates its internal _formValues only from that handler, not by re-reading the
// DOM) keeps the field at its original default. Calling the ORIGINAL prototype setter directly bypasses that
// wrapper so the cache is NOT updated, and the subsequent dispatch() sees a real mismatch and fires onChange
// correctly — the same workaround React Testing Library uses on real jsdom.
const nativeValueSetter = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'value').set
const nativeCheckedSetter = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'checked').set

// Sets a text/number input, textarea or select's value the way a user typing/choosing would, so react-hook-form's
// registered onChange actually captures it (plain `el.value = x` does not, see note above).
function fill(container, el, value) {
  nativeValueSetter.call(el, String(value))
  dispatch(container, el, el.tagName === 'SELECT' ? 'change' : 'input', { target: el })
}

// Sets a checkbox the way a real click does; React's ChangeEventPlugin treats "click" as the checkbox's change signal.
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

// gcTime short for both queries and mutations (not the default 5 minutes) so these tests exit promptly,
// same reasoning as cp7-rooms.test.mjs. Test-client config only; no assertion changed.
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 }, mutations: { retry: false, gcTime: 1000 } } })
}

function withQuery(children) {
  return React.createElement(QueryClientProvider, { client: newClient() }, children)
}

function withStaffPage({ children, user, selection, routePath, routePattern }) {
  const authValue = { status: 'ready', user, login: async () => { throw new Error('unused in test') }, logout: async () => {}, refreshMe: async () => null, retry() {} }
  const selectionValue = selection ?? { selectedBuildingId: null, setSelectedBuildingId: () => {} }
  const body = React.createElement(AuthContext.Provider, { value: authValue },
    React.createElement(BuildingSelectionContext.Provider, { value: selectionValue },
      React.createElement(MemoryRouter, { initialEntries: [routePath ?? '/'] },
        routePattern
          ? React.createElement(Routes, null, React.createElement(Route, { path: routePattern, element: children }))
          : children)))
  return withQuery(body)
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

const BOSS = { id: 1, role: 'BOSS', phone: '0900000001', fullName: 'Chủ nhà', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [] }
const MANAGER = { id: 2, role: 'MANAGER', phone: '0900000002', fullName: 'Quản lý A', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [{ id: 5, code: 'B1', name: 'Tòa B1' }, { id: 6, code: 'B2', name: 'Tòa B2' }] }

function baseBuilding(overrides = {}) {
  return {
    id: 5, code: 'B1', name: 'Tòa B1', address: '12 Láng Hạ', district: 'Đống Đa', ward: 'Láng Hạ',
    waterMode: 'PER_M3', dueDays: 5, managerId: 2, manager: { id: 2, fullName: 'Quản lý A', isActive: true },
    amenities: ['wifi'], description: 'Mô tả', isActive: true, pendingViewingCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ======================================================================================
// labels.ts — managerText, water/service label maps (BLD-06, SVC-01)
// ======================================================================================

test('BLD-06: managerText(null) shows "Chưa có quản lý"', () => {
  assert.equal(labels.managerText(null), 'Chưa có quản lý')
})

test('BLD-06: managerText keeps showing a locked manager\'s name with "(đã khóa)", an active manager plainly', () => {
  assert.equal(labels.managerText({ id: 1, fullName: 'Nguyễn Văn A', isActive: true }), 'Nguyễn Văn A')
  assert.equal(labels.managerText({ id: 1, fullName: 'Nguyễn Văn A', isActive: false }), 'Nguyễn Văn A (đã khóa)')
})

test('[ASSUMPTION ghi lại nguyên văn, không phải lỗi] waterModeLabels/serviceUnitLabels text is UI wording not fixed by PLAN/spec', () => {
  // PLAN.md CP-4/CP-5 only fixes the enum values (PER_M3/PER_PERSON, ROOM/PERSON/VEHICLE), not their Vietnamese
  // display text; spec 11-buildings-rooms.md SVC-01 names the units in English parentheses only. Recording the
  // coder's literal strings here so the owner can review the wording choice; this is not graded as a failure.
  assert.deepEqual(labels.waterModeLabels, { PER_M3: 'Theo đồng hồ (m³)', PER_PERSON: 'Theo số người' })
  assert.deepEqual(labels.serviceUnitLabels, { ROOM: 'Theo phòng', PERSON: 'Theo người', VEHICLE: 'Theo xe' })
})

// ======================================================================================
// BuildingForm (Boss create/edit) — BLD-01, BLD-06
// ======================================================================================

test('BLD-06: due_days mặc định 5 — creating without touching "Số ngày thu" sends dueDays:5', async () => {
  const calls = fakeFetch([
    { prefix: '/managers', handler: () => ok([], pageMeta([])) },
    { prefix: '/buildings', method: 'POST', handler: () => ok(baseBuilding()) },
  ])
  const app = await mount(withQuery(React.createElement(BuildingForm, {})))
  fill(app.container, byName(app.container, 'code'), 'ab')
  fill(app.container, byName(app.container, 'name'), 'Tòa test')
  fill(app.container, byName(app.container, 'address'), 'Địa chỉ')
  fill(app.container, byName(app.container, 'district'), 'Quận')
  fill(app.container, byName(app.container, 'ward'), 'Phường')
  fill(app.container, byName(app.container, 'waterMode'), 'PER_M3')
  const form = find(app.container, n => n.tagName === 'FORM')[0]
  dispatch(app.container, form, 'submit')
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post, 'POST /buildings was never sent (form stayed invalid)')
  const sent = JSON.parse(post.body)
  assert.equal(sent.dueDays, 5, 'BLD-06 default due_days must be 5')
  assert.equal(sent.managerId, null, 'no manager picked -> managerId:null (BLD-03 allows null)')
  assert.deepEqual(sent.amenities, [])
  assert.equal(sent.description, null)
  await app.stop()
})

test('BLD-06: a lowercase 2-character code ("ab") is accepted as-is by the form and sent unchanged (BE upper-cases it)', async () => {
  const calls = fakeFetch([
    { prefix: '/managers', handler: () => ok([], pageMeta([])) },
    { prefix: '/buildings', method: 'POST', handler: () => ok(baseBuilding()) },
  ])
  const app = await mount(withQuery(React.createElement(BuildingForm, {})))
  fill(app.container, byName(app.container, 'code'), 'ab')
  fill(app.container, byName(app.container, 'name'), 'Tòa test')
  fill(app.container, byName(app.container, 'address'), 'Địa chỉ')
  fill(app.container, byName(app.container, 'district'), 'Quận')
  fill(app.container, byName(app.container, 'ward'), 'Phường')
  fill(app.container, byName(app.container, 'waterMode'), 'PER_M3')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.equal(JSON.parse(post.body).code, 'ab', 'the FE must not uppercase the code itself (Q2 CP-4 decision)')
  await app.stop()
})

test('BLD-06: a 1-character code fails validation client-side; POST /buildings is never sent', async () => {
  fakeFetch([{ prefix: '/managers', handler: () => ok([], pageMeta([])) }])
  const app = await mount(withQuery(React.createElement(BuildingForm, {})))
  fill(app.container, byName(app.container, 'code'), 'a')
  fill(app.container, byName(app.container, 'name'), 'Tòa test')
  fill(app.container, byName(app.container, 'address'), 'Địa chỉ')
  fill(app.container, byName(app.container, 'district'), 'Quận')
  fill(app.container, byName(app.container, 'ward'), 'Phường')
  fill(app.container, byName(app.container, 'waterMode'), 'PER_M3')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(app.container.textContent.includes('Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9'), 'expected the code validation message to render')
  await app.stop()
})

test('BLD-06: a 6-character code is accepted and sent unchanged', async () => {
  const calls = fakeFetch([
    { prefix: '/managers', handler: () => ok([], pageMeta([])) },
    { prefix: '/buildings', method: 'POST', handler: () => ok(baseBuilding()) },
  ])
  const app = await mount(withQuery(React.createElement(BuildingForm, {})))
  fill(app.container, byName(app.container, 'code'), 'abcdef')
  fill(app.container, byName(app.container, 'name'), 'Tòa test')
  fill(app.container, byName(app.container, 'address'), 'Địa chỉ')
  fill(app.container, byName(app.container, 'district'), 'Quận')
  fill(app.container, byName(app.container, 'ward'), 'Phường')
  fill(app.container, byName(app.container, 'waterMode'), 'PER_M3')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post, 'a 6-character code must pass client validation and reach POST /buildings')
  assert.equal(JSON.parse(post.body).code, 'abcdef')
  await app.stop()
})

test('BLD-06: a 7-character code fails validation client-side; POST /buildings is never sent', async () => {
  fakeFetch([{ prefix: '/managers', handler: () => ok([], pageMeta([])) }])
  const app = await mount(withQuery(React.createElement(BuildingForm, {})))
  fill(app.container, byName(app.container, 'code'), 'abcdefg')
  fill(app.container, byName(app.container, 'name'), 'Tòa test')
  fill(app.container, byName(app.container, 'address'), 'Địa chỉ')
  fill(app.container, byName(app.container, 'district'), 'Quận')
  fill(app.container, byName(app.container, 'ward'), 'Phường')
  fill(app.container, byName(app.container, 'waterMode'), 'PER_M3')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(app.container.textContent.includes('Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9'), 'expected the code validation message for a 7-character code')
  await app.stop()
})

test('BLD-06: dueDays 0 and 32 (just outside 1..31) fail validation client-side; POST /buildings is never sent', async () => {
  fakeFetch([{ prefix: '/managers', handler: () => ok([], pageMeta([])) }])
  for (const invalid of [0, 32]) {
    const app = await mount(withQuery(React.createElement(BuildingForm, {})))
    fill(app.container, byName(app.container, 'code'), 'ab')
    fill(app.container, byName(app.container, 'name'), 'Tòa test')
    fill(app.container, byName(app.container, 'address'), 'Địa chỉ')
    fill(app.container, byName(app.container, 'district'), 'Quận')
    fill(app.container, byName(app.container, 'ward'), 'Phường')
    fill(app.container, byName(app.container, 'waterMode'), 'PER_M3')
    fill(app.container, byName(app.container, 'dueDays'), invalid)
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await wait(30)
    assert.ok(app.container.textContent.includes('Số ngày thu phải từ 1 đến 31'), `dueDays=${invalid} must be rejected client-side`)
    await app.stop()
  }
})

test('BLD-06: dueDays 1 and 31 (the boundary) are accepted and sent as-is', async () => {
  for (const valid of [1, 31]) {
    const calls = fakeFetch([
      { prefix: '/managers', handler: () => ok([], pageMeta([])) },
      { prefix: '/buildings', method: 'POST', handler: () => ok(baseBuilding()) },
    ])
    const app = await mount(withQuery(React.createElement(BuildingForm, {})))
    fill(app.container, byName(app.container, 'code'), 'ab')
    fill(app.container, byName(app.container, 'name'), 'Tòa test')
    fill(app.container, byName(app.container, 'address'), 'Địa chỉ')
    fill(app.container, byName(app.container, 'district'), 'Quận')
    fill(app.container, byName(app.container, 'ward'), 'Phường')
    fill(app.container, byName(app.container, 'waterMode'), 'PER_M3')
    fill(app.container, byName(app.container, 'dueDays'), valid)
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await wait(30)
    const post = calls.find(c => c.method === 'POST')
    assert.ok(post, `dueDays=${valid} must pass validation and reach POST /buildings`)
    assert.equal(JSON.parse(post.body).dueDays, valid)
    await app.stop()
  }
})

test('BLD-03: assigning a manager already at 2 buildings gets 409 MANAGER_MAX_2_BUILDINGS, shown as the API message on the form', async () => {
  const manager = { id: 2, fullName: 'Quản lý A', isActive: true }
  const calls = fakeFetch([
    { prefix: '/managers', handler: () => ok([manager], pageMeta([manager])) },
    { prefix: '/buildings', method: 'POST', handler: () => fail(409, 'MANAGER_MAX_2_BUILDINGS', 'Mỗi quản lý chỉ phụ trách tối đa 2 tòa') },
  ])
  const app = await mount(withQuery(React.createElement(BuildingForm, {})))
  await wait(30)
  fill(app.container, byName(app.container, 'code'), 'ab')
  fill(app.container, byName(app.container, 'name'), 'Tòa test')
  fill(app.container, byName(app.container, 'address'), 'Địa chỉ')
  fill(app.container, byName(app.container, 'district'), 'Quận')
  fill(app.container, byName(app.container, 'ward'), 'Phường')
  fill(app.container, byName(app.container, 'waterMode'), 'PER_M3')
  fill(app.container, byName(app.container, 'managerId'), '2')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(calls.some(c => c.method === 'POST'), 'POST /buildings should have been attempted')
  assert.ok(app.container.textContent.includes('Mỗi quản lý chỉ phụ trách tối đa 2 tòa'), 'BLD-03: the 409 MANAGER_MAX_2_BUILDINGS message must be shown to the user')
  await app.stop()
})

test('VALIDATION_FAILED: a duplicate code from the API is shown as a field error next to "Mã tòa"', async () => {
  fakeFetch([
    { prefix: '/managers', handler: () => ok([], pageMeta([])) },
    { prefix: '/buildings', method: 'POST', handler: () => fail(400, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ', { code: 'Mã tòa đã tồn tại' }) },
  ])
  const app = await mount(withQuery(React.createElement(BuildingForm, {})))
  fill(app.container, byName(app.container, 'code'), 'ab')
  fill(app.container, byName(app.container, 'name'), 'Tòa test')
  fill(app.container, byName(app.container, 'address'), 'Địa chỉ')
  fill(app.container, byName(app.container, 'district'), 'Quận')
  fill(app.container, byName(app.container, 'ward'), 'Phường')
  fill(app.container, byName(app.container, 'waterMode'), 'PER_M3')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(app.container.textContent.includes('Mã tòa đã tồn tại'), 'the field error from error.fields.code must render near the "Mã tòa" input (UI-05)')
  await app.stop()
})

test('BLD-02: BuildingNotesForm only renders amenities and description controls, never code/name/managerId', async () => {
  const app = await mount(withQuery(React.createElement(BuildingNotesForm, { building: baseBuilding() })))
  assert.ok(byName(app.container, 'amenities'), 'amenities field missing')
  assert.ok(byName(app.container, 'description'), 'description field missing')
  for (const missing of ['code', 'name', 'address', 'district', 'ward', 'waterMode', 'managerId', 'dueDays']) {
    assert.equal(byName(app.container, missing), undefined, `manager edit form must not expose "${missing}"`)
  }
  await app.stop()
})

test('BLD-02: BuildingNotesForm submits only {amenities, description}, matching the manager\'s PATCH scope', async () => {
  const calls = fakeFetch([{ prefix: '/buildings/5', method: 'PATCH', handler: () => ok(baseBuilding({ amenities: ['Thang máy'], description: 'Mới' })) }])
  const app = await mount(withQuery(React.createElement(BuildingNotesForm, { building: baseBuilding() })))
  fill(app.container, byName(app.container, 'amenities'), 'Thang máy')
  fill(app.container, byName(app.container, 'description'), 'Mới')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(calls[0].body), { amenities: ['Thang máy'], description: 'Mới' })
  await app.stop()
})

// ======================================================================================
// BuildingLockControl — BLD-06, VIEW-13 ("Còn N lịch hẹn chưa xử lý")
// ======================================================================================

test('BLD-06/VIEW-13: locking an active building shows "Còn 3 lịch hẹn chưa xử lý." with N from pendingViewingCount, and confirming PATCHes isActive:false only', async () => {
  const calls = fakeFetch([{ prefix: '/buildings/5', method: 'PATCH', handler: () => ok(baseBuilding({ isActive: false, managerId: null, manager: null })) }])
  const app = await mount(withQuery(React.createElement(BuildingLockControl, { building: baseBuilding({ isActive: true, pendingViewingCount: 3 }) })))
  dispatch(app.container, buttonByText(app.container, 'Khóa tòa'), 'click')
  await wait(20)
  assert.ok(app.container.textContent.includes('Còn 3 lịch hẹn chưa xử lý.'), 'VIEW-13 dialog text with N must be shown before locking')
  const confirmBtn = buttons(app.container).find(b => b.textContent.trim() === 'Khóa tòa' && b !== buttonByText(app.container, 'Khóa tòa'))
    ?? buttons(app.container)[buttons(app.container).length - 1]
  dispatch(app.container, confirmBtn, 'click')
  await wait(30)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[0].body), { isActive: false }, 'the lock request must carry only isActive; the BE clears manager_id itself (BLD-06)')
  await app.stop()
})

test('BLD-06: unlocking a locked building shows the "Boss cần gán lại quản lý" text, not the pending-viewing count sentence, and confirming PATCHes isActive:true', async () => {
  const calls = fakeFetch([{ prefix: '/buildings/5', method: 'PATCH', handler: () => ok(baseBuilding({ isActive: true })) }])
  const app = await mount(withQuery(React.createElement(BuildingLockControl, { building: baseBuilding({ isActive: false, pendingViewingCount: 0 }) })))
  dispatch(app.container, buttonByText(app.container, 'Mở khóa tòa'), 'click')
  await wait(20)
  assert.ok(app.container.textContent.includes('Sau khi mở khóa, Boss cần gán lại quản lý'), 'unlock description text missing')
  assert.ok(!app.container.textContent.includes('lịch hẹn chưa xử lý'), 'unlocking must not show the locking-only pending-viewing sentence')
  // dialog order is [open button, Cancel, Confirm]; the confirm action is the last button, not index 1 (Cancel).
  const confirmBtn = buttons(app.container)[buttons(app.container).length - 1]
  dispatch(app.container, confirmBtn, 'click')
  await wait(30)
  assert.deepEqual(JSON.parse(calls[0].body), { isActive: true })
  await app.stop()
})

test('BLD-06: locking a building with a HOLD/ACTIVE contract gets 409 CONFLICT_STATE; the dialog stays open and shows the message', async () => {
  const calls = fakeFetch([{ prefix: '/buildings/5', method: 'PATCH', handler: () => fail(409, 'CONFLICT_STATE', 'Thao tác không hợp lệ ở trạng thái hiện tại') }])
  const app = await mount(withQuery(React.createElement(BuildingLockControl, { building: baseBuilding({ isActive: true, pendingViewingCount: 0 }) })))
  dispatch(app.container, buttonByText(app.container, 'Khóa tòa'), 'click')
  await wait(20)
  const confirmBtn = buttons(app.container).find(b => b.textContent.trim() === 'Khóa tòa' && b !== buttonByText(app.container, 'Khóa tòa'))
    ?? buttons(app.container)[buttons(app.container).length - 1]
  dispatch(app.container, confirmBtn, 'click')
  await wait(30)
  assert.equal(calls.length, 1)
  assert.ok(app.container.textContent.includes('Thao tác không hợp lệ ở trạng thái hiện tại'), 'the CONFLICT_STATE message must be shown (BLD-06 refuses to lock a building with an open contract)')
  assert.ok(app.container.textContent.includes('Khóa tòa này?'), 'the confirm dialog must stay open after a failed lock attempt, not silently close')
  await app.stop()
})

// ======================================================================================
// ServiceForm / ServicesPanel — SVC-01/02/04 (no hard delete, unit fixed after creation)
// ======================================================================================

test('SVC-01: creating a service sends buildingId/name/unit; the unit select offers ROOM/PERSON/VEHICLE', async () => {
  const calls = fakeFetch([{ prefix: '/services', method: 'POST', handler: () => ok({ id: 9, buildingId: 5, name: 'Wifi', unit: 'ROOM', isActive: true, hasCurrentRate: false }) }])
  const app = await mount(withQuery(React.createElement(ServiceForm, { buildingId: 5, onClose: () => {} })))
  const unitSelect = byName(app.container, 'unit')
  const optionValues = find(app.container, n => n.tagName === 'OPTION').map(o => o.getAttribute('value')).filter(Boolean)
  assert.deepEqual(optionValues.sort(), ['PERSON', 'ROOM', 'VEHICLE'])
  fill(app.container, byName(app.container, 'name'), 'Wifi')
  fill(app.container, unitSelect, 'ROOM')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(calls[0].body), { buildingId: 5, name: 'Wifi', unit: 'ROOM' })
  await app.stop()
})

test('SVC-01: editing a service hides the unit select (fixed after creation) and PATCHes name only, never unit', async () => {
  const service = { id: 9, buildingId: 5, name: 'Wifi', unit: 'ROOM', isActive: true, hasCurrentRate: true }
  const calls = fakeFetch([{ prefix: '/services/9', method: 'PATCH', handler: () => ok({ ...service, name: 'Wifi tốc độ cao' }) }])
  const app = await mount(withQuery(React.createElement(ServiceForm, { buildingId: 5, service, onClose: () => {} })))
  assert.equal(byName(app.container, 'unit'), undefined, 'unit must not be editable once the service exists')
  fill(app.container, byName(app.container, 'name'), 'Wifi tốc độ cao')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(calls[0].body), { name: 'Wifi tốc độ cao' }, 'unit must never be in the edit payload')
  await app.stop()
})

test('SVC-04: ServicesPanel locks a service softly (PATCH isActive:false), never a DELETE, and shows "Chưa có giá"/"Đã khóa"', async () => {
  const service = { id: 9, buildingId: 5, name: 'Wifi', unit: 'ROOM', isActive: true, hasCurrentRate: false }
  const calls = fakeFetch([
    { prefix: '/services', method: 'GET', handler: () => ok([service], pageMeta([service], 100)) },
    { prefix: '/services/9', method: 'PATCH', handler: () => ok({ ...service, isActive: false }) },
  ])
  const app = await mount(withQuery(React.createElement(ServicesPanel, { buildingId: 5, canManage: true })))
  await wait(30)
  assert.ok(app.container.textContent.includes('Chưa có giá'), 'a service with no current rate must show "Chưa có giá" (SVC-04)')
  const lockBtn = buttons(app.container).find(b => b.getAttribute('aria-label') === 'Khóa dịch vụ Wifi')
  assert.ok(lockBtn, 'lock button not found')
  dispatch(app.container, lockBtn, 'click')
  await wait(30)
  const mutation = calls.find(c => c.method !== 'GET')
  assert.ok(mutation, 'no mutation request was sent')
  assert.equal(mutation.method, 'PATCH', 'SVC-04 is a soft lock: PATCH isActive:false, never a hard DELETE')
  assert.deepEqual(JSON.parse(mutation.body), { isActive: false })
  assert.ok(!calls.some(c => c.method === 'DELETE'), 'ServicesPanel must never call DELETE on a service (no hard delete)')
  await app.stop()
})

test('src/features/buildings/api.ts defines no deleteService export at all (SVC-04 forbids hard delete)', () => {
  const src = readFileSync(resolve(draftSrcRoot, 'features/buildings/api.ts'), 'utf8')
  assert.ok(!/export function deleteService/.test(src), 'a hard-delete service function must not exist')
})

// ======================================================================================
// BuildingDetailPage — "Quyết định kỹ thuật CP-4" Q5 (listBuildings({buildingId,limit:1,includeInactive}))
// ======================================================================================

test('Q5 CP-4: an invalid id ("abc") shows "Không tìm thấy tòa nhà" and never calls the API', async () => {
  const calls = fakeFetch([])
  const app = await mount(withStaffPage({
    children: React.createElement(BuildingDetailPage, {}),
    user: BOSS, routePath: '/ql/toa-nha/abc', routePattern: '/ql/toa-nha/:id',
  }))
  await wait(30)
  assert.ok(app.container.textContent.includes('Không tìm thấy tòa nhà'))
  assert.equal(calls.length, 0, 'an invalid id must not trigger any network call')
  await app.stop()
})

test('Q5 CP-4: a valid id whose list comes back empty shows "Không tìm thấy tòa nhà" (no 404 is assumed)', async () => {
  fakeFetch([{ prefix: '/buildings', handler: () => ok([], pageMeta([])) }])
  const app = await mount(withStaffPage({
    children: React.createElement(BuildingDetailPage, {}),
    user: BOSS, routePath: '/ql/toa-nha/999', routePattern: '/ql/toa-nha/:id',
  }))
  await wait(60)
  assert.ok(app.container.textContent.includes('Không tìm thấy tòa nhà'))
  await app.stop()
})

test('Q5 CP-4: Boss requests includeInactive=true, buildingId=<id> and limit=1 for the detail page', async () => {
  const calls = fakeFetch([{ prefix: '/buildings', handler: () => ok([baseBuilding({ pendingViewingCount: 4 })], pageMeta([1])) }])
  const app = await mount(withStaffPage({
    children: React.createElement(BuildingDetailPage, {}),
    user: BOSS, routePath: '/ql/toa-nha/5', routePattern: '/ql/toa-nha/:id',
  }))
  await wait(60)
  const detailCall = calls.find(c => c.url.startsWith('/api/v1/buildings?'))
  assert.ok(detailCall, 'no GET /buildings call observed')
  const q = queryOf(detailCall.url)
  assert.equal(q.get('buildingId'), '5')
  assert.equal(q.get('limit'), '1')
  assert.equal(q.get('includeInactive'), 'true', 'Boss must request includeInactive to see a locked building too')
  assert.ok(app.container.textContent.includes('4'), 'VIEW-13: pendingViewingCount from BE must be shown on the detail page')
  await app.stop()
})

test('Q5 CP-4/API contract: a manager never sends includeInactive (manager+includeInactive is 403 FORBIDDEN)', async () => {
  const calls = fakeFetch([{ prefix: '/buildings', handler: () => ok([baseBuilding({ managerId: 2, manager: { id: 2, fullName: 'Quản lý A', isActive: true } })], pageMeta([1])) }])
  const app = await mount(withStaffPage({
    children: React.createElement(BuildingDetailPage, {}),
    user: MANAGER, routePath: '/ql/toa-nha/5', routePattern: '/ql/toa-nha/:id',
  }))
  await wait(60)
  const detailCall = calls.find(c => c.url.startsWith('/api/v1/buildings?'))
  assert.ok(detailCall)
  assert.equal(queryOf(detailCall.url).has('includeInactive'), false, 'manager must never send includeInactive, even as false')
  await app.stop()
})

// ======================================================================================
// BuildingsPage — BLD-07 ("Hiện tòa đã khóa" Boss-only), pagination, SCOPE-02
// ======================================================================================

test('BLD-07: a manager never sees the "Hiện tòa đã khóa" checkbox or the "Thêm tòa" button', async () => {
  fakeFetch([{ prefix: '/buildings', handler: () => ok([baseBuilding()], pageMeta([1])) }])
  const selection = { selectedBuildingId: null, setSelectedBuildingId: () => {} }
  const app = await mount(withStaffPage({ children: React.createElement(BuildingsPage, {}), user: MANAGER, selection }))
  await wait(30)
  assert.equal(app.container.textContent.includes('Hiện tòa đã khóa'), false, 'BLD-07: managers never see locked buildings or the toggle')
  assert.equal(buttonByText(app.container, 'Thêm tòa'), undefined, 'BLD-01: only Boss creates buildings')
  await app.stop()
})

test('BLD-07: Boss toggling "Hiện tòa đã khóa" adds includeInactive=true to the next list request', async () => {
  const calls = fakeFetch([{ prefix: '/buildings', handler: () => ok([baseBuilding()], pageMeta([1])) }])
  const selection = { selectedBuildingId: 'all', setSelectedBuildingId: () => {} }
  const app = await mount(withStaffPage({ children: React.createElement(BuildingsPage, {}), user: BOSS, selection }))
  await wait(30)
  const before = calls.length
  // react-dom sets <input type> as a direct property (element.type = 'checkbox'), never via setAttribute,
  // so the lookup must read the property, not getAttribute('type').
  const checkbox = find(app.container, n => n.tagName === 'INPUT' && n.type === 'checkbox')[0]
  assert.ok(checkbox, '"Hiện tòa đã khóa" checkbox not found for Boss')
  check(app.container, checkbox, true)
  await wait(30)
  const listCalls = calls.filter(c => c.url.startsWith('/api/v1/buildings?'))
  assert.ok(listCalls.length > before - 1, 'no new /buildings request after toggling the checkbox')
  assert.equal(queryOf(listCalls[listCalls.length - 1].url).get('includeInactive'), 'true')
  await app.stop()
})

test('SCOPE-02: BuildingsPage with selectedBuildingId=null (manager, no pick yet) sends no buildingId param, but still loads the list', async () => {
  const calls = fakeFetch([{ prefix: '/buildings', handler: () => ok([baseBuilding({ id: 5 }), baseBuilding({ id: 6, code: 'B2' })], pageMeta([1, 2])) }])
  const selection = { selectedBuildingId: null, setSelectedBuildingId: () => {} }
  const app = await mount(withStaffPage({ children: React.createElement(BuildingsPage, {}), user: MANAGER, selection }))
  await wait(30)
  const listCall = calls.find(c => c.url.startsWith('/api/v1/buildings?'))
  assert.ok(listCall)
  assert.equal(queryOf(listCall.url).has('buildingId'), false, 'null selection must load without a buildingId filter (Q-FE8A-4)')
  assert.ok(app.container.textContent.includes('Tòa B1') || app.container.textContent.includes('B1'), 'the list must still render data, not an empty state')
  await app.stop()
})

test('UI-03: BuildingsPage pagination controls render only when total exceeds the page size, with "Trang 1/2" text', async () => {
  const many = Array.from({ length: 20 }, (_, i) => baseBuilding({ id: i + 1, code: `B${i + 1}` }))
  fakeFetch([{ prefix: '/buildings', handler: () => ok(many, { page: 1, limit: 20, total: 25 }) }])
  const selection = { selectedBuildingId: 'all', setSelectedBuildingId: () => {} }
  const app = await mount(withStaffPage({ children: React.createElement(BuildingsPage, {}), user: BOSS, selection }))
  await wait(30)
  assert.ok(app.container.textContent.includes('Trang 1/2'), 'expected pagination text "Trang 1/2" for total=25, limit=20')
  const next = buttonByText(app.container, 'Trang sau')
  const prev = buttonByText(app.container, 'Trang trước')
  assert.ok(next && !isDisabled(next), '"Trang sau" must be enabled on page 1 of 2')
  assert.ok(prev && isDisabled(prev), '"Trang trước" must be disabled on page 1')
  await app.stop()
})

test('UI-03: BuildingsPage shows no pagination nav when every row fits on one page (total <= limit)', async () => {
  fakeFetch([{ prefix: '/buildings', handler: () => ok([baseBuilding()], { page: 1, limit: 20, total: 1 }) }])
  const selection = { selectedBuildingId: 'all', setSelectedBuildingId: () => {} }
  const app = await mount(withStaffPage({ children: React.createElement(BuildingsPage, {}), user: BOSS, selection }))
  await wait(30)
  assert.equal(find(app.container, n => n.tagName === 'NAV').length, 0, 'no pagination nav expected when total <= limit')
  await app.stop()
})

test('UI-03: BuildingsPage error state shows the API message with a "Thử lại" retry button that refetches', async () => {
  let attempt = 0
  const calls = fakeFetch([{
    prefix: '/buildings',
    handler: () => {
      attempt += 1
      return attempt === 1 ? fail(500, 'NETWORK_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : ok([baseBuilding()], pageMeta([1]))
    },
  }])
  const selection = { selectedBuildingId: 'all', setSelectedBuildingId: () => {} }
  const app = await mount(withStaffPage({ children: React.createElement(BuildingsPage, {}), user: BOSS, selection }))
  await wait(30)
  assert.ok(app.container.textContent.includes('Có lỗi xảy ra, vui lòng thử lại sau'), 'the list error state must show the API message')
  const retry = buttonByText(app.container, 'Thử lại')
  assert.ok(retry, 'UI-03 error state must offer a "Thử lại" retry button')
  dispatch(app.container, retry, 'click')
  await wait(30)
  assert.ok(calls.filter(c => c.url.startsWith('/api/v1/buildings?')).length >= 2, 'clicking "Thử lại" must refetch the list')
  assert.ok(app.container.textContent.includes('Tòa B1'), 'after a successful retry, the data state renders the list')
  await app.stop()
})
