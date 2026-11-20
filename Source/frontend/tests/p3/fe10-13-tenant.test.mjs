import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, detailFixture, summaryFixture, selectOption, ok, fail, until, find, byName, fill, dispatch, buttonByText, formFor, queryOf } from './contracts-dom.mjs'

const { TenantHomePage } = source('pages/tenant/TenantHomePage.tsx')
const { TenantContractsPage } = source('pages/tenant/TenantContractsPage.tsx')
const { TenantContractDetailPage } = source('pages/tenant/TenantContractDetailPage.tsx')
const { TenantContractPrintPage } = source('pages/tenant/TenantContractPrintPage.tsx')
const tenant = { id: 15, role: 'TENANT', fullName: 'Test signer', buildings: [] }
const mount = (Page, options) => mountContractPage(Page, { user: tenant, ...options })

for (const language of ['vi', 'en']) {
  test(`FE-P3-11/LOC-05/BIL-10: ${language} overview before move-in displays the server QR, dates and money`, async () => {
    const app = await mount(TenantHomePage, { language, path: '/thue', rules: [
      { prefix: '/me/contracts/31', handler: () => ok(detailFixture()) },
      { prefix: '/me/contracts?', handler: () => ok([summaryFixture()], { page: 1, limit: 100, total: 1 }) },
    ] })
    try {
      await until(() => app.container.textContent.includes('TT82'), 'deposit reference')
      for (const text of ['31/01/2027', '29/04/2027', '22/11/2026', '2.500.000 đ']) assert.ok(app.container.textContent.includes(text), text)
      assert.ok(find(app.container, n => n.getAttribute('src') === 'https://example.test/qr.png').length)
      assert.equal(app.calls.some(c => c.url.startsWith('/api/v1/contracts')), false)
    } finally { await app.stop() }
  })
  test(`FE-P3-11/A-16: ${language} overview with no contracts remains usable`, async () => {
    const app = await mount(TenantHomePage, { language, path: '/thue', rules: [{ prefix: '/me/contracts?', handler: () => ok([], { page: 1, limit: 100, total: 0 }) }] })
    try { await until(() => app.container.textContent.includes(language === 'vi' ? 'Bạn chưa có hợp đồng nào' : 'You have no contracts yet'), 'empty') }
    finally { await app.stop() }
  })
}

test('FE-P3-11/D-26: overview selects current contracts and can switch to past rooms loaded from later pages', async () => {
  const active = detailFixture({ status: 'ACTIVE', movedInAt: '2027-01-31T01:00:00Z', depositInvoice: { ...detailFixture().depositInvoice, status: 'PAID', vietqr: null, qrImageUrl: null } })
  const ended = detailFixture({ id: 32, code: 'HD000032', status: 'ENDED', room: { id: 9, code: 'P102' } })
  const app = await mount(TenantHomePage, { path: '/thue', language: 'en', rules: [
    { prefix: '/me/contracts/31', handler: () => ok(active) }, { prefix: '/me/contracts/32', handler: () => ok(ended) },
    { prefix: '/me/contracts?', handler: c => queryOf(c.url).get('page') === '1' ? ok([active], { page: 1, limit: 1, total: 2 }) : ok([ended], { page: 2, limit: 1, total: 2 }) },
  ] })
  try {
    await until(() => app.container.textContent.includes('HD000031'), 'active overview')
    assert.equal(find(app.container, n => n.tagName === 'IMG').length, 0, 'paid deposits have no payment QR')
    selectOption(app.container, find(app.container, n => n.tagName === 'SELECT')[0], '32')
    await until(() => app.container.textContent.includes('HD000032'), 'past room')
    assert.match(app.container.textContent, /This contract is closed/)
    assert.ok(app.calls.some(c => queryOf(c.url).get('page') === '2'))
  } finally { await app.stop() }
})

test('FE-P3-12/API-02: own list separates current/past and uses server pagination', async () => {
  const app = await mount(TenantContractsPage, { path: '/thue/hop-dong', language: 'en', rules: [{ prefix: '/me/contracts?', handler: c => ok([summaryFixture(), summaryFixture({ id: 32, status: 'ENDED' })], { page: Number(queryOf(c.url).get('page')), limit: 20, total: 21 }) }] })
  try {
    await until(() => app.container.textContent.includes('Ended and cancelled contracts'), 'groups')
    assert.match(app.container.textContent, /Current contracts/)
    dispatch(app.container, buttonByText(app.container, 'Next page'), 'click')
    await until(() => queryOf(app.calls.at(-1).url).get('page') === '2', 'second page')
  } finally { await app.stop() }
})

test('FE-P3-12/CON-16: tenant detail masks roommates, keeps vehicles read-only, fetches scan only on click', async () => {
  const data = detailFixture({ occupants: [...detailFixture().occupants, { ...detailFixture().occupants[0], id: 52, isSigner: false, fullName: 'Roommate', idNumberLast4: '1122' }],
    vehicles: [{ id: 61, plate: '29A12345', type: 'MOTORBIKE', serviceId: 6, registeredAt: '2027-01-31', removedAt: null, isActive: true }] })
  const app = await mount(TenantContractDetailPage, { path: '/thue/hop-dong/31', routePath: '/thue/hop-dong/:id', language: 'en', rules: [
    { prefix: '/me/contracts/31/scan', handler: () => ok({ url: 'https://example.test/private-scan', expiresAt: new Date(Date.now() + 300_000).toISOString() }) },
    { prefix: '/me/contracts/31', handler: () => ok(data) },
  ] })
  try {
    await until(() => app.container.textContent.includes('Roommate'), 'detail')
    assert.match(app.container.textContent, /•••• 6789|29A12345/)
    assert.equal(app.container.textContent.includes('1122'), false)
    assert.equal(app.calls.some(c => c.url.includes('/scan') || c.url.includes('/id-photos')), false)
    assert.equal(find(app.container, n => n.tagName === 'IMG' && n.getAttribute('src')?.includes('private')).length, 0)
    assert.equal(buttonByText(app.container, 'Sửa xe'), undefined)
    dispatch(app.container, buttonByText(app.container, 'View signed contract'), 'click')
    await until(() => find(app.container, n => n.getAttribute('href') === 'https://example.test/private-scan').length, 'scan')
    assert.equal(app.calls.some(c => c.url.includes('/id-photos')), false)
  } finally { await app.stop() }
})

