import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

// CP-4 (FE-P2-05 nền dữ liệu): src/shared/api.ts (apiRequestPage/listPath additions), src/shared/formatters.ts
// (formatDate), src/features/{buildings,managers,rooms}/api.ts and buildings/schemas.ts.
// Spec/PLAN: API-02/03/04/08, UI-05/09, SCOPE-02, BLD-01/02/06, ROOM-02, G-01/02, Q-FE8A-2 (PLAN CP-4 Q6).
// Outside edge faked: globalThis.fetch only. Every module under test (api.ts, formatters.ts, schemas.ts)
// is transpiled and run unmodified; zod is the real installed package, not a mock.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const req = createRequire(import.meta.url)

function compile(path, modules) {
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  Function('require', 'exports', code)(id => { if (id in modules) return modules[id]; throw new Error(`unexpected import ${id}`) }, exports)
  return exports
}

function load() {
  const api = compile('../../src/shared/api.ts', {})
  const buildingsApi = compile('../../src/features/buildings/api.ts', { '../../shared/api': api })
  const managersApi = compile('../../src/features/managers/api.ts', { '../../shared/api': api, '../buildings/api': buildingsApi })
  const roomsApi = compile('../../src/features/rooms/api.ts', { '../../shared/api': api, '../buildings/api': buildingsApi })
  const formatters = compile('../../src/shared/formatters.ts', {})
  const buildingSchemas = compile('../../src/features/buildings/schemas.ts', { zod: req('zod') })
  return { api, buildingsApi, managersApi, roomsApi, formatters, buildingSchemas }
}

const json = (status, body) => ({ status, body })
const ok = (data, meta) => json(200, { data, ...(meta ? { meta } : {}) })
const fail = (status, code, message, fields) => json(status, { error: { code, message, ...(fields ? { fields } : {}) } })

function fakeFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const call = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body }
    calls.push(call)
    const result = await handler(call, calls)
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } })
  }
  return calls
}

const queryOf = url => new URL(url, 'http://x').searchParams

// ================= Q1 (CP-4 planner decision): listPath page/limit validation =================
test('API-02: listPath defaults to page=1&limit=20 and keeps a given buildingId number as a query param', () => {
  const { api } = load()
  assert.equal(api.listPath('/rooms', {}), '/rooms?page=1&limit=20')
  assert.equal(api.listPath('/rooms', { buildingId: 5 }), '/rooms?page=1&limit=20&buildingId=5')
})

test('API-02: listPath accepts page=1, limit=20 and the max limit=100; rejects 0, 1.5 and 101 with RangeError', () => {
  const { api } = load()
  assert.doesNotThrow(() => api.listPath('/x', { page: 1, limit: 20 }))
  assert.doesNotThrow(() => api.listPath('/x', { page: 1, limit: 100 }))
  assert.throws(() => api.listPath('/x', { page: 0, limit: 20 }), RangeError)
  assert.throws(() => api.listPath('/x', { page: 1.5, limit: 20 }), RangeError)
  assert.throws(() => api.listPath('/x', { page: 1, limit: 101 }), RangeError)
})

// ================= API-02: apiRequestPage envelope =================
test('API-02: apiRequestPage returns {data, meta} from the envelope', async () => {
  const { api } = load()
  fakeFetch(() => ok([{ id: 1 }], { page: 1, limit: 20, total: 1 }))
  const page = await api.apiRequestPage('/rooms?page=1&limit=20')
  assert.deepEqual(page, { data: [{ id: 1 }], meta: { page: 1, limit: 20, total: 1 } })
})

test('API-02: apiRequestPage without meta in the envelope throws NETWORK_ERROR, never treats the list as the whole envelope', async () => {
  const { api } = load()
  fakeFetch(() => ok([{ id: 1 }]))
  await assert.rejects(api.apiRequestPage('/rooms?page=1&limit=20'), e => e instanceof api.ApiError && e.code === 'NETWORK_ERROR')
})

