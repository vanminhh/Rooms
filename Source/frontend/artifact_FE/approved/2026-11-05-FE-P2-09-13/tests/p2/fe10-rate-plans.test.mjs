import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

// CP-3 (FE-P2-10, PLAN.md CP-3): src/pages/staff/PricesPage.tsx, src/features/pricing/{RatePlanList,RatePlanForm,
// water-mode}.tsx/ts. Spec/PLAN: RATE-01..06, PRC-01/04/07/10, SVC-04, Q-FE8B-1 (grouping by effectiveFrom only,
// no money/percent math), Q-FE8B-3 (water unit label from the already-exported GET /buildings, no new backend
// endpoint), [ASSUMPTION FE8B-15] (prefill from the "đang áp dụng" plan).
//
// Outside edges faked: globalThis.fetch (network) and the minimal fake DOM below (Node has none, no jsdom
// installed), same shape as cp7-rooms.test.mjs / fe09-room-price.test.mjs. Every module under test (PricesPage,
// RatePlanList, RatePlanForm, water-mode.ts, pricing/{api,schemas,labels}.ts) is transpiled and run unmodified,
// mounted with real react-dom/client, real @tanstack/react-query, real react-hook-form + zod. RatePlanForm/List
// read useAuth() (via water-mode.ts), so mounts wrap a real AuthContext.Provider with a fixture value (not a
// mock of the units under test). shared/{formatters,status-labels}.ts and features/buildings/{api,
// building-selection}.ts are loaded unmodified via the same relative-import fallback to main `src/`.

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = draftSrcRoot // approved fix 2026-11-05-FE-P2-8a-test-path-fix: path-depth independent

// ---------- minimal real DOM (same shape as the other cp*/fe*.test.mjs files) ----------
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

const { PricesPage } = load(resolve(draftSrcRoot, 'pages/staff/PricesPage.tsx'))
const { RatePlanList } = load(resolve(draftSrcRoot, 'features/pricing/RatePlanList.tsx'))
const { RatePlanForm } = load(resolve(draftSrcRoot, 'features/pricing/RatePlanForm.tsx'))
const { useBuildingWaterMode } = load(resolve(draftSrcRoot, 'features/pricing/water-mode.ts'))
const { AuthContext } = load(resolve(draftSrcRoot, 'app/auth-context.ts'))
const { BuildingSelectionContext } = load(resolve(draftSrcRoot, 'features/buildings/building-selection.ts'))
const { todayHanoi, plusDays } = load(resolve(draftSrcRoot, 'features/pricing/labels.ts'))

// ---------- DOM query / event helpers (same style as the other cp*/fe*.test.mjs files) ----------
const wait = ms => new Promise(r => setTimeout(r, ms))
const walkTree = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
const find = (root, pred) => walkTree(root).filter(n => n.nodeType === 1 && pred(n))
const buttons = container => find(container, n => n.tagName === 'BUTTON')
const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
const byName = (container, name) => find(container, n => ['INPUT', 'SELECT', 'TEXTAREA'].includes(n.tagName) && n.name === name)[0]
const sectionByLabel = (container, label) => find(container, n => n.tagName === 'SECTION' && n.getAttribute('aria-label') === label)[0]
const isDisabled = el => el?.disabled === true || el?.hasAttribute('disabled')

function dispatch(container, target, type, extra = {}) {
  const rootListeners = container.listeners.filter(l => l.type === type && !l.capture)
  assert.ok(rootListeners.length > 0, `no root listener for ${type}`)
  const event = { type, target, srcElement: target, currentTarget: container, bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...extra }
  rootListeners.forEach(l => l.listener(event))
}

const nativeValueSetter = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'value').set

