import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

// CP-2 (FE-P2-09, PLAN.md CP-2): src/features/pricing/RoomPriceDialog.tsx, src/features/pricing/api.ts
// (newIdempotencyKey, [ASSUMPTION FE8B-14]), src/features/rooms/RoomInspector.tsx (notice wording + the
// button that opens this dialog — [ASSUMPTION FE8B-13]). Spec/PLAN: PRC-01/02/04/07/10, API-05, UI-05/08/09,
// Q-P5-7, [ASSUMPTION FE8B-11] (one Idempotency-Key per payload), [ASSUMPTION FE8B-12] (prefill on "Đề xuất
// lại"), [ASSUMPTION FE8B-13] (rooms-dialog markup, not ConfirmDialog), [ASSUMPTION FE8B-14] (key fallback).
//
// Outside edges faked: globalThis.fetch (network), the minimal fake DOM below (same shape as cp7-rooms.test.mjs;
// Node has none, no jsdom installed) and, for the FE8B-14 tests only, globalThis.crypto (to exercise the
// documented fallback branches without real randomness). Every module under test (RoomPriceDialog, RoomInspector,
// pricing/api.ts, pricing/schemas.ts, pricing/labels.ts) is transpiled and run unmodified, mounted with real
// react-dom/client, real @tanstack/react-query, real react-hook-form + zod. RoomPriceDialog reads useAuth(),
// so mounts wrap a real AuthContext.Provider with a fixture value (not a mock of the unit under test).

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = draftSrcRoot // approved fix 2026-11-05-FE-P2-8a-test-path-fix: path-depth independent

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
const { QueryClient, QueryClientProvider, useQuery } = nodeRequire('@tanstack/react-query')

const { RoomPriceDialog } = load(resolve(draftSrcRoot, 'features/pricing/RoomPriceDialog.tsx'))
const { RoomInspector } = load(resolve(draftSrcRoot, 'features/rooms/RoomInspector.tsx'))
const pricingApi = load(resolve(draftSrcRoot, 'features/pricing/api.ts'))
const { AuthContext } = load(resolve(draftSrcRoot, 'app/auth-context.ts'))

// ---------- DOM query / event helpers (same style as cp7-rooms.test.mjs) ----------
const wait = ms => new Promise(r => setTimeout(r, ms))
const walkTree = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
const find = (root, pred) => walkTree(root).filter(n => n.nodeType === 1 && pred(n))
const buttons = container => find(container, n => n.tagName === 'BUTTON')
const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
const inputs = container => find(container, n => ['INPUT', 'TEXTAREA'].includes(n.tagName))
const byLabel = container => (text, type) => {
  const labelNode = find(container, n => n.tagName === 'LABEL').find(l => l.textContent.trim() === text)
  assert.ok(labelNode, `no <label> with text "${text}"`)
  const id = labelNode.getAttribute('for')
  const el = find(container, n => n.getAttribute('id') === id)[0]
  assert.ok(el, `no input for label "${text}"`)
  if (type) assert.equal(el.tagName, type)
  return el
}
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
const MANAGER = { id: 2, role: 'MANAGER', phone: '0900000002', fullName: 'Quản lý A', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [{ id: 5, code: 'B1', name: 'Tòa B1' }] }

// Mounts the dialog itself, wrapped in the real QueryClientProvider + AuthContext.Provider it needs.
// A probe query on ['rooms'] is mounted alongside it (UI-09 only cares whether invalidateQueries(['rooms'])
// actually marks that key as needing a refetch — this is test harness, not a stub of the dialog under test).
function mountDialog({ room, user = BOSS, client, withRoomsProbe = false }) {
  const theClient = client ?? newClient()
  const probe = withRoomsProbe ? React.createElement(RoomsProbe) : null
  const authValue = { status: 'ready', user, login: async () => { throw new Error('unused in test') }, logout: async () => {}, refreshMe: async () => null, retry() {} }
  const tree = React.createElement(QueryClientProvider, { client: theClient },
    React.createElement(AuthContext.Provider, { value: authValue }, probe, React.createElement(RoomPriceDialog, { room, onClose: onCloseSpy.fn })))
  return { client: theClient, tree }
}

