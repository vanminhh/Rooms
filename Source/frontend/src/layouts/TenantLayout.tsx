import { Outlet, useNavigate } from 'react-router'
import '../components'
import { LanguageSwitch, RoomsButton, RoomsHeader } from '../components'
import { useSignOut } from '../features/auth/useSignOut'
import { useI18n } from '../shared/i18n'
import { handleInternalLinkClick } from './internal-links'
import './layouts.css'

export function TenantLayout() {
  const navigate = useNavigate()
  const { signOut, signingOut } = useSignOut()
  const { lang, setLang, t } = useI18n()

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <RoomsHeader
      homeHref="/thue"
      logoSrc="/images/rooms-logo.webp"
      links={[{ label: t('nav.overview'), href: '/thue' }, { label: t('nav.account'), href: '/thue/tai-khoan' }, { label: t('nav.viewings'), href: '/toi' }]}
      action={<div className="rooms-language-actions">
        <LanguageSwitch value={lang} onChange={setLang} viLabel={t('nav.vietnamese')} enLabel={t('nav.english')} groupLabel={t('nav.language')} />
        <RoomsButton variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>{t('nav.signOut')}</RoomsButton>
      </div>}
    />
    <main className="layout-main"><Outlet /></main>
  </div>
}
