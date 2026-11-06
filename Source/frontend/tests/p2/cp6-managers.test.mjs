import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

// CP-6 (FE-P2-06): src/pages/staff/ManagersPage.tsx; src/features/managers/{schemas,ManagerForm,ManagerList}.tsx
// (api.ts is CP-4, out of scope here). Spec/PLAN: AUTH-08 (docs/spec/10-auth.md), G-04 (00-overview.md,
// phone ^0[0-9]{9}$), UI-03/05/09 (30-frontend.md), BLD-03/BLD-04 (manager keeps buildings while locked).
// CreateManagerDto mirrored by schemas.ts: Source/backend/src/modules/auth/dto/managers.dto.ts.
//
// Outside edges faked: globalThis.fetch (network), a fake sessionStorage/localStorage and console spies (to
// prove AUTH-08 "no storage, no log"), and the minimal fake DOM below (Node has none; no jsdom installed).
// Every module under test (ManagersPage, ManagerForm, ManagerList, schemas.ts) is transpiled and run
// unmodified, mounted with real react-dom/client, real @tanstack/react-query and real react-hook-form + zod.
// The kit (RoomsButton, TextField, FormError, Spinner, SectionHeading) and shared/form-errors.ts are loaded
// unmodified via the same relative-import fallback to main `src/` used by the other cp*.test.mjs files.

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = resolve(draftRoot, '..', '..', 'src')

// ---------- minimal real DOM (same shape as cp5-buildings-services.test.mjs) ----------
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
// straight from draftSrcRoot with no main fallback; a draft that does not touch these CP-6 files (this one,
// PLAN.md CP-6, the P2-8a lesson) has none of them in its own src/, so every entry point must fall back too.
function entryPath(relPath) {
  return resolveFile(resolve(draftSrcRoot, relPath)) ?? resolveFile(resolve(mainSrcRoot, relPath)) ?? resolve(draftSrcRoot, relPath)
}

const React = nodeRequire('react')
const { createRoot } = nodeRequire('react-dom/client')
const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')

const { ManagersPage } = load(entryPath('pages/staff/ManagersPage.tsx'))
const { ManagerForm } = load(entryPath('features/managers/ManagerForm.tsx'))
const { ManagerList } = load(entryPath('features/managers/ManagerList.tsx'))
const schemasModule = load(entryPath('features/managers/schemas.ts'))
const { managerFormSchema } = schemasModule

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
  return { container, rerender: async next => { root.render(next); await wait(30) }, stop: async () => { root.unmount(); await wait(10) } }
}

