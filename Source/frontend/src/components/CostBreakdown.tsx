import { formatMoney } from '../shared/formatters'

export function CostBreakdown({ items, total, note }: { items: { label: string; amount: number }[]; total: number; note?: string }) {
  return <div className="rooms-cost"><p className="rooms-eyebrow">Chi phí minh bạch</p><h3>Một tháng,<br /><em>an tâm ở lại.</em></h3><dl>{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{formatMoney(item.amount)}</dd></div>)}<div className="rooms-cost-total"><dt>Tổng chi phí</dt><dd>{formatMoney(total)}</dd></div></dl>{note && <p className="rooms-cost-note">{note}</p>}</div>
}
