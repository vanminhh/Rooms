import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router'
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
  formatMoney(value: number): string
}

export function RoomDetailView({ room, statusBadge, estimatePanel, rateTable, contactCard, viewingForm, formatMoney }: RoomDetailViewProps) {
  const { building } = room
  const [shareMessage, setShareMessage] = useState('')

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
    setShareMessage('Đã chép liên kết')
  }

  async function shareRoom() {
    setShareMessage('')
    if (navigator.share) {
      try {
        await navigator.share({ title: `Phòng ${room.code} · ${building.name}`, url: window.location.href })
        setShareMessage('Đã mở chia sẻ')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await copyCurrentLink()
    } catch {
      setShareMessage('Không thể chia sẻ hoặc chép liên kết')
    }
  }

  return <article className="public-detail public-room-detail">
    <nav className="public-detail-breadcrumb" aria-label="Đường dẫn trang">
      <Link to="/">Trang chủ</Link><span aria-hidden="true">›</span>
      <Link to={`/phong?district=${encodeURIComponent(building.district)}`}>{building.district}</Link><span aria-hidden="true">›</span>
      <Link to={`/toa/${building.id}`}>{building.name}</Link><span aria-hidden="true">›</span>
      <span aria-current="page">Phòng {room.code}</span>
    </nav>

    <header className="public-detail-header">
      <div className="public-detail-title">
        <div className="public-detail-kicker">
          <span className="public-detail-code">Mã phòng: {room.code}</span>
          {statusBadge}
        </div>
        <h1>Phòng {room.code} <span>· {building.name}</span></h1>
        <p>{building.address}, {building.ward}, {building.district} · Tầng {room.floor}</p>
      </div>
      <div className="public-detail-share">
        <button type="button" className="public-share-button" onClick={() => void shareRoom()} aria-describedby="public-share-message">
          <span aria-hidden="true">↗</span> Chia sẻ
        </button>
        <span id="public-share-message" className="public-share-message" aria-live="polite">{shareMessage}</span>
      </div>
    </header>

    <RoomGallery room={room} />

    <dl className="public-detail-facts" aria-label="Thông số phòng">
      <div><dt>Diện tích</dt><dd>{room.areaM2.toLocaleString('vi-VN')} m²</dd></div>
      <div><dt>Số người tối đa</dt><dd>{room.maxOccupants} người</dd></div>
      <div><dt>Tầng</dt><dd>{room.floor}</dd></div>
      <div><dt>Nội thất</dt><dd>{room.furniture.length > 0 ? room.furniture.join(', ') : 'Chưa có thông tin'}</dd></div>
    </dl>

    <div className="public-detail-grid public-booking-layout">
      <div className="public-detail-main">
        {(room.description || building.description || building.amenities.length > 0) && <section className="public-detail-description">
          <p className="rooms-eyebrow">Không gian sống</p>
          <h2>Mô tả phòng</h2>
          {room.description && <p>{room.description}</p>}
          {building.description && <p>{building.description}</p>}
          {building.amenities.length > 0 && <ul className="public-tags">{building.amenities.map(item => <li key={item}>{item}</li>)}</ul>}
        </section>}
        <section className="public-detail-costs" aria-label="Chi phí và đơn giá">
          {estimatePanel}
          {rateTable}
        </section>
      </div>
      <aside className="public-detail-aside public-booking-card" aria-label={`Đặt lịch xem phòng ${room.code}`}>
        <div className="public-booking-price">
          <p className="rooms-eyebrow">Giá thuê niêm yết</p>
          <p><strong>{formatMoney(room.price)}</strong></p>
          <dl>
            {typeof room.deposit === 'number' && <div><dt>Tiền cọc</dt><dd>{formatMoney(room.deposit)}</dd></div>}
            <div><dt>Thời hạn</dt><dd>Tối thiểu 3 tháng</dd></div>
          </dl>
        </div>
        {viewingForm}
        <div className="public-booking-promises" aria-label="Thông tin đặt lịch">
          <p><span aria-hidden="true">✓</span> Quản lý tòa nhà trực tiếp đón tiếp, không qua trung gian.</p>
          <p><span aria-hidden="true">✓</span> Xem phòng và tư vấn hoàn toàn miễn phí.</p>
        </div>
        {contactCard}
      </aside>
    </div>
  </article>
}

function RoomGallery({ room }: { room: RoomDetailViewData }) {
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

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeImage()
      return
    }
    if (event.key !== 'Tab') return
    const first = closeButton.current
    const last = nextButton.current
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  if (room.images.length === 0) {
    return <div className="public-gallery public-gallery--empty" role="img" aria-label={`Phòng ${room.code} chưa có ảnh`}>Chưa có ảnh</div>
  }

  return <>
    <div className={`public-gallery public-gallery--${Math.min(room.images.length, 5)}`} aria-label={`Ảnh phòng ${room.code}`}>
      {images.map((image, index) => <button key={image.id} type="button" className="public-gallery-item" onClick={event => openImage(index, event)} aria-label={`Xem ảnh ${index + 1} của phòng ${room.code}`}>
        <img className="public-room-image" src={image.url} alt={`Phòng ${room.code} – ${room.building.name}, ảnh ${index + 1}/${room.images.length}`} />
        {index === 4 && room.images.length > 5 && <span className="public-gallery-more">+{room.images.length - 5} ảnh</span>}
      </button>)}
    </div>
    {activeIndex !== null && <div className="public-lightbox" role="dialog" aria-modal="true" aria-label={`Ảnh lớn phòng ${room.code}`} onKeyDown={handleDialogKeyDown}>
      <button ref={closeButton} type="button" className="public-lightbox-close" onClick={closeImage} aria-label="Đóng ảnh lớn">×</button>
      <button ref={previousButton} type="button" className="public-lightbox-nav public-lightbox-nav--prev" onClick={() => setActiveIndex((activeIndex - 1 + room.images.length) % room.images.length)} aria-label="Ảnh trước">‹</button>
      <img src={room.images[activeIndex].url} alt={`Phòng ${room.code} – ảnh lớn ${activeIndex + 1}/${room.images.length}`} />
      <button ref={nextButton} type="button" className="public-lightbox-nav public-lightbox-nav--next" onClick={() => setActiveIndex((activeIndex + 1) % room.images.length)} aria-label="Ảnh tiếp theo">›</button>
      <p>{activeIndex + 1} / {room.images.length}</p>
    </div>}
  </>
}
