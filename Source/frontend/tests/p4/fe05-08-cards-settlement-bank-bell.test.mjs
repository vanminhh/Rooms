import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, ok, fail, until, find, byName, buttonByText, dispatch, fill, detailFixture, React } from '../p3/contracts-dom.mjs'
const { StaffHomePage } = source('pages/staff/StaffHomePage.tsx')
const { SettlementCard } = source('features/contracts/SettlementCard.tsx')
const { BankTransactionsPage } = source('pages/staff/BankTransactionsPage.tsx')
const { NotificationBell } = source('features/notifications/NotificationBell.tsx')

const lastButton = (app, label) => find(app.container, n => n.tagName === 'BUTTON' && n.textContent.trim() === label).at(-1)
const ref = { id: 31, code: 'HD31', room: { id: 8, code: 'P101' }, building: { id: 2, code: 'B2', name: 'Tòa A' }, tenant: { id: 15, fullName: 'Người thuê', phone: '0900000001' } }
const dashboard = (money = {}) => ({ newViewings: { count: 0, items: [] }, overlappingViewings: { count: 0, items: [] }, depositCancelledViewings: { count: 0, items: [] },
  unpaidDeposits: { count: 0, items: [] }, pendingPrices: null, ...money })

test('FE-P4-05/NOTI-06/BIL-21: money cards show API counts; "Tạo hóa đơn kỳ này" posts the period after a confirm and goes to Chốt chỉ số', async () => {
  let created = null
  const app = await mountContractPage(StaffHomePage, { path: '/ql', rules: [
    { prefix: '/contracts/31/monthly-invoices', method: 'POST', handler: c => { created = JSON.parse(c.body); return ok({ id: 77 }) } },
    { prefix: '/dashboard', handler: () => ok(dashboard({
      awaitingReadings: { count: 3, late: 2, items: [{ invoiceId: 70, code: 'TT70', periodNo: 2, periodStart: '2026-10-01', periodEnd: '2026-10-31', billingDate: '2026-11-01', late: true, contract: ref }] },
      missedPeriods: { count: created ? 0 : 1, items: created ? [] : [{ invoiceId: null, code: null, periodNo: 1, periodStart: '2026-09-01', periodEnd: '2026-09-30', billingDate: '2026-10-01', late: true, contract: ref }] },
      overdueInvoices: { count: 1, items: [{ id: 71, code: 'TT71', total: 3_119_000, dueDate: '2026-10-31', contract: ref }] },
      expiringContracts: { count: 0, items: [] }, expiredContracts: { count: 1, items: [{ ...ref, endDate: '2026-11-20' }] }, renewalsWaiting: { count: 0, items: [] },
    })) },
  ] })
  try {
    await until(() => app.container.textContent.includes('Kỳ chưa có hóa đơn'), 'money cards')
    assert.match(app.container.textContent, /3 hóa đơn tháng chờ chỉ số, trong đó 2 phòng đã quá ngày chốt/)
    assert.match(app.container.textContent, /TT71 · P101 · Người thuê · 3\.119\.000 đ/)
    assert.match(app.container.textContent, /Hợp đồng quá hạn/)
    assert.equal(app.container.textContent.includes('Hợp đồng sắp hết hạn'), false, 'empty groups are hidden')
    assert.ok(find(app.container, n => n.getAttribute('href') === '/ql/hoa-don?overdue=true').length)
    dispatch(app.container, buttonByText(app.container, 'Tạo hóa đơn kỳ này'), 'click')
    await until(() => lastButton(app, 'Tạo hóa đơn'), 'confirm')
    dispatch(app.container, lastButton(app, 'Tạo hóa đơn'), 'click')
    await until(() => app.container.textContent.includes('Navigation target'), 'went to /ql/chi-so')
    assert.deepEqual(created, { periodNo: 1 })
  } finally { await app.stop() }
})

const settle = (extra = {}) => ({ dryRun: true, moveOutDate: '2026-11-23', periodNo: 3, lastPeriodAmount: 2_940_000, remainingRent: 7_500_000, previousDebt: 0,
  deposit: 2_500_000, damages: 0, depositForfeit: 0, net: -7_940_000, refund: 0, lines: [{ kind: 'RENT', label: 'Tiền phòng 01/11–30/11', quantity: 1, unitPrice: 2_500_000, amount: 2_500_000 }],
  mergedDrafts: [], settledInvoices: [], settlementId: null, finalInvoice: null, ...extra })

