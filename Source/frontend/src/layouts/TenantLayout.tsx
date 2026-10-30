import { Outlet, useNavigate } from 'react-router'
import '../components'
import { RoomsButton, RoomsHeader } from '../components'
import { useSignOut } from '../features/auth/useSignOut'
import { handleInternalLinkClick } from './internal-links'
import './layouts.css'

export function TenantLayout() {
  const navigate = useNavigate()
  const { signOut, signingOut } = useSignOut()

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <RoomsHeader
      homeHref="/thue"
      logoSrc="/images/rooms-logo.webp"
      links={[{ label: 'Tổng quan', href: '/thue' }, { label: 'Tài khoản', href: '/thue/tai-khoan' }]}
      action={<RoomsButton variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>Đăng xuất</RoomsButton>}
    />
    <main className="layout-main"><Outlet /></main>
  </div>
}
