import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test, { after } from 'node:test'
import ts from 'typescript'

// TanStack Query keeps 5-minute garbage-collection timers alive; end the process once the tests are done.
// The exit code stays whatever node:test set (1 when a test failed).
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

// CP-4 flow tests. The real draft modules (routes, layouts, RequireAuth/GuestOnly, AuthProvider, LoginPage, api client,
// react-router, react-hook-form, zod, TanStack Query, the kit form fields) run unmodified on real React.
// Only the outside edges are faked: `fetch` (the API) and a tiny DOM (Node has none; no jsdom is installed).
// No backend, no database, no browser.

const here = dirname(fileURLToPath(import.meta.url))
const draftSrc = resolve(here, '../src')
const kitDir = existsSync(resolve(here, '../src/components')) ? resolve(here, '../src/components') : resolve(here, '../../../src/components')
const nodeRequire = createRequire(import.meta.url)

// ---------- minimal DOM ----------
class FakeNode {
  constructor(nodeType, nodeName, doc) { this.nodeType = nodeType; this.nodeName = nodeName; this.ownerDocument = doc; this.parentNode = null; this.childNodes = [] }
  get firstChild() { return this.childNodes[0] ?? null }
  get lastChild() { return this.childNodes.at(-1) ?? null }
  get nextSibling() { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) + 1] ?? null : null }
  get previousSibling() { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) - 1] ?? null : null }
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
  closest(selector) { // enough for the `a[href]` lookup of internal-links.ts
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (selector === 'a[href]' && n.tagName === 'A' && 'href' in n.attributes) return n
    return null
  }
  get textContent() { return this.childNodes.map(n => n.textContent ?? '').join('') }
  set textContent(v) { this.childNodes.forEach(n => { n.parentNode = null }); this.childNodes = []; if (v) this.appendChild(new FakeText(String(v), this.ownerDocument)) }
}
const fakeDocument = {
  nodeType: 9, nodeName: '#document', childNodes: [], activeElement: null, listeners: [],
  createElement(tag) { return new FakeElement(tag, fakeDocument) },
  createElementNS(_ns, tag) { return new FakeElement(tag, fakeDocument) },
  createTextNode(text) { return new FakeText(String(text), fakeDocument) },
  addEventListener() {}, removeEventListener() {},
  oninput: null, // React feature-detects `'oninput' in document`; without it text changes use a legacy path
}
fakeDocument.body = new FakeElement('body', fakeDocument)
fakeDocument.documentElement = new FakeElement('html', fakeDocument)
fakeDocument.documentElement.appendChild(fakeDocument.body)
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

// ---------- module loader ----------
function loadFresh() {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    Function('require', 'exports', 'module', code)(id => requireFrom(dirname(file), id), module.exports, module)
    return module.exports
  }
  function resolveFile(base) {
    for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) if (existsSync(base + ext) && !existsSync(base + ext + '/')) return base + ext
    for (const ext of ['.ts', '.tsx']) if (existsSync(base + ext)) return base + ext
    throw new Error(`cannot resolve ${base}`)
  }
  let kit
  function requireFrom(dir, id) {
    if (!id.startsWith('.')) return nodeRequire(id)
    if (id.endsWith('.css')) return {}
    if (/(^|\/)components$/.test(id)) {
      // The kit index also pulls in three.js / motion scenes; the form fields, button, heading and navigation it re-exports run unmodified.
      kit ??= Object.assign({}, ...['Button', 'FormFields', 'SectionHeading', 'Navigation'].map(n => load(resolve(kitDir, `${n}.tsx`))))
      return kit
    }
    return load(resolveFile(resolve(dir, id)))
  }
  return { load, src: file => load(resolve(draftSrc, file)) }
}

// ---------- fake API (outside edge) ----------
const ME = {
  boss: { id: 1, role: 'BOSS', phone: '0900000001', fullName: 'Phạm Minh Đức', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [] },
  manager: { id: 2, role: 'MANAGER', phone: '0900000002', fullName: 'Nguyễn Thu Hà', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, buildings: [{ id: 1, code: 'A01', name: 'Tòa A' }] },
  tenant: { id: 4, role: 'TENANT', phone: '0900000004', fullName: 'Nguyễn Văn An', email: null, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null },
  tenantMust: { id: 4, role: 'TENANT', phone: '0900000004', fullName: 'Nguyễn Văn An', email: null, mustChangePassword: true, contactPhone: null, zaloUrl: null, facebookUrl: null },
}
const byPhone = { '0900000001': ME.boss, '0900000002': ME.manager, '0900000004': ME.tenant, '0900000006': ME.tenantMust }
const err = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } })

function makeFetch({ session = null, contact = { phone: '0900000001', zaloUrl: 'https://zalo.me/0900000001', facebookUrl: null }, delay = 5, loginOverride, refreshStatus, extra } = {}) {
  const calls = []
  let token = session ? 'tok-0' : null
  const cfg = { refreshStatus, meStatus: undefined, refreshThrows: false, meOverride: undefined } // mutable: a test can fix the "server" before pressing "Thử lại"
  const fn = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body, headers: init.headers ?? {}, credentials: init.credentials })
    await new Promise(r => setTimeout(r, delay))
    const path = url.replace('/api/v1', '')
    const answered = extra?.(path, body, cfg) // CP-5 endpoints (change / forgot / reset password) are answered by the test itself
    if (answered) return { ok: answered.status >= 200 && answered.status < 300, status: answered.status, json: async () => answered.body }
    let result
    if (path === '/auth/refresh' && cfg.refreshThrows) throw new TypeError('Failed to fetch')
    if (path === '/auth/refresh' && cfg.refreshStatus) result = err(cfg.refreshStatus, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau')
    else if (path === '/auth/refresh') result = session ? { status: 200, body: { data: { accessToken: 'tok-0' } } } : err(401, 'UNAUTHENTICATED', 'Chưa đăng nhập')
    else if (path === '/auth/me' && cfg.meStatus) result = err(cfg.meStatus, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau')
    else if (path === '/auth/logout') result = { status: 200, body: { data: null } }
    else if (path === '/auth/me') result = session && init.headers?.Authorization === 'Bearer tok-0' ? { status: 200, body: { data: cfg.meOverride ?? ME[session] } } : err(401, 'UNAUTHENTICATED', 'Chưa đăng nhập')
    else if (path === '/public/contact') result = contact === 'error' ? err(500, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : { status: 200, body: { data: contact } }
    else if (path === '/auth/login') {
      if (loginOverride) result = loginOverride(body)
      else if (body.phone === '0900000005') result = err(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa. Liên hệ quản lý.')
      else if (body.phone === '0900000009') result = err(429, 'TOO_MANY_REQUESTS', 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau')
      else if (byPhone[body.phone] && body.password === 'matkhau123') result = { status: 200, body: { data: { accessToken: 'tok-1', user: byPhone[body.phone] } } }
      else result = err(401, 'INVALID_CREDENTIALS', 'Số điện thoại hoặc mật khẩu không đúng')
    } else result = err(404, 'NOT_FOUND', 'Không tìm thấy')
    return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => result.body }
  }
  return { fn, calls, cfg, token: () => token }
}

// ---------- mount helpers ----------
const wait = ms => new Promise(r => setTimeout(r, ms))
async function until(cond, what, ms = 3000) {
  const start = Date.now()
  while (Date.now() - start < ms) { if (cond()) return; await wait(5) }
  throw new Error(`timeout waiting for ${what}`)
}
const walk = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walk(c, out)); return out }
const find = (root, pred) => walk(root).filter(n => n.nodeType === 1 && pred(n))

async function mount(url, fetchOptions = {}, { strict = false } = {}) {
  const api = makeFetch(fetchOptions)
  globalThis.fetch = api.fn
  const { src } = loadFresh()
  const React = nodeRequire('react')
  const { createRoot } = nodeRequire('react-dom/client')
  const { createMemoryRouter, RouterProvider } = nodeRequire('react-router')
  const { routes } = src('app/routes.tsx')
  const { AppProviders } = src('app/AppProviders.tsx')
  const router = createMemoryRouter(routes, { initialEntries: [url] })
  const history = []
  router.subscribe(s => history.push(s.location.pathname + s.location.search))
  const container = fakeDocument.createElement('div')
  fakeDocument.body.appendChild(container)
  const root = createRoot(container)
  const tree = React.createElement(AppProviders, null, React.createElement(RouterProvider, { router }))
  root.render(strict ? React.createElement(React.StrictMode, null, tree) : tree)
  const dispatch = (target, type, extra = {}) => {
    const rootListeners = container.listeners.filter(l => l.type === type && !l.capture)
    assert.ok(rootListeners.length > 0, `no root listener for ${type}`)
    const event = { type, target, srcElement: target, currentTarget: container, bubbles: true, cancelable: true, defaultPrevented: false, button: 0, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...extra }
    rootListeners.forEach(l => l.listener(event))
  }
  const path = () => router.state.location.pathname + router.state.location.search
  const text = () => container.textContent
  const type = (el, value) => { el.value = value; dispatch(el, 'input') }
  const form = {
    phone: () => find(container, n => n.tagName === 'INPUT' && n.type === 'tel')[0],
    password: () => find(container, n => n.tagName === 'INPUT' && (n.type === 'password' || n.type === 'text') && n.autocomplete !== 'username' && n.type !== 'tel')[0],
    remember: () => find(container, n => n.tagName === 'INPUT' && n.type === 'checkbox')[0],
    form: () => find(container, n => n.tagName === 'FORM')[0],
    submitButton: () => find(container, n => n.tagName === 'BUTTON' && n.attributes.type === 'submit')[0],
    alerts: () => find(container, n => n.attributes.role === 'alert').map(n => n.textContent),
  }
  const stop = async () => { root.unmount(); await wait(10) }
  return { api, router, history, container, dispatch, path, text, type, form, stop }
}
async function fillAndSubmit(app, { phone, password, remember = false }) {
  await until(() => app.form.form(), 'the login form')
  app.type(app.form.phone(), phone)
  app.type(app.form.password(), password)
  if (remember) { app.form.remember().checked = true; app.dispatch(app.form.remember(), 'click') }
  app.dispatch(app.form.form(), 'submit')
}
const loginCalls = app => app.api.calls.filter(c => c.url === '/api/v1/auth/login')

// ---------- post-login redirect (A7, AUTH-06): the race flagged by the implementer ----------
test('AUTH-06/A7: after login with ?next=/ql/tai-khoan the user lands on /ql/tai-khoan, not on the role home (/ql)', async () => {
  const app = await mount('/dang-nhap?next=%2Fql%2Ftai-khoan')
  await fillAndSubmit(app, { phone: '0900000002', password: 'matkhau123' })
  await until(() => loginCalls(app).length === 1, 'login request')
  await wait(300) // let every queued render, GuestOnly <Navigate> and router transition settle
  assert.equal(app.path(), '/ql/tai-khoan', `landed on ${app.path()}; navigation history: ${JSON.stringify(app.history)}`)
  await app.stop()
})

test('AUTH-06/A7: after login with ?next=/ql (a path equal to the role home) the user lands on /ql, history never goes to /dang-nhap again', async () => {
  const app = await mount('/dang-nhap?next=%2Fql')
  await fillAndSubmit(app, { phone: '0900000001', password: 'matkhau123' })
  await until(() => loginCalls(app).length === 1, 'login request')
  await wait(300)
  assert.equal(app.path(), '/ql')
  await app.stop()
})

test('AUTH-06: login without next goes to the role home: manager /ql, boss /ql, tenant /thue', async () => {
  for (const [phone, home] of [['0900000002', '/ql'], ['0900000001', '/ql'], ['0900000004', '/thue']]) {
    const app = await mount('/dang-nhap')
    await fillAndSubmit(app, { phone, password: 'matkhau123' })
    await until(() => loginCalls(app).length === 1, 'login request')
    await wait(300)
    assert.equal(app.path(), home, `phone ${phone}`)
    await app.stop()
  }
})

