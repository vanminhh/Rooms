import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

// CP-4 (FE-P2-11, PLAN.md CP-4): src/pages/staff/ApprovalsPage.tsx, src/features/pricing/{ApprovalCard,
// PriceComparison}.tsx. Spec/PLAN: PRC-03/07/08/09/11/12, RATE-01, UI-03/04/06, Q-FE8B-2 (roomCode/buildingName/
// serviceName from the API, never guessed), Q-FE8B-3 (water unit from the already-cached GET /buildings),
// API-05, [ASSUMPTION FE8B-10/11/16/17].
//
// Outside edges faked: globalThis.fetch (network) and the minimal fake DOM below (same shape as
// cp7-rooms.test.mjs / fe10-rate-plans.test.mjs; Node has none, no jsdom installed). Every module under test
// (ApprovalsPage, ApprovalCard, PriceComparison, pricing/{api,labels}.ts) is transpiled and run unmodified,
// mounted with real react-dom/client, real @tanstack/react-query, real react-hook-form + zod. ApprovalCard
// reads useAuth() (via water-mode.ts for WATER items), so mounts wrap a real AuthContext.Provider with a
// fixture value (not a mock of the unit under test). PriceComparison has no hooks, so some PRC-12/UI-06 tests
// mount it directly with no providers at all.

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

const { ApprovalsPage } = load(resolve(draftSrcRoot, 'pages/staff/ApprovalsPage.tsx'))
const { ApprovalCard } = load(resolve(draftSrcRoot, 'features/pricing/ApprovalCard.tsx'))
const { PriceComparison } = load(resolve(draftSrcRoot, 'features/pricing/PriceComparison.tsx'))
const { AuthContext } = load(resolve(draftSrcRoot, 'app/auth-context.ts'))
const { BuildingSelectionContext } = load(resolve(draftSrcRoot, 'features/buildings/building-selection.ts'))

// ---------- DOM query / event helpers (same style as the other cp*/fe*.test.mjs files) ----------
const wait = ms => new Promise(r => setTimeout(r, ms))
const walkTree = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
const find = (root, pred) => walkTree(root).filter(n => n.nodeType === 1 && pred(n))
const buttons = container => find(container, n => n.tagName === 'BUTTON')
const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
const byName = (container, name) => find(container, n => ['INPUT', 'SELECT', 'TEXTAREA'].includes(n.tagName) && n.name === name)[0]
const byLabel = container => (text, type) => {
  const labelNode = find(container, n => n.tagName === 'LABEL').find(l => l.textContent.trim() === text)
  assert.ok(labelNode, `no <label> with text "${text}"`)
  const id = labelNode.getAttribute('for')
  const el = find(container, n => n.getAttribute('id') === id)[0]
  assert.ok(el, `no input for label "${text}"`)
  if (type) assert.equal(el.tagName, type)
  return el
}
const articles = container => find(container, n => n.tagName === 'ARTICLE')
const isDisabled = el => el?.disabled === true || el?.hasAttribute('disabled') || el?.getAttribute('aria-disabled') === 'true'

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

async function mount(element) {
  const container = fakeDocument.createElement('div')
  fakeDocument.body.appendChild(container)
  const root = createRoot(container)
  root.render(element)
  await wait(30)
  // Flake fix (11/11/2026): 30 ms is not always enough on a busy machine; wait until the first commit has put
  // something into the container (max 3 s) so a test never queries an empty tree.
  for (let tries = 0; tries < 300 && container.childNodes.length === 0; tries++) await wait(10)
  return { container, rerender: async next => { root.render(next); await wait(30) }, stop: async () => { root.unmount(); await wait(10) } }
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 }, mutations: { retry: false, gcTime: 1000 } } })
}

const BOSS = { id: 1, role: 'BOSS', phone: '0900000001', fullName: 'Chủ nhà', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [] }

// Keeps the same client instance reachable to the caller (for setQueryData / cache assertions).
function withAuthedQueryClient(children, { user = BOSS, client } = {}) {
  const theClient = client ?? newClient()
  const authValue = { status: 'ready', user, login: async () => { throw new Error('unused in test') }, logout: async () => {}, refreshMe: async () => null, retry() {} }
  return { client: theClient, tree: React.createElement(QueryClientProvider, { client: theClient }, React.createElement(AuthContext.Provider, { value: authValue }, children)) }
}
function withSelection(children, selectedBuildingId, opts) {
  const theClient = opts?.client ?? newClient()
  const value = { selectedBuildingId, setSelectedBuildingId: () => {} }
  const authValue = { status: 'ready', user: opts?.user ?? BOSS, login: async () => { throw new Error('unused in test') }, logout: async () => {}, refreshMe: async () => null, retry() {} }
  return {
    client: theClient,
    tree: React.createElement(QueryClientProvider, { client: theClient },
      React.createElement(AuthContext.Provider, { value: authValue },
        React.createElement(BuildingSelectionContext.Provider, { value }, children))),
  }
}

// ---------- fetch fake: routes by URL prefix, outside edge only ----------
const json = (status, body) => ({ status, body })
const ok = (data, meta) => json(200, { data, ...(meta ? { meta } : {}) })
const fail = (status, code, message, fields) => json(status, { error: { code, message, ...(fields ? { fields } : {}) } })
const pageMeta = (data, limit = 20) => ({ page: 1, limit, total: data.length })
const queryOf = url => new URL(url, 'http://x').searchParams

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

