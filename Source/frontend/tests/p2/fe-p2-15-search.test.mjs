// CP-3 (FE-P2-15): src/pages/public/PublicRoomsPage.tsx + src/features/public/room-filters.ts (pure logic) +
// RoomFilters.tsx (component). Spec/PLAN: PUB-01, ROOM-05, UI-01/03/05/08; decision D-1 (no building <select>,
// no BE change). Scenarios #1..#15 incl. #6b, #9b, #9c from PLAN.md CP-3.
//
// Outside edges faked: `fetch` (fakeFetch) and the fake DOM (public-dom.mjs; Node has no real DOM, no jsdom
// installed), same harness as fe-p2-14-home.test.mjs. Everything under test — PublicRoomsPage, RoomFilters,
// room-filters.ts, ListState, RoomCard, the kit, @tanstack/react-query and react-router — runs unmodified via
// `loadModule`/`draftFirst`.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import {
  draftFirst, loadModule, mount, find, byName, buttonByText, alerts, isDisabled, dispatch, fill, until, wait,
  fakeFetch, ok, fail, pageMeta, queryOf,
} from './public-dom.mjs'

const nodeRequire = createRequire(import.meta.url)
const { flushSync } = nodeRequire('react-dom')

// @tanstack/react-query keeps a gc timer alive (default gcTime 5 min) per QueryClient; one is created per
// mountRooms() call below. End the process once the tests are done, same convention as fe-p2-14-home.test.mjs.
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

// React's inputValueTracking.js wraps the instance .value/.checked setters and updates its own cache on every
// write, including plain `el.value = x`; the ChangeEventPlugin then sees "no change" and never fires the
// registered handler. Calling the ORIGINAL prototype setter bypasses that cache, same workaround as
// tests/p2/cp5-buildings-services.test.mjs's `fill()`. public-dom.mjs's own `fill()` always dispatches 'input',
// which is right for text inputs but wrong for <select> (browsers fire 'change' there) — RoomFilters' selects
// are react-hook-form Controllers, so they need the real event type to pick up the new value.
function selectValue(container, el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set
  setter.call(el, String(value))
  dispatch(container, el, 'change', { target: el })
}

// React never sets a <select>'s own `.value`; it only flips `.selected` on the matching <option> (see
// react-dom's `updateOptions`). So the only reliable way to read "what the controlled select currently shows"
// in this fake DOM is to look at which option is marked selected, not the select's own `.value` property.
function selectedOptionValue(select) {
  const opt = find(select, n => n.tagName === 'OPTION' && n.selected === true)[0]
  return opt ? opt.value : ''
}

function hasLabel(container, control) {
  for (let n = control.parentNode; n; n = n.parentNode) if (n.tagName === 'LABEL') return true
  const id = control.getAttribute('id')
  return id ? find(container, n => n.tagName === 'LABEL' && n.getAttribute('for') === id).length > 0 : false
}

const room = (overrides = {}) => ({
  id: 1, code: 'B203', floor: 2, areaM2: 18.5, price: 2_300_000, maxOccupants: 2,
  buildingId: 1, buildingCode: 'B', buildingName: 'Tòa B', district: 'Cầu Giấy', ward: 'Dịch Vọng',
  imageUrl: null, ...overrides,
})

function roomsRule(data, metaOverride) {
  return { prefix: '/public/rooms', method: 'GET', handler: () => ok(data, metaOverride ?? pageMeta(data)) }
}
function locationsRule(data = []) {
  return { prefix: '/public/locations', method: 'GET', handler: () => ok(data) }
}
// Dynamic pagination: page N of `total` items at `limit` per page, driven by the real ?page= the page sends.
function pagedRoomsRule(total, limit = 20) {
  return {
    prefix: '/public/rooms', method: 'GET',
    handler: call => {
      const page = Number(queryOf(call.url).get('page')) || 1
      const count = Math.min(limit, Math.max(0, total - (page - 1) * limit))
      const data = Array.from({ length: count }, (_, i) => room({ id: (page - 1) * limit + i + 1 }))
      return ok(data, { page, limit, total })
    },
  }
}
const buildingDetail = (overrides = {}) => ({
  id: 3, code: 'B', name: 'An Lâm 1', address: '', district: 'Cầu Giấy', ward: '', waterMode: 'PER_M3',
  amenities: [], description: null, contact: null, rates: { electric: null, water: null, services: [] },
  upcomingRates: [], rooms: [], ...overrides,
})

