import { useEffect, useState } from 'react'
import type { ViewingTime } from './api'
import { viewingStart } from './time'

// Re-render at the appointment boundary; the API still authorizes every mutation.
export function useViewingStarted(viewing?: ViewingTime): boolean {
  const [now, setNow] = useState(Date.now)
  const start = viewing ? viewingStart(viewing) : NaN
  useEffect(() => {
    if (!Number.isFinite(start) || start <= now) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, start - Date.now()), 2_147_483_647))
    return () => clearTimeout(timer)
  }, [start, now])
  return Number.isFinite(start) && start <= now
}
