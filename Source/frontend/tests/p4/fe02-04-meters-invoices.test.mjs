import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { source, mountContractPage, ok, fail, until, find, byName, buttonByText, dispatch, fill, selectOption, queryOf, isDisabled } from '../p3/contracts-dom.mjs'
const { MetersPage } = source('pages/staff/MetersPage.tsx')
const { InvoicesPage } = source('pages/staff/InvoicesPage.tsx')
const { InvoiceDetailPage } = source('pages/staff/InvoiceDetailPage.tsx')

const due = (invoiceId, extra = {}) => ({ invoiceId, contractId: invoiceId + 100, periodNo: 2, periodStart: '2026-10-01', periodEnd: '2026-10-31', billingDate: '2026-11-01',
  overdue: false, reviewRequired: false, room: { id: invoiceId + 10, code: `P${invoiceId}` }, tenant: { id: 9, fullName: `Khách ${invoiceId}` },
  building: { id: 2, name: 'Tòa A', waterMode: 'PER_M3' }, previousReadings: { ELECTRIC: { id: 1, value: 1284, readOn: '2026-10-01' }, WATER: null }, ...extra })
const dialogButton = (app, label) => find(app.container, n => n.tagName === 'BUTTON' && n.textContent.trim() === label).at(-1)

test('FE-P4-02/MTR-09/D-42/MTR-06: due rooms show the last reading, the late mark and the PER_PERSON water note', async () => {
  const app = await mountContractPage(MetersPage, { path: '/ql/chi-so', rules: [{ prefix: '/meter-readings/due', handler: () => ok([
    due(7, { overdue: true }), due(8, { building: { id: 2, name: 'Tòa B', waterMode: 'PER_PERSON' }, reviewRequired: true })]) }] })
  try {
    await until(() => app.container.textContent.includes('Phòng P7'), 'cards')
    assert.match(app.container.textContent, /Mốc trước: 1284 \(01\/10\/2026\)/)
    assert.match(app.container.textContent, /Chưa có mốc/)
    assert.match(app.container.textContent, /Quá ngày chốt/)
    assert.match(app.container.textContent, /Nước không tính tiền ở tòa này/)
    assert.match(app.container.textContent, /Tiêu thụ bất thường/)
    assert.equal(queryOf(app.calls[0].url).get('buildingId'), '2')
    assert.ok(isDisabled(buttonByText(app.container, 'Lưu chỉ số (0)')), 'nothing typed → no request (an empty batch is a 400)')
  } finally { await app.stop() }
})

test('FE-P4-02/MTR-11/Q-P4-55/Q-P4-60: one batch after a confirm; saved lines leave, a METER_VALUE_DECREASED line keeps its number and error', async () => {
  let posted
  const app = await mountContractPage(MetersPage, { path: '/ql/chi-so', rules: [
    { prefix: '/meter-readings/due', handler: () => ok([due(7), due(8)]) },
    { prefix: '/meter-readings', method: 'POST', handler: c => { posted = JSON.parse(c.body); return ok([{ index: 0, ok: true, data: { invoiceId: 7, status: 'DRAFT' } }, { index: 1, ok: false, error: 'METER_VALUE_DECREASED' }]) } },
  ] })
  try {
    await until(() => byName(app.container, '7:ELECTRIC'), 'inputs')
    fill(app.container, byName(app.container, '7:ELECTRIC'), '1368')
    fill(app.container, byName(app.container, '8:ELECTRIC'), '1200')
    dispatch(app.container, buttonByText(app.container, 'Lưu chỉ số (2)'), 'click')
    await until(() => app.container.textContent.includes('Lưu chỉ số đã nhập?'), 'confirm dialog')
    assert.match(app.container.textContent, /Sẽ lưu 2 chỉ số/)
    assert.doesNotMatch(app.container.textContent, /\d đ/, 'no money in the readings dialog (UI-06)')
    dispatch(app.container, dialogButton(app, 'Lưu chỉ số'), 'click')
    await until(() => app.container.textContent.includes('1 chỉ số đã lưu, 1 chỉ số lỗi'), 'summary')
    assert.deepEqual(posted.map(item => [item.roomId, item.invoiceId, item.kind, item.value]), [[17, 7, 'ELECTRIC', 1368], [18, 8, 'ELECTRIC', 1200]])
    assert.equal(byName(app.container, '7:ELECTRIC').value, '')
    assert.equal(byName(app.container, '8:ELECTRIC').value, '1200')
    assert.match(app.container.textContent, /Chỉ số mới nhỏ hơn chỉ số trước/)
    assert.equal(app.calls.filter(c => c.method === 'POST').length, 1)
  } finally { await app.stop() }
})

const row = (id, extra = {}) => ({ id, code: `TT${id}`, type: 'MONTHLY', status: 'UNPAID', overdue: false, periodNo: 2, periodStart: '2026-10-01', periodEnd: '2026-10-31',
  issueDate: '2026-11-01', dueDate: '2026-11-30', total: 3_119_000, contract: { id: 31, code: 'HD31', room: { id: 8, code: 'P101' }, building: { id: 2, code: 'B2', name: 'Tòa A' },
    tenant: { id: 15, fullName: 'Người thuê', phone: '0900000001' } }, ...extra })

