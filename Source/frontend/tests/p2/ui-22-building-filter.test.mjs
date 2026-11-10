import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test, { after } from 'node:test'
import ts from 'typescript'

function findAncestor(startDir, predicate) {
  let dir = startDir
  for (;;) {
    if (predicate(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`Không tìm thấy thư mục gốc từ ${startDir}`)
    dir = parent
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const draftRoot = findAncestor(here, dir => existsSync(join(dir, 'src')))
const mainRoot = findAncestor(here, dir => existsSync(join(dir, 'src', 'components', 'index.ts')))
const draftSrcRoot = join(draftRoot, 'src')
const mainSrcRoot = join(mainRoot, 'src')
const nodeRequire = createRequire(import.meta.url)
const moduleCache = new Map()

function resolveFile(candidate) {
  for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (existsSync(candidate + suffix)) return candidate + suffix
  }
  return existsSync(candidate) ? candidate : null
}

function resolveRelative(fromDir, id) {
  const candidate = resolve(fromDir, id)
  const draftCandidate = candidate.startsWith(mainSrcRoot) ? candidate.replace(mainSrcRoot, draftSrcRoot) : candidate
  const draftFile = resolveFile(draftCandidate)
  if (draftFile) return draftFile
  const mainCandidate = candidate.startsWith(draftSrcRoot) ? candidate.replace(draftSrcRoot, mainSrcRoot) : candidate
  const mainFile = resolveFile(mainCandidate)
  if (mainFile) return mainFile
  throw new Error(`Không thể nạp ${id} từ ${fromDir}`)
}

function compile(absPath) {
  if (moduleCache.has(absPath)) return moduleCache.get(absPath)
  const code = ts.transpileModule(readFileSync(absPath, 'utf8'), {
    fileName: absPath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const mod = { exports: {} }
  moduleCache.set(absPath, mod.exports)
  Function('require', 'exports', 'module', code)(id => {
    if (!id.startsWith('.')) return nodeRequire(id)
    if (id.endsWith('.css')) return {}
    return compile(resolveRelative(dirname(absPath), id))
  }, mod.exports, mod)
  return mod.exports
}

const publicDom = await import(pathToFileURL(join(mainRoot, 'tests', 'p2', 'public-dom.mjs')).href)
const { mount, find, buttonByText, alerts, dispatch, fakeFetch, ok, fail, pageMeta, until, wait } = publicDom
const React = nodeRequire('react')
const { QueryClient, QueryClientProvider } = nodeRequire('@tanstack/react-query')
const { createMemoryRouter, RouterProvider } = nodeRequire('react-router')
const { PublicRoomsPage } = compile(join(draftRoot, 'src', 'pages', 'public', 'PublicRoomsPage.tsx'))

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

const emptyRooms = { prefix: '/public/rooms', method: 'GET', handler: () => ok([], pageMeta([])) }
const emptyLocations = { prefix: '/public/locations', method: 'GET', handler: () => ok([]) }
const buildingDetail = { id: 3, code: 'AL', name: 'An Lâm 1', address: '', district: 'Cầu Giấy', ward: 'Dịch Vọng', waterMode: 'PER_M3', amenities: [], description: null, contact: null, rates: { electric: null, water: null, services: [] }, upcomingRates: [], rooms: [] }

async function mountRooms(buildingHandler) {
  const calls = fakeFetch([
    emptyRooms,
    emptyLocations,
    { prefix: '/public/buildings/3', method: 'GET', handler: buildingHandler },
  ])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/phong', element: React.createElement(PublicRoomsPage) }], {
    initialEntries: ['/phong?buildingId=3'],
  })
  const app = await mount(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(RouterProvider, { router })))
  return { ...app, calls }
}

test('UI-22/PUB-02: buildingId hợp lệ hiện trạng thái tải và vẫn cho phép bỏ lọc tòa', async () => {
  const app = await mountRooms(() => new Promise(() => {}))
  assert.ok(find(app.container, node => node.attributes.role === 'status' && node.textContent === 'Đang tải thông tin tòa').length === 1)
  assert.ok(buttonByText(app.container, 'Bỏ lọc tòa'))
  assert.ok(!app.container.textContent.includes('Đang lọc theo tòa'))
  await app.stop()
})

test('UI-22/UI-03: lỗi tải tòa hiện API message, Thử lại gọi refetch và sau đó hiện tên tòa', async () => {
  let failing = true
  const app = await mountRooms(() => failing ? fail(500, 'INTERNAL_ERROR', 'Không tải được thông tin tòa') : ok(buildingDetail))
  await until(() => alerts(app.container).includes('Không tải được thông tin tòaThử lại'), 'building error shown')
  assert.ok(buttonByText(app.container, 'Bỏ lọc tòa'))
  const buildingCallsBeforeRetry = app.calls.filter(call => call.url.includes('/public/buildings/3')).length

  failing = false
  dispatch(app.container, buttonByText(app.container, 'Thử lại'), 'click')
  await until(() => app.container.textContent.includes('Đang lọc theo tòa An Lâm 1'), 'building name shown after retry')
  assert.equal(app.calls.filter(call => call.url.includes('/public/buildings/3')).length, buildingCallsBeforeRetry + 1)
  assert.equal(alerts(app.container).length, 0)
  await app.stop()
})

test('UI-22/PUB-02: tải tòa thành công hiển thị tên và không có lỗi', async () => {
  const app = await mountRooms(() => ok(buildingDetail))
  await until(() => app.container.textContent.includes('Đang lọc theo tòa An Lâm 1'), 'building name shown')
  await wait(20)
  assert.equal(alerts(app.container).length, 0)
  assert.ok(buttonByText(app.container, 'Bỏ lọc tòa'))
  await app.stop()
})
