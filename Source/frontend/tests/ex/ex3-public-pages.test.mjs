import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { byName, dispatch, draftFirst, fakeFetch, fill, find, loadModule, mount, ok, until } from '../p2/public-dom.mjs'

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

const require = createRequire(import.meta.url)
const React = require('react')
const { MemoryRouter } = require('react-router')
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
const mod = path => loadModule(draftFirst(`src/${path}`))
const { I18nProvider } = mod('shared/i18n/index.ts')

function translated(element) {
  return React.createElement(I18nProvider, { locale: 'en' },
    React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(MemoryRouter, null, element)))
}

const room = {
  id: 1, code: 'A101', floor: 2, areaM2: 18.5, price: 2_984_000, maxOccupants: 2,
  buildingId: 5, buildingCode: 'A', buildingName: 'Tòa Sen', district: 'Cầu Giấy', ward: 'Dịch Vọng',
  imageUrl: null, roomType: 'LOFT', hasBalcony: true, hasWindow: false, petsAllowed: null,
}
const catalog = {
  amenities: [{ code: 'ELEVATOR', label: 'Thang máy', labelEn: 'Elevator' }],
  roomTypes: [{ code: 'LOFT', label: 'Có gác xép', labelEn: 'Loft' }],
}

test('LOC-01, LOC-04, LOC-05, FE-EX-10: English home keeps VND and district data while translating its copy and singular count', async () => {
  fakeFetch([
    { prefix: '/public/featured-rooms', handler: () => ok([room]) },
    { prefix: '/public/locations', handler: () => ok([{ district: 'Cầu Giấy', roomCount: 1, wards: [] }]) },
    { prefix: '/public/contact', handler: () => ok(null) },
  ])
  const { PublicHomePage } = mod('pages/public/PublicHomePage.tsx')
  const app = await mount(translated(React.createElement(PublicHomePage)))
  try {
    await until(() => app.container.textContent.includes('Tòa Sen'), 'featured room')
    assert.match(app.container.textContent, /2\.000\.000 đ/)
    assert.match(app.container.textContent, /1 available room/)
    assert.match(app.container.textContent, /Cầu Giấy/)
    assert.match(app.container.textContent, /Find available rooms/)
    assert.doesNotMatch(app.container.textContent, /Chưa có ảnh|Đang tải danh sách phòng|Phòng vừa cập nhật/)
  } finally { await app.stop() }
})

test('LOC-04, FE-EX-10: catalog labels use labelEn in English on room facts and filters', async () => {
  const { labelOf, roomAttributeFacts } = mod('features/public/attributes.ts')
  assert.equal(labelOf('ELEVATOR', catalog.amenities, 'en'), 'Elevator')
  assert.equal(labelOf('ELEVATOR', catalog.amenities, 'vi'), 'Thang máy')
  assert.deepEqual(roomAttributeFacts(room, catalog, false, 'en'), [
    { label: 'Room type', value: 'Loft' },
    { label: 'Balcony', value: 'Yes' },
    { label: 'Window', value: 'No' },
  ])
  const { RoomFilters } = mod('features/public/RoomFilters.tsx')
  const values = {
    district: '', ward: '', buildingId: '', minPrice: '', maxPrice: '', minArea: '', maxArea: '',
    minOccupants: '', floor: '', amenities: [], balcony: false, window: false, pets: false, roomType: '', sort: 'price',
  }
  const app = await mount(translated(React.createElement(RoomFilters, {
    values, locations: [], catalog, onChange() {}, onReset() {},
  })))
  try {
    await until(() => app.container.textContent.includes('Elevator'), 'English amenity')
    assert.match(app.container.textContent, /Loft/)
    assert.match(app.container.textContent, /Apply filters/)
    assert.doesNotMatch(app.container.textContent, /Thang máy|Có gác xép|Tất cả quận/)
  } finally { await app.stop() }
})

