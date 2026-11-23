import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ConfirmDialog, FormError, RoomsButton, StatusBadge } from '../../components'
import { formatDate, formatMoney } from '../../shared/formatters'
import { useContractAction } from '../contracts/actions'
import { createMissedInvoice } from '../invoices/api'
import type { ContractItem, DashboardView, PeriodItem } from './api'

const period = (item: Pick<PeriodItem, 'periodStart' | 'periodEnd'>) => `${formatDate(item.periodStart)}–${formatDate(item.periodEnd)}`

// BIL-21: a period over 7 days old without an invoice; confirm, create the DRAFT, then go enter its readings.
function MissedPeriod({ item }: { item: PeriodItem }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const action = useContractAction()
  const [open, setOpen] = useState(false)
  async function create() {
    const ok = await action.run(async () => {
      await createMissedInvoice(item.contract.id, item.periodNo)
      await Promise.all(['dashboard', 'invoices', 'meter-readings'].map(key => client.invalidateQueries({ queryKey: [key] })))
    })
    setOpen(false)
    if (ok) void navigate('/ql/chi-so')
  }
  return <li>{item.contract.room.code} · {item.contract.tenant.fullName} · kỳ {period(item)}
    <RoomsButton type="button" variant="outline" disabled={action.pending} onClick={() => setOpen(true)}>Tạo hóa đơn kỳ này</RoomsButton>
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={open} title={`Tạo hóa đơn kỳ ${period(item)}?`} confirmLabel="Tạo hóa đơn" pending={action.pending}
      description={<p>Phòng {item.contract.room.code}, {item.contract.tenant.fullName}. Hóa đơn nháp sẽ chờ chỉ số ở trang Chốt chỉ số.</p>}
      onClose={() => { if (!action.pending) setOpen(false) }} onConfirm={() => void create()} />
  </li>
}

function ContractCard({ title, data, red = false }: { title: string; data?: { count: number; items: ContractItem[] }; red?: boolean }) {
  if (!data?.count) return null
  return <section className={`dashboard-card${red ? ' dashboard-card--red' : ''}`}><h3>{title}</h3>
    <p>{data.count} hợp đồng</p>
    <ul>{data.items.map(item => <li key={item.id}><Link to={`/ql/hop-dong/${item.id}`}>{item.code} · {item.room.code}</Link> · {item.tenant.fullName} · hết hạn {formatDate(item.endDate)}</li>)}</ul>
  </section>
}

// NOTI-06 money groups. Only the API's counts and items are shown (UI-06); empty groups are hidden.
export function MoneyCards({ data }: { data: DashboardView }) {
  const awaiting = data.awaitingReadings
  const missed = data.missedPeriods
  const overdue = data.overdueInvoices
  return <>
    {!!awaiting?.count && <section className="dashboard-card"><h3>Chờ chỉ số</h3>
      <p>{awaiting.count} hóa đơn tháng chờ chỉ số{awaiting.late > 0 && `, trong đó ${awaiting.late} phòng đã quá ngày chốt`}</p>
      <ul>{awaiting.items.map(item => <li key={item.invoiceId}>{item.contract.room.code} · {item.contract.tenant.fullName} · kỳ {period(item)}{item.late && <> · <StatusBadge tone="reserved">Quá ngày chốt</StatusBadge></>}</li>)}</ul>
      <Link to="/ql/chi-so">Sang trang chốt chỉ số</Link>
    </section>}
    {!!missed?.count && <section className="dashboard-card dashboard-card--red"><h3>Kỳ chưa có hóa đơn</h3>
      <p>{missed.count} kỳ đã qua ngày thu hơn 7 ngày mà chưa có hóa đơn</p>
      <ul>{missed.items.map(item => <MissedPeriod key={`${item.contract.id}:${item.periodNo}`} item={item} />)}</ul>
    </section>}
    {!!overdue?.count && <section className="dashboard-card dashboard-card--red"><h3>Hóa đơn quá hạn</h3>
      <p>{overdue.count} hóa đơn quá hạn</p>
      <ul>{overdue.items.map(item => <li key={item.id}><Link to={`/ql/hoa-don/${item.id}`}>{item.code}</Link> · {item.contract.room.code} · {item.contract.tenant.fullName} · {formatMoney(item.total)}{item.dueDate && <> · hạn {formatDate(item.dueDate)}</>} · <StatusBadge tone="overdue">Quá hạn</StatusBadge></li>)}</ul>
      <Link to="/ql/hoa-don?overdue=true">Xem hóa đơn quá hạn</Link>
    </section>}
    <ContractCard title="Hợp đồng sắp hết hạn" data={data.expiringContracts} />
    <ContractCard title="Hợp đồng quá hạn" data={data.expiredContracts} red />
    <ContractCard title="Gia hạn đang chờ chuyển" data={data.renewalsWaiting} />
  </>
}
