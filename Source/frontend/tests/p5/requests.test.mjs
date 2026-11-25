import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, ok, fail, until, find, buttonByText, dispatch, fill, queryOf, detailFixture } from '../p3/contracts-dom.mjs'

const { RequestsPage } = source('pages/staff/RequestsPage.tsx')
const { RequestRenewalPage } = source('pages/staff/RequestRenewalPage.tsx')
const { ContractDetailPage } = source('pages/staff/ContractDetailPage.tsx')

test('signed HOLD renewal offers cancellation and carries the deposit without a move-in action', async () => {
  const contract = detailFixture({ previousContractId: 17, depositInvoice: null })
  const app = await mountContractPage(ContractDetailPage, { path: '/ql/hop-dong/31', routePath: '/ql/hop-dong/:id', rules: [
    ...['occupants', 'vehicles', 'services'].map(key => ({ prefix: '/contracts/31/' + key, handler: () => ok([]) })),
    { prefix: '/contracts/31', handler: () => ok(contract) },
    { prefix: '/services?', handler: () => ok([], { page: 1, limit: 20, total: 0 }) },
  ] })
  try {
    await until(() => app.container.textContent.includes('Hủy gia hạn'), 'cancel renewal')
    assert.ok(app.container.textContent.includes('Không thu cọc mới'))
    assert.equal(app.container.textContent.includes('Nhận phòng và ghi chỉ số đầu'), false)
    assert.equal(find(app.container, n => n.name === 'depositKept').length, 0)
  } finally { await app.stop() }
})

test('staff can initiate renewal directly; dates, services and deposit come from the contract', async () => {
  const contract = detailFixture({ status: 'ACTIVE', renewalStartDate: '2028-02-29', terms: 'Giữ nguyên', services: [{ id: 3, name: 'Internet' }] })
  const app = await mountContractPage(RequestRenewalPage, { path: '/ql/hop-dong/31/gia-han', routePath: '/ql/hop-dong/:id/gia-han', rules: [
    { prefix: '/contracts/31', method: 'GET', handler: () => ok(contract) },
    { prefix: '/contracts/31/renew', method: 'POST', handler: () => ok({ id: 48 }) },
  ] })
  try {
    await until(() => app.container.textContent.includes('29/02/2028'), 'server date')
    assert.ok(app.container.textContent.includes('Internet'))
    assert.ok(app.container.textContent.includes('Không thu cọc mới'))
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await until(() => buttonByText(app.container, 'Tạo gia hạn'), 'confirmation')
    dispatch(app.container, buttonByText(app.container, 'Tạo gia hạn'), 'click')
    await until(() => app.router.state.location.pathname.endsWith('/48'), 'HOLD successor')
    assert.deepEqual(JSON.parse(app.calls.find(c => c.method === 'POST').body), { termMonths: contract.termMonths })
  } finally { await app.stop() }
})

for (const [state, reason] of [
  [{ status: 'ACTIVE', nextContractId: 48 }, 'đã có bản gia hạn'],
  [{ status: 'ENDED' }, 'chưa ở trạng thái đang thuê'],
]) test('direct renewal is blocked: ' + reason, async () => {
  const app = await mountContractPage(RequestRenewalPage, { path: '/ql/hop-dong/31/gia-han', routePath: '/ql/hop-dong/:id/gia-han',
    rules: [{ prefix: '/contracts/31', handler: () => ok(detailFixture(state)) }] })
  try {
    await until(() => app.container.textContent.includes(reason), 'reason')
    assert.equal(find(app.container, n => n.tagName === 'FORM').length, 0)
  } finally { await app.stop() }
})
const { StaffHomePage } = source('pages/staff/StaffHomePage.tsx')
const { availableActions } = source('features/requests/api.ts')
const base = { id: 12, contractId: 31, title: 'Kiểm tra', description: null, decisionNote: null, photos: [], cost: null, payload: {} }
const roleActions = (type, status, boss = false) => availableActions({ ...base, type, status }, boss)

