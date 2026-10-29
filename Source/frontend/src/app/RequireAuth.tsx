import { Navigate, Outlet, useLocation } from 'react-router'
import { RoomsButton, Spinner } from '../components'
import type { Role } from '../features/auth/api'
import { useAuth } from './auth-context'
import { guardRedirect, postLoginPath } from './guards'

export function RequireAuth({ allow }: { allow: readonly Role[] | 'any' }) {
  const { status, user, retry } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <div className="rooms-theme"><Spinner label="Đang tải" /></div>
  }
  if (status === 'error') {
    return (
      <div className="rooms-theme">
        <p role="alert">Không tải được phiên đăng nhập.</p>
        <RoomsButton onClick={retry}>Thử lại</RoomsButton>
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
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <Spinner label="Đang tải" />
  if (user) return <Navigate to={postLoginPath(user.role, new URLSearchParams(location.search).get('next'))} replace />
  return <Outlet />
}