test('AUTH-06/A7: next that belongs to another role is bounced to the user home by the guard (tenant with next=/ql -> /thue)', async () => {
  const app = await mount('/dang-nhap?next=%2Fql')
  await fillAndSubmit(app, { phone: '0900000004', password: 'matkhau123' })
  await until(() => loginCalls(app).length === 1, 'login request')
  await wait(300)
  assert.equal(app.path(), '/thue')
  await app.stop()
})

test('A7: unsafe next (//evil.com, https://evil.com) is ignored: the user lands on the role home', async () => {
  for (const next of ['%2F%2Fevil.com', 'https%3A%2F%2Fevil.com']) {
    const app = await mount(`/dang-nhap?next=${next}`)
    await fillAndSubmit(app, { phone: '0900000002', password: 'matkhau123' })
    await until(() => loginCalls(app).length === 1, 'login request')
    await wait(300)
    assert.equal(app.path(), '/ql', `next=${next}`)
    await app.stop()
  }
})

test('AUTH-05: a tenant who must change the password lands on /doi-mat-khau after login, not /thue', async () => {
  const app = await mount('/dang-nhap')
  await fillAndSubmit(app, { phone: '0900000006', password: 'matkhau123' })
  await until(() => loginCalls(app).length === 1, 'login request')
  await wait(300)
  assert.equal(app.path(), '/doi-mat-khau')
  await app.stop()
})

// ---------- request body, errors, states ----------
test('AUTH-01: login posts { phone, password, remember:false } with credentials include and no Bearer', async () => {
  const app = await mount('/dang-nhap')
  await fillAndSubmit(app, { phone: '0900000002', password: 'matkhau123' })
  await until(() => loginCalls(app).length === 1, 'login request')
  const [call] = loginCalls(app)
  assert.deepEqual(call.body, { phone: '0900000002', password: 'matkhau123', remember: false })
  assert.equal(call.credentials, 'include')
  assert.equal(call.headers.Authorization, undefined)
  await app.stop()
})

test('AUTH-01: ticking "Ghi nhớ đăng nhập" sends remember:true', async () => {
  const app = await mount('/dang-nhap')
  await fillAndSubmit(app, { phone: '0900000002', password: 'matkhau123', remember: true })
  await until(() => loginCalls(app).length === 1, 'login request')
  assert.equal(loginCalls(app)[0].body.remember, true)
  await app.stop()
})

test('AUTH-01: wrong password shows the API message in a role="alert" block, stays on the page, keeps the typed phone', async () => {
  const app = await mount('/dang-nhap')
  await fillAndSubmit(app, { phone: '0900000002', password: 'sai-mat-khau' })
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.deepEqual(app.form.alerts(), ['Số điện thoại hoặc mật khẩu không đúng'])
  assert.equal(app.path(), '/dang-nhap')
  assert.equal(app.form.phone().value, '0900000002')
  await app.stop()
})

test('AUTH-02: a locked account shows "Tài khoản đã bị khóa. Liên hệ quản lý."', async () => {
  const app = await mount('/dang-nhap')
  await fillAndSubmit(app, { phone: '0900000005', password: 'matkhau123' })
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.deepEqual(app.form.alerts(), ['Tài khoản đã bị khóa. Liên hệ quản lý.'])
  assert.equal(app.path(), '/dang-nhap')
  await app.stop()
})

test('AUTH-04: rate limit shows "Bạn thao tác quá nhiều lần, vui lòng thử lại sau"', async () => {
  const app = await mount('/dang-nhap')
  await fillAndSubmit(app, { phone: '0900000009', password: 'matkhau123' })
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.deepEqual(app.form.alerts(), ['Bạn thao tác quá nhiều lần, vui lòng thử lại sau'])
  await app.stop()
})

test('UI-05/G-04: a malformed phone shows the zod message under the field and sends no login request', async () => {
  const app = await mount('/dang-nhap')
  await fillAndSubmit(app, { phone: '090000000', password: 'matkhau123' })
  await until(() => app.text().includes('Số điện thoại không hợp lệ'), 'field error')
  await wait(100)
  assert.equal(loginCalls(app).length, 0)
  assert.equal(app.path(), '/dang-nhap')
  await app.stop()
})

test('AUTH-01: an empty password shows "Vui lòng nhập mật khẩu" and sends no login request', async () => {
  const app = await mount('/dang-nhap')
  await fillAndSubmit(app, { phone: '0900000002', password: '' })
  await until(() => app.text().includes('Vui lòng nhập mật khẩu'), 'field error')
  await wait(100)
  assert.equal(loginCalls(app).length, 0)
  await app.stop()
})

