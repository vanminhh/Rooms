import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Lenis from 'lenis'
import { useReducedMotion } from './useReducedMotion'

export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return <motion.div className={`rooms-reveal ${className}`} initial={reduce ? false : { opacity: 0, transform: 'translateY(16px)' }} animate={reduce ? { opacity: 1, transform: 'translateY(0px)' } : undefined} whileInView={{ opacity: 1, transform: 'translateY(0px)' }} viewport={{ once: true, amount: 'some' }} transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : delay, ease: [0.23, 1, 0.32, 1] }}>{children}</motion.div>
}

export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) return
    const scroll = new Lenis({ lerp: 0.075, autoRaf: true, anchors: { immediate: true } })
    return () => scroll.destroy()
  }, [reduce])
  return <>{children}</>
}

function LoadingOverlay({ progress, logoSrc }: { progress: number; logoSrc?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const reduce = useReducedMotion()
  const [keyboardInitiated] = useState(() => document.activeElement?.matches(':focus-visible') ?? false)
  const value = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0))
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => {
      element?.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])
  return <motion.dialog ref={dialog} tabIndex={-1} className="rooms-preloader" aria-label="Đang mở không gian Rooms" onCancel={event => event.preventDefault()} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: keyboardInitiated ? 0 : reduce ? 0.12 : 0.18, ease: [0.23, 1, 0.32, 1] }}>
    {logoSrc ? <span className="rooms-brand-mark" aria-hidden="true"><img src={logoSrc} alt="" /></span> : <svg className="rooms-preloader-sun" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="26" /><path d="M50 6v12M50 82v12M6 50h12M82 50h12M19 19l9 9M72 72l9 9M19 81l9-9M72 28l9-9" /></svg>}
    <p>ROOMS</p><span>Không gian để thuộc về</span><div className="rooms-preloader-track" role="progressbar" aria-label="Tiến độ tải Rooms" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><i style={{ transform: `scaleX(${value / 100})` }} /></div><small>{String(Math.round(value)).padStart(3, '0')}</small>
  </motion.dialog>
}

export function Preloader({ visible, progress, logoSrc }: { visible: boolean; progress: number; logoSrc?: string }) {
  return <AnimatePresence>{visible && <LoadingOverlay key="loading" progress={progress} logoSrc={logoSrc} />}</AnimatePresence>
}
