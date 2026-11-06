import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

// CP-3 (FE-P2-04): ConfirmDialog and ImageUploader (src/components/{ConfirmDialog,ImageUploader}.tsx), their
// exports (index.ts) and the new ComponentPreview.tsx gallery entries. Spec: PLAN.md CP-3 and "Quyết định kỹ
// thuật CP-3" (A-CP3-1: dialog never blocks Escape/Hủy while pending; Q2: ImageUploader.onDelete never asks
// to confirm). KIT-03/05/07, UI-08, ROOM-07, FILE-01/02.
//
// Real React (react-dom/client) mounts the real, unmodified ConfirmDialog/ImageUploader on a minimal fake DOM
// (Node has none; no jsdom is installed) so that document.activeElement, Tab/Escape keydown bubbling and real
// click/change events are genuinely exercised, not reimplemented. Outside edges faked: the DOM itself, and the
// files/callbacks (onUpload/onDelete/onReorder/onConfirm/onClose) a caller would normally supply. RoomsButton,
// FormFields (Spinner/FormError) are the kit's own peer components, not mocked, loaded unmodified from the main
// kit (this draft does not redefine them) via the same relative-import fallback the preview tooling documents.

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
const mainSrcRoot = resolve(draftRoot, '..', '..', 'src')
const nodeRequire = createRequire(import.meta.url)

