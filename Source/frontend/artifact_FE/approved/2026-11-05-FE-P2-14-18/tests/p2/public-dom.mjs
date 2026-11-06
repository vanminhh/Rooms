// Shared harness for the public-site tests (CP-2..CP-6): a minimal fake DOM (Node has none, no jsdom is
// installed), DOM query/event helpers and a fake `fetch`, all in the same shape as tests/p2/cp7-rooms.test.mjs
// and tests/auth-login-flow.test.mjs. Only these two outside edges are faked; every module under test (pages,
// features/public/*, the kit) runs unmodified via `loadModule` from draft-root.mjs, which this file re-exports
// so a test only needs one import. Installs its fakes on `globalThis` as soon as it is imported.
import assert from 'node:assert/strict'
export { draftRoot, mainRoot, draftFirst, loadModule } from '../draft-root.mjs'

// ---------- minimal fake DOM ----------
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
  // Real `Node.isConnected`: true once the node's root ancestor is the document (here: reaches
  // <html>, which the fake document never parents further — see fakeDocument setup below). react-hook-form's
  // register() ref callback relies on this (`Te = e => ee(e) && e.isConnected`) to decide which previously
  // registered <input> refs in a same-name radio/checkbox group are still mounted before appending a new one
  // (`l.refs = [...i.filter(Te), n, ...]`); without it every ref looks disconnected and each new radio in the
  // group wipes out the ones registered before it, leaving only the last one in `_f.refs`.
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument?.documentElement }
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
  get options() { return this.tagName === 'SELECT' ? this.childNodes.filter(n => n.tagName === 'OPTION') : undefined } // react-dom reads select.options on mount
  // HTML attribute names are case-insensitive and a real `setAttribute` stores/reads them lower-cased (e.g.
  // React's `tabIndex`/`autoComplete` JSX props become the `tabindex`/`autocomplete` attributes); mirror that
  // so getAttribute(lowercase) finds what React set regardless of the case React itself used.
  setAttribute(k, v) { const key = String(k).toLowerCase(); this.attributes[key] = String(v); if (key === 'name') this._name = String(v) }
  getAttribute(k) { const key = String(k).toLowerCase(); return key in this.attributes ? this.attributes[key] : null }
  hasAttribute(k) { return String(k).toLowerCase() in this.attributes }
  removeAttribute(k) { delete this.attributes[String(k).toLowerCase()] }
  addEventListener(type, listener, options) { this.listeners.push({ type, listener, capture: options === true || options?.capture === true }) }
  removeEventListener(type, listener) { this.listeners = this.listeners.filter(l => !(l.type === type && l.listener === listener)) }
  focus() { fakeDocument.activeElement = this }
  blur() { if (fakeDocument.activeElement === this) fakeDocument.activeElement = fakeDocument.body }
  matches() { return false }
  closest(selector) {
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (selector === 'a[href]' && n.tagName === 'A' && 'href' in n.attributes) return n
    return null
  }
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
  // react-dom sets <option value="..."> via setAttribute (not the property) — see react-dom-client's setProp
  // "option" case — then later reads it back as a *property* in updateOptions() to pick the selected one. A
  // real browser's option.value IDL getter falls back to the 'value' content attribute (and from there to the
  // text content) exactly for this reason; mirror that here so selection matching works the same way.
  get value() { return this.tagName === 'OPTION' && 'value' in this.attributes ? this.attributes.value : this._value }
  set value(v) { this._value = v == null ? '' : String(v) }
  get valueAsNumber() { return this._value === '' ? NaN : Number(this._value) }
  set valueAsNumber(v) { this._value = Number.isNaN(v) ? '' : String(v) }
  // A real single-select <option>.selected=true setter deselects every sibling option as a side effect
  // (enforced by the browser engine, not by React); react-dom's updateOptions() relies on that and only ever
  // sets `selected = true` on the new match, never `= false` on the old one. Without this, once locations load
  // and a second <option> is added, both the just-matched option and the earlier placeholder-match option
  // stay "selected" at once.
  get selected() { return this._selected ?? false }
  set selected(v) {
    this._selected = !!v
    if (v && this.tagName === 'OPTION' && this.parentNode?.tagName === 'SELECT') {
      for (const sib of this.parentNode.childNodes) if (sib !== this && sib.tagName === 'OPTION') sib._selected = false
    }
  }
  // A real <input type=radio> setter enforces single-select within its same-`name` group (the browser engine's
  // job, same reasoning as <option>.selected above): checking one radio unchecks its named siblings. RHF's
  // onChange handler for a radio group (`oe(e.refs).value` picking the one ref with `.checked`) assumes exactly
  // one ref is checked at a time, same as a real form.
  get checked() { return this._checked ?? false }
  set checked(v) {
    this._checked = !!v
    if (v && this.tagName === 'INPUT' && this.type === 'radio' && this.name) {
      const walk = n => { n.childNodes.forEach(c => { if (c.nodeType === 1) { if (c !== this && c.tagName === 'INPUT' && c.type === 'radio' && c.name === this.name) c._checked = false; walk(c) } }) }
      walk(this.ownerDocument?.documentElement ?? this)
    }
  }
  get disabled() { return this._disabled ?? false }
  set disabled(v) { this._disabled = !!v }
}
export const fakeDocument = {
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
fakeDocument.activeElement = fakeDocument.body
fakeDocument.defaultView = null
class FakeIFrame {}
export const fakeWindow = {
  document: fakeDocument, event: undefined, HTMLIFrameElement: FakeIFrame, HTMLElement: FakeElement, Element: FakeElement, Node: FakeNode,
  addEventListener() {}, removeEventListener() {},
  location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '', hash: '' },
  history: { state: null, pushState() {}, replaceState() {}, scrollRestoration: 'auto' },
  getComputedStyle: () => ({}), matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
}
fakeDocument.defaultView = fakeWindow
Object.assign(globalThis, { window: fakeWindow, document: fakeDocument, HTMLElement: FakeElement, Element: FakeElement, Node: FakeNode, HTMLIFrameElement: FakeIFrame })

