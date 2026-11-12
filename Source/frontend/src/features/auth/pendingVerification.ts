// AUTH-12, AUTH-13: what /xac-minh-email needs after a reload. Kept in sessionStorage (owner 13/11/2026):
// gone when the tab closes, never on disk for long. Storage can be blocked, so every call is guarded.
export const RESEND_SECONDS = 60 // AUTH-13

export interface PendingVerification {
  phone: string
  email: string | null // unknown when the guest arrives from a login answered with EMAIL_NOT_VERIFIED
  sentAt: number | null // ms of the last code sent; null = no code sent yet in this flow
}

const KEY = 'rooms.pendingVerification'

export function readPending(): PendingVerification | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PendingVerification>
    if (typeof value.phone !== 'string' || !/^0[0-9]{9}$/.test(value.phone)) return null
    return {
      phone: value.phone,
      email: typeof value.email === 'string' ? value.email : null,
      sentAt: typeof value.sentAt === 'number' ? value.sentAt : null,
    }
  } catch {
    return null
  }
}

export function writePending(value: PendingVerification): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // shortcut: with storage blocked a reload loses the page state; the guest signs in again to get back here.
  }
}

export function clearPending(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // nothing stored, nothing to clear
  }
}

/** Whole seconds until "Gửi lại mã" is allowed again; 0 when no code was sent or 60 s have passed. */
export function secondsLeft(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0
  return Math.max(0, Math.ceil(RESEND_SECONDS - (now - sentAt) / 1000))
}

/** Stores a just-registered guest for the code step; the countdown starts now. */
export function rememberSentCode(phone: string, email: string): void {
  writePending({ phone, email, sentAt: Date.now() })
}
