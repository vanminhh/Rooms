import { createRequire } from 'node:module'
import { draftFirst, loadModule, mount, fakeFetch, dispatch } from '../p2/public-dom.mjs'
export * from '../p2/public-dom.mjs'

const require = createRequire(import.meta.url)
export const React = require('react')
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
const { createMemoryRouter, RouterProvider } = require('react-router')
export const source = path => loadModule(draftFirst(`src/${path}`))
const { AuthContext } = source('app/auth-context.ts')
const { BuildingSelectionContext } = source('features/buildings/building-selection.ts')
const { I18nProvider } = source('shared/i18n/index.ts')

export async function mountContractPage(Page, { path = '/ql/hop-dong', routePath = path, state, props = {}, rules = [], role = 'MANAGER', language = 'vi', selection = 2, user, seed } = {}) {
  const calls = fakeFetch(rules)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  seed?.(client)
  const router = createMemoryRouter([{ path: routePath, element: React.createElement(Page, props) }, { path: '*', element: React.createElement('p', null, 'Navigation target') }], { initialEntries: [{ pathname: path, state }] })
  let selected = selection
  let locale = language
  let auth = { status: 'ready', user: user ?? { id: 12, role, fullName: 'Test account', buildings: [{ id: 2, code: 'B2', name: 'Building 2' }] }, retry() {}, refreshMe: async () => null }
  const tree = selectedBuildingId => React.createElement(QueryClientProvider, { client },
    React.createElement(AuthContext.Provider, { value: auth },
      React.createElement(BuildingSelectionContext.Provider, { value: { selectedBuildingId, setSelectedBuildingId() {} } },
        React.createElement(I18nProvider, { locale }, React.createElement(RouterProvider, { router })),
      ),
    ),
  )
  const app = await mount(tree(selection))
  return { ...app, calls, client, router,
    setSelection: next => { selected = next; return app.rerender(tree(selected)) },
    setUser: next => { auth = { ...auth, user: next }; return app.rerender(tree(selected)) },
    setLanguage: next => { locale = next; return app.rerender(tree(selected)) },
    stop: async () => { await app.stop(); client.clear(); router.dispose() } }
}

export function selectOption(container, element, value) {
  element.type = 'select-one'
  element.value = String(value)
  dispatch(container, element, 'change')
}

export const summaryFixture = (changes = {}) => ({
  id: 31, code: 'HD000031', status: 'HOLD', startDate: '2027-01-31', endDate: '2027-04-29', termMonths: 3,
  rent: 2_500_000, deposit: 2_500_000, createdAt: '2026-11-20T08:00:00Z',
  room: { id: 8, code: 'P101' }, building: { id: 2, code: 'B2', name: 'Building 2' },
  tenant: { id: 15, fullName: 'Test signer', phone: '0900000991', email: 'signer@example.test' }, ...changes,
})

export const detailFixture = (changes = {}) => ({ ...summaryFixture(), terms: null, signedAt: '2026-11-20T08:00:00Z', movedInAt: null,
  progress: { elapsedDays: 0, totalDays: 89, percent: 0 },
  occupants: [{ id: 51, fullName: 'Test signer', phone: '0900000991', dateOfBirth: null, isSigner: true, idNumberLast4: '6789', moveInDate: '2027-01-31', moveOutDate: null }],
  vehicles: [], services: [], depositInvoice: { id: 82, status: 'UNPAID', total: 2_500_000, issueDate: '2026-11-20', dueDate: '2026-11-22',
    vietqr: { bankBin: '970422', accountNo: 'test-account', accountName: 'TEST', amount: 2_500_000, content: 'TT82' }, qrImageUrl: 'https://example.test/qr.png' }, ...changes,
})

export function formFor(container, name) { return findInForm(container, node => node.name === name) }
function findInForm(container, predicate) {
  const walk = node => [node, ...node.childNodes.flatMap(walk)]
  return walk(container).find(node => node.tagName === 'FORM' && walk(node).some(predicate))
}
