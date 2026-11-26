import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { byName, dispatch, draftFirst, fail, fakeFetch, fill, find, isDisabled, loadModule, mount, ok, until } from '../p2/public-dom.mjs'

// CHAT-01..07 (FE-CHAT-01..05): the public chat bubble mounted through the real PublicLayout.
// Only fetch (the API edge) and localStorage are faked; expected texts come from docs/spec/21-chatbot.md and A-29.
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })
const require = createRequire(import.meta.url)
const React = require('react')
const h = React.createElement
const { MemoryRouter, Routes, Route } = require('react-router')
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
const mod = path => loadModule(draftFirst(`src/${path}`))
const { PublicLayout } = mod('layouts/PublicLayout.tsx')
const { AuthContext } = mod('app/auth-context.ts')
const { roomIdOfPath, splitRoomLinks, chatErrorKey } = mod('features/public/chat.ts')

const store = new Map()
function storage(choice = '/') {
  store.clear()
  if (choice) store.set('rooms.entryChoice', choice)
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
}

const BUSY = 'Trợ lý đang bận. Vui lòng gọi số điện thoại của tòa nhà hoặc đặt lịch xem phòng.' // CHAT-06
const toggle = app => find(app.container, n => n.tagName === 'BUTTON' && n.textContent === 'Hỏi trợ lý')[0]
const panel = app => find(app.container, n => n.tagName === 'SECTION' && n.attributes['aria-label'] === 'Trợ lý tìm phòng')[0]
const input = app => byName(app.container, 'chatQuestion')
const sendButton = app => find(app.container, n => n.tagName === 'BUTTON' && n.textContent === 'Gửi')[0]
const logText = app => find(app.container, n => n.tagName === 'OL')[0]?.textContent ?? ''
const alertText = app => find(app.container, n => n.attributes.role === 'alert').map(n => n.textContent).join(' ')
const chatCalls = calls => calls.filter(c => String(c.url).startsWith('/api/v1/public/chat'))
function formOf(el) { let node = el; while (node && node.tagName !== 'FORM') node = node.parentNode; return node }

async function boot(path, chatHandler = () => ok({ reply: 'Có phòng A101 giá 3.000.000 đ, xem /phong/101' }), seed) {
  const calls = fakeFetch([
    { prefix: '/public/contact', handler: () => ok({ phone: '0900000000', zaloUrl: null, facebookUrl: null }) },
    { prefix: '/public/chat', method: 'POST', handler: chatHandler },
  ])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  seed?.(client)
  const app = await mount(h(QueryClientProvider, { client },
    h(AuthContext.Provider, { value: { status: 'ready', user: null } },
      h(MemoryRouter, { initialEntries: [path] }, h(Routes, null,
        h(Route, { element: h(PublicLayout) }, h(Route, { path: '*', element: h('p', null, 'page') })))))))
  return { ...app, calls, stop: async () => { await app.stop(); client.clear() } }
}
async function openAndAsk(app, text) {
  if (!panel(app)) dispatch(app.container, toggle(app), 'click')
  await until(() => input(app), 'chat panel open')
  fill(app.container, input(app), text)
  dispatch(app.container, formOf(input(app)), 'submit')
}

test('CHAT-01: roomIdOfPath reads only /phong/<positive int32>', () => {
  assert.equal(roomIdOfPath('/phong/12'), 12)
  assert.equal(roomIdOfPath('/phong/12/'), 12)
  for (const path of ['/phong', '/phong/0', '/phong/abc', '/phong/2147483648', '/toa/12', '/phong/12/x']) assert.equal(roomIdOfPath(path), undefined, path)
})

test('CHAT-05: room links in a reply become links; CHAT-03/06 error codes map to their messages', () => {
  assert.deepEqual(splitRoomLinks('Xem /phong/101 nhé'), [{ text: 'Xem ' }, { text: '/phong/101', href: '/phong/101' }, { text: ' nhé' }])
  const { ApiError } = mod('shared/api.ts')
  assert.equal(chatErrorKey(new ApiError({ code: 'CHAT_UNAVAILABLE', message: 'x', status: 503 })), 'chat.busy')
  assert.equal(chatErrorKey(new ApiError({ code: 'TOO_MANY_REQUESTS', message: 'x', status: 429 })), 'chat.limit')
  assert.equal(chatErrorKey(new Error('offline')), 'chat.failed')
})

test('CHAT-01: the bubble is closed on load and sends no chat request until the visitor asks', async () => {
  storage()
  const app = await boot('/phong')
  try {
    assert.ok(toggle(app))
    assert.equal(toggle(app).attributes['aria-expanded'], 'false')
    assert.equal(panel(app), undefined)
    await until(() => app.calls.some(c => String(c.url).startsWith('/api/v1/public/contact')), 'contact loaded')
    assert.equal(chatCalls(app.calls).length, 0)
  } finally { await app.stop() }
})

test('UI-11: no bubble while the entry screen is open on the first home visit', async () => {
  storage(null)
  const app = await boot('/')
  try {
    assert.equal(find(app.container, n => n.attributes.role === 'dialog').length, 1)
    assert.equal(toggle(app), undefined)
  } finally { await app.stop() }
})

test('CHAT-01/05: on a room page the question is posted with roomId; the reply shows with a clickable room link and the box clears', async () => {
  storage()
  const app = await boot('/phong/12')
  try {
    await openAndAsk(app, '  Phòng này bao nhiêu?  ')
    await until(() => logText(app).includes('3.000.000 đ'), 'reply shown')
    const [call] = chatCalls(app.calls)
    assert.equal(call.method, 'POST')
    assert.deepEqual(JSON.parse(call.body), { messages: [{ role: 'user', content: 'Phòng này bao nhiêu?' }], roomId: 12 })
    assert.equal(find(app.container, n => n.tagName === 'A' && n.attributes.href === '/phong/101').length, 1)
    assert.equal(input(app).value, '')
  } finally { await app.stop() }
})

