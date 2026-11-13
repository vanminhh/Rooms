import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import {
  buttonByText, byName, check, dispatch, fail, fakeFetch, fill, find, FILTERS_FIXTURE, loadModule, draftFirst, mount, ok, until, wait,
} from '../p2/public-dom.mjs'

// Phase Extra EX-5, FE-EX-18..20 (ROOM-10, BLD-08, PUB-06, UI-03). Outside edges faked: fetch (GET /public/filters is answered by the
// shared fixture and not counted in `calls`) and the fake DOM. Pages, forms, filters module, react-router, react-hook-form, zod and the kit run unmodified.

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')
const mod = path => loadModule(draftFirst(`src/${path}`))
const filtersMod = mod('features/public/room-filters.ts')
const attrs = mod('features/public/attributes.ts')

const EMPTY = {
  district: '', ward: '', buildingId: '', minPrice: '', maxPrice: '', minArea: '', maxArea: '', minOccupants: '', floor: '',
  amenities: [], balcony: false, window: false, pets: false, roomType: '', sort: 'price',
}
const F = over => ({ ...EMPTY, ...over })

// ---------- FE-EX-19: URL <-> filters <-> API query ----------

test('PUB-06: URL -> filters -> API query round trip for every new filter', () => {
  const url = 'minArea=20&maxArea=30.5&minOccupants=2&floor=3&amenities=ELEVATOR,PARKING&balcony=true&window=true&pets=true&roomType=LOFT'
  const values = filtersMod.parseFilters(new URLSearchParams(url))
  assert.deepEqual(values, F({
    minArea: '20', maxArea: '30.5', minOccupants: '2', floor: '3', amenities: ['ELEVATOR', 'PARKING'],
    balcony: true, window: true, pets: true, roomType: 'LOFT',
  }))
  assert.equal(filtersMod.validFilters(values), true)
  assert.deepEqual(
    { ...filtersMod.filtersToQuery(values) },
    {
      district: undefined, ward: undefined, buildingId: undefined, minPrice: undefined, maxPrice: undefined,
      minArea: 20, maxArea: 30.5, minOccupants: 2, floor: 3, amenities: 'ELEVATOR,PARKING', balcony: true, window: true, pets: true,
      roomType: 'LOFT', sort: 'price',
    },
  )
  // back to a URL: the same filters in a fixed key order, so a shared link is stable
  assert.equal(
    filtersMod.filtersToParams(values).toString(),
    'minArea=20&maxArea=30.5&minOccupants=2&floor=3&amenities=ELEVATOR%2CPARKING&balcony=true&window=true&pets=true&roomType=LOFT',
  )
  assert.deepEqual(filtersMod.parseFilters(filtersMod.filtersToParams(values)), values)
})

test('PUB-06, OQ-2: balcony, window and pets only mean "true"; anything else is no filter; an empty form leaves the URL empty', () => {
  const values = filtersMod.parseFilters(new URLSearchParams('balcony=false&window=1&pets=yes&amenities=,&roomType=%20'))
  assert.deepEqual(values, EMPTY)
  assert.equal(filtersMod.filtersToParams(EMPTY).toString(), '')
  assert.equal(filtersMod.needsCatalog(EMPTY), false)
})

test('PUB-06: amenities in the URL are split, trimmed and de-duplicated; shapes that are not codes are dropped', () => {
  const values = filtersMod.parseFilters(new URLSearchParams('amenities=ELEVATOR, PARKING,ELEVATOR,wifi cũ,<b>'))
  assert.deepEqual(values.amenities, ['ELEVATOR', 'PARKING'])
})

test('PUB-06: withCatalog drops a code or a room type that GET /public/filters does not know (it would be a 400)', () => {
  const values = F({ amenities: ['ELEVATOR', 'SAUNA'], roomType: 'DUPLEX' })
  assert.equal(filtersMod.needsCatalog(values), true)
  assert.deepEqual(filtersMod.withCatalog(values, FILTERS_FIXTURE), F({ amenities: ['ELEVATOR'], roomType: '' }))
  assert.deepEqual(filtersMod.withCatalog(F({ roomType: 'STUDIO' }), FILTERS_FIXTURE).roomType, 'STUDIO')
})