test('FE-P4-06/BIL-13/UI-06/API-05: preview with dryRun (no key), confirm shows the BE numbers, the write sends one key', async () => {
  const calls = []
  const contract = detailFixture({ status: 'ACTIVE', settlement: null })
  const app = await mountContractPage(SettlementCard, { path: '/ql/hop-dong/31', props: { contract }, rules: [
    { prefix: '/contracts/31/settlement?dryRun=true', method: 'POST', handler: c => { calls.push(['dry', c.headers['Idempotency-Key']]); return ok(settle()) } },
    { prefix: '/contracts/31/settlement?dryRun=false', method: 'POST', handler: c => { calls.push(['real', c.headers['Idempotency-Key']]); return ok(settle({ dryRun: false, settlementId: 5, finalInvoice: { id: 90, code: 'TT90', total: 7_940_000, dueDate: '2026-11-30' } })) } },
  ] })
  try {
    dispatch(app.container, buttonByText(app.container, 'Mở quyết toán'), 'click')
    await until(() => byName(app.container, 'electric'), 'form')
    fill(app.container, byName(app.container, 'electric'), '1400')
    fill(app.container, byName(app.container, 'water'), '110')
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await until(() => buttonByText(app.container, 'Quyết toán'), 'preview')
    assert.match(app.container.textContent, /Khách còn phải trả7\.940\.000 đ/)
    assert.match(app.container.textContent, /Tiền phòng còn lại7\.500\.000 đ/)
    dispatch(app.container, buttonByText(app.container, 'Quyết toán'), 'click')
    await until(() => app.container.textContent.includes('Xác nhận quyết toán'), 'confirm')
    dispatch(app.container, lastButton(app, 'Quyết toán'), 'click')
    await until(() => calls.some(([kind]) => kind === 'real'), 'real write')
    assert.equal(calls[0][1], undefined, 'the dry run sends no Idempotency-Key')
    assert.ok(calls.find(([kind]) => kind === 'real')[1], 'the write sends one')
  } finally { await app.stop() }
})

test('FE-P4-06/Q-P4-54/Q-P4-8: after a reload the card reads the settlement; a positive net shows "Đã trả lại tiền" once', async () => {
  let paid = false
  const settlement = { id: 5, moveOutDate: '2026-11-23', deposit: 20_000_000, lastPeriodAmount: 5_156_000, remainingRent: 7_500_000, previousDebt: 0, damages: 0, depositForfeit: 0,
    net: 7_344_000, finalInvoiceId: null, refundPaidAt: null, note: null }
  const app = await mountContractPage(SettlementCard, { path: '/ql/hop-dong/31', props: { contract: detailFixture({ status: 'ENDED', settlement }) }, rules: [
    { prefix: '/settlements/5/refund-paid', method: 'POST', handler: () => { paid = true; return ok({ settlementId: 5, net: 7_344_000, refundPaidAt: '2026-11-23T03:00:00Z' }) } },
  ] })
  try {
    await until(() => app.container.textContent.includes('Phải trả lại khách7.344.000 đ'), 'saved settlement')
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await until(() => app.container.textContent.includes('Ghi một lần, không hoàn tác được'), 'confirm')
    dispatch(app.container, lastButton(app, 'Đã trả lại'), 'click')
    await until(() => paid, 'refund recorded')
  } finally { await app.stop() }
})

const tx = (id, extra = {}) => ({ id, provider: 'SEPAY', providerTxId: `X${id}`, amount: 2_799_000, content: 'chuyen tien phong', accountNumber: '0000000000',
  receivedAt: '2026-11-23T03:05:00Z', status: 'UNMATCHED', note: null, handledAt: null, invoice: null, ...extra })

test('FE-P4-07/BANK-05/Q-P4-59: unmatched first; assign picks an unpaid invoice of the same amount after a confirm', async () => {
  let assigned = null
  const app = await mountContractPage(BankTransactionsPage, { path: '/ql/giao-dich', role: 'BOSS', rules: [
    { prefix: '/bank-transactions/1/assign', method: 'POST', handler: c => { assigned = [JSON.parse(c.body), c.headers['Idempotency-Key']]; return ok({ status: 'ASSIGNED' }) } },
    { prefix: '/bank-transactions?', handler: () => ok([tx(1)], { page: 1, limit: 20, total: 1 }) },
    { prefix: '/invoices?', handler: c => ok([{ id: 44, code: 'TT44', type: 'MONTHLY', status: 'UNPAID', overdue: false, periodNo: 1, periodStart: null, periodEnd: null, issueDate: null, dueDate: null,
      total: 2_799_000, contract: { ...ref } }], { page: 1, limit: 50, total: 1, url: c.url }) },
  ] })
  try {
    await until(() => app.container.textContent.includes('chuyen tien phong'), 'list')
    assert.equal(new URL(app.calls[0].url, 'http://x').searchParams.get('status'), 'UNMATCHED')
    assert.equal(app.container.textContent.includes('Báo lỗi thanh toán'), false, 'Phase 5')
    dispatch(app.container, buttonByText(app.container, 'Gán vào hóa đơn'), 'click')
    await until(() => find(app.container, n => n.tagName === 'BUTTON' && n.textContent.startsWith('Gán vào TT44')).length, 'candidates')
    const q = new URL(app.calls.find(c => c.url.includes('/invoices?')).url, 'http://x').searchParams
    assert.deepEqual([q.get('status'), q.get('total')], ['UNPAID', '2799000'])
    dispatch(app.container, find(app.container, n => n.tagName === 'BUTTON' && n.textContent.startsWith('Gán vào TT44'))[0], 'click')
    await until(() => lastButton(app, 'Gán vào hóa đơn') && app.container.textContent.includes('Gán giao dịch vào hóa đơn?'), 'confirm')
    dispatch(app.container, lastButton(app, 'Gán vào hóa đơn'), 'click')
    await until(() => assigned, 'assigned')
    assert.deepEqual(assigned[0], { invoiceId: 44 })
    assert.ok(assigned[1])
  } finally { await app.stop() }
})

