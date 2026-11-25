import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, ok, fail, until, find } from '../p3/contracts-dom.mjs'
const { TenantInvoicesPage } = source('pages/tenant/TenantInvoicesPage.tsx')
const { TenantInvoiceDetailPage } = source('pages/tenant/TenantInvoiceDetailPage.tsx')
const { TenantMoneyBlock } = source('features/invoices/TenantMoneyBlock.tsx')

const contract = { id: 31, status: 'ACTIVE', code: 'HD31', room: { id: 8, code: 'P101' }, building: { id: 2, code: 'B2', name: 'Tòa A' } }
const row = (id, extra = {}) => ({ id, code: `TT${id}`, type: 'MONTHLY', status: 'PAID', overdue: false, periodNo: 1, periodStart: '2026-09-01', periodEnd: '2026-09-30',
  issueDate: '2026-10-01', dueDate: '2026-10-31', total: 3_119_000, contract, ...extra })
const tenant = { role: 'TENANT', user: { id: 15, role: 'TENANT', fullName: 'Người thuê', buildings: [] } }

test('FE-P4-10/30-frontend/UI-02: unpaid and overdue invoices come first; labels and money in Vietnamese', async () => {
  const app = await mountContractPage(TenantInvoicesPage, { path: '/thue/hoa-don', ...tenant, rules: [{ prefix: '/me/invoices?', handler: () => ok([
    row(3), row(4, { status: 'UNPAID' }), row(5, { status: 'UNPAID', overdue: true }), row(6, { status: 'SETTLED' })], { page: 1, limit: 100, total: 4 }) }] })
  try {
    await until(() => app.container.textContent.includes('TT6'), 'rows')
    const order = find(app.container, n => n.tagName === 'A' && /^\/thue\/hoa-don\/\d+$/.test(n.getAttribute('href') ?? '')).map(n => n.textContent)
    assert.deepEqual(order, ['TT5', 'TT4', 'TT3', 'TT6'])
    assert.equal(find(app.container, n => n.getAttribute?.('class')?.split(' ').includes('rooms-status--overdue'))[0]?.textContent, 'Quá hạn')
    for (const label of ['Quá hạn', 'Chưa thanh toán', 'Đã thanh toán', 'Đã quyết toán']) assert.ok(app.container.textContent.includes(label), label)
    assert.match(app.container.textContent, /3\.119\.000 đ/)
  } finally { await app.stop() }
})

for (const state of ['loading', 'empty', 'error']) test(`FE-P4-10/UI-03: tenant invoice list ${state}`, async () => {
  const handler = state === 'loading' ? () => new Promise(() => {}) : state === 'empty' ? () => ok([], { page: 1, limit: 100, total: 0 }) : () => fail(503, 'NETWORK_ERROR', 'Không tải được hóa đơn')
  const app = await mountContractPage(TenantInvoicesPage, { path: '/thue/hoa-don', ...tenant, rules: [{ prefix: '/me/invoices?', handler }] })
  try { await until(() => app.container.textContent.includes({ loading: 'Đang tải hóa đơn', empty: 'Bạn chưa có hóa đơn nào.', error: 'Không tải được hóa đơn' }[state]), state) }
  finally { await app.stop() }
})