// ================= SCOPE-02: buildingId query rule across buildings/services/managers/rooms =================
test('SCOPE-02: buildingIdQuery sends a number, drops \'all\' and null', () => {
  const { buildingsApi } = load()
  assert.equal(buildingsApi.buildingIdQuery(7), 7)
  assert.equal(buildingsApi.buildingIdQuery('all'), undefined)
  assert.equal(buildingsApi.buildingIdQuery(null), undefined)
  assert.equal(buildingsApi.buildingIdQuery(undefined), undefined)
})

test('SCOPE-02: listBuildings sends buildingId=<id> only for a number; \'all\' and null send no buildingId param', async () => {
  const { buildingsApi } = load()
  let calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await buildingsApi.listBuildings({ buildingId: 9 })
  assert.equal(queryOf(calls[0].url).get('buildingId'), '9')
  calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await buildingsApi.listBuildings({ buildingId: 'all' })
  assert.equal(queryOf(calls[0].url).has('buildingId'), false)
  calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await buildingsApi.listBuildings({ buildingId: null })
  assert.equal(queryOf(calls[0].url).has('buildingId'), false)
})

test('SCOPE-02: listServices follows the same buildingId rule', async () => {
  const { buildingsApi } = load()
  let calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await buildingsApi.listServices({ buildingId: 3 })
  assert.equal(queryOf(calls[0].url).get('buildingId'), '3')
  calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await buildingsApi.listServices({ buildingId: null })
  assert.equal(queryOf(calls[0].url).has('buildingId'), false)
})

test('SCOPE-02: listManagers follows the same buildingId rule', async () => {
  const { managersApi } = load()
  let calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await managersApi.listManagers({ buildingId: 4 })
  assert.equal(queryOf(calls[0].url).get('buildingId'), '4')
  calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await managersApi.listManagers({ buildingId: 'all' })
  assert.equal(queryOf(calls[0].url).has('buildingId'), false)
})

test('SCOPE-02: listRooms follows the same buildingId rule, including includeInactive passthrough', async () => {
  const { roomsApi } = load()
  let calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await roomsApi.listRooms({ buildingId: 11, includeInactive: true })
  let q = queryOf(calls[0].url)
  assert.equal(q.get('buildingId'), '11')
  assert.equal(q.get('includeInactive'), 'true')
  calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await roomsApi.listRooms({ buildingId: null })
  assert.equal(queryOf(calls[0].url).has('buildingId'), false)
})

// ================= BLD-01/02: manager building-notes payload is exactly two fields =================
test('BLD-02: updateBuildingNotes sends only amenities and description, never code/name/managerId/isActive', async () => {
  const { buildingsApi } = load()
  const calls = fakeFetch(() => ok({ id: 1 }))
  await buildingsApi.updateBuildingNotes(1, { amenities: ['wifi'], description: 'x' })
  assert.deepEqual(JSON.parse(calls[0].body), { amenities: ['wifi'], description: 'x' })
  assert.equal(calls[0].method, 'PATCH')
})

test('BLD-01: createBuilding sends the Boss-only fields; updateBuilding can also carry isActive', async () => {
  const { buildingsApi } = load()
  const calls = fakeFetch(() => ok({ id: 1 }))
  await buildingsApi.createBuilding({ code: 'A1', name: 'N', address: 'Ad', district: 'D', ward: 'W', waterMode: 'PER_M3', dueDays: 5, managerId: 2 })
  const sentCreate = JSON.parse(calls[0].body)
  assert.deepEqual(Object.keys(sentCreate).sort(), ['address', 'code', 'dueDays', 'district', 'managerId', 'name', 'waterMode', 'ward'].sort())
  await buildingsApi.updateBuilding(1, { isActive: false })
  const sentPatch = JSON.parse(calls[1].body)
  assert.equal(sentPatch.isActive, false)
})

