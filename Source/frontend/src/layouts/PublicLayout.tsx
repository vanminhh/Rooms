import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import '../components'
import { LanguageSwitch, RoomsButton, RoomsFooter, RoomsHeader } from '../components'
import { EntryScreen } from '../features/public/EntryScreen'
import { ChatWidget } from '../features/public/ChatWidget'
import { roomIdOfPath } from '../features/public/chat'
import { readEntryChoice, saveEntryChoice } from '../features/public/entry-choice'
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
  const { pathname, state } = useLocation()
  const [choice, setChoice] = useState(readEntryChoice)
  const [entryOpen, setEntryOpen] = useState(() => choice === null)
  // UI-11: a link with state { entry: true } (the sign-up page's "Đã có tài khoản?") opens the entry screen again.
  const entryRequested = pathname === '/' && (state as { entry?: boolean } | null)?.entry === true
  const showEntry = pathname === '/' && (entryOpen || entryRequested)
  const contact = usePublicContact()
  const { lang, setLang, t } = useI18n()
  // UI-11 (owner 21/11/2026): a visitor who chose "Tìm phòng" is a prospective guest, so the corner button offers sign-up (the sign-up page links back to login).
  const account = user
    ? { label: t('nav.myPage'), href: homeOf(user.role) }
    : choice === '/'
      ? { label: t('auth.register'), href: '/dang-ky' }
      : { label: t('nav.login'), href: '/dang-nhap' }
  const links = status === 'loading' ? [] : [{ label: t('nav.findRoom'), href: '/phong' }, account]

  return <div className="rooms-theme" onClick={event => handleInternalLinkClick(event, navigate)}>
    <div inert={showEntry}>
    <RoomsHeader
      homeHref="/"
      links={links}
      supplementalLinks={[{ label: t('nav.area'), href: '/#khu-vuc' }, { label: t('nav.contact'), href: '/#lien-he' }]}
      accountHref={status === 'loading' ? undefined : account.href}
      action={<div className="rooms-language-actions">
        <RoomsButton variant="outline" onClick={() => { setEntryOpen(true); navigate('/') }}>{t('entry.chooseAgain')}</RoomsButton>
        <LanguageSwitch value={lang} onChange={setLang} viLabel={t('nav.vietnamese')} enLabel={t('nav.english')} groupLabel={t('nav.language')} />
        <a className="rooms-header-cta" href="/phong">{t('nav.bookViewing')}</a>
      </div>}
      logoSrc="/images/rooms-logo.webp"
      homeLabel={t('nav.homeLabel')}
      closeLabel={t('nav.close')}
      menuLabel={t('nav.menu')}
      mainNavLabel={t('nav.main')}
      exploreLabel={t('nav.explore')}
    />
    <main className="layout-main"><Outlet /></main>
    <RoomsFooter id="lien-he" description={t('footer.description')} contact={<ContactInfo contact={contact.data ?? null} />}
      links={[{ label: t('footer.viewRooms'), href: '/phong' }]} areaLinks={[{ label: t('footer.viewAreas'), href: '/#khu-vuc' }]}
      findTitle={t('footer.findTitle')} findDescription={t('footer.findDescription')}
      areaTitle={t('footer.areaTitle')} areaDescription={t('footer.areaDescription')}
      contactTitle={t('footer.contactTitle')} contactEmpty={t('footer.contactEmpty')} bottomLocation={t('footer.location')} />
    {/* CHAT-01, A-28: on every public page except while the entry screen is open; the chat survives moving between public pages. */}
    {!showEntry && <ChatWidget roomId={roomIdOfPath(pathname)} fallbackPhone={contact.data?.phone} />}
    </div>
    {showEntry && <EntryScreen videoSrc="/videos/rooms-entry.mp4" onChoose={picked => {
      saveEntryChoice(picked)
      setChoice(picked)
      setEntryOpen(false)
      if (entryRequested) navigate('/', { replace: true, state: null })
    }} />}
  </div>
}