test('UI-05: API 400 fields.phone is attached under the phone field (zod bypassed by the mock)', async () => {
  const app = await mount('/dang-nhap', { loginOverride: () => err(400, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ', { phone: 'Số điện thoại không hợp lệ (từ máy chủ)' }) })
  await fillAndSubmit(app, { phone: '0900000002', password: 'matkhau123' })
  await until(() => app.text().includes('Số điện thoại không hợp lệ (từ máy chủ)'), 'server field error')
  assert.equal(app.path(), '/dang-nhap')
  await app.stop()
})

test('UI-09: while the request is in flight the submit button is disabled and shows the spinner "Đang đăng nhập"', async () => {
  const app = await mount('/dang-nhap', { delay: 60 })
  await fillAndSubmit(app, { phone: '0900000002', password: 'matkhau123' })
  await until(() => app.form.submitButton()?.hasAttribute('disabled') || app.form.submitButton()?.disabled, 'button disabled')
  assert.ok(app.text().includes('Đang đăng nhập') || find(app.container, n => n.attributes['aria-label'] === 'Đang đăng nhập').length > 0, 'spinner label missing')
  await until(() => loginCalls(app).length === 1, 'login request')
  assert.equal(loginCalls(app).length, 1)
  await app.stop()
})

test('A16/AUTH-10: login page shows the title, the "no account" sentence, Boss contact once, and the two links', async () => {
  const app = await mount('/dang-nhap')
  await until(() => app.text().includes('Điện thoại: 0900000001'), 'contact block')
  assert.ok(app.text().includes('Đăng nhập'))
  assert.ok(app.text().includes('Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng'))
  const hrefs = find(app.container, n => n.tagName === 'A').map(a => a.attributes.href ?? a.href)
  assert.ok(hrefs.includes('/quen-mat-khau'))
  assert.ok(hrefs.includes('/phong'))
  assert.equal(app.api.calls.filter(c => c.url === '/api/v1/public/contact').length, 1, 'page and footer must share one contact request')
  await app.stop()
})

test('AUTH-10: when the contact API fails the login page still works and shows no contact block', async () => {
  const app = await mount('/dang-nhap', { contact: 'error' })
  await until(() => app.api.calls.some(c => c.url === '/api/v1/public/contact'), 'contact request')
  await wait(100)
  assert.ok(!app.text().includes('Điện thoại:'))
  assert.ok(app.text().includes('Chưa có tài khoản?'))
  await app.stop()
})

test('A16: password-reset notice (role="status") shows only when location.state.notice === "password-reset"', async () => {
  const plain = await mount('/dang-nhap')
  await until(() => plain.form.form(), 'form')
  assert.equal(find(plain.container, n => n.attributes.role === 'status').length, 0)
  await plain.stop()
  const app = await mount('/dang-nhap')
  await until(() => app.form.form(), 'form')
  await app.router.navigate('/dang-nhap', { state: { notice: 'password-reset' }, replace: true })
  await until(() => find(app.container, n => n.attributes.role === 'status').length === 1, 'notice')
  assert.equal(find(app.container, n => n.attributes.role === 'status')[0].textContent, 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.')
  await app.stop()
})

test('AUTH-T1: after login the token is not written to localStorage / sessionStorage (they are never touched)', async () => {
  const writes = []
  const spy = name => ({ get length() { return 0 }, setItem: (k, v) => writes.push([name, k, v]), getItem: () => null, removeItem() {}, clear() {} })
  globalThis.localStorage = spy('local')
  globalThis.sessionStorage = spy('session')
  const app = await mount('/dang-nhap')
  await fillAndSubmit(app, { phone: '0900000002', password: 'matkhau123' })
  await until(() => loginCalls(app).length === 1, 'login request')
  await wait(200)
  assert.deepEqual(writes, [])
  delete globalThis.localStorage
  delete globalThis.sessionStorage
  await app.stop()
})

// ---------- GuestOnly (T1) ----------
test('AUTH-06/T1: GuestOnly sends a signed-in user from /dang-nhap to their home (tenant /thue, manager /ql, boss /ql); a tenant opening /dang-nhap?next=/ql ends on /thue because /ql is not a tenant area', async () => {
  for (const [session, url, home] of [['tenant', '/dang-nhap', '/thue'], ['manager', '/dang-nhap', '/ql'], ['boss', '/dang-nhap', '/ql'], ['tenant', '/dang-nhap?next=%2Fql', '/thue']]) {
    const app = await mount(url, { session })
    await until(() => app.path() === home, `redirect for ${session}`)
    await wait(100)
    assert.equal(app.path(), home, `${session} ${url}`)
    await app.stop()
  }
})

test('AUTH-05/T1: a tenant who must change the password and opens /dang-nhap ends on /doi-mat-khau', async () => {
  const app = await mount('/dang-nhap', { session: 'tenantMust' })
  await until(() => app.path() === '/doi-mat-khau', 'redirect')
  await wait(100)
  assert.equal(app.path(), '/doi-mat-khau')
  await app.stop()
})

test('T1: while the session boots the login route shows only the spinner "Đang tải", never the form', async () => {
  const app = await mount('/dang-nhap', { delay: 80 })
  await wait(20)
  assert.equal(app.form.form(), undefined)
  assert.ok(find(app.container, n => n.attributes['aria-label'] === 'Đang tải').length > 0 || app.text().includes('Đang tải'))
  await until(() => app.form.form(), 'form after boot')
  await app.stop()
})

test('Q6-A/A17: when startup fails (refresh 500) the login form is still usable and login works', async () => {
  const app = await mount('/dang-nhap', { refreshStatus: 500 })
  await until(() => app.form.form(), 'form')
  await fillAndSubmit(app, { phone: '0900000002', password: 'matkhau123' })
  await until(() => app.path() === '/ql', 'landing on /ql')
  assert.equal(app.path(), '/ql')
  await app.stop()
})

// ---------- AuthProvider start-up (real AuthProvider + api client; fetch is the only fake) ----------
const callsTo = (app, method, path) => app.api.calls.filter(c => c.method === method && c.url === `/api/v1${path}`)
const buttonByText = (app, label) => find(app.container, n => n.tagName === 'BUTTON' && n.textContent.trim() === label)[0]
const hasTheme = app => (app.container.childNodes[0]?.attributes.class ?? '').split(' ').includes('rooms-theme')
const navLinks = app => find(find(app.container, n => n.tagName === 'NAV' && n.attributes['aria-label'] === 'Điều hướng chính')[0] ?? app.container, n => n.tagName === 'A').map(a => [a.textContent.trim(), a.attributes.href])
const spinner = app => find(app.container, n => n.attributes.role === 'status' && n.textContent.trim() === 'Đang tải').length > 0
const settle = async (app, expectedPath, what) => { await until(() => app.path() === expectedPath, what); await wait(150); assert.equal(app.path(), expectedPath, `${what}; history ${JSON.stringify(app.history)}`) }
ME.bossThree = { ...ME.boss, buildings: [{ id: 1, code: 'A01', name: 'Tòa A' }, { id: 2, code: 'A02', name: 'Tòa B' }, { id: 3, code: 'B01', name: 'Tòa C' }] }
ME.managerEmpty = { ...ME.manager, buildings: [] }

test('AUTH-T2: under StrictMode a signed-in start-up sends exactly one POST /auth/refresh, then GET /auth/me with the Bearer token, and greets the user', async () => {
  const app = await mount('/thue', { session: 'tenant' }, { strict: true })
  await until(() => app.text().includes('Xin chào, Nguyễn Văn An'), 'tenant home')
  await wait(150)
  assert.equal(callsTo(app, 'POST', '/auth/refresh').length, 1, 'one refresh even though StrictMode runs the effect twice')
  const me = callsTo(app, 'GET', '/auth/me')
  assert.ok(me.length >= 1, 'me was called')
  assert.ok(me.every(c => c.headers.Authorization === 'Bearer tok-0'), 'me carries the refreshed token')
  assert.ok(app.api.calls.findIndex(c => c.url.endsWith('/auth/refresh')) < app.api.calls.findIndex(c => c.url.endsWith('/auth/me')), 'refresh comes before me')
  assert.ok(app.text().includes('Tổng quan'))
  assert.equal(app.path(), '/thue')
  await app.stop()
})

test('AUTH-T2: while booting a guarded route shows only the spinner "Đang tải" inside .rooms-theme, then the page', async () => {
  const app = await mount('/thue', { session: 'tenant', delay: 60 })
  await wait(20)
  assert.ok(spinner(app), 'spinner while loading')
  assert.ok(hasTheme(app), 'spinner sits inside .rooms-theme')
  assert.ok(!app.text().includes('Xin chào'))
  await until(() => app.text().includes('Xin chào'), 'page after boot')
  await app.stop()
})

test('AUTH-T2/AUTH-06: refresh 401 means signed out with status ready: no error block, no /auth/me call, public page works, guarded route goes to /dang-nhap?next=', async () => {
  const app = await mount('/')
  await until(() => navLinks(app).length > 0, 'header after boot')
  assert.deepEqual(navLinks(app).filter(([, href]) => href !== '/'), [['Đăng nhập', '/dang-nhap']])
  assert.ok(app.text().includes('Trang đang được xây dựng'))
  assert.equal(find(app.container, n => n.attributes.role === 'alert').length, 0)
  assert.equal(callsTo(app, 'GET', '/auth/me').length, 0, `me is not called after a 401 refresh; calls ${JSON.stringify(app.api.calls.map(c => [c.method, c.url, c.headers.Authorization]))}`)
  assert.equal(callsTo(app, 'POST', '/auth/refresh').length, 1)
  await app.router.navigate('/thue')
  await settle(app, '/dang-nhap?next=%2Fthue', 'signed-out /thue')
  await app.stop()
})

test('Q6-A: refresh failing with a non-401 error (500, network) gives status error: block "Không tải được phiên đăng nhập." + "Thử lại", URL stays, no redirect to /dang-nhap', async () => {
  for (const [label, opts] of [['500', { refreshStatus: 500 }], ['network', null]]) {
    const app = await mount('/thue', { session: 'tenant', ...(opts ?? {}) })
    if (!opts) app.api.cfg.refreshThrows = true
    await until(() => app.form.alerts().length > 0, `error block (${label})`)
    assert.deepEqual(app.form.alerts(), ['Không tải được phiên đăng nhập.'])
    assert.ok(buttonByText(app, 'Thử lại'), 'retry button')
    assert.ok(hasTheme(app), 'error block sits inside .rooms-theme')
    assert.equal(app.path(), '/thue')
    await wait(100)
    assert.ok(app.history.every(p => !p.startsWith('/dang-nhap')), `never visited /dang-nhap (${label}); ${JSON.stringify(app.history)}`)
    await app.stop()
  }
})

test('Q6-A: /auth/me failing with 500 after a good refresh also gives status error, on /ql too', async () => {
  const app = await mount('/ql', { session: 'manager' })
  app.api.cfg.meStatus = 500
  await until(() => app.form.alerts().length > 0, 'error block')
  assert.deepEqual(app.form.alerts(), ['Không tải được phiên đăng nhập.'])
  assert.equal(app.path(), '/ql')
  await app.stop()
})

test('Q6-A: retry() sets loading again and re-runs the start-up with exactly one more POST /auth/refresh; success shows the page', async () => {
  const app = await mount('/thue', { session: 'tenant', refreshStatus: 500, delay: 30 })
  await until(() => buttonByText(app, 'Thử lại'), 'retry button')
  assert.equal(callsTo(app, 'POST', '/auth/refresh').length, 1)
  app.api.cfg.refreshStatus = undefined // the "server" is back
  app.dispatch(buttonByText(app, 'Thử lại'), 'click')
  await wait(5)
  assert.ok(spinner(app), 'back to loading right after the click')
  assert.equal(find(app.container, n => n.attributes.role === 'alert').length, 0)
  await until(() => app.text().includes('Xin chào, Nguyễn Văn An'), 'page after retry')
  assert.equal(callsTo(app, 'POST', '/auth/refresh').length, 2, 'one extra refresh, not more')
  assert.equal(app.path(), '/thue')
  await app.stop()
})

test('Q6-A: retry() that fails again returns to the error block', async () => {
  const app = await mount('/thue', { session: 'tenant', refreshStatus: 500 })
  await until(() => buttonByText(app, 'Thử lại'), 'retry button')
  app.dispatch(buttonByText(app, 'Thử lại'), 'click')
  await until(() => callsTo(app, 'POST', '/auth/refresh').length === 2, 'second refresh')
  await until(() => buttonByText(app, 'Thử lại'), 'error block again')
  assert.deepEqual(app.form.alerts(), ['Không tải được phiên đăng nhập.'])
  await app.stop()
})

test('Q6-A/A17: login from status error ends the error state: the guarded page shows with no error block', async () => {
  const app = await mount('/thue', { refreshStatus: 500 })
  await until(() => app.form.alerts().length > 0, 'error block')
  await app.router.navigate('/dang-nhap')
  await fillAndSubmit(app, { phone: '0900000004', password: 'matkhau123' })
  await settle(app, '/thue', 'landing after login from error')
  assert.ok(app.text().includes('Xin chào, Nguyễn Văn An'))
  assert.equal(app.form.alerts().length, 0)
  await app.stop()
})

test('Q6-A/A17: with a failed start-up public pages stay usable: "/" shows the placeholder and header "Đăng nhập" and no error block', async () => {
  const app = await mount('/', { refreshStatus: 500 })
  await until(() => navLinks(app).some(([label]) => label === 'Đăng nhập'), 'header Đăng nhập')
  assert.ok(app.text().includes('Trang đang được xây dựng'))
  assert.equal(find(app.container, n => n.attributes.role === 'alert').length, 0)
  await app.stop()
})

// ---------- router runtime flow with the real routes ----------
test('AUTH-06: route guard table at runtime (signed out -> /dang-nhap?next=, wrong role -> own home)', async () => {
  const table = [
    [undefined, '/thue', '/dang-nhap?next=%2Fthue'],
    [undefined, '/ql', '/dang-nhap?next=%2Fql'],
    ['tenant', '/ql', '/thue'],
    ['manager', '/thue', '/ql'],
    ['boss', '/thue', '/ql'],
    ['tenant', '/thue', '/thue'],
    ['manager', '/ql', '/ql'],
    ['boss', '/ql', '/ql'],
  ]
  for (const [session, from, to] of table) {
    const app = await mount(from, { session })
    await settle(app, to, `${session ?? 'none'} ${from}`)
    await app.stop()
  }
})

test('AUTH-05: a tenant who must change the password is sent to /doi-mat-khau from /thue and from /ql (URL only: the page is CP-5)', async () => {
  for (const from of ['/thue', '/ql']) {
    const app = await mount(from, { session: 'tenantMust' })
    await settle(app, '/doi-mat-khau', `tenantMust ${from}`)
    await app.stop()
  }
})

// CP-6 registered /thue/tai-khoan and /ql/tai-khoan (T3); only genuinely unknown paths remain here.
test('Q4-A: unknown paths show "Không tìm thấy trang" inside PublicLayout and keep the URL', async () => {
  for (const path of ['/khong-co', '/thue/khong-co', '/ql/khong-co']) {
    const app = await mount(path, { session: 'manager' })
    await until(() => app.text().includes('Không tìm thấy trang'), `not found for ${path}`)
    assert.equal(app.path(), path)
    assert.equal(find(app.container, n => n.tagName === 'FOOTER').length, 1, 'PublicLayout footer is present')
    await app.stop()
  }
})

test('Q4-A: "/" and "/phong" show "Trang đang được xây dựng"; the 404 link "Về trang chủ" goes to "/" without a second refresh', async () => {
  for (const path of ['/', '/phong']) {
    const app = await mount(path)
    await until(() => app.text().includes('Trang đang được xây dựng'), path)
    await app.stop()
  }
  const app = await mount('/khong-co')
  await until(() => app.text().includes('Không tìm thấy trang'), '404')
  const link = find(app.container, n => n.tagName === 'A' && n.textContent === 'Về trang chủ')[0]
  assert.equal(link.attributes.href, '/')
  app.dispatch(link, 'click')
  await settle(app, '/', 'back home')
  assert.ok(app.text().includes('Trang đang được xây dựng'))
  assert.equal(callsTo(app, 'POST', '/auth/refresh').length, 1)
  await app.stop()
})

test('FE-LOGIN-10: PublicLayout header: "Đăng nhập" -> /dang-nhap when signed out; "Trang của tôi" -> /thue (tenant) or /ql (manager, boss); nothing while loading', async () => {
  for (const [session, expected] of [[undefined, ['Đăng nhập', '/dang-nhap']], ['tenant', ['Trang của tôi', '/thue']], ['manager', ['Trang của tôi', '/ql']], ['boss', ['Trang của tôi', '/ql']]]) {
    const app = await mount('/', { session, delay: 40 })
    await wait(10)
    assert.deepEqual(navLinks(app).filter(([, href]) => href !== '/'), [], 'no menu item while loading')
    await until(() => navLinks(app).some(([label]) => label !== ''), `menu for ${session ?? 'none'}`)
    assert.deepEqual(navLinks(app).filter(([, href]) => href !== '/'), [expected], session ?? 'none')
    assert.ok(hasTheme(app))
    await app.stop()
  }
})

test('FE-LOGIN-10/A2: clicking a header link changes the route without reloading the app (no new refresh) and the guard then lands signed-in users on their home', async () => {
  const app = await mount('/', { session: 'manager' })
  await until(() => navLinks(app).some(([label]) => label === 'Trang của tôi'), 'header')
  const link = find(app.container, n => n.tagName === 'A' && n.textContent === 'Trang của tôi')[0]
  app.dispatch(link, 'click')
  await settle(app, '/ql', 'header link click')
  assert.equal(callsTo(app, 'POST', '/auth/refresh').length, 1, 'no refresh after the click')
  assert.ok(app.text().includes('Việc hôm nay'))
  await app.stop()
})

test('FE-LOGIN-10, Q2-A: TenantLayout menu is exactly "Tổng quan" /thue and "Tài khoản" /thue/tai-khoan; no building line; no footer; inside .rooms-theme with the kit logo', async () => {
  const app = await mount('/thue', { session: 'tenant' })
  await until(() => app.text().includes('Xin chào'), 'tenant home')
  assert.deepEqual(navLinks(app), [['Tổng quan', '/thue'], ['Tài khoản', '/thue/tai-khoan']])
  assert.ok(!app.text().includes('Tòa đang quản lý'))
  assert.ok(!app.text().includes('Chưa được giao tòa nào'))
  assert.equal(find(app.container, n => n.tagName === 'FOOTER').length, 0)
  assert.equal(find(app.container, n => n.tagName === 'SELECT').length, 0)
  assert.ok(hasTheme(app))
  assert.ok(find(app.container, n => n.tagName === 'IMG').some(n => n.attributes.src === '/images/rooms-logo.webp'), 'KIT-10 logo')
  await app.stop()
})

test('FE-LOGIN-10, Q2-A, Q5-A: StaffLayout menu "Việc hôm nay" /ql + "Tài khoản" /ql/tai-khoan, read-only building line (manager 2, boss 3, empty), no select, no footer', async () => {
  const cases = [
    ['manager', 'Tòa đang quản lý: A01 · Tòa A'],
    ['bossThree', 'Tòa đang quản lý: A01 · Tòa A, A02 · Tòa B, B01 · Tòa C'],
    ['managerEmpty', 'Chưa được giao tòa nào'],
    ['boss', 'Chưa được giao tòa nào'],
  ]
  for (const [session, line] of cases) {
    const app = await mount('/ql', { session })
    await until(() => app.text().includes('Xin chào'), `staff home ${session}`)
    assert.deepEqual(navLinks(app), [['Việc hôm nay', '/ql'], ['Tài khoản', '/ql/tai-khoan']], session)
    const lines = find(app.container, n => n.tagName === 'P' && /^(Tòa đang quản lý|Chưa được giao tòa nào)/.test(n.textContent)).map(n => n.textContent)
    assert.deepEqual(lines, [line], session)
    assert.equal(find(app.container, n => n.tagName === 'SELECT').length, 0)
    assert.equal(find(app.container, n => n.tagName === 'FOOTER').length, 0)
    await app.stop()
  }
})

test('FE-LOGIN-11: /thue titled "Tổng quan" and /ql titled "Việc hôm nay", each greets by full name only', async () => {
  for (const [session, path, title, name] of [['tenant', '/thue', 'Tổng quan', 'Nguyễn Văn An'], ['manager', '/ql', 'Việc hôm nay', 'Nguyễn Thu Hà'], ['boss', '/ql', 'Việc hôm nay', 'Phạm Minh Đức']]) {
    const app = await mount(path, { session })
    await until(() => app.text().includes(`Xin chào, ${name}`), `${path} ${session}`)
    assert.ok(find(app.container, n => /^H[1-3]$/.test(n.tagName)).some(n => n.textContent.trim() === title), `${title} heading`)
    await app.stop()
  }
})

test('Q3-A, AUTH-10: PublicLayout footer has the description and Boss contact (one GET /public/contact); contact error or null keeps the footer without a contact block; /thue and /ql have no footer', async () => {
  const full = await mount('/')
  await until(() => full.text().includes('Điện thoại: 0900000001'), 'contact')
  const footer = find(full.container, n => n.tagName === 'FOOTER')
  assert.equal(footer.length, 1)
  assert.ok(footer[0].textContent.includes('Chung cư mini cho thuê tại Hà Nội.'))
  assert.deepEqual(find(footer[0], n => n.tagName === 'A').map(a => a.textContent), ['Zalo'])
  assert.equal(callsTo(full, 'GET', '/public/contact').length, 1)
  await full.stop()
  for (const contact of ['error', null]) {
    const app = await mount('/', { contact })
    await wait(150)
    assert.equal(find(app.container, n => n.tagName === 'FOOTER').length, 1)
    assert.ok(!app.text().includes('Điện thoại:'))
    assert.ok(app.text().includes('Chung cư mini cho thuê tại Hà Nội.'))
    await app.stop()
  }
})

test('FE-LOGIN-10/T2: "Đăng xuất" is a type=button; click posts /auth/logout once, goes to "/" without visiting /dang-nhap, shows "Đăng nhập", and /thue is guarded again (tenant and manager layouts)', async () => {
  for (const [session, home] of [['tenant', '/thue'], ['manager', '/ql']]) {
    const app = await mount(home, { session })
    await until(() => buttonByText(app, 'Đăng xuất'), `sign-out button ${session}`)
    const button = buttonByText(app, 'Đăng xuất')
    assert.equal(button.attributes.type, 'button')
    app.dispatch(button, 'click')
    await Promise.resolve() // a real second click is a separate task; this only lets React commit the re-render (fake DOM has no event loop turn between two dispatches)
    app.dispatch(button, 'click') // a quick second click
    await settle(app, '/', `after sign-out ${session}`)
    assert.equal(callsTo(app, 'POST', '/auth/logout').length, 1, 'double click sends one logout')
    assert.ok(app.history.every(p => !p.startsWith('/dang-nhap')), `no visit to /dang-nhap: ${JSON.stringify(app.history)}`)
    await until(() => navLinks(app).some(([label]) => label === 'Đăng nhập'), 'header shows Đăng nhập')
    await app.router.navigate(home)
    await settle(app, `/dang-nhap?next=${encodeURIComponent(home)}`, `guard after sign-out ${session}`)
    await app.stop()
  }
})

// ---------- source-level checks ----------
test('A5/UI-08: LoginPage has the labelled fields, remember unchecked by default, and Vietnamese-only visible text', () => {
  const page = readFileSync(resolve(draftSrc, 'pages/public/LoginPage.tsx'), 'utf8')
  for (const needle of ['label="Số điện thoại"', 'type="tel"', 'inputMode="numeric"', 'autoComplete="username"', 'label="Mật khẩu"', 'autoComplete="current-password"', 'label="Ghi nhớ đăng nhập"', 'remember: false', 'Quên mật khẩu?', 'Xem phòng trống']) {
    assert.ok(page.includes(needle), `missing ${needle}`)
  }
})

// ====================================================================================================
// CP-5: /doi-mat-khau, /quen-mat-khau (both modes). Same real modules; fetch is the only fake (outside edge).
// ====================================================================================================
const VALIDATION = 'Dữ liệu không hợp lệ'
const inputByLabel = (app, label) => {
  const lab = find(app.container, n => n.tagName === 'LABEL' && n.textContent === label)[0]
  assert.ok(lab, `label "${label}" not found; text: ${app.text()}`)
  return find(app.container, n => n.tagName === 'INPUT' && n.attributes.id === lab.attributes.for)[0]
}
const fieldErrorOf = (app, label) => find(app.container, n => n.attributes.id === `${inputByLabel(app, label).attributes.id}-error`)[0]?.textContent
const statusBlocks = app => find(app.container, n => n.attributes.role === 'status' && n.tagName === 'P').map(n => n.textContent)
const submitForm = app => app.dispatch(app.form.form(), 'submit')
const changeCalls = app => callsTo(app, 'POST', '/auth/change-password')
const forgotCalls = app => callsTo(app, 'POST', '/auth/forgot-password')
const resetCalls = app => callsTo(app, 'POST', '/auth/reset-password')
const NEW_PW = 'matkhau456'

// Mock of POST /auth/change-password: wrong current -> fields.currentPassword, same -> fields.newPassword, else flips the "server" flag.
const changeExtra = ({ after } = {}) => (path, body, cfg) => {
  if (path !== '/auth/change-password') return undefined
  if (body.currentPassword !== 'matkhau123') return err(400, 'VALIDATION_FAILED', VALIDATION, { currentPassword: 'Mật khẩu hiện tại không đúng' })
  if (body.newPassword === body.currentPassword) return err(400, 'VALIDATION_FAILED', VALIDATION, { newPassword: 'Mật khẩu mới phải khác mật khẩu hiện tại' })
  cfg.meOverride = { ...ME.tenantMust, mustChangePassword: false }
  after?.(cfg)
  return { status: 200, body: { data: null } }
}
async function fillChange(app, { current = 'matkhau123', next = NEW_PW, confirm = next } = {}) {
  await until(() => app.form.form(), 'the change-password form')
  app.type(inputByLabel(app, 'Mật khẩu hiện tại'), current)
  app.type(inputByLabel(app, 'Mật khẩu mới'), next)
  app.type(inputByLabel(app, 'Nhập lại mật khẩu mới'), confirm)
  submitForm(app)
}

test('AUTH-05/AUTH-03: forced change page shows the title and the must-change sentence; success posts only { currentPassword, newPassword }, re-reads /auth/me and lands on /thue', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', extra: changeExtra() })
  await until(() => app.form.form(), 'form')
  assert.ok(find(app.container, n => /^H[1-3]$/.test(n.tagName)).some(n => n.textContent.trim() === 'Đổi mật khẩu'), 'title')
  assert.ok(app.text().includes('Bạn cần đổi mật khẩu trước khi tiếp tục'))
  assert.equal(app.path(), '/doi-mat-khau')
  await fillChange(app)
  await settle(app, '/thue', 'after forced change')
  assert.deepEqual(changeCalls(app).map(c => c.body), [{ currentPassword: 'matkhau123', newPassword: NEW_PW }])
  assert.equal(changeCalls(app)[0].headers.Authorization, 'Bearer tok-0')
  const order = app.api.calls.map(c => `${c.method} ${c.url}`)
  assert.ok(order.lastIndexOf('GET /api/v1/auth/me') > order.indexOf('POST /api/v1/auth/change-password'), `me re-read after the change: ${order}`)
  assert.ok(app.text().includes('Xin chào, Nguyễn Văn An'))
  assert.ok(app.history.filter(p => p === '/doi-mat-khau').length <= 1, `no bounce back to the forced page: ${JSON.stringify(app.history)}`)
  // opening the page again is allowed and no longer forced
  await app.router.navigate('/doi-mat-khau')
  await until(() => app.form.form(), 'form again')
  await wait(100)
  assert.equal(app.path(), '/doi-mat-khau')
  assert.ok(!app.text().includes('Bạn cần đổi mật khẩu trước khi tiếp tục'))
  await app.stop()
})

test('AUTH-03: new password of 7 characters is rejected under "Mật khẩu mới" and nothing is sent; 8 characters is sent', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', extra: changeExtra() })
  await fillChange(app, { next: '1234567' })
  await until(() => fieldErrorOf(app, 'Mật khẩu mới'), 'field error')
  assert.equal(fieldErrorOf(app, 'Mật khẩu mới'), 'Mật khẩu tối thiểu 8 ký tự')
  await wait(100)
  assert.equal(changeCalls(app).length, 0, '7 chars must not reach the API')
  assert.equal(app.path(), '/doi-mat-khau')
  app.type(inputByLabel(app, 'Mật khẩu mới'), '12345678')
  app.type(inputByLabel(app, 'Nhập lại mật khẩu mới'), '12345678')
  submitForm(app)
  await until(() => changeCalls(app).length === 1, 'request with 8 chars')
  assert.equal(changeCalls(app)[0].body.newPassword, '12345678')
  await app.stop()
})

test('AUTH-03: mismatching confirmation shows "Mật khẩu nhập lại không khớp" under the confirm field; empty current shows "Vui lòng nhập mật khẩu hiện tại"; no request', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', extra: changeExtra() })
  await fillChange(app, { current: '', next: NEW_PW, confirm: 'khac-hoan-toan' })
  await until(() => fieldErrorOf(app, 'Nhập lại mật khẩu mới'), 'confirm error')
  assert.equal(fieldErrorOf(app, 'Nhập lại mật khẩu mới'), 'Mật khẩu nhập lại không khớp')
  assert.equal(fieldErrorOf(app, 'Mật khẩu hiện tại'), 'Vui lòng nhập mật khẩu hiện tại')
  assert.equal(fieldErrorOf(app, 'Mật khẩu mới'), undefined)
  await wait(100)
  assert.equal(changeCalls(app).length, 0)
  await app.stop()
})

test('UI-05: wrong current password -> API text under "Mật khẩu hiện tại" and the API message in the role="alert" block; stays on /doi-mat-khau', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', extra: changeExtra() })
  await fillChange(app, { current: 'sai-mat-khau' })
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.equal(fieldErrorOf(app, 'Mật khẩu hiện tại'), 'Mật khẩu hiện tại không đúng')
  assert.deepEqual(app.form.alerts(), [VALIDATION])
  assert.equal(changeCalls(app).length, 1)
  assert.equal(app.path(), '/doi-mat-khau')
  assert.equal(app.api.calls.filter(c => c.url === '/api/v1/auth/me').length, 1, 'me is not re-read after a failed change (only the boot call)')
  await app.stop()
})

