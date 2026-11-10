import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

// CP-8 (FE-P2-07 images, FE-P2-08 gate): src/features/rooms/upload.ts (signUpload, uploadToCloudinary,
// assertRoomImageFile), src/features/rooms/api.ts (attachRoomImage/reorderRoomImages/deleteRoomImage),
// src/features/rooms/RoomImages.tsx, and RoomInspector.tsx's "Ảnh phòng" gating.
// Spec/PLAN: FILE-01/02, ROOM-07, UI-10, Q-FE8A-1 (5_000_000 byte threshold), Q-FE8A-2/3 (one
// GET /rooms/:id — getRoom(id), BE pending, tested here only via a mock fetch), A-CP8-1 (gallery loads only
// when the user opens "Ảnh phòng", not merely by mounting the inspector).
//
// Outside edges faked: globalThis.fetch (both our own /api/v1 calls and the Cloudinary upload endpoint) and
// the minimal fake DOM below (Node has none; no jsdom installed), same shape as cp7-rooms.test.mjs. Every
// module under test (upload.ts, api.ts, RoomImages.tsx, RoomInspector.tsx) is transpiled and run unmodified,
// mounted with real react-dom/client, real @tanstack/react-query and the real react-router (MemoryRouter,
// needed because RoomInspector renders <Link>). The kit (RoomsButton, FormError, ImageUploader, Spinner,
// ConfirmDialog, StatusBadge) and shared/{formatters,status-labels}.ts are loaded unmodified via the same
// relative-import fallback to main `src/` the other cp*.test.mjs files use.

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = resolve(draftRoot, '..', '..', 'src')

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
// straight from draftSrcRoot with no main fallback; a draft that does not touch these CP-8 files (this one,
// PLAN.md CP-6, the P2-8a lesson) has none of them in its own src/, so every entry point must fall back too.
function entryPath(relPath) {
  return resolveFile(resolve(draftSrcRoot, relPath)) ?? resolveFile(resolve(mainSrcRoot, relPath)) ?? resolve(draftSrcRoot, relPath)
}

const React = nodeRequire('react')
const { createRoot } = nodeRequire('react-dom/client')
const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
const { MemoryRouter } = nodeRequire('react-router')

const upload = load(entryPath('features/rooms/upload.ts'))
const roomsApi = load(entryPath('features/rooms/api.ts'))
const { RoomImages } = load(entryPath('features/rooms/RoomImages.tsx'))
const { RoomInspector } = load(entryPath('features/rooms/RoomInspector.tsx'))
const { setAccessToken } = load(entryPath('shared/api.ts'))

const { assertRoomImageFile, signUpload, uploadToCloudinary, ROOM_IMAGE_MAX_BYTES, ROOM_IMAGE_TYPES } = upload
const { attachRoomImage, reorderRoomImages, deleteRoomImage } = roomsApi

// ---------- DOM query / event helpers (same style as cp7-rooms.test.mjs) ----------
const wait = ms => new Promise(r => setTimeout(r, ms))
const walkTree = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
const find = (root, pred) => walkTree(root).filter(n => n.nodeType === 1 && pred(n))
const buttons = container => find(container, n => n.tagName === 'BUTTON')
const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
// ImageUploader's delete/move buttons carry the per-image detail (e.g. "Xóa ảnh 1") only in aria-label;
// their visible text is the generic "Xóa"/"Lên"/"Xuống".
const buttonByAriaLabel = (container, label) => buttons(container).find(b => b.getAttribute('aria-label') === label)
const isDisabled = el => el?.disabled === true || el?.hasAttribute('disabled')
const fileInput = container => find(container, n => n.tagName === 'INPUT').find(n => n.type === 'file' || n.getAttribute('type') === 'file')

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
  // Flake fix (11/11/2026): 30 ms is not always enough on a busy machine; wait until the first commit has put
  // something into the container (max 3 s) so a test never queries an empty tree.
  for (let tries = 0; tries < 300 && container.childNodes.length === 0; tries++) await wait(10)
  return { container, stop: async () => { root.unmount(); await wait(10) } }
}

