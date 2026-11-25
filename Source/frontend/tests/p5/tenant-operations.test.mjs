import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, ok, fail, until, find, buttonByText, dispatch, isDisabled } from '../p3/contracts-dom.mjs'

const { TenantInboxPage } = source('pages/tenant/TenantInboxPage.tsx')
const { TenantRequestsPage } = source('pages/tenant/TenantRequestsPage.tsx')
const { RequestActions, TenantRequestForm } = source('features/requests/TenantRequestForm.tsx')
const tenant = { role: 'TENANT', language: 'en' }
const page = rows => ok(rows, { page: 1, limit: 100, total: rows.length })
test('tenant inbox marks one, keeps the read row, marks the remainder and follows a read link', async () => {
  const rows = [1,2].map(id => ({ id, title: 'Notice ' + id, createdAt: '2026-11-24T19:00:00Z', readAt: null, link: id === 2 ? '/thue/yeu-cau/8' : null }))
  const app = await mountContractPage(TenantInboxPage, { ...tenant, rules: [
    { prefix: '/me/notifications?', handler: () => ok(rows, { page: 1, limit: 10, total: 2, unreadCount: rows.filter(r => !r.readAt).length }) },
    { prefix: '/me/notifications/1/read', method: 'POST', handler: () => { rows[0].readAt = 'now'; return ok({ id: 1 }) } },
    { prefix: '/me/notifications/read-all', method: 'POST', handler: () => { rows[1].readAt = 'now'; return ok({ updated: 1 }) } },
  ] })
  try {
    const root = app.container
    const item = id => find(root, e => e.tagName === 'BUTTON' && e.textContent.includes('Notice ' + id))[0]
    await until(() => item(1), 'notifications')
    assert.match(root.textContent, /25\/11\/2026/)
    dispatch(root, item(1), 'click')
    await until(() => root.textContent.includes('1 unread'), 'read one')
    assert.match(item(1).getAttribute('class'), /--read/)
    dispatch(root, buttonByText(root, 'Mark all as read'), 'click')
    await until(() => root.textContent.includes('0 unread'), 'read all')
    dispatch(root, item(2), 'click')
    await until(() => app.router.state.location.pathname === '/thue/yeu-cau/8', 'open read notification')
  } finally { await app.stop() }
})
const request = { id: 8, contractId: 31, title: 'Tap leak', type: 'INCIDENT', status: 'RESOLVED', createdAt: '2026-11-01T01:00:00Z', photos: [], payload: {} }
test('resolved incident can reopen; review appears only after closure and expires by Hanoi calendar day', async () => {
  const row = { ...request }
  const app = await mountContractPage(TenantRequestsPage, { ...tenant, path: '/thue/yeu-cau/8', routePath: '/thue/yeu-cau/:id', rules: [
    { prefix: '/me/requests?', handler: () => page([row]) },
    { prefix: '/me/requests/8/reopen', method: 'POST', handler: () => { row.status = 'IN_PROGRESS'; return ok(row) } },
  ] })
  try {
    const root = app.container
    await until(() => buttonByText(root, 'Reopen incident'), 'resolved actions')
    assert.equal(buttonByText(root, 'Save review'), undefined)
    dispatch(root, buttonByText(root, 'Reopen incident'), 'click')
    await until(() => root.textContent.includes('In progress'), 'reopened')
    Object.assign(row, { status: 'CLOSED', reviewAt: '2020-10-31T18:00:00Z', reviewHiddenAt: '2020-11-01T02:00:00Z', reviewRating: 4 })
    await app.client.invalidateQueries()
    await until(() => root.textContent.includes('This comment is hidden.'), 'old review')
    assert.match(root.textContent, /4 ★/)
    assert.equal(buttonByText(root, 'Save review'), undefined)
  } finally { await app.stop() }
})
test('pending move-out prevents renewal and move-out on the same contract', async () => {
  const app = await mountContractPage(RequestActions, { ...tenant, props: { contractId: 31 }, rules: [{ prefix: '/me/requests?', handler: () => page([{ ...request, type: 'MOVE_OUT', status: 'PENDING' }]) }] })
  try {
    await until(() => app.container.textContent.includes('already pending'), 'pending reason')
    for (const label of ['Request renewal', 'Request move-out']) assert.ok(isDisabled(buttonByText(app.container, label)))
    assert.equal(!!isDisabled(buttonByText(app.container, 'Update vehicles')), false)
  } finally { await app.stop() }
})
test('a hidden review can change its rating with the version that the tenant read', async () => {
  const stamp = new Date().toISOString()
  const row = { ...request, status: 'CLOSED', reviewAt: stamp, reviewHiddenAt: stamp, reviewRating: 3 }
  const app = await mountContractPage(TenantRequestsPage, { ...tenant, path: '/thue/yeu-cau/8', routePath: '/thue/yeu-cau/:id', rules: [
    { prefix: '/me/requests?', handler: () => page([row]) },
    { prefix: '/me/requests/8/review', method: 'PUT', handler: () => ok(row) },
  ] })
  try {
    await until(() => buttonByText(app.container, 'Save review'), 'editable review')
    dispatch(app.container, find(app.container, e => e.tagName === 'FORM')[0], 'submit')
    await until(() => app.calls.some(c => c.method === 'PUT'), 'review PUT')
    const call = app.calls.find(c => c.method === 'PUT')
    assert.equal(call.headers['If-Match'], '"' + stamp + '"')
    assert.deepEqual(JSON.parse(call.body), { rating: 3 })
  } finally { await app.stop() }
})

