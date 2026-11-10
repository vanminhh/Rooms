import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './Navigation.css'

export type RoomsLink = { label: string; href: string }

type RoomsHeaderProps = {
  links: RoomsLink[]
  supplementalLinks?: RoomsLink[]
  accountHref?: string
  action?: ReactNode
  homeHref?: string
  logoSrc?: string
}

export function RoomsHeader({ links, supplementalLinks = [], accountHref, action, homeHref = '/', logoSrc }: RoomsHeaderProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const toggle = useRef<HTMLButtonElement>(null)

  function closeMenu() {
    setOpen(false)
  }

  return <header className="rooms-header" onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      closeMenu()
      toggle.current?.focus()
    }
  }}>
    <a className="rooms-brand" href={homeHref} aria-label="Rooms — Trang chủ">
      {logoSrc && <span className="rooms-brand-mark" aria-hidden="true"><img src={logoSrc} alt="" /></span>}
      <span className="rooms-brand-wordmark"><strong>ROOMS</strong><small>APARTMENTS HANOI</small></span>
    </a>
    <button ref={toggle} className="rooms-menu-toggle" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span>{open ? 'Đóng' : 'Menu'}</span><span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    <div id={panelId} className={open ? 'rooms-header-panel is-open' : 'rooms-header-panel'}>
      <nav className="rooms-nav" aria-label="Điều hướng chính">
        {links.map(link => <a className={link.href === accountHref ? 'rooms-account-link' : undefined} key={`${link.label}-${link.href}`} href={link.href} onClick={closeMenu}>{link.label}</a>)}
      </nav>
      {supplementalLinks.length > 0 && <nav className="rooms-nav rooms-nav--supplemental" aria-label="Khám phá">
        {supplementalLinks.map(link => <a key={`${link.label}-${link.href}`} href={link.href} onClick={closeMenu}>{link.label}</a>)}
      </nav>}
      {action && <div className="rooms-header-action" onClick={closeMenu}>{action}</div>}
    </div>
  </header>
}

export function RoomsFooter({ description, contact, links = [], areaLinks = [], id }: { description: string; contact: ReactNode; links?: RoomsLink[]; areaLinks?: RoomsLink[]; id?: string }) {
  return <footer className="rooms-footer" id={id}>
    <section className="rooms-footer-intro" aria-labelledby="rooms-footer-brand">
      <p className="rooms-footer-brand" id="rooms-footer-brand">ROOMS</p>
      <p className="rooms-footer-wordmark">APARTMENTS HANOI</p>
      <p>{description}</p>
    </section>
    <section>
      <h2>Tìm phòng</h2>
      <p>Xem phòng đang trống và chọn lịch hẹn phù hợp.</p>
      {links.length > 0 && <nav aria-label="Tìm phòng">{links.map(link => <a key={`${link.label}-${link.href}`} href={link.href}>{link.label}</a>)}</nav>}
    </section>
    <section>
      <h2>Khu vực</h2>
      <p>Khám phá các tòa nhà tại Hà Nội theo khu vực.</p>
      {areaLinks.length > 0 && <nav aria-label="Khu vực">{areaLinks.map(link => <a key={`${link.label}-${link.href}`} href={link.href}>{link.label}</a>)}</nav>}
    </section>
    <section className="rooms-footer-contact">
      <h2>Liên hệ</h2>
      {contact || <p>Thông tin đang được cập nhật.</p>}
    </section>
    <div className="rooms-footer-bottom"><span>Hà Nội · Việt Nam</span><span>© ROOMS Apartments Hanoi</span></div>
  </footer>
}
