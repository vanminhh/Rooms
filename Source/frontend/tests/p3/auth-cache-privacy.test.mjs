import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { React, source, mount, until, wait } from './contracts-dom.mjs'
const require = createRequire(import.meta.url)
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
const { AuthProvider } = source('app/AuthProvider.tsx')
const { AuthContext } = source('app/auth-context.ts')
const { I18nProvider } = source('shared/i18n/index.ts')
const { setAccessToken } = source('shared/api.ts')

test('SCOPE-02/03: account and scope changes clear query/mutation data before exposing the new identity and remount local secrets', async () => {
  const previousFetch = globalThis.fetch
  setAccessToken(null)
  globalThis.fetch = () => new Promise(() => {})
  // Keep unobserved seeded data until the session explicitly clears it.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  let auth, setSecret, mutation
  const snapshots = []
  function Probe() {
    auth = React.useContext(AuthContext)
    const [secret, update] = React.useState('')
    setSecret = update
    snapshots.push({ id: auth.user?.id, scope: auth.user?.buildings?.map(b => b.id), cached: client.getQueryData(['private']), secret })
    return React.createElement('p', null, `${auth.user?.id ?? 'none'}:${secret}`)
  }
  const app = await mount(React.createElement(I18nProvider, { locale: 'vi' }, React.createElement(QueryClientProvider, { client }, React.createElement(AuthProvider, null, React.createElement(Probe)))))
  try {
    const a = { id: 12, role: 'MANAGER', locale: 'vi', buildings: [{ id: 2 }, { id: 3 }] }
    auth.acceptSession({ accessToken: 'a', user: a })
    await until(() => app.container.textContent === '12:', 'account A')
    client.setQueryData(['private'], 'PRIVATE-A')
    mutation = client.getMutationCache().build(client, { mutationFn: async () => 'old' }, { status: 'success', data: 'PRIVATE-MUTATION' })
    setSecret('PASSWORD-A')
    await until(() => app.container.textContent.includes('PASSWORD-A'), 'local secret')
    assert.equal(client.getQueryData(['private']), 'PRIVATE-A', 'Private query must still exist immediately before account switch')
    assert.equal(client.getMutationCache().getAll().length, 1, 'Private mutation must still exist immediately before account switch')
    auth.acceptSession({ accessToken: 'b', user: { ...a, id: 13 } })
    await until(() => app.container.textContent === '13:', 'account B')
    assert.equal(client.getQueryCache().getAll().length, 0)
    assert.equal(client.getMutationCache().getAll().length, 0)
    assert.ok(snapshots.filter(s => s.id === 13).every(s => s.cached === undefined && s.secret === ''))
    client.setQueryData(['private'], 'BUILDING-2')
    setSecret('OLD-SCOPE')
    await wait(0)
    assert.equal(client.getQueryData(['private']), 'BUILDING-2', 'Private query must still exist immediately before scope change')
    auth.acceptSession({ accessToken: 'c', user: { ...a, id: 13, buildings: [{ id: 4 }, { id: 5 }] } })
    await until(() => app.container.textContent === '13:', 'changed building scope')
    assert.equal(client.getQueryData(['private']), undefined)
    assert.ok(snapshots.filter(s => s.scope?.includes(4)).every(s => s.cached === undefined && s.secret === ''))
  } finally { await app.stop(); mutation?.destroy(); client.clear(); setAccessToken(null); globalThis.fetch = previousFetch }
})
