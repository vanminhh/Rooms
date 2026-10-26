import type { ReactNode } from 'react'

export function StatusBadge({ children, tone = 'available' }: { children: ReactNode; tone?: 'available' | 'occupied' | 'reserved' | 'maintenance' }) {
  return <span className={`rooms-status rooms-status--${tone}`}><span aria-hidden="true" />{children}</span>
}