// Polling wait: the sign→Cloudinary→attach chain (and even a first getRoom mount) can take longer than a
// fixed ms under load, so assertions that depend on an async chain settling poll instead of guessing a delay.
async function waitFor(predicate, { timeout = 3000, interval = 20 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return
    await wait(interval)
  }
  throw new Error('waitFor: condition not met within timeout')
}
// gcTime short, not the default 5 minutes, so these tests exit promptly (same reasoning as cp7-rooms.test.mjs).
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 }, mutations: { retry: false, gcTime: 1000 } } })
}
function withQuery(children, client) {
  return React.createElement(QueryClientProvider, { client: client ?? newClient() }, children)
}
function withRouter(children, client) {
  return React.createElement(QueryClientProvider, { client: client ?? newClient() }, React.createElement(MemoryRouter, null, children))
}

// ---------- fetch fake: routes our /api/v1 calls by prefix, Cloudinary by exact URL ----------
const json = (status, body) => ({ status, body })
const ok = (data, meta) => json(200, { data, ...(meta ? { meta } : {}) })
const fail = (status, code, message, fields) => json(status, { error: { code, message, ...(fields ? { fields } : {}) } })

function fakeFetch(rules) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const call = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, credentials: init.credentials, body: init.body }
    calls.push(call)
    const rule = rules.find(r => r.match(call))
    if (!rule) return new Response(JSON.stringify(ok([]).body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const result = await rule.handler(call)
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } })
  }
  return calls
}
function apiRule(prefix, method, handler) {
  return { match: call => call.url.startsWith(`/api/v1${prefix}`) && (!method || call.method === method), handler }
}
function urlRule(url, method, handler) {
  return { match: call => call.url === url && (!method || call.method === method), handler }
}

const SIGNED = {
  cloudName: 'demo', apiKey: 'key123', uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
  timestamp: 1700000000, folder: 'rooms/10', allowedFormats: 'jpg,png,webp', transformation: 'c_limit,w_1600', signature: 'sig-abc',
}

function baseRoomView(overrides = {}) {
  return {
    id: 10, buildingId: 5, code: 'A101', floor: 1, areaM2: 20, price: 3_000_000, maxOccupants: 2,
    furniture: ['Giường'], description: null, underMaintenance: false, isActive: true,
    status: 'Trống', images: [], pendingViewingCount: 0,
    ...overrides,
  }
}
function baseRoomGridItem(overrides = {}) {
  return {
    id: 10, buildingId: 5, code: 'A101', floor: 1, areaM2: 20, price: 3_000_000, maxOccupants: 2,
    underMaintenance: false, isActive: true, status: 'Trống', pendingProposal: null, imageCount: 0,
    ...overrides,
  }
}
function imageFile(size, type = 'image/jpeg', name = 'a.jpg') {
  return new File([new Uint8Array(size)], name, { type })
}

// ======================================================================================
// upload.ts — assertRoomImageFile: Q-FE8A-1 boundary, FILE-01/02 MIME allowlist
// ======================================================================================

test('Q-FE8A-1: assertRoomImageFile accepts a file of exactly 5_000_000 byte with an allowed MIME type', () => {
  assert.equal(ROOM_IMAGE_MAX_BYTES, 5_000_000)
  assert.doesNotThrow(() => assertRoomImageFile(imageFile(5_000_000, 'image/jpeg')))
  assert.doesNotThrow(() => assertRoomImageFile(imageFile(5_000_000, 'image/png')))
  assert.doesNotThrow(() => assertRoomImageFile(imageFile(5_000_000, 'image/webp')))
})

test('Q-FE8A-1: assertRoomImageFile rejects a file of 5_000_001 byte (maxBytes+1), before any network call', () => {
  assert.throws(() => assertRoomImageFile(imageFile(5_000_001)), /vượt quá/)
})

test('FILE-01/FILE-02: assertRoomImageFile rejects a MIME type outside JPG/PNG/WebP even when small', () => {
  assert.deepEqual(ROOM_IMAGE_TYPES, ['image/jpeg', 'image/png', 'image/webp'])
  assert.throws(() => assertRoomImageFile(imageFile(1000, 'application/pdf', 'a.pdf')), /định dạng/)
})

// ======================================================================================
// upload.ts — signUpload (FILE-01) and uploadToCloudinary (FILE-02, UI-10)
// ======================================================================================

