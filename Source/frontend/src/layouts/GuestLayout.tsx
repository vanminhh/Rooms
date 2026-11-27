import { Outlet, useNavigate } from 'react-router'
import '../components'
import { LanguageSwitch, RoomsButton, RoomsHeader } from '../components'
import { useSignOut } from '../features/auth/useSignOut'
import { useI18n } from '../shared/i18n'
import { handleInternalLinkClick } from './internal-links'
import './layouts.css'

// Guest area (GUEST and TENANT, /toi): viewings and account, with a way back to the room search (30-frontend, layouts).
// Same header as TenantLayout, which this app already uses for its mobile-first area.
export function GuestLayout() {
  const navigate = useNavigate()
  const { signOut, signingOut } = useSignOut()
  const { lang, setLang, t } = useI18n()

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <RoomsHeader
      homeHref="/toi"
      logoSrc="/images/rooms-folder-back.svg"
      links={[
        { label: t('nav.appointments'), href: '/toi' },
        { label: t('nav.account'), href: '/toi/tai-khoan' },
        { label: t('nav.findRoom'), href: '/phong' },
      ]}
      action={<div className="rooms-language-actions">
        <LanguageSwitch value={lang} onChange={setLang} viLabel={t('nav.vietnamese')} enLabel={t('nav.english')} groupLabel={t('nav.language')} />
        <RoomsButton variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>{t('nav.signOut')}</RoomsButton>
      </div>}
      homeLabel={t('nav.homeLabel')}
      closeLabel={t('nav.close')}
      menuLabel={t('nav.menu')}
      mainNavLabel={t('nav.main')}
      exploreLabel={t('nav.explore')}
    />
    <main className="layout-main"><Outlet /></main>
  </div>
}
