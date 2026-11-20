import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, detailFixture, ok, fail, until, wait, find, byName, fill, check, dispatch, buttonByText, formFor } from './contracts-dom.mjs'

const { ContractDetailPage } = source('pages/staff/ContractDetailPage.tsx')
const { ContractPrintPage } = source('pages/staff/ContractPrintPage.tsx')
const collection = rows => ok(rows, { page: 1, limit: 100, total: rows.length })
async function detail(data = detailFixture(), extra = []) {
  const app = await mountContractPage(ContractDetailPage, { path: '/ql/hop-dong/31', routePath: '/ql/hop-dong/:id', rules: [
    ...extra,
    { prefix: '/contracts/31/occupants', handler: () => ok(data.occupants.map(row => ({ ...row, hasIdFront: true, hasIdBack: false }))) },
    { prefix: '/contracts/31/vehicles', handler: () => ok(data.vehicles) },
    { prefix: '/contracts/31/services', handler: () => ok([]) },
    { prefix: '/contracts/31', method: 'GET', handler: () => ok(data) },
    { prefix: '/services?', handler: () => collection([]) },
  ] })
  await until(() => app.container.textContent.includes('HD000031'), 'contract detail')
  return app
}

test('FE-P3-05/CON-22/Q-15: print renders server content as text, mandatory draft banner and window.print', async () => {
  let printed = 0
  const previous = window.print
  window.print = () => { printed++ }
  const content = 'HỢP ĐỒNG THỬ\nHD000031 · 2.500.000 đ\n<script>unsafe()</script>'
  const app = await mountContractPage(ContractPrintPage, { path: '/ql/hop-dong/31/in', routePath: '/ql/hop-dong/:id/in', rules: [{ prefix: '/contracts/31/print', handler: () => ok({ content, isDraft: true }) }] })
  try {
    await until(() => app.container.textContent.includes('BẢN NHÁP – chưa dùng để ký'), 'draft')
    assert.equal(find(app.container, node => node.tagName === 'PRE')[0].textContent, content)
    assert.equal(find(app.container, node => node.tagName === 'SCRIPT').length, 0)
    dispatch(app.container, buttonByText(app.container, 'In / Lưu PDF'), 'click')
    assert.equal(printed, 1)
  } finally { await app.stop(); window.print = previous }
})

test('FE-P3-06/BIL-10/11/UI-04: QR is server data; closing payment confirm writes nothing, double click writes once with idempotency', async () => {
  const app = await detail(undefined, [{ prefix: '/invoices/82/payment', method: 'POST', handler: () => new Promise(() => {}) }])
  try {
    assert.match(app.container.textContent, /TT82|2.500.000 đ/)
    assert.ok(find(app.container, node => node.tagName === 'IMG' && node.getAttribute('src') === 'https://example.test/qr.png').length)
    dispatch(app.container, formFor(app.container, 'method'), 'submit')
    await until(() => buttonByText(app.container, 'Đã nhận đủ tiền'), 'payment dialog')
    dispatch(app.container, buttonByText(app.container, 'Hủy'), 'click')
    await until(() => !buttonByText(app.container, 'Đã nhận đủ tiền'), 'dialog closed before reopening')
    assert.equal(app.calls.filter(c => c.method === 'POST').length, 0)
    dispatch(app.container, formFor(app.container, 'method'), 'submit')
    await until(() => buttonByText(app.container, 'Đã nhận đủ tiền'), 'dialog again')
    const confirm = buttonByText(app.container, 'Đã nhận đủ tiền')
    dispatch(app.container, confirm, 'click'); dispatch(app.container, confirm, 'click')
    await until(() => app.calls.some(c => c.url.includes('/payment')), 'payment sent')
    const calls = app.calls.filter(c => c.url.includes('/payment'))
    assert.equal(calls.length, 1)
    assert.ok(calls[0].headers['Idempotency-Key'])
    assert.deepEqual(JSON.parse(calls[0].body), { method: 'CASH', note: '' })
  } finally { await app.stop() }
})

test('FE-P3-06/BIL-11: INVOICE_NOT_UNPAID preserves server message in payment dialog', async () => {
  const app = await detail(undefined, [{ prefix: '/invoices/82/payment', method: 'POST', handler: () => fail(409, 'INVOICE_NOT_UNPAID', 'Hóa đơn đã được thanh toán trước đó') }])
  try {
    dispatch(app.container, formFor(app.container, 'method'), 'submit')
    await until(() => buttonByText(app.container, 'Đã nhận đủ tiền'), 'confirm')
    dispatch(app.container, buttonByText(app.container, 'Đã nhận đủ tiền'), 'click')
    await until(() => app.container.textContent.includes('Hóa đơn đã được thanh toán trước đó'), 'payment API error')
  } finally { await app.stop() }
})

