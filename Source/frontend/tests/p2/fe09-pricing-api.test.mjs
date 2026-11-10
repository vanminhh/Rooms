import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

// CP-1 (FE-P2-09/10/11 nền pricing): src/features/pricing/{api,schemas,labels}.ts, src/shared/api.ts
// (idempotencyKey option). Spec/PLAN: API-02/05, SCOPE-02, PRC-01/03/12, RATE-02/05, UI-01,
// Q-FE8B-1 (+ASSUMPTION FE8B-7), Q-FE8B-2, Q-FE8B-3.
// Outside edge faked: globalThis.fetch only. Every module under test (api.ts, schemas.ts, labels.ts,
// shared/api.ts) is transpiled and run unmodified; zod is the real installed package, not a mock.

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = resolve(here, '..', '..')
const draftSrcRoot = resolve(draftRoot, 'src')
// mainSrcRoot: walk up from draftRoot until a real "Source/frontend" (has package.json + src + tests) is
// found. Once this file is applied to Source/frontend/tests/p2/, draftRoot already IS that folder on the
// first try, so mainSrcRoot === draftSrcRoot (same path). Run straight from any artifact_FE draft folder
// (any nesting depth, e.g. artifact_FE/<name>/ or artifact_FE/approved/<name>/), it climbs up to the real
// frontend root instead, so the loader's fallback below can still find files the draft never copied
// (e.g. features/buildings/api.ts, for buildingIdQuery).
function findFrontendRoot(dir) {
  for (let d = dir; ;) {
    if (existsSync(resolve(d, 'package.json')) && existsSync(resolve(d, 'src')) && existsSync(resolve(d, 'tests'))) return d
    const parent = dirname(d)
    if (parent === d) return dir
    d = parent
  }
}
const mainSrcRoot = resolve(findFrontendRoot(draftRoot), 'src')