test('UI-05: new = current -> "Mật khẩu mới phải khác mật khẩu hiện tại" under "Mật khẩu mới"', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', extra: changeExtra() })
  await fillChange(app, { current: 'matkhau123', next: 'matkhau123' })
  await until(() => fieldErrorOf(app, 'Mật khẩu mới'), 'server field error')
  assert.equal(fieldErrorOf(app, 'Mật khẩu mới'), 'Mật khẩu mới phải khác mật khẩu hiện tại')
  assert.equal(app.path(), '/doi-mat-khau')
  await app.stop()
})

test('AUTH-05: signed out on /doi-mat-khau goes to /dang-nhap?next=%2Fdoi-mat-khau; a tenant who must change and opens /thue is sent to /doi-mat-khau', async () => {
  const out = await mount('/doi-mat-khau')
  await settle(out, '/dang-nhap?next=%2Fdoi-mat-khau', 'signed out')
  await out.stop()
  const must = await mount('/thue', { session: 'tenantMust' })
  await settle(must, '/doi-mat-khau', 'forced')
  await must.stop()
})

test('Q6-A/A17: startup error: /doi-mat-khau shows "Không tải được phiên đăng nhập." + "Thử lại" and keeps the URL; /quen-mat-khau stays usable (both modes)', async () => {
  const app = await mount('/doi-mat-khau', { refreshStatus: 500 })
  await until(() => app.form.alerts().length > 0, 'error block')
  assert.deepEqual(app.form.alerts(), ['Không tải được phiên đăng nhập.'])
  assert.ok(buttonByText(app, 'Thử lại'))
  assert.equal(app.path(), '/doi-mat-khau')
  await app.stop()
  for (const url of ['/quen-mat-khau', '/quen-mat-khau?token=hople']) {
    const page = await mount(url, { refreshStatus: 500 })
    await until(() => page.form.form(), `form at ${url}`)
    assert.equal(page.form.alerts().length, 0, url)
    assert.equal(page.path(), url)
    await page.stop()
  }
})

