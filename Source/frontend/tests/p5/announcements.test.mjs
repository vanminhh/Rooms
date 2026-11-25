import assert from 'node:assert/strict'
import test from 'node:test'
import { source, mountContractPage, ok, fail, until, find, byName, buttonByText, selectOption, fill, dispatch, queryOf } from '../p3/contracts-dom.mjs'

const { AnnouncementsPage } = source('pages/staff/AnnouncementsPage.tsx')
const buildings = [{ id: 2, code: 'A', name: 'Tòa A' }, { id: 3, code: 'B', name: 'Tòa B' }]
const record = { id: 4, title: 'Lịch bảo trì', body: '<b>Mất nước</b>', createdAt: '2026-11-25T01:00:00Z',
  author: { id: 1, fullName: 'Mai' }, room: null, building: null, readCount: 2, recipientCount: 7 }

for (const [role, audience] of [['MANAGER', 'room'], ['MANAGER', 'building'], ['BOSS', 'chain']]) {
  test(`announcements: ${role} confirms the ${audience} audience, retries and refreshes history`, async () => {
    const writes = []
    const app = await mountContractPage(AnnouncementsPage, { selection: role === 'BOSS' ? 'all' : null, user: { id: 1, role, buildings }, rules: [
      { prefix: '/rooms?', handler: call => {
        const buildingId = Number(queryOf(call.url).get('buildingId'))
        return ok([{ id: buildingId * 10, buildingId, code: 'P' + buildingId }], { page: 1, limit: 100, total: 1 })
      } },
      { prefix: '/announcements?', handler: () => ok(writes.length === 2 ? [record] : [], { page: 1, limit: 20, total: writes.length === 2 ? 1 : 0 }) },
      { prefix: '/announcements', method: 'POST', handler: call => {
        writes.push(JSON.parse(call.body))
        return writes.length === 1 ? fail(403, 'OUT_OF_SCOPE', 'Phạm vi đã thay đổi') : ok(record)
      } },
    ] })
    const root = app.container
    const dialog = () => find(root, n => n.attributes.role === 'dialog')[0]
    const click = (parent, text) => dispatch(root, buttonByText(parent, text), 'click')
    const preview = async () => {
      dispatch(root, find(root, n => n.tagName === 'FORM')[0], 'submit')
      await until(dialog, 'target confirmation')
    }
    try {
      await until(() => root.textContent.includes('Chưa có thông báo.'), 'empty list')
      assert.equal(find(byName(root, 'building'), n => n.textContent === 'Toàn hệ thống').length > 0, role === 'BOSS')
      selectOption(root, byName(root, 'building'), '2')
      await until(() => root.textContent.includes('P2'), 'first building rooms')
      selectOption(root, byName(root, 'room'), '20')
      if (audience !== 'room') {
        selectOption(root, byName(root, 'building'), audience === 'chain' ? 'all' : '3')
        await until(() => !root.textContent.includes('P2'), 'old room removed')
      }
      fill(root, byName(root, 'title'), '  Lịch bảo trì  ')
      fill(root, byName(root, 'body'), '  <b>Mất nước</b>  ')
      await preview()
      assert.ok(dialog().textContent.includes({ room: 'Phòng P2 · Tòa A', building: 'Tòa B', chain: 'Toàn hệ thống' }[audience]))
      click(dialog(), 'Hủy')
      await until(() => !dialog(), 'dismiss')
      assert.equal(writes.length, 0)
      await preview()
      click(dialog(), 'Xác nhận gửi')
      await until(() => root.textContent.includes('Phạm vi đã thay đổi'), 'API error')
      await preview()
      click(dialog(), 'Xác nhận gửi')
      await until(() => root.textContent.includes('Đã đọc 2 / 7'), 'refreshed counts')
      assert.ok(root.textContent.includes('<b>Mất nước</b>'))
      assert.equal(find(root, n => n.tagName === 'B').length, 0)
      assert.deepEqual(writes[1], { title: record.title, body: record.body,
        buildingId: audience === 'chain' ? null : audience === 'room' ? 2 : 3, ...(audience === 'room' ? { roomId: 20 } : {}) })
    } finally { await app.stop() }
  })
}