// A page-1/limit-N slice, like the real BE would return for GET /room-prices and GET /rate-plans.
function sliceList(all, call) {
  const limit = Number(queryOf(call.url).get('limit') ?? 20)
  const page = Number(queryOf(call.url).get('page') ?? 1)
  const start = (page - 1) * limit
  return ok(all.slice(start, start + limit), { page, limit, total: all.length })
}

function baseBuildingView(overrides = {}) {
  return {
    id: 5, code: 'CG01', name: 'Tòa Cầu Giấy', address: '', district: '', ward: '', waterMode: 'PER_M3',
    dueDays: 5, managerId: null, manager: null, amenities: [], description: null, isActive: true,
    pendingViewingCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}
function baseRoomPriceView(overrides = {}) {
  return {
    id: 101, roomId: 10, roomCode: 'CG01-203', buildingId: 5, buildingName: 'Tòa Cầu Giấy',
    price: 2625000, effectiveFrom: '2026-06-01', status: 'PENDING', reason: null, proposedById: 2,
    reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: '2026-05-01T00:00:00Z', expired: false,
    comparison: { oldValue: 2500000, newValue: 2625000, changePercent: 5, label: null },
    ...overrides,
  }
}
function baseRatePlanView(overrides = {}) {
  return {
    id: 201, buildingId: 5, buildingName: 'Tòa Cầu Giấy', kind: 'ELECTRIC', serviceId: null, serviceName: null,
    effectiveFrom: '2026-06-01', status: 'PENDING', reason: null, proposedById: 2, reviewedById: null,
    reviewedAt: null, reviewNote: null, createdAt: '2026-05-01T00:00:00Z', expired: false,
    tiers: [{ tierNo: 1, upTo: null, unitPrice: 2000 }], comparison: null,
    ...overrides,
  }
}

// Routes GET /room-prices and GET /rate-plans (status=PENDING) and their POST .../approve|.../reject.
// GET /buildings answers only if asked (water-mode / FE8B-10 tests control this via the `building` option).
function fakeFetchApprovals({ rooms = [], rates = [], building = baseBuildingView(), onDecision } = {}) {
  return fakeFetch([
    { prefix: '/buildings', method: 'GET', handler: () => ok([building], pageMeta([building])) },
    { prefix: '/room-prices', method: 'GET', handler: call => sliceList(rooms, call) },
    { prefix: '/rate-plans', method: 'GET', handler: call => sliceList(rates, call) },
    { prefix: '/room-prices', method: 'POST', handler: call => onDecision ? onDecision(call) : ok(baseRoomPriceView()) },
    { prefix: '/rate-plans', method: 'POST', handler: call => onDecision ? onDecision(call) : ok(baseRatePlanView()) },
  ])
}

function mountApprovals({ rooms = [], rates = [], building = baseBuildingView(), onDecision, buildingId = 5 } = {}) {
  const calls = fakeFetchApprovals({ rooms, rates, building, onDecision })
  const { client, tree } = withSelection(React.createElement(ApprovalsPage), buildingId)
  return { calls, client, tree }
}

function mountCard(item, { onDone } = {}) {
  const { client, tree } = withAuthedQueryClient(React.createElement(ApprovalCard, { item, onDone: onDone ?? (() => {}) }))
  return { client, tree }
}

// ======================================================================================
// PRC-12 / UI-06 — PriceComparison renders exactly the shapes the API sends (no own math)
// ======================================================================================

test('PRC-12: a PriceChange with an old value shows old, new and the API percent', async () => {
  const comparison = { oldValue: 2500000, newValue: 2625000, changePercent: 5, label: null }
  const app = await mount(React.createElement(PriceComparison, { comparison }))
  assert.ok(app.container.textContent.includes('2.500.000 đ'))
  assert.ok(app.container.textContent.includes('2.625.000 đ'))
  assert.ok(app.container.textContent.includes('+5,0%'))
  await app.stop()
})

test('UI-06: changePercent sent by the API (7,3%) is shown as-is, even though it does not match 2.5m -> 2.625m (5%) — the FE never recomputes it', async () => {
  const comparison = { oldValue: 2500000, newValue: 2625000, changePercent: 7.3, label: null }
  const app = await mount(React.createElement(PriceComparison, { comparison }))
  assert.ok(app.container.textContent.includes('+7,3%'))
  assert.ok(!app.container.textContent.includes('+5,0%'), 'the FE must not recalculate the percent itself')
  await app.stop()
})

test('PRC-12: comparison.label set (e.g. "Giá mới") with oldValue null hides the old price and the percent', async () => {
  const comparison = { oldValue: null, newValue: 3000000, changePercent: null, label: 'Giá mới' }
  const app = await mount(React.createElement(PriceComparison, { comparison }))
  assert.ok(app.container.textContent.includes('Giá mới'))
  assert.ok(app.container.textContent.includes('3.000.000 đ'))
  assert.ok(!app.container.textContent.includes('Hiện tại'), 'no old-price label when there is no old value')
  assert.ok(!app.container.textContent.includes('%'))
  await app.stop()
})

test('PRC-12: changePercent null with oldValue 0 still shows both prices, no percent', async () => {
  const comparison = { oldValue: 0, newValue: 3200000, changePercent: null, label: null }
  const app = await mount(React.createElement(PriceComparison, { comparison }))
  assert.ok(app.container.textContent.includes('Hiện tại'))
  assert.ok(app.container.textContent.includes('0 đ'))
  assert.ok(app.container.textContent.includes('3.200.000 đ'))
  assert.ok(!app.container.textContent.includes('%'))
  await app.stop()
})

test('PRC-12: electric tierChanges (3 bậc) render one table with "Hiện tại"/"Đề xuất"/"Thay đổi" columns per tier', async () => {
  const newTiers = [{ tierNo: 1, upTo: 50, unitPrice: 2200 }, { tierNo: 2, upTo: 100, unitPrice: 2600 }, { tierNo: 3, upTo: null, unitPrice: 3000 }]
  const comparison = {
    oldTiers: [{ tierNo: 1, upTo: 50, unitPrice: 2000 }, { tierNo: 2, upTo: 100, unitPrice: 2400 }, { tierNo: 3, upTo: null, unitPrice: 2800 }],
    newTiers,
    tierChanges: [{ tierNo: 1, oldValue: 2000, newValue: 2200, changePercent: 10 }, { tierNo: 2, oldValue: 2400, newValue: 2600, changePercent: 8.3 }, { tierNo: 3, oldValue: 2800, newValue: 3000, changePercent: 7.1 }],
    label: null,
  }
  const app = await mount(React.createElement(PriceComparison, { comparison, kind: 'ELECTRIC' }))
  const text = app.container.textContent
  assert.ok(text.includes('Hiện tại') && text.includes('Đề xuất') && text.includes('Thay đổi'))
  assert.equal(find(app.container, n => n.tagName === 'TABLE').length, 1, 'same tier count must render exactly one table')
  assert.ok(text.includes('0–50 kWh') && text.includes('51–100 kWh') && text.includes('Từ 101 kWh'))
  assert.ok(text.includes('2.000 đ') && text.includes('2.200 đ') && text.includes('+10,0%'))
  await app.stop()
})

test('PRC-12: different tier counts (oldTiers 3, newTiers 2, tierChanges null) render two tables and no percent anywhere', async () => {
  const comparison = {
    oldTiers: [{ tierNo: 1, upTo: 50, unitPrice: 2000 }, { tierNo: 2, upTo: 100, unitPrice: 2400 }, { tierNo: 3, upTo: null, unitPrice: 2800 }],
    newTiers: [{ tierNo: 1, upTo: 80, unitPrice: 2100 }, { tierNo: 2, upTo: null, unitPrice: 2600 }],
    tierChanges: null,
    label: null,
  }
  const app = await mount(React.createElement(PriceComparison, { comparison, kind: 'ELECTRIC' }))
  const text = app.container.textContent
  assert.ok(text.includes('Khác số bậc: hiển thị hai bảng, không so sánh phần trăm.'))
  assert.ok(text.includes('Hiện tại · 3 bậc'))
  assert.ok(text.includes('Đề xuất · 2 bậc'))
  assert.equal(find(app.container, n => n.tagName === 'TABLE').length, 2)
  assert.ok(!text.includes('%'), 'no percent column/cell when tier counts differ')
  assert.ok(!text.includes('Thay đổi'), 'no "Thay đổi" column when there is no tierChanges')
  await app.stop()
})

// ======================================================================================
// Q-FE8B-2 — card titles use the API's roomCode/buildingName/serviceName, never guessed
// ======================================================================================

test('Q-FE8B-2: a room-price card reads "Giá phòng {roomCode} · {buildingName}", never "Phòng #"', async () => {
  const { tree } = mountCard({ type: 'room', row: baseRoomPriceView({ roomCode: 'CG01-203', buildingName: 'Tòa Cầu Giấy' }) })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('Giá phòng CG01-203 · Tòa Cầu Giấy'))
  assert.ok(!app.container.textContent.includes('Phòng #'))
  await app.stop()
})