test('UI-09: change-password submit button is disabled with spinner "Đang lưu" while the request is in flight; one request', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', delay: 60, extra: changeExtra() })
  await fillChange(app)
  await until(() => app.form.submitButton()?.hasAttribute('disabled'), 'button disabled')
  assert.ok(find(app.container, n => n.attributes.role === 'status' && n.textContent.trim() === 'Đang lưu').length > 0, 'spinner "Đang lưu"')
  await settle(app, '/thue', 'after change')
  assert.equal(changeCalls(app).length, 1)
  await app.stop()
})

// Decision (a) of the coder: refreshMe() failing after a successful change is not in PLAN; behaviour is pinned here.
test('CP-5 decision (a): change succeeds but GET /auth/me then fails with 500 -> generic text in the role="alert" block, page stays on /doi-mat-khau, no redirect', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', extra: changeExtra({ after: cfg => { cfg.meStatus = 500 } }) })
  await fillChange(app)
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.deepEqual(app.form.alerts(), ['Có lỗi xảy ra, vui lòng thử lại sau'])
  await wait(150)
  assert.equal(app.path(), '/doi-mat-khau')
  assert.equal(changeCalls(app).length, 1)
  await app.stop()
})

test('CP-5 decision (a): change succeeds but /auth/me answers 401 even after refresh -> user cleared, guard sends to /dang-nhap?next=%2Fdoi-mat-khau (no navigation to a home)', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', extra: changeExtra({ after: cfg => { cfg.meStatus = 401 } }) })
  await fillChange(app)
  await settle(app, '/dang-nhap?next=%2Fdoi-mat-khau', 'signed out after change')
  assert.ok(app.history.every(p => p !== '/thue'), JSON.stringify(app.history))
  await app.stop()
})

// ---------- Q7-A: Đăng xuất under the forced form ----------
test('Q7-A/T2: "Đăng xuất" under the forced form is a type=button that posts only /auth/logout, goes to "/" without visiting /dang-nhap, header shows "Đăng nhập", /thue is guarded again', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', extra: changeExtra() })
  await until(() => buttonByText(app, 'Đăng xuất'), 'sign-out button')
  const button = buttonByText(app, 'Đăng xuất')
  assert.equal(button.attributes.type, 'button')
  assert.ok(/rooms-button-outline|outline/.test(button.attributes.class ?? ''), `outline variant, got class "${button.attributes.class}"`)
  const submit = app.form.submitButton()
  assert.ok(submit && submit !== button && submit.textContent.includes('Đổi mật khẩu'), 'form has its own submit button; sign-out is not it')
  app.dispatch(button, 'click')
  await settle(app, '/', 'after sign-out')
  assert.equal(callsTo(app, 'POST', '/auth/logout').length, 1)
  assert.equal(changeCalls(app).length, 0, 'sign-out must not submit the change-password form')
  assert.ok(app.history.every(p => !p.startsWith('/dang-nhap')), `no visit to /dang-nhap: ${JSON.stringify(app.history)}`)
  await until(() => navLinks(app).some(([label]) => label === 'Đăng nhập'), 'header shows Đăng nhập')
  await app.router.navigate('/thue')
  await settle(app, '/dang-nhap?next=%2Fthue', 'guard after sign-out')
  await app.stop()
})

test('Q7-A: double click on "Đăng xuất" sends one logout; the button is disabled right after the first click', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenantMust', delay: 40 })
  await until(() => buttonByText(app, 'Đăng xuất'), 'sign-out button')
  const button = buttonByText(app, 'Đăng xuất')
  app.dispatch(button, 'click')
  await Promise.resolve() // lets React commit; a real second click is a separate task
  assert.ok(button.hasAttribute('disabled'), 'button must be disabled while signing out')
  app.dispatch(button, 'click')
  await settle(app, '/', 'after sign-out')
  assert.equal(callsTo(app, 'POST', '/auth/logout').length, 1)
  await app.stop()
})

test('Q7-A: "Đăng xuất" is also shown to a tenant who is not forced to change (page reachable, always has the button)', async () => {
  const app = await mount('/doi-mat-khau', { session: 'tenant' })
  await until(() => buttonByText(app, 'Đăng xuất'), 'sign-out button')
  assert.ok(!app.text().includes('Bạn cần đổi mật khẩu trước khi tiếp tục'))
  await app.stop()
})

// ---------- AUTH-07 forgot password (no token) ----------
const forgotExtra = (path, body) => path === '/auth/forgot-password' && /^0[0-9]{9}$/.test(body.phone) ? { status: 200, body: { data: null } } : undefined
const SENT = 'Nếu số điện thoại có email, chúng tôi đã gửi link đặt lại mật khẩu. Nếu không, hãy liên hệ quản lý.'
async function sendForgot(app, phone) {
  await until(() => app.form.form(), 'forgot form')
  app.type(app.form.phone(), phone)
  submitForm(app)
}

test('AUTH-07: /quen-mat-khau: title, one phone field, submit posts { phone }, the form is replaced by the exact sentence + Boss contact', async () => {
  const app = await mount('/quen-mat-khau', { extra: forgotExtra })
  await until(() => app.form.form(), 'form')
  assert.ok(find(app.container, n => /^H[1-3]$/.test(n.tagName)).some(n => n.textContent.trim() === 'Quên mật khẩu'))
  assert.ok(inputByLabel(app, 'Số điện thoại'))
  assert.equal(find(app.container, n => n.tagName === 'INPUT').length, 1)
  assert.equal(app.form.submitButton().textContent.trim(), 'Gửi')
  await sendForgot(app, '0900000004')
  await until(() => statusBlocks(app).includes(SENT), 'sentence')
  assert.deepEqual(forgotCalls(app).map(c => c.body), [{ phone: '0900000004' }])
  assert.equal(app.form.form(), undefined, 'form is gone')
  assert.deepEqual(statusBlocks(app), [SENT])
  await until(() => app.text().includes('Điện thoại: 0900000001'), 'Boss contact')
  await app.stop()
})

test('AUTH-07: any other valid phone gets the identical sentence and page (no account enumeration)', async () => {
  const pages = []
  for (const phone of ['0900000004', '0912345678']) {
    const app = await mount('/quen-mat-khau', { extra: forgotExtra })
    await sendForgot(app, phone)
    await until(() => statusBlocks(app).includes(SENT), `sentence for ${phone}`)
    await until(() => app.text().includes('Điện thoại: 0900000001'), 'contact')
    pages.push(app.text())
    await app.stop()
  }
  assert.equal(pages[0], pages[1])
})

test('AUTH-07/G-04: malformed phone (9 digits, 11 digits, letters, empty) shows "Số điện thoại không hợp lệ" under the field and never calls the API', async () => {
  for (const bad of ['090000000', '09000000044', '09000a0004', '']) {
    const app = await mount('/quen-mat-khau', { extra: forgotExtra })
    await sendForgot(app, bad)
    await until(() => fieldErrorOf(app, 'Số điện thoại'), `error for ${JSON.stringify(bad)}`)
    assert.equal(fieldErrorOf(app, 'Số điện thoại'), 'Số điện thoại không hợp lệ')
    await wait(60)
    assert.equal(forgotCalls(app).length, 0, JSON.stringify(bad))
    assert.deepEqual(statusBlocks(app), [])
    await app.stop()
  }
})

