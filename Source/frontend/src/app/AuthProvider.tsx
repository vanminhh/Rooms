import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getMe, loginRequest, logoutRequest } from '../features/auth/api'
import type { Me } from '../features/auth/api'
import { ApiError, refreshAccessToken, setAccessToken, setAuthHandlers } from '../shared/api'
import { AuthContext } from './auth-context'
import type { AuthContextValue, AuthStatus } from './auth-context'

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [attempt, setAttempt] = useState(0)

  const login: AuthContextValue['login'] = useCallback(async input => {
    const data = await loginRequest(input)
    setAccessToken(data.accessToken)
    setUser(data.user)
    setStatus('ready')
    return data.user
  }, [])

  const logout = useCallback(async () => {
    await logoutRequest().catch(() => null) // the local sign-out must happen even if the call fails
    setAccessToken(null)
    setUser(null)
  }, [])

  const refreshMe = useCallback(async () => {
    try {
      const me = await getMe()
      setUser(me)
      return me
    } catch (error) {
      if (!isUnauthorized(error)) throw error
      setUser(null)
      return null
    }
  }, [])

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt(n => n + 1)
  }, [])

  useEffect(() => {
    setAuthHandlers({
      onSignedOut: () => setUser(null),
      onPasswordChangeRequired: () => {
        refreshMe().catch(() => null) // the guard redirects once the flag is refreshed; no unhandled rejection
      },
    })
  }, [refreshMe])

  // StrictMode runs this twice; refreshAccessToken shares one in-flight call, so the cookie rotates once.
  useEffect(() => {
    let active = true
    async function boot() {
      try {
        await refreshAccessToken()
        const me = await getMe()
        if (active) {
          setUser(me)
          setStatus('ready')
        }
      } catch (error) {
        if (active) {
          setUser(null)
          setStatus(isUnauthorized(error) ? 'ready' : 'error')
        }
      }
    }
    void boot()
    return () => {
      active = false
    }
  }, [attempt])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout, refreshMe, retry }),
    [status, user, login, logout, refreshMe, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
