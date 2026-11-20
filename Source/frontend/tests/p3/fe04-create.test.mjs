import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, summaryFixture, ok, fail, until, find, byName, fill, dispatch, buttonByText } from './contracts-dom.mjs'

const { ContractCreatePage } = source('pages/staff/ContractCreatePage.tsx')
const room = { id: 8, buildingId: 2, code: 'P101', price: 2_500_000, isActive: true, maxOccupants: 3, status: 'AVAILABLE', images: [], furniture: [] }
const prefill = { viewingId: 11, roomId: 8, buildingId: 2, roomCode: 'P101', signer: { fullName: 'Current guest', phone: '0900000993', email: 'guest@example.test' } }
const rules = (post, overrides = []) => [
  ...overrides,
  { prefix: '/rooms/8', handler: () => ok(room) },
  { prefix: '/rooms?', handler: () => ok([room], { page: 1, limit: 100, total: 1 }) },
  { prefix: '/services?', handler: () => ok([{ id: 4, name: 'Phí sinh hoạt', unit: 'PERSON', isActive: true }], { page: 1, limit: 100, total: 1 }) },
  { prefix: '/contracts/end-date?', handler: () => ok({ startDate: '2027-01-31', endDate: '2027-04-29', termMonths: 3 }) },
  { prefix: '/contracts', method: 'POST', handler: post ?? (() => ok(summaryFixture())) },
]
const page = (post, overrides) => mountContractPage(ContractCreatePage, { path: '/ql/hop-dong/moi', state: { viewing: prefill }, rules: rules(post, overrides) })
async function submit(app) {
  await until(() => find(app.container, n => n.tagName === 'FORM').length && app.container.textContent.includes('29/04/2027'), 'ready form')
  fill(app.container, byName(app.container, 'startDate'), '2027-01-31')
  dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
}

test('FE-P3-04/D-41/CON-01: reviewed prefill, approved price default, server end-date, optional identity and success navigation', async () => {
  const app = await page()
  try {
    await submit(app)
    await until(() => app.router.state.location.pathname === '/ql/hop-dong/31', 'saved detail')
    const body = JSON.parse(app.calls.find(c => c.method === 'POST').body)
    assert.equal(body.deposit, 2_500_000)
    assert.equal(body.viewingId, 11)
    assert.deepEqual(body.signer, { fullName: 'Current guest', phone: '0900000993', email: 'guest@example.test' })
    assert.equal('endDate' in body, false)
  } finally { await app.stop() }
})

test('FE-P3-04/SCOPE-02: cached room data cannot reveal prefilled personal data before fresh permission check', async () => {
  const app = await mountContractPage(ContractCreatePage, { path: '/ql/hop-dong/moi', state: { viewing: prefill },
    seed(client) { client.setQueryDefaults(['contract-create-room'], { gcTime: Infinity }); client.setQueryData(['contract-create-room', '12:MANAGER:2', 8], room) },
    rules: rules(undefined, [{ prefix: '/rooms/8', handler: () => new Promise(() => {}) }]),
  })
  try {
    assert.equal(byName(app.container, 'signer.phone'), undefined)
    assert.doesNotMatch(app.container.textContent, /Current guest|0900000993/)
    assert.equal(app.calls.some(c => c.method === 'POST'), false)
  } finally { await app.stop() }
})

test('FE-P3-04/A-18/CON-07: a verified guest requires confirmation with account name/email before exact resubmission', async () => {
  let attempts = 0
  const app = await page(() => ++attempts === 1 ? fail(409, 'PHONE_TAKEN', 'Vui lòng xác nhận', { 'signer.phone': 'Vui lòng xác nhận', guestAccountId: '15', guestAccountName: 'Existing guest', guestAccountEmail: 'existing@example.test' }) : ok(summaryFixture()))
  try {
    await submit(app)
    await until(() => app.container.textContent.includes('Existing guest'), 'confirmation')
    assert.match(app.container.textContent, /existing@example.test/)
    assert.equal(attempts, 1)
    const original = JSON.parse(app.calls.find(c => c.method === 'POST').body)
    dispatch(app.container, buttonByText(app.container, 'Đã xác nhận, tiếp tục'), 'click')
    await until(() => attempts === 2, 'confirmed request')
    assert.deepEqual(JSON.parse(app.calls.filter(c => c.method === 'POST')[1].body), { ...original, confirmedGuestAccountId: 15 })
  } finally { await app.stop() }
})