test('request board retries the scoped list and shows the server move-out amount and photo', async () => {
  let failed = true
  const row = { ...base, type: 'MOVE_OUT', status: 'PENDING', payload: { plannedMoveOutDate: '2026-11-30', endDate: '2027-02-01', remainingRent: 123456 },
    photos: [{ publicId: 'receipt', url: 'https://example.test/proof.jpg' }] }
  const app = await mountContractPage(RequestsPage, { path: '/ql/yeu-cau', rules: [{ prefix: '/requests?', handler: call => {
    if (failed) return fail(503, 'NETWORK_ERROR', 'Không tải được danh sách')
    const rows = queryOf(call.url).get('status') === 'REJECTED' ? [] : [row]
    return ok(rows, { page: 1, limit: 20, total: rows.length })
  } }] })
  try {
    await until(() => app.container.textContent.includes('Không tải được danh sách'), 'error')
    failed = false
    dispatch(app.container, buttonByText(app.container, 'Thử lại'), 'click')
    await until(() => app.container.textContent.includes('123.456'), 'server warning')
    assert.equal(find(app.container, n => n.tagName === 'IMG')[0].getAttribute('src'), row.photos[0].url)
    await app.router.navigate('/ql/yeu-cau?type=MOVE_OUT&status=REJECTED')
    await until(() => find(app.container, n => n.tagName === 'SUMMARY').length === 0 &&
      app.container.textContent.includes('Chưa có yêu cầu trên trang này.'), 'filtered empty board')
    const query = queryOf(app.calls.at(-1).url)
    assert.deepEqual([query.get('type'), query.get('status'), query.get('buildingId')], ['MOVE_OUT', 'REJECTED', '2'])
  } finally { await app.stop() }
})

for (const role of ['MANAGER', 'BOSS']) test(`dashboard request links and totals for ${role}`, async () => {
  const group = { count: 19, items: [{ id: 12, contractId: 31, type: 'RENEW', title: 'Gia hạn phòng 204' }] }
  const empty = { count: 0, items: [] }
  const app = await mountContractPage(StaffHomePage, { path: '/ql', role, rules: [{ prefix: '/dashboard', handler: () => ok({
    pendingPrices: null, newViewings: empty, pendingRequests: empty, approvedRenewals: group, escalatedPaymentIssues: group,
  }) }] })
  try {
    await until(() => app.container.textContent.includes('19 yêu cầu'), 'server count')
    assert.ok(find(app.container, n => n.getAttribute('href') === '/ql/yeu-cau?status=APPROVED&type=RENEW&requestId=12').length)
    assert.equal(app.container.textContent.includes('Báo lỗi thanh toán đã chuyển Boss'), role === 'BOSS')
  } finally { await app.stop() }
})
test('staff actions respect incident, decision and escalated payment states', () => {
  assert.deepEqual(roleActions('INCIDENT', 'PENDING'), ['start'])
  assert.deepEqual(roleActions('INCIDENT', 'IN_PROGRESS'), ['finish'])
  assert.deepEqual(roleActions('PAYMENT_ISSUE', 'ESCALATED'), [])
  assert.deepEqual(roleActions('PAYMENT_ISSUE', 'ESCALATED', true), ['resolve'])
  for (const type of ['MOVE_OUT', 'RENEW', 'OCCUPANT_CHANGE', 'VEHICLE_CHANGE']) {
    assert.deepEqual(roleActions(type, 'PENDING'), ['approve', 'reject'])
    assert.deepEqual(roleActions(type, 'APPROVED'), [])
  }
})