test('FILE-01: signUpload POSTs /files/sign with {purpose:"ROOM_IMAGE", roomId}', async () => {
  const calls = fakeFetch([apiRule('/files/sign', 'POST', () => ok(SIGNED))])
  const result = await signUpload(10)
  assert.equal(calls.length, 1)
  assert.ok(calls[0].url.startsWith('/api/v1/files/sign'))
  assert.deepEqual(JSON.parse(calls[0].body), { purpose: 'ROOM_IMAGE', roomId: 10 })
  assert.deepEqual(result, SIGNED)
})

test('FILE-01: signUpload surfaces a 403 OUT_OF_SCOPE as the real API message', async () => {
  fakeFetch([apiRule('/files/sign', 'POST', () => fail(403, 'OUT_OF_SCOPE', 'Phòng không thuộc phạm vi của bạn'))])
  await assert.rejects(() => signUpload(10), /Phòng không thuộc phạm vi của bạn/)
})

test('UI-10/FILE-02: uploadToCloudinary posts FormData with the signed fields, no Bearer/cookie, and returns assetId/publicId/version/format', async () => {
  setAccessToken('secret-access-token')
  try {
    const calls = fakeFetch([urlRule(SIGNED.uploadUrl, 'POST', () => json(200, { asset_id: 'asset_abc', public_id: 'rooms/10/xyz', version: 7, format: 'jpg' }))])
    const file = imageFile(1000)
    const result = await uploadToCloudinary(SIGNED, file)
    assert.equal(calls.length, 1)
    const form = calls[0].body
    assert.equal(form.get('api_key'), SIGNED.apiKey)
    assert.equal(form.get('timestamp'), String(SIGNED.timestamp))
    assert.equal(form.get('folder'), SIGNED.folder)
    assert.equal(form.get('allowed_formats'), SIGNED.allowedFormats)
    assert.equal(form.get('transformation'), SIGNED.transformation)
    assert.equal(form.get('signature'), SIGNED.signature)
    assert.ok(form.get('file'), 'the file itself must be in the FormData')
    assert.equal(calls[0].credentials, 'omit', 'Cloudinary must never receive the refresh cookie')
    assert.equal(calls[0].headers.Authorization, undefined, 'Cloudinary must never receive our Bearer token')
    assert.deepEqual(result, { assetId: 'asset_abc', publicId: 'rooms/10/xyz', version: 7, format: 'jpg' })
  } finally {
    setAccessToken(null)
  }
})

test('UI-10: by contrast, our own /files/sign call (apiRequest) does carry Authorization and credentials include', async () => {
  setAccessToken('secret-access-token')
  try {
    const calls = fakeFetch([apiRule('/files/sign', 'POST', () => ok(SIGNED))])
    await signUpload(10)
    assert.equal(calls[0].headers.Authorization, 'Bearer secret-access-token')
    assert.equal(calls[0].credentials, 'include')
  } finally {
    setAccessToken(null)
  }
})

test('uploadToCloudinary: a non-ok or malformed Cloudinary response throws exactly "Tải ảnh lên không thành công, vui lòng thử lại."', async () => {
  fakeFetch([urlRule(SIGNED.uploadUrl, 'POST', () => json(400, { error: { message: 'Invalid signature' } }))])
  await assert.rejects(() => uploadToCloudinary(SIGNED, imageFile(1000)), /^Error: Tải ảnh lên không thành công, vui lòng thử lại\.$/)
})

// ======================================================================================
// api.ts — attachRoomImage/reorderRoomImages/deleteRoomImage (UI-10)
// ======================================================================================

test('UI-10: attachRoomImage sends exactly {assetId,publicId,version,format}, no url, no extra fields', async () => {
  const asset = { assetId: 'asset_abc', publicId: 'rooms/10/xyz', version: 7, format: 'jpg' }
  const calls = fakeFetch([apiRule('/rooms/10/images', 'POST', () => ok({ id: 1, roomId: 10, publicId: asset.publicId, url: '/img1.jpg', sortOrder: 0 }))])
  await attachRoomImage(10, asset)
  assert.equal(calls[0].url, '/api/v1/rooms/10/images', 'attachRoomImage uses apiRequest, no page/limit query')
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].body), asset)
})