test('UI-05: forgot-password API 500 keeps the form and shows the API message in the alert block (no success sentence)', async () => {
  const app = await mount('/quen-mat-khau', { extra: (path) => path === '/auth/forgot-password' ? err(500, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : undefined })
  await sendForgot(app, '0900000004')
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.deepEqual(app.form.alerts(), ['Có lỗi xảy ra, vui lòng thử lại sau'])
  assert.ok(app.form.form())
  assert.deepEqual(statusBlocks(app), [])
  await app.stop()
})

test('UI-09: forgot submit button is disabled with spinner "Đang gửi" in flight; one request', async () => {
  const app = await mount('/quen-mat-khau', { extra: forgotExtra, delay: 60 })
  await sendForgot(app, '0900000004')
  await until(() => app.form.submitButton()?.hasAttribute('disabled'), 'button disabled')
  assert.ok(find(app.container, n => n.attributes.role === 'status' && n.textContent.trim() === 'Đang gửi').length > 0)
  await until(() => statusBlocks(app).includes(SENT), 'sentence')
  assert.equal(forgotCalls(app).length, 1)
  await app.stop()
})

test('AUTH-07/A10: a signed-in user can still open /quen-mat-khau (no redirect)', async () => {
  const app = await mount('/quen-mat-khau', { session: 'manager' })
  await until(() => app.form.form(), 'form')
  await wait(100)
  assert.equal(app.path(), '/quen-mat-khau')
  await app.stop()
})

// ---------- AUTH-07 reset password (?token=) ----------
const resetExtra = (path, body) => {
  if (path !== '/auth/reset-password') return undefined
  if (body.token !== 'hople') return err(400, 'VALIDATION_FAILED', VALIDATION, { token: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' })
  return { status: 200, body: { data: null } }
}
async function fillReset(app, { next = NEW_PW, confirm = next } = {}) {
  await until(() => app.form.form(), 'reset form')
  app.type(inputByLabel(app, 'Mật khẩu mới'), next)
  app.type(inputByLabel(app, 'Nhập lại mật khẩu mới'), confirm)
  submitForm(app)
}
const linkByText = (app, label) => find(app.container, n => n.tagName === 'A' && n.textContent.trim() === label)[0]

test('AUTH-07: /quen-mat-khau?token=hople: two password fields (no phone field), title and button "Đặt lại mật khẩu"; submit posts exactly { token, newPassword } and lands on /dang-nhap with the notice', async () => {
  const app = await mount('/quen-mat-khau?token=hople', { extra: resetExtra })
  await until(() => app.form.form(), 'form')
  assert.ok(find(app.container, n => /^H[1-3]$/.test(n.tagName)).some(n => n.textContent.trim() === 'Đặt lại mật khẩu'))
  assert.equal(app.form.submitButton().textContent.trim(), 'Đặt lại mật khẩu')
  assert.deepEqual(find(app.container, n => n.tagName === 'INPUT').map(n => n.type), ['password', 'password'])
  assert.ok(inputByLabel(app, 'Mật khẩu mới') && inputByLabel(app, 'Nhập lại mật khẩu mới'))
  await fillReset(app)
  await settle(app, '/dang-nhap', 'after reset')
  assert.deepEqual(resetCalls(app).map(c => c.body), [{ token: 'hople', newPassword: NEW_PW }])
  assert.equal(forgotCalls(app).length, 0)
  await until(() => statusBlocks(app).includes('Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.'), 'notice on the login page')
  await app.stop()
})

test('AUTH-03/AUTH-07: reset password 7 characters -> "Mật khẩu tối thiểu 8 ký tự", no request; 8 characters is sent; mismatch -> "Mật khẩu nhập lại không khớp"', async () => {
  const app = await mount('/quen-mat-khau?token=hople', { extra: resetExtra })
  await fillReset(app, { next: '1234567' })
  await until(() => fieldErrorOf(app, 'Mật khẩu mới'), 'error')
  assert.equal(fieldErrorOf(app, 'Mật khẩu mới'), 'Mật khẩu tối thiểu 8 ký tự')
  await wait(60)
  assert.equal(resetCalls(app).length, 0)
  app.type(inputByLabel(app, 'Mật khẩu mới'), '12345678')
  app.type(inputByLabel(app, 'Nhập lại mật khẩu mới'), '12345679')
  submitForm(app)
  await until(() => fieldErrorOf(app, 'Nhập lại mật khẩu mới'), 'mismatch')
  assert.equal(fieldErrorOf(app, 'Nhập lại mật khẩu mới'), 'Mật khẩu nhập lại không khớp')
  assert.equal(resetCalls(app).length, 0)
  app.type(inputByLabel(app, 'Nhập lại mật khẩu mới'), '12345678')
  submitForm(app)
  await until(() => resetCalls(app).length === 1, '8-char request')
  assert.equal(resetCalls(app)[0].body.newPassword, '12345678')
  await app.stop()
})

test('AUTH-07: invalid token -> alert shows exactly the API sentence, link "Gửi lại liên kết" -> /quen-mat-khau (opens the phone form); no link leaves the app inside <main>', async () => {
  const app = await mount('/quen-mat-khau?token=sai', { extra: resetExtra })
  await fillReset(app)
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.deepEqual(app.form.alerts(), ['Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn'])
  const link = linkByText(app, 'Gửi lại liên kết')
  assert.ok(link, 'resend link')
  assert.equal(link.attributes.href, '/quen-mat-khau')
  assert.equal(app.path(), '/quen-mat-khau?token=sai')
  const main = find(app.container, n => n.tagName === 'MAIN')[0]
  assert.deepEqual(find(main, n => n.tagName === 'A').map(a => a.attributes.href).filter(h => !h.startsWith('/')), [], 'no external link on the token page')
  app.dispatch(link, 'click')
  await settle(app, '/quen-mat-khau', 'resend link')
  await until(() => app.form.phone(), 'phone form')
  await app.stop()
})

test('AUTH-07: before any failure the token page shows no "Gửi lại liên kết" link', async () => {
  const app = await mount('/quen-mat-khau?token=sai', { extra: resetExtra })
  await until(() => app.form.form(), 'form')
  assert.equal(linkByText(app, 'Gửi lại liên kết'), undefined)
  await app.stop()
})

// Decision (b) of the coder; PLAN section "Trang" says: Lỗi link (`fields.token`) -> FormError + link.
test('CP-5 decision (b): "Gửi lại liên kết" appears only when the error has fields.token; a newPassword field error or a 500 shows no link', async () => {
  const cases = [
    ['fields.newPassword', err(400, 'VALIDATION_FAILED', VALIDATION, { newPassword: 'Mật khẩu tối thiểu 8 ký tự' })],
    ['500', err(500, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau')],
  ]
  for (const [label, response] of cases) {
    const app = await mount('/quen-mat-khau?token=hople', { extra: path => path === '/auth/reset-password' ? response : undefined })
    await fillReset(app)
    await until(() => app.form.alerts().length > 0, `FormError (${label})`)
    assert.equal(linkByText(app, 'Gửi lại liên kết'), undefined, label)
    assert.equal(app.path(), '/quen-mat-khau?token=hople', label)
    await app.stop()
  }
})

test('CP-5 decision (b): after a bad-token error, a later failure without fields.token hides the link again', async () => {
  let n = 0
  const app = await mount('/quen-mat-khau?token=sai', { extra: path => path === '/auth/reset-password' ? (++n === 1 ? err(400, 'VALIDATION_FAILED', VALIDATION, { token: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' }) : err(500, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau')) : undefined })
  await fillReset(app)
  await until(() => linkByText(app, 'Gửi lại liên kết'), 'link after the first failure')
  submitForm(app)
  await until(() => resetCalls(app).length === 2 && app.form.alerts().length > 0 && !linkByText(app, 'Gửi lại liên kết'), 'second error shown and link hidden') // wait for the second response: the form clears the alert while it is in flight
  assert.deepEqual(app.form.alerts(), ['Có lỗi xảy ra, vui lòng thử lại sau'])
  await app.stop()
})

test('UI-09: reset submit button is disabled with spinner "Đang lưu" in flight; one request', async () => {
  const app = await mount('/quen-mat-khau?token=hople', { extra: resetExtra, delay: 60 })
  await fillReset(app)
  await until(() => app.form.submitButton()?.hasAttribute('disabled'), 'button disabled')
  assert.ok(find(app.container, n => n.attributes.role === 'status' && n.textContent.trim() === 'Đang lưu').length > 0)
  await settle(app, '/dang-nhap', 'after reset')
  assert.equal(resetCalls(app).length, 1)
  await app.stop()
})

test('AUTH-07: an empty ?token= value is treated as no token (phone form)', async () => {
  const app = await mount('/quen-mat-khau?token=', { extra: forgotExtra })
  await until(() => app.form.form(), 'form')
  assert.ok(app.form.phone(), 'phone field shown')
  await app.stop()
})

// ====================================================================================================
// CP-6: /thue/tai-khoan and /ql/tai-khoan (AUTH-09). Same real modules; fetch is the only fake (outside edge).
// ====================================================================================================
const patchCalls = app => callsTo(app, 'PATCH', '/auth/me')
const forms = app => find(app.container, n => n.tagName === 'FORM')
const submitProfile = app => app.dispatch(forms(app)[1], 'submit') // forms()[0] = change password, [1] = profile
const typeInto = async (app, label, value) => { app.type(inputByLabel(app, label), value); await wait(40) }
const labelTexts = app => find(app.container, n => n.tagName === 'LABEL').map(n => n.textContent)
const headingTexts = app => find(app.container, n => /^H[1-6]$/.test(n.tagName)).map(n => n.textContent.trim())
const hasLink = (app, label) => find(app.container, n => n.tagName === 'A' && n.textContent.trim() === label).length > 0
const spinnerNamed = (app, name) => find(app.container, n => n.attributes.role === 'status' && n.textContent.trim() === name).length > 0
const FORBIDDEN_TEXT = 'Bạn không có quyền thực hiện thao tác này'
const TAKEN = 'Email đã được sử dụng'
const staffMe = (more = {}) => ({ ...ME.manager, ...more })
const tenantMe = (more = {}) => ({ ...ME.tenant, ...more })
const openForms = async app => { await until(() => forms(app).length === 2, 'both forms of the account page') }

// Mock of PATCH /auth/me and POST /auth/change-password (outside edge). `patch` can override the answer of one PATCH.
function accountExtra(me, { patch } = {}) {
  return (path, body, cfg) => {
    if (path === '/auth/change-password') {
      if (body.currentPassword !== 'matkhau123') return err(400, 'VALIDATION_FAILED', VALIDATION, { currentPassword: 'Mật khẩu hiện tại không đúng' })
      return { status: 200, body: { data: null } }
    }
    if (path !== '/auth/me') return undefined
    cfg.meOverride ??= me
    if (body === undefined) return undefined // GET: answered by the base mock from cfg.meOverride
    const custom = patch?.(body, cfg)
    if (custom) return custom
    if (cfg.meOverride.role === 'TENANT' && Object.keys(body).some(k => k !== 'email')) return err(403, 'FORBIDDEN', FORBIDDEN_TEXT)
    if (body.email === 'trung@example.com') return err(400, 'VALIDATION_FAILED', VALIDATION, { email: TAKEN })
    cfg.meOverride = { ...cfg.meOverride, ...body }
    return { status: 200, body: { data: cfg.meOverride } }
  }
}

// ---------- tenant page ----------
test('AUTH-09: /thue/tai-khoan shows the title, the blocks "Đổi mật khẩu" and "Email", the Email field and none of the staff contact fields or the preview', async () => {
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(tenantMe()) })
  await openForms(app)
  assert.equal(app.path(), '/thue/tai-khoan')
  const headings = headingTexts(app)
  for (const h of ['Tài khoản', 'Đổi mật khẩu', 'Email']) assert.ok(headings.includes(h), `heading "${h}" in ${JSON.stringify(headings)}`)
  assert.ok(!headings.includes('Thông tin liên hệ'), 'tenant has no "Thông tin liên hệ" block')
  const labels = labelTexts(app)
  for (const l of ['Mật khẩu hiện tại', 'Mật khẩu mới', 'Nhập lại mật khẩu mới', 'Email']) assert.ok(labels.includes(l), `label "${l}" in ${JSON.stringify(labels)}`)
  for (const l of ['Số điện thoại liên hệ', 'Zalo', 'Facebook']) assert.ok(!labels.includes(l), `tenant must not see "${l}"`)
  assert.ok(!app.text().includes('Khách sẽ thấy'), 'no preview for a tenant')
  assert.ok(!app.text().includes('Chưa có thông tin liên hệ'))
  await app.stop()
})

test('AUTH-09/A16: tenant saves an email -> PATCH /auth/me with exactly { email }, Bearer token, then GET /auth/me, "Đã lưu." and the page stays open', async () => {
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(tenantMe()) })
  await openForms(app)
  assert.deepEqual(statusBlocks(app), [], 'no notice before saving')
  await typeInto(app, 'Email', 'an@example.com')
  submitProfile(app)
  await until(() => statusBlocks(app).includes('Đã lưu.'), '"Đã lưu."')
  assert.deepEqual(patchCalls(app).map(c => c.body), [{ email: 'an@example.com' }])
  assert.equal(patchCalls(app)[0].headers.Authorization, 'Bearer tok-0')
  assert.equal(patchCalls(app)[0].credentials, 'include')
  const order = app.api.calls.map(c => `${c.method} ${c.url}`)
  assert.ok(order.lastIndexOf('GET /api/v1/auth/me') > order.indexOf('PATCH /api/v1/auth/me'), `me re-read after the save: ${order}`)
  await wait(150)
  assert.equal(app.path(), '/thue/tai-khoan', `stayed on the page; history ${JSON.stringify(app.history)}`)
  assert.equal(inputByLabel(app, 'Email').value, 'an@example.com', 'the field keeps the saved value')
  assert.equal(app.form.alerts().length, 0)
  await app.stop()
})

test('AUTH-09/A8: tenant field is pre-filled from the account; clearing it and saving sends { email: null }; blank-only text also sends null', async () => {
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(tenantMe({ email: 'cu@example.com' })) })
  await openForms(app)
  assert.equal(inputByLabel(app, 'Email').value, 'cu@example.com')
  await typeInto(app, 'Email', '')
  submitProfile(app)
  await until(() => patchCalls(app).length === 1, 'first PATCH')
  assert.deepEqual(patchCalls(app)[0].body, { email: null })
  await until(() => statusBlocks(app).includes('Đã lưu.'), '"Đã lưu."')
  await typeInto(app, 'Email', '    ')
  submitProfile(app)
  await until(() => patchCalls(app).length === 2, 'second PATCH')
  assert.deepEqual(patchCalls(app)[1].body, { email: null }, 'spaces only is empty after trim')
  await app.stop()
})