const detail = (extra = {}) => ({ ...row(9, { status: 'UNPAID' }), cancelReason: null, replacesId: null, replacedById: null,
  lines: [{ kind: 'RENT', label: 'Tiền phòng 01/09–30/09', quantity: 1, unitPrice: 2_500_000, amount: 2_500_000, meta: {} },
    { kind: 'ELECTRIC', label: 'Điện bậc 2 (51–100 kWh)', quantity: 34, unitPrice: 3_500, amount: 119_000, meta: { tierNo: 2 } },
    { kind: 'SERVICE', label: 'Wifi', quantity: 1, unitPrice: 100_000, amount: 100_000, meta: {} }],
  meterReadings: [{ id: 1, kind: 'ELECTRIC', value: 1368, readOn: '2026-09-30', isMeterReplaced: false, oldMeterFinal: null, photoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/meters/2/8/a.webp' }],
  payment: null, vietqr: { bankBin: '970436', accountNo: '0000000000', accountName: 'TRO THONG MINH', amount: 3_119_000, content: 'TT9' }, qrImageUrl: 'https://img.vietqr.io/x.png', ...extra })

test('FE-P4-11/BIL-10/D-38/LOC-01: detail in English keeps service names as typed, translates fixed lines, shows VietQR and the meter photo', async () => {
  const app = await mountContractPage(TenantInvoiceDetailPage, { path: '/thue/hoa-don/9', routePath: '/thue/hoa-don/:id', language: 'en', ...tenant,
    rules: [{ prefix: '/me/invoices/9', handler: () => ok(detail()) }, { prefix: '/me/requests?', handler: () => ok([], { page: 1, limit: 100, total: 0 }) }] })
  try {
    await until(() => app.container.textContent.includes('Pay with VietQR'), 'detail')
    assert.match(app.container.textContent, /Rent/)
    assert.match(app.container.textContent, /Electricity, tier 2/)
    assert.match(app.container.textContent, /Wifi/)
    assert.match(app.container.textContent, /3\.119\.000 đ/, 'money format is the same in English (LOC-05)')
    assert.match(app.container.textContent, /30\/09\/2026/, 'dates stay dd/mm/yyyy (LOC-05)')
    assert.match(app.container.textContent, /TT9/)
    assert.ok(find(app.container, n => n.tagName === 'IMG' && n.getAttribute('alt') === 'VietQR code to pay TT9').length)
    assert.ok(find(app.container, n => n.tagName === 'IMG' && n.getAttribute('alt') === 'Electricity meter photo on 30/09/2026').length)
    assert.equal(/Báo lỗi thanh toán|Report a payment/.test(app.container.textContent), true, 'FE-P5-14: payment issue entry')
  } finally { await app.stop() }
})

test('ended contract with an unpaid final invoice has no payment issue form', async () => {
  const app = await mountContractPage(TenantInvoiceDetailPage, { path: '/thue/hoa-don/9', routePath: '/thue/hoa-don/:id', language: 'en', ...tenant,
    rules: [{ prefix: '/me/invoices/9', handler: () => ok(detail({ type: 'FINAL', contract: { ...contract, status: 'ENDED' } })) }] })
  try {
    await until(() => app.container.textContent.includes('TT9'), 'final invoice')
    assert.equal(app.container.textContent.includes('Report a payment issue'), false)
  } finally { await app.stop() }
})

test('FE-P4-11/BIL-10: a paid invoice shows no QR; Vietnamese keeps the BE line labels', async () => {
  const app = await mountContractPage(TenantInvoiceDetailPage, { path: '/thue/hoa-don/9', routePath: '/thue/hoa-don/:id', ...tenant,
    rules: [{ prefix: '/me/invoices/9', handler: () => ok(detail({ status: 'PAID', vietqr: null, qrImageUrl: null, payment: { amount: 3_119_000, method: 'BANK_TRANSFER', source: 'WEBHOOK', paidAt: '2026-10-05T03:00:00Z' } })) }] })
  try {
    await until(() => app.container.textContent.includes('Đã thanh toán 3.119.000 đ'), 'paid')
    assert.match(app.container.textContent, /Điện bậc 2 \(51–100 kWh\)/)
    assert.equal(app.container.textContent.includes('Thanh toán bằng VietQR'), false)
  } finally { await app.stop() }
})

test('FE-P4-08/30-frontend /thue: invoices to pay and the next billing date from the BE', async () => {
  const app = await mountContractPage(TenantMoneyBlock, { path: '/thue', props: { contractId: 31, scope: 'tenant' }, ...tenant, rules: [
    { prefix: '/me/invoices?', handler: () => ok([row(3), row(4, { status: 'UNPAID', overdue: true })], { page: 1, limit: 100, total: 2 }) },
    { prefix: '/me/contracts/31', handler: () => ok({ id: 31, nextBillingDate: '2026-12-01' }) },
  ] })
  try {
    await until(() => app.container.textContent.includes('Ngày thu kế tiếp: 01/12/2026'), 'next billing date')
    assert.match(app.container.textContent, /TT4/)
    assert.equal(app.container.textContent.includes('TT3'), false, 'only unpaid invoices')
  } finally { await app.stop() }
})
