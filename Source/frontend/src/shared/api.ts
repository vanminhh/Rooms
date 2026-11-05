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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface AuthHandlers {
  onSignedOut?: () => void
  onPasswordChangeRequired?: () => void
}

export interface ListMeta {
  page: number
  limit: number
  total: number
}

export interface ListPage<T> {
  data: T[]
  meta: ListMeta
}

interface Envelope<T> {
  data: T
  meta?: ListMeta
}

// Query values for list GETs; undefined is left out of the URL.
export type QueryValue = string | number | boolean | undefined

// Lists default to page=1&limit=20 and limit is at most 100 (API-02). Invalid values fail here, before any request.
export function listPath(path: string, query: Record<string, QueryValue>): string {
  const params = new URLSearchParams({ page: '1', limit: '20' })
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const page = Number(params.get('page'))
  const limit = Number(params.get('limit'))
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Trang hoặc số dòng mỗi trang không hợp lệ')
  }
  return `${path}?${params.toString()}`
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

async function send<T>(path: string, method: Method, body: unknown, token: string | null): Promise<Envelope<T>> {
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
  const envelope: { data?: T; meta?: ListMeta; error?: { code: string; message: string; fields?: Record<string, string> } } =
    typeof json === 'object' && json !== null ? json : {}
  if (response.ok && 'data' in envelope) return { data: envelope.data as T, meta: envelope.meta }
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
      .then(({ data }) => {
        accessToken = data.accessToken
        return data.accessToken
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

async function request<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<Envelope<T>> {
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

export async function apiRequest<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  return (await request<T>(path, options)).data
}

// A list keeps its meta (page, limit, total) so the page can show pagination controls.
export async function apiRequestPage<T>(path: string): Promise<ListPage<T>> {
  const { data, meta } = await request<T[]>(path)
  if (!meta) throw new ApiError({ code: 'NETWORK_ERROR', message: GENERIC_MESSAGE, status: 200 })
  return { data, meta }
}
