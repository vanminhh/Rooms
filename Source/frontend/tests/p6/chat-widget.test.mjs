import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { byName, dispatch, draftFirst, fail, fakeDocument, fakeFetch, fill, find, isDisabled, loadModule, mount, ok, until } from '../p2/public-dom.mjs'

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
const { roomIdOfPath, splitRoomLinks, chatErrorKey, pickImageError } = mod('features/public/chat.ts')

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
const byLabel = (app, label) => find(app.container, n => n.tagName === 'BUTTON' && n.attributes['aria-label'] === label)[0]
const sendButton = app => byLabel(app, 'Gửi')
const logText = app => find(app.container, n => n.tagName === 'OL')[0]?.textContent ?? ''
const alertText = app => find(app.container, n => n.attributes.role === 'alert').map(n => n.textContent).join(' ')
const chatCalls = calls => calls.filter(c => String(c.url).startsWith('/api/v1/public/chat'))
function formOf(el) { let node = el; while (node && node.tagName !== 'FORM') node = node.parentNode; return node }

async function boot(path, chatHandler = () => ok({ reply: 'Có phòng A101 giá 3.000.000 đ, xem /phong/101' }), seed, rules = []) {
  const calls = fakeFetch([
    { prefix: '/public/contact', handler: () => ok({ phone: '0900000000', zaloUrl: null, facebookUrl: null }) },
    { prefix: '/public/chat', method: 'POST', handler: chatHandler },
    ...rules,
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

const suggestionButtons = app => find(app.container, n => n.tagName === 'UL' && n.attributes['aria-label'] === 'Câu hỏi gợi ý')
  .flatMap(ul => find(ul, n => n.tagName === 'BUTTON')).map(b => b.textContent)

test('CHAT-08: outside a room page the four general suggestions show; tapping one sends it and they disappear', async () => {
  storage()
  const app = await boot('/phong')
  try {
    dispatch(app.container, toggle(app), 'click')
    await until(() => input(app), 'open')
    assert.deepEqual(suggestionButtons(app), ['Phòng dưới 3 triệu?', 'Khu vực nào còn phòng?', 'Phòng cho nuôi thú cưng?', 'Đặt lịch xem phòng thế nào?'])
    const pets = find(app.container, n => n.tagName === 'BUTTON' && n.textContent === 'Phòng cho nuôi thú cưng?')[0]
    dispatch(app.container, pets, 'click')
    await until(() => logText(app).includes('3.000.000 đ'), 'reply shown')
    assert.deepEqual(JSON.parse(chatCalls(app.calls)[0].body), { messages: [{ role: 'user', content: 'Phòng cho nuôi thú cưng?' }] })
    assert.deepEqual(suggestionButtons(app), [])
  } finally { await app.stop() }
})

test('CHAT-08: on a room page the room suggestions show and are sent with roomId; after a failure they stay for a retry', async () => {
  storage()
  let first = true
  const app = await boot('/phong/12', () => {
    if (first) { first = false; return fail(503, 'CHAT_UNAVAILABLE', 'x') }
    return ok({ reply: 'Đã trả lời' })
  })
  try {
    dispatch(app.container, toggle(app), 'click')
    await until(() => input(app), 'open')
    assert.deepEqual(suggestionButtons(app), ['Phòng này mỗi tháng hết bao nhiêu?', 'Tiền điện nước tính thế nào?', 'Đặt lịch xem phòng này thế nào?'])
    const cost = () => find(app.container, n => n.tagName === 'BUTTON' && n.textContent === 'Phòng này mỗi tháng hết bao nhiêu?')[0]
    dispatch(app.container, cost(), 'click')
    await until(() => alertText(app).includes(BUSY), 'busy message')
    assert.equal(suggestionButtons(app).length, 3)
    dispatch(app.container, cost(), 'click')
    await until(() => logText(app).includes('Đã trả lời'), 'retry answered')
    assert.deepEqual(JSON.parse(chatCalls(app.calls)[1].body), { messages: [{ role: 'user', content: 'Phòng này mỗi tháng hết bao nhiêu?' }], roomId: 12 })
  } finally { await app.stop() }
})

const roomDetail = (id, code, images) => ({ id, code, price: 2400000, images, building: { id: 1, name: 'Tòa Cầu Giấy' }, contact: null })

test('CHAT-10: each distinct linked room (first 3) gets a card with its first photo, code, building and rent; a room that fails has no card', async () => {
  storage()
  const reply = 'Có /phong/1, /phong/2, lại /phong/1, /phong/3, /phong/4 và /phong/9'
  const app = await boot('/phong', () => ok({ reply }), undefined, [
    { prefix: '/public/rooms/1', handler: () => ok(roomDetail(1, '101', [{ id: 7, url: 'https://img/1a.jpg', sortOrder: 0 }, { id: 8, url: 'https://img/1b.jpg', sortOrder: 1 }])) },
    { prefix: '/public/rooms/2', handler: () => ok(roomDetail(2, '204', [])) },
    { prefix: '/public/rooms/3', handler: () => fail(404, 'NOT_FOUND', 'x') },
    { prefix: '/public/rooms/4', handler: () => ok(roomDetail(4, '401', [])) },
  ])
  try {
    await openAndAsk(app, 'Có phòng nào?')
    const cards = () => find(app.container, n => n.tagName === 'A' && n.attributes.class === 'chat-widget-room')
    await until(() => cards().length === 2, 'two cards')
    assert.deepEqual(cards().map(c => c.attributes.href), ['/phong/1', '/phong/2'])
    assert.equal(find(cards()[0], n => n.tagName === 'IMG')[0].attributes.src, 'https://img/1a.jpg')
    assert.ok(cards()[0].textContent.includes('Tòa Cầu Giấy') && cards()[0].textContent.includes('2.400.000 đ'))
    assert.ok(cards()[1].textContent.includes('Chưa có ảnh'))
    assert.equal(find(cards()[1], n => n.tagName === 'IMG').length, 0)
    const roomCalls = app.calls.filter(c => /\/public\/rooms\/\d/.test(String(c.url))).map(c => String(c.url))
    assert.ok(!roomCalls.some(u => u.endsWith('/rooms/4') || u.endsWith('/rooms/9')), 'only the first 3 distinct rooms are loaded')
  } finally { await app.stop() }
})

test('CHAT-09: the expand button widens the floating panel and keeps the conversation; shrink restores it', async () => {
  storage()
  const app = await boot('/phong')
  try {
    await openAndAsk(app, 'Xin chào')
    await until(() => logText(app).includes('3.000.000'), 'reply')
    const button = label => byLabel(app, label)
    dispatch(app.container, button('Phóng to'), 'click')
    await until(() => panel(app).attributes.class.includes('chat-widget-panel--wide'), 'wide')
    assert.ok(logText(app).includes('Xin chào') && logText(app).includes('3.000.000'))
    dispatch(app.container, button('Thu nhỏ'), 'click')
    await until(() => !panel(app).attributes.class.includes('chat-widget-panel--wide'), 'normal')
  } finally { await app.stop() }
})

// ---------- CHAT-09 icons, CHAT-11 image, CHAT-12 stop ----------
// The browser edges the image path needs (createImageBitmap, canvas) are faked; the widget, chat.ts and api.ts are real.
function fakeCanvas() {
  const drawn = []
  const original = fakeDocument.createElement
  globalThis.createImageBitmap = async () => ({ width: 3136, height: 1000, close() {} })
  fakeDocument.createElement = tag => tag === 'canvas'
    ? { width: 0, height: 0, getContext: () => ({ drawImage: (_b, _x, _y, w, h) => drawn.push([w, h]) }), toDataURL: (type, quality) => { drawn.push([type, quality]); return 'data:image/jpeg;base64,SU1H' } }
    : original.call(fakeDocument, tag)
  return { drawn, restore() { fakeDocument.createElement = original; delete globalThis.createImageBitmap } }
}
const fileInput = app => find(app.container, n => n.tagName === 'INPUT' && (n.attributes.type === 'file' || n.type === 'file'))[0]
function pick(app, file) {
  const el = fileInput(app)
  el.files = [file]
  dispatch(app.container, el, 'change', { target: el })
}
const photo = (type = 'image/png', size = 3_000_000) => ({ name: 'p', type, size })
const hangingChat = real => (url, init = {}) => String(url).startsWith('/api/v1/public/chat')
  ? new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
  : real(url, init)

test('CHAT-11: pickImageError accepts JPG/PNG/WebP up to exactly 5 MB', () => {
  assert.equal(pickImageError(photo('image/jpeg', 5 * 1024 * 1024)), null)
  assert.equal(pickImageError(photo('image/webp', 1)), null)
  assert.equal(pickImageError(photo('image/jpeg', 5 * 1024 * 1024 + 1)), 'chat.imageTooBig')
  assert.equal(pickImageError(photo('image/gif', 10)), 'chat.imageType')
  assert.equal(pickImageError(photo('application/pdf', 10)), 'chat.imageType')
})

test('CHAT-09: the head has icon buttons named Phóng to / Thu nhỏ and Đóng trợ lý, with no visible text', async () => {
  storage()
  const app = await boot('/phong')
  try {
    dispatch(app.container, toggle(app), 'click')
    await until(() => byLabel(app, 'Phóng to'), 'open')
    assert.equal(byLabel(app, 'Phóng to').textContent, '')
    assert.equal(byLabel(app, 'Đóng trợ lý').textContent, '')
    dispatch(app.container, byLabel(app, 'Phóng to'), 'click')
    await until(() => byLabel(app, 'Thu nhỏ'), 'restore icon')
    dispatch(app.container, byLabel(app, 'Đóng trợ lý'), 'click')
    await until(() => panel(app) === undefined, 'closed')
  } finally { await app.stop() }
})

test('CHAT-11: a picked image is shrunk to 1568 px JPEG, previewed, sent once with the question, then the next question carries text only', async () => {
  storage()
  const canvas = fakeCanvas()
  let n = 0
  const app = await boot('/phong', () => ok({ reply: `Trả lời ${++n}` }))
  try {
    dispatch(app.container, toggle(app), 'click')
    await until(() => fileInput(app), 'open')
    pick(app, photo())
    await until(() => byLabel(app, 'Bỏ ảnh'), 'preview shown')
    assert.deepEqual(canvas.drawn, [[1568, 500], ['image/jpeg', 0.85]])
    fill(app.container, input(app), 'Phòng giống ảnh này?')
    dispatch(app.container, formOf(input(app)), 'submit')
    await until(() => logText(app).includes('Trả lời 1'), 'first reply')
    assert.deepEqual(JSON.parse(chatCalls(app.calls)[0].body), {
      messages: [{ role: 'user', content: 'Phòng giống ảnh này?' }], image: { mediaType: 'image/jpeg', data: 'SU1H' },
    })
    assert.equal(byLabel(app, 'Bỏ ảnh'), undefined, 'the preview is cleared after sending')
    assert.equal(find(app.container, el => el.tagName === 'IMG' && el.attributes.src === 'data:image/jpeg;base64,SU1H').length, 1, 'the image shows in the history')
    await openAndAsk(app, 'Còn phòng khác?')
    await until(() => logText(app).includes('Trả lời 2'), 'second reply')
    const second = JSON.parse(chatCalls(app.calls)[1].body)
    assert.equal(second.image, undefined)
    assert.deepEqual(second.messages[0], { role: 'user', content: 'Phòng giống ảnh này?' })
  } finally { await app.stop(); canvas.restore() }
})

test('CHAT-11: a wrong type or a file over 5 MB shows a message and attaches nothing; the remove button drops the image', async () => {
  storage()
  const canvas = fakeCanvas()
  const app = await boot('/phong')
  try {
    dispatch(app.container, toggle(app), 'click')
    await until(() => fileInput(app), 'open')
    pick(app, photo('image/gif', 10))
    await until(() => alertText(app).includes('Chỉ nhận ảnh JPG, PNG hoặc WebP.'), 'type message')
    pick(app, photo('image/jpeg', 5 * 1024 * 1024 + 1))
    await until(() => alertText(app).includes('Ảnh phải nhỏ hơn 5 MB.'), 'size message')
    assert.equal(byLabel(app, 'Bỏ ảnh'), undefined)
    pick(app, photo())
    await until(() => byLabel(app, 'Bỏ ảnh'), 'attached')
    assert.equal(alertText(app), '')
    dispatch(app.container, byLabel(app, 'Bỏ ảnh'), 'click')
    await until(() => byLabel(app, 'Bỏ ảnh') === undefined, 'removed')
    await openAndAsk(app, 'Chỉ chữ')
    await until(() => chatCalls(app.calls).length === 1, 'sent')
    assert.equal(JSON.parse(chatCalls(app.calls)[0].body).image, undefined)
  } finally { await app.stop(); canvas.restore() }
})

test('CHAT-12: while waiting the round button is Stop; stopping cancels the request, keeps question and image, adds no history and shows no error', async () => {
  storage()
  const canvas = fakeCanvas()
  const app = await boot('/phong')
  const real = globalThis.fetch
  globalThis.fetch = hangingChat(real)
  try {
    dispatch(app.container, toggle(app), 'click')
    await until(() => fileInput(app), 'open')
    pick(app, photo())
    await until(() => byLabel(app, 'Bỏ ảnh'), 'attached')
    fill(app.container, input(app), 'Hỏi rồi dừng')
    dispatch(app.container, formOf(input(app)), 'submit')
    await until(() => byLabel(app, 'Dừng trả lời'), 'stop button')
    assert.equal(sendButton(app), undefined)
    assert.ok(isDisabled(byLabel(app, 'Đính kèm ảnh')))
    dispatch(app.container, byLabel(app, 'Dừng trả lời'), 'click')
    await until(() => sendButton(app), 'send button back')
    assert.equal(input(app).value, 'Hỏi rồi dừng')
    assert.ok(byLabel(app, 'Bỏ ảnh'), 'the image stays attached')
    assert.equal(find(app.container, el => el.tagName === 'LI' && String(el.attributes.class).includes('chat-widget-msg--user')).length, 0)
    assert.equal(alertText(app), '')
    globalThis.fetch = real
    dispatch(app.container, formOf(input(app)), 'submit')
    await until(() => logText(app).includes('3.000.000'), 'sent again')
    assert.equal(JSON.parse(chatCalls(app.calls).at(-1).body).image.data, 'SU1H')
  } finally { globalThis.fetch = real; await app.stop(); canvas.restore() }
})

test('CHAT-12: stopping a tapped suggestion puts it into the empty box', async () => {
  storage()
  const app = await boot('/phong')
  const real = globalThis.fetch
  globalThis.fetch = hangingChat(real)
  try {
    dispatch(app.container, toggle(app), 'click')
    await until(() => input(app), 'open')
    dispatch(app.container, find(app.container, el => el.tagName === 'BUTTON' && el.textContent === 'Phòng dưới 3 triệu?')[0], 'click')
    await until(() => byLabel(app, 'Dừng trả lời'), 'stop')
    dispatch(app.container, byLabel(app, 'Dừng trả lời'), 'click')
    await until(() => input(app).value === 'Phòng dưới 3 triệu?', 'suggestion back in the box')
    assert.equal(alertText(app), '')
  } finally { globalThis.fetch = real; await app.stop() }
})
