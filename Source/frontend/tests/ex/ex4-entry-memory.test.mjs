import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { mount, loadModule, draftFirst, find, dispatch, until, fakeFetch, ok } from '../p2/public-dom.mjs'

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })
const require = createRequire(import.meta.url)
const React = require('react')
const h = React.createElement
const { MemoryRouter, Routes, Route, useLocation } = require('react-router')
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
const mod = path => loadModule(draftFirst(`src/${path}`))
const { PublicLayout } = mod('layouts/PublicLayout.tsx')
const { AuthContext } = mod('app/auth-context.ts')
const store = new Map()
function storage() {
  store.clear()
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
}
const dialogs = app => find(app.container, n => n.attributes.role === 'dialog')
const button = (app, label) => find(app.container, n => n.tagName === 'BUTTON' && n.textContent === label)[0]
function Page() { return h('p', { 'data-path': true }, useLocation().pathname) }
async function boot(path = '/') {
  fakeFetch([{ prefix: '/public/contact', handler: () => ok(null) }])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const app = await mount(h(QueryClientProvider, { client },
    h(AuthContext.Provider, { value: { status: 'ready', user: null } },
      h(MemoryRouter, { initialEntries: [path] }, h(Routes, null,
        h(Route, { element: h(PublicLayout) }, h(Route, { path: '*', element: h(Page) })))))))
  return { ...app, stop: async () => { await app.stop(); client.clear() } }
}

test('UI-11: first home visit shows choices, the next visit remembers, Choose again reopens', async () => {
  storage()
  let app = await boot()
  try {
    assert.equal(dialogs(app).length, 1)
    dispatch(app.container, button(app, 'Tìm phòng'), 'click')
    await until(() => dialogs(app).length === 0, 'close')
  } finally { await app.stop() }
  app = await boot()
  try {
    assert.equal(dialogs(app).length, 0)
    dispatch(app.container, button(app, 'Chọn lại'), 'click')
    await until(() => dialogs(app).length === 1, 'reopen')
  } finally { await app.stop() }
})

for (const path of ['/phong/12', '/dang-nhap', '/quen-mat-khau?token=example']) {
  test(`UI-11: direct ${path} never opens the entry overlay; explicit Choose again goes home`, async () => {
    storage()
    const app = await boot(path)
    try {
      assert.equal(dialogs(app).length, 0)
      dispatch(app.container, button(app, 'Chọn lại'), 'click')
      await until(() => dialogs(app).length === 1, 'home choices')
      assert.equal(find(app.container, n => n.attributes['data-path'])[0].textContent, '/')
    } finally { await app.stop() }
  })
}

test('UI-11: blocked storage still renders and allows a choice', async () => {
  globalThis.localStorage = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }
  const app = await boot()
  try {
    assert.equal(dialogs(app).length, 1)
    dispatch(app.container, button(app, 'Tìm phòng'), 'click')
    await until(() => dialogs(app).length === 0, 'close with blocked storage')
  } finally { await app.stop(); storage() }
})

test('UI-11: invalid storage is ignored and each valid choice is remembered', () => {
  storage()
  const { readEntryChoice, saveEntryChoice } = mod('features/public/entry-choice.ts')
  store.set('rooms.entryChoice', 'https://example.com')
  assert.equal(readEntryChoice(), null)
  for (const choice of ['/', '/thue', '/ql']) {
    saveEntryChoice(choice)
    assert.equal(readEntryChoice(), choice)
  }
})
