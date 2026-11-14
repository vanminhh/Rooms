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

async function boot(user, lang = 'vi') {
  return mount(h(AuthContext.Provider, { value: { status: 'ready', user } },
    h(I18nProvider, { locale: lang }, h(MemoryRouter, { initialEntries: ['/'] },
      h(Location), h(Routes, null,
        h(Route, { path: '/', element: h(EntryScreen) }),
        h(Route, { path: '/thue', element: h(RequireAuth, { allow: ['TENANT'] }) }),
        h(Route, { path: '/ql', element: h(RequireAuth, { allow: ['MANAGER', 'BOSS'] }) }),
        h(Route, { path: '*', element: h('p', null, 'Destination') }),
      )))))
}

// UI-11 and AUTH-06 supply the destinations; SCOPE-05 forbids account mutations.
for (const [label, user, expected] of [
  ['Tìm phòng', null, '/'],
  ['Tôi đang thuê', null, '/dang-nhap?next=%2Fthue'],
  ['Quản lý tòa nhà', null, '/dang-nhap?next=%2Fql'],
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
      ['Find a room', 'I am a tenant', 'Building management'])
  } finally { await app.stop() }
})
