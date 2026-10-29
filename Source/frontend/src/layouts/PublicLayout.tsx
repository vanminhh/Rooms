import { Outlet, useNavigate } from 'react-router'
import '../components'
import { RoomsFooter, RoomsHeader } from '../components'
import { useAuth } from '../app/auth-context'
import { homeOf } from '../app/guards'
import { ContactInfo } from '../features/auth/ContactInfo'
import { usePublicContact } from '../features/auth/usePublicContact'
import { handleInternalLinkClick } from './internal-links'
import './layouts.css'

export function PublicLayout() {
  const { status, user } = useAuth()
  const navigate = useNavigate()
  const contact = usePublicContact()
  // A failed startup (status 'error') counts as signed out (A17).
  const links = status === 'loading' ? [] : user
    ? [{ label: 'Trang của tôi', href: homeOf(user.role) }]
    : [{ label: 'Đăng nhập', href: '/dang-nhap' }]

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <RoomsHeader homeHref="/" links={links} logoSrc="/images/rooms-logo.webp" />
    <main className="layout-main"><Outlet /></main>
    <RoomsFooter description="Chung cư mini cho thuê tại Hà Nội." contact={<ContactInfo contact={contact.data ?? null} />} />
  </div>
}
