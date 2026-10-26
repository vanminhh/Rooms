import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function component(name, media = () => ({ matches: false })) {
  const source = readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const states = []
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  const modules = {
    react: { useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'motion/react': { AnimatePresence: 'presence', motion: { blockquote: 'blockquote' } },
    './useReducedMotion': { useReducedMotion: () => false },
  }
  const exports = {}
  Function('require', 'exports', 'matchMedia', code)(id => modules[id], exports, media)
  return props => { cursor = 0; return Object.values(exports)[0](props) }
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  return [].concat(node.props?.children ?? []).flat().map(child => find(child, predicate)).find(Boolean)
}

test('magnetic buttons ignore coarse pointers and preserve caller events', () => {
  let fine = false, reduced = false, moves = 0, leaves = 0, focuses = 0
  const render = component('Button', query => ({ matches: query.includes('reduced-motion') ? reduced : fine }))
  const writes = []
  const style = { setProperty(name, value) { writes.push([name, value]) }, removeProperty() { writes.length = 0 } }
  Object.defineProperty(style, 'transform', { set(value) { if (value) writes.push(['transform', value]); else writes.length = 0 } })
  const element = { style, matches: () => false, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 50 }) }
  const props = { onPointerMove: () => moves++, onPointerLeave: () => leaves++, onFocus: () => focuses++, children: 'Rooms' }
  let button = render(props)
  const pointer = type => ({ pointerType: type, buttons: 0, clientX: 80, clientY: 40, currentTarget: element })
  button.props.onPointerMove(pointer('mouse'))
  assert.equal(writes.length, 0, 'coarse/no-hover devices must not move the button')
  fine = true
  button.props.onPointerMove(pointer('touch'))
  assert.equal(writes.length, 0, 'touch must not simulate mouse decoration')
  reduced = true
  button.props.onPointerMove(pointer('mouse'))
  assert.equal(writes.length, 0, 'reduced motion must stay still')
  reduced = false
  button.props.onPointerMove(pointer('mouse'))
  assert.ok(writes.length > 0, 'fine mouse retains the An Lâm magnetic effect')
  button.props.onFocus({ currentTarget: element })
  assert.equal(writes.length, 0, 'focus must clear stale pointer offset')
  button.props.onPointerMove(pointer('mouse'))
  button.props.onPointerLeave({ currentTarget: element })
  assert.equal(writes.length, 0)
  assert.equal(moves, 5)
  assert.equal(leaves, 1)
  assert.equal(focuses, 1)
  button = render({ ...props, disabled: true })
  button.props.onPointerMove(pointer('mouse'))
  assert.equal(writes.length, 0, 'disabled buttons never move')
  button = render({ ...props, magnetic: false, style: { transform: 'rotate(2deg)' } })
  button.props.onPointerMove(pointer('mouse'))
  button.props.onPointerLeave({ currentTarget: element })
  assert.equal(writes.at(-1)[1], 'rotate(2deg)', 'caller styles survive pointer cleanup')
})

test('quote selection is immediate for keyboard and does not lose rapid next presses', () => {
  const render = component('QuoteCarousel')
  const quotes = [1, 2, 3].map(number => ({ quote: `Nội dung ${number}`, author: 'Rooms' }))
  const next = tree => find(tree, node => node.props?.['aria-label'] === 'Chia sẻ tiếp theo')
  const selected = tree => find(tree, node => node.props?.['aria-current'])?.props['aria-label']
  let tree = render({ quotes })
  next(tree).props.onClick({ detail: 0 })
  tree = render({ quotes })
  assert.equal(selected(tree), 'Chia sẻ 2')
  assert.equal(tree.props['data-motion'], 'instant', 'keyboard changes must not enter an animation queue')
  const advance = next(tree).props.onClick
  advance({ detail: 1 })
  advance({ detail: 1 })
  tree = render({ quotes })
  assert.equal(selected(tree), 'Chia sẻ 1', 'both rapid actions must be applied')
  assert.equal(tree.props['data-motion'], 'pointer')
  tree = render({ quotes: quotes.slice(0, 1) })
  assert.equal(next(tree), undefined, 'single quote needs no navigation controls')
  tree = render({ quotes: [] })
  assert.equal(tree.props.children, 'Chưa có nội dung để hiển thị.')
})