test('FE-P4-08a/NOTI-11/Q-P4-51: red dot with the count, read rows kept; opening an unread item marks it read once and follows its link', async () => {
  const reads = []
  let readAll = 0
  const items = [{ id: 1, kind: 'INVOICE_OVERDUE', title: 'Hóa đơn TT9 phòng P9 đã quá hạn 1 ngày', body: null, link: '/ql/hoa-don/9', readAt: null, createdAt: '2026-11-23T01:00:00Z' },
    { id: 2, kind: 'ANNOUNCEMENT', title: 'Còn 2 hóa đơn tháng chờ chỉ số', body: null, link: null, readAt: '2026-11-22T01:00:00Z', createdAt: '2026-11-22T01:00:00Z' }]
  const app = await mountContractPage(NotificationBell, { path: '/ql', rules: [
    { prefix: '/me/notifications/1/read', method: 'POST', handler: () => { reads.push(1); return ok({ id: 1, readAt: 'x' }) } },
    { prefix: '/me/notifications/read-all', method: 'POST', handler: () => { readAll++; return ok({ updated: 1 }) } },
    { prefix: '/me/notifications?', handler: () => ok(items, { page: 1, limit: 10, total: 2, unreadCount: 150 }) },
  ] })
  try {
    await until(() => find(app.container, n => n.getAttribute('aria-label') === 'Thông báo, 150 thông báo chưa đọc').length, 'bell label')
    assert.match(app.container.textContent, /99\+/)
    dispatch(app.container, find(app.container, n => n.getAttribute('aria-haspopup') === 'true')[0], 'click')
    await until(() => app.container.textContent.includes('Còn 2 hóa đơn tháng chờ chỉ số'), 'popup')
    assert.equal(find(app.container, n => n.tagName === 'BUTTON' && (n.getAttribute('class') ?? n.className ?? '').includes('notifications-item--read')).length, 1, 'read row dimmed, still a button')
    dispatch(app.container, find(app.container, n => n.tagName === 'BUTTON' && n.textContent.includes('Còn 2 hóa đơn'))[0], 'click')
    dispatch(app.container, buttonByText(app.container, 'Đánh dấu đã đọc tất cả'), 'click')
    await until(() => readAll === 1, 'read all')
    assert.deepEqual(reads, [], 'a read row is not marked again')
    dispatch(app.container, find(app.container, n => n.tagName === 'BUTTON' && n.textContent.includes('Hóa đơn TT9'))[0], 'click')
    await until(() => app.container.textContent.includes('Navigation target'), 'followed the link')
    assert.deepEqual(reads, [1])
    assert.ok(app.calls.every(c => c.url.startsWith('/api/v1/me/notifications')), 'only the inbox routes (Q-P4-18)')
  } finally { await app.stop() }
})

test('FE-P4-08a/UI-05: an inbox error stays inside the popup', async () => {
  const app = await mountContractPage(() => React.createElement('div', null, React.createElement(NotificationBell), React.createElement('p', null, 'Trang phía sau')), { path: '/ql', rules: [
    { prefix: '/me/notifications?', handler: () => fail(503, 'NETWORK_ERROR', 'Không tải được thông báo') },
  ] })
  try {
    dispatch(app.container, find(app.container, n => n.getAttribute('aria-haspopup') === 'true')[0], 'click')
    await until(() => app.container.textContent.includes('Không tải được thông báo'), 'error in popup')
    assert.match(app.container.textContent, /Trang phía sau/)
  } finally { await app.stop() }
})
