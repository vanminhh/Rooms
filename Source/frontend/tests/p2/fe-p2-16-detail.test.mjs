// CP-4 (FE-P2-16): src/pages/public/PublicBuildingPage.tsx + PublicRoomPage.tsx + src/features/public/RateTable.tsx,
// EstimatePanel.tsx, ContactCard.tsx. Spec/PLAN: ROOM-05/07/08, PUB-02/03/04, BLD-04, UI-01/03/06/07/08;
// decisions D-1 (link to "/phong?buildingId=:id"), D-4, D-6 (all CP-4 wording, §3). Scenarios #1..#15b from
// PLAN.md CP-4 (22 cases; #16 is the manual 360px check, not automatable here — see REVIEW.md).
//
// Outside edges faked: `fetch` (fakeFetch) and the fake DOM (public-dom.mjs; Node has no real DOM, no jsdom
// installed). Everything under test — PublicBuildingPage, PublicRoomPage, RateTable, EstimatePanel, ContactCard,
// ListState, RoomCard, NotFoundPage, the kit (SectionHeading, CostBreakdown, Spinner, FormError, RoomsButton),
// @tanstack/react-query and react-router — runs unmodified via `loadModule`/`draftFirst`.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import {
  draftFirst, loadModule, mount, find, dispatch, until, wait,
  fakeFetch, ok, fail, alerts, buttonByText,
} from './public-dom.mjs'

const nodeRequire = createRequire(import.meta.url)

// @tanstack/react-query keeps a gc timer alive (default gcTime 5 min) per QueryClient; one is created per
// mountRoom()/mountBuilding() call below. End the process once the tests are done, same convention as the
// other p2 test files.
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

// ---------- fixtures (mirror Source/backend/src/modules/rooms/public.types.ts, PLAN §2.2) ----------
const buildingSummary = (overrides = {}) => ({
  id: 7, code: 'AL1', name: 'An Lâm 1', address: '12 Láng Hạ', district: 'Đống Đa', ward: 'Láng Hạ',
  waterMode: 'PER_M3', amenities: [], description: null, ...overrides,
})
const buildingDetail = (overrides = {}) => ({
  ...buildingSummary(),
  contact: null, rates: { electric: null, water: null, services: [] }, upcomingRates: [], rooms: [],
  ...overrides,
})
const roomListItem = (overrides = {}) => ({
  id: 1, code: 'B101', floor: 1, areaM2: 16, price: 2_100_000, maxOccupants: 2,
  buildingId: 7, buildingCode: 'AL1', buildingName: 'An Lâm 1', district: 'Đống Đa', ward: 'Láng Hạ',
  imageUrl: null, ...overrides,
})
const roomDetail = (overrides = {}) => ({
  id: 10, code: 'B203', floor: 2, areaM2: 18.5, maxOccupants: 2,
  furniture: [], description: null,
  price: 2_300_000, deposit: 2_300_000, monthlyEstimate: 3_119_000,
  estimate: { items: [{ label: 'Tiền phòng', amount: 2_300_000 }], missing: [], meteredNote: '' },
  images: [],
  building: buildingSummary(),
  rates: { electric: null, water: null, services: [] },
  upcomingRates: [],
  contact: null,
  ...overrides,
})

// ---------- mount helpers (same shape as fe-p2-14-home.test.mjs / fe-p2-15-search.test.mjs) ----------
function roomRule(id, result) { return { prefix: `/public/rooms/${id}`, method: 'GET', handler: () => result } }
function buildingRule(id, result) { return { prefix: `/public/buildings/${id}`, method: 'GET', handler: () => result } }

async function mountRoom(initialPath, rules) {
  const calls = fakeFetch(rules)
  const React = nodeRequire('react')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { createMemoryRouter, RouterProvider } = nodeRequire('react-router')
  const { PublicRoomPage } = loadModule(draftFirst('src/pages/public/PublicRoomPage.tsx'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/phong/:id', element: React.createElement(PublicRoomPage) },
  ], { initialEntries: [initialPath] })
  const app = await mount(React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(RouterProvider, { router })))
  return { ...app, calls, path: () => router.state.location.pathname + router.state.location.search }
}

