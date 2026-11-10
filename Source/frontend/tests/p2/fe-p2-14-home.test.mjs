// CP-2 (FE-P2-14): src/pages/public/PublicHomePage.tsx (+ PlaceholderPage.tsx wrapper, A-2).
// Spec/PLAN: PUB-01 (/public/featured-rooms), BLD-05 + ROOM-05 (/public/locations), UI-01/03/08; D-2, D-4.
// (PublicLayout's "Tìm phòng" menu, D-5, is already covered by tests/auth-login-flow.test.mjs; not repeated here.)
//
// Outside edges faked: `fetch` (fakeFetch, outside edge) and the fake DOM (public-dom.mjs; Node has no real
// DOM, no jsdom installed). public-dom.mjs's FakeFormData shim is also an outside-edge fake: Node's own
// FormData only supports the no-argument constructor, not the HTML-spec `new FormData(form)` overload that
// RoomSearch (kit, out of scope here) uses on submit — without the shim, dispatching 'submit' on it throws
// asynchronously and kills the process. Everything else — PublicHomePage, ListState, RoomCard, the kit
// (RoomSearch, SectionHeading, Spinner, FormError, RoomsButton), @tanstack/react-query and react-router — runs
// unmodified via `loadModule`/`draftFirst` (draft-root.mjs's draft-first/main-fallback resolution).
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import {
  draftFirst, loadModule, mount, find, dispatch, until,
  fakeFetch, ok, fail,
} from './public-dom.mjs'

// loadModule (draft-root.mjs) resolves bare imports ('react', '@tanstack/react-query', 'react-router', ...)
// with `createRequire`, i.e. the CJS build. Providers created from the ESM build (`import(...)`) would be a
// second, separate module instance with its own React context, so useQuery's "No QueryClient set" fires even
// though a QueryClientProvider is mounted. Use the same CJS require here, matching
// tests/auth-login-flow.test.mjs's loader convention.
const nodeRequire = createRequire(import.meta.url)

// @tanstack/react-query's QueryClient keeps a gc timer alive (default gcTime 5 min) per client; one is created
// per mountHome() call below. End the process once the tests are done, same as tests/auth-login-flow.test.mjs.
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

const room = (overrides = {}) => ({
  id: 1, code: 'B203', floor: 2, areaM2: 18.5, price: 2_300_000, maxOccupants: 2,
  buildingId: 1, buildingCode: 'B', buildingName: 'Tòa B', district: 'Cầu Giấy', ward: 'Dịch Vọng',
  imageUrl: null, ...overrides,
})
const location = (overrides = {}) => ({ district: 'Cầu Giấy', roomCount: 5, wards: [], ...overrides })
const roomCards = container => find(container, n => (n.attributes.class ?? '').split(' ').includes('public-room-card'))
const sectionByLabel = (container, label) => find(container, n => n.tagName === 'SECTION' && n.getAttribute('aria-label') === label)[0]
const alertsOf = container => find(container, n => n.attributes.role === 'alert')
const buttonByText = (container, label) => find(container, n => n.tagName === 'BUTTON' && n.textContent.trim() === label)[0]

// Mounts the real PublicHomePage at "/" behind its own QueryClient (retry disabled so a 500 settles into the
// error state immediately instead of after react-query's default 3 retries — this is react-query's own cross-
// cutting retry policy, not the unit under test) and a tiny two-route memory router so Link/useNavigate to
// /phong are real and observable.
async function mountHome(rules) {
  const contactRule = { prefix: '/public/contact', method: 'GET', handler: () => ok(null) }
  const calls = fakeFetch(rules.some(rule => rule.prefix === '/public/contact') ? rules : [...rules, contactRule])
  const React = nodeRequire('react')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { createMemoryRouter, RouterProvider } = nodeRequire('react-router')
  const { PublicHomePage } = loadModule(draftFirst('src/pages/public/PublicHomePage.tsx'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/', element: React.createElement(PublicHomePage) },
    { path: '/phong', element: React.createElement('p', null, 'PHONG MARKER') },
  ], { initialEntries: ['/'] })
  const app = await mount(React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(RouterProvider, { router })))
  return { ...app, calls, path: () => router.state.location.pathname + router.state.location.search }
}

