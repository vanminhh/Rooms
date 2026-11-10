import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test, { after } from 'node:test'
import ts from 'typescript'

const here = dirname(fileURLToPath(import.meta.url))
const harnessPath = existsSync(join(here, 'public-dom.mjs')) ? join(here, 'public-dom.mjs') : resolve(here, '../../../../tests/p2/public-dom.mjs')
const { mount, find, until, fakeFetch, ok, fail } = await import(pathToFileURL(harnessPath).href)
const nodeRequire = createRequire(import.meta.url)

function findAncestor(start, predicate) {
  let dir = start
  for (;;) {
    if (predicate(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`Không tìm thấy thư mục gốc từ ${start}`)
    dir = parent
  }
}

const draftRoot = findAncestor(here, dir => existsSync(join(dir, 'src')))
const mainRoot = findAncestor(here, dir => existsSync(join(dir, 'src', 'components', 'index.ts')))
const draftSrc = join(draftRoot, 'src')
const mainSrc = join(mainRoot, 'src')
const cache = new Map()

function resolveFile(candidate) {
  for (const ext of ['.ts', '.tsx']) if (existsSync(candidate + ext)) return candidate + ext
  for (const suffix of ['/index.ts', '/index.tsx']) if (existsSync(candidate + suffix)) return candidate + suffix
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  return null
}

function resolveRelative(fromDir, id) {
  const candidate = resolve(fromDir, id)
  const draftCandidate = candidate.startsWith(mainSrc) ? candidate.replace(mainSrc, draftSrc) : candidate
  const draftFile = resolveFile(draftCandidate)
  if (draftFile) return draftFile
  const mainCandidate = candidate.startsWith(draftSrc) ? candidate.replace(draftSrc, mainSrc) : candidate
  const mainFile = resolveFile(mainCandidate)
  if (mainFile) return mainFile
  throw new Error(`Không thể resolve ${id} từ ${fromDir}`)
}

function compile(absPath) {
  if (cache.has(absPath)) return cache.get(absPath)
  const code = ts.transpileModule(readFileSync(absPath, 'utf8'), { fileName: absPath, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  cache.set(absPath, mod.exports)
  Function('require', 'exports', 'module', code)(id => id.startsWith('.') ? (id.endsWith('.css') ? {} : compile(resolveRelative(dirname(absPath), id))) : nodeRequire(id), mod.exports, mod)
  return mod.exports
}

const pagePath = join(draftRoot, 'src', 'pages', 'public', 'PublicBuildingPage.tsx')
const cssPath = join(draftRoot, 'src', 'features', 'public', 'public-building.css')
const { PublicBuildingPage } = compile(pagePath)

const baseBuilding = overrides => ({
  id: 7, code: 'AL1', name: 'An Lâm 1', address: '12 Láng Hạ', district: 'Đống Đa', ward: 'Láng Hạ', waterMode: 'PER_M3',
  amenities: ['Thang máy', 'Camera'], description: 'Mô tả tòa từ API.',
  contact: { phone: '0900000002', zaloUrl: 'https://zalo.me/0900000002', facebookUrl: null },
  rates: {
    electric: { kind: 'ELECTRIC', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice: 3000 }] },
    water: { kind: 'WATER', serviceId: null, serviceName: null, unit: null, effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice: 15000 }] },
    services: [],
  },
  upcomingRates: [],
  rooms: [{ id: 1, code: '201', floor: 2, areaM2: 22, price: 4200000, maxOccupants: 2, buildingId: 7, buildingCode: 'AL1', buildingName: 'An Lâm 1', district: 'Đống Đa', ward: 'Láng Hạ', imageUrl: null }],
  ...overrides,
})

async function mountPage(result) {
  const calls = fakeFetch([{ prefix: '/public/buildings/7', method: 'GET', handler: () => result }])
  const React = nodeRequire('react')
  const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
  const { createMemoryRouter, RouterProvider } = nodeRequire('react-router')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/toa/:id', element: React.createElement(PublicBuildingPage) }], { initialEntries: ['/toa/7'] })
  const app = await mount(React.createElement(QueryClientProvider, { client }, React.createElement(RouterProvider, { router })))
  return { ...app, calls }
}

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

test('UI-25 · BLD-04/PUB-03: trang tòa dùng dữ liệu API cho thông tin, đơn giá, liên hệ và phòng', async () => {
  const app = await mountPage(ok(baseBuilding()))
  await until(() => app.container.textContent.includes('An Lâm 1'), 'tòa tải xong')
  const text = app.container.textContent
  assert.ok(text.includes('Tòa AL1'))
  assert.ok(text.includes('12 Láng Hạ, Láng Hạ, Đống Đa'))
  assert.ok(text.includes('Theo đồng hồ từng phòng'))
  assert.ok(text.includes('Mô tả tòa từ API.'))
  assert.ok(text.includes('Thang máy') && text.includes('Camera'))
  assert.ok(text.includes('Điện · từ 1 kWh') && text.includes('3.000 đ / kWh'))
  assert.ok(find(app.container, node => node.tagName === 'A' && node.getAttribute('href') === 'tel:0900000002').length === 1)
  assert.ok(find(app.container, node => node.tagName === 'A' && node.getAttribute('href') === '/phong/1').length === 1)
  assert.equal(app.calls.length, 1)
  await app.stop()
})

test('UI-25 · BLD-04: không có contact thì không dựng thẻ liên hệ rỗng', async () => {
  const app = await mountPage(ok(baseBuilding({ contact: null })))
  await until(() => app.container.textContent.includes('Còn trống tại tòa'), 'tòa tải xong')
  assert.equal(find(app.container, node => node.getAttribute('aria-label') === 'Liên hệ tòa nhà').length, 0)
  assert.equal(find(app.container, node => node.tagName === 'A' && (node.getAttribute('href') ?? '').startsWith('tel:')).length, 0)
  await app.stop()
})

test('UI-25 · PUB-02: tòa không công khai trả 404 và giữ đúng trang không tìm thấy', async () => {
  const app = await mountPage(fail(404, 'NOT_FOUND', 'Không tìm thấy'))
  await until(() => app.container.textContent.includes('Không tìm thấy trang'), '404')
  assert.equal(app.calls.length, 1)
  await app.stop()
})

test('UI-25 · KIT-05: CSS có lưới desktop, thu một cột và tránh tràn ở 360 px', () => {
  const css = readFileSync(cssPath, 'utf8')
  assert.match(css, /\.public-building-panels\s*\{[^}]*display:\s*grid/)
  assert.match(css, /@media \(min-width: 880px\)/)
  assert.match(css, /@media \(max-width: 480px\)/)
  assert.match(css, /min-width:\s*0/)
  assert.match(css, /overflow-wrap:\s*anywhere/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
})