// ---------- minimal real DOM ----------
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
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1) }
  setAttribute(k, v) { this.attributes[k] = String(v) }
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
}
const fakeDocument = {
  nodeType: 9, nodeName: '#document', childNodes: [], activeElement: null, listeners: [],
  createElement(tag) { return new FakeElement(tag, fakeDocument) },
  createElementNS(_ns, tag) { return new FakeElement(tag, fakeDocument) },
  createTextNode(text) { return new FakeText(String(text), fakeDocument) },
  addEventListener() {}, removeEventListener() {},
  oninput: null, // React feature-detects 'oninput' in document; without it text changes use a legacy path
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
// Tell React this is a deliberate test harness (silences "not wrapped in act" warnings); act() itself
// below is what actually makes mount/dispatch condition-based instead of time-based.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ---------- TS/TSX module loader ----------
// ConfirmDialog.tsx/ImageUploader.tsx (draft) import './Button' and './FormFields'. This draft does not
// redefine those files, so a relative import missing from the draft falls back to the main kit, the same
// fallback documented for the coder's ref/vite.preview.config.ts.
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
function resolveRelative(dir, id) {
  const candidate = resolve(dir, id)
  for (const ext of ['', '.ts', '.tsx']) if (existsSync(candidate + ext)) return candidate + ext
  const mapped = candidate.replace(draftSrcRoot, mainSrcRoot)
  for (const ext of ['', '.ts', '.tsx']) if (existsSync(mapped + ext)) return mapped + ext
  throw new Error(`cannot resolve ${id} from ${dir}`)
}
function requireFrom(dir, id) {
  if (!id.startsWith('.')) return nodeRequire(id)
  if (id.endsWith('.css')) return {}
  return load(resolveRelative(dir, id))
}
// Entry points (as opposed to relative imports resolved by resolveRelative above) were previously read
// straight from draftSrcRoot with no main fallback at all; that only ever worked because the draft that first
// wrote this file (CP-3) happened to add ConfirmDialog.tsx/ImageUploader.tsx into its own src/components/. A
// draft that does not touch the kit (this one, PLAN.md CP-6, the P2-8a lesson) has neither file in its own
// src/, so every entry point here must fall back to main just like resolveRelative does.
function entryPath(relPath) {
  const draftCandidate = resolve(draftSrcRoot, relPath)
  for (const ext of ['', '.ts', '.tsx']) if (existsSync(draftCandidate + ext)) return draftCandidate + ext
  const mainCandidate = resolve(mainSrcRoot, relPath)
  for (const ext of ['', '.ts', '.tsx']) if (existsSync(mainCandidate + ext)) return mainCandidate + ext
  throw new Error(`cannot resolve entry "${relPath}"`)
}
const { ConfirmDialog } = load(entryPath('components/ConfirmDialog.tsx'))
const { ImageUploader } = load(entryPath('components/ImageUploader.tsx'))

const React = nodeRequire('react')
const { act } = React
const { createRoot } = nodeRequire('react-dom/client')

const walkTree = (node, out = []) => { out.push(node); node.childNodes.forEach(c => walkTree(c, out)); return out }
const find = (root, pred) => walkTree(root).filter(n => n.nodeType === 1 && pred(n))
const buttons = container => find(container, n => n.tagName === 'BUTTON')
const buttonByText = (container, label) => buttons(container).find(b => b.textContent.trim() === label)
const isDisabled = el => el.disabled === true || el.hasAttribute('disabled')

// act() flushes React's render/effect/microtask work before resolving, so callers never guess how long
// a commit or an async onConfirm/onUpload callback needs under CPU contention (no fixed-ms sleeps).
async function dispatch(container, target, type, extra = {}) {
  const rootListeners = container.listeners.filter(l => l.type === type && !l.capture)
  assert.ok(rootListeners.length > 0, `no root listener for ${type}`)
  const event = { type, target, srcElement: target, currentTarget: container, bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...extra }
  await act(async () => { rootListeners.forEach(l => l.listener(event)) })
}

async function mount(Component, initialProps) {
  const container = fakeDocument.createElement('div')
  fakeDocument.body.appendChild(container)
  const root = createRoot(container)
  let currentProps = initialProps
  const render = () => root.render(React.createElement(Component, currentProps))
  await act(async () => { render() })
  return {
    container,
    setProps: async next => { currentProps = { ...currentProps, ...next }; await act(async () => { render() }) },
    stop: async () => { await act(async () => { root.unmount() }) },
  }
}

// ======================================================================================
// ConfirmDialog — KIT-05, UI-08
// ======================================================================================

test('KIT-05/UI-08: opening ConfirmDialog moves focus to the first button (Hủy), not left on the opener', async () => {
  const opener = fakeDocument.createElement('button')
  fakeDocument.body.appendChild(opener)
  opener.focus()
  assert.equal(fakeDocument.activeElement, opener)
  const app = await mount(ConfirmDialog, { open: true, title: 'Khóa phòng 101?', description: 'Còn 2 lịch hẹn chưa xử lý.', confirmLabel: 'Khóa phòng', onConfirm: () => {}, onClose: () => {} })
  const dialogButtons = buttons(app.container)
  assert.equal(dialogButtons.length, 2, 'expected Hủy + Khóa phòng')
  assert.equal(dialogButtons[0].textContent.trim(), 'Hủy')
  assert.equal(fakeDocument.activeElement, dialogButtons[0], 'focus must move inside the dialog on open')
  await app.stop()
})

test('KIT-05: Tab from the last button wraps to the first (Hủy); Shift+Tab from the first wraps to the last', async () => {
  const app = await mount(ConfirmDialog, { open: true, title: 'T', description: 'D', confirmLabel: 'Xác nhận', onConfirm: () => {}, onClose: () => {} })
  const [cancelBtn, confirmBtn] = buttons(app.container)
  confirmBtn.focus()
  await dispatch(app.container, confirmBtn, 'keydown', { key: 'Tab', shiftKey: false })
  assert.equal(fakeDocument.activeElement, cancelBtn, 'Tab from the last (confirm) button wraps to the first (Hủy)')
  await dispatch(app.container, cancelBtn, 'keydown', { key: 'Tab', shiftKey: true })
  assert.equal(fakeDocument.activeElement, confirmBtn, 'Shift+Tab from the first (Hủy) button wraps to the last (confirm)')
  await app.stop()
})

test('KIT-05/A-CP3-1: Escape calls onClose exactly once; once the caller sets open=false, focus returns to the opener', async () => {
  const opener = fakeDocument.createElement('button')
  fakeDocument.body.appendChild(opener)
  opener.focus()
  let closed = 0
  const app = await mount(ConfirmDialog, { open: true, title: 'T', description: 'D', confirmLabel: 'X', onConfirm: () => {}, onClose: () => { closed++ } })
  const cancelBtn = buttons(app.container)[0]
  await dispatch(app.container, cancelBtn, 'keydown', { key: 'Escape' })
  assert.equal(closed, 1)
  await app.setProps({ open: false })
  assert.equal(fakeDocument.activeElement, opener, 'focus returns to whatever opened the dialog')
  await app.stop()
})

test('KIT-05: clicking Hủy calls onClose exactly once; once the caller sets open=false, focus returns to the opener', async () => {
  const opener = fakeDocument.createElement('button')
  fakeDocument.body.appendChild(opener)
  opener.focus()
  let closed = 0
  const app = await mount(ConfirmDialog, { open: true, title: 'T', description: 'D', confirmLabel: 'X', cancelLabel: 'Hủy', onConfirm: () => {}, onClose: () => { closed++ } })
  const cancelBtn = buttons(app.container)[0]
  await dispatch(app.container, cancelBtn, 'click')
  assert.equal(closed, 1)
  await app.setProps({ open: false })
  assert.equal(fakeDocument.activeElement, opener)
  await app.stop()
})

test('KIT-03: clicking "Xác nhận" calls onConfirm once; while pending (aria-disabled, not disabled) extra clicks never call onConfirm again', async () => {
  let calls = 0
  const app = await mount(ConfirmDialog, { open: true, title: 'T', description: 'D', confirmLabel: 'Khóa phòng', pending: false, onConfirm: () => { calls++ }, onClose: () => {} })
  const confirmBtn = () => buttons(app.container)[1]
  assert.equal(confirmBtn().getAttribute('aria-disabled'), null, 'not pending yet: no aria-disabled')
  await dispatch(app.container, confirmBtn(), 'click')
  assert.equal(calls, 1)
  await app.setProps({ pending: true }) // caller flips pending while the request is in flight
  assert.equal(confirmBtn().getAttribute('aria-disabled'), 'true', 'pending uses aria-disabled, so it stays focusable/reachable')
  assert.ok(!isDisabled(confirmBtn()), 'the confirm button must not become a real disabled button while pending (KIT-05 keyboard access)')
  await dispatch(app.container, confirmBtn(), 'click')
  await dispatch(app.container, confirmBtn(), 'click')
  assert.equal(calls, 1, 'extra clicks while pending must not call onConfirm again')
  await app.stop()
})

// ======================================================================================
// ImageUploader — ROOM-07, FILE-01/02, KIT-07, UI-08
// ======================================================================================

function fileInput(container) { return find(container, n => n.tagName === 'INPUT').find(n => n.type === 'file' || n.getAttribute('type') === 'file') }
function addButton(container) { return buttonByText(container, 'Thêm ảnh') }
const baseProps = (extra = {}) => ({ images: [], maxImages: 10, maxBytes: 5_000_000, accept: 'image/jpeg,image/png,image/webp', onUpload: async () => {}, onDelete: async () => {}, ...extra })

test('ROOM-07: a file of exactly maxBytes (5_000_000) with an allowed MIME type is accepted and onUpload is called with it', async () => {
  const uploaded = []
  const app = await mount(ImageUploader, baseProps({ onUpload: async file => { uploaded.push(file) } }))
  const input = fileInput(app.container)
  assert.ok(input, 'hidden file input not found')
  const file = { type: 'image/jpeg', size: 5_000_000, name: 'a.jpg' }
  input.files = [file]
  await dispatch(app.container, input, 'change', { target: input })
  assert.deepEqual(uploaded, [file])
  await app.stop()
})

test('ROOM-07/Q-FE8A-1: a file of 5_000_001 byte (maxBytes+1) is rejected before onUpload is ever called', async () => {
  const uploaded = []
  const app = await mount(ImageUploader, baseProps({ onUpload: async file => { uploaded.push(file) } }))
  const input = fileInput(app.container)
  const file = { type: 'image/jpeg', size: 5_000_001, name: 'a.jpg' }
  input.files = [file]
  await dispatch(app.container, input, 'change', { target: input })
  assert.equal(uploaded.length, 0, 'onUpload must never run for an oversized file')
  assert.ok(app.container.textContent.includes('vượt quá'), 'an explanatory error must be shown')
  await app.stop()
})

test('FILE-01/FILE-02: a file whose MIME type is outside accept is rejected before onUpload is ever called', async () => {
  const uploaded = []
  const app = await mount(ImageUploader, baseProps({ onUpload: async file => { uploaded.push(file) } }))
  const input = fileInput(app.container)
  const file = { type: 'application/pdf', size: 1000, name: 'a.pdf' }
  input.files = [file]
  await dispatch(app.container, input, 'change', { target: input })
  assert.equal(uploaded.length, 0, 'onUpload must never run for a disallowed MIME type')
  assert.ok(app.container.textContent.includes('định dạng'), 'an explanatory error must be shown')
  await app.stop()
})

test('KIT-07: maxImages locks the "Thêm ảnh" button once images.length reaches it (0/1/9 enabled, 10/11 locked for maxImages=10)', async () => {
  const imagesOf = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, url: '/x.jpg', alt: `Ảnh ${i + 1}` }))
  for (const [count, expectDisabled] of [[0, false], [1, false], [9, false], [10, true], [11, true]]) {
    const app = await mount(ImageUploader, baseProps({ images: imagesOf(count) }))
    assert.equal(isDisabled(addButton(app.container)), expectDisabled, `images.length=${count}, maxImages=10`)
    await app.stop()
  }
})