async function mountBuilding(initialPath, rules) {
  const calls = fakeFetch(rules)
  const React = nodeRequire('react')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { createMemoryRouter, RouterProvider } = nodeRequire('react-router')
  const { PublicBuildingPage } = loadModule(draftFirst('src/pages/public/PublicBuildingPage.tsx'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/toa/:id', element: React.createElement(PublicBuildingPage) },
  ], { initialEntries: [initialPath] })
  const app = await mount(React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(RouterProvider, { router })))
  return { ...app, calls, path: () => router.state.location.pathname + router.state.location.search }
}

const sectionByLabel = (container, label) => find(container, n => n.tagName === 'SECTION' && n.getAttribute('aria-label') === label)[0]
const imagesOf = container => find(container, n => n.tagName === 'IMG' && (n.attributes.class ?? '').split(' ').includes('public-room-image'))
const roomCardsOf = container => find(container, n => (n.attributes.class ?? '').split(' ').includes('public-room-card'))
const anchorByText = (container, text) => find(container, n => n.tagName === 'A' && n.textContent.trim() === text)[0]
const rateBlockOf = container => find(container, n => (n.attributes.class ?? '').split(' ').includes('public-rates'))[0]
const dtTextsOf = node => find(node, n => n.tagName === 'DT').map(n => n.textContent)
const ddTextsOf = node => find(node, n => n.tagName === 'DD').map(n => n.textContent)
const ddByDt = (node, label) => {
  const dts = find(node, n => n.tagName === 'DT')
  const i = dts.findIndex(n => n.textContent === label)
  return i === -1 ? undefined : find(node, n => n.tagName === 'DD')[i]
}

// ======================================================================================
// #1
// ======================================================================================
test('FE-P2-16 #1 (ROOM-08): full room data shows price, "Tiền cọc · 1 tháng" = API deposit, "Thời hạn tối thiểu 3 tháng", each estimate.items line, and the total equals monthlyEstimate exactly as sent by the API (not re-summed by the FE)', async () => {
  const room = roomDetail({
    deposit: 2_300_000,
    estimate: { items: [{ label: 'Tiền phòng', amount: 2_300_000 }, { label: 'Phí quản lý', amount: 100_000 }], missing: [], meteredNote: '' },
    monthlyEstimate: 3_119_000, // deliberately NOT items.reduce (2_400_000): proves the FE shows the API total, not a sum it computed
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Phòng B203'), 'loaded')
  const text = app.container.textContent
  assert.ok(text.includes('2.300.000 đ'), text)
  assert.ok(text.includes('Thời hạn tối thiểu 3 tháng'), text)
  assert.equal(ddByDt(app.container, 'Tiền cọc · 1 tháng')?.textContent, '2.300.000 đ')
  assert.equal(ddByDt(app.container, 'Tiền phòng')?.textContent, '2.300.000 đ')
  assert.equal(ddByDt(app.container, 'Phí quản lý')?.textContent, '100.000 đ')
  assert.equal(ddByDt(app.container, 'Tổng chi phí')?.textContent, '3.119.000 đ', 'total must be the API monthlyEstimate, never items.reduce()')
  await app.stop()
})

// ======================================================================================
// #2
// ======================================================================================
test('FE-P2-16 #2 (ROOM-08, SVC-04): estimate.missing renders its line verbatim', async () => {
  const room = roomDetail({ estimate: { items: [], missing: ['chưa gồm: vệ sinh chung'], meteredNote: '' } })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('chưa gồm: vệ sinh chung'), 'missing line shown')
  await app.stop()
})

// ======================================================================================
// #3
// ======================================================================================
test('FE-P2-16 #3 (ROOM-08): estimate.meteredNote renders verbatim', async () => {
  const note = 'chưa gồm điện, nước – tính theo đồng hồ của phòng'
  const room = roomDetail({ estimate: { items: [], missing: [], meteredNote: note } })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes(note), 'metered note shown')
  await app.stop()
})

