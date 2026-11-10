import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import './booking-panel.css'

// Phone layout of /phong/:id (UI-24): the booking card sits below gallery, facts and rates, so a bar at the
// bottom of the screen jumps to it. It shows only while the card is still below the viewport; CSS hides it
// on wide screens, where the card is sticky beside the content. Without IntersectionObserver it never shows.
export function BookingJumpBar({ target, roomCode, priceLabel }: { target: RefObject<HTMLElement | null>; roomCode: string; priceLabel: string }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const card = target.current
    if (!card || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.top > 0))
    observer.observe(card)
    return () => observer.disconnect()
  }, [target])

  function jumpToBooking() {
    const card = target.current
    if (!card) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    card.querySelector<HTMLElement>('form button:not([disabled]), form input:not([disabled])')?.focus({ preventScroll: true })
  }

  return <div className="public-booking-jump" hidden={!show}>
    <p><span>Giá thuê</span><strong>{priceLabel}</strong></p>
    <button type="button" onClick={jumpToBooking}>Đặt lịch xem phòng {roomCode}</button>
  </div>
}