const roomsCall = calls => calls.filter(c => c.url.includes('/public/rooms?'))
const lastRoomsCall = calls => roomsCall(calls).at(-1)

async function mountRooms(initialPath, rules) {
  const calls = fakeFetch(rules)
  const React = nodeRequire('react')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { createMemoryRouter, RouterProvider } = nodeRequire('react-router')
  const { PublicRoomsPage } = loadModule(draftFirst('src/pages/public/PublicRoomsPage.tsx'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/phong', element: React.createElement(PublicRoomsPage) },
  ], { initialEntries: [initialPath] })
  const app = await mount(React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(RouterProvider, { router })))
  return { ...app, calls, path: () => router.state.location.pathname + router.state.location.search }
}

function formOf(app) { return find(app.container, n => n.tagName === 'FORM')[0] }
function submit(app) { dispatch(app.container, formOf(app), 'submit') }

// ======================================================================================
// #1
// ======================================================================================
test('FE-P2-15 #1: opening /phong with a full query fills the form and requests exactly those params + page=1&limit=20', async () => {
  const initial = `/phong?${new URLSearchParams({ district: 'Cầu Giấy', ward: 'Dịch Vọng', minPrice: '2000000', maxPrice: '3000000', sort: 'newest' })}`
  const app = await mountRooms(initial, [roomsRule([]), locationsRule([{ district: 'Cầu Giấy', roomCount: 1, wards: [{ ward: 'Dịch Vọng', roomCount: 1 }] }])])
  await until(() => selectedOptionValue(byName(app.container, 'district')) === 'Cầu Giấy', 'district filled')
  assert.equal(selectedOptionValue(byName(app.container, 'ward')), 'Dịch Vọng')
  assert.equal(byName(app.container, 'minPrice').value, '2000000')
  assert.equal(byName(app.container, 'maxPrice').value, '3000000')
  assert.equal(selectedOptionValue(byName(app.container, 'sort')), 'newest')
  await until(() => roomsCall(app.calls).length > 0, 'rooms requested')
  const q = queryOf(lastRoomsCall(app.calls).url)
  assert.equal(q.get('district'), 'Cầu Giấy')
  assert.equal(q.get('ward'), 'Dịch Vọng')
  assert.equal(q.get('minPrice'), '2000000')
  assert.equal(q.get('maxPrice'), '3000000')
  assert.equal(q.get('sort'), 'newest')
  assert.equal(q.get('page'), '1')
  assert.equal(q.get('limit'), '20')
  await app.stop()
})

// ======================================================================================
// #2
// ======================================================================================
test('FE-P2-15 #2: changing a field and clicking "Áp dụng bộ lọc" updates the URL (only non-empty params) and the request; page is dropped back to 1', async () => {
  const initial = `/phong?${new URLSearchParams({ district: 'Cầu Giấy', page: '3' })}`
  const app = await mountRooms(initial, [roomsRule([]), locationsRule()])
  await until(() => roomsCall(app.calls).some(c => queryOf(c.url).get('district') === 'Cầu Giấy'), 'loaded')
  fill(app.container, byName(app.container, 'minPrice'), '3500000')
  submit(app)
  await until(() => app.path().includes('minPrice=3500000'), `applied (got ${app.path()})`)
  assert.ok(!app.path().includes('page='), `page must be dropped, got ${app.path()}`)
  await until(() => roomsCall(app.calls).some(c => queryOf(c.url).get('minPrice') === '3500000'), 'new request sent')
  const q = queryOf(lastRoomsCall(app.calls).url)
  assert.equal(q.get('page'), '1')
  assert.equal(q.get('minPrice'), '3500000')
  assert.equal(q.get('district'), 'Cầu Giấy')
  await app.stop()
})

// ======================================================================================
// #3
// ======================================================================================
test('FE-P2-15 #3: "Xóa bộ lọc" clears the URL to /phong and the request drops every filter (sort=price, page=1)', async () => {
  const initial = `/phong?${new URLSearchParams({ district: 'Cầu Giấy', minPrice: '2000000', sort: 'newest' })}`
  const app = await mountRooms(initial, [roomsRule([]), locationsRule()])
  await until(() => roomsCall(app.calls).some(c => queryOf(c.url).get('district') === 'Cầu Giấy'), 'loaded')
  dispatch(app.container, buttonByText(app.container, 'Xóa bộ lọc'), 'click')
  await until(() => app.path() === '/phong', `reset (got ${app.path()})`)
  await until(() => lastRoomsCall(app.calls) && queryOf(lastRoomsCall(app.calls).url).get('district') === null, 'request cleared')
  const q = queryOf(lastRoomsCall(app.calls).url)
  assert.equal(q.get('district'), null)
  assert.equal(q.get('minPrice'), null)
  assert.equal(q.get('sort'), 'price')
  assert.equal(q.get('page'), '1')
  await app.stop()
})