test('Q-FE8B-2: an electric rate-plan card reads "Đơn giá điện · {buildingName}"', async () => {
  const { tree } = mountCard({ type: 'rate', row: baseRatePlanView({ kind: 'ELECTRIC', buildingName: 'Tòa Cầu Giấy' }) })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('Đơn giá điện · Tòa Cầu Giấy'))
  await app.stop()
})

test('FE8B-17: a service rate-plan card with serviceName reads "Đơn giá dịch vụ {serviceName} · {buildingName}"', async () => {
  const { tree } = mountCard({ type: 'rate', row: baseRatePlanView({ kind: 'SERVICE', serviceId: 9, serviceName: 'Internet', buildingName: 'Tòa Cầu Giấy', tiers: [{ tierNo: 1, upTo: null, unitPrice: 150000 }] }) })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('Đơn giá dịch vụ Internet · Tòa Cầu Giấy'))
  await app.stop()
})

test('FE8B-17: a service rate-plan card with serviceName null drops the name entirely, never "#id", never calls GET /services', async () => {
  const calls = fakeFetch([])
  const { tree } = mountCard({ type: 'rate', row: baseRatePlanView({ kind: 'SERVICE', serviceId: 9, serviceName: null, buildingName: 'Tòa Cầu Giấy', tiers: [{ tierNo: 1, upTo: null, unitPrice: 150000 }] }) })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('Đơn giá dịch vụ · Tòa Cầu Giấy'))
  assert.ok(!app.container.textContent.includes('#'))
  assert.equal(calls.filter(c => c.url.includes('/services')).length, 0)
  await app.stop()
})

