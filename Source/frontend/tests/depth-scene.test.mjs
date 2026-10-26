import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { getJourneyFrame } from '../src/components/journey-frame.ts'

const code = ts.transpileModule(readFileSync(new URL('../src/components/depth-scene.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

test('WebGL suspends its frame loop offscreen, in hidden tabs, and after disposal', async () => {
  let renderer
  const listeners = new Map()
  const resources = []
  class Resource {
    constructor() { resources.push(this); this.disposed = false }
    dispose() { this.disposed = true }
  }
  class Vector { set() { return this } add() { return this } lerp() { return this } }
  class Renderer extends Resource {
    constructor() { super(); renderer = this; this.loop = null }
    setPixelRatio() {} setSize() {} render() {}
    setAnimationLoop(callback) { this.loop = callback }
  }
  class Loader {
    load(url, done) {
      const texture = new Resource()
      texture.image = { width: 1200, height: 800 }
      queueMicrotask(() => done(texture))
      return texture
    }
  }
  const three = { WebGLRenderer: Renderer, TextureLoader: Loader, Vector2: Vector, PlaneGeometry: Resource, ShaderMaterial: Resource, Mesh: class {}, Scene: class { add() {} }, Camera: class {} }
  const browserDocument = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const exports = {}
  Function('require', 'exports', 'window', 'document', 'ResizeObserver', code)(id => id === 'three' ? three : { getJourneyFrame }, exports, { devicePixelRatio: 1 }, browserDocument, class { observe() {} disconnect() {} })
  const scene = exports.createDepthScene({ clientWidth: 800, clientHeight: 600 }, [{ image: 'photo', depth: 'map' }])
  await scene.ready
  assert.equal(renderer.loop, null, 'must start paused until the caller marks the scene visible')
  scene.setActive(true)
  assert.equal(typeof renderer.loop, 'function')
  scene.setActive(false)
  assert.equal(renderer.loop, null)
  scene.setActive(true)
  browserDocument.hidden = true
  listeners.get('visibilitychange')?.()
  assert.equal(renderer.loop, null)
  browserDocument.hidden = false
  listeners.get('visibilitychange')?.()
  assert.equal(typeof renderer.loop, 'function')
  scene.dispose()
  assert.equal(renderer.loop, null)
  assert.equal(listeners.size, 0)
  assert.ok(resources.every(resource => resource.disposed))
})