const nodeRequire = createRequire(import.meta.url)
const cache = new Map()
function compileFile(absPath) {
  const code = ts.transpileModule(readFileSync(absPath, 'utf8'), {
    fileName: absPath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const mod = { exports: {} }
  Function('require', 'exports', 'module', code)(id => requireFrom(dirname(absPath), id), mod.exports, mod)
  return mod.exports
}
function load(absPath) {
  if (cache.has(absPath)) return cache.get(absPath)
  const exp = compileFile(absPath)
  cache.set(absPath, exp)
  return exp
}
function resolveFile(candidate) {
  for (const ext of ['.ts', '.tsx']) if (existsSync(candidate + ext)) return candidate + ext
  for (const ext of ['/index.ts', '/index.tsx']) if (existsSync(candidate + ext)) return candidate + ext
  if (existsSync(candidate)) {
    try { if (statSync(candidate).isFile()) return candidate } catch { /* not a plain file */ }
  }
  return null
}
function resolveRelative(dir, id) {
  const candidate = resolve(dir, id)
  const draftCandidate = candidate.startsWith(mainSrcRoot) ? candidate.replace(mainSrcRoot, draftSrcRoot) : candidate
  const draftFile = resolveFile(draftCandidate)
  if (draftFile) return draftFile
  const mainCandidate = candidate.startsWith(draftSrcRoot) ? candidate.replace(draftSrcRoot, mainSrcRoot) : candidate
  const mainFile = resolveFile(mainCandidate)
  if (mainFile) return mainFile
  throw new Error(`cannot resolve ${id} from ${dir}`)
}
function requireFrom(dir, id) {
  if (!id.startsWith('.')) return nodeRequire(id)
  if (id.endsWith('.css')) return {}
  return load(resolveRelative(dir, id))
}

const pricingApi = load(resolve(draftSrcRoot, 'features/pricing/api.ts'))
const pricingSchemas = load(resolve(draftSrcRoot, 'features/pricing/schemas.ts'))
const pricingLabels = load(resolve(draftSrcRoot, 'features/pricing/labels.ts'))
const sharedApi = load(resolve(draftSrcRoot, 'shared/api.ts'))

// ---------- fetch fake: outside edge only ----------
const json = (status, body) => ({ status, body })
const ok = (data, meta) => json(200, { data, ...(meta ? { meta } : {}) })
const pageMeta = (data, limit = 20) => ({ page: 1, limit, total: data.length })

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

function baseRoomPriceView(overrides = {}) {
  return {
    id: 1, roomId: 10, roomCode: 'A101', buildingId: 5, buildingName: 'Tòa Cầu Giấy',
    price: 3_000_000, effectiveFrom: '2026-06-15', status: 'PENDING', reason: null,
    proposedById: 1, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: '2026-06-01T00:00:00Z',
    expired: false, comparison: { oldValue: null, newValue: 3_000_000, changePercent: null, label: 'Giá mới' },
    ...overrides,
  }
}

// ======================================================================================
// API-02/SCOPE-02 — listRoomPrices buildingId rule + default paging
// ======================================================================================

test('API-02/SCOPE-02: listRoomPrices sends page=1&limit=20 always; buildingId=5 only for a number, not for "all" or null', async () => {
  let calls = fakeFetch(() => ok([], pageMeta([])))
  await pricingApi.listRoomPrices({ buildingId: 5, status: 'PENDING' })
  let q = queryOf(calls[0].url)
  assert.equal(q.get('page'), '1')
  assert.equal(q.get('limit'), '20')
  assert.equal(q.get('buildingId'), '5')
  assert.equal(q.get('status'), 'PENDING')

  calls = fakeFetch(() => ok([], pageMeta([])))
  await pricingApi.listRoomPrices({ buildingId: 'all' })
  assert.equal(queryOf(calls[0].url).has('buildingId'), false, '"all" must send no buildingId')

  calls = fakeFetch(() => ok([], pageMeta([])))
  await pricingApi.listRoomPrices({ buildingId: null })
  assert.equal(queryOf(calls[0].url).has('buildingId'), false, 'null must send no buildingId')
})

// ======================================================================================
// API-05 — Idempotency-Key header
// ======================================================================================

test('API-05: proposeRoomPrice sends header Idempotency-Key and a body with exactly roomId/price/effectiveFrom/reason', async () => {
  const calls = fakeFetch(() => ok(baseRoomPriceView()))
  await pricingApi.proposeRoomPrice({ roomId: 10, price: 2_600_000, effectiveFrom: '2026-06-15', reason: 'Thị trường tăng' }, 'key-1')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers['Idempotency-Key'], 'key-1')
  const sent = JSON.parse(calls[0].body)
  assert.deepEqual(Object.keys(sent).sort(), ['effectiveFrom', 'price', 'reason', 'roomId'])
  assert.deepEqual(sent, { roomId: 10, price: 2_600_000, effectiveFrom: '2026-06-15', reason: 'Thị trường tăng' })
})

test('API-05: apiRequest without an idempotencyKey sends no Idempotency-Key header', async () => {
  const calls = fakeFetch(() => ok({ ok: true }))
  await sharedApi.apiRequest('/x', { method: 'POST', body: { a: 1 } })
  assert.equal('Idempotency-Key' in calls[0].headers, false)
})

// ======================================================================================
// PRC-03 — rejectRoomPrice body/path
// ======================================================================================

test('PRC-03: rejectRoomPrice(7, note, key) POSTs /room-prices/7/reject with body { reviewNote: note }', async () => {
  const calls = fakeFetch(() => ok(baseRoomPriceView({ id: 7, status: 'REJECTED' })))
  await pricingApi.rejectRoomPrice(7, 'Giá cao quá', 'k')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.ok(calls[0].url.endsWith('/room-prices/7/reject'), calls[0].url)
  assert.deepEqual(JSON.parse(calls[0].body), { reviewNote: 'Giá cao quá' })
  assert.equal(calls[0].headers['Idempotency-Key'], 'k')
})

// ======================================================================================
// PRC-12 — isTierComparison discriminates by 'newTiers'
// ======================================================================================

test('PRC-12: isTierComparison is false for a PriceChange and true for a TierComparison', () => {
  const priceChange = { oldValue: 1, newValue: 2, changePercent: 100, label: null }
  const tierComparison = { oldTiers: null, newTiers: [], tierChanges: null, label: null }
  assert.equal(pricingApi.isTierComparison(priceChange), false)
  assert.equal(pricingApi.isTierComparison(tierComparison), true)
})

// ======================================================================================
// RATE-02 — ratePlanFormSchema
// ======================================================================================

function ratePlan(overrides = {}) {
  return {
    kind: 'ELECTRIC',
    effectiveFrom: pricingLabels.todayHanoi(),
    tiers: [{ tierNo: 1, upTo: null, unitPrice: 1000 }],
    ...overrides,
  }
}

test('RATE-02: one tier upTo:null passes', () => {
  assert.equal(pricingSchemas.ratePlanFormSchema.safeParse(ratePlan()).success, true)
})

test('RATE-02: two tiers upTo 50 then null passes', () => {
  const plan = ratePlan({ tiers: [{ tierNo: 1, upTo: 50, unitPrice: 1000 }, { tierNo: 2, upTo: null, unitPrice: 2000 }] })
  assert.equal(pricingSchemas.ratePlanFormSchema.safeParse(plan).success, true)
})

test('RATE-02: upTo 50 then 50 (not increasing) fails', () => {
  const plan = ratePlan({ tiers: [{ tierNo: 1, upTo: 50, unitPrice: 1000 }, { tierNo: 2, upTo: 50, unitPrice: 2000 }] })
  assert.equal(pricingSchemas.ratePlanFormSchema.safeParse(plan).success, false)
})

test('RATE-02: a non-last tier with upTo:null fails', () => {
  const plan = ratePlan({ tiers: [{ tierNo: 1, upTo: null, unitPrice: 1000 }, { tierNo: 2, upTo: null, unitPrice: 2000 }] })
  assert.equal(pricingSchemas.ratePlanFormSchema.safeParse(plan).success, false)
})

test('RATE-02: tierNo 1, 3 (not contiguous) fails', () => {
  const plan = ratePlan({ tiers: [{ tierNo: 1, upTo: 50, unitPrice: 1000 }, { tierNo: 3, upTo: null, unitPrice: 2000 }] })
  assert.equal(pricingSchemas.ratePlanFormSchema.safeParse(plan).success, false)
})

test('RATE-02: unitPrice 0 passes, -1 fails', () => {
  assert.equal(pricingSchemas.ratePlanFormSchema.safeParse(ratePlan({ tiers: [{ tierNo: 1, upTo: null, unitPrice: 0 }] })).success, true)
  assert.equal(pricingSchemas.ratePlanFormSchema.safeParse(ratePlan({ tiers: [{ tierNo: 1, upTo: null, unitPrice: -1 }] })).success, false)
})

test('RATE-02: WATER with 2 tiers fails (must be exactly 1 unlimited tier)', () => {
  const plan = ratePlan({ kind: 'WATER', tiers: [{ tierNo: 1, upTo: 50, unitPrice: 1000 }, { tierNo: 2, upTo: null, unitPrice: 2000 }] })
  assert.equal(pricingSchemas.ratePlanFormSchema.safeParse(plan).success, false)
})

test('RATE-02: SERVICE without serviceId fails', () => {
  const plan = ratePlan({ kind: 'SERVICE' })
  assert.equal(pricingSchemas.ratePlanFormSchema.safeParse(plan).success, false)
})

// ======================================================================================
// PRC-01/RATE-05 — roomPriceFormSchema
// ======================================================================================

test('PRC-01: price 0 fails, 1 passes, INT32_MAX passes, INT32_MAX+1 fails, 1.5 fails', () => {
  const base = { effectiveFrom: pricingLabels.todayHanoi() }
  assert.equal(pricingSchemas.roomPriceFormSchema.safeParse({ ...base, price: 0 }).success, false)
  assert.equal(pricingSchemas.roomPriceFormSchema.safeParse({ ...base, price: 1 }).success, true)
  assert.equal(pricingSchemas.roomPriceFormSchema.safeParse({ ...base, price: 2147483647 }).success, true)
  assert.equal(pricingSchemas.roomPriceFormSchema.safeParse({ ...base, price: 2147483648 }).success, false)
  assert.equal(pricingSchemas.roomPriceFormSchema.safeParse({ ...base, price: 1.5 }).success, false)
})

test('RATE-05: effectiveFrom yesterday fails, today passes', () => {
  const base = { price: 1000 }
  const yesterday = pricingLabels.plusDays(pricingLabels.todayHanoi(), -1)
  assert.equal(pricingSchemas.roomPriceFormSchema.safeParse({ ...base, effectiveFrom: yesterday }).success, false)
  assert.equal(pricingSchemas.roomPriceFormSchema.safeParse({ ...base, effectiveFrom: pricingLabels.todayHanoi() }).success, true)
})

// ======================================================================================
// UI-01 — formatPercent, tierRangeLabel
// ======================================================================================

test('UI-01: formatPercent(5) = "+5,0%", formatPercent(-3.2) = "−3,2%", formatPercent(0) = "0,0%"', () => {
  assert.equal(pricingLabels.formatPercent(5), '+5,0%')
  assert.equal(pricingLabels.formatPercent(-3.2), '−3,2%')
  assert.equal(pricingLabels.formatPercent(0), '0,0%')
})

test('UI-01: tierRangeLabel renders "0–50 kWh", "51–100 kWh", "Từ 101 kWh"', () => {
  const tiers = [{ tierNo: 1, upTo: 50, unitPrice: 1 }, { tierNo: 2, upTo: 100, unitPrice: 2 }, { tierNo: 3, upTo: null, unitPrice: 3 }]
  assert.equal(pricingLabels.tierRangeLabel(tiers, 0), '0–50 kWh')
  assert.equal(pricingLabels.tierRangeLabel(tiers, 1), '51–100 kWh')
  assert.equal(pricingLabels.tierRangeLabel(tiers, 2), 'Từ 101 kWh')
})

// ======================================================================================
// Q-FE8B-1 (+ ASSUMPTION FE8B-7) — groupRatePlans
// ======================================================================================

test('Q-FE8B-1: groupRatePlans splits current (today, biên) / upcoming (tomorrow) / history (desc by effectiveFrom)', () => {
  const today = '2026-06-15'
  const rows = [
    { id: 1, status: 'APPROVED', effectiveFrom: '2026-06-10' }, // APPROVED hôm qua (further back) -> history
    { id: 2, status: 'APPROVED', effectiveFrom: today },        // current (biên: effectiveFrom === today)
    { id: 3, status: 'APPROVED', effectiveFrom: '2026-06-16' }, // upcoming
    { id: 4, status: 'PENDING', effectiveFrom: '2026-06-08' },  // history
    { id: 5, status: 'REJECTED', effectiveFrom: '2026-06-05' }, // history
  ]
  const groups = pricingLabels.groupRatePlans(rows, today)
  assert.equal(groups.current.id, 2, 'the biên row (effectiveFrom === today) must be "current"')
  assert.deepEqual(groups.upcoming.map(r => r.id), [3])
  assert.deepEqual(groups.history.map(r => r.id), [1, 4, 5], 'history must be sorted by effectiveFrom descending')
})

test('Q-FE8B-1: groupRatePlans with only PENDING and an APPROVED tomorrow has current=null, 1 upcoming', () => {
  const today = '2026-06-15'
  const rows = [
    { id: 1, status: 'PENDING', effectiveFrom: '2026-06-01' },
    { id: 2, status: 'APPROVED', effectiveFrom: '2026-06-16' },
  ]
  const groups = pricingLabels.groupRatePlans(rows, today)
  assert.equal(groups.current, null)
  assert.equal(groups.upcoming.length, 1)
  assert.equal(groups.upcoming[0].id, 2)
})

test('Q-FE8B-1/ASSUMPTION FE8B-7: two APPROVED rows with the same effectiveFrom <= today — the higher id is "current", the other falls to history', () => {
  const today = '2026-06-15'
  const rows = [
    { id: 7, status: 'APPROVED', effectiveFrom: '2026-06-10' },
    { id: 9, status: 'APPROVED', effectiveFrom: '2026-06-10' },
  ]
  const groups = pricingLabels.groupRatePlans(rows, today)
  assert.equal(groups.current.id, 9)
  assert.deepEqual(groups.history.map(r => r.id), [7])
})

// ======================================================================================
// Q-FE8B-3 — waterUnitLabel
// ======================================================================================

test('Q-FE8B-3: waterUnitLabel maps PER_M3/PER_PERSON/undefined to the right unit text', () => {
  assert.equal(pricingLabels.waterUnitLabel('PER_M3'), 'đ/m³')
  assert.equal(pricingLabels.waterUnitLabel('PER_PERSON'), 'đ/người/kỳ')
  assert.equal(pricingLabels.waterUnitLabel(undefined), 'đ')
})

// ======================================================================================
// Q-FE8B-2 — RoomPriceView carries roomCode/buildingName as-is, no extra lookups
// ======================================================================================

test('Q-FE8B-2: listRoomPrices reads roomCode/buildingName straight from the API, with no extra GET /rooms/:id or /buildings call', async () => {
  const calls = fakeFetch(() => ok([baseRoomPriceView({ roomCode: 'CG01-203', buildingName: 'Tòa Cầu Giấy' })], pageMeta([1])))
  const page = await pricingApi.listRoomPrices({ buildingId: 5 })
  assert.equal(page.data[0].roomCode, 'CG01-203')
  assert.equal(page.data[0].buildingName, 'Tòa Cầu Giấy')
  assert.equal(calls.length, 1, 'no extra request must be made just to resolve roomCode/buildingName')
  assert.ok(!calls.some(c => /\/rooms\/\d/.test(c.url) || c.url.includes('/buildings')), 'must not call GET /rooms/:id or GET /buildings')
})