test('CHAT-01: outside a room page no roomId is sent; the second question carries the whole conversation in order', async () => {
  storage()
  let n = 0
  const app = await boot('/phong', () => ok({ reply: `Trả lời ${++n}` }))
  try {
    await openAndAsk(app, 'Câu 1')
    await until(() => logText(app).includes('Trả lời 1'), 'first reply')
    await openAndAsk(app, 'Câu 2')
    await until(() => logText(app).includes('Trả lời 2'), 'second reply')
    const bodies = chatCalls(app.calls).map(c => JSON.parse(c.body))
    assert.deepEqual(bodies[0], { messages: [{ role: 'user', content: 'Câu 1' }] })
    assert.deepEqual(bodies[1].messages, [
      { role: 'user', content: 'Câu 1' }, { role: 'assistant', content: 'Trả lời 1' }, { role: 'user', content: 'Câu 2' },
    ])
  } finally { await app.stop() }
})

test('CHAT-01, A-29: an empty or spaces-only question cannot be sent; the box allows at most 500 characters', async () => {
  storage()
  const app = await boot('/phong')
  try {
    dispatch(app.container, toggle(app), 'click')
    await until(() => input(app), 'open')
    assert.equal(input(app).attributes.maxlength ?? String(input(app).maxLength), '500')
    for (const text of ['', '    ']) {
      fill(app.container, input(app), text)
      assert.ok(isDisabled(sendButton(app)), `disabled for "${text}"`)
      dispatch(app.container, formOf(input(app)), 'submit')
    }
    assert.equal(chatCalls(app.calls).length, 0)
  } finally { await app.stop() }
})

test('CHAT-06: CHAT_UNAVAILABLE shows the spec message and the general phone; the question stays so sending again retries', async () => {
  storage()
  let first = true
  const app = await boot('/phong', () => {
    if (first) { first = false; return fail(503, 'CHAT_UNAVAILABLE', 'Trợ lý đang bận, vui lòng thử lại sau') }
    return ok({ reply: 'Đã trả lời' })
  })
  try {
    await openAndAsk(app, 'Có phòng không?')
    await until(() => alertText(app).includes(BUSY), 'busy message')
    assert.ok(alertText(app).includes('Số điện thoại: 0900000000'))
    assert.equal(input(app).value, 'Có phòng không?')
    assert.ok(!logText(app).includes('Có phòng không?'), 'failed question is not kept in the history')
    dispatch(app.container, formOf(input(app)), 'submit')
    await until(() => logText(app).includes('Đã trả lời'), 'retry works')
    assert.deepEqual(JSON.parse(chatCalls(app.calls)[1].body).messages, [{ role: 'user', content: 'Có phòng không?' }])
  } finally { await app.stop() }
})

test('CHAT-03: TOO_MANY_REQUESTS on a room page shows the phone of that room\'s building', async () => {
  storage()
  const app = await boot('/phong/12', () => fail(429, 'TOO_MANY_REQUESTS', 'x'),
    client => client.setQueryData(['public', 'room', 12, 'vi'], { id: 12, contact: { phone: '0912345678', zaloUrl: null, facebookUrl: null } }))
  try {
    await openAndAsk(app, 'Hỏi tiếp')
    await until(() => alertText(app).includes('Bạn đã hỏi nhiều lần trong một giờ'), 'limit message')
    assert.ok(alertText(app).includes('Số điện thoại: 0912345678'))
  } finally { await app.stop() }
})

test('UI-05: a network failure shows the generic message without a phone line', async () => {
  storage()
  const app = await boot('/phong', () => { throw new Error('offline') })
  try {
    await openAndAsk(app, 'Hỏi')
    await until(() => alertText(app).length > 0, 'error shown')
    assert.ok(!alertText(app).includes('Số điện thoại'))
  } finally { await app.stop() }
})

test('A-29: after 20 messages (10 questions) the form is replaced by the end-of-conversation note', async () => {
  storage()
  const app = await boot('/phong', () => ok({ reply: 'ok' }))
  try {
    for (let i = 1; i <= 10; i++) {
      await openAndAsk(app, `Câu ${i}`)
      await until(() => find(app.container, n => n.tagName === 'LI').length === 1 + 2 * i && input(app)?.value !== `Câu ${i}`, `answer ${i}`)
    }
    await until(() => panel(app).textContent.includes('Cuộc trò chuyện đã đủ 20 tin nhắn'), 'full note')
    assert.equal(input(app), undefined)
    assert.equal(JSON.parse(chatCalls(app.calls)[9].body).messages.length, 19)
  } finally { await app.stop() }
})

test('KIT-05, CHAT-07: Escape closes the panel; the conversation is never written to browser storage', async () => {
  storage()
  const app = await boot('/phong')
  try {
    await openAndAsk(app, 'Xin chào')
    await until(() => logText(app).includes('3.000.000'), 'reply')
    dispatch(app.container, input(app), 'keydown', { key: 'Escape' })
    await until(() => panel(app) === undefined, 'closed')
    assert.equal(toggle(app).attributes['aria-expanded'], 'false')
    assert.deepEqual([...store.keys()], ['rooms.entryChoice'])
  } finally { await app.stop() }
})