function RoomsProbe() {
  useQuery({ queryKey: ['rooms'], queryFn: () => fetch('/api/v1/rooms?probe=1').then(r => r.json()) })
  return null
}

// A tiny spy for onClose: records call count without faking anything inside RoomPriceDialog itself.
const onCloseSpy = { calls: 0, fn: () => { onCloseSpy.calls += 1 } }

function withAuthedQuery(children, { user = BOSS, client } = {}) {
  const authValue = { status: 'ready', user, login: async () => { throw new Error('unused in test') }, logout: async () => {}, refreshMe: async () => null, retry() {} }
  return React.createElement(QueryClientProvider, { client: client ?? newClient() }, React.createElement(AuthContext.Provider, { value: authValue }, children))
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

function baseRoomGridItem(overrides = {}) {
  return {
    id: 10, buildingId: 5, code: 'A101', floor: 1, areaM2: 20, price: 3_000_000, maxOccupants: 2,
    underMaintenance: false, isActive: true, status: 'Trống', pendingProposal: null, imageCount: 0,
    ...overrides,
  }
}

function baseRoomPriceView(overrides = {}) {
  return {
    id: 31, roomId: 10, roomCode: 'A101', buildingId: 5, buildingName: 'Tòa Cầu Giấy',
    price: 3_000_000, effectiveFrom: '2026-06-15', status: 'PENDING', reason: null,
    proposedById: 1, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: '2026-06-01T00:00:00Z',
    expired: false, comparison: { oldValue: null, newValue: 3_000_000, changePercent: null, label: 'Giá mới' },
    ...overrides,
  }
}

const { todayHanoi, plusDays } = load(resolve(draftSrcRoot, 'features/pricing/labels.ts'))

test.beforeEach(() => { onCloseSpy.calls = 0 })

// ======================================================================================
// PRC-01 — submitting the proposal, boundaries
// ======================================================================================

test('PRC-01: filling price and today\'s date and submitting POSTs /room-prices with roomId/price/effectiveFrom/reason', async () => {
  const calls = fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: () => ok(baseRoomPriceView()) }])
  const { tree } = mountDialog({ room: baseRoomGridItem() })
  const app = await mount(tree)
  const by = byLabel(app.container)
  fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
  fill(app.container, by('Áp dụng từ ngày'), todayHanoi())
  fill(app.container, by('Lý do (tuỳ chọn)'), 'Thị trường tăng')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  const post = calls.find(c => c.method === 'POST')
  assert.ok(post, 'POST /room-prices must have been sent')
  assert.deepEqual(JSON.parse(post.body), { roomId: 10, price: 2_600_000, effectiveFrom: todayHanoi(), reason: 'Thị trường tăng' })
  await app.stop()
})

test('PRC-01: a date before today is blocked client-side — no request, error shown on the date field', async () => {
  const calls = fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: () => ok(baseRoomPriceView()) }])
  const { tree } = mountDialog({ room: baseRoomGridItem() })
  const app = await mount(tree)
  const by = byLabel(app.container)
  fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
  fill(app.container, by('Áp dụng từ ngày'), plusDays(todayHanoi(), -1))
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.length, 0, 'a past effectiveFrom must never reach the API')
  assert.ok(app.container.textContent.includes('Ngày hiệu lực không được trước hôm nay'))
  await app.stop()
})

test('PRC-01: price 0 and INT32_MAX+1 are blocked client-side; price 1 reaches the API', async () => {
  for (const [price, shouldSend] of [[0, false], [1, true], [2147483648, false]]) {
    const calls = fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: () => ok(baseRoomPriceView()) }])
    const { tree } = mountDialog({ room: baseRoomGridItem() })
    const app = await mount(tree)
    const by = byLabel(app.container)
    fill(app.container, by('Giá mới (đ/tháng)'), String(price))
    fill(app.container, by('Áp dụng từ ngày'), todayHanoi())
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await wait(30)
    assert.equal(calls.length > 0, shouldSend, `price ${price}: expected request sent = ${shouldSend}`)
    await app.stop()
  }
})