// ======================================================================================
// #4 INT32 boundary
// ======================================================================================
test('FE-P2-15 #4 (DTO BE, UI-05): INT32 boundary for minPrice/maxPrice', async () => {
  // "0" is a real price, still sent (not treated as empty)
  {
    const app = await mountRooms(`/phong?${new URLSearchParams({ minPrice: '0', maxPrice: '0' })}`, [roomsRule([]), locationsRule()])
    await until(() => roomsCall(app.calls).length > 0, 'requested')
    const q = queryOf(lastRoomsCall(app.calls).url)
    assert.equal(q.get('minPrice'), '0')
    assert.equal(q.get('maxPrice'), '0')
    await app.stop()
  }
  // 2147483647 (INT32 max) is valid -> still calls the API
  {
    const app = await mountRooms('/phong?minPrice=2147483647', [roomsRule([]), locationsRule()])
    await until(() => roomsCall(app.calls).length > 0, 'requested')
    assert.equal(queryOf(lastRoomsCall(app.calls).url).get('minPrice'), '2147483647')
    assert.equal(app.container.textContent.includes('Giá tối thiểu không hợp lệ'), false)
    await app.stop()
  }
  // 2147483648 (one over INT32 max) -> error under the field, no request at all
  {
    const app = await mountRooms('/phong?minPrice=2147483648', [roomsRule([]), locationsRule()])
    await until(() => app.container.textContent.includes('Giá tối thiểu không hợp lệ'), 'error shown')
    await wait(80)
    assert.equal(roomsCall(app.calls).length, 0, 'no request to /public/rooms')
    await app.stop()
  }
  // non-numeric minPrice -> same error
  {
    const app = await mountRooms('/phong?minPrice=abc', [roomsRule([]), locationsRule()])
    await until(() => app.container.textContent.includes('Giá tối thiểu không hợp lệ'), 'error shown')
    assert.equal(roomsCall(app.calls).length, 0)
    await app.stop()
  }
  // maxPrice invalid -> its own message
  {
    const app = await mountRooms('/phong?maxPrice=abc', [roomsRule([]), locationsRule()])
    await until(() => app.container.textContent.includes('Giá tối đa không hợp lệ'), 'error shown')
    assert.equal(roomsCall(app.calls).length, 0)
    await app.stop()
  }
})

// ======================================================================================
// #5
// ======================================================================================
test('FE-P2-15 #5: minPrice > maxPrice still calls the API (FE does not enforce business order); BE empty -> empty state with "Xóa bộ lọc"', async () => {
  const app = await mountRooms(`/phong?${new URLSearchParams({ minPrice: '5000000', maxPrice: '1000000' })}`, [roomsRule([]), locationsRule()])
  await until(() => roomsCall(app.calls).length > 0, 'requested')
  const q = queryOf(lastRoomsCall(app.calls).url)
  assert.equal(q.get('minPrice'), '5000000')
  assert.equal(q.get('maxPrice'), '1000000')
  await until(() => app.container.textContent.includes('Chưa có phòng phù hợp với bộ lọc'), 'empty state')
  assert.ok(buttonByText(app.container, 'Xóa bộ lọc'))
  await app.stop()
})

// ======================================================================================
// #6
// ======================================================================================
test('FE-P2-15 #6 (UI-05, API-02): garbage ?sort=abc&page=<bad> never blanks the page: request uses sort=price&page=1, the sort select shows "Giá tăng dần", URL unchanged', async () => {
  for (const badPage of ['0', '-1', '1.5', 'xyz']) {
    const initial = `/phong?sort=abc&page=${badPage}`
    const app = await mountRooms(initial, [roomsRule([room()]), locationsRule()])
    await until(() => roomsCall(app.calls).length > 0, `requested (page=${badPage})`)
    const q = queryOf(lastRoomsCall(app.calls).url)
    assert.equal(q.get('sort'), 'price', `sort fallback, page=${badPage}`)
    assert.equal(q.get('page'), '1', `page fallback, page=${badPage}`)
    await until(() => selectedOptionValue(byName(app.container, 'sort')) === 'price', `select shows price, page=${badPage}`)
    assert.equal(app.path(), initial, `URL unchanged, page=${badPage}`)
    await app.stop()
  }
})

