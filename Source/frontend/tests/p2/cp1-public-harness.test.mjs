// CP-1 (FE-P2-14 nền): draft-root.mjs and public-dom.mjs themselves, plus the two coder files that already
// exist in the draft (ListState.tsx — UI-03; RoomCard.tsx — UI-01/08). No business logic from later checkpoints
// is tested here (PublicHomePage, RoomFilters, etc. do not exist yet).
// Outside edges faked: the fake DOM and `fetch` from public-dom.mjs; react, react-dom/client, react-router and
// the real kit (src/components) all run unmodified via loadModule's main-fallback resolution.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import test from 'node:test'
import {
  draftRoot, mainRoot, draftFirst, loadModule,
  mount, find, dispatch, wait, fakeFetch, ok, fail, pageMeta, queryOf,
} from './public-dom.mjs'

// ======================================================================================
// draft-root.mjs — root finding has no fixed path depth (the P2-8a lesson)
// ======================================================================================

test('CP-1: draftRoot has src/ and mainRoot is Source/frontend (has the real kit); once applied they are the same folder', () => {
  assert.ok(existsSync(join(draftRoot, 'src')), 'draftRoot must contain src/')
  assert.equal(basename(mainRoot), 'frontend')
  assert.ok(existsSync(join(mainRoot, 'src', 'components', 'index.ts')), 'mainRoot must contain the real kit')
  // After apply-draft the test lives in Source/frontend/tests, so draft root and main root coincide.
  assert.equal(draftRoot, mainRoot)
})

test('CP-1: draftFirst resolves to the draft copy when the draft has the file, else falls back to main', () => {
  const draftCopy = draftFirst('src/features/public/api.ts')
  assert.equal(draftCopy, join(draftRoot, 'src/features/public/api.ts'))
  assert.ok(existsSync(draftCopy))
  // routes.tsx is out of scope for this task (PLAN §1) and was never copied into the draft.
  const fallback = draftFirst('src/app/routes.tsx')
  assert.equal(fallback, join(mainRoot, 'src/app/routes.tsx'))
  assert.ok(existsSync(fallback))
})

test('CP-1: loadModule transpiles a draft .tsx and resolves its relative imports draft-first / main-fallback', () => {
  const { RoomCard } = loadModule(draftFirst('src/features/public/RoomCard.tsx'))
  const { ListState } = loadModule(draftFirst('src/features/public/ListState.tsx'))
  assert.equal(typeof RoomCard, 'function')
  assert.equal(typeof ListState, 'function')
})

// ======================================================================================
// RoomCard.tsx (UI-01/08) — exercised through public-dom.mjs's mount/find helpers
// ======================================================================================

const room = (overrides = {}) => ({
  id: 7, code: 'B203', floor: 2, areaM2: 18.5, price: 2_300_000, maxOccupants: 2,
  buildingId: 1, buildingCode: 'B', buildingName: 'Tòa B', district: 'Cầu Giấy', ward: 'Dịch Vọng',
  imageUrl: null, ...overrides,
})

async function mountRoomCard(props) {
  const React = (await import('react')).default
  const { MemoryRouter } = await import('react-router')
  const { RoomCard } = loadModule(draftFirst('src/features/public/RoomCard.tsx'))
  return mount(React.createElement(MemoryRouter, null, React.createElement(RoomCard, props)))
}

test('UI-08: RoomCard with imageUrl=null shows "Chưa có ảnh" and renders no <img>', async () => {
  const app = await mountRoomCard({ room: room({ imageUrl: null }) })
  assert.ok(app.container.textContent.includes('Chưa có ảnh'))
  assert.equal(find(app.container, n => n.tagName === 'IMG').length, 0)
  await app.stop()
})

test('UI-08: RoomCard with an imageUrl renders exactly one <img> with a non-empty alt', async () => {
  const app = await mountRoomCard({ room: room({ imageUrl: 'https://x/img.jpg', code: 'B203', buildingName: 'Tòa B' }) })
  const imgs = find(app.container, n => n.tagName === 'IMG')
  assert.equal(imgs.length, 1)
  assert.ok(imgs[0].getAttribute('alt')?.length > 0, 'alt must not be empty')
  assert.ok(!app.container.textContent.includes('Chưa có ảnh'))
  await app.stop()
})

test('UI-01: RoomCard price renders as integer đồng "2.300.000 đ", no "/ tháng"', async () => {
  const app = await mountRoomCard({ room: room({ price: 2_300_000 }) })
  assert.ok(app.container.textContent.includes('2.300.000 đ'), app.container.textContent)
  assert.ok(!app.container.textContent.includes('2.300.000 đ / tháng'))
  await app.stop()
})

test('PUB-02: the whole RoomCard links to /phong/:id', async () => {
  const app = await mountRoomCard({ room: room({ id: 42 }) })
  const link = find(app.container, n => n.tagName === 'A')[0]
  assert.equal(link.getAttribute('href'), '/phong/42')
  await app.stop()
})

// ======================================================================================
// ListState.tsx (UI-03) — the 4 shared list states
// ======================================================================================

