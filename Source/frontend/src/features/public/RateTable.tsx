import type { ReactElement } from 'react'
import { formatDate, formatMoney } from '../../shared/formatters'
import { t as translate, useI18n } from '../../shared/i18n'
import type { Lang } from '../../shared/i18n'
import type { PublicBuildingSummary, PublicRateView, PublicRates } from './api'

type WaterMode = PublicBuildingSummary['waterMode']

// The water unit follows the building's water_mode (RATE-03). Empty when a service has no unit.
function unitOf(view: PublicRateView, waterMode: WaterMode, lang: Lang): string {
  if (view.kind === 'ELECTRIC') return '/ kWh'
  if (view.kind === 'WATER') return waterMode === 'PER_M3' ? '/ m³' : translate('room.rates.personUnit', undefined, lang)
  const unitKeys = { ROOM: 'room.rates.roomUnit', PERSON: 'room.rates.personUnit', VEHICLE: 'room.rates.vehicleUnit' } as const
  return view.unit ? translate(unitKeys[view.unit], undefined, lang) : ''
}

function priceText(unitPrice: number, unit: string): string {
  return unit ? `${formatMoney(unitPrice)} ${unit}` : formatMoney(unitPrice)
}

// D-6.1: electric tiers are kWh ranges (0–50, 51–100, từ 101); water and services use their own name.
function labelOf(view: PublicRateView, index: number, lang: Lang): string {
  if (view.kind === 'ELECTRIC') {
    const tier = view.tiers[index]
    const prevUpTo = index === 0 ? 0 : (view.tiers[index - 1].upTo ?? 0)
    if (tier.upTo === null) return translate('room.rates.electricFrom', { start: prevUpTo + 1 }, lang)
    return translate('room.rates.electric', { range: index === 0 ? `0–${tier.upTo}` : `${prevUpTo + 1}–${tier.upTo}` }, lang)
  }
  return view.kind === 'WATER' ? translate('room.rates.water', undefined, lang) : (view.serviceName ?? '')
}

// PUB-03: today's rates from the API, plus the rates that take effect later. The FE shows prices only (UI-06).
export function RateTable({ rates, upcomingRates, waterMode }: {
  rates: PublicRates
  upcomingRates: PublicRateView[]
  waterMode: WaterMode
}): ReactElement {
  const { lang, t } = useI18n()
  const views = [rates.electric, rates.water, ...rates.services].filter((view): view is PublicRateView => view !== null)
  return <div className="public-rates">
    <h3>{t('room.rates.title')}</h3>
    {views.length > 0 && <>
      <p className="public-detail-note">{t('room.rates.current')}</p>
      <dl className="public-rate-list">
        {views.flatMap(view => view.tiers.map((tier, index) => <div key={`${view.kind}-${view.serviceId}-${index}`}>
          <dt>{labelOf(view, index, lang)}</dt>
          <dd>{priceText(tier.unitPrice, unitOf(view, waterMode, lang))}</dd>
        </div>))}
      </dl>
    </>}
    {upcomingRates.map((view, index) => <p key={index} className="public-detail-note">
      {t('room.rates.from', { date: formatDate(view.effectiveFrom), rates: view.tiers.map((tier, i) => `${labelOf(view, i, lang)} ${priceText(tier.unitPrice, unitOf(view, waterMode, lang))}`).join(' · ') })}
    </p>)}
  </div>
}