// ======================================================================================
// #6b
// ======================================================================================
test('FE-P2-15 #6b (A-7): default sort is not written to the URL; choosing "Mới nhất" adds sort=newest; choosing "Giá tăng dần" again removes it', async () => {
  {
    const app = await mountRooms('/phong', [roomsRule([]), locationsRule()])
    await until(() => selectedOptionValue(byName(app.container, 'sort')) === 'price', 'default sort loaded')
    assert.ok(!app.path().includes('sort='), 'default sort absent from URL')
    flushSync(() => { selectValue(app.container, byName(app.container, 'sort'), 'newest') })
    await until(() => selectedOptionValue(byName(app.container, 'sort')) === 'newest', 'form selected newest')
    flushSync(() => { submit(app) })
    await until(() => app.path().includes('sort=newest'), `added (got ${app.path()})`)
    await app.stop()
  }

  {
    const app = await mountRooms('/phong?sort=newest', [roomsRule([]), locationsRule()])
    await until(() => selectedOptionValue(byName(app.container, 'sort')) === 'newest', 'newest URL state loaded')
    await until(() => lastRoomsCall(app.calls) && queryOf(lastRoomsCall(app.calls).url).get('sort') === 'newest', 'newest request completed')
    flushSync(() => { selectValue(app.container, byName(app.container, 'sort'), 'price') })
    await until(() => selectedOptionValue(byName(app.container, 'sort')) === 'price', 'form selected default sort')
    flushSync(() => { submit(app) })
    await until(() => !app.path().includes('sort='), `removed (got ${app.path()})`)
    await app.stop()
  }
})