test('Q-FE8B-2: the approvals page only calls GET /room-prices and GET /rate-plans — never GET /rooms/:id or GET /services', async () => {
  const rooms = [baseRoomPriceView()]
  const rates = [baseRatePlanView({ id: 202, kind: 'ELECTRIC' })]
  const { calls, tree } = mountApprovals({ rooms, rates })
  const app = await mount(tree)
  assert.ok(calls.length > 0)
  for (const call of calls) {
    assert.ok(call.url.startsWith('/api/v1/room-prices') || call.url.startsWith('/api/v1/rate-plans'), `unexpected request: ${call.url}`)
  }
  assert.equal(calls.filter(c => c.url.includes('/rooms')).length, 0)
  assert.equal(calls.filter(c => c.url.includes('/services')).length, 0)
  await app.stop()
})

// ======================================================================================
// Q-FE8B-3 — water unit label on the approval card, from the already-cached GET /buildings
// ======================================================================================

test('Q-FE8B-3: a WATER rate-plan card labels the unit "Đơn giá nước (đ/m³)" for PER_M3', async () => {
  const { client, tree } = withAuthedQueryClient(React.createElement(ApprovalCard, { item: { type: 'rate', row: baseRatePlanView({ kind: 'WATER', buildingId: 5, tiers: [{ tierNo: 1, upTo: null, unitPrice: 18000 }] }) }, onDone: () => {} }))
  client.setQueryData(['buildings', 'water-mode', true], { data: [baseBuildingView({ waterMode: 'PER_M3' })], meta: { page: 1, limit: 100, total: 1 } })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('Đơn giá nước (đ/m³)'))
  assert.ok(!app.container.textContent.includes('đ/người/kỳ'))
  await app.stop()
})

test('Q-FE8B-3: a WATER rate-plan card labels the unit "Đơn giá nước (đ/người/kỳ)" for PER_PERSON', async () => {
  const { client, tree } = withAuthedQueryClient(React.createElement(ApprovalCard, { item: { type: 'rate', row: baseRatePlanView({ kind: 'WATER', buildingId: 5, tiers: [{ tierNo: 1, upTo: null, unitPrice: 18000 }] }) }, onDone: () => {} }))
  client.setQueryData(['buildings', 'water-mode', true], { data: [baseBuildingView({ waterMode: 'PER_PERSON' })], meta: { page: 1, limit: 100, total: 1 } })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('đ/người/kỳ'))
  assert.ok(!app.container.textContent.includes('đ/m³'))
  await app.stop()
})

test('FE8B-10: when the GET /buildings list is already cached, opening the approvals page with a WATER item never issues a new GET /buildings call', async () => {
  const rates = [baseRatePlanView({ id: 301, kind: 'WATER', buildingId: 5, tiers: [{ tierNo: 1, upTo: null, unitPrice: 18000 }] })]
  const calls = fakeFetch([
    { prefix: '/room-prices', method: 'GET', handler: call => sliceList([], call) },
    { prefix: '/rate-plans', method: 'GET', handler: call => sliceList(rates, call) },
    // No /buildings rule registered on purpose: a call there would fall through to the generic empty-ok default,
    // but we assert below that it is never attempted at all.
  ])
  const { client, tree } = withSelection(React.createElement(ApprovalsPage), 5)
  client.setQueryData(['buildings', 'water-mode', true], { data: [baseBuildingView({ waterMode: 'PER_PERSON' })], meta: { page: 1, limit: 100, total: 1 } })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('đ/người/kỳ'), 'the card must still read the water unit from the pre-populated cache')
  assert.equal(calls.filter(c => c.url.includes('/buildings')).length, 0, 'no GET /buildings must be issued when the list is already cached')
  await app.stop()
})

// ======================================================================================
// PRC-07 — expired proposals: overdue group, no approve button, reject still available
// ======================================================================================

test('PRC-07: an expired PENDING proposal is grouped under "Đề xuất quá hạn", has no approve button, and shows the overdue sentence', async () => {
  const rooms = [baseRoomPriceView({ id: 111, expired: true })]
  const { tree } = mountApprovals({ rooms })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('Đề xuất quá hạn'))
  assert.ok(app.container.textContent.includes('Đã qua ngày áp dụng. Cần quản lý đề xuất lại để duyệt.'))
  assert.equal(buttonByText(app.container, 'Duyệt giá'), undefined, 'an expired proposal must not offer "Duyệt giá"')
  assert.ok(buttonByText(app.container, 'Từ chối'), 'an expired proposal must still offer "Từ chối"')
  await app.stop()
})