// ======================================================================================
// #4
// ======================================================================================
test('FE-P2-16 #4 (ROOM-07, UI-08): images: [] shows "Chưa có ảnh", no room <img>', async () => {
  const room = roomDetail({ images: [] })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Chưa có ảnh'), 'loaded')
  assert.equal(imagesOf(app.container).length, 0)
  await app.stop()
})

// ======================================================================================
// #5
// ======================================================================================
test('FE-P2-16 #5 (UI-08): images with 3 entries render 3 <img> in sortOrder, each with a non-empty alt containing the room code', async () => {
  const room = roomDetail({
    images: [{ id: 1, url: '/a.jpg', sortOrder: 0 }, { id: 2, url: '/b.jpg', sortOrder: 1 }, { id: 3, url: '/c.jpg', sortOrder: 2 }],
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => imagesOf(app.container).length === 3, 'images loaded')
  const imgs = imagesOf(app.container)
  assert.deepEqual(imgs.map(i => i.getAttribute('src')), ['/a.jpg', '/b.jpg', '/c.jpg'])
  imgs.forEach(img => {
    assert.ok(img.getAttribute('alt'), 'alt must be non-empty')
    assert.ok(img.getAttribute('alt').includes('B203'))
  })
  await app.stop()
})

// ======================================================================================
// #6
// ======================================================================================
test('FE-P2-16 #6 (PUB-03, D-6.1): 3 electric tiers (50, 100, null) + PER_M3 water render the exact dt strings, en dash, lowercase "từ", "/ kWh" and "/ m³"; block has "Đơn giá rõ ràng" + "Đang áp dụng"', async () => {
  const room = roomDetail({
    rates: {
      electric: { kind: 'ELECTRIC', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-01-01', tiers: [
        { tierNo: 1, upTo: 50, unitPrice: 2000 }, { tierNo: 2, upTo: 100, unitPrice: 2500 }, { tierNo: 3, upTo: null, unitPrice: 3000 },
      ] },
      water: { kind: 'WATER', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice: 15000 }] },
      services: [],
    },
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Đơn giá rõ ràng'), 'loaded')
  const block = rateBlockOf(app.container)
  const dts = dtTextsOf(block)
  assert.ok(dts.includes('Điện · 0–50 kWh'), dts.join(' | '))
  assert.ok(dts.includes('Điện · 51–100 kWh'), dts.join(' | '))
  assert.ok(dts.includes('Điện · từ 101 kWh'), dts.join(' | '))
  assert.ok(dts.includes('Nước'), dts.join(' | '))
  assert.ok(block.textContent.includes('Đang áp dụng'))
  assert.ok(ddByDt(block, 'Nước')?.textContent.endsWith('/ m³'))
  assert.ok(ddByDt(block, 'Điện · 0–50 kWh')?.textContent.endsWith('/ kWh'))
  await app.stop()
})

// ======================================================================================
// #6b
// ======================================================================================
test('FE-P2-16 #6b (PUB-03, D-6.1): a single electric tier (upTo = null) renders exactly one "Điện · từ 1 kWh" line, no "0–null" or NaN', async () => {
  const room = roomDetail({
    rates: { electric: { kind: 'ELECTRIC', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice: 3000 }] }, water: null, services: [] },
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Đơn giá rõ ràng'), 'loaded')
  const block = rateBlockOf(app.container)
  const electricDts = dtTextsOf(block).filter(t => t.startsWith('Điện'))
  assert.deepEqual(electricDts, ['Điện · từ 1 kWh'])
  assert.ok(!block.textContent.includes('NaN'))
  assert.ok(!block.textContent.includes('0–null'))
  await app.stop()
})

