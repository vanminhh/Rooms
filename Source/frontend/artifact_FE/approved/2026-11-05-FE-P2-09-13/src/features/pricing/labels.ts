import type { WaterMode } from '../buildings/api'
import type { RateKind, RatePlanView, RateTierView } from './api'

export const rateKindLabels: Record<RateKind, string> = {
  ELECTRIC: 'Điện',
  WATER: 'Nước',
  SERVICE: 'Dịch vụ',
}

const numberFormatter = new Intl.NumberFormat('vi-VN')

// Tier i starts after tier i-1's upper limit; the last tier (upTo null) has no upper limit (RATE-02).
export function tierRangeLabel(tiers: RateTierView[], index: number): string {
  const start = index === 0 ? 0 : (tiers[index - 1].upTo ?? 0) + 1
  const upTo = tiers[index].upTo
  if (upTo === null) return `Từ ${numberFormatter.format(start)} kWh`
  return `${numberFormatter.format(start)}–${numberFormatter.format(upTo)} kWh`
}

// Formats the percent the API sends; it never recalculates it (UI-06). Minus is U+2212, as in the mockup.
const percentFormatter = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatPercent(value: number): string {
  const text = percentFormatter.format(Math.abs(value))
  if (value > 0) return `+${text}%`
  if (value < 0) return `−${text}%`
  return `${text}%`
}

const hanoiDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

// Business "today" in Hà Nội as YYYY-MM-DD (en-CA prints that form).
export function todayHanoi(): string {
  return hanoiDay.format(new Date())
}

// Date arithmetic in UTC so the day never shifts with the local timezone.
export function plusDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const waterUnitLabels: Record<WaterMode, string> = {
  PER_M3: 'đ/m³',
  PER_PERSON: 'đ/người/kỳ',
}

// Q-FE8B-3: a table lookup for the unit label of the building's water mode, before waterMode has loaded it is "đ".
export function waterUnitLabel(waterMode: WaterMode | undefined): string {
  return waterMode ? waterUnitLabels[waterMode] : 'đ'
}

export interface RatePlanGroups {
  current: RatePlanView | null
  upcoming: RatePlanView[]
  history: RatePlanView[]
}

// Q-FE8B-1: grouping by effectiveFrom date only (no money, no percent). `today` is YYYY-MM-DD.
export function groupRatePlans(rows: RatePlanView[], today: string): RatePlanGroups {
  const newestFirst = (a: RatePlanView, b: RatePlanView) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id
  const approved = rows.filter(row => row.status === 'APPROVED')
  const current = approved.filter(row => row.effectiveFrom <= today).sort(newestFirst)[0] ?? null
  const upcoming = approved
    .filter(row => row.effectiveFrom > today)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id - b.id)
  const history = rows
    .filter(row => row !== current && !upcoming.includes(row))
    .sort(newestFirst)
  return { current, upcoming, history }
}
