import { Outlet, useNavigate } from 'react-router'
import '../components'
import { LanguageSwitch, RoomsFooter, RoomsHeader } from '../components'
import { useAuth } from '../app/auth-context'
import { homeOf } from '../app/guards'
import { ContactInfo } from '../features/auth/ContactInfo'
import { usePublicContact } from '../features/auth/usePublicContact'
import { useI18n } from '../shared/i18n'
import { handleInternalLinkClick } from './internal-links'
import './layouts.css'

export function PublicLayout() {
  const { status, user } = useAuth()
  const navigate = useNavigate()
  const contact = usePublicContact()
  const { lang, setLang, t } = useI18n()
  const account = user
    ? { label: t('nav.myPage'), href: homeOf(user.role) }
    : { label: t('nav.login'), href: '/dang-nhap' }
  const links = status === 'loading' ? [] : [{ label: t('nav.findRoom'), href: '/phong' }, account]

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <RoomsHeader
      homeHref="/"
      links={links}
      supplementalLinks={[{ label: t('nav.area'), href: '/#khu-vuc' }, { label: t('nav.contact'), href: '/#lien-he' }]}
      accountHref={status === 'loading' ? undefined : account.href}
      action={<div className="rooms-language-actions">
        <LanguageSwitch value={lang} onChange={setLang} viLabel={t('nav.vietnamese')} enLabel={t('nav.english')} groupLabel={t('nav.language')} />
        <a className="rooms-header-cta" href="/phong">{t('nav.bookViewing')}</a>
      </div>}
      logoSrc="/images/rooms-logo.webp"
    />
    <main className="layout-main"><Outlet /></main>
    <RoomsFooter id="lien-he" description="Chung cư mini cho thuê tại Hà Nội." contact={<ContactInfo contact={contact.data ?? null} />} links={[{ label: 'Xem phòng trống', href: '/phong' }]} areaLinks={[{ label: 'Xem các khu vực', href: '/#khu-vuc' }]} />
  </div>
}