test('KIT-07: an image with alt="" shows the fallback "Ảnh N" (1-based); a non-empty alt is kept as-is', async () => {
  const app = await mount(ImageUploader, baseProps({ images: [{ id: 1, url: '/a.jpg', alt: '' }, { id: 2, url: '/b.jpg', alt: 'Phòng nhìn từ cửa' }] }))
  const imgs = find(app.container, n => n.tagName === 'IMG')
  assert.equal(imgs.length, 2)
  assert.equal(imgs[0].getAttribute('alt'), 'Ảnh 1')
  assert.equal(imgs[1].getAttribute('alt'), 'Phòng nhìn từ cửa')
  await app.stop()
})

test('KIT-07: "Lên"/"Xuống" reordering controls render only when onReorder is passed, and move items by swapping ids', async () => {
  const images = [{ id: 1, url: '/a.jpg', alt: 'A' }, { id: 2, url: '/b.jpg', alt: 'B' }, { id: 3, url: '/c.jpg', alt: 'C' }]
  const withoutReorder = await mount(ImageUploader, baseProps({ images }))
  assert.equal(buttonByText(withoutReorder.container, 'Lên'), undefined, 'no "Lên" button without onReorder')
  assert.equal(buttonByText(withoutReorder.container, 'Xuống'), undefined, 'no "Xuống" button without onReorder')
  await withoutReorder.stop()

  const calls = []
  const app = await mount(ImageUploader, baseProps({ images, onReorder: async ids => { calls.push(ids) } }))
  const upButtons = buttons(app.container).filter(b => b.textContent.trim() === 'Lên')
  const downButtons = buttons(app.container).filter(b => b.textContent.trim() === 'Xuống')
  assert.equal(upButtons.length, 3)
  assert.equal(downButtons.length, 3)
  assert.ok(isDisabled(upButtons[0]), 'the first item cannot move further up')
  assert.ok(isDisabled(downButtons[2]), 'the last item cannot move further down')
  await dispatch(app.container, downButtons[0], 'click')
  assert.deepEqual(calls, [[2, 1, 3]], 'moving the first item down swaps it with the second (by id)')
  await app.stop()
})

