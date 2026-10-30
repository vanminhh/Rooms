import { Outlet, useNavigate } from 'react-router'
import '../components'
import { RoomsButton, RoomsHeader } from '../components'
import { useAuth } from '../app/auth-context'
import { useSignOut } from '../features/auth/useSignOut'
import { handleInternalLinkClick } from './internal-links'
import './layouts.css'

export function StaffLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { signOut, signingOut } = useSignOut()
  const buildings = (user?.buildings ?? []).map(building => `${building.code} · ${building.name}`).join(', ')

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <RoomsHeader
      homeHref="/ql"
      logoSrc="/images/rooms-logo.webp"
      links={[{ label: 'Việc hôm nay', href: '/ql' }, { label: 'Tài khoản', href: '/ql/tai-khoan' }]}
      action={<RoomsButton variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>Đăng xuất</RoomsButton>}
    />
    <main className="layout-main">
      <p className="layout-buildings">{buildings ? `Tòa đang quản lý: ${buildings}` : 'Chưa được giao tòa nào'}</p>
      <Outlet />
    </main>
  </div>
}
