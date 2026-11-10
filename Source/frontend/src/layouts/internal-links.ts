import type { MouseEvent } from 'react'

// RoomsHeader and RoomsFooter render plain <a href> links; this keeps those clicks inside the SPA (A2).
export function handleInternalLinkClick(event: MouseEvent<HTMLElement>, navigate: (to: string) => void): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  const anchor = (event.target as Element).closest('a[href]')
  if (!anchor || !event.currentTarget.contains(anchor)) return
  if (anchor.hasAttribute('download')) return
  const target = anchor.getAttribute('target')
  if (target && target !== '_self') return
  const href = anchor.getAttribute('href') ?? ''
  if (!href.startsWith('/') || href.startsWith('//')) return
  event.preventDefault()
  navigate(href)
  const hashIndex = href.indexOf('#')
  if (hashIndex >= 0) scrollToHash(href.slice(hashIndex))
}

// UI-40: client-side navigation does not scroll to "/#khu-vuc" or "/#lien-he" by itself. The target may only
// appear after the next page renders, so look for it a few times (about 1 s) before giving up.
export function scrollToHash(hash: string, attemptsLeft = 20): void {
  if (typeof document === 'undefined') return
  const id = decodeURIComponent(hash.replace(/^#/, ''))
  if (!id) return
  globalThis.setTimeout(() => {
    const element = document.getElementById(id)
    if (!element) {
      if (attemptsLeft > 0) scrollToHash(hash, attemptsLeft - 1)
      return
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    keepAligned(element)
  }, 50)
}

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

// UI-40: sections above the target (featured rooms, images) can finish loading after the scroll and push the
// target down; on the dev API that can take 3–7 s. For 8 s, re-align the target whenever the page height
// changes; any scroll input from the user stops this at once.
function keepAligned(element: HTMLElement, durationMs = 8000): void {
  if (typeof ResizeObserver === 'undefined') return
  let firstCallback = true
  const observer = new ResizeObserver(() => {
    if (firstCallback) { firstCallback = false; return } // fires once on observe; the scroll above is already running
    element.scrollIntoView({ behavior: 'auto', block: 'start' })
  })
  const stop = () => {
    observer.disconnect()
    globalThis.clearTimeout(timer)
    for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop)
  }
  const timer = globalThis.setTimeout(stop, durationMs)
  for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true })
  observer.observe(document.body)
}