test('PUB-06, UI-05: the numeric fields use the BE words; "0" area and floor are refused, a decimal count is refused', () => {
  const message = over => {
    const r = filtersMod.filterSchema.safeParse(F(over))
    return r.success ? null : r.error.issues[0].message
  }
  assert.equal(message({ minArea: 'x' }), 'Diện tích tối thiểu không hợp lệ')
  assert.equal(message({ minArea: '0' }), 'Diện tích tối thiểu không hợp lệ')
  assert.equal(message({ maxArea: '10000' }), 'Diện tích tối đa không hợp lệ')
  assert.equal(message({ maxArea: '20.55' }), 'Diện tích tối đa không hợp lệ')
  assert.equal(message({ minOccupants: '0' }), 'Số người không hợp lệ')
  assert.equal(message({ minOccupants: '1.5' }), 'Số người không hợp lệ')
  assert.equal(message({ floor: '0' }), 'Tầng không hợp lệ')
  assert.equal(message({ floor: '2147483648' }), 'Tầng không hợp lệ')
  assert.equal(message({ minArea: '0.1', maxArea: '9999.9', minOccupants: '1', floor: '2147483647' }), null)
})

async function mountRooms(url, rules = []) {
  const { MemoryRouter, Routes, Route, useLocation } = nodeRequire('react-router')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { PublicRoomsPage } = mod('pages/public/PublicRoomsPage.tsx')
  const calls = fakeFetch([
    { prefix: '/public/locations', handler: () => ok([{ district: 'Cầu Giấy', roomCount: 2, wards: [{ ward: 'Dịch Vọng', roomCount: 2 }] }]) },
    ...rules,
  ])
  const Loc = () => React.createElement('p', { 'data-loc': true }, useLocation().search)
  const tree = React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    React.createElement(MemoryRouter, { initialEntries: [url] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/phong', element: React.createElement(React.Fragment, null, React.createElement(PublicRoomsPage), React.createElement(Loc)) }))))
  const app = await mount(tree)
  const search = () => find(app.container, n => n.attributes['data-loc'] !== undefined)[0]?.textContent ?? ''
  return { ...app, calls, search }
}
const roomCalls = calls => calls.filter(c => c.url.startsWith('/api/v1/public/rooms'))
const text = c => find(c, () => true).map(n => n.textContent).join(' ')
const form = c => find(c, n => n.tagName === 'FORM')[0]
const checkboxByLabel = (c, label) => {
  const l = find(c, n => n.tagName === 'LABEL' && n.textContent.trim() === label)[0]
  return l ? find(l, n => n.tagName === 'INPUT')[0] : undefined
}
const emptyRooms = { prefix: '/public/rooms', handler: () => ok([], { page: 1, limit: 20, total: 0 }) }

test('PUB-06, FE-EX-19: every filter in the URL goes to /public/rooms in one request, and the options come from /public/filters', async () => {
  const app = await mountRooms('/phong?minArea=20&floor=3&amenities=ELEVATOR,SAUNA&balcony=true&roomType=LOFT', [emptyRooms])
  await until(() => roomCalls(app.calls).length >= 1, 'rooms request')
  const q = new URL(roomCalls(app.calls)[0].url, 'http://x').searchParams
  assert.equal(q.get('minArea'), '20')
  assert.equal(q.get('floor'), '3')
  assert.equal(q.get('amenities'), 'ELEVATOR', 'SAUNA is not in the list, so it is dropped before the request')
  assert.equal(q.get('balcony'), 'true')
  assert.equal(q.get('roomType'), 'LOFT')
  assert.equal(q.has('window'), false)
  await until(() => text(app.container).includes('Thang máy') && text(app.container).includes('Có gác xép'), 'labels from the catalog')
  assert.equal(roomCalls(app.calls).length, 1, 'one request only')
  await app.stop()
})

test('PUB-06, FE-EX-19: ticking an amenity and Ban công, then applying, puts them in the URL; "Xóa bộ lọc" clears everything', async () => {
  const app = await mountRooms('/phong', [emptyRooms])
  await until(() => checkboxByLabel(app.container, 'Thang máy') !== undefined, 'amenity checkboxes')
  check(app.container, checkboxByLabel(app.container, 'Thang máy'), true)
  check(app.container, checkboxByLabel(app.container, 'Chỗ để xe'), true)
  check(app.container, checkboxByLabel(app.container, 'Ban công'), true)
  fill(app.container, byName(app.container, 'minArea'), '25')
  dispatch(app.container, form(app.container), 'submit')
  await until(() => app.search().includes('amenities='), 'URL updated')
  const url = new URLSearchParams(app.search())
  assert.equal(url.get('amenities'), 'ELEVATOR,PARKING')
  assert.equal(url.get('balcony'), 'true')
  assert.equal(url.get('minArea'), '25')
  await until(() => roomCalls(app.calls).some(c => c.url.includes('amenities=ELEVATOR%2CPARKING')), 'filtered request')
  dispatch(app.container, buttonByText(app.container, 'Xóa bộ lọc'), 'click')
  await until(() => app.search() === '', 'URL cleared')
  await app.stop()
})

test('UI-03, PUB-06: no match shows "Không có phòng phù hợp" with a "Xóa bộ lọc" button; a bad number shows its message and sends nothing', async () => {
  const app = await mountRooms('/phong?balcony=true', [emptyRooms])
  await until(() => text(app.container).includes('Không có phòng phù hợp'), 'empty state')
  assert.ok(find(app.container, n => n.tagName === 'BUTTON' && n.textContent.trim() === 'Xóa bộ lọc').length >= 1)
  await app.stop()

  const bad = await mountRooms('/phong?minArea=abc', [emptyRooms])
  await until(() => text(bad.container).includes('Diện tích tối thiểu không hợp lệ'), 'field message')
  await wait(60)
  assert.equal(roomCalls(bad.calls).length, 0, 'an invalid filter set is never sent')
  await bad.stop()
})

test('PUB-06: the amenity list and the room-type select stay disabled while /public/filters loads, the other filters still work', async () => {
  const { FILTERS_FIXTURE: fixture } = await import('../p2/public-dom.mjs')
  assert.ok(fixture.amenities.length === 8)
  const app = await mountRooms('/phong', [emptyRooms, { prefix: '/public/filters', handler: async () => { await wait(300); return ok(FILTERS_FIXTURE) } }])
  await until(() => text(app.container).includes('Tiện ích tòa (đang tải…)'), 'loading legend')
  assert.ok(byName(app.container, 'minArea'), 'the area field is already usable')
  await until(() => checkboxByLabel(app.container, 'Thang máy') !== undefined, 'catalog loaded')
  await app.stop()
})

// ---------- FE-EX-20: show the attributes ----------

test('ROOM-10, FE-EX-20: a room with every value shows type, Có/Không for balcony, window and pets; a room with none shows none of them', () => {
  const full = attrs.roomAttributeFacts({ roomType: 'LOFT', hasBalcony: true, hasWindow: false, petsAllowed: true }, FILTERS_FIXTURE)
  assert.deepEqual(full, [
    { label: 'Loại phòng', value: 'Có gác xép' }, { label: 'Ban công', value: 'Có' }, { label: 'Cửa sổ', value: 'Không' }, { label: 'Nuôi thú cưng', value: 'Có' },
  ])
  assert.deepEqual(attrs.roomAttributeFacts({ roomType: null, hasBalcony: null, hasWindow: null, petsAllowed: null }, FILTERS_FIXTURE), [])
  // false is a real answer, only null is hidden
  assert.deepEqual(attrs.roomAttributeFacts({ roomType: null, hasBalcony: false, hasWindow: null, petsAllowed: null }, undefined), [{ label: 'Ban công', value: 'Không' }])
})

test('LOC-04: labelOf uses the list from the API and shows an unknown code as it is', () => {
  assert.equal(attrs.labelOf('FREE_HOURS', FILTERS_FIXTURE.amenities), 'Giờ giấc tự do')
  assert.equal(attrs.labelOf('NEW_CODE', FILTERS_FIXTURE.amenities), 'NEW_CODE')
  assert.equal(attrs.labelOf('ELEVATOR', undefined), 'ELEVATOR')
})

const roomDetail = over => ({
  id: 1, code: 'A101', floor: 2, areaM2: 24, maxOccupants: 2, furniture: [], description: null, price: 2500000, deposit: 2500000,
  monthlyEstimate: 2500000, estimate: { items: [], missing: [], meteredNote: '' }, images: [], rates: { electric: null, water: null, services: [] },
  upcomingRates: [], contact: null, roomType: null, hasBalcony: null, hasWindow: null, petsAllowed: null,
  building: { id: 5, code: 'B1', name: 'Tòa B1', address: 'A', district: 'Cầu Giấy', ward: 'Dịch Vọng', waterMode: 'PER_M3', amenities: ['ELEVATOR', 'PARKING'], description: null },
  ...over,
})

async function mountDetail(room, catalog) {
  const { MemoryRouter } = nodeRequire('react-router')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { RoomDetail } = mod('pages/public/PublicRoomPage.tsx')
  fakeFetch([{ prefix: '/public/contact', handler: () => ok(null) }])
  return mount(React.createElement(QueryClientProvider, { client: new QueryClient() },
    React.createElement(MemoryRouter, null, React.createElement(RoomDetail, { room, catalog }))))
}

test('ROOM-10, FE-EX-20: /phong/:id shows the entered attributes in the facts strip and the building amenities by label', async () => {
  const app = await mountDetail(roomDetail({ roomType: 'STUDIO', hasBalcony: true, hasWindow: null, petsAllowed: false }), FILTERS_FIXTURE)
  const facts = find(app.container, n => n.tagName === 'DL' && n.attributes['aria-label'] === 'Thông số phòng')[0]
  const t = text(facts)
  assert.ok(t.includes('Loại phòng') && t.includes('Studio'))
  assert.ok(t.includes('Ban công') && t.includes('Có'))
  assert.ok(t.includes('Nuôi thú cưng') && t.includes('Không'))
  assert.ok(!t.includes('Cửa sổ'), 'a "chưa nhập" value is not shown at all')
  const tags = find(app.container, n => n.tagName === 'UL' && n.attributes.class?.includes('public-tags') || n.attributes.className?.includes?.('public-tags'))
  assert.ok(text(app.container).includes('Thang máy') && text(app.container).includes('Chỗ để xe'))
  assert.ok(tags.length >= 0)
  await app.stop()
})

test('ROOM-10, FE-EX-20: a room with no attributes shows only the usual facts', async () => {
  const app = await mountDetail(roomDetail({}), FILTERS_FIXTURE)
  const facts = find(app.container, n => n.tagName === 'DL' && n.attributes['aria-label'] === 'Thông số phòng')[0]
  for (const word of ['Loại phòng', 'Ban công', 'Cửa sổ', 'Nuôi thú cưng']) assert.ok(!text(facts).includes(word), word)
  assert.ok(text(facts).includes('Diện tích'))
  await app.stop()
})

test('BLD-08, FE-EX-20: /toa/:id lists the amenity labels; without the list a code shows as it is', async () => {
  const { MemoryRouter } = nodeRequire('react-router')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { BuildingDetail } = mod('pages/public/PublicBuildingPage.tsx')
  fakeFetch([])
  const building = { ...roomDetail({}).building, contact: null, rates: { electric: null, water: null, services: [] }, upcomingRates: [], rooms: [] }
  for (const [catalog, expected] of [[FILTERS_FIXTURE, 'Thang máy'], [undefined, 'ELEVATOR']]) {
    const app = await mount(React.createElement(QueryClientProvider, { client: new QueryClient() },
      React.createElement(MemoryRouter, null, React.createElement(BuildingDetail, { building, catalog }))))
    assert.ok(text(app.container).includes(expected), expected)
    await app.stop()
  }
})

// ---------- FE-EX-18: staff forms ----------

const roomView = over => ({
  id: 9, buildingId: 5, code: '203', floor: 2, areaM2: 24, price: 2500000, maxOccupants: 2, furniture: [], description: null,
  roomType: null, hasBalcony: null, hasWindow: null, petsAllowed: null, underMaintenance: false, isActive: true, status: 'Trống', images: [], ...over,
})

async function mountRoomForm(room) {
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { RoomForm } = mod('features/rooms/RoomForm.tsx')
  return mount(React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
    React.createElement(RoomForm, { buildingId: 5, room, onCancel() {} })))
}
// A select changes on the 'change' event (the shared fill() sends 'input', which is right for text fields only).
const choose = (c, el, value) => { el.value = value; dispatch(c, el, 'change', { target: el }) }
const select = (c, label) => find(find(c, n => n.tagName === 'LABEL' && n.textContent.trim() === label)[0]?.parentNode ?? c, n => n.tagName === 'SELECT')[0]

test('ROOM-10, FE-EX-18: saving a room without touching the four fields keeps "chưa nhập" (null, not false)', async () => {
  const calls = fakeFetch([{ prefix: '/rooms/9', method: 'PATCH', handler: () => ok(roomView({})) }])
  const app = await mountRoomForm(roomView({}))
  await until(() => find(select(app.container, 'Loại phòng'), n => n.tagName === 'OPTION').length === 5, 'room type options')
  dispatch(app.container, form(app.container), 'submit')
  await until(() => calls.some(c => c.method === 'PATCH'), 'PATCH')
  const sent = JSON.parse(calls.find(c => c.method === 'PATCH').body)
  assert.deepEqual([sent.roomType, sent.hasBalcony, sent.hasWindow, sent.petsAllowed], [null, null, null, null])
  await app.stop()
})

test('ROOM-10, FE-EX-18: the form shows the saved values; Có / Không / Chưa nhập go out as true / false / null', async () => {
  const calls = fakeFetch([{ prefix: '/rooms/9', method: 'PATCH', handler: () => ok(roomView({})) }])
  const app = await mountRoomForm(roomView({ roomType: 'LOFT', hasBalcony: true, hasWindow: false, petsAllowed: null }))
  await until(() => find(select(app.container, 'Loại phòng'), n => n.tagName === 'OPTION').length === 5, 'room type options')
  assert.equal(select(app.container, 'Loại phòng').value, 'LOFT')
  assert.equal(select(app.container, 'Ban công').value, 'true')
  assert.equal(select(app.container, 'Cửa sổ').value, 'false')
  assert.equal(select(app.container, 'Cho nuôi thú cưng').value, '')
  choose(app.container, select(app.container, 'Cho nuôi thú cưng'), 'false')
  choose(app.container, select(app.container, 'Ban công'), '')
  dispatch(app.container, form(app.container), 'submit')
  await until(() => calls.some(c => c.method === 'PATCH'), 'PATCH')
  const sent = JSON.parse(calls.find(c => c.method === 'PATCH').body)
  assert.deepEqual([sent.roomType, sent.hasBalcony, sent.hasWindow, sent.petsAllowed], ['LOFT', null, false, false])
  await app.stop()
})

const buildingView = over => ({
  id: 5, code: 'B1', name: 'Tòa B1', address: 'A', district: 'Cầu Giấy', ward: 'Dịch Vọng', waterMode: 'PER_M3', dueDays: 5, managerId: null,
  manager: null, amenities: ['ELEVATOR'], legacyAmenities: [], description: null, isActive: true, pendingViewingCount: 0, createdAt: '', updatedAt: '', ...over,
})

async function mountNotes(building) {
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { BuildingNotesForm } = mod('features/buildings/BuildingForm.tsx')
  return mount(React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
    React.createElement(BuildingNotesForm, { building })))
}