test('FE-P4-03/UI-02/D-40: labels follow 16-billing and "Quá hạn" comes only from the BE flag; filters reach the query', async () => {
  const app = await mountContractPage(InvoicesPage, { path: '/ql/hoa-don', rules: [{ prefix: '/invoices?', handler: () => ok([
    row(1, { status: 'DRAFT' }), row(2), row(3, { overdue: true }), row(4, { status: 'PAID' }), row(5, { status: 'SETTLED' }), row(6, { status: 'CANCELLED' }),
  ], { page: 1, limit: 20, total: 6 }) }] })
  try {
    await until(() => app.container.textContent.includes('TT6'), 'rows')
    for (const label of ['Nháp', 'Chưa thanh toán', 'Quá hạn', 'Đã thanh toán', 'Đã quyết toán', 'Đã hủy']) assert.ok(app.container.textContent.includes(label), label)
    assert.match(app.container.textContent, /3\.119\.000 đ/)
    assert.equal(queryOf(app.calls[0].url).get('status'), null, 'Q-P4-56: no default filter')
    assert.ok(find(app.container, n => n.getAttribute('href') === '/ql/hoa-don/3').length)
    selectOption(app.container, find(app.container, n => n.tagName === 'SELECT')[0], 'OVERDUE')
    await until(() => queryOf(app.calls.at(-1).url).get('overdue') === 'true', 'overdue filter')
    assert.equal(queryOf(app.calls.at(-1).url).get('status'), null)
  } finally { await app.stop() }
})

const detail = (extra = {}) => ({ ...row(9), cancelReason: null, replacesId: null, replacedById: null,
  lines: [{ kind: 'RENT', label: 'Tiền phòng 01/10–31/10', quantity: 1, unitPrice: 2_500_000, amount: 2_500_000 }, { kind: 'ELECTRIC', label: 'Điện bậc 1 (0–50 kWh)', quantity: 50, unitPrice: 3_000, amount: 150_000 }],
  meterReadings: [{ id: 1, kind: 'ELECTRIC', value: 1368, readOn: '2026-10-31', isMeterReplaced: false, oldMeterFinal: null, photoUrl: null }],
  payment: null, vietqr: { bankBin: '970436', accountNo: '0000000000', accountName: 'TRO THONG MINH', amount: 3_119_000, content: 'TT9' }, qrImageUrl: 'https://img.vietqr.io/x.png', ...extra })

test('FE-P4-04/BIL-10/BIL-11/UI-04/API-05: lines and total as sent, VietQR while UNPAID, manual payment confirms the BE total with one key', async () => {
  let paid = false
  const app = await mountContractPage(InvoiceDetailPage, { path: '/ql/hoa-don/9', routePath: '/ql/hoa-don/:id', rules: [
    { prefix: '/invoices/9/payment', method: 'POST', handler: () => { paid = true; return ok({ id: 1, amount: 3_119_000 }) } },
    { prefix: '/invoices/9', handler: () => ok(paid ? detail({ status: 'PAID', vietqr: null, qrImageUrl: null, payment: { amount: 3_119_000, method: 'CASH', source: 'MANUAL', paidAt: '2026-11-23T03:00:00Z' } }) : detail()) },
  ] })
  try {
    await until(() => app.container.textContent.includes('Tiền phòng 01/10–31/10'), 'lines')
    assert.match(app.container.textContent, /Tổng cộng3\.119\.000 đ/, 'the BE total, not a sum of the two lines (UI-06)')
    assert.match(app.container.textContent, /Nội dung chuyển khoản: TT9/)
    assert.ok(buttonByText(app.container, 'Nhắc') && buttonByText(app.container, 'Lập lại'))
    assert.equal(buttonByText(app.container, 'Phát hành'), undefined, 'Q-P4-61: only a DRAFT is issued')
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await until(() => app.container.textContent.includes('Xác nhận đã nhận tiền'), 'payment dialog')
    assert.match(app.container.textContent, /Đã nhận đủ 3\.119\.000 đ bằng Tiền mặt cho hóa đơn TT9/)
    dispatch(app.container, dialogButton(app, 'Đã nhận đủ tiền'), 'click')
    await until(() => app.container.textContent.includes('Đã thanh toán'), 'paid')
    const post = app.calls.find(c => c.method === 'POST')
    assert.ok(post.headers['Idempotency-Key'])
    assert.equal(app.container.textContent.includes('Nội dung chuyển khoản'), false, 'no QR once PAID')
  } finally { await app.stop() }
})

test('FE-P4-04/Q-P4-57/Q-P4-25: a second reminder shows the page wording; DEPOSIT has no reissue', async () => {
  const app = await mountContractPage(InvoiceDetailPage, { path: '/ql/hoa-don/9', routePath: '/ql/hoa-don/:id', rules: [
    { prefix: '/invoices/9/remind', method: 'POST', handler: () => fail(429, 'TOO_MANY_REQUESTS', 'Thao tác quá nhiều lần') },
    { prefix: '/invoices/9', handler: () => ok(detail({ type: 'DEPOSIT' })) },
  ] })
  try {
    await until(() => buttonByText(app.container, 'Nhắc'), 'remind button')
    assert.equal(buttonByText(app.container, 'Lập lại'), undefined)
    dispatch(app.container, buttonByText(app.container, 'Nhắc'), 'click')
    await until(() => dialogButton(app, 'Gửi nhắc'), 'remind dialog')
    dispatch(app.container, dialogButton(app, 'Gửi nhắc'), 'click')
    await until(() => app.container.textContent.includes('Hôm nay đã nhắc hóa đơn này, hãy thử lại vào ngày mai.'), 'own 429 wording')
  } finally { await app.stop() }
})

test('FE-P4-02..04/UI-06: the money pages never compute amounts or overdue dates', () => {
  for (const file of ['src/pages/staff/MetersPage.tsx', 'src/pages/staff/InvoicesPage.tsx', 'src/pages/staff/InvoiceDetailPage.tsx', 'src/features/invoices/InvoiceActions.tsx']) {
    const code = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(code, /\.(total|amount|unitPrice)\s*[-+*/]|[-+*/]\s*\w+\.(total|amount|unitPrice)\b/, file)
    assert.doesNotMatch(code, /dueDate\s*[<>]/, file)
  }
})
