import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { draftFirst, loadModule } from '../draft-root.mjs'
import { mountContractPage, find as findDom } from './contracts-dom.mjs'

// Expected routes, roles and Vietnamese labels come from FE-P3-01, AUTH-05/06 and specs 14/16.
// Source runs unchanged. The JSX/kit/auth/router hooks are boundary stubs; matchRoutes,
// guardRedirect, the dictionaries and internal-link handling are the real implementations.
const { matchRoutes } = createRequire(import.meta.url)('react-router')
const jsxRuntime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' }

function compile(path, requireModule) {
  const code = ts.transpileModule(readFileSync(draftFirst(path), 'utf8'), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  Function('require', 'exports', code)(requireModule, exports)
  return exports
}

function loadRoutes() {
  const components = {}
  const stub = name => components[name] ??= () => null
  const guards = { RequireAuth: stub('RequireAuth'), GuestOnly: stub('GuestOnly') }
  const { routes } = compile('src/app/routes.tsx', id => {
    if (id === 'react/jsx-runtime') return jsxRuntime
    if (id === './RequireAuth') return guards
    if (id.startsWith('../pages/') || id.startsWith('../layouts/')) {
      const name = id.split('/').at(-1)
      return { [name]: stub(name) }
    }
    throw new Error(`Unexpected route dependency: ${id}`)
  })
  return { routes, components, guards }
}

const { guardRedirect } = loadModule(draftFirst('src/app/guards.ts'))
const { t } = loadModule(draftFirst('src/shared/i18n/core.ts'))
const routeCases = [
  ['/ql/hop-dong', 'ContractsPage', 'StaffLayout', ['MANAGER', 'BOSS']],
  ['/ql/hop-dong/moi', 'ContractCreatePage', 'StaffLayout', ['MANAGER', 'BOSS']],
  ['/ql/hop-dong/42', 'ContractDetailPage', 'StaffLayout', ['MANAGER', 'BOSS']],
  ['/ql/hop-dong/42/in', 'ContractPrintPage', 'StaffLayout', ['MANAGER', 'BOSS']],
  ['/ql/xe', 'VehiclesPage', 'StaffLayout', ['MANAGER', 'BOSS']],
  ['/thue/hop-dong', 'TenantContractsPage', 'TenantLayout', ['TENANT']],
  ['/thue/hop-dong/42', 'TenantContractDetailPage', 'TenantLayout', ['TENANT']],
  ['/thue/hop-dong/42/in', 'TenantContractPrintPage', 'TenantLayout', ['TENANT']],
]

for (const [path, page, layout, roles] of routeCases) {
  test(`FE-P3-01/AUTH-05/06: ${path} matches its page inside the correct role guard and layout`, () => {
    const { routes, components, guards } = loadRoutes()
    const matches = matchRoutes(routes, path)
    assert.ok(matches, path)
    assert.equal(matches.at(-1).route.element.type, components[page])
    assert.ok(matches.some(match => match.route.element?.type === components[layout]))
    const gate = matches.filter(match => match.route.element?.type === guards.RequireAuth)
    assert.equal(gate.length, 1, 'The page must inherit the role guard, including its direct print URL')
    assert.deepEqual(gate[0].route.element.props.allow, roles)

    const location = { pathname: path, search: '?from=menu' }
    const allow = gate[0].route.element.props.allow
    assert.equal(guardRedirect(null, location, allow), `/dang-nhap?loi-vao=${path.startsWith('/ql') ? 'quan-ly' : 'thue'}&next=${encodeURIComponent(path + location.search)}`)
    for (const role of ['BOSS', 'MANAGER', 'TENANT', 'GUEST']) {
      const home = role === 'TENANT' ? '/thue' : role === 'GUEST' ? '/toi' : '/ql'
      assert.equal(guardRedirect({ role, mustChangePassword: false }, location, allow), roles.includes(role) ? null : home, role)
      assert.equal(guardRedirect({ role, mustChangePassword: true }, location, allow), '/doi-mat-khau', `Forced password: ${role}`)
    }
  })
}

function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (node == null || node === false) return []
  return [node, ...(typeof node === 'object' ? flatten(node.props?.children) : [])]
}
const find = (root, predicate) => flatten(root).find(node => node && typeof node === 'object' && predicate(node))
const textOf = root => flatten(root).filter(node => typeof node === 'string' || typeof node === 'number').join('')

