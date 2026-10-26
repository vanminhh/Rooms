// Kiểm tra bản nháp 3D bằng Chrome headless (WebGL phần mềm) và chuột thật qua CDP; chụp màn hình vào thư mục ra.
// Cần: dev server đang chạy (cd Source/frontend && npm run dev), Chrome ở C:/Program Files/Google/Chrome/Application/chrome.exe, Node 22+.
// Chạy: node test-3d.mjs http://localhost:5173/artifact_FE/2026-10-26-building-3d/preview.html <thư-mục-ảnh-ra-đã-tạo-sẵn>
// In ra JSON kết quả (tooltip, bảng thông tin, tràn ngang ở 360 px, lỗi console).
// Drives headless Chrome (software WebGL) over CDP to test the 3D building mockup with real mouse events.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, outDir] = process.argv.slice(2)
const port = 9334
const sleep = ms => new Promise(r => setTimeout(r, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`,
  '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' })
let targets
for (let i = 0; i < 50 && !targets; i++) {
  await sleep(200)
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() } catch { /* not up yet */ }
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => { ws.onopen = r })
let id = 0
const pending = new Map()
const errors = []
ws.onmessage = event => {
  const msg = JSON.parse(event.data)
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) errors.push(`${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description).join(' ')}`)
  pending.get(msg.id)?.(msg)
  pending.delete(msg.id)
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async expression => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (res.result.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails))
  return res.result.result.value
}
const shot = async name => {
  const res = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(res.result.data, 'base64'))
}
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: 'mouse' })
const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y) }
const tip = () => evaluate(`(() => { const t = document.querySelector('.b3-tip'); return t.classList.contains('is-on') ? t.textContent : '' })()`)
const stage = () => evaluate(`(() => { const r = document.querySelector('.b3-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
// Sweep the stage with the mouse until the tooltip starts with the given text; returns the point.
async function findOnStage(prefix, step = 24) {
  const s = await stage()
  const room = prefix === 'Phòng'
  for (let y = s.y + (room ? s.h * 0.15 : 20); y < s.y + (room ? s.h * 0.75 : s.h - 10); y += step) {
    for (let x = s.x + (room ? s.w * 0.25 : 20); x < s.x + (room ? s.w * 0.75 : s.w - 10); x += step) {
      await mouse('mouseMoved', x, y)
      const text = await tip()
      if (text.startsWith(prefix)) return { x, y, text }
    }
  }
  return null
}
const panel = () => evaluate(`document.querySelector('.b3-panel').innerText.replace(/\\s+/g, ' ').slice(0, 260)`)
const results = {}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(4000)
const ready = await evaluate(`({ url: location.href, title: document.title, stage: !!document.querySelector('.b3-stage'), body: document.body.innerText.slice(0, 200) })`)
if (!ready.stage) throw new Error(`Preview did not render: ${JSON.stringify({ ready, errors })}`)
results.canvas = await evaluate(`(() => { const c = document.querySelector('.b3-stage canvas'); return c ? { w: c.width, h: c.height, gl: !!(c.getContext('webgl2') || c.getContext('webgl')) } : null })()`)
await evaluate(`document.querySelector('.b3-stage').scrollIntoView({ block: 'center' }); new Promise(r => setTimeout(r, 600))`)
await shot('a1-overview')

// Hover and click a building on the canvas
const building = await findOnStage('DD01')
results.hoverBuilding = building
await shot('a2-hover-building')
if (building) {
  await click(building.x, building.y)
  await sleep(1500)
  results.afterBuildingClick = await panel()
  await shot('a3-building')
  await evaluate(`[...document.querySelectorAll('.b3-floors .b3-chip')].find(b => b.textContent === 'Tầng hầm').click()`)
  await sleep(1300)
  results.basement = await evaluate(`({ pressed: [...document.querySelectorAll('.b3-floors .b3-chip')].some(b => b.textContent === 'Tầng hầm' && b.getAttribute('aria-pressed') === 'true'), roomListHidden: !document.querySelector('.b3-list'), heading: document.querySelector('.b3-main h2')?.textContent })`)
  await shot('a3-basement')
  if (!results.basement.pressed || !results.basement.roomListHidden || !results.basement.heading.includes('Gara ngầm')) throw new Error('Basement view did not open cleanly')
  await evaluate(`[...document.querySelectorAll('.b3-floors .b3-chip')].find(b => b.textContent === 'Cả tòa').click()`)
  await sleep(1200)
}

// Hover and click an available room on the canvas
const room = await findOnStage('Phòng', 18)
results.hoverRoom = room
const free = room?.text.includes('Trống') ? room : await (async () => {
  const s = await stage()
  for (let y = s.y + s.h * 0.15; y < s.y + s.h * 0.75; y += 16) for (let x = s.x + s.w * 0.25; x < s.x + s.w * 0.75; x += 16) {
    await mouse('mouseMoved', x, y)
    const text = await tip()
    if (text.includes('Trống')) return { x, y, text }
  }
  return null
})()
results.hoverFreeRoom = free
if (free) {
  await shot('a4-hover-room')
  await click(free.x, free.y)
  await sleep(450)
  await shot('a5-room-mid')
  await sleep(1600)
  await shot('a6-room-after')
  results.afterRoomClick = await panel()
}

// Floor filter via the toolbar, then an unavailable room from the list
await evaluate(`[...document.querySelectorAll('.b3-floors .b3-chip')].find(b => b.textContent === 'Tầng 3').click()`)
await sleep(1400)
await shot('a7-floor-3')
results.floorList = await evaluate(`[...document.querySelectorAll('.b3-list-row > span')].map(s => s.textContent)`)
await evaluate(`document.querySelector('.b3-list .b3-room:not(.is-available)')?.click()`)
await sleep(1200)
results.unavailablePanel = await panel()
await shot('a8-unavailable')
// Back to all buildings
await evaluate(`[...document.querySelectorAll('.b3-chip')].find(b => b.textContent.includes('Tất cả tòa')).click()`)
await sleep(1300)
results.backPanel = await panel()
await shot('a9-overview-again')
// Close-up of each building
for (let i = 0; i < 3; i++) {
  await evaluate(`document.querySelectorAll('.b3-buildings button')[${i}].click()`)
  await sleep(1500)
  await shot(`b${i + 1}-building`)
  if (i === 0) {
    for (const side of ['Bên trái', 'Mặt sau', 'Bên phải', 'Mặt trước']) {
      await evaluate(`[...document.querySelectorAll('.b3-chip')].find(b => b.textContent === '${side}').click()`)
      await sleep(1400)
      await shot(`c-side-${side.replace(/\s/g, '-')}`)
    }
  }
  await evaluate(`[...document.querySelectorAll('.b3-chip')].find(b => b.textContent.includes('Tất cả tòa')).click()`)
  await sleep(1200)
}

// Keyboard path: Tab through the building buttons in the panel and press Enter
await evaluate(`document.querySelector('.b3-buildings button').focus()`)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
await sleep(1200)
results.keyboardBuilding = await evaluate(`document.querySelector('.b3-panel .rooms-eyebrow').textContent`)

// Reduced motion: selecting a room still works
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await evaluate(`document.querySelector('.b3-list .b3-room.is-available').click()`)
await sleep(400)
results.reducedPanel = await panel()
await send('Emulation.setEmulatedMedia', { features: [] })

// Mobile 360
await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url })
await sleep(4000)
const overflowCheck = `({ layout: document.documentElement.scrollWidth - document.documentElement.clientWidth, scale: visualViewport.scale, wide: [...document.querySelectorAll('.b3-page *')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !el.closest('.b3-floors')).map(el => el.className || el.tagName).slice(0, 6) })`
results.mobileOverflow = await evaluate(overflowCheck)
await evaluate(`document.querySelector('.b3-stage').scrollIntoView({ block: 'start' }); new Promise(r => setTimeout(r, 600))`)
await shot('m1-overview')
await evaluate(`document.querySelector('.b3-buildings button').click()`)
await sleep(1500)
await evaluate(`document.querySelector('.b3-list .b3-room.is-available').click()`)
await sleep(2000)
await shot('m2-room-stage')
await evaluate(`document.querySelector('.b3-panel').scrollIntoView({ block: 'start' }); new Promise(r => setTimeout(r, 600))`)
await shot('m3-room-panel')
results.mobileOverflowAfter = await evaluate(overflowCheck)

results.errors = errors
console.log(JSON.stringify(results, null, 2))
ws.close()
chrome.kill()
