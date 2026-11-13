import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { BookingJumpBar } from '../../features/public/BookingJumpBar'
import { useI18n } from '../../shared/i18n'
import type { DictKey } from '../../shared/i18n'
import '../../features/public/public-room-detail.css'

export interface RoomDetailViewData {
  id: number
  code: string
  floor: number
  areaM2: number
  maxOccupants: number
  furniture: string[]
  description: string | null
  price: number
  deposit?: number
  images: { id: number; url: string; sortOrder: number }[]
  building: {
    id: number
    name: string
    address: string
    district: string
    ward: string
    amenities: string[]
    description: string | null
  }
}

export interface RoomDetailViewProps {
  room: RoomDetailViewData
  statusBadge: ReactNode
  estimatePanel: ReactNode
  rateTable: ReactNode
  contactCard: ReactNode
  viewingForm: ReactNode
  attributeFacts?: { label: string; value: string }[] // ROOM-10: only the values staff entered
  formatMoney(value: number): string
}

export function RoomDetailView({ room, statusBadge, estimatePanel, rateTable, contactCard, viewingForm, attributeFacts, formatMoney }: RoomDetailViewProps) {
  const { t } = useI18n()
  const { building } = room
  const [shareMessage, setShareMessage] = useState<DictKey | null>(null)
  const bookingCard = useRef<HTMLElement>(null)

  async function copyCurrentLink() {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href)
    } else {
      const input = document.createElement('input')
      input.value = window.location.href
      input.setAttribute('readonly', '')
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setShareMessage('room.detail.copied')
  }

  async function shareRoom() {
    setShareMessage(null)
    if (navigator.share) {
      try {
        await navigator.share({ title: `${t('room.name', { code: room.code })} · ${building.name}`, url: window.location.href })
        setShareMessage('room.detail.shared')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await copyCurrentLink()
    } catch {
      setShareMessage('room.detail.shareError')
    }
  }

  return <article className="public-detail public-room-detail">
    <nav className="public-detail-breadcrumb" aria-label={t('room.detail.breadcrumb')}>
      <Link to="/">{t('room.detail.home')}</Link><span aria-hidden="true">›</span>
      <Link to={`/phong?district=${encodeURIComponent(building.district)}`}>{building.district}</Link><span aria-hidden="true">›</span>
      <Link to={`/toa/${building.id}`}>{building.name}</Link><span aria-hidden="true">›</span>
      <span aria-current="page">{t('room.name', { code: room.code })}</span>
    </nav>

    <header className="public-detail-header">
      <div className="public-detail-title">
        <div className="public-detail-kicker">
          <span className="public-detail-code">{t('room.detail.code', { code: room.code })}</span>
          {statusBadge}
        </div>
        <h1>{t('room.name', { code: room.code })} <span>· {building.name}</span></h1>
        <p>{building.address}, {building.ward}, {building.district} · {t('room.floor')} {room.floor}</p>
      </div>
      <div className="public-detail-share">
        <button type="button" className="public-share-button" onClick={() => void shareRoom()} aria-describedby="public-share-message">
          <span aria-hidden="true">↗</span> {t('room.detail.share')}
        </button>
        <span id="public-share-message" className="public-share-message" aria-live="polite">{shareMessage && t(shareMessage)}</span>
      </div>
    </header>

    <RoomGallery room={room} />

    <dl className="public-detail-facts" aria-label={t('room.detail.facts')}>
      <div><dt>{t('room.area')}</dt><dd>{room.areaM2.toLocaleString('vi-VN')} m²</dd></div>
      <div><dt>{t('room.detail.people')}</dt><dd>{t('room.detail.personUnit', { count: room.maxOccupants })}</dd></div>
      <div><dt>{t('room.floor')}</dt><dd>{room.floor}</dd></div>
      {attributeFacts?.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
      <div><dt>{t('room.detail.furniture')}</dt><dd>{room.furniture.length > 0 ? room.furniture.join(', ') : t('room.detail.noInfo')}</dd></div>
    </dl>

    <div className="public-detail-grid public-booking-layout">
      <div className="public-detail-main">
        {(room.description || building.description || building.amenities.length > 0) && <section className="public-detail-description">
          <p className="rooms-eyebrow">{t('room.detail.living')}</p>
          <h2>{t('room.detail.description')}</h2>
          {room.description && <p>{room.description}</p>}
          {building.description && <p>{building.description}</p>}
          {building.amenities.length > 0 && <ul className="public-tags">{building.amenities.map(item => <li key={item}>{item}</li>)}</ul>}
        </section>}
        <section className="public-detail-costs" aria-label={t('room.detail.costs')}>
          {estimatePanel}
          {rateTable}
        </section>
      </div>
      <aside ref={bookingCard} className="public-detail-aside public-booking-card" aria-label={t('room.detail.booking', { code: room.code })}>
        <div className="public-booking-price">
          <p className="rooms-eyebrow">{t('room.detail.listedRent')}</p>
          <p><strong>{formatMoney(room.price)}</strong></p>
          <dl>
            {typeof room.deposit === 'number' && <div><dt>{t('room.detail.deposit')}</dt><dd>{formatMoney(room.deposit)}</dd></div>}
            <div><dt>{t('room.detail.term')}</dt><dd>{t('room.detail.minTerm')}</dd></div>
          </dl>
        </div>
        {viewingForm}
        <div className="public-booking-promises" aria-label={t('room.detail.bookingInfo')}>
          <p><span aria-hidden="true">✓</span> {t('room.detail.confirm')}</p>
          <p><span aria-hidden="true">✓</span> {t('room.detail.noHold')}</p>
        </div>
        {contactCard}
      </aside>
    </div>
    <BookingJumpBar target={bookingCard} roomCode={room.code} priceLabel={formatMoney(room.price)} />
  </article>
}

function RoomGallery({ room }: { room: RoomDetailViewData }) {
  const { t } = useI18n()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const previousButton = useRef<HTMLButtonElement>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  const isOpen = activeIndex !== null
  const images = room.images.slice(0, 5)

  useEffect(() => {
    if (!isOpen) return
    closeButton.current?.focus()
    return () => opener.current?.focus()
  }, [isOpen])

  function openImage(index: number, event: MouseEvent<HTMLButtonElement>) {
    opener.current = event.currentTarget
    setActiveIndex(index)
  }

  function closeImage() {
    setActiveIndex(null)
  }

  const hasMany = room.images.length > 1

  function step(delta: number) {
    setActiveIndex(index => index === null ? null : (index + delta + room.images.length) % room.images.length)
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeImage()
      return
    }
    if (hasMany && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault()
      step(event.key === 'ArrowLeft' ? -1 : 1)
      return
    }
    if (event.key !== 'Tab') return
    const first = closeButton.current
    // With one photo there are no ‹ › buttons, so the close button is the only stop in the trap.
    const last = hasMany ? nextButton.current : closeButton.current
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  if (room.images.length === 0) {
    return <div className="public-gallery public-gallery--empty" role="img" aria-label={t('room.gallery.emptyAlt', { code: room.code })}>{t('room.noPhoto')}</div>
  }

  return <>
    <div className={`public-gallery public-gallery--${Math.min(room.images.length, 5)}`} aria-label={t('room.gallery.label', { code: room.code })}>
      {images.map((image, index) => <button key={image.id} type="button" className="public-gallery-item" onClick={event => openImage(index, event)} aria-label={t('room.gallery.view', { index: index + 1, code: room.code })}>
        <img className="public-room-image" src={image.url} alt={t('room.gallery.photoAlt', { code: room.code, building: room.building.name, index: index + 1, total: room.images.length })} />
        {index === 4 && room.images.length > 5 && <span className="public-gallery-more">{t('room.gallery.more', { count: room.images.length - 5 })}</span>}
      </button>)}
    </div>
    {activeIndex !== null && <div className="public-lightbox" role="dialog" aria-modal="true" aria-label={t('room.gallery.large', { code: room.code })} onKeyDown={handleDialogKeyDown}>
      <button ref={closeButton} type="button" className="public-lightbox-close" onClick={closeImage} aria-label={t('room.gallery.close')}>×</button>
      {hasMany && <button ref={previousButton} type="button" className="public-lightbox-nav public-lightbox-nav--prev" onClick={() => step(-1)} aria-label={t('room.gallery.previous')}>‹</button>}
      <img src={room.images[activeIndex].url} alt={t('room.gallery.largeAlt', { code: room.code, index: activeIndex + 1, total: room.images.length })} />
      {hasMany && <button ref={nextButton} type="button" className="public-lightbox-nav public-lightbox-nav--next" onClick={() => step(1)} aria-label={t('room.gallery.next')}>›</button>}
      <p>{activeIndex + 1} / {room.images.length}</p>
    </div>}
  </>
}
