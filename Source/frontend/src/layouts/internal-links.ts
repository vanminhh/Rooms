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
}