// ================= ROOM-02: room payloads never carry price =================
test('ROOM-02: createRoom body never contains a price key', async () => {
  const { roomsApi } = load()
  const calls = fakeFetch(() => ok({ id: 1 }))
  await roomsApi.createRoom({ buildingId: 1, code: 'P101', floor: 1, areaM2: 20.5, maxOccupants: 2 })
  const sent = JSON.parse(calls[0].body)
  assert.ok(!('price' in sent), 'price must never be sent by the room form')
  assert.deepEqual(sent, { buildingId: 1, code: 'P101', floor: 1, areaM2: 20.5, maxOccupants: 2 })
})

test('ROOM-02: updateRoom body never contains a price key, even when locking/maintenance flags are set', async () => {
  const { roomsApi } = load()
  const calls = fakeFetch(() => ok({ id: 1 }))
  await roomsApi.updateRoom(1, { underMaintenance: true, isActive: false })
  const sent = JSON.parse(calls[0].body)
  assert.ok(!('price' in sent), 'price must never be sent on update either')
  assert.deepEqual(sent, { underMaintenance: true, isActive: false })
})

// ================= getRoom(id): Q-FE8A-2/3 contract, Q6 pendingViewingCount is mandatory =================
test('FE-P2-05: getRoom(id) calls GET /rooms/:id and returns a RoomView with pendingViewingCount and images always present', async () => {
  const { roomsApi } = load()
  const roomView = {
    id: 42, buildingId: 1, code: 'P101', floor: 1, areaM2: 20.5, price: 3000000, maxOccupants: 2,
    furniture: ['Giường'], description: null, underMaintenance: false, isActive: true, status: 'Trống',
    images: [{ id: 1, roomId: 42, publicId: 'p1', url: 'https://x/p1.jpg', sortOrder: 0 }],
    pendingViewingCount: 3,
  }
  const calls = fakeFetch(() => ok(roomView))
  const result = await roomsApi.getRoom(42)
  assert.equal(calls[0].url, '/api/v1/rooms/42')
  assert.equal(calls[0].method, 'GET')
  assert.equal(result.pendingViewingCount, 3, 'ROOM-09 dialog text "Còn N lịch hẹn chưa xử lý" reads this field')
  assert.deepEqual(result.images, roomView.images)
})

// ================= API-04/UI-05: error propagation through the domain functions (403/409/503) =================
test('API-04: listBuildings propagates a 403 OUT_OF_SCOPE as ApiError with the BE Vietnamese message', async () => {
  const { buildingsApi } = load()
  fakeFetch(() => fail(403, 'OUT_OF_SCOPE', 'Bạn không có quyền với tòa này'))
  await assert.rejects(buildingsApi.listBuildings({ buildingId: 99 }), e => {
    assert.equal(e.status, 403)
    assert.equal(e.code, 'OUT_OF_SCOPE')
    assert.equal(e.message, 'Bạn không có quyền với tòa này')
    return true
  })
})

test('API-04: updateRoom propagates a 409 CONFLICT_STATE (room locked with an active contract)', async () => {
  const { roomsApi } = load()
  fakeFetch(() => fail(409, 'CONFLICT_STATE', 'Phòng đang có hợp đồng hiệu lực, không thể khóa'))
  await assert.rejects(roomsApi.updateRoom(1, { isActive: false }), e => {
    assert.equal(e.status, 409)
    assert.equal(e.code, 'CONFLICT_STATE')
    return true
  })
})

test('API-04/UI-05: a 503 error from the API is surfaced unmodified with its Vietnamese message (FILE-01 UPLOAD_NOT_CONFIGURED shape)', async () => {
  // upload.ts/signUpload is CP-8 scope and does not exist yet in this draft; this proves the shared
  // request layer that CP-8 will reuse already shows a 503 error.message unmodified (UI-05).
  const { api } = load()
  fakeFetch(() => fail(503, 'UPLOAD_NOT_CONFIGURED', 'Chưa cấu hình tải ảnh'))
  await assert.rejects(api.apiRequest('/files/sign', { method: 'POST', body: { purpose: 'ROOM_IMAGE', roomId: 1 } }), e => {
    assert.equal(e.status, 503)
    assert.equal(e.code, 'UPLOAD_NOT_CONFIGURED')
    assert.equal(e.message, 'Chưa cấu hình tải ảnh')
    return true
  })
})