test('PRC-01: effectiveFrom today and today+1 (the boundary) both reach the API', async () => {
  for (const date of [todayHanoi(), plusDays(todayHanoi(), 1)]) {
    const calls = fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: () => ok(baseRoomPriceView()) }])
    const { tree } = mountDialog({ room: baseRoomGridItem() })
    const app = await mount(tree)
    const by = byLabel(app.container)
    fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
    fill(app.container, by('Áp dụng từ ngày'), date)
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await wait(30)
    assert.equal(calls.length, 1, `date ${date} must reach the API`)
    await app.stop()
  }
})

// ======================================================================================
// PRC-02/PRC-04 — replacement notice, Boss vs Manager copy
// ======================================================================================

test('PRC-02: a non-expired pendingProposal shows "Đề xuất đang chờ duyệt cho phòng này sẽ được thay thế."', async () => {
  const { tree } = mountDialog({ room: baseRoomGridItem({ pendingProposal: { id: 1, effectiveFrom: '2026-07-01', expired: false } }) })
  const app = await mount(tree)
  assert.ok(app.container.textContent.includes('Đề xuất đang chờ duyệt cho phòng này sẽ được thay thế.'))
  await app.stop()
})

test('PRC-04: Boss sees "Bạn là chủ nhà: đề xuất được duyệt ngay.", manager sees "Đề xuất của bạn sẽ chờ chủ nhà duyệt."', async () => {
  let app = await mount(mountDialog({ room: baseRoomGridItem(), user: BOSS }).tree)
  assert.ok(app.container.textContent.includes('Bạn là chủ nhà: đề xuất được duyệt ngay.'))
  await app.stop()

  app = await mount(mountDialog({ room: baseRoomGridItem(), user: MANAGER }).tree)
  assert.ok(app.container.textContent.includes('Đề xuất của bạn sẽ chờ chủ nhà duyệt.'))
  await app.stop()
})

// ======================================================================================
// Q-P5-7 / UI-05 — API errors
// ======================================================================================

test('Q-P5-7: a 403 OUT_OF_SCOPE message is shown and the dialog stays open (onClose not called)', async () => {
  fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: () => fail(403, 'OUT_OF_SCOPE', 'Bạn không có quyền với tòa này') }])
  const { tree } = mountDialog({ room: baseRoomGridItem() })
  const app = await mount(tree)
  const by = byLabel(app.container)
  fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
  fill(app.container, by('Áp dụng từ ngày'), todayHanoi())
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(app.container.textContent.includes('Bạn không có quyền với tòa này'))
  assert.equal(onCloseSpy.calls, 0, 'onClose must not be called after a failed submit')
  await app.stop()
})

test('UI-05: a 400 with fields.effectiveFrom shows that message next to the date input', async () => {
  fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: () => fail(400, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ', { effectiveFrom: 'Ngày áp dụng trùng với một đề xuất khác' }) }])
  const { tree } = mountDialog({ room: baseRoomGridItem() })
  const app = await mount(tree)
  const by = byLabel(app.container)
  fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
  fill(app.container, by('Áp dụng từ ngày'), todayHanoi())
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(app.container.textContent.includes('Ngày áp dụng trùng với một đề xuất khác'))
  await app.stop()
})

test('UI-05: an empty effectiveFrom shows "Vui lòng chọn ngày hiệu lực" and never sends a request', async () => {
  const calls = fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: () => ok(baseRoomPriceView()) }])
  const { tree } = mountDialog({ room: baseRoomGridItem() })
  const app = await mount(tree)
  const by = byLabel(app.container)
  fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.length, 0)
  assert.ok(app.container.textContent.includes('Vui lòng chọn ngày hiệu lực'))
  await app.stop()
})

