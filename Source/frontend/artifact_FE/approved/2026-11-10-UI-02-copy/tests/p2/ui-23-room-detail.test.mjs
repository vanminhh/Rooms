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
const { dispatch, fakeDocument, find, loadModule, mount, until, wait } = await import(pathToFileURL(publicDomPath).href)

const require = createRequire(import.meta.url)
const React = require('react')
const { createMemoryRouter, RouterProvider } = require('react-router')

function findSourceRoot(start) {
  let current = start
  for (;;) {
    if (existsSync(join(current, 'src', 'pages', 'public', 'RoomDetailView.tsx'))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error('Không tìm thấy thư mục nguồn UI-23')
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
const { ViewingForm } = loadModule(join(mainRoot, 'src', 'features', 'public', 'ViewingForm.tsx'))
const css = readFileSync(sourcePath('src', 'features', 'public', 'public-room-detail.css'), 'utf8')
const pageSource = readFileSync(sourcePath('src', 'pages', 'public', 'PublicRoomPage.tsx'), 'utf8')

const baseRoom = overrides => ({
  id: 10, code: 'B203', floor: 2, areaM2: 18.5, maxOccupants: 2,
  furniture: ['Điều hòa', 'Tủ lạnh'], description: 'Phòng nhiều ánh sáng.', price: 2_300_000,
  images: [],
  building: { id: 7, name: 'An Lâm 1', address: '12 Láng Hạ', district: 'Đống Đa', ward: 'Láng Hạ', amenities: ['Thang máy'], description: 'Tòa nhà yên tĩnh.' },
  ...overrides,
})

async function renderRoom(room) {
  const view = React.createElement(RoomDetailView, {
    room,
    statusBadge: React.createElement('span', null, 'Đang trống'),
    estimatePanel: React.createElement('section', null, 'Ước tính chi phí / tháng'),
    rateTable: React.createElement('section', null, 'Đơn giá rõ ràng'),
    contactCard: React.createElement('section', null, 'Liên hệ'),
    viewingForm: React.createElement(ViewingForm, { roomId: room.id }),
    formatMoney: value => `${value.toLocaleString('vi-VN')} đ`,
  })
  const router = createMemoryRouter([{ path: '/phong/:id', element: view }], { initialEntries: ['/phong/10'] })
  return mount(React.createElement(RouterProvider, { router }))
}

const buttonsByLabel = (container, prefix) => find(container, node => node.tagName === 'BUTTON' && (node.getAttribute('aria-label') ?? '').startsWith(prefix))
const dialogOf = container => find(container, node => node.attributes.role === 'dialog')[0]

test('UI-23: the real page composes RoomDetailView with the real ViewingForm', () => {
  assert.match(pageSource, /<RoomDetailView/)
  assert.match(pageSource, /viewingForm=\{<ViewingForm roomId=\{room\.id\}/)
})

test('UI-23 · ROOM-07: gallery renders 0, 1, 3 and 7-image variants', async () => {
  for (const count of [0, 1, 3, 7]) {
    const images = Array.from({ length: count }, (_, index) => ({ id: index + 1, url: `/room-${index + 1}.webp`, sortOrder: index }))
    const app = await renderRoom(baseRoom({ images }))
    const thumbnails = buttonsByLabel(app.container, 'Xem ảnh')
    assert.equal(thumbnails.length, Math.min(count, 5), `thumbnail count for ${count}`)
    assert.equal(app.container.textContent.includes('Chưa có ảnh'), count === 0)
    if (count === 7) assert.ok(app.container.textContent.includes('+2 ảnh'))
    await app.stop()
  }
})

test('UI-23 · KIT-05: lightbox closes by button and Escape, traps focus, restores opener and changes images', async () => {
  const images = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, url: `/room-${index + 1}.webp`, sortOrder: index }))
  const app = await renderRoom(baseRoom({ images }))
  const opener = buttonsByLabel(app.container, 'Xem ảnh 1')[0]

  dispatch(app.container, opener, 'click')
  await until(() => Boolean(dialogOf(app.container)), 'lightbox opens')
  const close = buttonsByLabel(app.container, 'Đóng ảnh lớn')[0]
  const previous = buttonsByLabel(app.container, 'Ảnh trước')[0]
  const next = buttonsByLabel(app.container, 'Ảnh tiếp theo')[0]
  assert.equal(fakeDocument.activeElement, close, 'opening focuses close')

  dispatch(app.container, next, 'click')
  await until(() => dialogOf(app.container)?.textContent.includes('2 / 7'), 'next image')
  dispatch(app.container, previous, 'click')
  await until(() => dialogOf(app.container)?.textContent.includes('1 / 7'), 'previous image')

  dispatch(app.container, close, 'keydown', { key: 'Tab', shiftKey: true })
  assert.equal(fakeDocument.activeElement, next, 'Shift+Tab wraps to last control')
  dispatch(app.container, next, 'keydown', { key: 'Tab', shiftKey: false })
  assert.equal(fakeDocument.activeElement, close, 'Tab wraps to first control')

  dispatch(app.container, close, 'click')
  await until(() => !dialogOf(app.container), 'close button closes')
  assert.equal(fakeDocument.activeElement, opener, 'button close restores opener')

  dispatch(app.container, opener, 'click')
  await until(() => Boolean(dialogOf(app.container)), 'lightbox reopens')
  const closeAgain = buttonsByLabel(app.container, 'Đóng ảnh lớn')[0]
  dispatch(app.container, closeAgain, 'keydown', { key: 'Escape' })
  await until(() => !dialogOf(app.container), 'Escape closes')
  assert.equal(fakeDocument.activeElement, opener, 'Escape restores opener')
  await app.stop()
})

test('UI-23: Web Share success and clipboard fallback show the right status', async () => {
  window.location.href = 'http://localhost/phong/10'
  let shared
  Object.defineProperty(globalThis.navigator, 'share', { configurable: true, value: async payload => { shared = payload } })
  const webShareApp = await renderRoom(baseRoom())
  const shareButton = find(webShareApp.container, node => node.tagName === 'BUTTON' && node.textContent.includes('Chia sẻ'))[0]
  dispatch(webShareApp.container, shareButton, 'click')
  await until(() => webShareApp.container.textContent.includes('Đã mở chia sẻ'), 'Web Share status')
  assert.equal(shared.url, 'http://localhost/phong/10')
  await webShareApp.stop()

  let copied = ''
  Object.defineProperty(globalThis.navigator, 'share', { configurable: true, value: undefined })
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async value => { copied = value } } })
  const clipboardApp = await renderRoom(baseRoom())
  const fallbackButton = find(clipboardApp.container, node => node.tagName === 'BUTTON' && node.textContent.includes('Chia sẻ'))[0]
  dispatch(clipboardApp.container, fallbackButton, 'click')
  await until(() => clipboardApp.container.textContent.includes('Đã chép liên kết'), 'clipboard status')
  assert.equal(copied, 'http://localhost/phong/10')
  await clipboardApp.stop()
})