test('FE-P3-06/CON-09: reset password is local only and disappears after leaving/reloading detail', async () => {
  const password = 'temporary-test-password'
  const app = await detail(undefined, [{ prefix: '/contracts/31/reset-password', method: 'POST', handler: () => ok({ temporaryPassword: password }) }])
  try {
    dispatch(app.container, buttonByText(app.container, 'Đặt lại mật khẩu người thuê'), 'click')
    await until(() => buttonByText(app.container, 'Đặt lại mật khẩu'), 'password dialog')
    dispatch(app.container, buttonByText(app.container, 'Đặt lại mật khẩu'), 'click')
    await until(() => app.container.textContent.includes(password), 'new password')
    assert.equal(JSON.stringify(app.client.getQueryCache().getAll().map(q => q.state.data)).includes(password), false)
    assert.equal(app.client.getMutationCache().getAll().length, 0)
    await app.router.navigate('/ql/hop-dong')
    await until(() => app.container.textContent === 'Navigation target', 'detail unmounted')
    await app.router.navigate('/ql/hop-dong/31')
    await until(() => app.container.textContent.includes('HD000031'), 'back to detail')
    assert.equal(app.container.textContent.includes(password), false)
  } finally { await app.stop() }
})

test('FE-P3-06/CON-06/09/FILE-02: uploading a private scan and signing exposes a password once without caching it', async () => {
  const data = detailFixture({ signedAt: null, depositInvoice: null })
  const password = 'signed-temporary-test'
  const signed = { cloudName: 'test', apiKey: 'public-key', uploadUrl: 'https://example.test/cloudinary-upload', timestamp: 1,
    folder: 'contracts/2/31', allowedFormats: 'jpg,png,webp,pdf', type: 'authenticated', publicId: 'contract-scan-test', overwrite: false, signature: 'test-signature' }
  const app = await detail(data, [
    { prefix: '/files/sign', method: 'POST', handler: () => ok(signed) },
    { prefix: '/contracts/31/sign', method: 'POST', handler: () => { data.signedAt = '2026-11-20T08:00:00Z'; return ok({ ...data, temporaryPassword: password }) } },
  ])
  const apiFetch = globalThis.fetch
  let uploadCalls = 0
  globalThis.fetch = async (url, init) => {
    if (url !== signed.uploadUrl) return apiFetch(url, init)
    uploadCalls++
    assert.equal(init.credentials, 'omit')
    assert.equal(init.body.get('type'), 'authenticated')
    return new Response(JSON.stringify({ asset_id: 'scan_asset', public_id: 'contracts/2/31/contract-scan-test', version: 2, format: 'pdf' }), { status: 200 })
  }
  try {
    const input = find(app.container, node => node.tagName === 'INPUT' && (node.type === 'file' || node.getAttribute('type') === 'file') && (node.getAttribute('accept') ?? node.accept ?? '').includes('application/pdf'))[0]
    input.type = 'file'; input.files = [new File(['test pdf'], 'contract.pdf', { type: 'application/pdf' })]
    dispatch(app.container, input, 'change')
    await until(() => app.container.textContent.includes('Đã tải tài liệu'), 'scan uploaded')
    assert.equal(uploadCalls, 1)
    dispatch(app.container, buttonByText(app.container, 'Ký hợp đồng'), 'click')
    await until(() => buttonByText(app.container, 'Xác nhận đã ký'), 'sign confirm')
    dispatch(app.container, buttonByText(app.container, 'Xác nhận đã ký'), 'click')
    await until(() => app.container.textContent.includes(password), 'password after signing')
    assert.equal(JSON.stringify(app.client.getQueryCache().getAll().map(query => query.state.data)).includes(password), false)
    const body = JSON.parse(app.calls.find(call => call.url.endsWith('/sign') && call.url.includes('/contracts/')).body)
    assert.deepEqual(body, { assetId: 'scan_asset', publicId: 'contracts/2/31/contract-scan-test', version: 2, format: 'pdf' })
    await app.router.navigate('/ql/hop-dong')
    await until(() => app.container.textContent === 'Navigation target', 'signed detail unmounted')
    await app.router.navigate('/ql/hop-dong/31')
    await until(() => app.container.textContent.includes('HD000031'), 'return')
    assert.equal(app.container.textContent.includes(password), false)
  } finally { await app.stop(); globalThis.fetch = apiFetch }
})

