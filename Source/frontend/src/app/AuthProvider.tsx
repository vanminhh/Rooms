import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getMe, loginRequest, logoutRequest, updateMe } from '../features/auth/api'
import type { Me } from '../features/auth/api'
import { ApiError, refreshAccessToken, setAccessToken, setAuthHandlers } from '../shared/api'
import { savedLang, useI18n } from '../shared/i18n'
import { AuthContext, authScopeKey } from './auth-context'
import type { AuthContextValue, AuthStatus } from './auth-context'

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [attempt, setAttempt] = useState(0)
  const queryClient = useQueryClient()
  const identity = useRef(authScopeKey(null))
  const replaceUser = useCallback((next: Me | null) => {
    const scope = authScopeKey(next)
    if (identity.current !== scope) {
      identity.current = scope
      // Clear before exposing the next identity, including its first render.
      queryClient.clear()
    }
    setUser(next)
  }, [queryClient])
  const { lang, setLang } = useI18n()
  const lastLocaleSync = useRef('')

  useEffect(() => {
    if (!user) {
      lastLocaleSync.current = ''
      return
    }
    const browserChoice = savedLang()
    if (!browserChoice) {
      const accountChoice = user.locale === 'en' ? 'en' : 'vi'
      if (lang !== accountChoice) setLang(accountChoice)
      return
    }
    if (browserChoice === user.locale) {
      lastLocaleSync.current = ''
      return
    }
    const syncKey = `${user.id}:${user.locale}:${browserChoice}`
    if (lastLocaleSync.current === syncKey) return
    lastLocaleSync.current = syncKey
    void updateMe({ locale: browserChoice })
      .then(me => setUser(current => current?.id === me.id ? { ...current, locale: me.locale } : current))
      .catch(error => console.error('Unable to save language preference', error))
  }, [user, lang, setLang])

  const login: AuthContextValue['login'] = useCallback(async input => {
    const data = await loginRequest(input)
    setAccessToken(data.accessToken)
    replaceUser(data.user)
    setStatus('ready')
    return data.user
  }, [replaceUser])

  const acceptSession: AuthContextValue['acceptSession'] = useCallback(data => {
    setAccessToken(data.accessToken)
    replaceUser(data.user)
    setStatus('ready')
    return data.user
  }, [replaceUser])

  const logout = useCallback(async () => {
    await logoutRequest().catch(() => null) // the local sign-out must happen even if the call fails
    setAccessToken(null)
    replaceUser(null)
  }, [replaceUser])

  const refreshMe = useCallback(async () => {
    try {
      const me = await getMe()
      replaceUser(me)
      return me
    } catch (error) {
      if (!isUnauthorized(error)) throw error
      replaceUser(null)
      return null
    }
  }, [replaceUser])

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt(n => n + 1)
  }, [])

  useEffect(() => {
    setAuthHandlers({
      onSignedOut: () => replaceUser(null),
      onPasswordChangeRequired: () => {
        refreshMe().catch(() => null) // the guard redirects once the flag is refreshed; no unhandled rejection
      },
    })
  }, [refreshMe, replaceUser])

  // StrictMode runs this twice; refreshAccessToken shares one in-flight call, so the cookie rotates once.
  useEffect(() => {
    let active = true
    async function boot() {
      try {
        await refreshAccessToken()
        const me = await getMe()
        if (active) {
          replaceUser(me)
          setStatus('ready')
        }
      } catch (error) {
        if (active && !(error instanceof ApiError && error.code === 'SESSION_CHANGED')) {
          replaceUser(null)
          setStatus(isUnauthorized(error) ? 'ready' : 'error')
        }
      }
    }
    void boot()
    return () => {
      active = false
    }
  }, [attempt, replaceUser])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, acceptSession, logout, refreshMe, retry }),
    [status, user, login, acceptSession, logout, refreshMe, retry],
  )

  return <AuthContext.Provider key={authScopeKey(user)} value={value}>{children}</AuthContext.Provider>
}
