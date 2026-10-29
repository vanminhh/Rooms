export const API_BASE = '/api/v1'

const GENERIC_MESSAGE = 'Có lỗi xảy ra, vui lòng thử lại sau'

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fields?: Record<string, string>

  constructor(init: { code: string; message: string; status: number; fields?: Record<string, string> }) {
    super(init.message)
    this.code = init.code
    this.status = init.status
    this.fields = init.fields
  }
}

type Method = 'GET' | 'POST' | 'PATCH'

export interface AuthHandlers {
  onSignedOut?: () => void
  onPasswordChangeRequired?: () => void
}

// Module variables only: the access token lives in memory, never in browser storage.
let accessToken: string | null = null
let handlers: AuthHandlers = {}
let refreshing: Promise<string> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setAuthHandlers(next: AuthHandlers) {
  handlers = next
}

async function send<T>(path: string, method: Method, body: unknown, token: string | null): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(API_BASE + path, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: GENERIC_MESSAGE, status: 0 })
  }

  const json: unknown = await response.json().catch(() => null)
  const envelope: { data?: T; error?: { code: string; message: string; fields?: Record<string, string> } } =
    typeof json === 'object' && json !== null ? json : {}
  if (response.ok && 'data' in envelope) return envelope.data as T
  if (!response.ok && envelope.error) {
    const { code, message, fields } = envelope.error
    const error = new ApiError({ code, message, status: response.status, fields })
    if (error.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') handlers.onPasswordChangeRequired?.()
    throw error
  }
  throw new ApiError({ code: 'NETWORK_ERROR', message: GENERIC_MESSAGE, status: response.status })
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

function signOutAndThrow(error: unknown): never {
  accessToken = null
  handlers.onSignedOut?.()
  throw error
}

// One shared refresh: the refresh cookie rotates on every call, so a second call would invalidate the first.
export function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = send<{ accessToken: string }>('/auth/refresh', 'POST', undefined, null)
      .then(data => {
        accessToken = data.accessToken
        return data.accessToken
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

export async function apiRequest<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options
  const sentToken = accessToken
  try {
    return await send<T>(path, method, body, sentToken)
  } catch (error) {
    // A wrong-password login is a 401 too; only an expired session triggers a refresh.
    if (!isUnauthorized(error) || !sentToken || path === '/auth/login') throw error
    try {
      // Skip the refresh when another request already rotated the token while this one was in flight.
      if (accessToken === sentToken) await refreshAccessToken()
    } catch {
      signOutAndThrow(error)
    }
    try {
      return await send<T>(path, method, body, accessToken)
    } catch (retryError) {
      if (isUnauthorized(retryError)) signOutAndThrow(retryError)
      throw retryError
    }
  }
}