// ======================================================================================
// #7
// ======================================================================================
test('FE-P2-15 #7 (UI-03): the 4 list states — loading, error+retry, empty, data', async () => {
  // loading: never-resolving handler, no timer created
  {
    const app = await mountRooms('/phong', [
      { prefix: '/public/rooms', method: 'GET', handler: () => new Promise(() => {}) },
      locationsRule(),
    ])
    assert.ok(find(app.container, n => n.attributes.role === 'status').length >= 1)
    assert.ok(app.container.textContent.includes('Đang tải danh sách phòng'))
    await app.stop()
  }
  // error + retry
  {
    let failing = true
    const app = await mountRooms('/phong', [
      { prefix: '/public/rooms', method: 'GET', handler: () => failing ? fail(500, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau') : ok([room()], pageMeta([room()])) },
      locationsRule(),
    ])
    await until(() => alerts(app.container).length === 1, 'error shown')
    assert.equal(alerts(app.container)[0], 'Có lỗi xảy ra, vui lòng thử lại sau')
    failing = false
    dispatch(app.container, buttonByText(app.container, 'Thử lại'), 'click')
    await until(() => app.container.textContent.includes('phòng phù hợp'), 'retried')
    assert.equal(alerts(app.container).length, 0)
    await app.stop()
  }
  // empty
  {
    const app = await mountRooms('/phong', [roomsRule([]), locationsRule()])
    await until(() => app.container.textContent.includes('Chưa có phòng phù hợp với bộ lọc'), 'empty')
    await app.stop()
  }
  // data
  {
    const app = await mountRooms('/phong', [roomsRule([room({ id: 1 }), room({ id: 2 })]), locationsRule()])
    await until(() => find(app.container, n => (n.attributes.class ?? '').split(' ').includes('public-room-card')).length === 2, 'data')
    await app.stop()
  }
})

// ======================================================================================
// #8
// ======================================================================================
test('FE-P2-15 #8 (A-4): pagination — total=22/limit=20 shows "Trang sau"; clicking sets page=2 in the URL and request (filters kept); page2 flips the disabled buttons; total=5/page=1 shows no <nav>', async () => {
  const app = await mountRooms('/phong?district=Cầu Giấy', [pagedRoomsRule(22), locationsRule()])
  await until(() => app.container.textContent.includes('phòng phù hợp'), 'loaded')
  const nextBtn = buttonByText(app.container, 'Trang sau')
  const prevBtn = buttonByText(app.container, 'Trang trước')
  assert.ok(nextBtn, 'Trang sau must exist')
  assert.ok(!isDisabled(nextBtn), 'Trang sau enabled at page 1 (22 > 20)')
  assert.ok(isDisabled(prevBtn), 'Trang trước disabled at page 1')
  dispatch(app.container, nextBtn, 'click')
  await until(() => app.path().includes('page=2'), `page 2 (got ${app.path()})`)
  assert.ok(app.path().includes('district='), 'other filters kept in URL')
  await until(() => roomsCall(app.calls).some(c => queryOf(c.url).get('page') === '2'), 'page=2 requested')
  const q = queryOf(lastRoomsCall(app.calls).url)
  assert.equal(q.get('page'), '2')
  assert.equal(q.get('district'), 'Cầu Giấy')
  // Changing `page` changes the query key, so react-query briefly goes "pending" (no cached page) and the
  // <nav> disappears entirely before page 2's data arrives; wait for the button to actually exist again (not
  // just for isDisabled(undefined), which is falsy/undefined too and would resolve this prematurely).
  await until(() => { const btn = buttonByText(app.container, 'Trang trước'); return btn && !isDisabled(btn) }, 'prev enabled on page 2')
  assert.ok(isDisabled(buttonByText(app.container, 'Trang sau')), 'next disabled on page 2 (40 >= 22)')
  await app.stop()

  const app2 = await mountRooms('/phong', [pagedRoomsRule(5), locationsRule()])
  await until(() => app2.container.textContent.includes('phòng phù hợp'), 'loaded (total=5)')
  assert.equal(find(app2.container, n => n.tagName === 'NAV').length, 0, 'no pager <nav> for total=5, page=1')
  await app2.stop()
})

// ======================================================================================
// #9
// ======================================================================================
test('FE-P2-15 #9 (D-1): buildingId=3 sends buildingId to /public/rooms, calls /public/buildings/3, shows "Đang lọc theo tòa An Lâm 1" + "Bỏ lọc tòa" once loaded; clicking it drops buildingId and keeps other filters', async () => {
  const app = await mountRooms('/phong?buildingId=3&district=Cầu Giấy', [
    roomsRule([]), locationsRule(),
    { prefix: '/public/buildings/3', method: 'GET', handler: () => ok(buildingDetail()) },
  ])
  await until(() => roomsCall(app.calls).length > 0, 'rooms requested')
  assert.equal(queryOf(lastRoomsCall(app.calls).url).get('buildingId'), '3')
  await until(() => app.calls.some(c => c.url.startsWith('/api/v1/public/buildings/3')), 'building requested')
  await until(() => app.container.textContent.includes('Đang lọc theo tòa An Lâm 1'), 'building name shown')
  const dropBtn = buttonByText(app.container, 'Bỏ lọc tòa')
  assert.ok(dropBtn)
  dispatch(app.container, dropBtn, 'click')
  await until(() => !app.path().includes('buildingId'), `dropped (got ${app.path()})`)
  assert.ok(app.path().includes('district='), 'district kept')
  await until(() => roomsCall(app.calls).some(c => queryOf(c.url).get('buildingId') === null), 'new request without buildingId')
  const q = queryOf(lastRoomsCall(app.calls).url)
  assert.equal(q.get('buildingId'), null)
  assert.equal(q.get('district'), 'Cầu Giấy')
  await app.stop()
})

// ======================================================================================
// #9b
// ======================================================================================
test('FE-P2-15 #9b (D-1, PUB-02, UI-03): buildingId=3 shows loading; a 404 shows its error + retry; "Bỏ lọc tòa" and the room list remain usable', async () => {
  // loading
  {
    const app = await mountRooms('/phong?buildingId=3', [
      roomsRule([room()]), locationsRule(),
      { prefix: '/public/buildings/3', method: 'GET', handler: () => new Promise(() => {}) },
    ])
    await until(() => app.container.textContent.includes('phòng phù hợp'), 'rooms still loaded')
    assert.ok(!app.container.textContent.includes('Đang lọc theo tòa'))
    assert.ok(app.container.textContent.includes('Đang tải thông tin tòa'))
    assert.ok(buttonByText(app.container, 'Bỏ lọc tòa'))
    assert.equal(alerts(app.container).length, 0)
    await app.stop()
  }
  // 404
  {
    const app = await mountRooms('/phong?buildingId=3', [
      roomsRule([room()]), locationsRule(),
      { prefix: '/public/buildings/3', method: 'GET', handler: () => fail(404, 'NOT_FOUND', 'Không tìm thấy') },
    ])
    await until(() => app.container.textContent.includes('phòng phù hợp'), 'rooms loaded')
    await wait(80)
    assert.ok(!app.container.textContent.includes('Đang lọc theo tòa'))
    assert.ok(buttonByText(app.container, 'Bỏ lọc tòa'))
    assert.ok(buttonByText(app.container, 'Thử lại'))
    assert.deepEqual(alerts(app.container), ['Không tìm thấyThử lại'])
    await app.stop()
  }
})

// ======================================================================================
// #9c
// ======================================================================================
test('FE-P2-15 #9c (D-1): buildingId=0 or buildingId=abc is dropped by parseFilters: no /public/buildings call, no buildingId in the rooms request, no building-name line, no "Bỏ lọc tòa"', async () => {
  for (const bad of ['0', 'abc']) {
    const app = await mountRooms(`/phong?buildingId=${bad}`, [roomsRule([]), locationsRule()])
    await until(() => roomsCall(app.calls).length > 0, `requested (buildingId=${bad})`)
    assert.ok(!app.calls.some(c => c.url.includes('/public/buildings')), `no buildings call (buildingId=${bad})`)
    assert.equal(queryOf(lastRoomsCall(app.calls).url).get('buildingId'), null, `buildingId=${bad}`)
    assert.ok(!app.container.textContent.includes('Đang lọc theo tòa'), `buildingId=${bad}`)
    assert.ok(!buttonByText(app.container, 'Bỏ lọc tòa'), `buildingId=${bad}`)
    await app.stop()
  }
})

// ======================================================================================
// #10
// ======================================================================================
test('FE-P2-15 #10 (D-1): there is no <select name="buildingId">; with no buildingId in the URL no call to any building-listing endpoint is made', async () => {
  const app = await mountRooms('/phong', [roomsRule([]), locationsRule()])
  await until(() => roomsCall(app.calls).length > 0, 'loaded')
  assert.equal(find(app.container, n => n.tagName === 'SELECT' && n.name === 'buildingId').length, 0)
  assert.ok(!app.calls.some(c => c.url.includes('/public/buildings')))
  await app.stop()
})

// ======================================================================================
// #11
// ======================================================================================
test('FE-P2-15 #11 (A-8): minPrice=5000000 without maxPrice (from the home page) fills "Giá từ" and leaves "Giá đến" empty; the request has only minPrice', async () => {
  const app = await mountRooms('/phong?minPrice=5000000', [roomsRule([]), locationsRule()])
  await until(() => byName(app.container, 'minPrice')?.value === '5000000', 'filled')
  assert.equal(byName(app.container, 'maxPrice').value, '')
  await until(() => roomsCall(app.calls).length > 0, 'requested')
  const q = queryOf(lastRoomsCall(app.calls).url)
  assert.equal(q.get('minPrice'), '5000000')
  assert.equal(q.get('maxPrice'), null)
  await app.stop()
})

// ======================================================================================
// #12
// ======================================================================================
const locationsWithWards = [
  { district: 'Cầu Giấy', roomCount: 10, wards: [{ ward: 'Dịch Vọng', roomCount: 5 }, { ward: 'Nghĩa Đô', roomCount: 5 }] },
  { district: 'Đống Đa', roomCount: 8, wards: [{ ward: 'Nghĩa Đô', roomCount: 4 }, { ward: 'Khương Thượng', roomCount: 4 }] },
]
test('FE-P2-15 #12 (ROOM-05): ward options follow the selected district; with no district, every ward of every district, deduped, in API order', async () => {
  const app = await mountRooms('/phong', [roomsRule([]), locationsRule(locationsWithWards)])
  await until(() => find(app.container, n => n.tagName === 'OPTION' && n.textContent === 'Cầu Giấy').length === 1, 'locations loaded')
  const districtOptions = find(byName(app.container, 'district'), n => n.tagName === 'OPTION').map(o => o.textContent)
  assert.deepEqual(districtOptions, ['Tất cả quận', 'Cầu Giấy', 'Đống Đa'])
  let wardOptions = find(byName(app.container, 'ward'), n => n.tagName === 'OPTION').map(o => o.textContent)
  assert.deepEqual(wardOptions, ['Tất cả phường', 'Dịch Vọng', 'Nghĩa Đô', 'Khương Thượng'])
  selectValue(app.container, byName(app.container, 'district'), 'Cầu Giấy')
  await until(() => find(byName(app.container, 'ward'), n => n.tagName === 'OPTION').length === 3, 'ward narrowed')
  wardOptions = find(byName(app.container, 'ward'), n => n.tagName === 'OPTION').map(o => o.textContent)
  assert.deepEqual(wardOptions, ['Tất cả phường', 'Dịch Vọng', 'Nghĩa Đô'])
  await app.stop()
})

// ======================================================================================
// #13
// ======================================================================================
test('FE-P2-15 #13 (ROOM-05): changing district while a ward is selected resets the ward to empty; after "Áp dụng bộ lọc" the URL drops ward', async () => {
  const app = await mountRooms(`/phong?${new URLSearchParams({ district: 'Cầu Giấy', ward: 'Dịch Vọng' })}`, [roomsRule([]), locationsRule(locationsWithWards)])
  await until(() => selectedOptionValue(byName(app.container, 'ward')) === 'Dịch Vọng', 'ward preselected')
  selectValue(app.container, byName(app.container, 'district'), 'Đống Đa')
  await until(() => selectedOptionValue(byName(app.container, 'ward')) === '', 'ward cleared in the form')
  submit(app)
  await until(() => !app.path().includes('ward'), `applied (got ${app.path()})`)
  assert.ok(app.path().includes('district='), 'district kept')
  await app.stop()
})

// ======================================================================================
// #14
// ======================================================================================
test('FE-P2-15 #14 (§3 mockup+BE copy): "Tất cả quận"/"Tất cả phường" options, "Không giới hạn" placeholders on both price fields, every filter control has a <label>', async () => {
  const app = await mountRooms('/phong', [roomsRule([]), locationsRule()])
  await until(() => formOf(app) !== undefined, 'loaded')
  assert.ok(app.container.textContent.includes('Tất cả quận'))
  assert.ok(app.container.textContent.includes('Tất cả phường'))
  assert.equal(byName(app.container, 'minPrice').getAttribute('placeholder'), 'Không giới hạn')
  assert.equal(byName(app.container, 'maxPrice').getAttribute('placeholder'), 'Không giới hạn')
  for (const name of ['district', 'ward', 'minPrice', 'maxPrice', 'sort']) {
    const control = byName(app.container, name)
    assert.ok(control, `missing control ${name}`)
    assert.ok(hasLabel(app.container, control), `${name} has no <label>`)
  }
  await app.stop()
})

// ======================================================================================
// #15 — pure functions (no DOM) from room-filters.ts
// ======================================================================================
test('FE-P2-15 #15: parseFilters/filtersToParams/filtersToQuery/validFilters pure behaviour', () => {
  const { parseFilters, filtersToParams, filtersToQuery, validFilters } = loadModule(draftFirst('src/features/public/room-filters.ts'))

  const parsed = parseFilters(new URLSearchParams('sort=abc&buildingId=0'))
  assert.equal(parsed.sort, 'price')
  assert.equal(parsed.buildingId, '')

  const emptyParams = filtersToParams({ district: '', ward: '', buildingId: '', minPrice: '', maxPrice: '', sort: 'price' })
  assert.equal(emptyParams.toString(), '', 'empty fields and the default sort are left out')
  const newestParams = filtersToParams({ district: 'Cầu Giấy', ward: '', buildingId: '', minPrice: '', maxPrice: '', sort: 'newest' })
  assert.equal(newestParams.toString(), new URLSearchParams({ district: 'Cầu Giấy', sort: 'newest' }).toString())

  const query = filtersToQuery({ district: '', ward: '', buildingId: '', minPrice: '0', maxPrice: '', sort: 'price' })
  assert.equal(query.minPrice, 0, '"0" is kept as a real price')
  assert.equal(query.district, undefined)
  assert.equal(query.maxPrice, undefined)
  assert.equal(query.buildingId, undefined)

  assert.equal(validFilters({ district: '', ward: '', buildingId: '', minPrice: '2147483648', maxPrice: '', sort: 'price' }), false)
  assert.equal(validFilters({ district: '', ward: '', buildingId: '', minPrice: '2147483647', maxPrice: '', sort: 'price' }), true)
  assert.equal(validFilters({ district: '', ward: '', buildingId: '', minPrice: '', maxPrice: '', sort: 'price' }), true)
})


