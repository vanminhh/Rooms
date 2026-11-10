import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const publicDomPath = existsSync(join(here, 'public-dom.mjs'))
  ? join(here, 'public-dom.mjs')
  : join(here, '..', '..', '..', '..', 'tests', 'p2', 'public-dom.mjs')
const { buttonByText, dispatch, fakeDocument, fakeFetch, find, mount, ok, until } = await import(pathToFileURL(publicDomPath).href)
const previewLoaderPath = join(here, '..', '..', 'ref', 'draft-root.mjs')
const loaderPath = existsSync(previewLoaderPath) ? previewLoaderPath : join(here, '..', 'draft-root.mjs')
const { loadModule } = await import(pathToFileURL(loaderPath).href)
const require = createRequire(import.meta.url)
const React = require('react')
const { createMemoryRouter, RouterProvider } = require('react-router')

function findSourceRoot(start) {
  let current = start
  for (;;) {
    if (existsSync(join(current, 'src', 'pages', 'public', 'RoomDetailView.tsx'))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error('Không tìm thấy thư mục nguồn UI-24')
    current = parent
  }
}

const root = findSourceRoot(here)
const mainRoot = existsSync(join(root, 'src', 'components', 'index.ts')) ? root : dirname(dirname(root))
const sourcePath = (...parts) => {
  const draftPath = join(root, ...parts)
  return existsSync(draftPath) ? draftPath : join(mainRoot, ...parts)
}
const { RoomDetailView } = loadModule(sourcePath('src', 'pages', 'public', 'RoomDetailView.tsx'))
const { ViewingForm } = loadModule(sourcePath('src', 'features', 'public', 'ViewingForm.tsx'))
const css = readFileSync(sourcePath('src', 'features', 'public', 'booking-panel.css'), 'utf8')
const pageSource = readFileSync(sourcePath('src', 'pages', 'public', 'PublicRoomPage.tsx'), 'utf8')

const room = {
  id: 23, code: 'LH-302', floor: 3, areaM2: 38, maxOccupants: 2,
  furniture: ['Điều hòa'], description: 'Phòng sáng.', price: 6_200_000, deposit: 6_200_000, images: [],
  building: { id: 7, name: 'Tòa Láng Hạ', address: '18 Ngõ 105 Láng Hạ', district: 'Đống Đa', ward: 'Láng Hạ', amenities: [], description: null },
}

async function renderPanel() {
  fakeFetch([{ prefix: '/public/viewings', method: 'POST', handler: () => ok({ received: true }) }])
  const view = React.createElement(RoomDetailView, {
    room,
    statusBadge: React.createElement('span', null, 'Đang trống'),
    estimatePanel: React.createElement('section', null, 'Ước tính chi phí'),
    rateTable: React.createElement('section', null, 'Đơn giá'),
    contactCard: React.createElement('section', { className: 'public-contact' }, React.createElement('h3', null, 'Liên hệ'), React.createElement('p', null, React.createElement('a', { href: 'tel:0900000001' }, '0900000001')), React.createElement('p', null, React.createElement('a', { href: 'https://zalo.me/0900000001' }, 'Nhắn Zalo'))),
    viewingForm: React.createElement(ViewingForm, { roomId: room.id, roomCode: room.code }),
    formatMoney: value => `${value.toLocaleString('vi-VN')} đ`,
  })
  const router = createMemoryRouter([{ path: '/phong/:id', element: view }], { initialEntries: ['/phong/23'] })
  return mount(React.createElement(RouterProvider, { router }))
}

test('UI-24: the real page passes room code into the real viewing form', () => {
  assert.match(pageSource, /<ViewingForm roomId=\{room\.id\} roomCode=\{room\.code\} \/>/)
})

test('UI-24 · CON-01: booking card shows API price/deposit and the current three-month minimum', async () => {
  const app = await renderPanel()
  assert.ok(app.container.textContent.includes('6.200.000 đ'))
  assert.ok(app.container.textContent.includes('Tối thiểu 3 tháng'))
  assert.ok(app.container.textContent.includes('Xác nhận đặt lịch xem phòng LH-302'))
  await app.stop()
})

test('UI-24 · VIEW-08: date shortcuts and the three canonical slots are keyboard buttons/inputs', async () => {
  const app = await renderPanel()
  for (const label of ['Hôm nay', 'Ngày mai', 'Chọn ngày khác']) assert.ok(buttonByText(app.container, label), label)
  const radios = find(app.container, node => node.tagName === 'INPUT' && node.type === 'radio')
  assert.equal(radios.length, 3)
  assert.deepEqual(radios.map(node => node.parentNode.textContent.replace('Đã bắt đầu', '').trim()), ['Sáng (8:00–11:00)', 'Chiều (14:00–17:00)', 'Tối (18:00–20:00)'])
  dispatch(app.container, buttonByText(app.container, 'Ngày mai'), 'click')
  await until(() => buttonByText(app.container, 'Ngày mai').getAttribute('aria-pressed') === 'true', 'tomorrow selected')
  await app.stop()
})

test('UI-24 · VIEW-08: Chọn ngày khác opens the native picker without changing the selected date', async () => {
  const app = await renderPanel()
  const dateInput = find(app.container, node => node.tagName === 'INPUT' && node.type === 'date')[0]
  dispatch(app.container, buttonByText(app.container, 'Ngày mai'), 'click')
  await until(() => dateInput.value !== '', 'tomorrow selected')
  const selectedDate = dateInput.value
  let pickerCalls = 0
  dateInput.showPicker = () => { pickerCalls += 1 }

  dispatch(app.container, buttonByText(app.container, 'Chọn ngày khác'), 'click')

  assert.equal(pickerCalls, 1)
  assert.equal(dateInput.value, selectedDate)
  await app.stop()
})

test('UI-24 · VIEW-08: Chọn ngày khác focuses the date input when showPicker is unavailable', async () => {
  const app = await renderPanel()
  const dateInput = find(app.container, node => node.tagName === 'INPUT' && node.type === 'date')[0]
  dispatch(app.container, buttonByText(app.container, 'Ngày mai'), 'click')
  await until(() => dateInput.value !== '', 'tomorrow selected')
  const selectedDate = dateInput.value
  dateInput.showPicker = undefined
  fakeDocument.activeElement = fakeDocument.body

  dispatch(app.container, buttonByText(app.container, 'Chọn ngày khác'), 'click')

  assert.equal(fakeDocument.activeElement, dateInput)
  assert.equal(dateInput.value, selectedDate)
  await app.stop()
})

test('UI-24 · VIEW-08: Chọn ngày khác focuses the date input when showPicker throws', async () => {
  const app = await renderPanel()
  const dateInput = find(app.container, node => node.tagName === 'INPUT' && node.type === 'date')[0]
  dispatch(app.container, buttonByText(app.container, 'Ngày mai'), 'click')
  await until(() => dateInput.value !== '', 'tomorrow selected')
  const selectedDate = dateInput.value
  dateInput.showPicker = () => { throw new Error('picker unavailable') }
  fakeDocument.activeElement = fakeDocument.body

  dispatch(app.container, buttonByText(app.container, 'Chọn ngày khác'), 'click')

  assert.equal(fakeDocument.activeElement, dateInput)
  assert.equal(dateInput.value, selectedDate)
  await app.stop()
})

test('UI-24 · UI-02: approved promises and API contact actions remain in the booking card', async () => {
  const app = await renderPanel()
  assert.ok(app.container.textContent.includes('Quản lý tòa nhà trực tiếp đón tiếp, không qua trung gian.'))
  assert.ok(app.container.textContent.includes('Xem phòng và tư vấn hoàn toàn miễn phí.'))
  const links = find(app.container, node => node.tagName === 'A')
  assert.ok(links.some(link => link.getAttribute('href') === 'tel:0900000001'))
  assert.ok(links.some(link => link.textContent === 'Nhắn Zalo'))
  await app.stop()
})

test('UI-24 · KIT-05: desktop sticky, mobile flow, 360px safety and reduced motion are explicit', () => {
  assert.match(css, /position:\s*sticky/)
  assert.match(css, /@media \(max-width: 979px\)[\s\S]*position:\s*static/)
  assert.match(css, /@media \(max-width: 420px\)/)
  assert.match(css, /minmax\(0, 1fr\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})
