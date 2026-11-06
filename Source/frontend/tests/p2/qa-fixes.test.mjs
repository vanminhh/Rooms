// Tester checkpoint: Source/frontend/artifact_FE/2026-11-06-FE-P2-QA-fixes (no PLAN.md; behaviours come from the
// task prompt + docs/spec/13-viewings.md VIEW-04/05/10, docs/spec/31-ui-kit.md UI-03).
//
// D3 — Spinner `block`: src/components/FormFields.tsx + rooms.css.
// A9 — ViewingCard "Chốt" (disabled, aria-describedby hint): src/features/viewings/ViewingCard.tsx.
// A5 — PublicRoomPage building name is a link to /toa/:id: src/pages/public/PublicRoomPage.tsx.
// B1 — RoomInspector pendingProposal shows the proposed price: src/features/rooms/RoomInspector.tsx.
//
// Outside edges faked: `fetch` (fakeFetch) and the fake DOM (public-dom.mjs; Node has no real DOM, no jsdom
// installed). Every module under test (FormFields/Spinner, ViewingCard, RoomInspector, PublicRoomPage and their
// dependencies: the kit, features/public/*, react-router, @tanstack/react-query) runs unmodified via
// `loadModule`/`draftFirst` (draft-first / main-fallback resolution, draft-root.mjs copied into this draft's
// tests/ folder so it resolves against this draft, not main).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import {
  draftFirst, loadModule, mount, find, dispatch, until, wait,
  fakeFetch, ok, buttonByText,
} from './public-dom.mjs'

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')

// @tanstack/react-query keeps a gc timer alive per QueryClient; end the process once done (same convention as
// the other p2 test files).
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

function newClient() {
  const { QueryClient } = nodeRequire('@tanstack/react-query')
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 }, mutations: { retry: false, gcTime: 1000 } } })
}

// ======================================================================================
// D3 — Spinner `block` prop (src/components/FormFields.tsx, src/components/rooms.css)
// ======================================================================================

const { Spinner } = loadModule(draftFirst('src/components/FormFields.tsx'))
const roomsCss = readFileSync(draftFirst('src/components/rooms.css'), 'utf8')

function classesOf(el) { return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean) }

test('D3: Spinner without `block` keeps class "rooms-spinner", role=status, label inside "rooms-visually-hidden"', async () => {
  const app = await mount(React.createElement(Spinner, { label: 'Đang tải' }))
  const root = find(app.container, n => n.getAttribute('role') === 'status')[0]
  assert.ok(root, 'no role=status element')
  assert.deepEqual(classesOf(root), ['rooms-spinner'])
  const hiddenLabel = find(root, n => classesOf(n).includes('rooms-visually-hidden'))[0]
  assert.ok(hiddenLabel, 'label must be inside .rooms-visually-hidden')
  assert.equal(hiddenLabel.textContent, 'Đang tải')
  assert.equal(find(root, n => classesOf(n).includes('rooms-spinner-label')).length, 0, 'non-block must not use rooms-spinner-label')
  await app.stop()
})

test('D3: Spinner with `block` has classes "rooms-spinner rooms-spinner--block", role=status, label visible as text (class "rooms-spinner-label", not hidden)', async () => {
  const app = await mount(React.createElement(Spinner, { block: true, label: 'Đang tải danh sách' }))
  const root = find(app.container, n => n.getAttribute('role') === 'status')[0]
  assert.ok(root)
  assert.deepEqual(classesOf(root), ['rooms-spinner', 'rooms-spinner--block'])
  const visibleLabel = find(root, n => classesOf(n).includes('rooms-spinner-label'))[0]
  assert.ok(visibleLabel, 'label must be inside .rooms-spinner-label')
  assert.equal(visibleLabel.textContent, 'Đang tải danh sách')
  assert.equal(find(root, n => classesOf(n).includes('rooms-visually-hidden')).length, 0, 'block label must not be visually-hidden')
  await app.stop()
})

test('D3: rooms.css defines .rooms-spinner--block as display:flex, centered (justify-content + text-align:center)', () => {
  const rule = roomsCss.match(/\.rooms-spinner--block\s*\{([^}]*)\}/)
  assert.ok(rule, '.rooms-spinner--block rule not found in rooms.css')
  assert.match(rule[1], /display:\s*flex/)
  assert.match(rule[1], /justify-content:\s*center/)
  assert.match(rule[1], /text-align:\s*center/)
})

// Each standalone (non-button) loading spinner must pass `block`; a spinner inside a button (next to its own
// text, gated by isPending/isSubmitting/pending) must stay the small inline ring, with no `block`. Checked by
// source text, grepping every `<Spinner` call site in the draft (ComponentPreview.tsx is the kit's own preview
// gallery, showing both variants side by side on purpose — out of scope here).
const standaloneSpinnerFiles = [
  'src/features/public/ListState.tsx',
  'src/pages/staff/BuildingsPage.tsx',
  'src/pages/staff/ViewingsPage.tsx',
  'src/pages/staff/ApprovalsPage.tsx',
  'src/pages/staff/StaffHomePage.tsx',
  'src/features/rooms/RoomGrid.tsx',
  'src/features/managers/ManagerList.tsx',
]