test('UI-23: share and copy failure shows a useful error', async () => {
  Object.defineProperty(globalThis.navigator, 'share', { configurable: true, value: async () => { throw new Error('share failed') } })
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('copy failed') } } })
  const app = await renderRoom(baseRoom())
  const shareButton = find(app.container, node => node.tagName === 'BUTTON' && node.textContent.includes('Chia sẻ'))[0]
  dispatch(app.container, shareButton, 'click')
  await until(() => app.container.textContent.includes('Không thể chia sẻ hoặc chép liên kết'), 'share error status')
  await app.stop()
})

test('UI-23 · VIEW-01: the real viewing form is present in the shared detail view', async () => {
  const app = await renderRoom(baseRoom())
  assert.ok(find(app.container, node => node.tagName === 'FORM' && (node.attributes.class ?? '').includes('public-viewing')).length === 1)
  assert.ok(app.container.textContent.includes('Họ và tên'))
  assert.ok(app.container.textContent.includes('Số điện thoại'))
  assert.ok(app.container.textContent.includes('Gửi yêu cầu xem phòng'))
  await app.stop()
})

test('UI-23 · KIT-05: 360px and reduced-motion CSS remain covered', async () => {
  assert.match(css, /@media \(max-width: 390px\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  await wait(0)
})