test('UI-05: a malformed effectiveFrom ("05-11-2026") still shows the schema format message', async () => {
  const calls = fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: () => ok(baseRoomPriceView()) }])
  const { tree } = mountDialog({ room: baseRoomGridItem() })
  const app = await mount(tree)
  const by = byLabel(app.container)
  fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
  fill(app.container, by('Áp dụng từ ngày'), '05-11-2026')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.length, 0)
  assert.ok(app.container.textContent.includes('Ngày hiệu lực phải có dạng YYYY-MM-DD'))
  await app.stop()
})

// ======================================================================================
// API-05 / [ASSUMPTION FE8B-11] — Idempotency-Key is per payload, not per dialog lifetime
// ======================================================================================

test('API-05/FE8B-11: two submits with the IDENTICAL payload (a slow double submit) share one Idempotency-Key, and the button is disabled while sending', async () => {
  const calls = fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: async () => { await wait(40); return ok(baseRoomPriceView()) } }])
  const { tree } = mountDialog({ room: baseRoomGridItem() })
  const app = await mount(tree)
  const by = byLabel(app.container)
  fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
  fill(app.container, by('Áp dụng từ ngày'), todayHanoi())
  const form = find(app.container, n => n.tagName === 'FORM')[0]
  dispatch(app.container, form, 'submit')
  await wait(5)
  // CP-4 (PLAN §2.5, chốt 05/11/2026) unified the busy wording to "Đang xử lý"; this fallback used to read "Đang gửi".
  assert.ok(isDisabled(buttonByText(app.container, 'Gửi đề xuất')) || app.container.textContent.includes('Đang xử lý'), '"Gửi đề xuất" must be disabled while the request is in flight')
  dispatch(app.container, form, 'submit') // a same-payload double submit while the first is still pending
  await wait(60)
  assert.ok(calls.length >= 1)
  const keys = new Set(calls.map(c => c.headers['Idempotency-Key']))
  assert.equal(keys.size, 1, 'every request for the same unchanged payload must carry the same Idempotency-Key')
  await app.stop()
})