for (const [code, message, fields] of [
  ['DEPOSIT_NOT_PAID', 'Chưa thu đủ tiền cọc'],
  ['METER_VALUE_DECREASED', 'Chỉ số nhỏ hơn lần trước', { electric: 'Chỉ số điện nhỏ hơn mốc đã chốt' }],
]) test(`FE-P3-07/CON-10/D-38: move-in submits both readings without photos and displays ${code}`, async () => {
  const app = await detail(undefined, [{ prefix: '/contracts/31/move-in', method: 'POST', handler: () => fail(409, code, message, fields) }])
  try {
    fill(app.container, byName(app.container, 'electric'), '100')
    fill(app.container, byName(app.container, 'water'), '20')
    fill(app.container, byName(app.container, 'readOn'), '2027-01-31')
    dispatch(app.container, formFor(app.container, 'electric'), 'submit')
    await until(() => app.container.textContent.includes(fields?.electric ?? message), 'move-in error')
    const body = JSON.parse(app.calls.find(c => c.url.endsWith('/move-in')).body)
    assert.deepEqual(body, { electric: 100, water: 20, readOn: '2027-01-31' })
  } finally { await app.stop() }
})

test('FE-P3-07/CON-12/UI-06: cancellation confirm shows API amounts and sends its received-amount check without frontend subtraction', async () => {
  const app = await detail(undefined, [
    { prefix: '/contracts/31/cancel-preview', method: 'POST', handler: () => ok({ depositReceived: 2_500_000, depositKept: 1_000_000, refund: 1_500_000, createsSettlement: true }) },
    { prefix: '/contracts/31/cancel', method: 'POST', handler: () => new Promise(() => {}) },
  ])
  try {
    fill(app.container, byName(app.container, 'reason'), 'Khách đổi kế hoạch')
    fill(app.container, byName(app.container, 'depositKept'), '1000000')
    dispatch(app.container, formFor(app.container, 'depositKept'), 'submit')
    await until(() => app.container.textContent.includes('Hoàn khách: 1.500.000 đ'), 'server refund')
    assert.equal(app.calls.filter(c => c.url.endsWith('/cancel')).length, 0)
    dispatch(app.container, buttonByText(app.container, 'Hủy hợp đồng'), 'click')
    await until(() => app.calls.some(c => c.url.endsWith('/cancel')), 'cancellation')
    const call = app.calls.find(c => c.url.endsWith('/cancel'))
    assert.ok(call.headers['Idempotency-Key'])
    assert.deepEqual(JSON.parse(call.body), { reason: 'Khách đổi kế hoạch', depositKept: 1_000_000, expectedDepositReceived: 2_500_000 })
  } finally { await app.stop() }
})

test('FE-P3-07/CON-10: disabling meter replacement discards an invalid hidden old reading', async () => {
  const app = await detail(undefined, [{ prefix: '/contracts/31/move-in', method: 'POST', handler: () => fail(409, 'DEPOSIT_NOT_PAID', 'Cọc chưa thu') }])
  try {
    check(app.container, byName(app.container, 'replaceElectric'), true)
    await until(() => byName(app.container, 'electricOld'), 'old reading')
    fill(app.container, byName(app.container, 'electricOld'), '-1')
    check(app.container, byName(app.container, 'replaceElectric'), false)
    fill(app.container, byName(app.container, 'electric'), '100')
    fill(app.container, byName(app.container, 'water'), '20')
    fill(app.container, byName(app.container, 'readOn'), '2027-01-31')
    dispatch(app.container, formFor(app.container, 'electric'), 'submit')
    await until(() => app.calls.some(c => c.url.endsWith('/move-in')), 'request not blocked by hidden reading')
    const body = JSON.parse(app.calls.find(c => c.url.endsWith('/move-in')).body)
    assert.equal('electricReplacement' in body, false)
  } finally { await app.stop() }
})

test('FE-P3-07/CON-16/AUD-01: ID photos are fetched only on click and signed links are removed at expiry', async () => {
  const privateUrl = 'https://example.test/private-id'
  const app = await detail(undefined, [{ prefix: '/contracts/31/occupants/51/id-photos', handler: () => ok({ front: { url: privateUrl, expiresAt: new Date(Date.now() + 100).toISOString() }, back: null }) }])
  try {
    await until(() => buttonByText(app.container, 'Xem ảnh CCCD'), 'photo action')
    assert.equal(app.calls.some(c => c.url.includes('/id-photos')), false)
    dispatch(app.container, buttonByText(app.container, 'Xem ảnh CCCD'), 'click')
    await until(() => find(app.container, n => n.getAttribute('href') === privateUrl).length, 'signed view')
    await wait(130)
    assert.equal(find(app.container, n => n.getAttribute('href') === privateUrl).length, 0)
    assert.match(app.container.textContent, /Liên kết đã hết hạn/)
  } finally { await app.stop() }
})
