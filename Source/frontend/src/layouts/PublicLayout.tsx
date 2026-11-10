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
  const account = user
    ? { label: 'Trang của tôi', href: homeOf(user.role) }
    : { label: 'Đăng nhập', href: '/dang-nhap' }
  const links = status === 'loading' ? [] : [{ label: 'Tìm phòng', href: '/phong' }, account]

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <RoomsHeader
      homeHref="/"
      links={links}
      supplementalLinks={[{ label: 'Khu vực', href: '/#khu-vuc' }, { label: 'Liên hệ', href: '/#lien-he' }]}
      accountHref={status === 'loading' ? undefined : account.href}
      action={<a className="rooms-header-cta" href="/phong">Lên lịch xem</a>}
      logoSrc="/images/rooms-logo.webp"
    />
    <main className="layout-main"><Outlet /></main>
    <RoomsFooter id="lien-he" description="Chung cư mini cho thuê tại Hà Nội." contact={<ContactInfo contact={contact.data ?? null} />} links={[{ label: 'Xem phòng trống', href: '/phong' }]} areaLinks={[{ label: 'Xem các khu vực', href: '/#khu-vuc' }]} />
  </div>
}
