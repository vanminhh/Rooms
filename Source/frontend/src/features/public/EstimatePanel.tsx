import type { ReactElement } from 'react'
import { CostBreakdown } from '../../components'
import { formatMoney } from '../../shared/formatters'
import { useI18n } from '../../shared/i18n'
import type { PublicEstimate } from './api'

// ROOM-08 / UI-06: every amount is computed by the BE; the FE only shows them, never adds them up.
export function EstimatePanel({ monthlyEstimate, deposit, estimate }: {
  monthlyEstimate: number
  deposit: number
  estimate: PublicEstimate
}): ReactElement {
  const { t } = useI18n()
  return <section className="public-estimate">
    <p className="rooms-eyebrow">{t('room.estimate.title')}</p>
    <CostBreakdown items={estimate.items} total={monthlyEstimate} note={estimate.meteredNote}
      title={t('room.estimate.tableTitle')} totalLabel={t('room.estimate.total')} />
    {estimate.missing.map(line => <p key={line} className="public-detail-note">{line}</p>)}
    <dl className="public-room-facts">
      <div><dt>{t('room.estimate.deposit')}</dt><dd>{formatMoney(deposit)}</dd></div>
    </dl>
    <p className="public-detail-note">{t('room.estimate.minTerm')}</p>
  </section>
}
