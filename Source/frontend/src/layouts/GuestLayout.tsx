import { Outlet, useNavigate } from 'react-router'
import '../components'
import { RoomsButton, RoomsHeader } from '../components'
import { useSignOut } from '../features/auth/useSignOut'
import { handleInternalLinkClick } from './internal-links'
import './layouts.css'

// Guest area (GUEST and TENANT, /toi): viewings and account, with a way back to the room search (30-frontend, layouts).
// Same header as TenantLayout, which this app already uses for its mobile-first area.
export function GuestLayout() {
  const navigate = useNavigate()
  const { signOut, signingOut } = useSignOut()

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <RoomsHeader
      homeHref="/toi"
      logoSrc="/images/rooms-logo.webp"
      links={[
        { label: 'Lịch hẹn', href: '/toi' },
        { label: 'Tài khoản', href: '/toi/tai-khoan' },
        { label: 'Tìm phòng', href: '/phong' },
      ]}
      action={<RoomsButton variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>Đăng xuất</RoomsButton>}
    />
    <main className="layout-main"><Outlet /></main>
  </div>
}