test('UI-10: reorderRoomImages PATCHes /rooms/:id/images/order with {imageIds}', async () => {
  const calls = fakeFetch([apiRule('/rooms/10/images/order', 'PATCH', () => ok([]))])
  await reorderRoomImages(10, [3, 1, 2])
  assert.equal(calls[0].method, 'PATCH')
  assert.ok(calls[0].url.startsWith('/api/v1/rooms/10/images/order'))
  assert.deepEqual(JSON.parse(calls[0].body), { imageIds: [3, 1, 2] })
})

test('UI-10: deleteRoomImage DELETEs /rooms/:id/images/:imageId with no body', async () => {
  const calls = fakeFetch([apiRule('/rooms/10/images/5', 'DELETE', () => ok(null))])
  await deleteRoomImage(10, 5)
  assert.equal(calls[0].method, 'DELETE')
  assert.ok(calls[0].url.startsWith('/api/v1/rooms/10/images/5'))
  assert.equal(calls[0].body, undefined)
})

// ======================================================================================
// RoomImages — gallery reads getRoom(id), maxImages, alt fallback, no confirm on delete,
// invalidate(['rooms']) after every change, malformed payload safety (ROOM-07, UI-10)
// ======================================================================================

test('ROOM-07: RoomImages renders images from getRoom(id) (mock, queryKey [\'rooms\',\'detail\',id]), with alt fallback "Ảnh N"', async () => {
  fakeFetch([apiRule('/rooms/10', 'GET', () => ok(baseRoomView({ images: [
    { id: 1, roomId: 10, publicId: 'p1', url: '/img1.jpg', sortOrder: 0 },
    { id: 2, roomId: 10, publicId: 'p2', url: '/img2.jpg', sortOrder: 1 },
  ] })))])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => find(app.container, n => n.tagName === 'IMG').length === 2)
  const imgs = find(app.container, n => n.tagName === 'IMG')
  assert.equal(imgs.length, 2)
  assert.equal(imgs[0].getAttribute('src'), '/img1.jpg')
  assert.equal(imgs[0].getAttribute('alt'), 'Ảnh 1', 'RoomImageView has no alt field, so the fallback must be used')
  assert.equal(imgs[1].getAttribute('alt'), 'Ảnh 2')
  await app.stop()
})

test('ROOM-07: maxImages 10 locks the "Thêm ảnh" button once the room already has 10 images', async () => {
  const images = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, roomId: 10, publicId: `p${i}`, url: `/img${i}.jpg`, sortOrder: i }))
  fakeFetch([apiRule('/rooms/10', 'GET', () => ok(baseRoomView({ images })))])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => app.container.textContent.includes('Đã đủ 10 ảnh') && isDisabled(buttonByText(app.container, 'Thêm ảnh')))
  assert.ok(isDisabled(buttonByText(app.container, 'Thêm ảnh')), '10/10 images must disable "Thêm ảnh"')
  assert.ok(app.container.textContent.includes('Đã đủ 10 ảnh'))
  await app.stop()
})

test('Q2 CP-3/ROOM-07: deleting an image runs the DELETE directly on "Xóa ảnh 1" — no confirm dialog opens', async () => {
  const calls = fakeFetch([
    apiRule('/rooms/10', 'GET', () => ok(baseRoomView({ images: [{ id: 1, roomId: 10, publicId: 'p1', url: '/img1.jpg', sortOrder: 0 }] }))),
    apiRule('/rooms/10/images/1', 'DELETE', () => ok(null)),
  ])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(buttonByAriaLabel(app.container, 'Xóa ảnh 1')))
  assert.equal(find(app.container, n => n.getAttribute('role') === 'dialog').length, 0, 'no dialog before deleting')
  dispatch(app.container, buttonByAriaLabel(app.container, 'Xóa ảnh 1'), 'click')
  await waitFor(() => calls.some(c => c.method === 'DELETE'))
  assert.equal(find(app.container, n => n.getAttribute('role') === 'dialog').length, 0, 'ImageUploader must never open a confirm dialog on delete')
  assert.ok(calls.some(c => c.method === 'DELETE' && c.url.startsWith('/api/v1/rooms/10/images/1')))
  await app.stop()
})

