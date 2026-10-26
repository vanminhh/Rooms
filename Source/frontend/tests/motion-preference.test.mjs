import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

test('motion preference subscribes to live changes and removes the listener on unmount', () => {
  const source = readFileSync(new URL('../src/components/useReducedMotion.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  let listener, unsubscribe, snapshot, current
  const media = {
    matches: false,
    addEventListener(type, callback) { assert.equal(type, 'change'); listener = callback },
    removeEventListener(type, callback) { assert.equal(type, 'change'); assert.equal(callback, listener); listener = undefined },
  }
  const react = { useSyncExternalStore(subscribe, read, serverRead) {
    snapshot = read
    assert.equal(serverRead(), true, 'server output must not require animation')
    unsubscribe = subscribe(() => { current = read() })
    return read()
  } }
  const exports = {}
  Function('require', 'exports', 'window', code)(() => react, exports, { matchMedia: () => media })
  current = exports.useReducedMotion()
  assert.equal(current, false)
  media.matches = true; listener()
  assert.equal(current, true)
  media.matches = false; listener()
  assert.equal(snapshot(), false)
  assert.equal(current, false)
  unsubscribe()
  assert.equal(listener, undefined)
})