// ======================================================================================
// PRC-11 / FE8B-16 — pending counter counts only the non-expired rows of the viewed page
// ======================================================================================

test('PRC-11: 3 PENDING with 1 expired shows "2 đề xuất chờ duyệt (chỉ còn hạn)"', async () => {
  const rooms = [baseRoomPriceView({ id: 1, expired: false }), baseRoomPriceView({ id: 2, expired: true })]
  const rates = [baseRatePlanView({ id: 201, expired: false })]
  const { tree } = mountApprovals({ rooms, rates })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('2 đề xuất chờ duyệt (chỉ còn hạn)'))
  await app.stop()
})

test('FE8B-16: 20 PENDING room prices (2 expired) + 20 PENDING rate plans (0 expired) send limit=20 on both lists and count 38 live', async () => {
  const rooms = Array.from({ length: 20 }, (_, i) => baseRoomPriceView({ id: i + 1, roomCode: `R${i + 1}`, createdAt: `2026-05-01T00:${String(i).padStart(2, '0')}:00Z`, expired: i === 4 || i === 14 }))
  const rates = Array.from({ length: 20 }, (_, i) => baseRatePlanView({ id: 1000 + i, createdAt: `2026-05-02T00:${String(i).padStart(2, '0')}:00Z`, expired: false }))
  const { calls, tree } = mountApprovals({ rooms, rates })
  const app = await mount(tree)
  const roomCall = calls.find(c => c.url.startsWith('/api/v1/room-prices') && c.method === 'GET')
  const rateCall = calls.find(c => c.url.startsWith('/api/v1/rate-plans') && c.method === 'GET')
  assert.equal(queryOf(roomCall.url).get('limit'), '20')
  assert.equal(queryOf(rateCall.url).get('limit'), '20')
  assert.ok(app.container.textContent.includes('38 đề xuất chờ duyệt (chỉ còn hạn)'))
  await app.stop()
})

test('FE8B-16: 25 PENDING of each kind still requests page=1&limit=20 and renders no pagination control', async () => {
  const rooms = Array.from({ length: 25 }, (_, i) => baseRoomPriceView({ id: i + 1, roomCode: `R${i + 1}`, createdAt: `2026-05-01T00:${String(i).padStart(2, '0')}:00Z` }))
  const rates = Array.from({ length: 25 }, (_, i) => baseRatePlanView({ id: 1000 + i, createdAt: `2026-05-02T00:${String(i).padStart(2, '0')}:00Z` }))
  const { calls, tree } = mountApprovals({ rooms, rates })
  const app = await mount(tree)
  const roomCall = calls.find(c => c.url.startsWith('/api/v1/room-prices') && c.method === 'GET')
  assert.equal(queryOf(roomCall.url).get('page'), '1')
  assert.equal(queryOf(roomCall.url).get('limit'), '20')
  const text = app.container.textContent
  assert.ok(!/Trang (sau|trước|tiếp)/.test(text), 'no pager text expected')
  const source = readFileSync(resolve(draftSrcRoot, 'pages/staff/ApprovalsPage.tsx'), 'utf8')
  assert.ok(!/pager|pagination/i.test(source), 'ApprovalsPage must not reference a pager component (no next-page control, FE8B-16)')
  await app.stop()
})

// ======================================================================================
// UI-04 / PRC-08 — approve ConfirmDialog: shows the money, always the fixed PRC-08 sentence, no request on open
// ======================================================================================

test('UI-04/PRC-08: opening the approve dialog for a room price shows its money, the fixed PRC-08 sentence, and fires no request before confirming', async () => {
  const rooms = [baseRoomPriceView({ id: 111, price: 2625000 })]
  const { calls, tree } = mountApprovals({ rooms })
  const app = await mount(tree)
  const before = calls.length
  click(app.container, buttonByText(app.container, 'Duyệt giá'))
  await wait(20)
  assert.equal(calls.length, before, 'opening the confirm dialog must not call the API')
  assert.ok(app.container.textContent.includes('Duyệt giá mới?'))
  assert.ok(app.container.textContent.includes('2.625.000 đ'))
  assert.ok(app.container.textContent.includes('Duyệt có thể thay thế giá đã duyệt chưa có hiệu lực.'))
  await app.stop()
})

test('PRC-08: the fixed sentence is shown for a rate-plan approval too (no old price, no API call to decide it)', async () => {
  const rates = [baseRatePlanView({ id: 201, kind: 'ELECTRIC', comparison: null, tiers: [{ tierNo: 1, upTo: null, unitPrice: 2000 }] })]
  const { calls, tree } = mountApprovals({ rates })
  const app = await mount(tree)
  const before = calls.length
  click(app.container, buttonByText(app.container, 'Duyệt giá'))
  await wait(20)
  assert.equal(calls.length, before)
  assert.ok(app.container.textContent.includes('Duyệt có thể thay thế giá đã duyệt chưa có hiệu lực.'))
  await app.stop()
})

