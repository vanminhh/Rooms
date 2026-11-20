import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { buttonByText, byName, dispatch, fakeFetch, fill, find, loadModule, draftFirst, mount, ok, fail, until, wait } from '../p2/public-dom.mjs'
const require = createRequire(import.meta.url), React = require('react')
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query'), { MemoryRouter, Routes, Route } = require('react-router')
const mod = p => loadModule(draftFirst(`src/${p}`))
const { AuthContext } = mod('app/auth-context.ts'), { I18nProvider } = mod('shared/i18n/index.ts')
const { GuestHomePage } = mod('pages/guest/GuestHomePage.tsx'), { GuestViewingPage } = mod('pages/guest/GuestViewingPage.tsx')
const { plusDays, todayHanoi, hourInstant } = mod('features/viewings/time.ts')
const row = { id: 8, roomId: 7, roomCode: 'A101', buildingName: 'Tòa A', buildingAddress: 'Hà Nội', visitAt: hourInstant(plusDays(todayHanoi(), 1), 10), visitDate: null, timeSlot: null, status: 'NEW', note: 'Giữ nguyên ghi chú', contact: { phone: '0911111111' }, bossContact: null }
async function page(url, rules, lang = 'en') {
  const calls = fakeFetch(rules), client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const app = await mount(React.createElement(I18nProvider, { locale: lang }, React.createElement(AuthContext.Provider, { value: { status: 'ready', user: { id: 4, role: 'GUEST' } } },
    React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null,
      React.createElement(Route, { path: '/toi', element: React.createElement(GuestHomePage) }), React.createElement(Route, { path: '/toi/lich-hen/:id', element: React.createElement(GuestViewingPage) })))))))
  return { ...app, calls, client }
}
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref() })
test('VIEW-20: empty owner list and find-room link, no manual phone lookup', async () => {
  const app = await page('/toi', [{ prefix: '/me/viewings', handler: () => ok([], { page: 1, limit: 20, total: 0 }) }])
  try { await until(() => app.container.textContent.includes('You have no'), 'empty'); assert.ok(find(app.container, n => n.attributes?.href === '/phong').length); assert.equal(app.calls[0].url, '/api/v1/me/viewings?page=1&limit=20') } finally { await app.stop() }
})
test('VIEW-20: upcoming and history plus bounded server pagination', async () => {
  const app = await page('/toi', [{ prefix: '/me/viewings', handler: () => ok([row, { ...row, id: 9, status: 'CANCELLED' }], { page: 1, limit: 20, total: 24 }) }])
  try { await until(() => app.container.textContent.includes('Upcoming viewings'), 'rows'); assert.match(app.container.textContent, /Past and closed viewings/); dispatch(app.container, buttonByText(app.container, 'Next page'), 'click'); await until(() => app.calls.some(c => c.url.includes('page=2')), 'page two') } finally { await app.stop() }
})
test('VIEW-18: cancel requires confirmation; closing sends nothing; confirmed action refetches owner and availability', async () => {
  let current = row
  const app = await page('/toi/lich-hen/8', [
    { prefix: '/me/viewings/8/cancel', method: 'POST', handler: () => { current = { ...row, status: 'CANCELLED' }; return ok(current) } },
    { prefix: '/me/viewings/8', handler: () => ok(current) },
  ])
  try {
    const availabilityKey = ['viewing-times', 4, 7, 'cached-range']
    app.client.setQueryData(availabilityKey, [{ date: '2026-11-16', hours: [] }])
    await until(() => buttonByText(app.container, 'Cancel viewing'), 'cancel button')
    dispatch(app.container, buttonByText(app.container, 'Cancel viewing'), 'click'); await wait(20)
    assert.equal(app.calls.filter(c => c.method === 'POST').length, 0)
    dispatch(app.container, buttonByText(app.container, 'Keep viewing'), 'click'); await wait(20)
    assert.equal(app.calls.filter(c => c.method === 'POST').length, 0)
    dispatch(app.container, buttonByText(app.container, 'Cancel viewing'), 'click'); await wait(20)
    const dialog = find(app.container, n => n.attributes?.role === 'dialog')[0]
    dispatch(app.container, buttonByText(dialog, 'Cancel viewing'), 'click')
    await until(() => app.container.textContent.includes('Cancelled'), 'cancelled')
    assert.equal(app.calls.filter(c => c.method === 'POST').length, 1)
    assert.equal(app.client.getQueryState(availabilityKey).isInvalidated, true)
    assert.match(app.container.textContent, /Giữ nguyên ghi chú/)
  } finally { await app.stop() }
})
for (const data of [{ ...row, visitAt: new Date(Date.now() - 1000).toISOString() }, { ...row, status: 'DONE' }, { ...row, status: 'CANCELLED' }]) test(`VIEW-18: no cancel action after start or in ${data.status}`, async () => {
  const app = await page('/toi/lich-hen/8', [{ prefix: '/me/viewings/8', handler: () => ok(data) }])
  try { await until(() => app.container.textContent.includes('A101'), 'detail'); assert.equal(buttonByText(app.container, 'Cancel viewing'), undefined) } finally { await app.stop() }
})
test('SCOPE-03: another owner id displays not-found, not details', async () => {
  const app = await page('/toi/lich-hen/99', [{ prefix: '/me/viewings/99', handler: () => fail(404, 'NOT_FOUND', 'Not found') }])
  try { await until(() => app.container.textContent.includes('Viewing not found.'), '404'); assert.doesNotMatch(app.container.textContent, /A101|0911111111/) } finally { await app.stop() }
})
test('VIEW-20/UI-03: list errors can be retried', async () => {
  let attempts = 0
  const app = await page('/toi', [{ prefix: '/me/viewings', handler: () => ++attempts === 1 ? fail(500, 'INTERNAL_ERROR', 'Try later') : ok([], { page: 1, limit: 20, total: 0 }) }])
  try { await until(() => buttonByText(app.container, 'Try again'), 'error'); dispatch(app.container, buttonByText(app.container, 'Try again'), 'click'); await until(() => app.container.textContent.includes('You have no'), 'retry empty') } finally { await app.stop() }
})

test('SCOPE-03: a late boot refresh cannot clear a newly accepted account session', async () => {
  const { AuthProvider } = mod('app/AuthProvider.tsx')
  const { setAccessToken } = mod('shared/api.ts')
  const previousFetch = globalThis.fetch
  let finishRefresh, auth
  setAccessToken(null)
  globalThis.fetch = () => new Promise(resolve => { finishRefresh = resolve })
  function Probe() {
    auth = React.useContext(AuthContext)
    return React.createElement('p', null, `${auth.status}:${auth.user?.id ?? 'none'}`)
  }
  const client = new QueryClient()
  const app = await mount(React.createElement(I18nProvider, { locale: 'vi' },
    React.createElement(QueryClientProvider, { client }, React.createElement(AuthProvider, null, React.createElement(Probe)))))
  try {
    await until(() => finishRefresh, 'old boot refresh')
    auth.acceptSession({ accessToken: 'account-b', user: { id: 42, role: 'GUEST', locale: 'vi' } })
    await until(() => app.container.textContent === 'ready:42', 'new session')
    finishRefresh({ ok: false, status: 401, json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }) })
    await wait(30)
    assert.equal(app.container.textContent, 'ready:42')
  } finally { await app.stop(); client.clear(); setAccessToken(null); globalThis.fetch = previousFetch }
})
