import type { ViewingTime } from './api'
import { t, type Lang } from '../../shared/i18n'
export { plusDays, todayHanoi } from '../pricing/labels'

export function hourInstant(day: string, hour: number): string {
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+07:00`).toISOString()
}
export function viewingDay(value: Pick<ViewingTime, 'visitAt' | 'visitDate'>): string {
  return value.visitAt ? new Date(Date.parse(value.visitAt) + 7 * 3600_000).toISOString().slice(0, 10) : value.visitDate ?? ''
}
export function viewingStart(value: ViewingTime): number {
  if (value.visitAt) return Date.parse(value.visitAt)
  if (!value.visitDate || !value.timeSlot) return NaN
  return Date.parse(hourInstant(value.visitDate, { MORNING: 8, AFTERNOON: 14, EVENING: 18 }[value.timeSlot]))
}
export function viewingTime(value: ViewingTime, lang: Lang): string {
  const instant = viewingStart(value)
  if (!Number.isFinite(instant)) return '—'
  const date = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', ...(value.visitAt ? { timeStyle: 'short' as const } : {}),
  }).format(instant)
  return value.visitAt || !value.timeSlot ? date : `${date} · ${t(`viewing.slot.${value.timeSlot}`, undefined, lang)}`
}
export function isUpcoming(value: ViewingTime & { status: string }, now = Date.now()): boolean {
  return (value.status === 'NEW' || value.status === 'CONFIRMED') && viewingStart(value) > now
}