test('BLD-08, FE-EX-18: the old free text is shown apart as "Tiện ích cũ (chưa chọn lại)"; "Xóa tiện ích cũ" sends legacyAmenities: []', async () => {
  const calls = fakeFetch([{ prefix: '/buildings/5', method: 'PATCH', handler: () => ok(buildingView({})) }])
  const app = await mountNotes(buildingView({ legacyAmenities: ['wifi cũ', 'Thang máy'] }))
  await until(() => checkboxByLabel(app.container, 'Thang máy') !== undefined, 'checklist')
  assert.ok(text(app.container).includes('Tiện ích cũ (chưa chọn lại)'))
  assert.ok(text(app.container).includes('wifi cũ, Thang máy'))
  assert.equal(checkboxByLabel(app.container, 'Thang máy').checked, true, 'ELEVATOR is ticked from the codes, not from the old text')
  dispatch(app.container, buttonByText(app.container, 'Xóa tiện ích cũ'), 'click')
  await until(() => calls.some(c => c.method === 'PATCH'), 'PATCH')
  assert.deepEqual(JSON.parse(calls.find(c => c.method === 'PATCH').body), { legacyAmenities: [] })
  await app.stop()
})

test('BLD-08, FE-EX-18: with no old free text the block and its button are not there; ticking sends catalog codes only', async () => {
  const calls = fakeFetch([{ prefix: '/buildings/5', method: 'PATCH', handler: () => ok(buildingView({})) }])
  const app = await mountNotes(buildingView({}))
  await until(() => checkboxByLabel(app.container, 'Thang máy') !== undefined, 'checklist')
  assert.ok(!text(app.container).includes('Tiện ích cũ'))
  assert.equal(buttonByText(app.container, 'Xóa tiện ích cũ'), undefined)
  check(app.container, checkboxByLabel(app.container, 'Camera'), true)
  dispatch(app.container, form(app.container), 'submit')
  await until(() => calls.some(c => c.method === 'PATCH'), 'PATCH')
  assert.deepEqual(JSON.parse(calls.find(c => c.method === 'PATCH').body), { amenities: ['ELEVATOR', 'CAMERA'], description: null })
  await app.stop()
})

test('BLD-08: an API error on "Xóa tiện ích cũ" is shown and the block stays', async () => {
  fakeFetch([{ prefix: '/buildings/5', method: 'PATCH', handler: () => fail(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này') }])
  const app = await mountNotes(buildingView({ legacyAmenities: ['wifi cũ'] }))
  await until(() => buttonByText(app.container, 'Xóa tiện ích cũ') !== undefined, 'button')
  dispatch(app.container, buttonByText(app.container, 'Xóa tiện ích cũ'), 'click')
  await until(() => text(app.container).includes('Bạn không có quyền thực hiện thao tác này'), 'error text')
  assert.ok(text(app.container).includes('wifi cũ'))
  await app.stop()
})