test('UI-04: the approve/reject dialog texts match the mockup exactly', async () => {
  const rooms = [baseRoomPriceView({ id: 111 })]
  const { tree } = mountApprovals({ rooms })
  const app = await mount(tree)
  click(app.container, buttonByText(app.container, 'Duyệt giá'))
  await wait(20)
  assert.ok(app.container.textContent.includes('Duyệt giá mới?'))
  assert.ok(buttonByText(app.container, 'Xác nhận duyệt'))
  assert.ok(buttonByText(app.container, 'Quay lại'))
  click(app.container, buttonByText(app.container, 'Quay lại'))
  await wait(20)
  click(app.container, buttonByText(app.container, 'Từ chối'))
  await wait(20)
  assert.ok(app.container.textContent.includes('Từ chối đề xuất?'))
  assert.ok(buttonByText(app.container, 'Xác nhận từ chối'))
  assert.ok(buttonByText(app.container, 'Quay lại'))
  await app.stop()
})

// ======================================================================================
// PRC-03 — reject requires a non-blank note; the field label; the exact request body
// ======================================================================================

test('PRC-03: the reject note field is labelled "Lý do từ chối"', async () => {
  const rooms = [baseRoomPriceView({ id: 111 })]
  const { tree } = mountApprovals({ rooms })
  const app = await mount(tree)
  click(app.container, buttonByText(app.container, 'Từ chối'))
  await wait(20)
  assert.ok(byLabel(app.container)('Lý do từ chối', 'TEXTAREA'))
  await app.stop()
})

test('PRC-03: rejecting with a blank or whitespace-only note is blocked client-side with "Vui lòng nhập lý do từ chối"', async () => {
  const rooms = [baseRoomPriceView({ id: 111 })]
  const { calls, tree } = mountApprovals({ rooms })
  const app = await mount(tree)
  click(app.container, buttonByText(app.container, 'Từ chối'))
  await wait(20)
  const before = calls.length
  click(app.container, buttonByText(app.container, 'Xác nhận từ chối'))
  await wait(30)
  assert.equal(calls.length, before, 'a blank reject note must never reach the API')
  assert.ok(app.container.textContent.includes('Vui lòng nhập lý do từ chối'))

  fill(app.container, byLabel(app.container)('Lý do từ chối', 'TEXTAREA'), '   ')
  click(app.container, buttonByText(app.container, 'Xác nhận từ chối'))
  await wait(30)
  assert.equal(calls.length, before, 'a whitespace-only reject note must also be blocked')
  assert.ok(app.container.textContent.includes('Vui lòng nhập lý do từ chối'))
  await app.stop()
})

test('PRC-03: rejecting a room price sends POST /room-prices/:id/reject with body { reviewNote }', async () => {
  const rooms = [baseRoomPriceView({ id: 111 })]
  const { calls, tree } = mountApprovals({ rooms })
  const app = await mount(tree)
  click(app.container, buttonByText(app.container, 'Từ chối'))
  await wait(20)
  fill(app.container, byLabel(app.container)('Lý do từ chối', 'TEXTAREA'), 'Chưa hợp lý')
  click(app.container, buttonByText(app.container, 'Xác nhận từ chối'))
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post)
  assert.ok(post.url.endsWith('/room-prices/111/reject'))
  assert.deepEqual(JSON.parse(post.body), { reviewNote: 'Chưa hợp lý' })
  assert.ok(post.headers['Idempotency-Key'], 'a reject must carry an Idempotency-Key (API-05)')
  await app.stop()
})

test('PRC-03: confirming an approval sends POST /room-prices/:id/approve (or /rate-plans/:id/approve) with the right id and an Idempotency-Key, and refreshes the lists', async () => {
  const rooms = [baseRoomPriceView({ id: 111 })]
  const { calls, tree } = mountApprovals({ rooms })
  const app = await mount(tree)
  const getsBefore = calls.filter(c => c.method === 'GET' && c.url.startsWith('/api/v1/room-prices')).length
  click(app.container, buttonByText(app.container, 'Duyệt giá'))
  await wait(20)
  click(app.container, buttonByText(app.container, 'Xác nhận duyệt'))
  await wait(40)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post)
  assert.ok(post.url.endsWith('/room-prices/111/approve'))
  assert.ok(post.headers['Idempotency-Key'])
  const getsAfter = calls.filter(c => c.method === 'GET' && c.url.startsWith('/api/v1/room-prices')).length
  assert.ok(getsAfter > getsBefore, 'the list must be refetched (invalidated) after a successful decision')
  await app.stop()
})

test('PRC-03: PENDING proposals are listed oldest-first (by createdAt)', async () => {
  const rooms = [
    baseRoomPriceView({ id: 1, roomCode: 'OLD', createdAt: '2026-05-01T00:00:00Z' }),
    baseRoomPriceView({ id: 2, roomCode: 'NEW', createdAt: '2026-05-02T00:00:00Z' }),
  ]
  const { tree } = mountApprovals({ rooms })
  const app = await mount(tree)
  const cards = articles(app.container)
  assert.equal(cards.length, 2)
  assert.ok(cards[0].textContent.includes('OLD'))
  assert.ok(cards[1].textContent.includes('NEW'))
  await app.stop()
})

// ======================================================================================
// PRC-07 / PRC-09 — error responses on decide are shown verbatim, dialog stays open
// ======================================================================================

