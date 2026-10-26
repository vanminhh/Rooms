// Kiểm tra mockup trang chủ bằng Chrome headless (WebGL phần mềm) và chuột thật qua CDP; chụp màn hình vào thư mục ra.
// Cần: dev server đang chạy (cd Source/frontend && npm run dev), Chrome ở C:/Program Files/Google/Chrome/Application/chrome.exe, Node 22+.
// Chạy: node test-home.mjs http://localhost:5173/artifact_FE/2026-10-26-home-3d/preview.html <thư-mục-ảnh-ra-đã-tạo-sẵn>
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, outDir] = process.argv.slice(2)
const port = 9335
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
const shot = async name => writeFileSync(join(outDir, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: 'mouse' })
const viewport = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
const load = async () => { await send('Page.navigate', { url }); await sleep(4000) }
const scrollTo = selector => evaluate(`document.querySelector('${selector}').scrollIntoView({ block: 'start' }); new Promise(r => setTimeout(r, 900))`)
const results = {}

await send('Page.enable')
await send('Runtime.enable')

// Desktop at the width of the reference screenshot
await viewport(1586, 990)
await load()
await shot('d1-hero')
results.hero = await evaluate(`(() => {
  const cs = s => getComputedStyle(document.querySelector(s))
  const primary = cs('.home-actions .rooms-button--primary'), outline = cs('.home-actions .rooms-button--outline')
  return {
    h1: document.querySelector('.home-hero h1').innerText, h1Size: cs('.home-hero h1').fontSize, lead: document.querySelector('.home-lead').innerText,
    nav: [...document.querySelectorAll('.rooms-nav a')].map(a => a.textContent + ' → ' + a.getAttribute('href')),
    login: document.querySelector('.rooms-header-action a').textContent,
    primary: { color: primary.color, background: primary.backgroundColor, radius: primary.borderRadius, height: primary.height },
    outline: { color: outline.color, radius: outline.borderRadius },
    mask: cs('.home-hero-photo').maskImage || cs('.home-hero-photo').webkitMaskImage,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }
})()`)
await scrollTo('.home-why')
await shot('d2-why')
results.why = await evaluate(`({ title: document.querySelector('.home-why h2').innerText, items: [...document.querySelectorAll('.home-why-list li')].map(li => li.innerText.replace(/\\s+/g, ' ')), icons: document.querySelectorAll('.home-why-icon svg').length })`)