async function searchAndSubmit(app, { district = '', maxPrice = '' } = {}) {
  await until(() => find(app.container, n => n.tagName === 'FORM').length === 1, 'search form')
  const form = find(app.container, n => n.tagName === 'FORM')[0]
  find(form, n => n.tagName === 'SELECT' && n.name === 'district')[0].value = district
  find(form, n => n.tagName === 'SELECT' && n.name === 'maxPrice')[0].value = maxPrice
  dispatch(app.container, form, 'submit')
}

const emptyRules = [
  { prefix: '/public/featured-rooms', method: 'GET', handler: () => ok([]) },
  { prefix: '/public/locations', method: 'GET', handler: () => ok([]) },
]

// ======================================================================================
// #1 data: 6 featured rooms in API order, 3 districts with name + roomCount, integer money
// ======================================================================================
test('PUB-01/UI-01: 6 featured rooms render as 6 cards in API order; districts show name + roomCount; price is "x đ"', async () => {
  const rooms = Array.from({ length: 6 }, (_, i) => room({ id: i + 1, code: `B${200 + i}`, price: 2_000_000 + i * 100_000 }))
  const locations = [location({ district: 'Cầu Giấy', roomCount: 5 }), location({ district: 'Đống Đa', roomCount: 2 }), location({ district: 'Ba Đình', roomCount: 0 })]
  const app = await mountHome([
    { prefix: '/public/featured-rooms', method: 'GET', handler: () => ok(rooms) },
    { prefix: '/public/locations', method: 'GET', handler: () => ok(locations) },
  ])
  await until(() => roomCards(app.container).length === 6, 'featured cards')
  const cards = roomCards(app.container)
  cards.forEach((card, i) => assert.ok(card.textContent.includes(`Phòng ${rooms[i].code}`), `card ${i} should be room ${rooms[i].code}, got: ${card.textContent}`))
  assert.ok(app.container.textContent.includes('2.000.000 đ'), app.container.textContent)
  for (const loc of locations) {
    assert.ok(app.container.textContent.includes(loc.district))
    assert.ok(app.container.textContent.includes(`${loc.roomCount} phòng trống`))
  }
  await app.stop()
})

test('UI-20: hero totals rooms, districts and wards from /public/locations; filter uses approved labels', async () => {
  const locations = [
    location({ district: 'Cầu Giấy', roomCount: 5, wards: [{ ward: 'Dịch Vọng', roomCount: 3 }] }),
    location({ district: 'Đống Đa', roomCount: 2, wards: [{ ward: 'Láng Hạ', roomCount: 1 }, { ward: 'Ô Chợ Dừa', roomCount: 1 }] }),
  ]
  const app = await mountHome([
    { prefix: '/public/featured-rooms', method: 'GET', handler: () => ok([]) },
    { prefix: '/public/locations', method: 'GET', handler: () => ok(locations) },
  ])
  await until(() => app.container.textContent.includes('Còn 7 phòng trống'), 'hero totals')
  for (const needle of [
    '7Phòng · Đang trống',
    '2Quận · Đang có phòng cho thuê',
    '3Phường · Đang có phòng cho thuê',
    'Quận / Khu vực', 'Khoảng giá', 'Lọc phòng trống', 'Ảnh minh họa',
  ]) assert.ok(app.container.textContent.includes(needle), `missing "${needle}"`)
  await app.stop()
})

// ======================================================================================
// #2 loading
// ======================================================================================
test('UI-03: while both requests are in flight, both lists show role="status" "Đang tải danh sách phòng" and no room cards', async () => {
  const app = await mountHome([
    { prefix: '/public/featured-rooms', method: 'GET', handler: () => new Promise(() => {}) }, // never resolves, no timer
    { prefix: '/public/locations', method: 'GET', handler: () => new Promise(() => {}) },
  ])
  assert.equal(find(app.container, n => n.attributes.role === 'status').length, 2, 'both ListStates pending')
  assert.ok(app.container.textContent.includes('Đang tải danh sách phòng'))
  assert.equal(roomCards(app.container).length, 0)
  await app.stop()
})