function fill(container, el, value) {
  nativeValueSetter.call(el, String(value))
  dispatch(container, el, 'input', { target: el })
}
function click(container, el) {
  dispatch(container, el, 'click', { target: el })
}
// The fake DOM does not implement a real browser's "submit button click submits its form" behaviour,
// so every form submit in this file dispatches 'submit' on the <form> directly (same as fe09-room-price.test.mjs).
function submitForm(container, scope) {
  const form = find(scope, n => n.tagName === 'FORM')[0]
  assert.ok(form, 'no <form> found in scope to submit')
  dispatch(container, form, 'submit')
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

const BOSS = { id: 1, role: 'BOSS', phone: '0900000001', fullName: 'Chủ nhà', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [] }
const MANAGER = { id: 2, role: 'MANAGER', phone: '0900000002', fullName: 'Quản lý A', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [{ id: 5, code: 'B1', name: 'Tòa B1' }] }

function withAuthedQuery(children, { user = BOSS, client } = {}) {
  const authValue = { status: 'ready', user, login: async () => { throw new Error('unused in test') }, logout: async () => {}, refreshMe: async () => null, retry() {} }
  return React.createElement(QueryClientProvider, { client: client ?? newClient() }, React.createElement(AuthContext.Provider, { value: authValue }, children))
}
function withSelection(children, selectedBuildingId, opts) {
  const value = { selectedBuildingId, setSelectedBuildingId: () => {} }
  return withAuthedQuery(React.createElement(BuildingSelectionContext.Provider, { value }, children), opts)
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

function baseService(overrides = {}) {
  return { id: 1, buildingId: 5, name: 'Vệ sinh', unit: 'ROOM', isActive: true, hasCurrentRate: true, ...overrides }
}
function baseRatePlan(overrides = {}) {
  return {
    id: 1, buildingId: 5, buildingName: 'Tòa Cầu Giấy', kind: 'ELECTRIC', serviceId: null,
    effectiveFrom: '2026-06-01', status: 'APPROVED', reason: null, proposedById: 1, reviewedById: 1,
    reviewedAt: '2026-05-01T00:00:00Z', reviewNote: null, createdAt: '2026-05-01T00:00:00Z', expired: false,
    tiers: [{ tierNo: 1, upTo: null, unitPrice: 2000 }], comparison: null,
    ...overrides,
  }
}
function baseBuildingView(overrides = {}) {
  return {
    id: 5, code: 'CG01', name: 'Tòa Cầu Giấy', address: '', district: '', ward: '', waterMode: 'PER_M3',
    dueDays: 5, managerId: null, manager: null, amenities: [], description: null, isActive: true,
    pendingViewingCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// Routes /rate-plans by kind (ELECTRIC/WATER/SERVICE) and /services/buildings as given; defaults to empty lists.
function fakeFetchRatePlans({ electric = [], water = [], service = [], services = [], building = baseBuildingView(), onPost } = {}) {
  return fakeFetch([
    { prefix: '/services', method: 'GET', handler: () => ok(services, pageMeta(services)) },
    { prefix: '/buildings', method: 'GET', handler: () => ok([building], pageMeta([1])) },
    {
      prefix: '/rate-plans', method: 'GET',
      handler: call => {
        const kind = queryOf(call.url).get('kind')
        const rows = kind === 'ELECTRIC' ? electric : kind === 'WATER' ? water : service
        return ok(rows, pageMeta(rows))
      },
    },
    { prefix: '/rate-plans', method: 'POST', handler: call => onPost ? onPost(call) : ok(baseRatePlan()) },
  ])
}

test.beforeEach(() => { /* no shared mutable state between tests besides fetch, re-faked per test */ })

// ======================================================================================
// RATE-01 — proposing an electric plan with 3 tiers (0–50 / 51–100 / 101+)
// ======================================================================================

test('RATE-01: proposing electric with 3 tiers POSTs /rate-plans with buildingId/kind/effectiveFrom/reason/tiers and no serviceId', async () => {
  const calls = fakeFetchRatePlans({})
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  const electric = sectionByLabel(app.container, 'Điện')
  click(app.container, buttonByText(electric, 'Đề xuất đơn giá'))
  await wait(30)
  click(app.container, buttonByText(electric, 'Thêm bậc'))
  await wait(20)
  click(app.container, buttonByText(electric, 'Thêm bậc'))
  await wait(20)
  fill(app.container, byName(app.container, 'tiers.0.upTo'), '50')
  fill(app.container, byName(app.container, 'tiers.0.unitPrice'), '2000')
  fill(app.container, byName(app.container, 'tiers.1.upTo'), '100')
  fill(app.container, byName(app.container, 'tiers.1.unitPrice'), '2500')
  fill(app.container, byName(app.container, 'tiers.2.unitPrice'), '3000')
  fill(app.container, byName(app.container, 'effectiveFrom'), todayHanoi())
  fill(app.container, byName(app.container, 'reason'), 'Giá điện tăng')
  submitForm(app.container, electric)
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post, 'POST /rate-plans must have been sent')
  const body = JSON.parse(post.body)
  assert.deepEqual(body, {
    buildingId: 5, kind: 'ELECTRIC', effectiveFrom: todayHanoi(), reason: 'Giá điện tăng',
    tiers: [{ tierNo: 1, upTo: 50, unitPrice: 2000 }, { tierNo: 2, upTo: 100, unitPrice: 2500 }, { tierNo: 3, upTo: null, unitPrice: 3000 }],
  })
  assert.equal('serviceId' in body, false, 'electric must never send serviceId')
  await app.stop()
})

test('RATE-01: proposing for a service sends the matching serviceId', async () => {
  const services = [baseService({ id: 9, name: 'Vệ sinh', isActive: true })]
  const calls = fakeFetchRatePlans({ services })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const section = sectionByLabel(app.container, 'Dịch vụ · Vệ sinh')
  assert.ok(section, 'the service section must render')
  click(app.container, buttonByText(section, 'Đề xuất đơn giá'))
  await wait(30)
  fill(app.container, byName(app.container, 'tiers.0.unitPrice'), '15000')
  fill(app.container, byName(app.container, 'effectiveFrom'), todayHanoi())
  submitForm(app.container, section)
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post)
  const body = JSON.parse(post.body)
  assert.equal(body.serviceId, 9)
  assert.deepEqual(body.tiers, [{ tierNo: 1, upTo: null, unitPrice: 15000 }])
  await app.stop()
})

// ======================================================================================
// RATE-02 — tier add/remove, ordering, boundaries
// ======================================================================================

test('RATE-02: "Thêm bậc" then "Xóa bậc" keep tierNo sequential 1..n, and only the last tier stays open (no upTo input)', async () => {
  fakeFetchRatePlans({})
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  const electric = sectionByLabel(app.container, 'Điện')
  click(app.container, buttonByText(electric, 'Đề xuất đơn giá'))
  await wait(30)
  click(app.container, buttonByText(electric, 'Thêm bậc'))
  await wait(20)
  click(app.container, buttonByText(electric, 'Thêm bậc'))
  await wait(20)
  // 3 tiers now; remove the middle one (aria-label "Xóa bậc 2").
  const removeMiddle = find(electric, n => n.tagName === 'BUTTON' && n.getAttribute('aria-label') === 'Xóa bậc 2')[0]
  assert.ok(removeMiddle, 'a "Xóa bậc 2" control must exist with 3 tiers')
  click(app.container, removeMiddle)
  await wait(30)
  // 2 tiers remain: index 0 (not last, has an upTo input) and index 1 (last, no upTo input).
  assert.ok(byName(electric, 'tiers.0.upTo'), 'the remaining first tier must keep an upTo input')
  assert.equal(byName(electric, 'tiers.1.upTo'), undefined, 'the new last tier must not have an upTo input (forced open)')
  assert.equal(byName(electric, 'tiers.2.upTo'), undefined, 'only 2 tiers must remain')
  assert.equal(find(electric, n => n.tagName === 'BUTTON' && n.textContent.trim() === 'Xóa bậc').length, 2, '2 tiers means 2 "Xóa bậc" buttons')
  await app.stop()
})

test('RATE-02: a non-increasing upTo between tiers (bậc 2 <= bậc 1) is blocked client-side with "Cận trên của các bậc phải tăng dần"', async () => {
  const calls = fakeFetchRatePlans({})
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  const electric = sectionByLabel(app.container, 'Điện')
  click(app.container, buttonByText(electric, 'Đề xuất đơn giá'))
  await wait(30)
  click(app.container, buttonByText(electric, 'Thêm bậc'))
  await wait(20)
  click(app.container, buttonByText(electric, 'Thêm bậc'))
  await wait(20)
  fill(app.container, byName(app.container, 'tiers.0.upTo'), '50')
  fill(app.container, byName(app.container, 'tiers.0.unitPrice'), '2000')
  fill(app.container, byName(app.container, 'tiers.1.upTo'), '40') // bậc 2 <= bậc 1: invalid
  fill(app.container, byName(app.container, 'tiers.1.unitPrice'), '2500')
  fill(app.container, byName(app.container, 'tiers.2.unitPrice'), '3000')
  fill(app.container, byName(app.container, 'effectiveFrom'), todayHanoi())
  submitForm(app.container, electric)
  await wait(30)
  assert.equal(calls.filter(c => c.method === 'POST').length, 0, 'an invalid tier order must never reach the API')
  assert.ok(electric.textContent.includes('Cận trên của các bậc phải tăng dần'))
  await app.stop()
})

test('RATE-02: water and service forms have exactly 1 tier, no "Thêm bậc" button, and send tiers:[{tierNo:1,upTo:null,...}]', async () => {
  const services = [baseService({ id: 9, name: 'Vệ sinh' })]
  const calls = fakeFetchRatePlans({ services })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)

  const water = sectionByLabel(app.container, 'Nước')
  click(app.container, buttonByText(water, 'Đề xuất đơn giá'))
  await wait(30)
  assert.equal(buttonByText(water, 'Thêm bậc'), undefined, 'water must not offer "Thêm bậc"')
  fill(app.container, byName(app.container, 'tiers.0.unitPrice'), '18000')
  fill(app.container, byName(app.container, 'effectiveFrom'), todayHanoi())
  submitForm(app.container, water)
  await wait(30)
  let post = calls.filter(c => c.method === 'POST').at(-1)
  assert.deepEqual(JSON.parse(post.body).tiers, [{ tierNo: 1, upTo: null, unitPrice: 18000 }])
  assert.equal(JSON.parse(post.body).kind, 'WATER')

  const service = sectionByLabel(app.container, 'Dịch vụ · Vệ sinh')
  click(app.container, buttonByText(service, 'Đề xuất đơn giá'))
  await wait(30)
  assert.equal(buttonByText(service, 'Thêm bậc'), undefined, 'a service must not offer "Thêm bậc"')
  await app.stop()
})

test('RATE-02: unitPrice 0 (the boundary) is accepted; -1 is blocked client-side', async () => {
  for (const [price, shouldSend] of [[0, true], [-1, false]]) {
    const calls = fakeFetchRatePlans({})
    const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
    const water = sectionByLabel(app.container, 'Nước')
    click(app.container, buttonByText(water, 'Đề xuất đơn giá'))
    await wait(30)
    fill(app.container, byName(app.container, 'tiers.0.unitPrice'), String(price))
    fill(app.container, byName(app.container, 'effectiveFrom'), todayHanoi())
    submitForm(app.container, water)
    await wait(30)
    assert.equal(calls.filter(c => c.method === 'POST').length > 0, shouldSend, `unitPrice ${price}`)
    await app.stop()
  }
})

test('RATE-02: an empty unitPrice shows "Bậc giá không hợp lệ" and never sends a request', async () => {
  const calls = fakeFetchRatePlans({})
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  const water = sectionByLabel(app.container, 'Nước')
  click(app.container, buttonByText(water, 'Đề xuất đơn giá'))
  await wait(30)
  fill(app.container, byName(app.container, 'effectiveFrom'), todayHanoi())
  // unitPrice left untouched (empty / NaN default) on purpose.
  submitForm(app.container, water)
  await wait(30)
  assert.equal(calls.filter(c => c.method === 'POST').length, 0)
  assert.ok(water.textContent.includes('Bậc giá không hợp lệ'))
  await app.stop()
})

// ======================================================================================
// SVC-04 — a locked service still shows its section/history, but no "Đề xuất đơn giá"
// ======================================================================================

test('SVC-04: a locked service (isActive:false) still shows its section and price history, but has no "Đề xuất đơn giá" button', async () => {
  const services = [baseService({ id: 9, name: 'Giặt ủi', isActive: false })]
  const plan = baseRatePlan({ id: 50, kind: 'SERVICE', serviceId: 9, effectiveFrom: plusDays(todayHanoi(), -30), status: 'APPROVED' })
  fakeFetchRatePlans({ services, service: [plan] })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const section = sectionByLabel(app.container, 'Dịch vụ · Giặt ủi')
  assert.ok(section, 'the locked service\'s section must still render')
  assert.ok(section.textContent.includes('Đang áp dụng'), 'its price history must still render')
  assert.equal(buttonByText(section, 'Đề xuất đơn giá'), undefined, 'a locked service must have no "Đề xuất đơn giá" button')
  await app.stop()
})

// ======================================================================================
// [ASSUMPTION FE8B-15] — prefill from the "đang áp dụng" plan, or empty when none
// ======================================================================================

test('FE8B-15: with a 3-tier "đang áp dụng" electric plan, the form opens prefilled with those tiers; editing one tier sends the edited value', async () => {
  const current = baseRatePlan({
    id: 7, kind: 'ELECTRIC', effectiveFrom: plusDays(todayHanoi(), -10), status: 'APPROVED',
    tiers: [{ tierNo: 1, upTo: 50, unitPrice: 1678 }, { tierNo: 2, upTo: 100, unitPrice: 2045 }, { tierNo: 3, upTo: null, unitPrice: 2210 }],
  })
  const calls = fakeFetchRatePlans({ electric: [current] })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const electric = sectionByLabel(app.container, 'Điện')
  click(app.container, buttonByText(electric, 'Đề xuất đơn giá'))
  await wait(30)
  assert.equal(byName(electric, 'tiers.0.upTo').value, '50')
  assert.equal(byName(electric, 'tiers.0.unitPrice').value, '1678')
  assert.equal(byName(electric, 'tiers.1.upTo').value, '100')
  assert.equal(byName(electric, 'tiers.1.unitPrice').value, '2045')
  assert.equal(byName(electric, 'tiers.2.unitPrice').value, '2210')
  // Edit only the first tier's price, then submit; the other two must be unchanged in the request body.
  fill(app.container, byName(app.container, 'tiers.0.unitPrice'), '1700')
  fill(app.container, byName(app.container, 'effectiveFrom'), todayHanoi())
  submitForm(app.container, electric)
  await wait(30)
  const post = calls.filter(c => c.method === 'POST').at(-1)
  assert.deepEqual(JSON.parse(post.body).tiers, [
    { tierNo: 1, upTo: 50, unitPrice: 1700 }, { tierNo: 2, upTo: 100, unitPrice: 2045 }, { tierNo: 3, upTo: null, unitPrice: 2210 },
  ])
  await app.stop()
})

test('FE8B-15: with no "đang áp dụng" plan, the form opens empty — 1 tier, unlimited, no price prefilled', async () => {
  const rejected = baseRatePlan({ id: 8, kind: 'ELECTRIC', status: 'REJECTED', tiers: [{ tierNo: 1, upTo: null, unitPrice: 9999 }] })
  fakeFetchRatePlans({ electric: [rejected] })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const electric = sectionByLabel(app.container, 'Điện')
  click(app.container, buttonByText(electric, 'Đề xuất đơn giá'))
  await wait(30)
  assert.ok(electric.textContent.includes('Bậc cuối không giới hạn'), 'a fresh form has exactly one, open-ended tier')
  const price = byName(electric, 'tiers.0.unitPrice')
  assert.notEqual(price.value, '9999', 'must never prefill from a REJECTED plan')
  assert.equal(byName(electric, 'tiers.1.unitPrice'), undefined, 'exactly one tier')
  await app.stop()
})

// ======================================================================================
// PRC-10 / PRC-07 — status labels in the history (table lookup, never re-derived)
// ======================================================================================

test('PRC-10: a REJECTED plan in history shows "Từ chối" (approvalStatusLabels), never "Quá hạn"', async () => {
  const rejected = baseRatePlan({ id: 11, kind: 'ELECTRIC', status: 'REJECTED', expired: false, effectiveFrom: plusDays(todayHanoi(), -5) })
  fakeFetchRatePlans({ electric: [rejected] })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const electric = sectionByLabel(app.container, 'Điện')
  assert.ok(electric.textContent.includes('Lịch sử đơn giá'))
  assert.ok(electric.textContent.includes('Từ chối'))
  assert.ok(!electric.textContent.includes('Quá hạn'))
  await app.stop()
})

test('PRC-07/PRC-10: a PENDING plan shows "Quá hạn" when expired, "Chờ duyệt" otherwise', async () => {
  for (const [expired, label] of [[true, 'Quá hạn'], [false, 'Chờ duyệt']]) {
    const pending = baseRatePlan({ id: 12, kind: 'ELECTRIC', status: 'PENDING', expired, effectiveFrom: plusDays(todayHanoi(), -3) })
    fakeFetchRatePlans({ electric: [pending] })
    const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
    await wait(30)
    const electric = sectionByLabel(app.container, 'Điện')
    assert.ok(electric.textContent.includes(label), `expired=${expired} must show "${label}"`)
    await app.stop()
  }
})

// ======================================================================================
// RATE-05 — a 409 PRICE_PROPOSAL_EXPIRED keeps the form open and shows the API message
// ======================================================================================

test('RATE-05: a 409 PRICE_PROPOSAL_EXPIRED shows error.message and the form stays open', async () => {
  const calls = fakeFetchRatePlans({ onPost: () => fail(409, 'PRICE_PROPOSAL_EXPIRED', 'Đề xuất đã quá hạn, không thể duyệt') })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  const water = sectionByLabel(app.container, 'Nước')
  click(app.container, buttonByText(water, 'Đề xuất đơn giá'))
  await wait(30)
  fill(app.container, byName(app.container, 'tiers.0.unitPrice'), '18000')
  fill(app.container, byName(app.container, 'effectiveFrom'), todayHanoi())
  submitForm(app.container, water)
  await wait(30)
  assert.ok(app.container.textContent.includes('Đề xuất đã quá hạn, không thể duyệt'))
  assert.ok(buttonByText(app.container, 'Gửi đề xuất'), 'the form must still be open after a failed submit')
  assert.equal(calls.filter(c => c.method === 'POST').length, 1)
  await app.stop()
})

// ======================================================================================
// Q-FE8B-1 — grouping by effectiveFrom date only, no money/percent (groupRatePlans already
// unit-tested in fe09-pricing-api.test.mjs; these assert it end to end through RatePlanList)
// ======================================================================================

test('Q-FE8B-1: APPROVED yesterday + APPROVED tomorrow + REJECTED — "Đang áp dụng" has yesterday\'s, "Sắp áp dụng" has tomorrow\'s, REJECTED only in history', async () => {
  const yesterday = baseRatePlan({ id: 1, status: 'APPROVED', effectiveFrom: plusDays(todayHanoi(), -1), tiers: [{ tierNo: 1, upTo: null, unitPrice: 1111 }] })
  const tomorrow = baseRatePlan({ id: 2, status: 'APPROVED', effectiveFrom: plusDays(todayHanoi(), 1), tiers: [{ tierNo: 1, upTo: null, unitPrice: 2222 }] })
  const rejected = baseRatePlan({ id: 3, status: 'REJECTED', effectiveFrom: plusDays(todayHanoi(), -2), tiers: [{ tierNo: 1, upTo: null, unitPrice: 3333 }] })
  fakeFetchRatePlans({ water: [yesterday, tomorrow, rejected] })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const water = sectionByLabel(app.container, 'Nước')
  const current = find(water, n => n.tagName === 'H3' && n.textContent.trim() === 'Đang áp dụng')[0]?.parentNode
  const upcoming = find(water, n => n.tagName === 'H3' && n.textContent.trim() === 'Sắp áp dụng')[0]?.parentNode
  const history = find(water, n => n.tagName === 'H3' && n.textContent.trim() === 'Lịch sử đơn giá')[0]?.parentNode
  assert.ok(current && current.textContent.includes('1.111'), '"Đang áp dụng" must hold yesterday\'s plan')
  assert.ok(upcoming && upcoming.textContent.includes('2.222'), '"Sắp áp dụng" must hold tomorrow\'s plan')
  assert.ok(history && history.textContent.includes('3.333'), 'the REJECTED plan must be in history')
  assert.ok(!current.textContent.includes('3.333') && !upcoming.textContent.includes('3.333'), 'REJECTED must not appear in current/upcoming')
  await app.stop()
})

test('Q-FE8B-1: only an APPROVED plan effective tomorrow — no "Đang áp dụng" header renders, "Sắp áp dụng" does', async () => {
  const tomorrow = baseRatePlan({ id: 2, status: 'APPROVED', effectiveFrom: plusDays(todayHanoi(), 1) })
  fakeFetchRatePlans({ water: [tomorrow] })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const water = sectionByLabel(app.container, 'Nước')
  assert.equal(find(water, n => n.tagName === 'H3' && n.textContent.trim() === 'Đang áp dụng').length, 0)
  assert.equal(find(water, n => n.tagName === 'H3' && n.textContent.trim() === 'Sắp áp dụng').length, 1)
  await app.stop()
})

test('Q-FE8B-1: an APPROVED plan effective exactly today (the boundary) is "Đang áp dụng", never "Sắp áp dụng"', async () => {
  const today = baseRatePlan({ id: 4, status: 'APPROVED', effectiveFrom: todayHanoi(), tiers: [{ tierNo: 1, upTo: null, unitPrice: 4444 }] })
  fakeFetchRatePlans({ water: [today] })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const water = sectionByLabel(app.container, 'Nước')
  const current = find(water, n => n.tagName === 'H3' && n.textContent.trim() === 'Đang áp dụng')[0]?.parentNode
  assert.ok(current && current.textContent.includes('4.444'), 'effectiveFrom === today must be "Đang áp dụng"')
  assert.equal(find(water, n => n.tagName === 'H3' && n.textContent.trim() === 'Sắp áp dụng').length, 0, 'today must not also count as "Sắp áp dụng"')
  await app.stop()
})

// ======================================================================================
// Q-FE8B-3 — water unit label from the building's waterMode, and no duplicate network calls
// ======================================================================================

test('Q-FE8B-3: waterMode PER_M3 shows "đ/m³" on the Nước block, never "đ/người/kỳ"', async () => {
  fakeFetchRatePlans({ building: baseBuildingView({ waterMode: 'PER_M3' }) })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const water = sectionByLabel(app.container, 'Nước')
  click(app.container, buttonByText(water, 'Đề xuất đơn giá'))
  await wait(30)
  assert.ok(water.textContent.includes('đ/m³'))
  assert.ok(!water.textContent.includes('đ/người/kỳ'))
  await app.stop()
})

test('Q-FE8B-3: waterMode PER_PERSON shows "đ/người/kỳ" on the Nước block, never "đ/m³"', async () => {
  fakeFetchRatePlans({ building: baseBuildingView({ waterMode: 'PER_PERSON' }) })
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const water = sectionByLabel(app.container, 'Nước')
  click(app.container, buttonByText(water, 'Đề xuất đơn giá'))
  await wait(30)
  assert.ok(water.textContent.includes('đ/người/kỳ'))
  assert.ok(!water.textContent.includes('đ/m³'))
  await app.stop()
})

test('Q-FE8B-3: useBuildingWaterMode shares one GET /buildings request across simultaneous callers (no duplicate call per section)', async () => {
  const calls = fakeFetch([{ prefix: '/buildings', method: 'GET', handler: () => ok([baseBuildingView()], pageMeta([1])) }])
  function TwoCallers() {
    useBuildingWaterMode(5)
    useBuildingWaterMode(5)
    return null
  }
  const app = await mount(withAuthedQuery(React.createElement(TwoCallers)))
  await wait(30)
  assert.equal(calls.length, 1, 'two simultaneous callers with the same buildingId/user must dedupe into one request')
  await app.stop()
})

// ======================================================================================
// SCOPE-02 — PricesPage with no single building selected
// ======================================================================================

test('SCOPE-02: with no building picked ("Tất cả tòa" or a manager with null) PricesPage shows the hint and no propose button', async () => {
  for (const selection of ['all', null]) {
    fakeFetchRatePlans({})
    const app = await mount(withSelection(React.createElement(PricesPage), selection))
    await wait(30)
    assert.ok(app.container.textContent.includes('Chọn một tòa ở thanh chọn tòa để xem và đề xuất đơn giá.'))
    assert.equal(buttonByText(app.container, 'Đề xuất đơn giá'), undefined)
    await app.stop()
  }
})

test('SCOPE-02: with a specific building selected, PricesPage renders RatePlanList (the "Điện" section)', async () => {
  fakeFetchRatePlans({})
  const app = await mount(withSelection(React.createElement(PricesPage), 5))
  await wait(30)
  assert.ok(sectionByLabel(app.container, 'Điện'), 'the Điện section must render for a specific building')
  await app.stop()
})

// ======================================================================================
// UI-03 — 4 list states for a rate-plan section
// ======================================================================================

test('UI-03: the Điện section shows loading, empty, error+retry and data states', async () => {
  // loading
  let calls = fakeFetch([{ prefix: '/rate-plans', method: 'GET', handler: async () => { await wait(50); return ok([], pageMeta([])) } }])
  let app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  assert.ok(app.container.textContent.includes('Đang xử lý'))
  await wait(60)
  await app.stop()

  // empty
  fakeFetch([{ prefix: '/rate-plans', method: 'GET', handler: () => ok([], pageMeta([])) }])
  app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  assert.ok(app.container.textContent.includes('Chưa có biểu giá nào cho tòa này'))
  await app.stop()

  // error + retry
  let attempt = 0
  calls = fakeFetch([{
    prefix: '/rate-plans', method: 'GET',
    handler: () => { attempt += 1; return attempt === 1 ? fail(500, 'NETWORK_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : ok([baseRatePlan({ effectiveFrom: todayHanoi() })], pageMeta([1])) },
  }])
  app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 })))
  await wait(30)
  const electric = sectionByLabel(app.container, 'Điện')
  assert.ok(electric.textContent.includes('Có lỗi xảy ra, vui lòng thử lại sau'))
  click(app.container, buttonByText(electric, 'Thử lại'))
  await wait(30)
  assert.ok(calls.filter(c => c.url.includes('kind=ELECTRIC')).length >= 2, 'retry must refetch the Điện plans')
  assert.ok(electric.textContent.includes('Đang áp dụng'))
  await app.stop()
})

