import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, ok, until, find, buttonByText, dispatch, fill, queryOf, isDisabled, fakeDocument } from '../p3/contracts-dom.mjs'

const { ReportsPage } = source('pages/staff/ReportsPage.tsx')
// The test loader compiles TS on demand. Load the chart chunk before measuring DOM updates.
source('features/reports/ReportChart.tsx')
const money = { months: [], outstanding: 135700, overdue: 1200, depositsHeld: 890000 }
const occupancy = { occupied: 7, rooms: 10, percent: 70 }
const invoice = { id: 8, code: 'TT008', type: 'MONTHLY', total: 1200, dueDate: '2026-10-09',
  contract: { building: { name: 'Tòa A' }, room: { code: 'A01' } } }

function mockChartDimensions(t, width) {
  const proto = Object.getPrototypeOf(fakeDocument.createElement('div'))
  proto.getBoundingClientRect = () => ({ width, height: 240, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 240 })
  proto.getElementsByClassName = function (name) { return find(this, n => (n.getAttribute('class') ?? '').split(' ').includes(name)) }
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  t.after(() => { delete proto.getBoundingClientRect; delete proto.getElementsByClassName; delete globalThis.ResizeObserver })
}

test('staff dashboard charts load both reports for the selected building', async t => {
  mockChartDimensions(t, 360)
  const { DashboardCharts } = source('features/reports/DashboardCharts.tsx')
  const app = await mountContractPage(DashboardCharts, { props: { scope: 'manager', buildingId: 2 }, rules: [
    { prefix: '/reports/occupancy?', handler: () => ok(occupancy) },
    { prefix: '/reports/revenue?', handler: c => ok({ ...money, months: [{ month: queryOf(c.url).get('to'), revenue: 45000, costs: 5000, profit: 40000 }] }) },
  ] })
  try {
    await until(() => find(app.container, n => n.tagName === 'SVG').length >= 2, 'dashboard charts', 15000)
    assert.ok(app.container.textContent.includes('45.000') && app.container.textContent.includes('135.700'))
    assert.ok(app.calls.every(c => queryOf(c.url).get('buildingId') === '2'))
  } finally { await app.stop() }
})

for (const role of ['MANAGER', 'BOSS']) test('building reports and overdue actions for ' + role, async t => {
  mockChartDimensions(t, role === 'MANAGER' ? 320 : 960)
  const writes = []
  const app = await mountContractPage(ReportsPage, { path: '/ql/bao-cao', role, rules: [
    { prefix: '/reports/revenue?', handler: call => {
      const month = queryOf(call.url).get('to')
      const totals = { ...money, months: [{ month, revenue: 45000, costs: 68000, profit: -23000 }] }
      return ok({ ...totals, comparison: [{ ...totals, name: 'Tòa A', buildingId: 2 }] })
    } },
    { prefix: '/reports/occupancy?', handler: () => ok({ ...occupancy, comparison: [{ ...occupancy, buildingId: 2, name: 'Tòa A' }] }) },
    { prefix: '/invoices?', handler: () => ok(writes.length ? [] : [invoice], { page: 1, limit: 20, total: writes.length ? 0 : 1 }) },
    { prefix: '/invoices/8/cancel', method: 'POST', handler: c => { writes.push(JSON.parse(c.body)); return ok({ id: 8 }) } },
  ] })
  const root = app.container
  try {
    await until(() => root.textContent.includes('135.700') && root.textContent.includes('7/10'), 'API balances and occupancy', 15000)
    assert.ok(root.textContent.includes('-23.000'))
    await until(() => find(root, n => n.tagName === 'SVG').length >= 2, 'occupancy and revenue charts', 15000)
    assert.equal(root.textContent.includes('So sánh theo tòa'), role === 'BOSS')
    assert.ok(app.calls.every(c => queryOf(c.url).get('buildingId') === '2'))
    if (role === 'MANAGER') {
      assert.equal(app.calls.some(c => c.url.includes('/invoices?')), false)
      return
    }
    await until(() => buttonByText(root, 'Cất'), 'overdue item')
    dispatch(root, buttonByText(root, 'Cất'), 'click')
    await until(() => buttonByText(root, 'Hủy'), 'archive confirmation')
    dispatch(root, buttonByText(root, 'Hủy'), 'click')
    assert.equal(app.calls.some(c => c.method === 'POST'), false)
    dispatch(root, buttonByText(root, 'Xóa'), 'click')
    await until(() => buttonByText(root, 'Tiếp tục'), 'reason form')
    assert.ok(isDisabled(buttonByText(root, 'Tiếp tục')))
    fill(root, find(root, n => n.tagName === 'INPUT' && n.type !== 'month').at(-1), '  Sai kỳ  ')
    dispatch(root, find(root, n => n.tagName === 'FORM')[0], 'submit')
    const dialog = () => find(root, n => n.attributes.role === 'dialog')[0]
    await until(dialog, 'confirm cancellation')
    dispatch(root, buttonByText(dialog(), 'Xóa'), 'click')
    await until(() => root.textContent.includes('Không có hóa đơn quá hạn'), 'refreshed list')
    assert.deepEqual(writes, [{ reason: 'Sai kỳ' }])
  } finally { await app.stop() }
})