for (const [type, status, choice, input, endpoint, body] of [
  ['INCIDENT', 'IN_PROGRESS', 'Hoàn thành sửa chữa', '0', '12', { status: 'RESOLVED', cost: 0 }],
  ['PAYMENT_ISSUE', 'PENDING', 'Xác nhận đã nhận tiền', '', '12/resolve', {}],
  ['PAYMENT_ISSUE', 'ESCALATED', 'Xác nhận đã nhận tiền', '17', '12/resolve', { bankTransactionId: 17 }],
  ['MOVE_OUT', 'PENDING', 'Từ chối', '  Thiếu thông tin  ', '12/reject', { decisionNote: 'Thiếu thông tin' }],
  ['RENEW', 'PENDING', 'Duyệt', '', '12/approve', {}],
]) test(`confirmed ${type} ${status} sends the appropriate staff action`, async () => {
  let attempts = 0
  const row = { ...base, type, status, payload: type === 'RENEW' ? { termMonths: 8 } : {} }
  const app = await mountContractPage(RequestsPage, { path: '/ql/yeu-cau', role: 'BOSS', rules: [
    { prefix: '/requests?', handler: () => ok([row], { page: 1, limit: 20, total: 1 }) },
    { prefix: '/requests/' + endpoint, method: type === 'INCIDENT' ? 'PATCH' : 'POST', handler: call => {
      attempts++
      assert.deepEqual(JSON.parse(call.body), body)
      return attempts === 1 ? fail(409, 'CONFLICT_STATE', 'Trạng thái đã đổi') : ok({})
    } },
  ] })
  const root = app.container
  try {
    await until(() => buttonByText(root, choice), choice)
    assert.equal(queryOf(app.calls[0].url).get('buildingId'), '2')
    dispatch(root, buttonByText(root, choice), 'click')
    await until(() => find(root, n => n.tagName === 'FORM').length, 'action form')
    if (input) { fill(root, find(root, n => n.tagName === 'INPUT')[0], input); await until(() => find(root, n => n.tagName === 'INPUT')[0].value === input, 'input') }
    async function dialog() {
      dispatch(root, find(root, n => n.tagName === 'FORM')[0], 'submit')
      await until(() => find(root, n => n.attributes.role === 'dialog').length, 'confirmation')
      return find(root, n => n.attributes.role === 'dialog')[0]
    }
    dispatch(root, buttonByText(await dialog(), 'Hủy'), 'click')
    await until(() => !find(root, n => n.attributes.role === 'dialog').length, 'dismissed')
    assert.equal(attempts, 0)
    dispatch(root, buttonByText(await dialog(), choice), 'click')
    await until(() => root.textContent.includes('Trạng thái đã đổi'), 'server message')
    dispatch(root, buttonByText(await dialog(), choice), 'click')
    await until(() => attempts === 2, 'retry')
    await until(() => app.calls.filter(c => c.url.includes('/requests?')).length > 1, 'board refresh')
    if (type === 'RENEW') {
      await until(() => app.router.state.location.pathname.endsWith('/31/gia-han'), 'renewal')
      assert.equal(app.router.state.location.search, '?requestId=12&termMonths=8')
    }
  } finally { await app.stop() }
})

test('approved renewal opens with proposed term and copied clauses; clearing creates the HOLD renewal', async () => {
  const app = await mountContractPage(RequestRenewalPage, { path: '/ql/hop-dong/31/gia-han', routePath: '/ql/hop-dong/:id/gia-han', rules: [
    { prefix: '/contracts/31/renew', method: 'POST', handler: () => ok({ id: 44 }) },
    { prefix: '/contracts/31', method: 'GET', handler: () => ok(detailFixture({ status: 'ACTIVE', terms: 'Điều khoản cũ' })) },
  ] })
  try {
    await app.router.navigate('/ql/hop-dong/31/gia-han?requestId=12&termMonths=8')
    await until(() => app.container.textContent.includes('Yêu cầu #12') && find(app.container, n => n.tagName === 'TEXTAREA').length, 'request-specific renewal form')
    assert.equal(find(app.container, n => n.tagName === 'INPUT')[0].value, '8')
    const terms = find(app.container, n => n.tagName === 'TEXTAREA')[0]
    assert.equal(terms.defaultValue, 'Điều khoản cũ')
    fill(app.container, terms, 'Sửa điều khoản')
    await until(() => terms.defaultValue === 'Sửa điều khoản', 'edited terms')
    fill(app.container, terms, '')
    await new Promise(resolve => setTimeout(resolve, 0))
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await until(() => buttonByText(app.container, 'Tạo gia hạn'), 'confirm')
    dispatch(app.container, buttonByText(app.container, 'Tạo gia hạn'), 'click')
    await until(() => app.router.state.location.pathname === '/ql/hop-dong/44', 'created renewal')
    assert.deepEqual(JSON.parse(app.calls.find(c => c.method === 'POST').body), { requestId: 12, termMonths: 8, terms: null })
  } finally { await app.stop() }
})