async function mountListState(props) {
  const React = (await import('react')).default
  const { ListState } = loadModule(draftFirst('src/features/public/ListState.tsx'))
  return mount(React.createElement(ListState, { ...props }))
}

test('UI-03: pending state shows the loading label in role="status", no children', async () => {
  const app = await mountListState({ status: 'pending', error: null, isEmpty: false, loadingLabel: 'Đang tải danh sách phòng', emptyTitle: '', onRetry: () => {}, children: 'DATA' })
  assert.equal(find(app.container, n => n.attributes.role === 'status').length, 1)
  assert.ok(app.container.textContent.includes('Đang tải danh sách phòng'))
  assert.ok(!app.container.textContent.includes('DATA'))
  await app.stop()
})

test('UI-03/UI-05: error state shows error.message in role="alert" and a "Thử lại" button that calls onRetry', async () => {
  let retried = 0
  const app = await mountListState({ status: 'error', error: new Error('Có lỗi xảy ra, vui lòng thử lại sau'), isEmpty: false, loadingLabel: '', emptyTitle: '', onRetry: () => { retried++ }, children: 'DATA' })
  const alertEl = find(app.container, n => n.attributes.role === 'alert')[0]
  assert.ok(alertEl, 'must render role="alert"')
  assert.equal(alertEl.textContent, 'Có lỗi xảy ra, vui lòng thử lại sau')
  const retryBtn = find(app.container, n => n.tagName === 'BUTTON').find(b => b.textContent.trim() === 'Thử lại')
  assert.ok(retryBtn, 'must render a "Thử lại" button')
  dispatch(app.container, retryBtn, 'click')
  await wait(10)
  assert.equal(retried, 1)
  await app.stop()
})

test('UI-03: empty state shows emptyTitle and emptyHint, no role="alert", no children', async () => {
  const React = (await import('react')).default
  const { ListState } = loadModule(draftFirst('src/features/public/ListState.tsx'))
  const app = await mount(React.createElement(ListState, {
    status: 'success', error: null, isEmpty: true, loadingLabel: '', emptyTitle: 'Chưa có phòng trống nào',
    emptyHint: React.createElement('span', null, 'Xem tất cả phòng trống'), onRetry: () => {}, children: 'DATA',
  }))
  assert.ok(app.container.textContent.includes('Chưa có phòng trống nào'))
  assert.ok(app.container.textContent.includes('Xem tất cả phòng trống'))
  assert.equal(find(app.container, n => n.attributes.role === 'alert').length, 0)
  assert.ok(!app.container.textContent.includes('DATA'))
  await app.stop()
})

test('UI-03: success with data renders children and no loading/error/empty markup', async () => {
  const React = (await import('react')).default
  const { ListState } = loadModule(draftFirst('src/features/public/ListState.tsx'))
  const app = await mount(React.createElement(ListState, {
    status: 'success', error: null, isEmpty: false, loadingLabel: 'Đang tải danh sách phòng', emptyTitle: 'Chưa có phòng trống nào',
    onRetry: () => {}, children: React.createElement('p', null, 'DATA'),
  }))
  assert.ok(app.container.textContent.includes('DATA'))
  assert.ok(!app.container.textContent.includes('Đang tải danh sách phòng'))
  assert.ok(!app.container.textContent.includes('Chưa có phòng trống nào'))
  assert.equal(find(app.container, n => n.attributes.role === 'status').length, 0)
  await app.stop()
})

// ======================================================================================
// public-dom.mjs's own fetch helper — outside-edge fake, no unit under test here
// ======================================================================================

test('CP-1: fakeFetch routes by prefix+method under /api/v1, and falls back to a 404 for unmatched calls', async () => {
  const calls = fakeFetch([
    { prefix: '/public/rooms', method: 'GET', handler: () => ok([{ id: 1 }], pageMeta([{ id: 1 }])) },
  ])
  const matched = await fetch('/api/v1/public/rooms?page=1&limit=20')
  const matchedBody = await matched.json()
  assert.equal(matched.status, 200)
  assert.deepEqual(matchedBody, { data: [{ id: 1 }], meta: { page: 1, limit: 20, total: 1 } })
  assert.equal(calls.length, 1)
  assert.equal(queryOf(calls[0].url).get('limit'), '20')

  const unmatched = await fetch('/api/v1/public/featured-rooms')
  assert.equal(unmatched.status, 404)
  assert.equal((await unmatched.json()).error.code, 'NOT_FOUND')
})

test('CP-1: fail() builds the error envelope shape the FE reads (code, message, fields)', () => {
  const { status, body } = fail(409, 'ROOM_NOT_AVAILABLE', 'Phòng không còn trống')
  assert.equal(status, 409)
  assert.deepEqual(body, { error: { code: 'ROOM_NOT_AVAILABLE', message: 'Phòng không còn trống' } })
  const withFields = fail(400, 'VALIDATION_FAILED', 'x', { visitDate: 'y' })
  assert.deepEqual(withFields.body.error.fields, { visitDate: 'y' })
})
