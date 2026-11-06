import type { ReactElement } from 'react'
import { formatDate, formatMoney } from '../../shared/formatters'
import type { PublicBuildingSummary, PublicRateView, PublicRates } from './api'

type WaterMode = PublicBuildingSummary['waterMode']

const SERVICE_UNIT: Record<NonNullable<PublicRateView['unit']>, string> = {
  ROOM: '/ phòng / kỳ',
  PERSON: '/ người / kỳ',
  VEHICLE: '/ xe / kỳ',
}

// The water unit follows the building's water_mode (RATE-03). Empty when a service has no unit.
function unitOf(view: PublicRateView, waterMode: WaterMode): string {
  if (view.kind === 'ELECTRIC') return '/ kWh'
  if (view.kind === 'WATER') return waterMode === 'PER_M3' ? '/ m³' : '/ người / kỳ'
  return view.unit ? SERVICE_UNIT[view.unit] : ''
}

function priceText(unitPrice: number, unit: string): string {
  return unit ? `${formatMoney(unitPrice)} ${unit}` : formatMoney(unitPrice)
}

// D-6.1: electric tiers are kWh ranges (0–50, 51–100, từ 101); water and services use their own name.
function labelOf(view: PublicRateView, index: number): string {
  if (view.kind === 'ELECTRIC') {
    const tier = view.tiers[index]
    const prevUpTo = index === 0 ? 0 : (view.tiers[index - 1].upTo ?? 0)
    if (tier.upTo === null) return `Điện · từ ${prevUpTo + 1} kWh`
    return index === 0 ? `Điện · 0–${tier.upTo} kWh` : `Điện · ${prevUpTo + 1}–${tier.upTo} kWh`
  }
  return view.kind === 'WATER' ? 'Nước' : (view.serviceName ?? '')
}

// PUB-03: today's rates from the API, plus the rates that take effect later. The FE shows prices only (UI-06).
export function RateTable({ rates, upcomingRates, waterMode }: {
  rates: PublicRates
  upcomingRates: PublicRateView[]
  waterMode: WaterMode
}): ReactElement {
  const views = [rates.electric, rates.water, ...rates.services].filter((view): view is PublicRateView => view !== null)
  return <div className="public-rates">
    <h3>Đơn giá rõ ràng</h3>
    {views.length > 0 && <>
      <p className="public-detail-note">Đang áp dụng</p>
      <dl className="public-rate-list">
        {views.flatMap(view => view.tiers.map((tier, index) => <div key={`${view.kind}-${view.serviceId}-${index}`}>
          <dt>{labelOf(view, index)}</dt>
          <dd>{priceText(tier.unitPrice, unitOf(view, waterMode))}</dd>
        </div>))}
      </dl>
    </>}
    {upcomingRates.map((view, index) => <p key={index} className="public-detail-note">
      Từ {formatDate(view.effectiveFrom)}: {view.tiers.map((tier, i) => `${labelOf(view, i)} ${priceText(tier.unitPrice, unitOf(view, waterMode))}`).join(' · ')}.
    </p>)}
  </div>
}
