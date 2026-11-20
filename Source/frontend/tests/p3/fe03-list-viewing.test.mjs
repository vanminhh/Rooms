import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, summaryFixture, selectOption, ok, fail, until, wait, find, buttonByText, byName, fill, dispatch, queryOf } from './contracts-dom.mjs'

const { ContractsPage } = source('pages/staff/ContractsPage.tsx')
const { ViewingCard } = source('features/viewings/ViewingCard.tsx')
const listRule = handler => ({ prefix: '/contracts', method: 'GET', handler })
const result = (rows = [summaryFixture()], changes = {}) => ok(rows, { page: 1, limit: 20, total: rows.length, ...changes })

test('FE-P3-03/UI-03: list shows its loading state', async () => {
  const app = await mountContractPage(ContractsPage, { rules: [listRule(() => new Promise(() => {}))] })
  try { assert.match(app.container.textContent, /Đang tải hợp đồng/) } finally { await app.stop() }
})
test('FE-P3-03/UI-03: empty results offer contract creation', async () => {
  const app = await mountContractPage(ContractsPage, { rules: [listRule(() => result([]))] })
  try {
    await until(() => app.container.textContent.includes('Chưa có hợp đồng phù hợp'), 'empty')
    assert.ok(find(app.container, node => node.tagName === 'A' && node.getAttribute('href') === '/ql/hop-dong/moi').length)
  } finally { await app.stop() }
})
test('FE-P3-03/UI-03/05: API error stays visible and retry reloads the list', async () => {
  let attempts = 0
  const app = await mountContractPage(ContractsPage, { rules: [listRule(() => ++attempts === 1 ? fail(503, 'NETWORK_ERROR', 'Không tải được danh sách') : result())] })
  try {
    await until(() => app.container.textContent.includes('Không tải được danh sách'), 'error')
    dispatch(app.container, buttonByText(app.container, 'Thử lại'), 'click')
    await until(() => app.container.textContent.includes('HD000031'), 'retried')
    assert.equal(attempts, 2)
  } finally { await app.stop() }
})
test('FE-P3-03/UI-02: data displays contract status, server dates and money with a detail link', async () => {
  const app = await mountContractPage(ContractsPage, { rules: [listRule(() => result())] })
  try {
    await until(() => app.container.textContent.includes('HD000031'), 'data')
    for (const text of ['Giữ chỗ', '31/01/2027', '29/04/2027', '2.500.000 đ', 'Test signer', 'P101']) assert.ok(app.container.textContent.includes(text), text)
    assert.ok(find(app.container, node => node.getAttribute('href') === '/ql/hop-dong/31').length)
    assert.equal(queryOf(app.calls[0].url).get('buildingId'), '2')
  } finally { await app.stop() }
})
test('FE-P3-03/API-02: pagination uses metadata; search and status changes reset to page one', async () => {
  const app = await mountContractPage(ContractsPage, { rules: [listRule(call => result([summaryFixture()], { page: Number(queryOf(call.url).get('page')), total: 41 }))] })
  try {
    await until(() => app.container.textContent.includes('HD000031'), 'data')
    dispatch(app.container, buttonByText(app.container, 'Trang sau'), 'click')
    await until(() => app.calls.some(call => queryOf(call.url).get('page') === '2'), 'page two')
    fill(app.container, byName(app.container, 'q'), '  Test & P101  ')
    dispatch(app.container, find(app.container, node => node.tagName === 'FORM')[0], 'submit')
    await until(() => app.calls.some(call => queryOf(call.url).get('q') === 'Test & P101'), 'search')
    assert.equal(queryOf(app.calls.at(-1).url).get('page'), '1')
    selectOption(app.container, find(app.container, node => node.tagName === 'SELECT')[0], 'ACTIVE')
    await until(() => queryOf(app.calls.at(-1).url).get('status') === 'ACTIVE', 'status')
    assert.equal(queryOf(app.calls.at(-1).url).get('page'), '1')
  } finally { await app.stop() }
})
test('FE-P3-03/SCOPE-02: changing building restarts its list on page one', async () => {
  const app = await mountContractPage(ContractsPage, { rules: [listRule(() => result([summaryFixture()], { total: 41 }))] })
  try {
    await until(() => app.container.textContent.includes('HD000031'), 'data')
    dispatch(app.container, buttonByText(app.container, 'Trang sau'), 'click')
    await until(() => queryOf(app.calls.at(-1).url).get('page') === '2', 'page two')
    await app.setSelection(3)
    await until(() => queryOf(app.calls.at(-1).url).get('buildingId') === '3', 'building three')
    assert.equal(queryOf(app.calls.at(-1).url).get('page'), '1')
  } finally { await app.stop() }
})