test('FE-P3-04/CON-07: different viewing owner is explicitly confirmed and combined with guest confirmation', async () => {
  let attempts = 0
  const app = await page(() => {
    attempts++
    if (attempts === 1) return fail(409, 'CONFLICT_STATE', 'Khác người đặt lịch', { confirmDifferentViewingOwner: 'Người ký khác người đã đặt lịch. Xác nhận tiếp tục?' })
    if (attempts === 2) return fail(409, 'PHONE_TAKEN', 'Xác nhận guest', { guestAccountId: '15', guestAccountName: 'Guest', guestAccountEmail: '' })
    return ok(summaryFixture())
  })
  try {
    await submit(app)
    await until(() => buttonByText(app.container, 'Đã xác nhận, tiếp tục'), 'owner confirm')
    dispatch(app.container, buttonByText(app.container, 'Đã xác nhận, tiếp tục'), 'click')
    await until(() => app.container.textContent.includes('tài khoản Guest'), 'account confirm')
    dispatch(app.container, buttonByText(app.container, 'Đã xác nhận, tiếp tục'), 'click')
    await until(() => attempts === 3, 'third submission')
    const body = JSON.parse(app.calls.filter(c => c.method === 'POST').at(-1).body)
    assert.equal(body.confirmDifferentViewingOwner, true)
    assert.equal(body.confirmedGuestAccountId, 15)
  } finally { await app.stop() }
})

for (const [code, status, fields, message] of [
  ['ACCOUNT_LOCKED', 403, { 'signer.phone': 'Tài khoản của số này đang bị khóa' }, 'Tài khoản của số này đang bị khóa'],
  ['PHONE_TAKEN', 409, undefined, 'Số điện thoại đã được sử dụng'],
  ['EMAIL_TAKEN', 409, { 'signer.email': 'Email đã được dùng cho tài khoản khác' }, 'Email đã được dùng cho tài khoản khác'],
  ['ROOM_NOT_AVAILABLE', 409, undefined, 'Phòng không còn trống'],
]) test(`FE-P3-04/CON-07/UI-05: ${code} is visible without a misleading account confirmation`, async () => {
  const app = await page(() => fail(status, code, message, fields))
  try {
    await submit(app)
    await until(() => app.container.textContent.includes(message), 'API error')
    assert.equal(find(app.container, n => n.getAttribute('role') === 'dialog').length, 0)
    assert.equal(app.router.state.location.pathname, '/ql/hop-dong/moi')
  } finally { await app.stop() }
})

test('FE-P3-04/UI-04: closing account confirmation sends nothing, editing starts a new unconfirmed request', async () => {
  const app = await page(() => fail(409, 'PHONE_TAKEN', 'Xác nhận', { guestAccountId: '15', guestAccountName: 'Existing guest' }))
  try {
    await submit(app)
    await until(() => buttonByText(app.container, 'Hủy'), 'dialog')
    dispatch(app.container, buttonByText(app.container, 'Hủy'), 'click')
    fill(app.container, byName(app.container, 'signer.phone'), '0900000994')
    await submit(app)
    await until(() => app.calls.filter(c => c.method === 'POST').length === 2, 'new submission')
    const body = JSON.parse(app.calls.filter(c => c.method === 'POST')[1].body)
    assert.equal(body.signer.phone, '0900000994')
    assert.equal('confirmedGuestAccountId' in body, false)
  } finally { await app.stop() }
})
