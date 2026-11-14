import { Navigate, Outlet, useLocation } from 'react-router'
import { RoomsButton, Spinner } from '../components'
import type { Role } from '../features/auth/api'
import { useAuth } from './auth-context'
import { guardRedirect, postLoginPath } from './guards'
import { t as translate, useI18n } from '../shared/i18n'

export function RequireAuth({ allow }: { allow: readonly Role[] | 'any' }) {
  const { status, user, retry } = useAuth()
  const location = useLocation()
  const { lang } = useI18n()
  // The guard renders before StaffLayout's fixed-language provider mounts.
  const language = /^\/ql(\/|$)/.test(location.pathname) ? 'vi' : lang

  if (status === 'loading') {
    return <div className="rooms-theme layout-startup"><Spinner block label={translate('auth.loading', undefined, language)} /></div>
  }
  if (status === 'error') {
    return (
      <div className="rooms-theme layout-startup">
        <p role="alert">{translate('auth.sessionError', undefined, language)}</p>
        <RoomsButton onClick={retry}>{translate('common.retry', undefined, language)}</RoomsButton>
      </div>
    )
  }
  const redirect = guardRedirect(user, location, allow)
  if (redirect) return <Navigate to={redirect} replace />
  return <Outlet />
}

// Login page: a signed-in user goes to the same target LoginPage uses (postLoginPath), so the two never disagree on next.
// A failed startup counts as signed out.
export function GuestOnly() {
  const { t } = useI18n()
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <Spinner block label={t('auth.loading')} />
  if (user) return <Navigate to={postLoginPath(user.role, new URLSearchParams(location.search).get('next'))} replace />
  return <Outlet />
}