test('D3: every listed standalone loading state passes <Spinner block ...>', () => {
  for (const relPath of standaloneSpinnerFiles) {
    const src = readFileSync(draftFirst(relPath), 'utf8')
    const spinnerCalls = src.match(/<Spinner\b[^>]*>/g) ?? []
    assert.ok(spinnerCalls.length >= 1, `${relPath}: no <Spinner> found`)
    for (const call of spinnerCalls) assert.match(call, /\bblock\b/, `${relPath}: "${call}" must pass block`)
  }
})

// Each exact button-spinner call site (one per `pending`/`isPending` guard immediately inside a RoomsButton's
// children) must appear verbatim with no `block`. RoomPriceDialog.tsx also has an unrelated *standalone*
// <Spinner block .../> (its own expired-proposal loading state, asserted separately above as part of
// standaloneSpinnerFiles-style coverage) — this check only targets the specific button call sites, not every
// <Spinner> in the file.
const buttonSpinnerCallSites = [
  ['src/features/viewings/ViewingCard.tsx', 'pending && <Spinner label="Đang xử lý" />', 2],
  ['src/features/pricing/RoomPriceDialog.tsx', 'propose.isPending && <Spinner label="Đang xử lý" />', 1],
]

test('D3: spinners used inside a submit button (pending/isPending && <Spinner .../>) never pass `block`', () => {
  for (const [relPath, snippet, expectedCount] of buttonSpinnerCallSites) {
    const src = readFileSync(draftFirst(relPath), 'utf8')
    const count = src.split(snippet).length - 1
    assert.equal(count, expectedCount, `${relPath}: expected ${expectedCount}x "${snippet}", found ${count}`)
    assert.ok(!src.includes(snippet.replace('<Spinner label', '<Spinner block label')), `${relPath}: the button spinner must not gain block`)
  }
})

test('D3 (by mount): ListState in its pending state shows the loading label as visible text, not aria-hidden/visually-hidden', async () => {
  const { ListState } = loadModule(draftFirst('src/features/public/ListState.tsx'))
  const app = await mount(React.createElement(ListState, {
    status: 'pending', error: null, isEmpty: false, loadingLabel: 'Đang tải phòng trống', emptyTitle: '', onRetry: () => {},
  }, null))
  const visibleLabel = find(app.container, n => classesOf(n).includes('rooms-spinner-label'))[0]
  assert.ok(visibleLabel, 'ListState pending state must render a block Spinner (visible label)')
  assert.equal(visibleLabel.textContent, 'Đang tải phòng trống')
  assert.equal(find(app.container, n => classesOf(n).includes('rooms-visually-hidden')).length, 0)
  await app.stop()
})

// ======================================================================================
// A9 — ViewingCard "Chốt" (src/features/viewings/ViewingCard.tsx), VIEW-04/VIEW-05
// ======================================================================================

const { ViewingCard } = loadModule(draftFirst('src/features/viewings/ViewingCard.tsx'))

