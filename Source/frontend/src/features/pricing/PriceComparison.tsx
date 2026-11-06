import { formatMoney } from '../../shared/formatters'
import { isTierComparison } from './api'
import type { PriceChange, RateKind, RatePlanComparison, RateTierView, TierComparison } from './api'
import { formatPercent, tierRangeLabel } from './labels'

// PRC-12: shows the comparison the API sends; the percent and the labels are never recalculated here (UI-06).
export function PriceComparison({ comparison, kind }: { comparison: PriceChange | RatePlanComparison; kind?: RateKind }) {
  return isTierComparison(comparison)
    ? <TierComparisonView comparison={comparison} kind={kind} />
    : <PriceChangeView comparison={comparison} />
}

function PriceChangeView({ comparison }: { comparison: PriceChange }) {
  // No old price, or the API's own label: the new value only, no % and no old value (PRC-12).
  if (comparison.oldValue === null || comparison.label !== null) {
    return <dl className="pricing-tiers">
      <div><dt>{comparison.label ?? 'Giá mới'}</dt><dd>{formatMoney(comparison.newValue)}</dd></div>
    </dl>
  }
  return <dl className="pricing-tiers">
    <div><dt>Hiện tại</dt><dd>{formatMoney(comparison.oldValue)}</dd></div>
    <div><dt>Đề xuất</dt><dd>{formatMoney(comparison.newValue)}{comparison.changePercent !== null && <span> {formatPercent(comparison.changePercent)}</span>}</dd></div>
  </dl>
}

function TierComparisonView({ comparison, kind }: { comparison: TierComparison; kind?: RateKind }) {
  const { oldTiers, newTiers, tierChanges, label } = comparison
  return <div>
    {kind === 'ELECTRIC' && <p className="pricing-plan-meta">Đơn giá điện theo bậc (đ/kWh)</p>}
    {oldTiers === null && <TierTable caption={label ?? 'Giá mới'} tiers={newTiers} />}
    {oldTiers !== null && tierChanges !== null && <table className="pricing-tiers">
      <thead><tr><th>Bậc</th><th>Hiện tại</th><th>Đề xuất</th><th>Thay đổi</th></tr></thead>
      <tbody>{tierChanges.map((change, index) => <tr key={change.tierNo}>
        <td>{tierRangeLabel(newTiers, index)}</td>
        <td>{formatMoney(change.oldValue)}</td>
        <td>{formatMoney(change.newValue)}</td>
        <td>{change.changePercent === null ? '—' : formatPercent(change.changePercent)}</td>
      </tr>)}</tbody>
    </table>}
    {oldTiers !== null && tierChanges === null && <>
      <p className="pricing-plan-meta">Khác số bậc: hiển thị hai bảng, không so sánh phần trăm.</p>
      <TierTable caption={`Hiện tại · ${oldTiers.length} bậc`} tiers={oldTiers} />
      <TierTable caption={`Đề xuất · ${newTiers.length} bậc`} tiers={newTiers} />
    </>}
  </div>
}

function TierTable({ caption, tiers }: { caption: string; tiers: RateTierView[] }) {
  return <table className="pricing-tiers">
    <caption>{caption}</caption>
    <thead><tr><th>Bậc</th><th>Đơn giá (đ)</th></tr></thead>
    <tbody>{tiers.map((tier, index) => <tr key={tier.tierNo}>
      <td>{tierRangeLabel(tiers, index)}</td>
      <td>{formatMoney(tier.unitPrice)}</td>
    </tr>)}</tbody>
  </table>
}