test('AUTH-09/trim: surrounding spaces of the email are trimmed before sending', async () => {
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(tenantMe()) })
  await openForms(app)
  await typeInto(app, 'Email', '   an@example.com  ')
  submitProfile(app)
  await until(() => patchCalls(app).length === 1, 'PATCH')
  assert.deepEqual(patchCalls(app)[0].body, { email: 'an@example.com' })
  await app.stop()
})

test('AUTH-09: a tenant never sends contact keys, even when the account record carries contact values', async () => {
  const me = tenantMe({ contactPhone: '0900000009', zaloUrl: 'https://zalo.me/x', facebookUrl: 'https://facebook.com/x' })
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(me) })
  await openForms(app)
  await typeInto(app, 'Email', 'an@example.com')
  submitProfile(app)
  await until(() => patchCalls(app).length === 1, 'PATCH')
  assert.deepEqual(Object.keys(patchCalls(app)[0].body), ['email'])
  await app.stop()
})

test('AUTH-09/G-03: invalid email "abc" and a 256-character email show "Email không hợp lệ" under the field and send nothing; 255 characters is sent', async () => {
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(tenantMe()) })
  await openForms(app)
  await typeInto(app, 'Email', 'abc')
  submitProfile(app)
  await until(() => fieldErrorOf(app, 'Email'), 'field error')
  assert.equal(fieldErrorOf(app, 'Email'), 'Email không hợp lệ')
  await typeInto(app, 'Email', `${'a'.repeat(244)}@example.com`) // 256
  submitProfile(app)
  await wait(120)
  assert.equal(fieldErrorOf(app, 'Email'), 'Email không hợp lệ')
  assert.equal(patchCalls(app).length, 0, 'invalid input must not reach the API')
  assert.ok(!statusBlocks(app).includes('Đã lưu.'))
  const ok255 = `${'a'.repeat(243)}@example.com`
  assert.equal(ok255.length, 255)
  await typeInto(app, 'Email', ok255)
  submitProfile(app)
  await until(() => patchCalls(app).length === 1, 'PATCH for 255')
  assert.equal(patchCalls(app)[0].body.email, ok255)
  await app.stop()
})

test('UI-05: API 400 fields.email "Email đã được sử dụng" appears under "Email" and the API message in the role="alert" block; no "Đã lưu."', async () => {
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(tenantMe()) })
  await openForms(app)
  await typeInto(app, 'Email', 'trung@example.com')
  submitProfile(app)
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.equal(fieldErrorOf(app, 'Email'), TAKEN)
  assert.deepEqual(app.form.alerts(), [VALIDATION])
  assert.ok(!statusBlocks(app).includes('Đã lưu.'))
  assert.equal(app.path(), '/thue/tai-khoan')
  await app.stop()
})

test('AUTH-09 permission: a 403 FORBIDDEN (forced by the mock) shows its message in the alert block, no field error, no "Đã lưu."', async () => {
  const forbidden = () => err(403, 'FORBIDDEN', FORBIDDEN_TEXT)
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(tenantMe(), { patch: forbidden }) })
  await openForms(app)
  await typeInto(app, 'Email', 'an@example.com')
  submitProfile(app)
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.deepEqual(app.form.alerts(), [FORBIDDEN_TEXT])
  assert.equal(fieldErrorOf(app, 'Email'), undefined)
  assert.ok(!statusBlocks(app).includes('Đã lưu.'))
  await app.stop()
})

test('AUTH-09: "Đã lưu." disappears when a later save fails', async () => {
  let n = 0
  const secondFails = () => (++n === 2 ? err(500, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : undefined)
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(tenantMe(), { patch: secondFails }) })
  await openForms(app)
  await typeInto(app, 'Email', 'an@example.com')
  submitProfile(app)
  await until(() => statusBlocks(app).includes('Đã lưu.'), '"Đã lưu."')
  await typeInto(app, 'Email', 'binh@example.com')
  submitProfile(app)
  await until(() => app.form.alerts().length > 0, 'FormError on the 2nd save')
  assert.deepEqual(app.form.alerts(), ['Có lỗi xảy ra, vui lòng thử lại sau'])
  assert.ok(!statusBlocks(app).includes('Đã lưu.'), 'stale success notice must be gone')
  await app.stop()
})

// ---------- staff page ----------
test('AUTH-09: /ql/tai-khoan shows Email, Số điện thoại liên hệ, Zalo, Facebook, the block "Thông tin liên hệ" and "Khách sẽ thấy:" with "Chưa có thông tin liên hệ" when all are empty', async () => {
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe()) })
  await openForms(app)
  const labels = labelTexts(app)
  for (const l of ['Mật khẩu hiện tại', 'Email', 'Số điện thoại liên hệ', 'Zalo', 'Facebook']) assert.ok(labels.includes(l), `label "${l}" in ${JSON.stringify(labels)}`)
  const headings = headingTexts(app)
  for (const h of ['Tài khoản', 'Đổi mật khẩu', 'Thông tin liên hệ']) assert.ok(headings.includes(h), `heading "${h}" in ${JSON.stringify(headings)}`)
  assert.ok(app.text().includes('Khách sẽ thấy:'))
  assert.ok(app.text().includes('Chưa có thông tin liên hệ'))
  assert.ok(!hasLink(app, 'Zalo') && !hasLink(app, 'Facebook'), 'no links when empty')
  await app.stop()
})

test('AUTH-09: the "Khách sẽ thấy:" preview follows the typed values at once (phone as text, Zalo/Facebook as new-tab links) and returns to "Chưa có thông tin liên hệ" when cleared', async () => {
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe()) })
  await openForms(app)
  await typeInto(app, 'Số điện thoại liên hệ', '0900000002')
  assert.ok(app.text().includes('Điện thoại: 0900000002'), app.text())
  assert.ok(!app.text().includes('Chưa có thông tin liên hệ'))
  await typeInto(app, 'Zalo', 'https://zalo.me/0900000002')
  await typeInto(app, 'Facebook', 'https://facebook.com/ha')
  const zalo = find(app.container, n => n.tagName === 'A' && n.textContent.trim() === 'Zalo')[0]
  const fb = find(app.container, n => n.tagName === 'A' && n.textContent.trim() === 'Facebook')[0]
  assert.equal(zalo.attributes.href, 'https://zalo.me/0900000002')
  assert.equal(fb.attributes.href, 'https://facebook.com/ha')
  for (const a of [zalo, fb]) { assert.equal(a.attributes.target, '_blank'); assert.match(a.attributes.rel, /noopener/) }
  assert.equal(patchCalls(app).length, 0, 'typing alone sends nothing')
  for (const l of ['Số điện thoại liên hệ', 'Zalo', 'Facebook']) await typeInto(app, l, '')
  assert.ok(app.text().includes('Chưa có thông tin liên hệ'))
  assert.ok(!app.text().includes('Điện thoại:'))
  assert.ok(!hasLink(app, 'Zalo') && !hasLink(app, 'Facebook'))
  await app.stop()
})

test('A11: a non-https value (http:, javascript:, no scheme) is hidden in the preview, also when it comes from the account record', async () => {
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe({ zaloUrl: 'javascript:alert(1)', facebookUrl: 'http://facebook.com/ha' })) })
  await openForms(app)
  assert.equal(inputByLabel(app, 'Zalo').value, 'javascript:alert(1)', 'the raw value is in the field so the user can fix it')
  assert.ok(!hasLink(app, 'Zalo') && !hasLink(app, 'Facebook'), 'no link built from a non-https value')
  assert.equal(find(app.container, n => n.tagName === 'A' && /^(javascript|http):/.test(n.attributes.href ?? '')).length, 0)
  await typeInto(app, 'Zalo', 'zalo.me/0900000002')
  assert.ok(!hasLink(app, 'Zalo'))
  await typeInto(app, 'Zalo', 'https://zalo.me/0900000002')
  assert.ok(hasLink(app, 'Zalo'), 'https value shows the link')
  assert.ok(!hasLink(app, 'Facebook'), 'the http: Facebook value stays hidden')
  await app.stop()
})

test('AUTH-09/A8: staff save sends all four keys; filled values are trimmed, empty ones are null; the page stays open with "Đã lưu."', async () => {
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe()) })
  await openForms(app)
  await typeInto(app, 'Số điện thoại liên hệ', '0900000002')
  await typeInto(app, 'Zalo', '  https://zalo.me/0900000002  ')
  submitProfile(app)
  await until(() => statusBlocks(app).includes('Đã lưu.'), '"Đã lưu."')
  assert.deepEqual(patchCalls(app).map(c => c.body), [{ email: null, contactPhone: '0900000002', zaloUrl: 'https://zalo.me/0900000002', facebookUrl: null }])
  await wait(100)
  assert.equal(app.path(), '/ql/tai-khoan')
  await typeInto(app, 'Email', 'ha@example.com')
  await typeInto(app, 'Facebook', 'https://facebook.com/ha')
  await typeInto(app, 'Zalo', '')
  submitProfile(app)
  await until(() => patchCalls(app).length === 2, 'second PATCH')
  assert.deepEqual(patchCalls(app)[1].body, { email: 'ha@example.com', contactPhone: '0900000002', zaloUrl: null, facebookUrl: 'https://facebook.com/ha' })
  await app.stop()
})

test('AUTH-09/A8: staff with every field cleared sends { email, contactPhone, zaloUrl, facebookUrl } all null (clears the public contact)', async () => {
  const me = staffMe({ email: 'ha@example.com', contactPhone: '0900000002', zaloUrl: 'https://zalo.me/ha', facebookUrl: 'https://facebook.com/ha' })
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(me) })
  await openForms(app)
  assert.equal(inputByLabel(app, 'Số điện thoại liên hệ').value, '0900000002', 'pre-filled from the account')
  assert.ok(app.text().includes('Điện thoại: 0900000002'), 'preview starts from the saved values')
  for (const l of ['Email', 'Số điện thoại liên hệ', 'Zalo', 'Facebook']) await typeInto(app, l, '')
  submitProfile(app)
  await until(() => statusBlocks(app).includes('Đã lưu.'), '"Đã lưu."')
  assert.deepEqual(patchCalls(app).map(c => c.body), [{ email: null, contactPhone: null, zaloUrl: null, facebookUrl: null }])
  assert.ok(app.text().includes('Chưa có thông tin liên hệ'))
  await app.stop()
})

test('AUTH-09/G-04: staff invalid contact values show their messages under the fields and send nothing', async () => {
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe()) })
  await openForms(app)
  await typeInto(app, 'Số điện thoại liên hệ', '090000000') // 9 digits
  await typeInto(app, 'Zalo', 'zalo.me/x')
  await typeInto(app, 'Facebook', 'http://facebook.com/ha')
  submitProfile(app)
  await until(() => fieldErrorOf(app, 'Zalo'), 'field errors')
  assert.equal(fieldErrorOf(app, 'Số điện thoại liên hệ'), 'Số điện thoại không hợp lệ')
  assert.equal(fieldErrorOf(app, 'Zalo'), 'Đường dẫn không hợp lệ')
  assert.equal(fieldErrorOf(app, 'Facebook'), 'Đường dẫn không hợp lệ')
  await wait(80)
  assert.equal(patchCalls(app).length, 0)
  // 10 digits not starting with 0 and 11 digits are also refused; a phone with spaces never reaches the API unchanged
  for (const bad of ['1900000002', '09000000021']) {
    await typeInto(app, 'Số điện thoại liên hệ', bad)
    await typeInto(app, 'Zalo', '')
    await typeInto(app, 'Facebook', '')
    submitProfile(app)
    await until(() => fieldErrorOf(app, 'Số điện thoại liên hệ') === 'Số điện thoại không hợp lệ', `error for ${bad}`)
  }
  assert.equal(patchCalls(app).length, 0)
  await app.stop()
})