// Hero button scrolls to the 3D picker, and the picker works inside the page
await evaluate('window.scrollTo(0, 0); new Promise(r => setTimeout(r, 400))')
await evaluate(`document.querySelector('.home-actions .rooms-button--primary').click(); new Promise(r => setTimeout(r, 800))`)
results.afterHeroButton = await evaluate(`({ pickerTop: Math.round(document.querySelector('#chon-phong').getBoundingClientRect().top), hash: location.hash })`)
await evaluate(`document.querySelector('.b3-stage').scrollIntoView({ block: 'center' }); new Promise(r => setTimeout(r, 700))`)
await shot('d3-picker')
await evaluate(`document.querySelectorAll('.b3-buildings button')[0].click(); new Promise(r => setTimeout(r, 1600))`)
await shot('d4-building')
const rect = await evaluate(`(() => { const r = document.querySelector('.b3-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
let found = null
for (let y = rect.y + 20; y < rect.y + rect.h - 10 && !found; y += 16) {
  for (let x = rect.x + 20; x < rect.x + rect.w - 10; x += 16) {
    await mouse('mouseMoved', x, y)
    const text = await evaluate(`(() => { const t = document.querySelector('.b3-tip'); return t.classList.contains('is-on') ? t.textContent : '' })()`)
    if (text.includes('Trống')) { found = { x, y, text }; break }
  }
}
results.hoverRoom = found
if (found) {
  await mouse('mousePressed', found.x, found.y)
  await mouse('mouseReleased', found.x, found.y)
  await sleep(2200)
  await shot('d5-room')
  results.roomPanel = await evaluate(`document.querySelector('.b3-panel').innerText.replace(/\\s+/g, ' ').slice(0, 200)`)
}
// Sections under the picker
const text = selector => `document.querySelector('${selector}').innerText.replace(/\\s+/g, ' ')`
await scrollTo('#phong-trong')
await sleep(2500)
await shot('d6-rooms')
results.roomList = await evaluate(`({
  tabs: [...document.querySelectorAll('.home-tab')].map(b => b.textContent),
  cards: [...document.querySelectorAll('.home-room')].map(c => c.querySelector('h3').textContent + ' | ' + c.querySelector('.home-room-price').textContent + ' | ' + c.querySelector('.home-room-tag').textContent),
  imagesLoaded: [...document.querySelectorAll('.home-room img')].map(i => i.complete && i.naturalWidth > 0),
})`)
await evaluate(`[...document.querySelectorAll('.home-tab')].find(b => b.textContent.startsWith('Ba Đình')).click(); new Promise(r => setTimeout(r, 600))`)
results.tabBaDinh = await evaluate(`({ pressed: document.querySelector('.home-tab[aria-pressed=true]').textContent, cards: [...document.querySelectorAll('.home-room h3')].map(h => h.textContent) })`)
await evaluate(`document.querySelector('.home-tab').click(); new Promise(r => setTimeout(r, 400))`)
await evaluate(`document.querySelector('.home-room-cta').click(); new Promise(r => setTimeout(r, 2500))`)
results.openRoom = await evaluate(`({ pickerTop: Math.round(document.querySelector('#chon-phong').getBoundingClientRect().top), panel: ${text('.b3-panel')}.slice(0, 150) })`)
await shot('d7-open-room')
await scrollTo('#khu-vuc')
await sleep(2500)
await shot('d8-areas')
results.areas = await evaluate(`[...document.querySelectorAll('.home-area')].map(a => a.querySelector('h3').innerText.replace(/\\s+/g, ' ') + ' | ' + a.querySelector('.home-area-foot').innerText.replace(/\\s+/g, ' ') + ' | img ' + (a.querySelector('img').complete && a.querySelector('img').naturalWidth > 0))`)
await evaluate(`document.querySelectorAll('.home-area-open')[1].click(); new Promise(r => setTimeout(r, 2200))`)
results.openArea = await evaluate(`document.querySelector('.b3-panel .rooms-eyebrow').textContent`)
await scrollTo('#quy-trinh')
await sleep(1200)
await shot('d9-steps')
await scrollTo('[aria-labelledby=home-reviews-title]')
await sleep(1200)
await shot('d10-reviews')
await scrollTo('#dang-ky')
await sleep(1000)
await shot('d11-cta')
results.form = await evaluate(`(async () => {
  const set = (el, v) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }
  const form = document.querySelector('.home-form'); const wait = () => new Promise(r => setTimeout(r, 150))
  form.requestSubmit(); await wait()
  const empty = [...form.querySelectorAll('.home-error')].map(e => e.textContent)
  set(form.elements['name'], 'Nguyễn An'); set(form.elements['phone'], '12345'); form.requestSubmit(); await wait()
  const badPhone = [...form.querySelectorAll('.home-error')].map(e => e.textContent)
  set(form.elements['phone'], '0912 345 678'); set(form.elements['building'], 'DD01'); form.requestSubmit(); await wait()
  return { empty, badPhone, note: form.querySelector('.home-form-note').textContent, errorsLeft: form.querySelectorAll('.home-error').length, labels: [...form.querySelectorAll('input, select')].map(el => !!el.closest('label')?.querySelector('.home-sr')) }
})()`)
await scrollTo('#lien-he')
await shot('d12-footer')
results.footer = await evaluate(`({ columns: [...document.querySelectorAll('.home-footer h2')].map(h => h.textContent), contact: ${text('.home-footer-contact')}, year: ${text('.home-footer-bottom')}.slice(0, 40) })`)

// Mobile 360
await viewport(360, 780, true)
await load()
results.mobile = await evaluate(`({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: [...document.querySelectorAll('.home *')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !el.closest('.b3-floors')).map(el => el.className || el.tagName).slice(0, 6) })`)
await shot('m1-top')
await evaluate(`window.scrollTo(0, document.querySelector('.home-hero-copy').getBoundingClientRect().top + scrollY + 160); new Promise(r => setTimeout(r, 700))`)
await shot('m2-hero')
await scrollTo('.home-why')
await shot('m3-why')
await evaluate(`document.querySelector('.b3-stage').scrollIntoView({ block: 'start' }); new Promise(r => setTimeout(r, 700))`)
await shot('m4-picker')
for (const [name, selector] of [['m5-rooms', '#phong-trong'], ['m6-areas', '#khu-vuc'], ['m7-steps', '#quy-trinh'], ['m8-cta', '#dang-ky'], ['m9-footer', '.home-footer']]) {
  await scrollTo(selector)
  await sleep(1800)
  await shot(name)
}
results.mobileAfter = await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`)

results.errors = errors
console.log(JSON.stringify(results, null, 2))
ws.close()
chrome.kill()