for (const change of ['account', 'building scope']) test(`FE-P3-03/SCOPE-02: ${change} change cannot display the previous account cache with All buildings selected`, async () => {
  const account = { id: 12, role: 'MANAGER', buildings: [{ id: 2 }, { id: 3 }] }
  let attempts = 0
  const app = await mountContractPage(ContractsPage, { user: account, selection: null, rules: [listRule(() => ++attempts === 1 ? result([summaryFixture({ code: 'PRIVATE-A' })]) : new Promise(() => {}))] })
  try {
    await until(() => app.container.textContent.includes('PRIVATE-A'), 'account A data')
    await app.setUser({ ...account, ...(change === 'account' ? { id: 13 } : { buildings: [{ id: 4 }, { id: 5 }] }) })
    await until(() => attempts === 2, 'fresh scope request')
    assert.doesNotMatch(app.container.textContent, /PRIVATE-A|Test signer|0900000991/)
    assert.match(app.container.textContent, /Đang tải hợp đồng/)
    assert.equal(queryOf(app.calls.at(-1).url).has('buildingId'), false)
  } finally { await app.stop() }
})

const viewing = status => ({ id: 11, roomId: 8, roomCode: 'P101', buildingId: 2, buildingName: 'Building 2',
  guestName: 'Viewing snapshot', guestPhone: '0900000992', guestEmail: 'guest@example.test',
  guestAccount: { fullName: 'Current guest', phone: '0900000993' }, visitAt: new Date(Date.now() + 86400_000).toISOString(),
  visitDate: null, timeSlot: null, source: 'WEB', status, statusLabel: status, note: null, outcomeNote: null,
})
for (const status of ['NEW', 'CONFIRMED', 'DONE', 'WON', 'LOST', 'CANCELLED']) {
  test(`FE-P3-03/VIEW-05: Chốt eligibility for ${status}`, async () => {
    const app = await mountContractPage(ViewingCard, { path: '/ql/lich-hen', props: { viewing: viewing(status) } })
    try {
      const button = buttonByText(app.container, 'Chốt')
      assert.equal(!!button, ['CONFIRMED', 'DONE'].includes(status))
      if (button) {
        assert.equal(button.hasAttribute('disabled'), false)
        dispatch(app.container, button, 'click')
        await until(() => app.router.state.location.pathname === '/ql/hop-dong/moi', 'creation URL')
        assert.equal(app.router.state.location.search, '', 'No personal data in the query string')
        assert.deepEqual(app.router.state.location.state.viewing, { viewingId: 11, roomId: 8, roomCode: 'P101', buildingId: 2,
          signer: { fullName: 'Current guest', phone: '0900000993', email: 'guest@example.test' },
          guestAccount: { fullName: 'Current guest', phone: '0900000993' },
        })
        assert.equal(app.calls.length, 0, 'Viewing is not marked WON before contract creation')
      }
    } finally { await app.stop() }
  })
}

test('FE-P3-03/VIEW-05: manual viewing prefill uses its guest fields without inventing an account', async () => {
  const { viewingContractPrefill } = source('features/contracts/prefill.ts')
  const value = viewingContractPrefill({ ...viewing('CONFIRMED'), source: 'MANUAL', guestAccount: undefined, guestEmail: null })
  assert.deepEqual(value.signer, { fullName: 'Viewing snapshot', phone: '0900000992' })
  assert.equal('guestAccount' in value, false)
  await wait(0)
})