function loadLayout(name, role, initialLanguage = 'vi') {
  let language = initialLanguage
  const navigations = []
  const kit = Object.fromEntries(['RoomsHeader', 'RoomsButton', 'LanguageSwitch'].map(key => [key, () => null]))
  const modules = {
    'react/jsx-runtime': jsxRuntime,
    'react-router': { Outlet: () => null, useNavigate: () => value => navigations.push(value) },
    '../components': kit,
    '../app/auth-context': { useAuth: () => ({ user: { role } }) },
    '../features/auth/useSignOut': { useSignOut: () => ({ signOut() {}, signingOut: false }) },
    '../features/buildings/BuildingSelector': { BuildingSelector: () => null },
    '../features/buildings/BuildingSelectionProvider': { BuildingSelectionProvider: () => null },
    '../shared/i18n': {
      I18nProvider: () => null,
      useI18n: () => ({ lang: language, t: (key, params) => t(key, params, language), setLang: next => { language = next } }),
    },
    './internal-links': loadModule(draftFirst('src/layouts/internal-links.ts')),
    './layouts.css': {},
  }
  const source = compile(`src/layouts/${name}.tsx`, id => {
    if (id in modules) return modules[id]
    throw new Error(`Unexpected layout dependency: ${id}`)
  })
  const render = () => source[name]()
  const header = root => find(root, node => node.type === kit.RoomsHeader)
  return { render, header, kit, navigations }
}

test('FE-P3-01/LOC-01: both staff roles see contract and plate lookup links in Vietnamese', () => {
  for (const role of ['MANAGER', 'BOSS']) {
    const app = loadLayout('StaffLayout', role, 'en')
    const root = app.render()
    assert.equal(root.props.lang, 'vi')
    assert.equal(root.props.className, 'rooms-theme layout-staff')
    const links = app.header(root).props.links
    assert.deepEqual(links.filter(link => ['/ql/hop-dong', '/ql/xe'].includes(link.href)), [
      { label: 'Hợp đồng', href: '/ql/hop-dong' },
      { label: 'Tra cứu xe', href: '/ql/xe' },
    ])
    assert.equal(links.some(link => link.href === '/ql/nhan-su'), role === 'BOSS')
    assert.equal(links.some(link => link.href === '/ql/duyet-gia'), role === 'BOSS')
  }
})

test('FE-P3-01/LOC-01/UI-12: tenant contract menu changes immediately between Vietnamese and English', () => {
  const app = loadLayout('TenantLayout', 'TENANT')
  const first = app.render()
  assert.equal(first.props.className, 'rooms-theme')
  assert.deepEqual(app.header(first).props.links.find(link => link.href === '/thue/hop-dong'), { label: 'Hợp đồng', href: '/thue/hop-dong' })
  const switcher = find(app.header(first).props.action, node => node.type === app.kit.LanguageSwitch)
  switcher.props.onChange('en')
  const second = app.render()
  assert.deepEqual(app.header(second).props.links.find(link => link.href === '/thue/hop-dong'), { label: 'Contracts', href: '/thue/hop-dong' })
  assert.equal(find(app.header(second).props.action, node => node.type === app.kit.LanguageSwitch).props.value, 'en')
})

test('FE-P3-01/UI-08: new menu links navigate within the SPA without dropping the target', () => {
  for (const [layout, role, href] of [['StaffLayout', 'MANAGER', '/ql/hop-dong'], ['StaffLayout', 'BOSS', '/ql/xe'], ['TenantLayout', 'TENANT', '/thue/hop-dong']]) {
    const app = loadLayout(layout, role)
    const anchor = { hasAttribute: () => false, getAttribute: key => key === 'href' ? href : null }
    let prevented = 0
    app.render().props.onClick({
      defaultPrevented: false, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      target: { closest: () => anchor }, currentTarget: { contains: () => true }, preventDefault: () => { prevented++ },
    })
    assert.equal(prevented, 1)
    assert.deepEqual(app.navigations, [href])
  }
})

const labels = loadModule(draftFirst('src/shared/status-labels.ts'))
const contractLabels = { HOLD: 'Giữ chỗ', ACTIVE: 'Đang hiệu lực', ENDED: 'Đã kết thúc', CANCELLED: 'Đã hủy' }
const invoiceLabels = { DRAFT: 'Nháp', UNPAID: 'Chưa thanh toán', PAID: 'Đã thanh toán', SETTLED: 'Đã quyết toán', CANCELLED: 'Đã hủy' }