test('LOC-01, LOC-05, FE-EX-10: room card and rates translate fixed labels while preserving money and dates', async () => {
  const { RoomCard } = mod('features/public/RoomCard.tsx')
  const { RateTable } = mod('features/public/RateTable.tsx')
  const rates = {
    electric: { kind: 'ELECTRIC', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-02-01', tiers: [{ tierNo: 1, upTo: 50, unitPrice: 2000 }] },
    water: null, services: [],
  }
  const upcoming = [{ ...rates.electric, effectiveFrom: '2026-02-28' }]
  const app = await mount(translated(React.createElement(React.Fragment, null,
    React.createElement(RoomCard, { room, ctaLabel: 'View room' }),
    React.createElement(RateTable, { rates, upcomingRates: upcoming, waterMode: 'PER_M3' }))))
  try {
    assert.match(app.container.textContent, /Room A101/)
    assert.match(app.container.textContent, /2\.984\.000 đ/)
    assert.match(app.container.textContent, /28\/02\/2026/)
    assert.match(app.container.textContent, /Electricity/)
    assert.doesNotMatch(app.container.textContent, /Chưa có ảnh|Đơn giá rõ ràng|Điện ·/)
  } finally { await app.stop() }
})

test('LOC-01, LOC-05, FE-EX-10: monthly estimate translates the shared cost table while keeping VND', async () => {
  const { EstimatePanel } = mod('features/public/EstimatePanel.tsx')
  const app = await mount(translated(React.createElement(EstimatePanel, {
    monthlyEstimate: 2_984_000,
    deposit: 2_984_000,
    estimate: { items: [{ label: 'Rent', amount: 2_984_000 }], missing: [], meteredNote: '' },
  })))
  try {
    assert.match(app.container.textContent, /Monthly costs/)
    assert.match(app.container.textContent, /Estimated monthly total/)
    assert.match(app.container.textContent, /2\.984\.000 đ/)
    assert.doesNotMatch(app.container.textContent, /Chi phí mỗi tháng|Ước tính mỗi tháng/)
  } finally { await app.stop() }
})

test('LOC-01, FE-EX-10: the public 404 and shared header/footer show English copy', async () => {
  const { NotFoundPage } = mod('pages/public/NotFoundPage.tsx')
  const { RoomsHeader, RoomsFooter } = mod('components/Navigation.tsx')
  const app = await mount(translated(React.createElement(React.Fragment, null,
    React.createElement(NotFoundPage),
    React.createElement(RoomsHeader, { links: [], homeLabel: 'Rooms — Home', closeLabel: 'Close', mainNavLabel: 'Main navigation', exploreLabel: 'Explore' }),
    React.createElement(RoomsFooter, { description: 'Rooms in Hanoi', contact: null, findTitle: 'Find a room', findDescription: 'Browse rooms', areaTitle: 'Areas', areaDescription: 'Browse buildings', contactTitle: 'Contact', contactEmpty: 'Contact details coming soon', bottomLocation: 'Hanoi · Vietnam' }))))
  try {
    assert.match(app.container.textContent, /Page not found/)
    assert.match(app.container.textContent, /Browse rooms/)
    assert.equal(find(app.container, n => n.tagName === 'A' && n.getAttribute('aria-label') === 'Rooms — Home').length, 1)
    assert.doesNotMatch(app.container.textContent, /Không tìm thấy trang|Thông tin đang được cập nhật/)
  } finally { await app.stop() }
})

test('LOC-01, PUB-06, FE-EX-10: English listing translates states and preserves names entered in Vietnamese', async () => {
  fakeFetch([
    { prefix: '/public/locations', handler: () => ok([{ district: 'Cầu Giấy', roomCount: 1, wards: [] }]) },
    { prefix: '/public/filters', handler: () => ok(catalog) },
    { prefix: '/public/rooms', handler: () => ok([room], { page: 1, limit: 20, total: 1 }) },
  ])
  const { PublicRoomsPage } = mod('pages/public/PublicRoomsPage.tsx')
  const app = await mount(translated(React.createElement(PublicRoomsPage)))
  try {
    await until(() => app.container.textContent.includes('Tòa Sen'), 'listing room')
    assert.match(app.container.textContent, /1 matching room/)
    assert.match(app.container.textContent, /Cầu Giấy/)
    assert.match(app.container.textContent, /Search results/)
    assert.match(app.container.textContent, /2\.984\.000 đ/)
    assert.doesNotMatch(app.container.textContent, /Kết quả tìm kiếm|Chọn nhanh theo quận|Xem chi tiết phòng/)
  } finally { await app.stop() }
})

test('LOC-01, LOC-04, FE-EX-10: English room and building detail translate fixed text and catalog labels', async () => {
  const { RoomDetailView } = mod('pages/public/RoomDetailView.tsx')
  const { BuildingDetail } = mod('pages/public/PublicBuildingPage.tsx')
  const fullRoom = {
    ...room, furniture: ['Giường gỗ'], description: 'Mô tả chủ nhà', deposit: 2_984_000,
    images: [], building: { id: 5, code: 'A', name: 'Tòa Sen', address: 'Số 1', district: 'Cầu Giấy', ward: 'Dịch Vọng', amenities: ['ELEVATOR'], description: null, waterMode: 'PER_M3' },
  }
  const building = { ...fullRoom.building, contact: null, rates: { electric: null, water: null, services: [] }, upcomingRates: [], rooms: [room] }
  const { formatMoney } = mod('shared/formatters.ts')
  const app = await mount(translated(React.createElement(React.Fragment, null,
    React.createElement(RoomDetailView, { room: { ...fullRoom, building: { ...fullRoom.building, amenities: ['Elevator'] } }, statusBadge: 'Available', estimatePanel: null, rateTable: null, contactCard: null, viewingForm: null, formatMoney }),
    React.createElement(BuildingDetail, { building, catalog }))))
  try {
    assert.match(app.container.textContent, /Room A101/)
    assert.match(app.container.textContent, /Giường gỗ/)
    assert.match(app.container.textContent, /Mô tả chủ nhà/)
    assert.match(app.container.textContent, /Elevator/)
    assert.match(app.container.textContent, /2\.984\.000 đ/)
    assert.match(app.container.textContent, /Building amenities/)
    assert.doesNotMatch(app.container.textContent, /Mã phòng:|Tiện ích tại tòa|Đặt lịch xem phòng|Giá thuê niêm yết/)
  } finally { await app.stop() }
})

test('LOC-01, LOC-02, FE-EX-10: network fallbacks follow the area language while staff stays Vietnamese', async () => {
  const api = mod('shared/api.ts')
  api.setLanguage('en')
  globalThis.fetch = async () => { throw Error('offline') }
  try {
    await assert.rejects(api.apiRequest('/public/rooms'), error => error.message === 'Something went wrong. Please try again later.')
    await assert.rejects(api.apiRequest('/buildings'), error => error.message === 'Có lỗi xảy ra, vui lòng thử lại sau')
    assert.throws(() => api.listPath('/public/rooms', { page: 0 }), { message: 'Invalid page or page size' })
  } finally { api.setLanguage('vi') }
})

test('LOC-02, UI-12, FE-EX-10: changing language refetches a room estimate in the new language', async () => {
  const api = mod('shared/api.ts')
  const { setStoredLang, useI18n } = mod('shared/i18n/index.ts')
  const { PublicRoomPage } = mod('pages/public/PublicRoomPage.tsx')
  const { Routes, Route } = require('react-router')
  const fullRoom = {
    ...room, furniture: [], description: null, deposit: room.price, monthlyEstimate: room.price,
    images: [], building: { id: 5, code: 'A', name: 'Tòa Sen', address: 'Số 1', district: 'Cầu Giấy', ward: 'Dịch Vọng', amenities: [], description: null, waterMode: 'PER_M3' },
    rates: { electric: null, water: null, services: [] }, upcomingRates: [], contact: null,
  }
  setStoredLang('vi')
  api.setLanguage('vi')
  const calls = fakeFetch([
    { prefix: '/public/rooms/1', handler: call => ok({ ...fullRoom,
      estimate: { items: [{ label: call.headers['Accept-Language'] === 'en' ? 'Rent' : 'Giá thuê', amount: room.price }], missing: [], meteredNote: '' },
    }) },
  ])
  function Switch() {
    const { setLang } = useI18n()
    return React.createElement('button', { type: 'button', onClick: () => setLang('en') }, 'English')
  }
  const app = await mount(React.createElement(I18nProvider, null,
    React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(MemoryRouter, { initialEntries: ['/phong/1'] },
        React.createElement(Switch), React.createElement(Routes, null,
          React.createElement(Route, { path: '/phong/:id', element: React.createElement(PublicRoomPage) }))))))
  try {
    await until(() => app.container.textContent.includes('Giá thuê'), 'Vietnamese estimate')
    dispatch(app.container, find(app.container, n => n.tagName === 'BUTTON' && n.textContent === 'English')[0], 'click')
    await until(() => calls.filter(c => c.url.includes('/public/rooms/1')).length === 2, 'English estimate request')
    assert.deepEqual(calls.filter(c => c.url.includes('/public/rooms/1')).map(c => c.headers['Accept-Language']), ['vi', 'en'])
    await until(() => app.container.textContent.includes('Rent'), 'English estimate')
  } finally { await app.stop(); setStoredLang('vi'); api.setLanguage('vi') }
})