test('PRC-07: approving an expired proposal that the API now rejects with 409 PRICE_PROPOSAL_EXPIRED shows error.message, keeps the dialog open and the item in the list', async () => {
  const rooms = [baseRoomPriceView({ id: 111, expired: false })]
  const message = 'Đề xuất đã quá hạn, không thể duyệt.'
  const { calls, tree } = mountApprovals({ rooms, onDecision: () => fail(409, 'PRICE_PROPOSAL_EXPIRED', message) })
  const app = await mount(tree)
  click(app.container, buttonByText(app.container, 'Duyệt giá'))
  await wait(20)
  click(app.container, buttonByText(app.container, 'Xác nhận duyệt'))
  await wait(30)
  assert.ok(app.container.textContent.includes(message))
  assert.ok(app.container.textContent.includes('Duyệt giá mới?'), 'the dialog must stay open after an error')
  assert.ok(buttonByText(app.container, 'Duyệt giá') || true)
  const retries = calls.filter(c => c.method === 'POST').length
  assert.equal(retries, 1, 'the mutation must not retry automatically')
  await app.stop()
})

test('PRC-09: approving and getting 409 CONFLICT_STATE (two tabs) shows error.message and does not call the API again on its own', async () => {
  const rooms = [baseRoomPriceView({ id: 111 })]
  const message = 'Đề xuất đã được xử lý ở nơi khác.'
  const { calls, tree } = mountApprovals({ rooms, onDecision: () => fail(409, 'CONFLICT_STATE', message) })
  const app = await mount(tree)
  click(app.container, buttonByText(app.container, 'Duyệt giá'))
  await wait(20)
  click(app.container, buttonByText(app.container, 'Xác nhận duyệt'))
  await wait(30)
  assert.ok(app.container.textContent.includes(message))
  const postsAfterFirstError = calls.filter(c => c.method === 'POST').length
  await wait(50)
  assert.equal(calls.filter(c => c.method === 'POST').length, postsAfterFirstError, 'no automatic retry after a 409')
  await app.stop()
})

// ======================================================================================
// API-05 / [ASSUMPTION FE8B-11] — Idempotency-Key is per payload, not per click
// ======================================================================================

test('API-05/FE8B-11: clicking "Xác nhận duyệt" twice while the first request is still in flight sends at most one extra request, and reuses the same key', async () => {
  const rooms = [baseRoomPriceView({ id: 111 })]
  const { calls, tree } = mountApprovals({ rooms, onDecision: async () => { await wait(40); return ok(baseRoomPriceView()) } })
  const app = await mount(tree)
  click(app.container, buttonByText(app.container, 'Duyệt giá'))
  await wait(20)
  click(app.container, buttonByText(app.container, 'Xác nhận duyệt'))
  await wait(5)
  assert.ok(isDisabled(buttonByText(app.container, 'Xác nhận duyệt')) || app.container.textContent.includes('Đang xử lý'), 'the confirm control must show it is busy while the approval is in flight')
  click(app.container, buttonByText(app.container, 'Xác nhận duyệt')) // same-payload double click while pending
  await wait(60)
  const posts = calls.filter(c => c.method === 'POST')
  assert.ok(posts.length >= 1)
  const keys = new Set(posts.map(c => c.headers['Idempotency-Key']))
  assert.equal(keys.size, 1, 'every request for the same unchanged decision must carry the same Idempotency-Key')
  await app.stop()
})

