import { useState } from 'react'
import { RoomsButton } from '../../components'
import { useI18n } from '../../shared/i18n'
import type { ViewingDay } from '../viewings/api'
import { plusDays, todayHanoi } from '../viewings/time'

export function ViewingCalendar({ days, selectedDay, onSelectDay, disabled }: {
  days: ViewingDay[]; selectedDay: string; onSelectDay(day: string): void; disabled?: boolean
}) {
  const { t, lang } = useI18n()
  const first = todayHanoi(), last = plusDays(first, 30)
  const [month, setMonth] = useState(() => first.slice(0, 7))
  const monthStart = `${month}-01`
  const date = new Date(`${monthStart}T00:00:00Z`)
  const leading = (date.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  const label = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
  const weekday = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', { weekday: 'short', timeZone: 'UTC' })
  function move(delta: number) {
    const next = new Date(`${monthStart}T00:00:00Z`)
    next.setUTCMonth(next.getUTCMonth() + delta)
    setMonth(next.toISOString().slice(0, 7))
  }
  return <section className="viewing-calendar" aria-label={t('viewing.day')}>
    <div className="viewing-calendar-heading">
      <RoomsButton variant="outline" type="button" aria-label={t('viewing.previousMonth')} disabled={disabled || month <= first.slice(0, 7)} onClick={() => move(-1)}>‹</RoomsButton>
      <strong aria-live="polite">{label}</strong>
      <RoomsButton variant="outline" type="button" aria-label={t('viewing.nextMonth')} disabled={disabled || month >= last.slice(0, 7)} onClick={() => move(1)}>›</RoomsButton>
    </div>
    <div className="viewing-calendar-grid">
      {Array.from({ length: 7 }, (_, i) => <span key={`weekday-${i}`} className="viewing-weekday">{weekday.format(new Date(Date.UTC(2026, 0, 5 + i)))}</span>)}
      {Array.from({ length: leading }, (_, i) => <span key={`space-${i}`} aria-hidden="true" />)}
      {Array.from({ length: daysInMonth }, (_, i) => {
        const day = `${month}-${String(i + 1).padStart(2, '0')}`
        const available = day >= first && day <= last && !!days.find(d => d.date === day)?.hours.length
        return <RoomsButton key={day} type="button" variant="outline" disabled={disabled || !available} aria-pressed={day === selectedDay}
          aria-label={`${day} · ${t(day === selectedDay ? 'viewing.selected' : available ? 'viewing.available' : 'viewing.unavailable')}`}
          onClick={() => onSelectDay(day)}>{i + 1}</RoomsButton>
      })}
    </div>
    <div className="viewing-calendar-legend"><span>{t('viewing.available')}</span><span>{t('viewing.unavailable')}</span><span>{t('viewing.selected')}</span></div>
  </section>
}