test('FE-P3-01/UI-02/CON: contract labels match spec 14 and have kit tones plus tenant translations', () => {
  assert.deepEqual(labels.contractStatusLabels, contractLabels)
  assert.deepEqual(labels.contractStatusTones, { HOLD: 'reserved', ACTIVE: 'occupied', ENDED: 'maintenance', CANCELLED: 'maintenance' })
  const english = { HOLD: 'On hold', ACTIVE: 'In effect', ENDED: 'Ended', CANCELLED: 'Cancelled' }
  for (const [status, text] of Object.entries(contractLabels)) {
    assert.equal(t(`contract.status.${status}`, undefined, 'vi'), text)
    assert.equal(t(`contract.status.${status}`, undefined, 'en'), english[status])
  }
})

test('FE-P3-01/UI-02/BIL: five invoice statuses match spec 16; overdue is a separate display label', () => {
  assert.deepEqual(labels.invoiceStatusLabels, invoiceLabels)
  assert.deepEqual(labels.invoiceStatusTones, { DRAFT: 'maintenance', UNPAID: 'reserved', PAID: 'available', SETTLED: 'occupied', CANCELLED: 'maintenance' })
  assert.equal('OVERDUE' in labels.invoiceStatusLabels || 'overdue' in labels.invoiceStatusLabels, false)
  assert.deepEqual(labels.derivedInvoiceLabels, { overdue: 'Quá hạn' })
  assert.deepEqual(labels.derivedInvoiceTones, { overdue: 'reserved' })
  const english = { DRAFT: 'Draft', UNPAID: 'Unpaid', PAID: 'Paid', SETTLED: 'Settled', CANCELLED: 'Cancelled' }
  for (const [status, text] of Object.entries(invoiceLabels)) {
    assert.equal(t(`invoice.status.${status}`, undefined, 'vi'), text)
    assert.equal(t(`invoice.status.${status}`, undefined, 'en'), english[status])
  }
  assert.equal(t('invoice.status.overdue', undefined, 'vi'), 'Quá hạn')
  assert.equal(t('invoice.status.overdue', undefined, 'en'), 'Overdue')
})

test('FE-P3-01/KIT-01: graduated staff screens retain their kit heading during real query loading', async () => {
  for (const [name, path, routePath, heading] of [
    ['ContractsPage', '/ql/hop-dong', '/ql/hop-dong', 'Hợp đồng'],
    ['ContractCreatePage', '/ql/hop-dong/moi', '/ql/hop-dong/moi', 'Tạo hợp đồng'],
    ['ContractDetailPage', '/ql/hop-dong/31', '/ql/hop-dong/:id', 'Chi tiết hợp đồng'],
    ['ContractPrintPage', '/ql/hop-dong/31/in', '/ql/hop-dong/:id/in', 'In hợp đồng'],
    ['VehiclesPage', '/ql/xe', '/ql/xe', 'Tra cứu xe'],
  ]) {
    const page = loadModule(draftFirst(`src/pages/staff/${name}.tsx`))
    const app = await mountContractPage(page[name], { path, routePath, rules: [{ prefix: '/', handler: () => new Promise(() => {}) }] })
    try { assert.ok(findDom(app.container, node => node.tagName === 'H2' && node.textContent === heading).length, name) }
    finally { await app.stop() }
  }
})

test('FE-P3-01/LOC-01/UI-12: real tenant screens translate kit titles in Vietnamese and English', async () => {
  for (const [name, path, routePath, viTitle, enTitle] of [
    ['TenantContractsPage', '/thue/hop-dong', '/thue/hop-dong', 'Hợp đồng', 'Contracts'],
    ['TenantContractDetailPage', '/thue/hop-dong/31', '/thue/hop-dong/:id', 'Chi tiết hợp đồng', 'Contract details'],
    ['TenantContractPrintPage', '/thue/hop-dong/31/in', '/thue/hop-dong/:id/in', 'In hợp đồng', 'Print contract'],
  ]) for (const [language, title] of [['vi', viTitle], ['en', enTitle]]) {
    const page = loadModule(draftFirst(`src/pages/tenant/${name}.tsx`))
    const app = await mountContractPage(page[name], { path, routePath, role: 'TENANT', language, rules: [{ prefix: '/', handler: () => new Promise(() => {}) }] })
    try { assert.ok(findDom(app.container, node => node.tagName === 'H2' && node.textContent === title).length, `${name}:${language}`) }
    finally { await app.stop() }
  }
})