// gcTime short (not the default 5 minutes) so these tests exit promptly; AUTH-08's own gcTime:0 on the
// create-manager mutation is set by ManagerForm.tsx itself (overrides this default) and is what the
// "gcTime 0" test below checks. Test-client config only; no assertion changed.
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 }, mutations: { retry: false, gcTime: 1000 } } })
}
function withQuery(children, client) {
  return React.createElement(QueryClientProvider, { client: client ?? newClient() }, children)
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

function baseManager(overrides = {}) {
  return {
    id: 1, phone: '0901234567', fullName: 'Nguyễn Văn A', email: null, isActive: true, mustChangePassword: true,
    contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [], createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ======================================================================================
// schemas.ts — managerFormSchema mirrors Source/backend CreateManagerDto (AUTH-08, G-04)
// ======================================================================================

test('G-04/AUTH-08: phone ^0[0-9]{9}$ accepts a 10-digit number starting with 0', () => {
  assert.equal(managerFormSchema.safeParse({ phone: '0901234567', fullName: 'A', email: '' }).success, true)
})

test('G-04/AUTH-08: phone fails when 9 digits (too short), 11 digits (too long), not starting with 0, or containing a letter', () => {
  for (const phone of ['090123456', '09012345678', '1901234567', '090123456a']) {
    const result = managerFormSchema.safeParse({ phone, fullName: 'A', email: '' })
    assert.equal(result.success, false, `phone "${phone}" must be rejected`)
    assert.equal(result.error.issues.find(i => i.path[0] === 'phone')?.message, 'Số điện thoại không hợp lệ')
  }
})

test('AUTH-08: fullName must be 1..100 chars — empty and 101 chars are rejected, 1 and 100 chars are accepted', () => {
  const base = { phone: '0901234567', email: '' }
  assert.equal(managerFormSchema.safeParse({ ...base, fullName: '' }).success, false, 'empty fullName must fail')
  assert.equal(managerFormSchema.safeParse({ ...base, fullName: 'A' }).success, true, '1 char must pass')
  assert.equal(managerFormSchema.safeParse({ ...base, fullName: 'A'.repeat(100) }).success, true, '100 chars must pass')
  const tooLong = managerFormSchema.safeParse({ ...base, fullName: 'A'.repeat(101) })
  assert.equal(tooLong.success, false, '101 chars must fail')
  assert.equal(tooLong.error.issues.find(i => i.path[0] === 'fullName')?.message, 'Họ và tên tối đa 100 ký tự')
})

test('AUTH-08: email is optional — empty string passes, with no email sent', () => {
  const result = managerFormSchema.safeParse({ phone: '0901234567', fullName: 'A', email: '' })
  assert.equal(result.success, true)
})

test('AUTH-08: email must be ≤255 chars — a 255-char valid address passes, a 307-char one fails even though its shape is a valid email', () => {
  const email255 = 'a'.repeat(250) + '@b.co' // length 255, valid email shape
  const email307 = 'a'.repeat(300) + '@ex.com' // length 307, still a valid email shape but over the cap
  assert.equal(email255.length, 255)
  assert.equal(managerFormSchema.safeParse({ phone: '0901234567', fullName: 'A', email: email255 }).success, true, '255-char email must be accepted')
  const result = managerFormSchema.safeParse({ phone: '0901234567', fullName: 'A', email: email307 })
  assert.equal(result.success, false, '307-char email must be rejected by the 255 cap')
})

test('AUTH-08: a malformed email ("not-an-email") is rejected', () => {
  const result = managerFormSchema.safeParse({ phone: '0901234567', fullName: 'A', email: 'not-an-email' })
  assert.equal(result.success, false)
  assert.equal(result.error.issues.find(i => i.path[0] === 'email')?.message, 'Email không hợp lệ')
})

// ======================================================================================
// ManagerForm — create flow, PHONE_TAKEN 409, VALIDATION_FAILED fields.email (AUTH-08, UI-05/09)
// ======================================================================================

test('AUTH-08: submitting a valid form POSTs {phone,fullName} and drops an untouched email, then hands the one-time password to onCreated', async () => {
  const calls = fakeFetch([{ prefix: '/managers', method: 'POST', handler: () => ok({ manager: baseManager(), temporaryPassword: 'Tmp!29xQ7z' }) }])
  let issued = null
  const app = await mount(withQuery(React.createElement(ManagerForm, { onCreated: next => { issued = next }, onCancel: () => {} })))
  fill(app.container, byName(app.container, 'phone'), '0901234567')
  fill(app.container, byName(app.container, 'fullName'), 'Nguyễn Văn A')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.equal(calls.length, 1)
  // JSON.stringify drops keys whose value is undefined, so an untouched email must be absent from the body entirely.
  assert.deepEqual(JSON.parse(calls[0].body), { phone: '0901234567', fullName: 'Nguyễn Văn A' })
  assert.deepEqual(issued, { fullName: 'Nguyễn Văn A', password: 'Tmp!29xQ7z' }, 'onCreated must receive the temporary password returned once by the API')
  await app.stop()
})

test('AUTH-08: an invalid phone fails client-side; POST /managers is never sent', async () => {
  fakeFetch([])
  const app = await mount(withQuery(React.createElement(ManagerForm, { onCreated: () => {}, onCancel: () => {} })))
  fill(app.container, byName(app.container, 'phone'), '12345')
  fill(app.container, byName(app.container, 'fullName'), 'Nguyễn Văn A')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(app.container.textContent.includes('Số điện thoại không hợp lệ'))
  await app.stop()
})

test('AUTH-08: PHONE_TAKEN 409 from the API is shown as the form message', async () => {
  fakeFetch([{ prefix: '/managers', method: 'POST', handler: () => fail(409, 'PHONE_TAKEN', 'Số điện thoại đã được sử dụng') }])
  const app = await mount(withQuery(React.createElement(ManagerForm, { onCreated: () => {}, onCancel: () => {} })))
  fill(app.container, byName(app.container, 'phone'), '0901234567')
  fill(app.container, byName(app.container, 'fullName'), 'Nguyễn Văn A')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(app.container.textContent.includes('Số điện thoại đã được sử dụng'), 'PHONE_TAKEN message must be shown (AUTH-08)')
  await app.stop()
})

test('UI-05/09: VALIDATION_FAILED fields.email is mapped onto the email input, not just a generic form message', async () => {
  fakeFetch([{ prefix: '/managers', method: 'POST', handler: () => fail(400, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ', { email: 'Email đã được dùng bởi tài khoản khác' }) }])
  const app = await mount(withQuery(React.createElement(ManagerForm, { onCreated: () => {}, onCancel: () => {} })))
  fill(app.container, byName(app.container, 'phone'), '0901234567')
  fill(app.container, byName(app.container, 'fullName'), 'Nguyễn Văn A')
  fill(app.container, byName(app.container, 'email'), 'a@b.com')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  const emailInput = byName(app.container, 'email')
  const emailField = emailInput.parentNode.parentNode // div.rooms-field wrapping label + control + error <p>
  assert.ok(emailField.textContent.includes('Email đã được dùng bởi tài khoản khác'), 'the email field error must render next to the email input')
  await app.stop()
})

// ======================================================================================
// AUTH-08: the temporary password shows once — not stored, not logged, dropped on close/unmount, gcTime 0
// ======================================================================================

test('AUTH-08: after creating an account, the password shows once; closing the notice removes it from the DOM', async () => {
  fakeFetch([
    { prefix: '/managers', method: 'GET', handler: () => ok([], pageMeta([])) },
    { prefix: '/managers', method: 'POST', handler: () => ok({ manager: baseManager({ fullName: 'Trần Thị B' }), temporaryPassword: 'OneShot#7781' }) },
  ])
  const app = await mount(withQuery(React.createElement(ManagersPage, {})))
  dispatch(app.container, buttonByText(app.container, 'Thêm quản lý'), 'click')
  await wait(20)
  fill(app.container, byName(app.container, 'phone'), '0901234567')
  fill(app.container, byName(app.container, 'fullName'), 'Trần Thị B')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(app.container.textContent.includes('OneShot#7781'), 'the temporary password must be shown once right after creation')
  dispatch(app.container, buttonByText(app.container, 'Đã ghi lại, đóng'), 'click')
  await wait(20)
  assert.ok(!app.container.textContent.includes('OneShot#7781'), 'closing the notice must drop the password from the DOM')
  await app.stop()
})

test('AUTH-08: unmounting the page while the password notice is open also loses the password (no retained render)', async () => {
  fakeFetch([
    { prefix: '/managers', method: 'GET', handler: () => ok([], pageMeta([])) },
    { prefix: '/managers', method: 'POST', handler: () => ok({ manager: baseManager(), temporaryPassword: 'UnmountLost#42' }) },
  ])
  const app = await mount(withQuery(React.createElement(ManagersPage, {})))
  dispatch(app.container, buttonByText(app.container, 'Thêm quản lý'), 'click')
  await wait(20)
  fill(app.container, byName(app.container, 'phone'), '0901234567')
  fill(app.container, byName(app.container, 'fullName'), 'Nguyễn Văn A')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(30)
  assert.ok(app.container.textContent.includes('UnmountLost#42'))
  await app.stop()
  assert.equal(app.container.textContent.includes('UnmountLost#42'), false, 'after unmount, the password must not remain anywhere in the DOM')
})

test('AUTH-08: creating an account never writes the temporary password to sessionStorage/localStorage and never logs it to the console', async () => {
  fakeFetch([
    { prefix: '/managers', method: 'GET', handler: () => ok([], pageMeta([])) },
    { prefix: '/managers', method: 'POST', handler: () => ok({ manager: baseManager(), temporaryPassword: 'NoStoreNoLog#99' }) },
  ])
  const storageCalls = []
  const fakeStorage = () => ({ setItem: (k, v) => storageCalls.push(String(v)), getItem: () => null, removeItem() {}, clear() {} })
  const previousSession = globalThis.sessionStorage
  const previousLocal = globalThis.localStorage
  globalThis.sessionStorage = fakeStorage()
  globalThis.localStorage = fakeStorage()
  const consoleCalls = []
  const methods = ['log', 'info', 'warn', 'error', 'debug']
  const originals = methods.map(m => console[m])
  methods.forEach(m => { console[m] = (...args) => consoleCalls.push(args.map(a => String(a)).join(' ')) })
  try {
    const app = await mount(withQuery(React.createElement(ManagersPage, {})))
    dispatch(app.container, buttonByText(app.container, 'Thêm quản lý'), 'click')
    await wait(20)
    fill(app.container, byName(app.container, 'phone'), '0901234567')
    fill(app.container, byName(app.container, 'fullName'), 'Nguyễn Văn A')
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await wait(30)
    assert.ok(app.container.textContent.includes('NoStoreNoLog#99'), 'sanity: the password did render once')
    await app.stop()
  } finally {
    globalThis.sessionStorage = previousSession
    globalThis.localStorage = previousLocal
    methods.forEach((m, i) => { console[m] = originals[i] })
  }
  assert.ok(!storageCalls.some(v => v.includes('NoStoreNoLog#99')), 'the temporary password must never be written to sessionStorage/localStorage')
  assert.ok(!consoleCalls.some(v => v.includes('NoStoreNoLog#99')), 'the temporary password must never be logged to the console')
})

test('AUTH-08: the create-manager mutation uses gcTime 0, so its cache entry (which held the password) is gone shortly after it settles', async () => {
  const client = newClient()
  fakeFetch([
    { prefix: '/managers', method: 'GET', handler: () => ok([], pageMeta([])) },
    { prefix: '/managers', method: 'POST', handler: () => ok({ manager: baseManager(), temporaryPassword: 'GcZero#123' }) },
  ])
  const app = await mount(withQuery(React.createElement(ManagersPage, {}), client))
  dispatch(app.container, buttonByText(app.container, 'Thêm quản lý'), 'click')
  await wait(20)
  fill(app.container, byName(app.container, 'phone'), '0901234567')
  fill(app.container, byName(app.container, 'fullName'), 'Nguyễn Văn A')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
  await wait(60)
  assert.equal(client.getMutationCache().getAll().length, 0, 'gcTime:0 on the create-manager mutation must clear its cache entry once settled, not keep the password around')
  await app.stop()
})

// ======================================================================================
// ManagerList — 4 list states, pagination (20), lock/unlock, buildings "0/n kèm đã khóa" (UI-03, AUTH-08)
// ======================================================================================

test('UI-03: ManagerList shows a loading spinner, then an empty state with a next step when there is no manager yet', async () => {
  // The mock answers after 20ms (a stand-in for real network latency) so the loading render can be observed
  // before it resolves; mount()'s own 30ms wait would otherwise already show the resolved state.
  fakeFetch([{ prefix: '/managers', method: 'GET', handler: async () => { await wait(20); return ok([], pageMeta([])) } }])
  const container = fakeDocument.createElement('div')
  fakeDocument.body.appendChild(container)
  const root = createRoot(container)
  try {
    root.render(withQuery(React.createElement(ManagerList, {})))
    await wait(5)
    assert.ok(find(container, n => n.getAttribute('role') === 'status').length > 0, 'loading state must show a Spinner')
    await wait(40)
    assert.ok(container.textContent.includes('Chưa có tài khoản quản lý nào'), 'empty state text with next step missing')
  } finally {
    // Always unmount, even if an assertion threw above: an unmounted-but-still-querying tree left running in
    // the background would keep doing async work that could skew timing-sensitive waits in later tests.
    root.unmount()
    await wait(10)
  }
})

test('UI-03: ManagerList error state shows the API message with a "Thử lại" button that refetches', async () => {
  let attempt = 0
  const calls = fakeFetch([{
    prefix: '/managers', method: 'GET',
    handler: () => {
      attempt += 1
      return attempt === 1 ? fail(500, 'NETWORK_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : ok([baseManager()], pageMeta([1]))
    },
  }])
  const app = await mount(withQuery(React.createElement(ManagerList, {})))
  await wait(30)
  assert.ok(app.container.textContent.includes('Có lỗi xảy ra, vui lòng thử lại sau'))
  const retry = buttonByText(app.container, 'Thử lại')
  assert.ok(retry, 'UI-03 error state must offer a retry button')
  dispatch(app.container, retry, 'click')
  await wait(30)
  assert.ok(calls.filter(c => c.method === 'GET').length >= 2, 'retry must refetch')
  assert.ok(app.container.textContent.includes('Nguyễn Văn A'), 'after a successful retry, the data state renders')
  await app.stop()
})

test('API-02: ManagerList requests page=1&limit=20 by default', async () => {
  const calls = fakeFetch([{ prefix: '/managers', method: 'GET', handler: () => ok([baseManager()], pageMeta([1])) }])
  const app = await mount(withQuery(React.createElement(ManagerList, {})))
  await wait(30)
  const call = calls.find(c => c.url.startsWith('/api/v1/managers?'))
  assert.ok(call)
  assert.equal(queryOf(call.url).get('page'), '1')
  assert.equal(queryOf(call.url).get('limit'), '20')
  await app.stop()
})

test('UI-03: pagination nav appears only when total exceeds 20, shows "Trang 1/2", and "Trang sau" requests page 2', async () => {
  const page1 = Array.from({ length: 20 }, (_, i) => baseManager({ id: i + 1, phone: `090000000${i}`.slice(0, 10), fullName: `Quản lý ${i + 1}` }))
  const page2 = [baseManager({ id: 21, fullName: 'Quản lý 21' })]
  const calls = fakeFetch([{
    prefix: '/managers', method: 'GET',
    handler: call => queryOf(call.url).get('page') === '2' ? ok(page2, { page: 2, limit: 20, total: 21 }) : ok(page1, { page: 1, limit: 20, total: 21 }),
  }])
  const app = await mount(withQuery(React.createElement(ManagerList, {})))
  await wait(30)
  assert.ok(app.container.textContent.includes('Trang 1/2'), 'total=21, limit=20 must show "Trang 1/2"')
  const prev = buttonByText(app.container, 'Trang trước')
  const next = buttonByText(app.container, 'Trang sau')
  assert.ok(isDisabled(prev), '"Trang trước" must be disabled on page 1')
  assert.ok(next && !isDisabled(next), '"Trang sau" must be enabled on page 1 of 2')
  dispatch(app.container, next, 'click')
  await wait(30)
  const secondCall = calls.filter(c => c.url.startsWith('/api/v1/managers?')).at(-1)
  assert.equal(queryOf(secondCall.url).get('page'), '2', 'clicking "Trang sau" must request page=2')
  assert.ok(app.container.textContent.includes('Quản lý 21'))
  await app.stop()
})

test('UI-03: no pagination nav when total fits in one page (total <= 20)', async () => {
  fakeFetch([{ prefix: '/managers', method: 'GET', handler: () => ok([baseManager()], { page: 1, limit: 20, total: 1 }) }])
  const app = await mount(withQuery(React.createElement(ManagerList, {})))
  await wait(30)
  assert.equal(find(app.container, n => n.tagName === 'NAV').length, 0, 'no pagination nav expected when total <= limit')
  await app.stop()
})

test('AUTH-08: clicking "Khóa" PATCHes isActive:false for that manager only, and the button label flips to "Mở khóa" after refetch', async () => {
  const active = baseManager({ id: 7, fullName: 'Lê Văn C', isActive: true })
  const locked = { ...active, isActive: false }
  let afterLock = false
  const calls = fakeFetch([
    { prefix: '/managers/7', method: 'PATCH', handler: () => { afterLock = true; return ok(locked) } },
    { prefix: '/managers', method: 'GET', handler: () => ok([afterLock ? locked : active], pageMeta([1])) },
  ])
  const app = await mount(withQuery(React.createElement(ManagerList, {})))
  await wait(30)
  const lockBtn = buttonByText(app.container, 'Khóa Lê Văn C')
  assert.ok(lockBtn, 'lock button for the active manager not found')
  dispatch(app.container, lockBtn, 'click')
  await wait(40)
  const patch = calls.find(c => c.method === 'PATCH')
  assert.ok(patch, 'no PATCH /managers/7 sent')
  assert.deepEqual(JSON.parse(patch.body), { isActive: false })
  assert.ok(buttonByText(app.container, 'Mở khóa Lê Văn C'), 'button must flip to "Mở khóa" after the list refetches')
  await app.stop()
})

test('AUTH-08: clicking "Mở khóa" PATCHes isActive:true', async () => {
  const locked = baseManager({ id: 8, fullName: 'Phạm Thị D', isActive: false })
  const calls = fakeFetch([
    { prefix: '/managers/8', method: 'PATCH', handler: () => ok({ ...locked, isActive: true }) },
    { prefix: '/managers', method: 'GET', handler: () => ok([locked], pageMeta([1])) },
  ])
  const app = await mount(withQuery(React.createElement(ManagerList, {})))
  await wait(30)
  dispatch(app.container, buttonByText(app.container, 'Mở khóa Phạm Thị D'), 'click')
  await wait(40)
  const patch = calls.find(c => c.method === 'PATCH')
  assert.deepEqual(JSON.parse(patch.body), { isActive: true })
  await app.stop()
})

test('AUTH-08/BLD-04: a manager with 0 buildings shows "Chưa được giao tòa nào"', async () => {
  fakeFetch([{ prefix: '/managers', method: 'GET', handler: () => ok([baseManager({ buildings: [] })], pageMeta([1])) }])
  const app = await mount(withQuery(React.createElement(ManagerList, {})))
  await wait(30)
  assert.ok(app.container.textContent.includes('Chưa được giao tòa nào'))
  await app.stop()
})

test('AUTH-08/BLD-04: a manager with 2 buildings, one of them locked, shows both and marks only the locked one "đã khóa" (deactivating keeps the assignment)', async () => {
  const manager = baseManager({
    buildings: [
      { id: 5, code: 'B1', name: 'Tòa B1', isActive: true },
      { id: 6, code: 'B2', name: 'Tòa B2', isActive: false },
    ],
  })
  fakeFetch([{ prefix: '/managers', method: 'GET', handler: () => ok([manager], pageMeta([1])) }])
  const app = await mount(withQuery(React.createElement(ManagerList, {})))
  await wait(30)
  assert.ok(app.container.textContent.includes('Tòa B1 (B1); Tòa B2 (B2), đã khóa'), 'active building plain, locked building suffixed with ", đã khóa"')
  await app.stop()
})
