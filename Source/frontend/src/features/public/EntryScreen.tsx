import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { ElevatedCard, LanguageSwitch, RoomsButton } from '../../components'
import { useReducedMotion } from '../../components/useReducedMotion'
import { useI18n } from '../../shared/i18n'
import './entry-screen.css'
import type { EntryChoice } from './entry-choice'

// The public layout mounts this only on /. Destination guards own access checks.
export function EntryScreen({ onChoose, videoSrc }: { onChoose(choice: EntryChoice): void; videoSrc?: string }) {
  const navigate = useNavigate()
  const { t, lang, setLang } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const [videoFailed, setVideoFailed] = useState(false)
  const [videoReady, setVideoReady] = useState(false)

  useEffect(() => {
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('button')
    if (!buttons?.length) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function choose(path: EntryChoice) {
    onChoose(path)
    if (path !== '/') navigate(path)
  }

  return <div ref={root} className="rooms-dialog-backdrop public-entry" onKeyDown={trapFocus}>
    <img className="public-entry-background" src="/videos/rooms-entry.webp" alt="" />
    {videoSrc && !reducedMotion && !videoFailed && <video className="public-entry-background" src={videoSrc}
      autoPlay muted playsInline loop preload="none" aria-hidden="true" tabIndex={-1}
      style={{ visibility: videoReady ? 'visible' : 'hidden' }}
      onPlaying={() => setVideoReady(true)} onError={() => setVideoFailed(true)} />}
    <div className="public-entry-welcome">
      <span className="rooms-brand-mark public-entry-mark" aria-hidden="true"><img src="/images/rooms-folder-back.svg" alt="" /></span>
      <strong>ROOMS</strong>
      <small>APARTMENTS HANOI</small>
      <p>{lang === 'vi' ? 'Chào mừng đến với' : 'Welcome to'} <em>ROOMS</em></p>
    </div>
    <ElevatedCard className="public-entry-card" role="dialog" aria-modal="true" aria-labelledby="entry-title">
      <h2 id="entry-title">{t('entry.title')}</h2>
      <div className="public-entry-choices">
        <RoomsButton onClick={() => choose('/')}>{t('entry.findRoom')}</RoomsButton>
        <RoomsButton variant="outline" onClick={() => choose('/thue')}>{t('entry.tenant')}</RoomsButton>
        <RoomsButton variant="outline" onClick={() => choose('/ql')}>{t('entry.staff')}</RoomsButton>
      </div>
      {/* D-43: a guest with an account logs in on the plain page; this keeps the choice "Tìm phòng" (a guest is a visitor of the rooms). */}
      <button type="button" className="public-entry-guest" onClick={() => { onChoose('/'); navigate('/dang-nhap') }}>{t('entry.guestLogin')}</button>
      <LanguageSwitch value={lang} onChange={setLang} viLabel={t('nav.vietnamese')} enLabel={t('nav.english')} groupLabel={t('nav.language')} />
    </ElevatedCard>
  </div>
}
