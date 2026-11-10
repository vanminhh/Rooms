import assert from 'node:assert/strict'
import test from 'node:test'
import { handleInternalLinkClick, scrollToHash } from '../../src/layouts/internal-links.ts'

// Outside edges faked: document.getElementById, window.matchMedia and the click event; timers are mocked.
function setup({ reduceMotion = false, appearAfter = 0 } = {}) {
  const scrolls = []
  const lookups = []
  const element = { scrollIntoView: options => scrolls.push(options) }
  globalThis.document = {
    getElementById: id => {
      lookups.push(id)
      return lookups.length > appearAfter ? element : null
    },
  }
  globalThis.window = { matchMedia: () => ({ matches: reduceMotion }) }
  return { scrolls, lookups }
}

function click(href, navigated) {
  const anchor = { hasAttribute: () => false, getAttribute: name => (name === 'href' ? href : null) }
  handleInternalLinkClick({
    defaultPrevented: false, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    target: { closest: () => anchor },
    currentTarget: { contains: () => true },
    preventDefault() {},
  }, to => navigated.push(to))
}

const tickSteps = (t, steps) => { for (let i = 0; i < steps; i++) t.mock.timers.tick(50) }

test.afterEach(() => {
  delete globalThis.document
  delete globalThis.window
  delete globalThis.ResizeObserver
})

// A fake ResizeObserver and window listeners, so the 8 s re-align window can be driven by hand.
function withResizeObserver() {
  const observers = []
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.observed = []; this.disconnected = false; observers.push(this) }
    observe(target) { this.observed.push(target); this.callback([]) }
    disconnect() { this.disconnected = true }
  }
  const listeners = new Map()
  Object.assign(globalThis.window, {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type) },
  })
  globalThis.document.body = { id: 'body' }
  return { observers, listeners }
}

test('UI-40: when the page grows after the scroll, the target is re-aligned instantly', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { scrolls } = setup()
  const { observers } = withResizeObserver()
  scrollToHash('#khu-vuc')
  t.mock.timers.tick(50)
  assert.deepEqual(scrolls, [{ behavior: 'smooth', block: 'start' }], 'the callback fired on observe is skipped')
  assert.deepEqual(observers[0].observed, [{ id: 'body' }])
  observers[0].callback([])
  assert.deepEqual(scrolls.at(-1), { behavior: 'auto', block: 'start' })
  t.mock.timers.tick(7900)
  observers[0].callback([])
  assert.equal(scrolls.length, 3, 'still re-aligning just before 8 s')
  t.mock.timers.tick(100)
  assert.equal(observers[0].disconnected, true)
})

test('UI-40: the user scrolling by wheel, touch, key or pointer stops the re-align at once', t => {
  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    setup()
    const { observers, listeners } = withResizeObserver()
    scrollToHash('#khu-vuc')
    t.mock.timers.tick(50)
    listeners.get(type)()
    assert.equal(observers[0].disconnected, true, type)
    assert.equal(listeners.size, 0, type)
    t.mock.timers.reset()
  }
})

test('UI-40/UI-01: "Khu vực" navigates to /#khu-vuc and then scrolls the section into view', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { scrolls, lookups } = setup()
  const navigated = []
  click('/#khu-vuc', navigated)
  assert.deepEqual(navigated, ['/#khu-vuc'])
  t.mock.timers.tick(50)
  assert.deepEqual(lookups, ['khu-vuc'])
  assert.deepEqual(scrolls, [{ behavior: 'smooth', block: 'start' }])
})

test('UI-40/UI-01: "Liên hệ" waits for the footer to render after navigating from another page', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { scrolls, lookups } = setup({ appearAfter: 3 })
  click('/#lien-he', [])
  tickSteps(t, 3)
  assert.equal(scrolls.length, 0)
  t.mock.timers.tick(50)
  assert.deepEqual(lookups, ['lien-he', 'lien-he', 'lien-he', 'lien-he'])
  assert.equal(scrolls.length, 1)
})

test('UI-40/KIT-05: with reduced motion the jump is instant', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { scrolls } = setup({ reduceMotion: true })
  scrollToHash('#khu-vuc')
  t.mock.timers.tick(50)
  assert.deepEqual(scrolls, [{ behavior: 'auto', block: 'start' }])
})

test('UI-40: a missing target stops after about one second instead of polling forever', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { scrolls, lookups } = setup({ appearAfter: Infinity })
  scrollToHash('#khong-co')
  tickSteps(t, 30)
  assert.equal(lookups.length, 21)
  assert.equal(scrolls.length, 0)
})

test('UI-40: links without a hash only navigate', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { lookups } = setup()
  const navigated = []
  click('/phong', navigated)
  t.mock.timers.tick(1000)
  assert.deepEqual(navigated, ['/phong'])
  assert.deepEqual(lookups, [])
})