test('KIT-07/Q2: onDelete runs directly on "Xóa", no confirm dialog is rendered by ImageUploader itself', async () => {
  const deleted = []
  const app = await mount(ImageUploader, baseProps({ images: [{ id: 7, url: '/a.jpg', alt: 'A' }], onDelete: async id => { deleted.push(id) } }))
  assert.equal(find(app.container, n => n.attributes.role === 'dialog').length, 0, 'ImageUploader must not render its own confirm dialog')
  const deleteBtn = buttonByText(app.container, 'Xóa')
  assert.ok(deleteBtn)
  await dispatch(app.container, deleteBtn, 'click')
  assert.deepEqual(deleted, [7])
  await app.stop()
})

// ======================================================================================
// Static checks: kit stays props-only, exports and the preview gallery entries (no browser needed)
// ======================================================================================

test('KIT-03/KIT-07: ConfirmDialog and ImageUploader import nothing from features/ or shared/api, and never call fetch', () => {
  for (const file of ['ConfirmDialog.tsx', 'ImageUploader.tsx']) {
    const src = readFileSync(entryPath(`components/${file}`), 'utf8')
    assert.ok(!/from ['"][^'"]*features/.test(src), `${file} must not import a feature module`)
    assert.ok(!/from ['"][^'"]*shared\/api/.test(src), `${file} must not import the API client`)
    assert.ok(!src.includes('fetch('), `${file} must not call fetch`)
  }
})

test('KIT-07: index.ts exports ConfirmDialog/ImageUploader and their prop types', () => {
  const src = readFileSync(entryPath('components/index.ts'), 'utf8')
  for (const needle of ['export { ConfirmDialog }', 'export type { ConfirmDialogProps }', 'export { ImageUploader }', 'export type { ImageUploaderProps }']) {
    assert.ok(src.includes(needle), `index.ts missing: ${needle}`)
  }
})

test('CP-3: ComponentPreview.tsx has a new gallery sample rendering <ConfirmDialog> and one rendering <ImageUploader>', () => {
  const src = readFileSync(entryPath('pages/ComponentPreview.tsx'), 'utf8')
  assert.ok(/id="dialog"/.test(src), 'missing a "dialog" sample section')
  assert.ok(/<ConfirmDialog/.test(src), 'ComponentPreview must render <ConfirmDialog>')
  assert.ok(/id="uploader"/.test(src), 'missing an "uploader" sample section')
  assert.ok(/<ImageUploader/.test(src), 'ComponentPreview must render <ImageUploader>')
})