function baseViewing(overrides = {}) {
  return {
    id: 1, roomId: 10, roomCode: 'A101', buildingId: 5, buildingName: 'Tòa Cầu Giấy',
    guestName: 'Nguyễn Văn A', guestPhone: '0901234567', visitDate: '2026-11-10', timeSlot: 'MORNING', timeSlotLabel: 'Sáng (8:00–11:00)',
    note: null, source: 'MANUAL', status: 'NEW', statusLabel: 'Mới', handledById: null, outcomeNote: null,
    createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

function mountCard(viewing) {
  const { QueryClientProvider } = nodeRequire('@tanstack/react-query')
  return mount(React.createElement(QueryClientProvider, { client: newClient() }, React.createElement(ViewingCard, { viewing })))
}

test('A9/VIEW-05: a CONFIRMED (open) viewing shows a disabled "Chốt" button next to "Không thành", aria-describedby -> #won-hint-<id> with the Phase-3 hint text; clicking it sends no request', async () => {
  const calls = fakeFetch([])
  const app = await mountCard(baseViewing({ id: 7, status: 'CONFIRMED' }))
  const chot = buttonByText(app.container, 'Chốt')
  assert.ok(chot, 'CONFIRMED card must show a "Chốt" button')
  assert.ok(chot.disabled === true || chot.hasAttribute('disabled'), '"Chốt" must be disabled')
  assert.ok(buttonByText(app.container, 'Không thành'), '"Chốt" must sit next to "Không thành"')
  assert.equal(chot.getAttribute('aria-describedby'), 'won-hint-7')
  const hint = find(app.container, n => n.getAttribute('id') === 'won-hint-7')[0]
  assert.ok(hint, 'no element with id won-hint-7')
  assert.equal(hint.textContent, 'Chốt lịch sẽ có khi làm phần Hợp đồng.')
  dispatch(app.container, chot, 'click')
  await wait(30)
  assert.equal(calls.length, 0, 'clicking the disabled "Chốt" button must send no request')
  await app.stop()
})

test('A9: a NEW viewing shows no "Chốt" button and no won-hint element', async () => {
  const app = await mountCard(baseViewing({ id: 8, status: 'NEW' }))
  assert.ok(!buttonByText(app.container, 'Chốt'))
  assert.equal(find(app.container, n => n.getAttribute('id') === 'won-hint-8').length, 0)
  await app.stop()
})

test('A9: closed viewings (WON, LOST, CANCELLED) show neither the "Chốt" button nor the won-hint element', async () => {
  for (const status of ['WON', 'LOST', 'CANCELLED']) {
    const app = await mountCard(baseViewing({ id: 9, status }))
    assert.ok(!buttonByText(app.container, 'Chốt'), `status ${status} must not show "Chốt"`)
    assert.equal(find(app.container, n => n.getAttribute('id') === 'won-hint-9').length, 0, `status ${status} must not show the hint`)
    await app.stop()
  }
})

// ======================================================================================
// A5 — PublicRoomPage building name links to /toa/:id (src/pages/public/PublicRoomPage.tsx)
// ======================================================================================

const buildingSummary = (overrides = {}) => ({
  id: 7, code: 'AL1', name: 'An Lâm 1', address: '12 Láng Hạ', district: 'Đống Đa', ward: 'Láng Hạ',
  waterMode: 'PER_M3', amenities: [], description: null, ...overrides,
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

function roomRule(id, result) { return { prefix: `/public/rooms/${id}`, method: 'GET', handler: () => result } }

async function mountRoom(initialPath, rules) {
  fakeFetch(rules)
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { createMemoryRouter, RouterProvider } = nodeRequire('react-router')
  const { PublicRoomPage } = loadModule(draftFirst('src/pages/public/PublicRoomPage.tsx'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/phong/:id', element: React.createElement(PublicRoomPage) }], { initialEntries: [initialPath] })
  return mount(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(RouterProvider, { router })))
}

test('A5: the building name on a room page is an <a href="/toa/<buildingId>"> link with the building name', async () => {
  const room = roomDetail({ building: buildingSummary({ id: 42, name: 'An Lâm Cầu Giấy' }) })
  const app = await mountRoom('/phong/10', [roomRule(10, ok(room))])
  await until(() => app.container.textContent.includes('Phòng B203'), 'loaded')
  const link = find(app.container, n => n.tagName === 'A' && n.textContent.trim() === 'An Lâm Cầu Giấy')[0]
  assert.ok(link, 'building name must render as a link')
  assert.equal(link.getAttribute('href'), '/toa/42')
  await app.stop()
})

// ======================================================================================
// B1 — RoomInspector pendingProposal shows the proposed price (src/features/rooms/RoomInspector.tsx)
// ======================================================================================

const { RoomInspector } = loadModule(draftFirst('src/features/rooms/RoomInspector.tsx'))

function baseRoomGridItem(overrides = {}) {
  return {
    id: 10, buildingId: 5, code: 'A101', floor: 1, areaM2: 20, price: 3_000_000, maxOccupants: 2,
    underMaintenance: false, isActive: true, status: 'Trống', pendingProposal: null, imageCount: 0,
    ...overrides,
  }
}

function mountInspector(room) {
  const { QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { MemoryRouter } = nodeRequire('react-router')
  return mount(React.createElement(QueryClientProvider, { client: newClient() },
    React.createElement(MemoryRouter, null, React.createElement(RoomInspector, { room }))))
}

test('B1: a non-expired pendingProposal shows "Đề xuất giá 2.500.000 đ áp dụng từ 01/12/2026."', async () => {
  const room = baseRoomGridItem({ pendingProposal: { id: 1, price: 2_500_000, effectiveFrom: '2026-12-01', expired: false } })
  const app = await mountInspector(room)
  assert.ok(app.container.textContent.includes('Đề xuất giá 2.500.000 đ áp dụng từ 01/12/2026.'), app.container.textContent)
  await app.stop()
})

test('B1: an expired pendingProposal shows "Đề xuất đã quá hạn. Cần đề xuất lại để duyệt." and a "Đề xuất lại" button', async () => {
  const room = baseRoomGridItem({ pendingProposal: { id: 2, price: 2_500_000, effectiveFrom: '2026-01-01', expired: true } })
  const app = await mountInspector(room)
  assert.ok(app.container.textContent.includes('Đề xuất đã quá hạn. Cần đề xuất lại để duyệt.'), app.container.textContent)
  assert.ok(buttonByText(app.container, 'Đề xuất lại'))
  assert.ok(!buttonByText(app.container, 'Đề xuất giá'))
  await app.stop()
})