// ======================================================================================
// #7
// ======================================================================================
test('FE-P2-16 #7 (SVC-03, D-6.1): waterMode = PER_PERSON makes the "Nước" line end with "/ người / kỳ", never "/ m³"', async () => {
  const room = roomDetail({
    building: buildingSummary({ waterMode: 'PER_PERSON' }),
    rates: { electric: null, water: { kind: 'WATER', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice: 8000 }] }, services: [] },
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Đơn giá rõ ràng'), 'loaded')
  const block = rateBlockOf(app.container)
  const waterDd = ddByDt(block, 'Nước')
  assert.ok(waterDd?.textContent.endsWith('/ người / kỳ'), waterDd?.textContent)
  assert.ok(!waterDd?.textContent.includes('/ m³'))
  await app.stop()
})

// ======================================================================================
// #7b
// ======================================================================================
test('FE-P2-16 #7b (SVC-03, D-6.1): service dt = serviceName verbatim; suffix follows unit (ROOM/PERSON/VEHICLE); unit = null has no suffix', async () => {
  const service = (serviceId, serviceName, unit, unitPrice) => ({ kind: 'SERVICE', serviceId, serviceName, unit, effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice }] })
  const room = roomDetail({
    rates: { electric: null, water: null, services: [
      service(1, 'Wifi', 'ROOM', 100_000),
      service(2, 'Rác', 'PERSON', 30_000),
      service(3, 'Gửi xe máy', 'VEHICLE', 50_000),
      service(4, 'Phí quản lý', null, 20_000),
    ] },
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Đơn giá rõ ràng'), 'loaded')
  const block = rateBlockOf(app.container)
  assert.equal(ddByDt(block, 'Wifi')?.textContent, '100.000 đ / phòng / kỳ')
  assert.equal(ddByDt(block, 'Rác')?.textContent, '30.000 đ / người / kỳ')
  assert.equal(ddByDt(block, 'Gửi xe máy')?.textContent, '50.000 đ / xe / kỳ')
  const noUnitDd = ddByDt(block, 'Phí quản lý')
  assert.equal(noUnitDd?.textContent, '20.000 đ')
  assert.ok(!noUnitDd?.textContent.includes('/'))
  await app.stop()
})

