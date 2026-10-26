import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

// Execute the real component with a controllable GPU loader to reproduce async races.
const source = readFileSync(new URL('../src/components/ImageJourney.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const flush = () => new Promise(resolve => setImmediate(resolve))
const slides = [{ image: '/photo.png', depth: '/depth.webp', title: 'Phòng', eyebrow: 'Rooms', description: 'Mẫu' }]

function harness({ near = true } = {}) {
  let effect, refIndex = 0, stateIndex = 0, canvas, cleanup, lastClassName
  const refs = [], states = [], scenes = [], observers = []
  const root = { getBoundingClientRect: () => ({ top: near ? 0 : 3000, bottom: near ? 1000 : 4000, height: 1000 }), addEventListener() {}, removeEventListener() {} }
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this) }
    observe() { this.callback([{ isIntersecting: near }]) }
    disconnect() { this.disconnected = true }
  }
  const createCanvas = (className) => {
    const classes = new Set(className.split(' ').filter(Boolean))
    const listeners = new Map()
    return { clientHeight: 500, setClassName(value) { classes.clear(); value.split(' ').filter(Boolean).forEach(name => classes.add(name)) }, classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), loseContext: () => listeners.get('webglcontextlost')?.() }
  }
  const react = {
    useRef: initial => { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }) },
    useState: initial => {
      const index = stateIndex++
      if (!(index in states)) states[index] = initial
      return [states[index], value => { states[index] = value }]
    },
    useEffect: fn => { effect = fn },
  }
  const jsx = (type, props) => ({ type, props })
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'motion/react': { useReducedMotion: () => false }, './useReducedMotion': { useReducedMotion: () => false },
    './journey-frame': { getJourneyFrame: () => ({ from: 0, mix: 0 }) },
    './depth-scene': { createDepthScene: () => {
      let resolve
      const ready = new Promise(done => { resolve = done })
      const scene = { ready, resolve, update() {}, setActive() {}, setPointer() {}, disposed: false, dispose() { this.disposed = true } }
      scenes.push(scene)
      return scene
    } },
  }
  const exports = {}
  const browserWindow = { innerHeight: 800, addEventListener() {}, removeEventListener() {}, IntersectionObserver: Observer }
  Function('require', 'exports', 'window', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', compiled)(id => modules[id], exports, browserWindow, Observer, callback => { callback(); return 1 }, () => {})
  const findCanvas = node => {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'canvas') return node
    const children = [].concat(node.props?.children ?? [])
    return children.map(findCanvas).find(Boolean)
  }
  return {
    scenes,
    observers,
    approach() { near = true; observers.forEach(observer => observer.callback([{ isIntersecting: true }])) },
    get canvas() { return canvas },
    render(data) {
      refIndex = 0; stateIndex = 0
      const tree = exports.ImageJourney({ slides: data })
      const canvasNode = findCanvas(tree)
      const className = canvasNode?.props.className ?? ''
      if (!canvasNode) { canvas = null; lastClassName = undefined }
      else {
        if (!canvas) canvas = createCanvas(className)
        else if (className !== lastClassName) canvas.setClassName(className)
        lastClassName = className
      }
      refs[0].current = canvas ? root : null
      refs[1].current = canvas
    },
    startEffect() { cleanup = effect() },
    stopEffect() { cleanup?.() },
  }
}

test('context loss during image loading cannot uncover a disposed canvas', async () => {
  const app = harness()
  app.render(slides); app.startEffect(); await flush()
  app.canvas.loseContext()
  assert.equal(app.scenes[0].disposed, true)
  app.scenes[0].resolve(); await flush(); app.render(slides)
  assert.equal(app.canvas.classList.contains('is-ready'), false)
  app.stopEffect()
})

test('offscreen journey postpones WebGL until near the viewport and releases its observer', async () => {
  const app = harness({ near: false })
  app.render(slides); app.startEffect(); await flush()
  assert.equal(app.scenes.length, 0)
  app.approach(); await flush()
  assert.equal(app.scenes.length, 1)
  app.approach(); await flush()
  assert.equal(app.scenes.length, 1)
  app.stopEffect()
  assert.equal(app.observers.every(observer => observer.disconnected), true)
})

test('replacing an empty journey creates a hidden canvas until its own images are ready', async () => {
  const app = harness()
  app.render(slides); app.startEffect(); await flush()
  app.scenes[0].resolve(); await flush(); app.render(slides)
  app.stopEffect(); app.render([]); app.startEffect(); app.stopEffect()
  app.render([...slides])
  assert.equal(app.canvas.classList.contains('is-ready'), false)
  app.startEffect(); await flush()
  app.scenes[1].resolve(); await flush(); app.render(slides)
  assert.equal(app.canvas.classList.contains('is-ready'), true)
  app.stopEffect()
})
