import { Outlet, useNavigate } from 'react-router'
import '../components'
import { RoomsButton, RoomsHeader } from '../components'
import type { RoomsLink } from '../components'
import { useAuth } from '../app/auth-context'
import { BuildingSelector } from '../features/buildings/BuildingSelector'
import { BuildingSelectionProvider } from '../features/buildings/BuildingSelectionProvider'
import { useSignOut } from '../features/auth/useSignOut'
import { handleInternalLinkClick } from './internal-links'
import './layouts.css'

export function StaffLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { signOut, signingOut } = useSignOut()
  const isBoss = user?.role === 'BOSS'
  // Menu only: the Boss-only routes are also guarded in the router, so a manager who types the URL is redirected (AUTH-06).
  const links: RoomsLink[] = [
    { label: 'Việc hôm nay', href: '/ql' },
    { label: 'Tòa nhà', href: '/ql/toa-nha' },
    ...(isBoss ? [{ label: 'Nhân sự', href: '/ql/nhan-su' }] : []),
    { label: 'Phòng', href: '/ql/phong' },
    { label: 'Đơn giá', href: '/ql/don-gia' },
    ...(isBoss ? [{ label: 'Duyệt giá', href: '/ql/duyet-gia' }] : []),
    { label: 'Lịch hẹn', href: '/ql/lich-hen' },
    { label: 'Tài khoản', href: '/ql/tai-khoan' },
  ]

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <RoomsHeader
      homeHref="/ql"
      logoSrc="/images/rooms-logo.webp"
      links={links}
      action={<RoomsButton variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>Đăng xuất</RoomsButton>}
    />
    <main className="layout-main">
      <BuildingSelectionProvider>
        <BuildingSelector />
        <Outlet />
      </BuildingSelectionProvider>
    </main>
  </div>
}