// ======================================================================================
// #3 empty
// ======================================================================================
test('UI-03: empty featured rooms and empty locations show "Chưa có phòng trống nào" with a link to /phong, no role="alert"', async () => {
  const app = await mountHome(emptyRules)
  await until(() => app.container.textContent.includes('Chưa có phòng trống nào'), 'empty state')
  assert.equal(alertsOf(app.container).length, 0)
  assert.ok(find(app.container, n => n.tagName === 'A' && n.textContent.trim() === 'Xem tất cả phòng trống').length > 0)
  await app.stop()
})

// ======================================================================================
// #4 error + retry
// ======================================================================================
test('UI-03/UI-05: a 500 on featured rooms shows error.message in role="alert" with "Thử lại"; retry refetches and shows data', async () => {
  let fail500 = true
  const theRoom = room({ id: 9, code: 'C301' })
  const app = await mountHome([
    { prefix: '/public/featured-rooms', method: 'GET', handler: () => fail500 ? fail(500, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : ok([theRoom]) },
    { prefix: '/public/locations', method: 'GET', handler: () => ok([]) },
  ])
  await until(() => alertsOf(app.container).length === 1, 'error block')
  assert.equal(alertsOf(app.container)[0].textContent, 'Có lỗi xảy ra, vui lòng thử lại sau')
  const retryBtn = buttonByText(app.container, 'Thử lại')
  assert.ok(retryBtn, 'retry button')
  fail500 = false
  dispatch(app.container, retryBtn, 'click')
  await until(() => roomCards(app.container).length === 1, 'data after retry')
  assert.equal(alertsOf(app.container).length, 0)
  await app.stop()
})

// ======================================================================================
// #5 image / no-image
// ======================================================================================
test('UI-08: a featured room with imageUrl=null shows "Chưa có ảnh"; one with an imageUrl renders an <img> with non-empty alt', async () => {
  const rooms = [room({ id: 1, imageUrl: null }), room({ id: 2, imageUrl: 'https://x/img.jpg', code: 'B210' })]
  const app = await mountHome([
    { prefix: '/public/featured-rooms', method: 'GET', handler: () => ok(rooms) },
    { prefix: '/public/locations', method: 'GET', handler: () => ok([]) },
  ])
  await until(() => roomCards(app.container).length === 2, 'cards')
  assert.ok(app.container.textContent.includes('Chưa có ảnh'))
  const imgs = find(app.container, n => n.tagName === 'IMG' && n.getAttribute('src') === 'https://x/img.jpg')
  assert.equal(imgs.length, 1)
  assert.ok((imgs[0].getAttribute('alt') ?? '').length > 0, 'card <img> must have a non-empty alt')
  await app.stop()
})

// ======================================================================================
// #6 clicking a district navigates to /phong?district=... (exactly one param, encoded)
// ======================================================================================
test('FE-P2-15: clicking a district card navigates to /phong with exactly one district param, encoded, no extra query', async () => {
  const locations = [location({ district: 'Cầu Giấy', roomCount: 5 })]
  const app = await mountHome([
    { prefix: '/public/featured-rooms', method: 'GET', handler: () => ok([]) },
    { prefix: '/public/locations', method: 'GET', handler: () => ok(locations) },
  ])
  await until(() => find(app.container, n => n.tagName === 'A' && n.textContent.includes('Cầu Giấy')).length > 0, 'district link')
  const link = find(app.container, n => n.tagName === 'A' && n.textContent.includes('Cầu Giấy'))[0]
  const expected = `/phong?${new URLSearchParams({ district: 'Cầu Giấy' }).toString()}`
  assert.equal(link.getAttribute('href'), expected)
  dispatch(app.container, link, 'click')
  await until(() => app.path() === expected, 'navigated')
  await app.stop()
})

// ======================================================================================
// #7 budget select: exactly 5 ceilings + "Tất cả mức giá", in D-2 order
// ======================================================================================
test('D-2: the home-page budget select has exactly the 5 ceilings plus "Tất cả mức giá", in order', async () => {
  const app = await mountHome(emptyRules)
  await until(() => find(app.container, n => n.tagName === 'SELECT' && n.name === 'maxPrice').length === 1, 'budget select')
  const select = find(app.container, n => n.tagName === 'SELECT' && n.name === 'maxPrice')[0]
  const options = find(select, n => n.tagName === 'OPTION').map(o => o.textContent)
  assert.deepEqual(options, ['Tất cả mức giá', 'Đến 2.000.000 đ', 'Đến 3.000.000 đ', 'Đến 4.000.000 đ', 'Đến 5.000.000 đ', 'Trên 5.000.000 đ'])
  await app.stop()
})

// ======================================================================================
// #8/#9/#10 RoomSearch submit -> navigation
// ======================================================================================
test('D-2: submitting a district + "Đến 3.000.000 đ" navigates to /phong?district=...&maxPrice=3000000', async () => {
  const app = await mountHome(emptyRules)
  await searchAndSubmit(app, { district: 'Cầu Giấy', maxPrice: '3000000' })
  const expected = `/phong?${new URLSearchParams({ district: 'Cầu Giấy', maxPrice: '3000000' }).toString()}`
  await until(() => app.path() === expected, `navigated (got ${app.path()})`)
  await app.stop()
})

test('D-2/A-8: submitting "Trên 5.000.000 đ" navigates to /phong?minPrice=5000000, with no maxPrice param', async () => {
  const app = await mountHome(emptyRules)
  await searchAndSubmit(app, { maxPrice: '5000000+' })
  await until(() => app.path() === '/phong?minPrice=5000000', `navigated (got ${app.path()})`)
  assert.ok(!app.path().includes('maxPrice'))
  await app.stop()
})

test('D-2: submitting with both fields empty navigates to /phong with no query', async () => {
  const app = await mountHome(emptyRules)
  await searchAndSubmit(app)
  await until(() => app.path() === '/phong', `navigated (got ${app.path()})`)
  await app.stop()
})

// ======================================================================================
// #12/#13/#14 hero text + link + image
// ======================================================================================
test('UI-20: hero contains the approved UI-02 strings', async () => {
  const app = await mountHome(emptyRules)
  await until(() => find(app.container, n => n.tagName === 'FORM').length === 1, 'loaded')
  for (const needle of [
    'Phòng thuê tại Hà Nội', 'Một nơi ở', 'vừa vặn', 'giữa phố.',
    'Khám phá phòng thuê tại Hà Nội với thông tin rõ ràng về giá, diện tích và tiện ích.',
    'Chọn phòng phù hợp và đặt lịch xem trực tiếp.', 'Tìm phòng trống',
  ]) assert.ok(app.container.textContent.includes(needle), `missing "${needle}"`)
  await app.stop()
})

test('UI-20/FE-P2-15: "Tìm phòng trống" is an <a href="/phong">; clicking it navigates via the router', async () => {
  const app = await mountHome(emptyRules)
  const link = find(app.container, n => n.tagName === 'A' && n.textContent.includes('Tìm phòng trống'))[0]
  assert.ok(link, 'hero link not found')
  assert.equal(link.getAttribute('href'), '/phong')
  dispatch(app.container, link, 'click')
  await until(() => app.path() === '/phong', 'navigated')
  await app.stop()
})

test('UI-20/KIT-11: hero uses hero-building.webp, a meaningful alt and the visible illustration label', async () => {
  const app = await mountHome(emptyRules)
  const heroImgs = find(app.container, n => n.tagName === 'IMG' && n.getAttribute('src') === '/images/hero-building.webp')
  assert.equal(heroImgs.length, 1)
  assert.ok((heroImgs[0].getAttribute('alt') ?? '').length > 0)
  assert.ok(app.container.textContent.includes('Ảnh minh họa'))
  await app.stop()
})

// ======================================================================================
// #15/#16 block strings + aria-label
// ======================================================================================
test('UI-21: featured-rooms block has the approved heading, description, link and aria-label', async () => {
  const app = await mountHome(emptyRules)
  await until(() => sectionByLabel(app.container, 'Phòng nổi bật') !== undefined, 'featured section')
  const text = sectionByLabel(app.container, 'Phòng nổi bật').textContent
  for (const needle of ['Phòng vừa cập nhật', 'Những phòng trống có giá vừa được duyệt gần đây.', 'Phòng nổi bật', 'Xem tất cả phòng trống']) {
    assert.ok(text.includes(needle), `missing "${needle}"`)
  }
  await app.stop()
})

test('UI-21: districts block has the approved heading, description and aria-label', async () => {
  const app = await mountHome(emptyRules)
  await until(() => sectionByLabel(app.container, 'Khu vực') !== undefined, 'districts section')
  const text = sectionByLabel(app.container, 'Khu vực').textContent
  assert.ok(text.includes('Khu vực có phòng trống'))
  assert.ok(text.includes('Chọn khu vực phù hợp'))
  assert.ok(text.includes('Số phòng được cập nhật từ danh sách công khai.'))
  await app.stop()
})

// ======================================================================================
// #17 "{n} phòng trống" exact, including 0, no padding
// ======================================================================================
test('D-4 (Q-6): district card shows "{n} phòng trống" exactly, including 0, with no zero-padding', async () => {
  const locations = [location({ district: 'Cầu Giấy', roomCount: 5 }), location({ district: 'Ba Đình', roomCount: 0 })]
  const app = await mountHome([
    { prefix: '/public/featured-rooms', method: 'GET', handler: () => ok([]) },
    { prefix: '/public/locations', method: 'GET', handler: () => ok(locations) },
  ])
  await until(() => app.container.textContent.includes('Cầu Giấy'), 'districts')
  assert.ok(app.container.textContent.includes('5 phòng trống'))
  assert.ok(app.container.textContent.includes('0 phòng trống'))
  assert.ok(!app.container.textContent.includes('05 phòng trống'))
  assert.ok(!app.container.textContent.includes('00 phòng trống'))
  await app.stop()
})

// ======================================================================================
// #18 no leftover placeholder text; the full D-4 string list is present
// ======================================================================================
test('D-4: all required home-page strings are present and no leftover placeholder text ("Đang làm" / "Trang đang được xây dựng")', async () => {
  const locations = [location({ district: 'Cầu Giấy', roomCount: 5 })]
  const app = await mountHome([
    { prefix: '/public/featured-rooms', method: 'GET', handler: () => ok([]) },
    { prefix: '/public/locations', method: 'GET', handler: () => ok(locations) },
  ])
  await until(() => app.container.textContent.includes('Cầu Giấy'), 'loaded')
  const text = app.container.textContent
  const required = [
    'Phòng thuê tại Hà Nội', 'Một nơi ở', 'vừa vặn', 'giữa phố.',
    'Khám phá phòng thuê tại Hà Nội với thông tin rõ ràng về giá, diện tích và tiện ích.',
    'Chọn phòng phù hợp và đặt lịch xem trực tiếp.', 'Tìm phòng trống', 'Phòng vừa cập nhật',
    'Những phòng trống có giá vừa được duyệt gần đây.', 'Phòng nổi bật', 'Xem tất cả phòng trống',
    'Khu vực có phòng trống', 'Chọn khu vực phù hợp', '5 phòng trống',
    'Vì sao chọn ROOMS?', 'Tìm và xem phòng trong 3 bước', 'Chọn phòng phù hợp với bạn',
  ]
  for (const needle of required) assert.ok(text.includes(needle), `missing "${needle}"`)
  assert.equal(find(app.container, n => n.tagName === 'IMG' && n.getAttribute('src') === '/images/hero-building.webp').length, 1)
  assert.ok(text.includes('Ảnh minh họa'))
  assert.ok(!text.includes('Đang làm'))
  assert.ok(!text.includes('Trang đang được xây dựng'))
  await app.stop()
})