test('FE-P3-12/CON-13/15: tenant adds a roommate with no ID/photos and clears sensitive inputs after success', async () => {
  const app = await mount(TenantContractDetailPage, { path: '/thue/hop-dong/31', routePath: '/thue/hop-dong/:id', language: 'en', rules: [
    { prefix: '/me/contracts/31/occupants', method: 'POST', handler: () => ok({ id: 52 }) },
    { prefix: '/me/contracts/31', method: 'GET', handler: () => ok(detailFixture()) },
  ] })
  try {
    await until(() => byName(app.container, 'fullName'), 'roommate form')
    fill(app.container, byName(app.container, 'fullName'), 'New roommate')
    fill(app.container, byName(app.container, 'moveInDate'), '2027-02-01')
    dispatch(app.container, formFor(app.container, 'fullName'), 'submit')
    await until(() => app.container.textContent.includes('Roommate added.'), 'saved')
    const body = JSON.parse(app.calls.find(c => c.method === 'POST').body)
    assert.deepEqual(body, { fullName: 'New roommate', phone: null, dateOfBirth: null, moveInDate: '2027-02-01' })
    assert.equal(byName(app.container, 'fullName').value, '')
    assert.equal(byName(app.container, 'idNumber').value, '')
    assert.equal(app.calls.some(c => c.url.includes('/requests') || c.url.includes('/files/sign')), false)
  } finally { await app.stop() }
})

for (const status of ['ENDED', 'CANCELLED']) test(`FE-P3-12/CON-13/15: ${status} detail has no roommate mutation form`, async () => {
  const app = await mount(TenantContractDetailPage, { path: '/thue/hop-dong/31', routePath: '/thue/hop-dong/:id', rules: [{ prefix: '/me/contracts/31', handler: () => ok(detailFixture({ status })) }] })
  try { await until(() => app.container.textContent.includes('HD000031'), 'history'); assert.equal(byName(app.container, 'fullName'), undefined) }
  finally { await app.stop() }
})

test('FE-P3-12/SCOPE-03: foreign tenant contract displays not-found without any personal data/form', async () => {
  const app = await mount(TenantContractDetailPage, { path: '/thue/hop-dong/99', routePath: '/thue/hop-dong/:id', language: 'en', rules: [{ prefix: '/me/contracts/99', handler: () => fail(404, 'NOT_FOUND', 'Not found') }] })
  try {
    await until(() => app.container.textContent.includes('Contract not found.'), 'not found')
    assert.equal(byName(app.container, 'fullName'), undefined)
    assert.doesNotMatch(app.container.textContent, /Test signer|0900000991/)
  } finally { await app.stop() }
})

test('FE-P3-13/LOC-01/CON-22: English print controls retain Vietnamese contract content and draft warning', async () => {
  const app = await mount(TenantContractPrintPage, { path: '/thue/hop-dong/31/in', routePath: '/thue/hop-dong/:id/in', language: 'en', rules: [{ prefix: '/me/contracts/31/print', handler: () => ok({ content: 'HỢP ĐỒNG THUÊ PHÒNG\nHD000031', isDraft: true }) }] })
  try {
    await until(() => app.container.textContent.includes('HỢP ĐỒNG THUÊ PHÒNG'), 'Vietnamese document')
    assert.match(app.container.textContent, /BẢN NHÁP – chưa dùng để ký/)
    assert.ok(buttonByText(app.container, 'Print / Save PDF'))
  } finally { await app.stop() }
})

test('FE-P3-12/UI-12: switching locale translates roommate client errors without clearing input values', async () => {
  const app = await mount(TenantContractDetailPage, { path: '/thue/hop-dong/31', routePath: '/thue/hop-dong/:id', rules: [{ prefix: '/me/contracts/31', handler: () => ok(detailFixture()) }] })
  try {
    await until(() => byName(app.container, 'idNumber'), 'form')
    fill(app.container, byName(app.container, 'fullName'), 'Roommate name')
    fill(app.container, byName(app.container, 'idNumber'), '123')
    dispatch(app.container, formFor(app.container, 'fullName'), 'submit')
    await until(() => app.container.textContent.includes('Số CCCD phải gồm đúng 12 chữ số.'), 'Vietnamese validation')
    await app.setLanguage('en')
    await until(() => app.container.textContent.includes('The ID number must have exactly 12 digits.'), 'English validation')
    assert.equal(byName(app.container, 'idNumber').value, '123')
    assert.equal(byName(app.container, 'fullName').value, 'Roommate name')
    assert.equal(app.calls.some(c => c.method === 'POST'), false)
  } finally { await app.stop() }
})
