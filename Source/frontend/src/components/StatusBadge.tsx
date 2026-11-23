import type { ReactNode } from 'react'
import type { StatusTone } from '../shared/status-labels'

export function StatusBadge({ children, tone = 'available' }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`rooms-status rooms-status--${tone}`}><span aria-hidden="true" />{children}</span>
}
