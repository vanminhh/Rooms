import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type RoomsLink = { label: string; href: string }

export function RoomsHeader({ links, action, homeHref = '/', logoSrc }: { links: RoomsLink[]; action?: ReactNode; homeHref?: string; logoSrc?: string }) {
  const [open, setOpen] = useState(false)
  const navId = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  return <header className="rooms-header" onKeyDown={event => {
    if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus() }
  }}>
    <a className="rooms-brand" href={homeHref} aria-label="Rooms — Trang chủ">
      {logoSrc && <span className="rooms-brand-mark" aria-hidden="true"><img src={logoSrc} alt="" /></span>}
      <span>ROOMS<small>Không gian để thuộc về</small></span>
    </a>
    <button ref={toggle} className="rooms-menu-toggle" type="button" aria-expanded={open} aria-controls={navId} onClick={() => setOpen(value => !value)}>{open ? 'Đóng' : 'Menu'}<span aria-hidden="true">{open ? '−' : '+'}</span></button>
    <nav id={navId} className={open ? 'rooms-nav is-open' : 'rooms-nav'} aria-label="Điều hướng chính">
      {links.map(link => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
    </nav>
    {action && <div className="rooms-header-action">{action}</div>}
  </header>
}

export function RoomsFooter({ description, contact, links = [] }: { description: string; contact: ReactNode; links?: RoomsLink[] }) {
  return <footer className="rooms-footer">
    <div><p className="rooms-footer-brand">ROOMS<span aria-hidden="true">®</span></p><p>{description}</p></div>
    <div className="rooms-footer-contact"><span className="rooms-eyebrow">Kết nối với Rooms</span>{contact}</div>
    <nav aria-label="Liên kết cuối trang">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <div className="rooms-footer-bottom"><span>Hà Nội · Việt Nam</span><span>Một nơi ở. Một nhịp sống riêng.</span></div>
  </footer>
}
