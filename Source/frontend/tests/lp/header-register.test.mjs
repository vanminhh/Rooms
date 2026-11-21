import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { mount, loadModule, draftFirst, find, dispatch, until, fakeFetch, ok } from '../p2/public-dom.mjs'

// UI-11 (owner 21/11/2026): the corner button of the public header offers "Đăng ký" to a visitor who chose "Tìm phòng";
// the sign-up page's "Đã có tài khoản? Đăng nhập" leads back to the entry screen ("Bạn muốn làm gì?").
// Outside edges faked: fetch, localStorage, the fake DOM. PublicLayout, RegisterPage, EntryScreen, react-router and the kit run unmodified.

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })
const require = createRequire(import.meta.url)
const React = require('react')
const h = React.createElement
const { MemoryRouter, Routes, Route, useLocation } = require('react-router')
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
const mod = path => loadModule(draftFirst(`src/${path}`))
const { PublicLayout } = mod('layouts/PublicLayout.tsx')
const { RegisterPage } = mod('pages/public/RegisterPage.tsx')
const { AuthContext } = mod('app/auth-context.ts')

const store = new Map()
globalThis.window.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} }
const storage = (initial) => {
  store.clear()
  if (initial) store.set('rooms.entryChoice', initial)
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
}
const dialogs = app => find(app.container, n => n.attributes.role === 'dialog')
const button = (app, label) => find(app.container, n => n.tagName === 'BUTTON' && n.textContent === label)[0]
const anchors = (app, label) => find(app.container, n => n.tagName === 'A' && n.textContent.trim() === label)
const Where = () => h('p', { 'data-path': true }, useLocation().pathname)

async function boot(path, user = null) {
  fakeFetch([{ prefix: '/public/contact', handler: () => ok(null) }])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const app = await mount(h(QueryClientProvider, { client },
    h(AuthContext.Provider, { value: { status: 'ready', user } },
      h(MemoryRouter, { initialEntries: [path] }, h(Routes, null,
        h(Route, { element: h(PublicLayout) },
          h(Route, { path: '/dang-ky', element: h(RegisterPage) }),
          h(Route, { path: '*', element: h(Where) })))))))
  return { ...app, stop: async () => { await app.stop(); client.clear() } }
}
const cornerHrefs = (app, label) => anchors(app, label).map(a => a.attributes.href)

test('UI-11: after choosing "Tìm phòng" the corner button becomes "Đăng ký" -> /dang-ky and "Đăng nhập" is gone', async () => {
  storage('/')
  const app = await boot('/phong')
  try {
    assert.ok(cornerHrefs(app, 'Đăng ký').includes('/dang-ky'))
    assert.equal(anchors(app, 'Đăng nhập').length, 0)
  } finally { await app.stop() }
})

test('UI-11: the button changes at once when the visitor picks "Tìm phòng" on the entry screen', async () => {
  storage()
  const app = await boot('/')
  try {
    assert.equal(dialogs(app).length, 1)
    dispatch(app.container, button(app, 'Tìm phòng'), 'click')
    await until(() => dialogs(app).length === 0, 'entry closes')
    assert.ok(cornerHrefs(app, 'Đăng ký').includes('/dang-ky'))
  } finally { await app.stop() }
})

test('UI-11: with no choice yet, or the tenant or staff entry chosen, the corner button stays "Đăng nhập"', async () => {
  for (const choice of [undefined, '/thue', '/ql']) {
    storage(choice)
    const app = await boot('/phong')
    try {
      assert.ok(cornerHrefs(app, 'Đăng nhập').includes('/dang-nhap'), String(choice))
      assert.equal(anchors(app, 'Đăng ký').length, 0, String(choice))
    } finally { await app.stop() }
  }
})

test('UI-11: a signed-in visitor sees "Trang của tôi", not "Đăng ký", even after choosing "Tìm phòng"', async () => {
  storage('/')
  const app = await boot('/phong', { id: 9, role: 'GUEST', mustChangePassword: false })
  try {
    assert.ok(cornerHrefs(app, 'Trang của tôi').includes('/toi'))
    assert.equal(anchors(app, 'Đăng ký').length, 0)
  } finally { await app.stop() }
})

test('UI-11, D-43: "Khách đã có tài khoản? Đăng nhập" on the entry screen closes it, keeps the choice "Tìm phòng" and opens the plain /dang-nhap', async () => {
  storage()
  const app = await boot('/')
  try {
    assert.equal(dialogs(app).length, 1)
    dispatch(app.container, button(app, 'Khách đã có tài khoản? Đăng nhập'), 'click')
    await until(() => dialogs(app).length === 0, 'entry closes')
    await until(() => find(app.container, n => n.attributes['data-path'])[0]?.textContent === '/dang-nhap', 'plain login opens')
    assert.equal(store.get('rooms.entryChoice'), '/')
  } finally { await app.stop() }
})

test('UI-11: "Đã có tài khoản? Đăng nhập" on the sign-up page leads back to the entry screen, and choosing closes it', async () => {
  storage('/')
  const app = await boot('/dang-ky')
  try {
    assert.equal(dialogs(app).length, 0)
    const link = anchors(app, 'Đăng nhập').find(a => a.attributes.href === '/')
    assert.ok(link, 'the link points to the entry screen, not to /dang-nhap')
    assert.equal(anchors(app, 'Đăng nhập').some(a => a.attributes.href?.startsWith('/dang-nhap')), false)
    dispatch(app.container, link, 'click')
    await until(() => dialogs(app).length === 1, 'entry screen opens')
    assert.equal(find(app.container, n => n.attributes['data-path'])[0]?.textContent, '/')
    dispatch(app.container, button(app, 'Tìm phòng'), 'click')
    await until(() => dialogs(app).length === 0, 'entry screen closes and does not come back')
  } finally { await app.stop() }
})