test('every change awaits invalidate([\'rooms\']): after a successful delete, the gallery refetches getRoom(id)', async () => {
  let getCount = 0
  const calls = fakeFetch([
    apiRule('/rooms/10', 'GET', () => { getCount++; return ok(baseRoomView({ images: getCount === 1 ? [{ id: 1, roomId: 10, publicId: 'p1', url: '/img1.jpg', sortOrder: 0 }] : [] })) }),
    apiRule('/rooms/10/images/1', 'DELETE', () => ok(null)),
  ])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(buttonByAriaLabel(app.container, 'Xóa ảnh 1')))
  assert.equal(getCount, 1, 'sanity: one GET on mount')
  dispatch(app.container, buttonByAriaLabel(app.container, 'Xóa ảnh 1'), 'click')
  await waitFor(() => getCount >= 2, { timeout: 5000 })
  await waitFor(() => app.container.textContent.includes('Chưa có ảnh'))
  await app.stop()
})

test('UI-10: reordering via "Xuống" PATCHes /rooms/:id/images/order with the swapped ids', async () => {
  const calls = fakeFetch([
    apiRule('/rooms/10', 'GET', () => ok(baseRoomView({ images: [
      { id: 1, roomId: 10, publicId: 'p1', url: '/img1.jpg', sortOrder: 0 },
      { id: 2, roomId: 10, publicId: 'p2', url: '/img2.jpg', sortOrder: 1 },
    ] }))),
    apiRule('/rooms/10/images/order', 'PATCH', () => ok([])),
  ])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => buttons(app.container).some(b => b.textContent.trim() === 'Xuống'))
  const down = buttons(app.container).filter(b => b.textContent.trim() === 'Xuống')[0]
  dispatch(app.container, down, 'click')
  await waitFor(() => calls.some(c => c.method === 'PATCH'))
  const patch = calls.find(c => c.method === 'PATCH')
  assert.deepEqual(JSON.parse(patch.body), { imageIds: [2, 1] })
  await app.stop()
})

test('FILE-01: a 5_000_000 byte file reaches signUpload; a 5_000_001 byte file is blocked before any fetch', async () => {
  // 5_000_000: the real ImageUploader input itself is the first gate (it is given the same maxBytes prop);
  // reaching /files/sign proves nothing was blocked for a file exactly at the threshold.
  let calls = fakeFetch([
    apiRule('/rooms/10', 'GET', () => ok(baseRoomView())),
    apiRule('/files/sign', 'POST', () => ok(SIGNED)),
  ])
  let app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(fileInput(app.container)))
  const input1 = fileInput(app.container)
  input1.files = [imageFile(5_000_000)]
  dispatch(app.container, input1, 'change', { target: input1 })
  await waitFor(() => calls.some(c => c.url.startsWith('/api/v1/files/sign')))
  await app.stop()

  calls = fakeFetch([apiRule('/rooms/10', 'GET', () => ok(baseRoomView()))])
  app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(fileInput(app.container)))
  const input2 = fileInput(app.container)
  input2.files = [imageFile(5_000_001)]
  dispatch(app.container, input2, 'change', { target: input2 })
  await waitFor(() => app.container.textContent.includes('vượt quá'))
  assert.equal(calls.filter(c => c.url.includes('/files/sign')).length, 0, 'a file of 5_000_001 byte must never reach /files/sign')
  await app.stop()
})

test('FILE-02: a disallowed MIME type is blocked before any fetch to /files/sign', async () => {
  const calls = fakeFetch([apiRule('/rooms/10', 'GET', () => ok(baseRoomView()))])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(fileInput(app.container)))
  const input = fileInput(app.container)
  input.files = [imageFile(1000, 'application/pdf', 'a.pdf')]
  dispatch(app.container, input, 'change', { target: input })
  await waitFor(() => app.container.textContent.includes('định dạng'))
  assert.equal(calls.filter(c => c.url.includes('/files/sign')).length, 0)
  await app.stop()
})