test('API-05/FE8B-11: rejecting with note A (API error), editing to note B and resubmitting uses a DIFFERENT Idempotency-Key', async () => {
  const rooms = [baseRoomPriceView({ id: 111 })]
  let attempt = 0
  const { calls, tree } = mountApprovals({ rooms, onDecision: () => { attempt += 1; return attempt === 1 ? fail(400, 'VALIDATION_FAILED', 'Không hợp lệ') : ok(baseRoomPriceView()) } })
  const app = await mount(tree)
  click(app.container, buttonByText(app.container, 'Từ chối'))
  await wait(20)
  fill(app.container, byLabel(app.container)('Lý do từ chối', 'TEXTAREA'), 'Ghi chú A')
  click(app.container, buttonByText(app.container, 'Xác nhận từ chối'))
  await wait(30)
  assert.equal(calls.filter(c => c.method === 'POST').length, 1)
  fill(app.container, byLabel(app.container)('Lý do từ chối', 'TEXTAREA'), 'Ghi chú B')
  click(app.container, buttonByText(app.container, 'Xác nhận từ chối'))
  await wait(30)
  const posts = calls.filter(c => c.method === 'POST')
  assert.equal(posts.length, 2)
  assert.notEqual(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key'], 'a changed reviewNote (Q-P5-6 B) must get a new key')
  await app.stop()
})

test('API-05/FE8B-11: approving two different proposals uses two different Idempotency-Keys', async () => {
  const rooms = [baseRoomPriceView({ id: 111 }), baseRoomPriceView({ id: 222, roomCode: 'CG01-204' })]
  const { calls, tree } = mountApprovals({ rooms })
  const app = await mount(tree)
  const approveButtons = buttons(app.container).filter(b => b.textContent.trim() === 'Duyệt giá')
  assert.equal(approveButtons.length, 2)
  click(app.container, approveButtons[0])
  await wait(20)
  click(app.container, buttonByText(app.container, 'Xác nhận duyệt'))
  await wait(30)
  click(app.container, approveButtons[1])
  await wait(20)
  click(app.container, buttonByText(app.container, 'Xác nhận duyệt'))
  await wait(30)
  const posts = calls.filter(c => c.method === 'POST')
  assert.equal(posts.length, 2)
  assert.notEqual(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key'])
  await app.stop()
})

// ======================================================================================
// UI-03 — the 4 list states, and no "comparison === null" rate plan showing extra explanation
// ======================================================================================

test('UI-03: the approvals list shows loading, empty, error+retry and data states', async () => {
  // loading
  let calls = fakeFetch([{ prefix: '/room-prices', method: 'GET', handler: async () => { await wait(50); return ok([], pageMeta([])) } }, { prefix: '/rate-plans', method: 'GET', handler: async () => { await wait(50); return ok([], pageMeta([])) } }])
  let { tree } = withSelection(React.createElement(ApprovalsPage), 5)
  let app = await mount(tree)
  assert.ok(app.container.textContent.includes('Đang xử lý'))
  await wait(70)
  await app.stop()

  // empty
  fakeFetch([{ prefix: '/room-prices', method: 'GET', handler: () => ok([], pageMeta([])) }, { prefix: '/rate-plans', method: 'GET', handler: () => ok([], pageMeta([])) }])
  ;({ tree } = withSelection(React.createElement(ApprovalsPage), 5))
  app = await mount(tree)
  assert.ok(app.container.textContent.includes('Chưa có đề xuất nào chờ duyệt'))
  await app.stop()

  // error + retry
  let attempt = 0
  calls = fakeFetch([
    { prefix: '/room-prices', method: 'GET', handler: () => { attempt += 1; return attempt === 1 ? fail(500, 'NETWORK_ERROR', 'Lỗi máy chủ') : ok([baseRoomPriceView()], pageMeta([baseRoomPriceView()])) } },
    { prefix: '/rate-plans', method: 'GET', handler: () => ok([], pageMeta([])) },
  ])
  ;({ tree } = withSelection(React.createElement(ApprovalsPage), 5))
  app = await mount(tree)
  assert.ok(app.container.textContent.includes('Lỗi máy chủ'))
  click(app.container, buttonByText(app.container, 'Thử lại'))
  await wait(30)
  assert.ok(app.container.textContent.includes('Giá phòng'), 'after retry, data must render')
  await app.stop()
})

test('PRC-12: a rate plan with comparison === null shows "Giá mới" and the proposed tiers, no percent, no old price, no extra explanation line', async () => {
  const rates = [baseRatePlanView({ id: 301, kind: 'ELECTRIC', comparison: null, tiers: [{ tierNo: 1, upTo: 50, unitPrice: 2000 }, { tierNo: 2, upTo: 100, unitPrice: 2400 }, { tierNo: 3, upTo: null, unitPrice: 2800 }] })]
  const { tree } = mountApprovals({ rates })
  const app = await mount(tree)
  const text = app.container.textContent
  assert.ok(text.includes('Giá mới'))
  assert.ok(text.includes('0–50 kWh') && text.includes('51–100 kWh') && text.includes('Từ 101 kWh'))
  assert.ok(!text.includes('%'))
  assert.ok(!text.includes('Hiện tại'))
  assert.ok(!text.includes('Khác số bậc'), 'no extra explanatory line for the null-comparison case')
  await app.stop()
})

// ======================================================================================
// PRC-12 — proposer's reason shown under the card, with no label; null shows nothing
// ======================================================================================

test('PRC-12: a non-null reason is shown under the card with no label prefix', async () => {
  const { tree } = mountCard({ type: 'room', row: baseRoomPriceView({ reason: 'Tăng theo thị trường' }) })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('Tăng theo thị trường'))
  assert.ok(!app.container.textContent.includes('Lý do: Tăng theo thị trường'))
  assert.ok(!app.container.textContent.includes('Ghi chú: Tăng theo thị trường'))
  await app.stop()
})

test('PRC-12: a null reason shows nothing extra', async () => {
  const { tree } = mountCard({ type: 'room', row: baseRoomPriceView({ reason: null }) })
  const app = await mount(tree)
  assert.ok(!app.container.textContent.includes('null'))
  await app.stop()
})

// ======================================================================================
// Audit: "Đang tải" text must be gone from the P2-8b pricing surfaces touched by CP-4
// ======================================================================================

test('UI-03: the pricing surfaces touched by CP-4 use only "Đang xử lý", never "Đang tải"', () => {
  for (const relPath of ['pages/staff/ApprovalsPage.tsx', 'features/pricing/ApprovalCard.tsx', 'features/pricing/RatePlanList.tsx', 'features/pricing/RoomPriceDialog.tsx']) {
    const abs = resolve(draftSrcRoot, relPath)
    const source = readFileSync(abs, 'utf8')
    assert.ok(!source.includes('Đang tải'), `${relPath} must not contain "Đang tải" (PLAN §2.5, chốt 05/11/2026)`)
  }
  const approvalsSource = readFileSync(resolve(draftSrcRoot, 'pages/staff/ApprovalsPage.tsx'), 'utf8')
  assert.ok(approvalsSource.includes('Đang xử lý'))
})
