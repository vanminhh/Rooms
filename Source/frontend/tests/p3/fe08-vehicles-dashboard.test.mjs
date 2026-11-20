import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, ok, fail, until, find, fill, byName, buttonByText, dispatch, selectOption, queryOf } from './contracts-dom.mjs'
const { VehiclesPage } = source('pages/staff/VehiclesPage.tsx')
const { StaffHomePage } = source('pages/staff/StaffHomePage.tsx')

test('FE-P3-08/CON-14/API-02: vehicle lookup uses literal plate, explicit active/inactive filters and server pagination', async () => {
  const row = { id: 61, plate: '29A12345', type: 'MOTORBIKE', isActive: true, registeredAt: '2027-01-31', removedAt: null,
    contract: { id: 31, code: 'HD000031', room: { id: 8, code: 'P101' }, building: { id: 2, name: 'Building 2' }, tenant: { id: 15, fullName: 'Test signer', phone: '0900000991' } } }
  const app = await mountContractPage(VehiclesPage, { path: '/ql/xe', rules: [{ prefix: '/vehicles?', handler: c => ok([row], { page: Number(queryOf(c.url).get('page')), limit: 20, total: 21 }) }] })
  try {
    await until(() => app.container.textContent.includes('29A12345'), 'lookup result')
    assert.equal(queryOf(app.calls[0].url).get('isActive'), 'true')
    assert.ok(find(app.container, n => n.getAttribute('href') === '/ql/hop-dong/31').length)
    dispatch(app.container, buttonByText(app.container, 'Trang sau'), 'click')
    await until(() => queryOf(app.calls.at(-1).url).get('page') === '2', 'page two')
    fill(app.container, byName(app.container, 'plate'), ' 29%_& ')
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await until(() => queryOf(app.calls.at(-1).url).get('plate') === '29%_&', 'literal query')
    assert.equal(queryOf(app.calls.at(-1).url).get('page'), '1')
    selectOption(app.container, find(app.container, n => n.tagName === 'SELECT')[0], 'false')
    await until(() => queryOf(app.calls.at(-1).url).get('isActive') === 'false', 'inactive')
    assert.equal(find(app.container, n => n.tagName === 'OPTION' && n.value === '').length, 0, 'No unsupported all filter')
  } finally { await app.stop() }
})

for (const state of ['loading', 'empty', 'error']) test(`FE-P3-08/UI-03: vehicle lookup ${state}`, async () => {
  const response = state === 'loading' ? () => new Promise(() => {}) : state === 'empty' ? () => ok([], { page: 1, limit: 20, total: 0 }) : () => fail(503, 'NETWORK_ERROR', 'Không tra cứu được xe')
  const app = await mountContractPage(VehiclesPage, { path: '/ql/xe', rules: [{ prefix: '/vehicles?', handler: response }] })
  try { await until(() => app.container.textContent.includes({ loading: 'Đang tra cứu xe', empty: 'Không tìm thấy xe phù hợp', error: 'Không tra cứu được xe' }[state]), state) }
  finally { await app.stop() }
})

test('FE-P3-08/NOTI-06/D-39: dashboard shows server deposit totals and marks a cancelled viewing called once', async () => {
  let called = false
  const cancelled = { id: 11, guestName: 'Call guest', guestPhone: '0900000992', roomCode: 'P101' }
  const app = await mountContractPage(StaffHomePage, { path: '/ql', rules: [
    { prefix: '/viewings/11/called', method: 'POST', handler: () => { called = true; return ok({ ...cancelled, calledAt: '2026-11-20T08:00:00Z' }) } },
    { prefix: '/dashboard', handler: () => ok({ newViewings: { count: 0, items: [] }, overlappingViewings: { count: 0, items: [] }, pendingPrices: null,
      depositCancelledViewings: { count: called ? 0 : 7, items: called ? [] : [cancelled] }, unpaidDeposits: { count: 3, items: [{ id: 82, code: 'TT82', total: 2_500_000, dueDate: '2026-11-22', contract: { id: 31, room: { code: 'P101' }, tenant: { fullName: 'Test signer', phone: '0900000991' } } }] } }) },
  ] })
  try {
    await until(() => buttonByText(app.container, 'Đã gọi'), 'call task')
    assert.match(app.container.textContent, /3 hóa đơn tiền cọc|7 khách cần liên hệ|TT82|2.500.000 đ/)
    const button = buttonByText(app.container, 'Đã gọi')
    dispatch(app.container, button, 'click'); dispatch(app.container, button, 'click')
    await until(() => app.container.textContent.includes('Không có khách đang chờ gọi'), 'task removed after refetch')
    assert.equal(app.calls.filter(c => c.method === 'POST').length, 1)
    assert.ok(find(app.container, n => n.getAttribute('href') === '/ql/hop-dong/31').length)
  } finally { await app.stop() }
})
