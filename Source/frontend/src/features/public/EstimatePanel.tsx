import type { ReactElement } from 'react'
import { CostBreakdown } from '../../components'
import { formatMoney } from '../../shared/formatters'
import type { PublicEstimate } from './api'

// ROOM-08 / UI-06: every amount is computed by the BE; the FE only shows them, never adds them up.
export function EstimatePanel({ monthlyEstimate, deposit, estimate }: {
  monthlyEstimate: number
  deposit: number
  estimate: PublicEstimate
}): ReactElement {
  return <section className="public-estimate">
    <p className="rooms-eyebrow">Ước tính chi phí / tháng</p>
    <CostBreakdown items={estimate.items} total={monthlyEstimate} note={estimate.meteredNote} />
    {estimate.missing.map(line => <p key={line} className="public-detail-note">{line}</p>)}
    <dl className="public-room-facts">
      <div><dt>Tiền cọc · 1 tháng</dt><dd>{formatMoney(deposit)}</dd></div>
    </dl>
    <p className="public-detail-note">Thời hạn tối thiểu 3 tháng</p>
  </section>
}