test('FILE-01/02/UI-10: a full successful upload (sign → Cloudinary → attach) sends assetId/publicId/version/format and refreshes the gallery', async () => {
  let getCount = 0
  const calls = fakeFetch([
    apiRule('/rooms/10', 'GET', () => { getCount++; return ok(baseRoomView({ images: getCount > 1 ? [{ id: 9, roomId: 10, publicId: 'rooms/10/new', url: '/new.jpg', sortOrder: 0 }] : [] })) }),
    apiRule('/files/sign', 'POST', () => ok(SIGNED)),
    urlRule(SIGNED.uploadUrl, 'POST', () => json(200, { asset_id: 'asset_new', public_id: 'rooms/10/new', version: 3, format: 'png' })),
    apiRule('/rooms/10/images', 'POST', () => ok({ id: 9, roomId: 10, publicId: 'rooms/10/new', url: '/new.jpg', sortOrder: 0 })),
  ])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(fileInput(app.container)))
  const input = fileInput(app.container)
  input.files = [imageFile(2_000_000, 'image/png', 'b.png')]
  dispatch(app.container, input, 'change', { target: input })
  await waitFor(() => calls.some(c => c.url.startsWith('/api/v1/rooms/10/images') && c.method === 'POST'), { timeout: 5000 })
  const attach = calls.find(c => c.url.startsWith('/api/v1/rooms/10/images') && c.method === 'POST')
  assert.deepEqual(JSON.parse(attach.body), { assetId: 'asset_new', publicId: 'rooms/10/new', version: 3, format: 'png' })
  await waitFor(() => getCount >= 2, { timeout: 5000 })
  await waitFor(() => find(app.container, n => n.tagName === 'IMG').length === 1, { timeout: 5000 })
  const img = find(app.container, n => n.tagName === 'IMG')[0]
  assert.equal(img.getAttribute('src'), '/new.jpg', 'the refreshed gallery must show the newly attached image')
  await app.stop()
})

test('upload failure at the Cloudinary step shows exactly "Tải ảnh lên không thành công, vui lòng thử lại." and never calls attach', async () => {
  const calls = fakeFetch([
    apiRule('/rooms/10', 'GET', () => ok(baseRoomView())),
    apiRule('/files/sign', 'POST', () => ok(SIGNED)),
    urlRule(SIGNED.uploadUrl, 'POST', () => json(400, {})),
  ])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(fileInput(app.container)))
  const input = fileInput(app.container)
  input.files = [imageFile(1000)]
  dispatch(app.container, input, 'change', { target: input })
  await waitFor(() => app.container.textContent.includes('Tải ảnh lên không thành công'), { timeout: 5000 })
  assert.ok(app.container.textContent.includes('Tải ảnh lên không thành công, vui lòng thử lại.'))
  assert.equal(calls.filter(c => c.url.startsWith('/api/v1/rooms/10/images') && c.method === 'POST').length, 0, 'attach must never be called after a failed Cloudinary upload')
  await app.stop()
})

test('metadata sai 400 VALIDATION_FAILED from attach shows the real API message, distinct from the generic Cloudinary message', async () => {
  fakeFetch([
    apiRule('/rooms/10', 'GET', () => ok(baseRoomView())),
    apiRule('/files/sign', 'POST', () => ok(SIGNED)),
    urlRule(SIGNED.uploadUrl, 'POST', () => json(200, { asset_id: 'a', public_id: 'p', version: 1, format: 'jpg' })),
    apiRule('/rooms/10/images', 'POST', () => fail(400, 'VALIDATION_FAILED', 'Metadata ảnh không hợp lệ')),
  ])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(fileInput(app.container)))
  const input = fileInput(app.container)
  input.files = [imageFile(1000)]
  dispatch(app.container, input, 'change', { target: input })
  await waitFor(() => app.container.textContent.includes('Metadata ảnh không hợp lệ'), { timeout: 5000 })
  assert.ok(!app.container.textContent.includes('Tải ảnh lên không thành công'), 'a BE validation error must not be shown as the generic Cloudinary message')
  await app.stop()
})

test('cấu hình thiếu: a 503 UPLOAD_NOT_CONFIGURED from /files/sign shows "Chưa cấu hình tải ảnh"', async () => {
  fakeFetch([
    apiRule('/rooms/10', 'GET', () => ok(baseRoomView())),
    apiRule('/files/sign', 'POST', () => fail(503, 'UPLOAD_NOT_CONFIGURED', 'Chưa cấu hình tải ảnh')),
  ])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(fileInput(app.container)))
  const input = fileInput(app.container)
  input.files = [imageFile(1000)]
  dispatch(app.container, input, 'change', { target: input })
  await waitFor(() => app.container.textContent.includes('Chưa cấu hình tải ảnh'), { timeout: 5000 })
  await app.stop()
})