test('AUTH-09/trim: a phone typed with surrounding spaces is either refused or sent without the spaces, never sent with them', async () => {
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe()) })
  await openForms(app)
  await typeInto(app, 'Số điện thoại liên hệ', ' 0900000002 ')
  submitProfile(app)
  await wait(200)
  for (const call of patchCalls(app)) assert.equal(call.body.contactPhone, '0900000002')
  await app.stop()
})

test('UI-05: API 400 fields.contactPhone / zaloUrl are attached under their fields on the staff page', async () => {
  const bad = () => err(400, 'VALIDATION_FAILED', VALIDATION, { contactPhone: 'Số điện thoại không hợp lệ', zaloUrl: 'Đường dẫn không hợp lệ' })
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe(), { patch: bad }) })
  await openForms(app)
  await typeInto(app, 'Số điện thoại liên hệ', '0900000002')
  await typeInto(app, 'Zalo', 'https://zalo.me/x')
  submitProfile(app)
  await until(() => app.form.alerts().length > 0, 'FormError')
  assert.equal(fieldErrorOf(app, 'Số điện thoại liên hệ'), 'Số điện thoại không hợp lệ')
  assert.equal(fieldErrorOf(app, 'Zalo'), 'Đường dẫn không hợp lệ')
  assert.deepEqual(app.form.alerts(), [VALIDATION])
  await app.stop()
})

test('AUTH-09: a boss sees the full staff page on /ql/tai-khoan (no redirect)', async () => {
  const app = await mount('/ql/tai-khoan', { session: 'boss', extra: accountExtra({ ...ME.boss }) })
  await openForms(app)
  assert.equal(app.path(), '/ql/tai-khoan')
  assert.ok(labelTexts(app).includes('Số điện thoại liên hệ'))
  assert.ok(app.text().includes('Khách sẽ thấy:'))
  await app.stop()
})

test('UI-07/UI-08: a 200-character Facebook URL appears in the preview only as the link text "Facebook" (no long text to overflow), every field has a label', async () => {
  const longUrl = `https://facebook.com/${'x'.repeat(179)}`
  assert.equal(longUrl.length, 200)
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe()) })
  await openForms(app)
  await typeInto(app, 'Facebook', longUrl)
  assert.ok(hasLink(app, 'Facebook'))
  assert.ok(!app.text().includes('xxxxxxxxxx'), 'the URL text itself is not printed')
  const inputs = find(app.container, n => n.tagName === 'INPUT')
  assert.equal(inputs.length, 3 + 4, '3 password fields + 4 profile fields')
  for (const input of inputs) {
    assert.ok(find(app.container, n => n.tagName === 'LABEL' && n.attributes.for === input.attributes.id).length === 1, `input ${input.attributes.id} has exactly one label`)
  }
  await app.stop()
})

// ---------- change password on the account page (AUTH-03, afterSuccess="stay") ----------
test('AUTH-03: on the account page a successful change keeps the page, empties the three fields and shows "Đã đổi mật khẩu."', async () => {
  const app = await mount('/thue/tai-khoan', { session: 'tenant', extra: accountExtra(tenantMe()) })
  await openForms(app)
  await typeInto(app, 'Mật khẩu hiện tại', 'matkhau123')
  await typeInto(app, 'Mật khẩu mới', NEW_PW)
  await typeInto(app, 'Nhập lại mật khẩu mới', NEW_PW)
  app.dispatch(forms(app)[0], 'submit')
  await until(() => statusBlocks(app).includes('Đã đổi mật khẩu.'), 'success notice')
  assert.deepEqual(changeCalls(app).map(c => c.body), [{ currentPassword: 'matkhau123', newPassword: NEW_PW }])
  await wait(120)
  assert.equal(app.path(), '/thue/tai-khoan')
  for (const l of ['Mật khẩu hiện tại', 'Mật khẩu mới', 'Nhập lại mật khẩu mới']) assert.equal(inputByLabel(app, l).value, '', `${l} emptied`)
  assert.ok(!statusBlocks(app).includes('Đã lưu.'), 'the profile notice is a different message')
  assert.equal(patchCalls(app).length, 0)
  await app.stop()
})

test('AUTH-03: on the account page 7 characters are refused under "Mật khẩu mới" (nothing sent), 8 characters are sent; wrong current password shows the API text', async () => {
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe()) })
  await openForms(app)
  await typeInto(app, 'Mật khẩu hiện tại', 'matkhau123')
  await typeInto(app, 'Mật khẩu mới', '1234567')
  await typeInto(app, 'Nhập lại mật khẩu mới', '1234567')
  app.dispatch(forms(app)[0], 'submit')
  await until(() => fieldErrorOf(app, 'Mật khẩu mới'), 'field error')
  assert.equal(fieldErrorOf(app, 'Mật khẩu mới'), 'Mật khẩu tối thiểu 8 ký tự')
  await wait(80)
  assert.equal(changeCalls(app).length, 0)
  await typeInto(app, 'Mật khẩu hiện tại', 'sai-roi-nha')
  await typeInto(app, 'Mật khẩu mới', '12345678')
  await typeInto(app, 'Nhập lại mật khẩu mới', '12345678')
  app.dispatch(forms(app)[0], 'submit')
  await until(() => fieldErrorOf(app, 'Mật khẩu hiện tại') === 'Mật khẩu hiện tại không đúng', 'API field error')
  assert.equal(changeCalls(app).length, 1)
  assert.ok(!statusBlocks(app).includes('Đã đổi mật khẩu.'))
  await app.stop()
})

// ---------- UI-09: two independent forms ----------
test('UI-09: while the profile is saving its button is disabled with spinner "Đang lưu" and the password form stays enabled; one PATCH', async () => {
  const app = await mount('/ql/tai-khoan', { session: 'manager', delay: 80, extra: accountExtra(staffMe()) })
  await openForms(app)
  await typeInto(app, 'Số điện thoại liên hệ', '0900000002')
  submitProfile(app)
  const [pwButton, profileButton] = find(app.container, n => n.tagName === 'BUTTON' && n.attributes.type === 'submit')
  await until(() => profileButton.hasAttribute('disabled'), 'profile button disabled')
  assert.ok(profileButton.textContent.includes('Lưu') && !profileButton.textContent.includes('Đổi mật khẩu'))
  assert.ok(spinnerNamed(app, 'Đang lưu'), 'spinner "Đang lưu"')
  assert.ok(pwButton.textContent.includes('Đổi mật khẩu'))
  assert.ok(!pwButton.hasAttribute('disabled'), 'the other form is not locked')
  await until(() => statusBlocks(app).includes('Đã lưu.'), '"Đã lưu."')
  assert.equal(patchCalls(app).length, 1)
  assert.ok(!profileButton.hasAttribute('disabled'))
  await app.stop()
})

// ---------- guards for the two routes ----------
test('AUTH-06: wrong role on the account routes goes to the own home: manager and boss /thue/tai-khoan -> /ql, tenant /ql/tai-khoan -> /thue', async () => {
  for (const [session, from, to] of [['manager', '/thue/tai-khoan', '/ql'], ['boss', '/thue/tai-khoan', '/ql'], ['tenant', '/ql/tai-khoan', '/thue']]) {
    const app = await mount(from, { session })
    await settle(app, to, `${session} ${from}`)
    assert.ok(!app.text().includes('Thông tin liên hệ') || to === '/ql', 'no account page of the other role')
    await app.stop()
  }
})

test('AUTH-06: right role keeps its account URL (tenant /thue/tai-khoan, manager and boss /ql/tai-khoan)', async () => {
  for (const [session, path] of [['tenant', '/thue/tai-khoan'], ['manager', '/ql/tai-khoan'], ['boss', '/ql/tai-khoan']]) {
    const app = await mount(path, { session })
    await until(() => forms(app).length === 2, `account page of ${session}`)
    await settle(app, path, session)
    await app.stop()
  }
})

test('AUTH-06: signed out on the account routes goes to /dang-nhap?next=<encoded path>', async () => {
  for (const path of ['/ql/tai-khoan', '/thue/tai-khoan']) {
    const app = await mount(path)
    await settle(app, `/dang-nhap?next=${encodeURIComponent(path)}`, `signed out ${path}`)
    assert.equal(forms(app).length, 1, 'only the login form is shown')
    await app.stop()
  }
})

test('AUTH-05: a tenant who must change the password is sent from /thue/tai-khoan (and from /ql/tai-khoan) to /doi-mat-khau', async () => {
  for (const path of ['/thue/tai-khoan', '/ql/tai-khoan']) {
    const app = await mount(path, { session: 'tenantMust' })
    await settle(app, '/doi-mat-khau', `tenantMust ${path}`)
    await app.stop()
  }
})

test('Q6-A: boot error on the account routes shows "Không tải được phiên đăng nhập." + "Thử lại", keeps the URL; "Thử lại" then shows the page', async () => {
  for (const [session, path] of [['manager', '/ql/tai-khoan'], ['tenant', '/thue/tai-khoan']]) {
    const app = await mount(path, { session, refreshStatus: 500, extra: accountExtra(session === 'tenant' ? tenantMe() : staffMe()) })
    await until(() => app.form.alerts().length > 0, `error block ${path}`)
    assert.deepEqual(app.form.alerts(), ['Không tải được phiên đăng nhập.'])
    assert.ok(buttonByText(app, 'Thử lại'))
    assert.equal(forms(app).length, 0, 'no account form while the session is unknown')
    await wait(100)
    assert.equal(app.path(), path)
    assert.ok(app.history.every(p => !p.startsWith('/dang-nhap')), JSON.stringify(app.history))
    app.api.cfg.refreshStatus = undefined
    app.dispatch(buttonByText(app, 'Thử lại'), 'click')
    await openForms(app)
    assert.equal(app.path(), path)
    await app.stop()
  }
})

// ---------- AUTH-T2 on the account page ----------
test('AUTH-T2: an expired access token on save -> one refresh, the PATCH is retried once and succeeds', async () => {
  let n = 0
  const firstExpired = () => (++n === 1 ? err(401, 'UNAUTHENTICATED', 'Chưa đăng nhập') : undefined)
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe(), { patch: firstExpired }) })
  await openForms(app)
  const refreshesBefore = callsTo(app, 'POST', '/auth/refresh').length
  await typeInto(app, 'Số điện thoại liên hệ', '0900000002')
  submitProfile(app)
  await until(() => statusBlocks(app).includes('Đã lưu.'), '"Đã lưu." after retry')
  assert.equal(callsTo(app, 'POST', '/auth/refresh').length - refreshesBefore, 1, 'exactly one refresh')
  assert.equal(patchCalls(app).length, 2, 'PATCH sent, then retried once')
  assert.deepEqual(patchCalls(app)[1].body, patchCalls(app)[0].body)
  assert.equal(app.path(), '/ql/tai-khoan')
  await app.stop()
})

test('AUTH-T2/A6: expired token and a refresh that is refused -> signed out, /dang-nhap?next=%2Fql%2Ftai-khoan, no third PATCH', async () => {
  const expired = () => err(401, 'UNAUTHENTICATED', 'Chưa đăng nhập')
  const app = await mount('/ql/tai-khoan', { session: 'manager', extra: accountExtra(staffMe(), { patch: expired }) })
  await openForms(app)
  app.api.cfg.refreshStatus = 401 // the refresh cookie is gone
  await typeInto(app, 'Số điện thoại liên hệ', '0900000002')
  submitProfile(app)
  await settle(app, '/dang-nhap?next=%2Fql%2Ftai-khoan', 'after refused refresh')
  assert.equal(patchCalls(app).length, 1, 'no retry when the refresh failed')
  await app.stop()
})
