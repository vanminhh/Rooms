import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { mount, loadModule, draftFirst, find, dispatch, until, fakeFetch } from '../p2/public-dom.mjs'

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })
const require = createRequire(import.meta.url)
const React = require('react')
const { MemoryRouter, Routes, Route, useLocation } = require('react-router')
const mod = path => loadModule(draftFirst(`src/${path}`))
const { EntryScreen } = mod('features/public/EntryScreen.tsx')
const { RequireAuth } = mod('app/RequireAuth.tsx')
const { AuthContext } = mod('app/auth-context.ts')
const { I18nProvider } = mod('shared/i18n/index.ts')
const h = React.createElement

function Location() {
  const l = useLocation()
  return h('p', { 'data-location': true }, l.pathname + l.search)
}

function EntryHarness({ videoSrc }) {
  const [open, setOpen] = React.useState(true)
  return open ? h(EntryScreen, { onChoose: () => setOpen(false), videoSrc }) : h('p', null, 'Home')
}

async function boot(user, lang = 'vi', videoSrc) {
  return mount(h(AuthContext.Provider, { value: { status: 'ready', user } },
    h(I18nProvider, { locale: lang }, h(MemoryRouter, { initialEntries: ['/'] },
      h(Location), h(Routes, null,
        h(Route, { path: '/', element: h(EntryHarness, { videoSrc }) }),
        h(Route, { path: '/thue', element: h(RequireAuth, { allow: ['TENANT'] }) }),
        h(Route, { path: '/ql', element: h(RequireAuth, { allow: ['MANAGER', 'BOSS'] }) }),
        h(Route, { path: '*', element: h('p', null, 'Destination') }),
      )))))
}

// UI-11 and AUTH-06 supply the destinations; SCOPE-05 forbids account mutations.
for (const [label, user, expected] of [
  ['Tìm phòng', null, '/'],
  ['Tôi đang thuê', null, '/dang-nhap?loi-vao=thue&next=%2Fthue'],
  ['Quản lý tòa nhà', null, '/dang-nhap?loi-vao=quan-ly&next=%2Fql'],
  ['Tôi đang thuê', { role: 'TENANT', mustChangePassword: false }, '/thue'],
  ['Quản lý tòa nhà', { role: 'MANAGER', mustChangePassword: false }, '/ql'],
  ['Quản lý tòa nhà', { role: 'BOSS', mustChangePassword: false }, '/ql'],
  ['Quản lý tòa nhà', { role: 'GUEST', mustChangePassword: false }, '/toi'],
  ['Tôi đang thuê', { role: 'GUEST', mustChangePassword: false }, '/toi'],
]) {
  test(`UI-11, AUTH-06, SCOPE-05: ${user?.role ?? 'visitor'} chooses ${label} -> ${expected}`, async () => {
    const calls = fakeFetch([])
    const app = await boot(user)
    try {
      const button = find(app.container, n => n.tagName === 'BUTTON' && n.textContent === label)[0]
      assert.ok(button)
      dispatch(app.container, button, 'click')
      await until(() => find(app.container, n => n.attributes['data-location'])[0]?.textContent === expected
        && find(app.container, n => n.attributes.role === 'dialog').length === 0, 'choice destination')
      assert.deepEqual(calls, [])
    } finally { await app.stop() }
  })
}

test('UI-11, LOC-01: English entry choices come from the dictionary', async () => {
  const app = await boot(null, 'en')
  try {
    assert.deepEqual(find(app.container, n => n.tagName === 'BUTTON').map(n => n.textContent),
      ['Find a room', 'I am a tenant', 'Building management', 'Tiếng Việt', 'English'])
  } finally { await app.stop() }
})


test('UI-11, KIT-05: initial focus and Tab stay inside the choices; still image is always present', async () => {
  const app = await boot(null)
  try {
    const buttons = find(app.container, n => n.tagName === 'BUTTON')
    assert.equal(document.activeElement, buttons[0])
    dispatch(app.container, buttons[0], 'keydown', { key: 'Tab', shiftKey: true })
    assert.equal(document.activeElement, buttons.at(-1))
    dispatch(app.container, buttons.at(-1), 'keydown', { key: 'Tab' })
    assert.equal(document.activeElement, buttons[0])
    assert.equal(find(app.container, n => n.tagName === 'IMG').length, 1)
    assert.equal(find(app.container, n => n.tagName === 'VIDEO').length, 0)
  } finally { await app.stop() }
})

test('UI-11, KIT-05: a failed optional video leaves the still image', async () => {
  const app = await boot(null, 'vi', '/test-entry.webm')
  try {
    const video = find(app.container, n => n.tagName === 'VIDEO')[0]
    assert.ok(video)
    // Media errors do not bubble; React attaches this listener to the video itself.
    dispatch(video, video, 'error')
    await until(() => find(app.container, n => n.tagName === 'VIDEO').length === 0, 'failed video removed')
    assert.equal(find(app.container, n => n.tagName === 'IMG').length, 1)
  } finally { await app.stop() }
})

test('UI-11, KIT-05: reduced motion does not load even an available video', async () => {
  const previous = window.matchMedia
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  const app = await boot(null, 'vi', '/test-entry.webm')
  try {
    assert.equal(find(app.container, n => n.tagName === 'VIDEO').length, 0)
    assert.equal(find(app.container, n => n.tagName === 'IMG').length, 1)
  } finally { await app.stop(); window.matchMedia = previous }
})