test('scope khác tòa: a 403 OUT_OF_SCOPE from attach shows the API message', async () => {
  fakeFetch([
    apiRule('/rooms/10', 'GET', () => ok(baseRoomView())),
    apiRule('/files/sign', 'POST', () => ok(SIGNED)),
    urlRule(SIGNED.uploadUrl, 'POST', () => json(200, { asset_id: 'a', public_id: 'p', version: 1, format: 'jpg' })),
    apiRule('/rooms/10/images', 'POST', () => fail(403, 'OUT_OF_SCOPE', 'Phòng không thuộc phạm vi của bạn')),
  ])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => Boolean(fileInput(app.container)))
  const input = fileInput(app.container)
  input.files = [imageFile(1000)]
  dispatch(app.container, input, 'change', { target: input })
  await waitFor(() => app.container.textContent.includes('Phòng không thuộc phạm vi của bạn'), { timeout: 5000 })
  await app.stop()
})

test('a 200 payload shaped wrong (images missing/not-an-array) shows an empty gallery, never crashes', async () => {
  fakeFetch([apiRule('/rooms/10', 'GET', () => ok({ id: 10, buildingId: 5, code: 'A101', notTheRightShape: true }))])
  const app = await mount(withQuery(React.createElement(RoomImages, { roomId: 10 })))
  await waitFor(() => app.container.textContent.includes('Chưa có ảnh'))
  assert.equal(find(app.container, n => n.tagName === 'IMG').length, 0)
  await app.stop()
})

// ======================================================================================
// RoomInspector — A-CP8-1: the gallery loads only when "Ảnh phòng" is opened
// ======================================================================================

test('A-CP8-1: mounting RoomInspector alone (no clicks) makes zero fetch calls — the gallery is closed by default', async () => {
  const calls = fakeFetch([apiRule('/rooms/10', 'GET', () => ok(baseRoomView()))])
  const app = await mount(withRouter(React.createElement(RoomInspector, { room: baseRoomGridItem() })))
  assert.equal(calls.length, 0, 'the inspector must not call getRoom(id) merely by mounting')
  await app.stop()
})

test('A-CP8-1: clicking "Ảnh phòng" loads the gallery (calls getRoom(id)); clicking "Đóng ảnh phòng" removes it from the DOM', async () => {
  const calls = fakeFetch([apiRule('/rooms/10', 'GET', () => ok(baseRoomView({ images: [{ id: 1, roomId: 10, publicId: 'p1', url: '/img1.jpg', sortOrder: 0 }] })))])
  const app = await mount(withRouter(React.createElement(RoomInspector, { room: baseRoomGridItem() })))
  dispatch(app.container, buttonByText(app.container, 'Ảnh phòng'), 'click')
  await waitFor(() => calls.some(c => c.url.startsWith('/api/v1/rooms/10')), { timeout: 5000 })
  await waitFor(() => find(app.container, n => n.tagName === 'IMG').length === 1, { timeout: 5000 })
  dispatch(app.container, buttonByText(app.container, 'Đóng ảnh phòng'), 'click')
  await wait(20)
  assert.equal(find(app.container, n => n.tagName === 'IMG').length, 0, 'closing "Ảnh phòng" must unmount the gallery')
  await app.stop()
})

test('RoomImages shares the ["rooms","detail",id] query with the edit panel: opening both at once triggers only one GET', async () => {
  const calls = fakeFetch([apiRule('/rooms/10', 'GET', () => ok(baseRoomView()))])
  const app = await mount(withRouter(React.createElement(RoomInspector, { room: baseRoomGridItem() })))
  // Both clicks fire synchronously in the same tick, before any fetch resolves: if RoomEditPanel and
  // RoomImages used different queryKeys, TanStack Query could not dedupe them into a single request.
  dispatch(app.container, buttonByText(app.container, 'Sửa thông tin'), 'click')
  dispatch(app.container, buttonByText(app.container, 'Ảnh phòng'), 'click')
  await waitFor(() => calls.length >= 1, { timeout: 5000 })
  await wait(200) // grace period: if the two panels used different queryKeys, a second GET would land here
  assert.equal(calls.length, 1, 'RoomEditPanel and RoomImages must share the same queryKey (["rooms","detail",10]), so only one GET fires')
  await app.stop()
})
