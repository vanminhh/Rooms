import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, ok, fail, until, find, buttonByText, dispatch, fill, byName, queryOf } from '../p3/contracts-dom.mjs'

const { AuditPage } = source('pages/staff/AuditPage.tsx')
const { SettingsPage } = source('pages/staff/SettingsPage.tsx')
test('restoring one email language preserves other templates and locales', async () => {
  const template = { subject: 'Code', text: '{code}' }
  const data = { bank_account: null, default_contact: null, contract_template: { content: 'Mẫu', isDraft: true },
    webhook: { provider: 'SEPAY', enabled: false }, email_templates: { emailCode: { vi: template, en: template }, passwordReset: { en: { subject: 'Reset', text: '{url}' } } } }
  const app = await mountContractPage(SettingsPage, { role: 'BOSS', rules: [
    { prefix: '/settings', method: 'GET', handler: () => ok(data) },
    { prefix: '/settings', method: 'PATCH', handler: () => ok({}) },
  ] })
  try {
    const root = app.container
    await until(() => buttonByText(root, 'Dùng lại mẫu mặc định'), 'stored template')
    dispatch(root, buttonByText(root, 'Dùng lại mẫu mặc định'), 'click')
    await until(() => !buttonByText(root, 'Dùng lại mẫu mặc định'), 'reset locale')
    dispatch(root, find(root, n => n.tagName === 'FORM').at(-1), 'submit')
    await until(() => buttonByText(root, 'Xác nhận lưu'), 'confirmation')
    dispatch(root, buttonByText(root, 'Xác nhận lưu'), 'click')
    await until(() => root.textContent.includes('Đã lưu.'), 'saved')
    assert.deepEqual(JSON.parse(app.calls.find(c => c.method === 'PATCH').body), { key: 'email_templates',
      value: { emailCode: { en: template }, passwordReset: data.email_templates.passwordReset } })
  } finally { await app.stop() }
})
test('audit filters apply on submit, reset paging and preserve snapshot values and the full log ID', async () => {
  const row = { id: '9223372036854775806', action: 'invoice.reissue', entity: 'invoice', entityId: 9, actor: null,
    createdAt: '2026-11-25T02:00:00Z', before: null, after: { changes: [{ total: 225000 }] } }
  const app = await mountContractPage(AuditPage, { role: 'BOSS', rules: [{ prefix: '/audit-logs?', handler: c => {
    const page = Number(queryOf(c.url).get('page'))
    return ok([row], { page, limit: 20, total: 25 })
  } }] })
  try {
    const root = app.container
    await until(() => root.textContent.includes(row.id), 'exact id')
    assert.ok(root.textContent.includes('225000'))
    assert.ok(find(root, n => n.tagName === 'SUMMARY')[0].textContent.includes('Phát hành lại hóa đơn'), 'AUD-02 Vietnamese label')
    dispatch(root, buttonByText(root, 'Trang sau'), 'click')
    await until(() => app.calls.some(c => queryOf(c.url).get('page') === '2'), 'page two')
    fill(root, byName(root, 'entity'), 'invoice')
    dispatch(root, find(root, n => n.tagName === 'FORM')[0], 'submit')
    await until(() => app.calls.some(c => queryOf(c.url).get('entity') === 'invoice' && queryOf(c.url).get('page') === '1'), 'filtered first page')
  } finally { await app.stop() }
})

test('Boss bank settings validate fields, confirm, display API field errors and retry only the bank block', async () => {
  const data = { bank_account: { bankBin: '970422', bankName: 'MB', accountNo: '00001', accountName: 'ROOMS' },
    default_contact: null, email_templates: {}, contract_template: { content: 'Mẫu', isDraft: true }, webhook: { provider: 'SEPAY', enabled: true } }
  const writes = []
  const app = await mountContractPage(SettingsPage, { role: 'BOSS', rules: [
    { prefix: '/settings', method: 'GET', handler: () => ok(data) },
    { prefix: '/settings', method: 'PATCH', handler: c => {
      writes.push(JSON.parse(c.body))
      return writes.length === 1 ? fail(400, 'VALIDATION_FAILED', 'Không thể lưu', { 'value.bankBin': 'BIN chưa hợp lệ' }) : ok(writes[1])
    } },
  ] })
  try {
    const root = app.container
    await until(() => byName(root, 'bankBin'), 'settings')
    assert.ok(root.textContent.includes('BẢN NHÁP - chưa dùng để ký'))
    const form = find(root, n => n.tagName === 'FORM')[0]
    const dialog = () => find(root, n => n.attributes.role === 'dialog')[0]
    fill(root, byName(root, 'bankBin'), '99')
    dispatch(root, form, 'submit')
    await until(() => byName(root, 'bankBin').getAttribute('aria-invalid') === 'true', 'inline validation')
    assert.equal(writes.length, 0)
    fill(root, byName(root, 'bankBin'), '970400')
    async function preview() { dispatch(root, form, 'submit'); await until(dialog, 'confirmation') }
    await preview()
    dispatch(root, buttonByText(dialog(), 'Hủy'), 'click')
    await until(() => !dialog(), 'cancellation')
    assert.equal(writes.length, 0)
    await preview()
    dispatch(root, buttonByText(dialog(), 'Xác nhận lưu'), 'click')
    await until(() => root.textContent.includes('BIN chưa hợp lệ'), 'server field error')
    assert.equal(byName(root, 'bankBin').getAttribute('aria-invalid'), 'true')
    await preview()
    dispatch(root, buttonByText(dialog(), 'Xác nhận lưu'), 'click')
    await until(() => root.textContent.includes('Đã lưu.'), 'saved')
    assert.deepEqual(writes[1], { key: 'bank_account', value: { ...data.bank_account, bankBin: '970400' } })
  } finally { await app.stop() }
})