test('UI-12, FE-EX-10: switching filter language revalidates without losing an entered value', async () => {
  const { RoomFilters } = mod('features/public/RoomFilters.tsx')
  const { setStoredLang, useI18n } = mod('shared/i18n/index.ts')
  const values = {
    district: '', ward: '', buildingId: '', minPrice: '', maxPrice: '', minArea: '', maxArea: '',
    minOccupants: '', floor: '', amenities: [], balcony: false, window: false, pets: false, roomType: '', sort: 'price',
  }
  function Page() {
    const { setLang } = useI18n()
    return React.createElement(React.Fragment, null,
      React.createElement('button', { type: 'button', onClick: () => setLang('en') }, 'English'),
      React.createElement(RoomFilters, { values, locations: [], catalog, onChange() {}, onReset() {} }))
  }
  setStoredLang('vi')
  const app = await mount(React.createElement(I18nProvider, null, React.createElement(Page)))
  try {
    const input = byName(app.container, 'minArea')
    fill(app.container, input, 'abc')
    dispatch(app.container, find(app.container, n => n.tagName === 'FORM')[0], 'submit')
    await until(() => app.container.textContent.includes('Diện tích tối thiểu không hợp lệ'), 'Vietnamese validation')
    dispatch(app.container, find(app.container, n => n.tagName === 'BUTTON' && n.textContent === 'English')[0], 'click')
    await until(() => app.container.textContent.includes('Invalid minimum area'), 'English validation')
    assert.equal(byName(app.container, 'minArea'), input)
    assert.equal(input.value, 'abc')
  } finally { await app.stop(); setStoredLang('vi') }
})