// ======================================================================================
// #8
// ======================================================================================
test('FE-P2-16 #8 (PUB-03, D-6.2): one upcomingRates element renders "Từ 15/11/2026: Wifi 120.000 đ / phòng / kỳ." exactly; upcomingRates: [] has no "Từ " line', async () => {
  const room = roomDetail({
    upcomingRates: [{ kind: 'SERVICE', serviceId: 1, serviceName: 'Wifi', unit: 'ROOM', effectiveFrom: '2026-11-15', tiers: [{ tierNo: 1, upTo: null, unitPrice: 120_000 }] }],
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Từ 15/11/2026'), 'loaded')
  assert.ok(app.container.textContent.includes('Từ 15/11/2026: Wifi 120.000 đ / phòng / kỳ.'), app.container.textContent)
  await app.stop()

  const room2 = roomDetail({ upcomingRates: [] })
  const app2 = await mountRoom('/phong/10', [roomRule(10, ok(room2))])
  await until(() => app2.container.textContent.includes('Đơn giá rõ ràng'), 'loaded')
  assert.ok(!app2.container.textContent.includes('Từ '), app2.container.textContent)
  await app2.stop()
})

// ======================================================================================
// #9
// ======================================================================================
test('FE-P2-16 #9 (UI-03, D-6.1): rates.electric = null and services: [] do not crash the page and print no electric/service line, no "0 đ" anywhere', async () => {
  const room = roomDetail({
    price: 2_300_000, deposit: 2_300_000, monthlyEstimate: 3_119_000,
    rates: { electric: null, water: { kind: 'WATER', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice: 15_000 }] }, services: [] },
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Đơn giá rõ ràng'), 'loaded')
  const block = rateBlockOf(app.container)
  assert.ok(!dtTextsOf(block).some(t => t.startsWith('Điện')), 'no electric line')
  assert.equal(dtTextsOf(block).filter(t => t === 'Nước').length, 1)
  // "0 đ" as a *substring* would also match ordinary non-zero amounts (e.g. "2.300.000 đ"); check no <dd>
  // renders the exact zero-money token instead.
  assert.ok(!find(app.container, n => n.tagName === 'DD').some(dd => dd.textContent === '0 đ'), app.container.textContent)
  await app.stop()
})

// ======================================================================================
// #10
// ======================================================================================
test('FE-P2-16 #10 (BLD-04): contact = null shows no contact block, no empty phone number', async () => {
  const room = roomDetail({ contact: null })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Phòng B203'), 'loaded')
  assert.ok(!app.container.textContent.includes('Liên hệ'))
  assert.equal(find(app.container, n => n.tagName === 'A' && (n.getAttribute('href') ?? '').startsWith('tel:')).length, 0)
  await app.stop()
})

// ======================================================================================
// #11
// ======================================================================================
test('FE-P2-16 #11 (BLD-04): contact with phone and zaloUrl = null shows tel: link, no Zalo link', async () => {
  const room = roomDetail({ contact: { phone: '0900000001', zaloUrl: null, facebookUrl: null } })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Phòng B203'), 'loaded')
  const telLink = find(app.container, n => n.tagName === 'A' && n.getAttribute('href') === 'tel:0900000001')[0]
  assert.ok(telLink)
  assert.ok(!app.container.textContent.includes('Nhắn Zalo'))
  await app.stop()
})

// ======================================================================================
// #12
// ======================================================================================
test('FE-P2-16 #12 (PUB-02): 404 from /public/rooms/999 and /public/buildings/999 render NotFoundPage, URL unchanged, exactly 1 request (retry: false, no 3-try storm)', async () => {
  {
    const app = await mountRoom('/phong/999', [roomRule(999, fail(404, 'NOT_FOUND', 'Không tìm thấy'))])
    await until(() => app.container.textContent.includes('Không tìm thấy trang'), 'not found (room)')
    assert.ok(find(app.container, n => n.tagName === 'A' && n.textContent.trim() === 'Về trang chủ' && n.getAttribute('href') === '/').length === 1)
    assert.equal(app.path(), '/phong/999')
    await wait(80)
    assert.equal(app.calls.length, 1, 'no retry storm')
    await app.stop()
  }
  {
    const app = await mountBuilding('/toa/999', [buildingRule(999, fail(404, 'NOT_FOUND', 'Không tìm thấy'))])
    await until(() => app.container.textContent.includes('Không tìm thấy trang'), 'not found (building)')
    assert.equal(app.path(), '/toa/999')
    await wait(80)
    assert.equal(app.calls.length, 1, 'no retry storm')
    await app.stop()
  }
})

// ======================================================================================
// #12b
// ======================================================================================
test('FE-P2-16 #12b (PUB-02): /phong/abc, /0, /-1, /1.5 render NotFoundPage at once with no request to /public/rooms/*; same for /toa/abc with /public/buildings/*', async () => {
  for (const bad of ['abc', '0', '-1', '1.5']) {
    const app = await mountRoom(`/phong/${bad}`, [])
    await until(() => app.container.textContent.includes('Không tìm thấy trang'), `not found for id=${bad}`)
    assert.equal(app.calls.length, 0, `no request for id=${bad}`)
    await app.stop()
  }
  const buildingApp = await mountBuilding('/toa/abc', [])
  await until(() => buildingApp.container.textContent.includes('Không tìm thấy trang'), 'not found for building id=abc')
  assert.equal(buildingApp.calls.length, 0)
  await buildingApp.stop()
})

// ======================================================================================
// #13
// ======================================================================================
test('FE-P2-16 #13 (BLD-05, D-6.3): /toa/:id with rooms shows a section aria-label="Còn trống tại tòa" with the room cards in API order, text "Còn trống tại tòa", and a link "Xem phòng trống của tòa này" -> /phong?buildingId=<id>; rooms: [] shows the empty state', async () => {
  const rooms = [roomListItem({ id: 1, code: 'B101' }), roomListItem({ id: 2, code: 'B102' })]
  const building = buildingDetail({ id: 7, rooms })
  const app = await mountBuilding('/toa/7', [buildingRule(7, ok(building))])
  await until(() => app.container.textContent.includes('Còn trống tại tòa'), 'loaded')
  const section = sectionByLabel(app.container, 'Còn trống tại tòa')
  assert.ok(section)
  const cards = roomCardsOf(section)
  assert.deepEqual(cards.map(c => c.textContent.includes('B101')), [true, false])
  assert.equal(cards.length, 2)
  assert.ok(cards[1].textContent.includes('B102'))
  const link = anchorByText(app.container, 'Xem phòng trống của tòa này')
  assert.equal(link?.getAttribute('href'), '/phong?buildingId=7')
  await app.stop()

  const emptyBuilding = buildingDetail({ id: 7, rooms: [] })
  const app2 = await mountBuilding('/toa/7', [buildingRule(7, ok(emptyBuilding))])
  await until(() => app2.container.textContent.includes('Chưa có phòng trống nào'), 'empty state')
  await app2.stop()
})

// ======================================================================================
// #14
// ======================================================================================
test('FE-P2-16 #14 (UI-03, D-6.7): loading shows "Đang tải danh sách phòng" in role=status; error 500 shows error.message in role=alert + "Thử lại", clicking it refetches', async () => {
  {
    const app = await mountRoom('/phong/10', [roomRule(10, new Promise(() => {}))])
    assert.ok(find(app.container, n => n.attributes.role === 'status').length >= 1)
    assert.ok(app.container.textContent.includes('Đang tải danh sách phòng'))
    await app.stop()
  }
  {
    let failing = true
    const app = await mountRoom('/phong/10', [{ prefix: '/public/rooms/10', method: 'GET', handler: () => failing ? fail(500, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : ok(roomDetail()) }])
    await until(() => alerts(app.container).length === 1, 'error shown')
    assert.equal(alerts(app.container)[0], 'Có lỗi xảy ra, vui lòng thử lại sau')
    failing = false
    dispatch(app.container, buttonByText(app.container, 'Thử lại'), 'click')
    await until(() => app.container.textContent.includes('Phòng B203'), 'retried')
    assert.equal(alerts(app.container).length, 0)
    await app.stop()
  }
})

// ======================================================================================
// #14b
// ======================================================================================
test('FE-P2-16 #14b (D-6.4): price has no "/ tháng"; that string appears only once, inside "Ước tính chi phí / tháng"', async () => {
  const room = roomDetail({ price: 2_300_000 })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Phòng B203'), 'loaded')
  const text = app.container.textContent
  assert.ok(text.includes('2.300.000 đ'))
  const occurrences = text.split('/ tháng').length - 1
  assert.equal(occurrences, 1, `"/ tháng" must occur exactly once, got: ${text}`)
  assert.ok(text.includes('Ước tính chi phí / tháng'))
  await app.stop()
})

// ======================================================================================
// #14c
// ======================================================================================
test('FE-P2-16 #14c (ROOM-08, D-6.6): CostBreakdown kit wording is present verbatim; "Tổng chi phí" = formatMoney(monthlyEstimate), unaffected by what the items are', async () => {
  const roomA = roomDetail({ estimate: { items: [{ label: 'Tiền phòng', amount: 1_000_000 }], missing: [], meteredNote: '' }, monthlyEstimate: 3_119_000 })
  const appA = await mountRoom('/phong/10', [roomRule(10, ok(roomA))])
  await until(() => appA.container.textContent.includes('Chi phí minh bạch'), 'loaded')
  const text = appA.container.textContent
  assert.ok(text.includes('Chi phí minh bạch'))
  assert.ok(text.includes('Một tháng,'))
  assert.ok(text.includes('an tâm ở lại.'))
  assert.ok(text.includes('Tổng chi phí'))
  assert.ok(text.includes('Ước tính chi phí / tháng'))
  assert.equal(ddByDt(appA.container, 'Tổng chi phí')?.textContent, '3.119.000 đ')
  await appA.stop()

  // Different items, same monthlyEstimate -> same total: proves the FE never adds items up itself.
  const roomB = roomDetail({ estimate: { items: [], missing: [], meteredNote: '' }, monthlyEstimate: 3_119_000 })
  const appB = await mountRoom('/phong/10', [roomRule(10, ok(roomB))])
  await until(() => appB.container.textContent.includes('Tổng chi phí'), 'loaded')
  assert.equal(ddByDt(appB.container, 'Tổng chi phí')?.textContent, '3.119.000 đ')
  await appB.stop()
})

// ======================================================================================
// #14d
// ======================================================================================
test('FE-P2-16 #14d (D-6.5): room/building description and amenities render verbatim; null/empty renders no literal "null"', async () => {
  const room = roomDetail({
    description: 'Phòng góc, nhiều ánh sáng tự nhiên.',
    building: buildingSummary({ description: 'Tòa nhà mới xây, an ninh tốt.', amenities: ['Thang máy', 'Bảo vệ 24/7'] }),
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Phòng góc, nhiều ánh sáng tự nhiên.'), 'loaded')
  const text = app.container.textContent
  assert.ok(text.includes('Tòa nhà mới xây, an ninh tốt.'))
  assert.ok(text.includes('Thang máy'))
  assert.ok(text.includes('Bảo vệ 24/7'))
  const descriptionHeadings = find(app.container, node => node.tagName === 'H2' && node.textContent === 'Mô tả phòng')
  assert.equal(descriptionHeadings.length, 1)
  assert.ok(!text.includes('Tiện ích'), text)
  await app.stop()

  const room2 = roomDetail({ description: null, building: buildingSummary({ description: null, amenities: [] }) })
  const app2 = await mountRoom('/phong/10', [roomRule(10, ok(room2))])
  await until(() => app2.container.textContent.includes('Phòng B203'), 'loaded')
  assert.ok(!app2.container.textContent.includes('null'), app2.container.textContent)
  await app2.stop()
})

// ======================================================================================
// #15
// ======================================================================================
test('FE-P2-16 #15 (PUB-04): no internal field leaks into the rendered text even if present on the object', async () => {
  const room = roomDetail({ managerId: 918273645, building: buildingSummary({ userId: 918273645 }) })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Phòng B203'), 'loaded')
  assert.ok(!app.container.textContent.includes('918273645'), app.container.textContent)
  await app.stop()
})

// ======================================================================================
// #15b
// ======================================================================================
test('FE-P2-16 #15b (D-6): page contains no stray wording outside the CP-4 string tables', async () => {
  const room = roomDetail({
    description: 'Phòng góc.',
    building: buildingSummary({ description: 'Tòa đẹp.', amenities: ['Thang máy'] }),
    rates: {
      electric: { kind: 'ELECTRIC', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice: 3000 }] },
      water: { kind: 'WATER', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice: 15_000 }] },
      services: [],
    },
  })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Đơn giá rõ ràng'), 'loaded')
  const text = app.container.textContent
  assert.ok(!text.includes('Đơn giá đang áp dụng'), text)
  assert.ok(!text.includes('Chọn một căn phòng.'), text)
  assert.ok(!text.includes('Đang làm'), text)
  assert.ok(!text.includes('Trang đang được xây dựng'), text)
  await app.stop()
})