// ======================================================================================
// PRC-04 — statusLabel after a successful submit (no FE-computed approval state)
// ======================================================================================

test('PRC-04: when the API returns the newly-created plan as APPROVED (Boss), the page shows "Đã duyệt", not "Chờ duyệt"', async () => {
  let listedAfterInvalidate = false
  const created = baseRatePlan({ id: 99, status: 'APPROVED', effectiveFrom: todayHanoi(), tiers: [{ tierNo: 1, upTo: null, unitPrice: 18000 }] })
  fakeFetch([
    { prefix: '/services', method: 'GET', handler: () => ok([], pageMeta([])) },
    { prefix: '/buildings', method: 'GET', handler: () => ok([baseBuildingView()], pageMeta([1])) },
    { prefix: '/rate-plans', method: 'POST', handler: () => { listedAfterInvalidate = true; return ok(created) } },
    { prefix: '/rate-plans', method: 'GET', handler: () => ok(listedAfterInvalidate ? [created] : [], pageMeta(listedAfterInvalidate ? [1] : [])) },
  ])
  const app = await mount(withAuthedQuery(React.createElement(RatePlanList, { buildingId: 5 }), { user: BOSS }))
  const water = sectionByLabel(app.container, 'Nước')
  click(app.container, buttonByText(water, 'Đề xuất đơn giá'))
  await wait(30)
  fill(app.container, byName(app.container, 'tiers.0.unitPrice'), '18000')
  fill(app.container, byName(app.container, 'effectiveFrom'), todayHanoi())
  submitForm(app.container, water)
  await wait(60)
  const waterAfter = sectionByLabel(app.container, 'Nước')
  assert.ok(waterAfter.textContent.includes('Đã duyệt'), 'the API-returned APPROVED status must be shown as-is')
  assert.ok(!waterAfter.textContent.includes('Chờ duyệt'), 'the FE must never guess PENDING for a Boss self-approval')
  await app.stop()
})
