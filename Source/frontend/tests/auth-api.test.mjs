import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

// Only the outside edge is replaced: globalThis.fetch is a fake that records calls and replays canned responses.
// api.ts, form-errors.ts and features/auth/api.ts are transpiled and run unmodified (fresh module state per load).
function compile(path, requireModule) {
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  Function('require', 'exports', code)(requireModule, exports)
  return exports
}

function load() {
  const api = compile('../src/shared/api.ts', () => { throw new Error('api.ts must not import anything') })
  const formErrors = compile('../src/shared/form-errors.ts', id => {
    if (id === './api') return api
    throw new Error(`unexpected import ${id}`)
  })
  const authApi = compile('../src/features/auth/api.ts', id => {
    if (id === '../../shared/api') return api
    throw new Error(`unexpected import ${id}`)
  })
  return { api, formErrors, authApi }
}

const json = (status, body) => ({ status, body })
const ok = data => json(200, { data })
const fail = (status, code, message, fields) => json(status, { error: { code, message, ...(fields ? { fields } : {}) } })

// handler(call) returns { status, body } | { html, status } | throws; calls are recorded in `calls`.
function fakeFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url,
      method: init.method,
      headers: init.headers ?? {},
      body: init.body,
      credentials: init.credentials,
    }
    calls.push(call)
    const result = await handler(call, calls)
    if (result.html !== undefined) return new Response(result.html, { status: result.status, headers: { 'Content-Type': 'text/html' } })
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } })
  }
  return calls
}

const GENERIC = 'Có lỗi xảy ra, vui lòng thử lại sau'
const bearer = call => call.headers.Authorization
const refreshCalls = calls => calls.filter(c => c.url === '/api/v1/auth/refresh')

test('API-02: 200 returns json.data, null data stays null', async () => {
  const { api } = load()
  fakeFetch(() => ok({ x: 1 }))
  assert.deepEqual(await api.apiRequest('/thing'), { x: 1 })
  fakeFetch(() => ok(null))
  assert.equal(await api.apiRequest('/thing'), null)
})

test('API-01: request goes to /api/v1 + path, default GET, Accept json, credentials include, no body means no Content-Type', async () => {
  const { api } = load()
  const calls = fakeFetch(() => ok(1))
  await api.apiRequest('/auth/me')
  assert.equal(calls[0].url, '/api/v1/auth/me')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].credentials, 'include')
  assert.equal(calls[0].headers.Accept, 'application/json')
  assert.equal(calls[0].headers['Content-Type'], undefined)
  assert.equal(calls[0].body, undefined)
  assert.equal(api.API_BASE, '/api/v1')
})

test('API-03: 401 error body becomes ApiError with code, message, status', async () => {
  const { api } = load()
  fakeFetch(() => fail(401, 'INVALID_CREDENTIALS', 'Số điện thoại hoặc mật khẩu không đúng'))
  await assert.rejects(api.apiRequest('/auth/login', { method: 'POST', body: {} }), error => {
    assert.ok(error instanceof Error)
    assert.ok(error instanceof api.ApiError)
    assert.equal(error.code, 'INVALID_CREDENTIALS')
    assert.equal(error.message, 'Số điện thoại hoặc mật khẩu không đúng')
    assert.equal(error.status, 401)
    assert.equal(error.fields, undefined)
    return true
  })
})