test('API-05/FE8B-11: after a failed submit, changing the price before resubmitting uses a DIFFERENT Idempotency-Key', async () => {
  let attempt = 0
  const calls = fakeFetch([{ prefix: '/room-prices', method: 'POST', handler: () => { attempt += 1; return attempt === 1 ? fail(400, 'VALIDATION_FAILED', 'Giá không hợp lệ') : ok(baseRoomPriceView()) } }])
  const { tree } = mountDialog({ room: baseRoomGridItem() })
  const app = await mount(tree)
  const by = byLabel(app.container)
  fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
  fill(app.container, by('Áp dụng từ ngày'), todayHanoi())
  const form = find(app.container, n => n.tagName === 'FORM')[0]
  dispatch(app.container, form, 'submit')
  await wait(30)
  assert.equal(calls.length, 1)
  fill(app.container, by('Giá mới (đ/tháng)'), '2700000') // payload changed
  dispatch(app.container, form, 'submit')
  await wait(30)
  assert.equal(calls.length, 2)
  assert.notEqual(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key'], 'a changed payload (Q-P5-6 B) must get a new key, or the API would answer 409 CONFLICT_STATE')
  await app.stop()
})

// ======================================================================================
// [ASSUMPTION FE8B-12] — prefill on "Đề xuất lại" (exactly one GET /room-prices, only when expired)
// ======================================================================================

test('FE8B-12: expired=true triggers exactly one GET /room-prices?roomId&status=PENDING, used to prefill price/reason', async () => {
  const calls = fakeFetch([{ prefix: '/room-prices', method: 'GET', handler: () => ok([baseRoomPriceView({ id: 31, price: 2_400_000, reason: 'Tăng theo thị trường' })], pageMeta([1])) }])
  const { tree } = mountDialog({ room: baseRoomGridItem({ pendingProposal: { id: 31, effectiveFrom: '2026-01-01', expired: true } }) })
  const app = await mount(tree)
  await wait(30)
  const gets = calls.filter(c => c.method === 'GET')
  assert.equal(gets.length, 1, 'exactly one GET /room-prices must be sent for the prefill')
  const q = queryOf(gets[0].url)
  assert.equal(q.get('roomId'), '10')
  assert.equal(q.get('status'), 'PENDING')
  const by = byLabel(app.container)
  assert.equal(by('Giá mới (đ/tháng)', 'INPUT').value, '2400000')
  assert.equal(by('Lý do (tuỳ chọn)', 'INPUT').value, 'Tăng theo thị trường')
  await app.stop()
})

test('FE8B-12: a failed/empty/mismatched GET /room-prices falls back to room.price and an empty reason, with no retry and no visible error', async () => {
  for (const handler of [
    () => fail(500, 'NETWORK_ERROR', 'Lỗi mạng'),
    () => ok([], pageMeta([])),
    () => ok([baseRoomPriceView({ id: 999, price: 9_999_999 })], pageMeta([1])), // wrong id
  ]) {
    const calls = fakeFetch([{ prefix: '/room-prices', method: 'GET', handler }])
    const { tree } = mountDialog({ room: baseRoomGridItem({ price: 3_000_000, pendingProposal: { id: 31, effectiveFrom: '2026-01-01', expired: true } }) })
    const app = await mount(tree)
    await wait(30)
    assert.equal(calls.filter(c => c.method === 'GET').length, 1, 'no retry must happen on failure/empty/mismatch')
    const by = byLabel(app.container)
    assert.equal(by('Giá mới (đ/tháng)', 'INPUT').value, '3000000', 'must fall back to room.price')
    assert.equal(by('Lý do (tuỳ chọn)', 'INPUT').value, '', 'reason must fall back to empty')
    assert.ok(!app.container.textContent.includes('Lỗi mạng'), 'the failed prefill read must not surface as a visible error')
    await app.stop()
  }
})

test('FE8B-12: no GET /room-prices is sent when there is no pendingProposal, or it is not expired', async () => {
  for (const room of [baseRoomGridItem({ pendingProposal: null }), baseRoomGridItem({ pendingProposal: { id: 1, effectiveFrom: '2026-07-01', expired: false } })]) {
    const calls = fakeFetch([{ prefix: '/room-prices', method: 'GET', handler: () => ok([baseRoomPriceView()], pageMeta([1])) }])
    const { tree } = mountDialog({ room })
    const app = await mount(tree)
    await wait(30)
    assert.equal(calls.filter(c => c.method === 'GET').length, 0)
    await app.stop()
  }
})

// ======================================================================================
// [ASSUMPTION FE8B-13] — markup is the kit's rooms-dialog, a real form, not ConfirmDialog
// ======================================================================================

test('FE8B-13/UI-08: the dialog uses class "rooms-dialog", has role="dialog", a real <form> with 3 labelled inputs, and <button> controls', async () => {
  const { tree } = mountDialog({ room: baseRoomGridItem() })
  const app = await mount(tree)
  const dialog = find(app.container, n => n.getAttribute('role') === 'dialog')[0]
  assert.ok(dialog, 'role="dialog" must be present')
  assert.ok(dialog.attributes.class.split(' ').includes('rooms-dialog'), 'must use the kit class "rooms-dialog"')
  assert.equal(find(app.container, n => n.tagName === 'FORM').length, 1, 'must contain a real <form> (ConfirmDialog never renders one)')
  assert.equal(inputs(app.container).length, 3, 'must have exactly 3 form inputs (price, date, reason)')
  for (const el of inputs(app.container)) {
    assert.ok(find(app.container, n => n.tagName === 'LABEL' && n.getAttribute('for') === el.getAttribute('id')).length === 1, `input ${el.name} must have its own <label>`)
  }
  assert.ok(buttonByText(app.container, 'Đóng'))
  assert.ok(buttonByText(app.container, 'Gửi đề xuất'))
  await app.stop()
})

// ======================================================================================
// UI-09 — invalidate ['rooms'] and close on success
// ======================================================================================

test('UI-09: a successful submit invalidates the ["rooms"] query and closes the dialog', async () => {
  const calls = fakeFetch([
    { prefix: '/room-prices', method: 'POST', handler: () => ok(baseRoomPriceView()) },
    { prefix: '/rooms', method: 'GET', handler: () => ok([], pageMeta([])) },
  ])
  const client = newClient()
  const { tree } = mountDialog({ room: baseRoomGridItem(), client, withRoomsProbe: true })
  const app = await mount(tree)
  await wait(30)
  const roomsCallsBefore = calls.filter(c => c.url.startsWith('/api/v1/rooms')).length
  const by = byLabel(app.container)
  fill(app.container, by('Giá mới (đ/tháng)'), '2600000')
  fill(app.container, by('Áp dụng từ ngày'), todayHanoi())
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(60)
  const roomsCallsAfter = calls.filter(c => c.url.startsWith('/api/v1/rooms')).length
  assert.ok(roomsCallsAfter > roomsCallsBefore, 'invalidateQueries(["rooms"]) must trigger a refetch of the active ["rooms"] probe query')
  assert.equal(onCloseSpy.calls, 1, 'onClose must be called exactly once after a successful submit')
  await app.stop()
})

// ======================================================================================
// RoomInspector — notice wording for the quá hạn / non-expired cases (CP-2, PLAN §2.5)
// ======================================================================================

test('PRC-07: an expired proposal\'s notice reads exactly "Đề xuất đã quá hạn. Cần đề xuất lại để duyệt." (the old "Đề xuất giá áp dụng từ" wording is gone); the "Quá hạn" status badge still renders', async () => {
  const app = await mount(withAuthedQuery(React.createElement(RoomInspector, { room: baseRoomGridItem({ pendingProposal: { id: 1, effectiveFrom: '2026-01-01', expired: true } }) })))
  assert.ok(app.container.textContent.includes('Đề xuất đã quá hạn. Cần đề xuất lại để duyệt.'))
  assert.ok(!app.container.textContent.includes('Đề xuất giá áp dụng từ'), 'the old expired-notice wording must be gone')
  assert.ok(app.container.textContent.includes('Quá hạn'), 'the "Quá hạn" status badge must still render')
  await app.stop()
})

test('PRC-07, B1: a non-expired proposal shows "Đề xuất giá {số tiền} áp dụng từ {ngày}." and never shows "Quá hạn"', async () => {
  const app = await mount(withAuthedQuery(React.createElement(RoomInspector, { room: baseRoomGridItem({ pendingProposal: { id: 1, price: 2_500_000, effectiveFrom: '2026-07-01', expired: false } }) })))
  assert.ok(app.container.textContent.includes('Đề xuất giá 2.500.000 đ áp dụng từ'))
  assert.ok(!app.container.textContent.includes('Quá hạn'))
  await app.stop()
})

// ======================================================================================
// [ASSUMPTION FE8B-14] — newIdempotencyKey() and its fallback branches
// ======================================================================================

test('FE8B-14/API-05: newIdempotencyKey() returns a non-empty string via crypto.randomUUID, and two calls differ', () => {
  const a = pricingApi.newIdempotencyKey()
  const b = pricingApi.newIdempotencyKey()
  assert.ok(typeof a === 'string' && a.length > 0)
  assert.notEqual(a, b, 'two independently generated keys must not collide')
})

// globalThis.crypto only has a getter in Node, so the fallback branches are exercised via
// Object.defineProperty (a real redefinition of the global, not a mock of newIdempotencyKey itself).
test('FE8B-14/API-05: with crypto.randomUUID removed, newIdempotencyKey() falls back to getRandomValues and still returns distinct non-empty keys', () => {
  const realCrypto = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) }, configurable: true })
  try {
    const a = pricingApi.newIdempotencyKey()
    const b = pricingApi.newIdempotencyKey()
    assert.ok(typeof a === 'string' && a.length > 0, 'the getRandomValues fallback must still produce a usable key')
    assert.notEqual(a, b)
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true })
  }
})

test('FE8B-14/API-05: with crypto entirely removed, newIdempotencyKey() falls back to Date.now + Math.random and still returns a non-empty key', () => {
  const realCrypto = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
  try {
    const a = pricingApi.newIdempotencyKey()
    assert.ok(typeof a === 'string' && a.length > 0, 'the Date.now/Math.random fallback must still produce a usable key')
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true })
  }
})