// ---------- DOM query / event helpers (same style as cp7-rooms.test.mjs / auth-login-flow.test.mjs) ----------
export const wait = ms => new Promise(r => setTimeout(r, ms))

export async function until(cond, what, ms = 3000) {
  const start = Date.now()
  while (Date.now() - start < ms) { if (cond()) return; await wait(5) }
  throw new Error(`timeout waiting for ${what}`)
}

export function walkTree(node, out = []) { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
export function find(root, pred) { return walkTree(root).filter(n => n.nodeType === 1 && pred(n)) }
export const byName = (container, name) => find(container, n => ['INPUT', 'SELECT', 'TEXTAREA'].includes(n.tagName) && n.name === name)[0]
export const buttons = container => find(container, n => n.tagName === 'BUTTON')
export const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
export const alerts = container => find(container, n => n.attributes.role === 'alert').map(n => n.textContent)
export const isDisabled = el => el?.disabled === true || el?.hasAttribute('disabled')

export function dispatch(container, target, type, extra = {}) {
  const rootListeners = container.listeners.filter(l => l.type === type && !l.capture)
  assert.ok(rootListeners.length > 0, `no root listener for ${type}`)
  const event = { type, target, srcElement: target, currentTarget: container, bubbles: true, cancelable: true, defaultPrevented: false, button: 0, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...extra }
  rootListeners.forEach(l => l.listener(event))
}

const nativeValueSetter = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'value').set
const nativeCheckedSetter = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'checked').set

export function fill(container, el, value) {
  nativeValueSetter.call(el, String(value))
  dispatch(container, el, 'input', { target: el })
}
export function check(container, el, value) {
  nativeCheckedSetter.call(el, value)
  dispatch(container, el, 'click', { target: el })
}

export async function mount(element) {
  const { createRoot } = (await import('react-dom/client'))
  const container = fakeDocument.createElement('div')
  fakeDocument.body.appendChild(container)
  const root = createRoot(container)
  root.render(element)
  await wait(30)
  return { container, rerender: async next => { root.render(next); await wait(30) }, stop: async () => { root.unmount(); await wait(10) } }
}

// ---------- fake fetch (outside edge): routes by URL prefix under /api/v1 ----------
export const json = (status, body) => ({ status, body })
export const ok = (data, meta) => json(200, { data, ...(meta ? { meta } : {}) })
export const fail = (status, code, message, fields) => json(status, { error: { code, message, ...(fields ? { fields } : {}) } })
export const pageMeta = (data, limit = 20, page = 1) => ({ page, limit, total: data.length })

export function fakeFetch(rules) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const call = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body }
    calls.push(call)
    const rule = rules.find(r => call.url.startsWith(`/api/v1${r.prefix}`) && (!r.method || r.method === call.method))
    const result = rule ? await rule.handler(call) : fail(404, 'NOT_FOUND', 'Không tìm thấy')
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } })
  }
  return calls
}
export const queryOf = url => new URL(url, 'http://x').searchParams

// ---------- fake FormData (outside edge) ----------
// Node's built-in FormData (undici) only implements the no-argument constructor; the HTML-spec
// `new FormData(form)` overload that reads a form's controls needs a real HTMLFormElement, which this fake DOM
// is not. RoomSearch (src/components/RoomSearch.tsx, kit, out of scope for this PLAN) submits natively with
// `new FormData(event.currentTarget)`, so without this shim every `dispatch(..., 'submit')` on it throws
// asynchronously (React's dev-mode guarded callback defers the error past the synchronous dispatch) and kills
// the test process. This walks the form's descendant INPUT/SELECT/TEXTAREA controls the same way a browser
// does (skips disabled fields and unchecked checkboxes/radios) and reuses the native class for `.get`/`.append`.
const NativeFormData = globalThis.FormData
class FakeFormData extends NativeFormData {
  constructor(form) {
    super()
    if (form?.tagName === 'FORM') {
      for (const el of walkTree(form)) {
        if (el.nodeType !== 1 || !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) continue
        const name = el.name
        if (!name || el.disabled) continue
        if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) { if (el.checked) this.append(name, el.value); continue }
        this.append(name, el.value)
      }
    }
  }
}
globalThis.FormData = FakeFormData
