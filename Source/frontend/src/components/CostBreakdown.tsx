import { formatMoney } from '../shared/formatters'

export function CostBreakdown({ items, total, note }: { items: { label: string; amount: number }[]; total: number; note?: string }) {
  return <div className="rooms-cost"><h3>Chi phí mỗi tháng</h3><dl>{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{formatMoney(item.amount)}</dd></div>)}<div className="rooms-cost-total"><dt>Ước tính mỗi tháng</dt><dd>{formatMoney(total)}</dd></div></dl>{note && <p className="rooms-cost-note">{note}</p>}</div>
}