test('API-03: 400 keeps error.fields untouched', async () => {
  const { api } = load()
  fakeFetch(() => fail(400, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ', { phone: 'Số điện thoại không hợp lệ' }))
  await assert.rejects(api.apiRequest('/auth/login', { method: 'POST', body: {} }), error => {
    assert.equal(error.status, 400)
    assert.equal(error.code, 'VALIDATION_FAILED')
    assert.deepEqual(error.fields, { phone: 'Số điện thoại không hợp lệ' })
    return true
  })
})

test('API-03: 429 and 403 ACCOUNT_LOCKED keep API code and message', async () => {
  const { api } = load()
  fakeFetch(() => fail(429, 'TOO_MANY_REQUESTS', 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau'))
  await assert.rejects(api.apiRequest('/auth/login', { method: 'POST', body: {} }), e => e.status === 429 && e.code === 'TOO_MANY_REQUESTS')
  fakeFetch(() => fail(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa. Liên hệ quản lý.'))
  await assert.rejects(api.apiRequest('/auth/login', { method: 'POST', body: {} }), e => e.status === 403 && e.message === 'Tài khoản đã bị khóa. Liên hệ quản lý.')
})

test('A13: fetch throwing TypeError becomes NETWORK_ERROR status 0 with generic message', async () => {
  const { api } = load()
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(api.apiRequest('/auth/me'), error => {
    assert.ok(error instanceof api.ApiError)
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.equal(error.status, 0)
    assert.equal(error.message, GENERIC)
    return true
  })
})

test('A13: 502 with an HTML body becomes NETWORK_ERROR with status 502', async () => {
  const { api } = load()
  fakeFetch(() => ({ status: 502, html: '<html>Bad Gateway</html>' }))
  await assert.rejects(api.apiRequest('/auth/me'), error => {
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.equal(error.status, 502)
    assert.equal(error.message, GENERIC)
    return true
  })
})

test('A13: 200 without a data envelope is NETWORK_ERROR, not undefined data', async () => {
  const { api } = load()
  fakeFetch(() => json(200, { foo: 'bar' }))
  await assert.rejects(api.apiRequest('/auth/me'), e => e.code === 'NETWORK_ERROR' && e.status === 200)
})

test('AUTH-T1: token is sent as Bearer after setAccessToken and dropped after null', async () => {
  const { api } = load()
  const calls = fakeFetch(() => ok(1))
  await api.apiRequest('/a')
  assert.equal(bearer(calls[0]), undefined)
  api.setAccessToken('t1')
  await api.apiRequest('/b')
  assert.equal(bearer(calls[1]), 'Bearer t1')
  api.setAccessToken(null)
  await api.apiRequest('/c')
  assert.equal(bearer(calls[2]), undefined)
})

test('AUTH-T1: body is JSON-stringified with Content-Type, credentials include on POST/PATCH', async () => {
  const { api } = load()
  const calls = fakeFetch(() => ok(null))
  await api.apiRequest('/x', { method: 'POST', body: { a: 1, b: 'ư' } })
  await api.apiRequest('/x', { method: 'PATCH', body: { email: null } })
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].headers['Content-Type'], 'application/json')
  assert.equal(calls[0].body, JSON.stringify({ a: 1, b: 'ư' }))
  assert.equal(calls[0].credentials, 'include')
  assert.equal(calls[1].method, 'PATCH')
  assert.equal(calls[1].body, '{"email":null}')
})

test('AUTH-T1: the access token is never written to browser storage or cookies', async () => {
  const { api } = load()
  const touched = []
  const trap = name => new Proxy({}, { get: () => { touched.push(name); return () => null }, set: () => { touched.push(name); return true } })
  globalThis.localStorage = trap('localStorage')
  globalThis.sessionStorage = trap('sessionStorage')
  globalThis.document = trap('document')
  try {
    fakeFetch(() => ok(1))
    api.setAccessToken('secret')
    await api.apiRequest('/a')
  } finally {
    delete globalThis.localStorage
    delete globalThis.sessionStorage
    delete globalThis.document
  }
  assert.deepEqual(touched, [])
})

// Endpoint answers 401 for token t1 (expired) and data for t2; refresh yields t2.
function expiringBackend({ refresh = () => ok({ accessToken: 't2' }), endpoint } = {}) {
  return (call) => {
    if (call.url === '/api/v1/auth/refresh') return refresh(call)
    if (endpoint) return endpoint(call)
    return bearer(call) === 'Bearer t2' ? ok({ path: call.url, via: 't2' }) : fail(401, 'UNAUTHENTICATED', 'Chưa đăng nhập')
  }
}

test('AUTH-T2: 401 with Bearer refreshes exactly once, retries with the new token, returns the retry data', async () => {
  const { api } = load()
  const calls = fakeFetch(expiringBackend())
  api.setAccessToken('t1')
  const data = await api.apiRequest('/auth/me')
  assert.deepEqual(data, { path: '/api/v1/auth/me', via: 't2' })
  assert.deepEqual(calls.map(c => `${c.method} ${c.url} ${bearer(c) ?? '-'}`), [
    'GET /api/v1/auth/me Bearer t1',
    'POST /api/v1/auth/refresh -',
    'GET /api/v1/auth/me Bearer t2',
  ])
  assert.equal(calls[1].credentials, 'include')
  // new token is now stored for later requests
  await api.apiRequest('/other')
  assert.equal(bearer(calls[3]), 'Bearer t2')
})

test('AUTH-T2: a retried POST resends the same body', async () => {
  const { api } = load()
  const calls = fakeFetch(expiringBackend())
  api.setAccessToken('t1')
  await api.apiRequest('/auth/change-password', { method: 'POST', body: { currentPassword: 'a', newPassword: 'bbbbbbbb' } })
  assert.equal(calls[0].body, calls[2].body)
  assert.equal(calls[2].method, 'POST')
})

test('AUTH-T2: refresh answering 401 signs out once, clears the token, throws 401, no second attempt', async () => {
  const { api } = load()
  let signedOut = 0
  api.setAuthHandlers({ onSignedOut: () => { signedOut++ } })
  const calls = fakeFetch(expiringBackend({ refresh: () => fail(401, 'UNAUTHENTICATED', 'Chưa đăng nhập') }))
  api.setAccessToken('t1')
  await assert.rejects(api.apiRequest('/auth/me'), e => e instanceof api.ApiError && e.status === 401)
  assert.equal(signedOut, 1)
  assert.equal(refreshCalls(calls).length, 1)
  assert.equal(calls.length, 2)
  await api.apiRequest('/public/contact').catch(() => null)
  assert.equal(bearer(calls[calls.length - 1]), undefined)
})

test('AUTH-T2: retry still 401 signs out once and throws; 1 refresh, 2 endpoint calls', async () => {
  const { api } = load()
  let signedOut = 0
  api.setAuthHandlers({ onSignedOut: () => { signedOut++ } })
  const calls = fakeFetch(expiringBackend({ endpoint: () => fail(401, 'UNAUTHENTICATED', 'Chưa đăng nhập') }))
  api.setAccessToken('t1')
  await assert.rejects(api.apiRequest('/auth/me'), e => e.status === 401)
  assert.equal(signedOut, 1)
  assert.equal(refreshCalls(calls).length, 1)
  assert.equal(calls.filter(c => c.url === '/api/v1/auth/me').length, 2)
})

test('AUTH-T2: refresh failing with a network error also signs out and throws', async () => {
  const { api } = load()
  let signedOut = 0
  api.setAuthHandlers({ onSignedOut: () => { signedOut++ } })
  const calls = fakeFetch(expiringBackend({ refresh: () => fail(500, 'INTERNAL_ERROR', GENERIC) }))
  api.setAccessToken('t1')
  await assert.rejects(api.apiRequest('/auth/me'), e => e instanceof api.ApiError && e.status === 401)
  assert.equal(signedOut, 1)
  assert.equal(refreshCalls(calls).length, 1)
})

test('AUTH-T2: retry failing with a non-401 error is thrown without signing out', async () => {
  const { api } = load()
  let signedOut = 0
  api.setAuthHandlers({ onSignedOut: () => { signedOut++ } })
  fakeFetch(expiringBackend({ endpoint: call => bearer(call) === 'Bearer t2' ? fail(403, 'FORBIDDEN', 'Không có quyền') : fail(401, 'UNAUTHENTICATED', 'x') }))
  api.setAccessToken('t1')
  await assert.rejects(api.apiRequest('/auth/me'), e => e.status === 403 && e.code === 'FORBIDDEN')
  assert.equal(signedOut, 0)
})

test('AUTH-T2: 3 concurrent 401 requests trigger exactly one refresh and all succeed after retry', async () => {
  const { api } = load()
  const calls = fakeFetch(async call => {
    await new Promise(resolve => setTimeout(resolve, 5))
    return expiringBackend()(call)
  })
  api.setAccessToken('t1')
  const results = await Promise.all([api.apiRequest('/a'), api.apiRequest('/b'), api.apiRequest('/c')])
  assert.deepEqual(results.map(r => r.path), ['/api/v1/a', '/api/v1/b', '/api/v1/c'])
  assert.equal(refreshCalls(calls).length, 1)
  assert.equal(calls.filter(c => bearer(c) === 'Bearer t2').length, 3)
})

test('AUTH-T2: two parallel refreshAccessToken() calls share one fetch and one promise result', async () => {
  const { api } = load()
  const calls = fakeFetch(async () => {
    await new Promise(resolve => setTimeout(resolve, 5))
    return ok({ accessToken: 'tNew' })
  })
  const [a, b] = await Promise.all([api.refreshAccessToken(), api.refreshAccessToken()])
  assert.equal(a, 'tNew')
  assert.equal(b, 'tNew')
  assert.equal(calls.length, 1)
  // after settling, a later call starts a new refresh
  await api.refreshAccessToken()
  assert.equal(calls.length, 2)
})

test('AUTH-T2: refreshAccessToken stores the token for subsequent requests and rejects on 401', async () => {
  const { api } = load()
  let calls = fakeFetch(() => ok({ accessToken: 'tZ' }))
  assert.equal(await api.refreshAccessToken(), 'tZ')
  await api.apiRequest('/me')
  assert.equal(bearer(calls[1]), 'Bearer tZ')
  fakeFetch(() => fail(401, 'UNAUTHENTICATED', 'Chưa đăng nhập'))
  await assert.rejects(api.refreshAccessToken(), e => e.status === 401)
  // a failed refresh must not leave a stuck promise
  calls = fakeFetch(() => ok({ accessToken: 'tY' }))
  assert.equal(await api.refreshAccessToken(), 'tY')
  assert.equal(calls.length, 1)
})

test('AUTH-01: login 401 with a token set does not refresh and throws the original error', async () => {
  const { api } = load()
  let signedOut = 0
  api.setAuthHandlers({ onSignedOut: () => { signedOut++ } })
  const calls = fakeFetch(() => fail(401, 'INVALID_CREDENTIALS', 'Số điện thoại hoặc mật khẩu không đúng'))
  api.setAccessToken('t1')
  await assert.rejects(api.apiRequest('/auth/login', { method: 'POST', body: { phone: '0900000001', password: 'x', remember: false } }), e => e.code === 'INVALID_CREDENTIALS')
  assert.equal(calls.length, 1)
  assert.equal(signedOut, 0)
})

test('AUTH-01: login without a token (no Bearer) and any 401 without a token never refresh', async () => {
  const { api } = load()
  const calls = fakeFetch(() => fail(401, 'UNAUTHENTICATED', 'Chưa đăng nhập'))
  await assert.rejects(api.apiRequest('/auth/me'), e => e.status === 401)
  assert.equal(refreshCalls(calls).length, 0)
  assert.equal(calls.length, 1)
})

test('AUTH-T2: a 401 from /auth/refresh itself never recurses into another refresh', async () => {
  const { api } = load()
  const calls = fakeFetch(() => fail(401, 'UNAUTHENTICATED', 'Chưa đăng nhập'))
  api.setAccessToken('t1')
  await assert.rejects(api.refreshAccessToken(), e => e.status === 401)
  assert.equal(calls.length, 1)
})

test('AUTH-05: 403 PASSWORD_CHANGE_REQUIRED calls onPasswordChangeRequired once and still throws', async () => {
  const { api } = load()
  let called = 0
  api.setAuthHandlers({ onPasswordChangeRequired: () => { called++ } })
  fakeFetch(() => fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi tiếp tục'))
  api.setAccessToken('t1')
  await assert.rejects(api.apiRequest('/auth/me'), e => e.status === 403 && e.code === 'PASSWORD_CHANGE_REQUIRED')
  assert.equal(called, 1)
})

test('AUTH-05: other 403 codes do not call onPasswordChangeRequired', async () => {
  const { api } = load()
  let called = 0
  api.setAuthHandlers({ onPasswordChangeRequired: () => { called++ } })
  fakeFetch(() => fail(403, 'FORBIDDEN', 'Không có quyền'))
  await assert.rejects(api.apiRequest('/auth/me'), e => e.code === 'FORBIDDEN')
  assert.equal(called, 0)
})

test('API-01: auth api functions call the right method, path and body', async () => {
  const { api, authApi } = load()
  api.setAccessToken(null)
  const calls = fakeFetch(() => ok(null))
  await authApi.loginRequest({ phone: '0900000001', password: 'matkhau123', remember: true })
  await authApi.logoutRequest()
  await authApi.getMe()
  await authApi.updateMe({ email: null })
  await authApi.changePassword({ currentPassword: 'old', newPassword: 'newpassword' })
  await authApi.forgotPassword({ phone: '0900000001' })
  await authApi.resetPassword({ token: 'tok', newPassword: 'newpassword' })
  await authApi.getPublicContact()
  const summary = calls.map(c => `${c.method} ${c.url} ${c.body ?? ''}`)
  assert.deepEqual(summary, [
    'POST /api/v1/auth/login {"phone":"0900000001","password":"matkhau123","remember":true}',
    'POST /api/v1/auth/logout ',
    'GET /api/v1/auth/me ',
    'PATCH /api/v1/auth/me {"email":null}',
    'POST /api/v1/auth/change-password {"currentPassword":"old","newPassword":"newpassword"}',
    'POST /api/v1/auth/forgot-password {"phone":"0900000001"}',
    'POST /api/v1/auth/reset-password {"token":"tok","newPassword":"newpassword"}',
    'GET /api/v1/public/contact ',
  ])
})

test('API-01: updateMe sends only the given keys; extra form values (confirmPassword) are never sent', async () => {
  const { authApi } = load()
  const calls = fakeFetch(() => ok(null))
  await authApi.updateMe({ contactPhone: '0912345678', zaloUrl: null })
  assert.equal(calls[0].body, '{"contactPhone":"0912345678","zaloUrl":null}')
  await authApi.changePassword({ currentPassword: 'a', newPassword: 'bbbbbbbb', confirmPassword: 'bbbbbbbb' })
  await authApi.resetPassword({ token: 't', newPassword: 'bbbbbbbb', confirmPassword: 'bbbbbbbb' })
  assert.equal(calls[1].body, '{"currentPassword":"a","newPassword":"bbbbbbbb"}')
  assert.equal(calls[2].body, '{"token":"t","newPassword":"bbbbbbbb"}')
})

test('API-01: loginRequest returns the API data and does not store the token itself', async () => {
  const { api, authApi } = load()
  const user = { id: 1, role: 'BOSS', phone: '0900000001' }
  const calls = fakeFetch(() => ok({ accessToken: 'abc', user }))
  const result = await authApi.loginRequest({ phone: '0900000001', password: 'p', remember: false })
  assert.deepEqual(result, { accessToken: 'abc', user })
  fakeFetch(() => ok(1))
  await api.apiRequest('/x')
  assert.equal(calls.length, 1) // sanity: first fake saw only the login
  // the next request (second fake) must carry no Bearer: loginRequest did not call setAccessToken
  const next = fakeFetch(() => ok(1))
  await api.apiRequest('/y')
  assert.equal(bearer(next[0]), undefined)
})

test('API-01: getPublicContact passes through null data', async () => {
  const { authApi } = load()
  fakeFetch(() => ok(null))
  assert.equal(await authApi.getPublicContact(), null)
})

function fakeSetError() {
  const calls = []
  const setError = (name, error) => { calls.push([name, error]) }
  return { setError, calls }
}

test('UI-05: applyApiError maps a known field to setError(type server) and returns the API message', async () => {
  const { api, formErrors } = load()
  const { setError, calls } = fakeSetError()
  const error = new api.ApiError({
    code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', status: 400,
    fields: { currentPassword: 'Mật khẩu hiện tại không đúng' },
  })
  const text = formErrors.applyApiError(error, setError, ['currentPassword', 'newPassword'])
  assert.deepEqual(calls, [['currentPassword', { type: 'server', message: 'Mật khẩu hiện tại không đúng' }]])
  assert.equal(text, 'Dữ liệu không hợp lệ')
})

test('UI-05: applyApiError maps several fields', async () => {
  const { api, formErrors } = load()
  const { setError, calls } = fakeSetError()
  const error = new api.ApiError({
    code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', status: 400,
    fields: { currentPassword: 'A', newPassword: 'B' },
  })
  formErrors.applyApiError(error, setError, ['currentPassword', 'newPassword'])
  assert.deepEqual(calls.map(c => c[0]), ['currentPassword', 'newPassword'])
})

test('A15: applyApiError with a field that has no input (token) skips setError and returns that sentence', async () => {
  const { api, formErrors } = load()
  const { setError, calls } = fakeSetError()
  const sentence = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn'
  const error = new api.ApiError({ code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', status: 400, fields: { token: sentence } })
  const text = formErrors.applyApiError(error, setError, ['newPassword', 'confirmPassword'])
  assert.equal(calls.length, 0)
  assert.equal(text, sentence)
})

test('A15: unmatched sentences are joined with a space; matched fields still go to setError', async () => {
  const { api, formErrors } = load()
  const { setError, calls } = fakeSetError()
  const error = new api.ApiError({
    code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', status: 400,
    fields: { token: 'Một.', other: 'Hai.', newPassword: 'Mật khẩu tối thiểu 8 ký tự' },
  })
  const text = formErrors.applyApiError(error, setError, ['newPassword'])
  assert.equal(text, 'Một. Hai.')
  assert.deepEqual(calls, [['newPassword', { type: 'server', message: 'Mật khẩu tối thiểu 8 ký tự' }]])
})

test('UI-05: applyApiError with a non-ApiError returns the generic message and never calls setError', async () => {
  const { formErrors } = load()
  const { setError, calls } = fakeSetError()
  assert.equal(formErrors.applyApiError(new Error('x'), setError, ['a']), GENERIC)
  assert.equal(formErrors.applyApiError('boom', setError, ['a']), GENERIC)
  assert.equal(formErrors.applyApiError(null, setError, ['a']), GENERIC)
  assert.equal(calls.length, 0)
})

test('UI-05: ApiError without fields returns its message; empty message and no fields still never returns empty', async () => {
  const { api, formErrors } = load()
  const { setError } = fakeSetError()
  const withMessage = new api.ApiError({ code: 'INVALID_CREDENTIALS', message: 'Số điện thoại hoặc mật khẩu không đúng', status: 401 })
  assert.equal(formErrors.applyApiError(withMessage, setError, ['phone']), 'Số điện thoại hoặc mật khẩu không đúng')
  const empty = new api.ApiError({ code: 'X', message: '', status: 500 })
  assert.notEqual(formErrors.applyApiError(empty, setError, ['phone']), '')
  const emptyFields = new api.ApiError({ code: 'X', message: '', status: 400, fields: {} })
  assert.notEqual(formErrors.applyApiError(emptyFields, setError, ['phone']), '')
})

test('UI-05: only matched fields with an API message and fully matched fields still return error.message (never empty)', async () => {
  const { api, formErrors } = load()
  const { setError } = fakeSetError()
  const error = new api.ApiError({ code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', status: 400, fields: { phone: 'Số điện thoại không hợp lệ' } })
  assert.equal(formErrors.applyApiError(error, setError, ['phone']), 'Dữ liệu không hợp lệ')
})