test('move-out request shows the planned day and the contractual rent deadline separately', async () => {
  const row = { ...request, status: 'PENDING', type: 'MOVE_OUT', payload: { plannedMoveOutDate: '2026-12-01', endDate: '2027-01-20', remainingRent: 1250000 } }
  const app = await mountContractPage(TenantRequestsPage, { ...tenant, path: '/thue/yeu-cau/8', routePath: '/thue/yeu-cau/:id',
    rules: [{ prefix: '/me/requests?', handler: () => page([row]) }] })
  try {
    await until(() => app.container.textContent.includes('Move-out date: 01/12/2026'), 'planned date')
    assert.ok(app.container.textContent.includes('rent is still charged through 20/01/2027'))
    assert.ok(app.container.textContent.includes('1.250.000'))
  } finally { await app.stop() }
})

test('vehicle request offers parking from the building even when no services are selected on the contract', async () => {
  const app = await mountContractPage(TenantRequestForm, { ...tenant, props: { type: 'VEHICLE_CHANGE', contractId: 31 },
    rules: [{ prefix: '/me/contracts/31', handler: () => ok({ services: [], parkingServices: [{ id: 42, name: 'Parking A' }] }) }] })
  try {
    await until(() => app.container.textContent.includes('Parking A'), 'parking service')
    assert.ok(find(app.container, e => e.tagName === 'OPTION' && e.textContent === 'Parking A').length)
  } finally { await app.stop() }
})

test('submitting renewal keeps the API conflict message; a successful retry opens the created request', async t => {
  const fields = new FormData()
  fields.set('months', '6')
  fields.set('description', 'Second term')
  t.mock.method(globalThis, 'FormData', function () { return fields })
  let attempts = 0
  const app = await mountContractPage(TenantRequestForm, { ...tenant, props: { type: 'RENEW', contractId: 31 }, rules: [
    { prefix: '/me/requests', method: 'POST', handler: call => {
      assert.deepEqual(JSON.parse(call.body), { type: 'RENEW', contractId: 31, title: 'Request renewal', description: 'Second term', payload: { termMonths: 6 }, photos: [] })
      return ++attempts === 1 ? fail(409, 'PENDING_REQUEST_EXISTS', 'Pending conflict from server') : ok({ id: 71 })
    } },
  ] })
  try {
    const submit = () => dispatch(app.container, find(app.container, e => e.tagName === 'FORM')[0], 'submit')
    submit()
    await until(() => app.container.textContent.includes('Pending conflict from server'), 'backend conflict message')
    submit()
    await until(() => app.router.state.location.pathname === '/thue/yeu-cau/71', 'created request detail')
  } finally { await app.stop() }
})

test('only a pending request can be withdrawn from its detail', async () => {
  const row = { ...request, status: 'PENDING' }
  const app = await mountContractPage(TenantRequestsPage, { ...tenant, path: '/thue/yeu-cau/8', routePath: '/thue/yeu-cau/:id', rules: [
    { prefix: '/me/requests?', handler: () => page([row]) },
    { prefix: '/me/requests/8/cancel', method: 'POST', handler: () => { row.status = 'CANCELLED'; return ok(row) } },
  ] })
  try {
    await until(() => buttonByText(app.container, 'Withdraw request'), 'withdraw')
    dispatch(app.container, buttonByText(app.container, 'Withdraw request'), 'click')
    await until(() => app.container.textContent.includes('Withdrawn'), 'updated status')
    assert.equal(buttonByText(app.container, 'Withdraw request'), undefined)
  } finally { await app.stop() }
})

test('six photos are blocked before upload', async () => {
  const app = await mountContractPage(TenantRequestForm, { ...tenant, props: { type: 'INCIDENT', contractId: 31 } })
  try {
    const input = find(app.container, e => e.tagName === 'INPUT' && e.name === 'photos')[0]
    input.files = Array.from({ length: 6 }, () => ({ type: 'image/jpeg', size: 8 }))
    dispatch(app.container, input, 'change')
    await until(() => app.container.textContent.includes('up to five photos'), 'photo limit')
    assert.ok(isDisabled(buttonByText(app.container, 'Submit request')))
    assert.equal(app.calls.length, 0)
  } finally { await app.stop() }
})