// ================= 401 refresh through a domain call + no token leaked into the query =================
test('API-04: a domain call (listRooms) that gets 401 refreshes once and retries, buildingId rule still holds on retry', async () => {
  const { roomsApi, api } = load()
  const calls = fakeFetch(call => {
    if (call.url === '/api/v1/auth/refresh') return ok({ accessToken: 't2' })
    const authorized = call.headers.Authorization === 'Bearer t2'
    if (!authorized) return fail(401, 'UNAUTHENTICATED', 'Chưa đăng nhập')
    return ok([], { page: 1, limit: 20, total: 0 })
  })
  api.setAccessToken('t1')
  await roomsApi.listRooms({ buildingId: 'all' })
  assert.equal(calls.length, 3, 'rooms call, refresh, retried rooms call')
  assert.ok(!queryOf(calls[2].url).has('buildingId'))
  assert.equal(calls[2].headers.Authorization, 'Bearer t2')
})

test('không rò token: the Bearer token never appears inside the request URL/query of a domain call', async () => {
  const { roomsApi, api } = load()
  api.setAccessToken('super-secret-token')
  const calls = fakeFetch(() => ok([], { page: 1, limit: 20, total: 0 }))
  await roomsApi.listRooms({ buildingId: 5 })
  assert.ok(!calls[0].url.includes('super-secret-token'))
  assert.equal(calls[0].headers.Authorization, 'Bearer super-secret-token')
})

// ================= G-01/G-02: integer money, dd/mm/yyyy without a UTC month-end shift =================
test('G-01: formatMoney stays an integer-only formatter (draft copy of the shared formatter)', () => {
  const { formatters } = load()
  assert.equal(formatters.formatMoney(3119000), '3.119.000 đ')
  assert.equal(formatters.formatMoney(0), '0 đ')
  assert.equal(formatters.formatMoney(1.5), '—', 'a float is not a valid integer đồng amount (G-01)')
})

test('G-02: formatDate renders YYYY-MM-DD as dd/mm/yyyy by slicing, with no UTC-driven shift at month end (Asia/Ho_Chi_Minh)', () => {
  const { formatters } = load()
  assert.equal(formatters.formatDate('2026-11-30'), '30/11/2026')
  assert.equal(formatters.formatDate('2026-12-01'), '01/12/2026')
  assert.equal(formatters.formatDate('2026-01-01'), '01/01/2026')
  assert.equal(formatters.formatDate('not-a-date'), '—')
})

// ================= BLD-06/CreateBuildingDto (CP-4 Q2): building code schema accepts lowercase =================
test('BLD-06: buildingFormSchema.code accepts lowercase (the BE upper-cases it) and both-case mixed 2-6 chars', () => {
  const { buildingSchemas } = load()
  for (const code of ['ab', 'AB', 'a1b2c3', 'A1B2C3', 'ab12cd']) {
    assert.equal(buildingSchemas.buildingFormSchema.shape.code.safeParse(code).success, true, `expected ${code} to be valid`)
  }
})

test('BLD-06: buildingFormSchema.code rejects 1 char, 7 chars, and non A-Z0-9 characters', () => {
  const { buildingSchemas } = load()
  for (const code of ['a', 'abcdefg', 'ab-1', 'ab 1', 'ăb1']) {
    assert.equal(buildingSchemas.buildingFormSchema.shape.code.safeParse(code).success, false, `expected ${code} to be invalid`)
  }
})

test('BLD-02: buildingNotesFormSchema only has amenities and description (manager edit scope)', () => {
  const { buildingSchemas } = load()
  assert.deepEqual(Object.keys(buildingSchemas.buildingNotesFormSchema.shape).sort(), ['amenities', 'description'])
})
