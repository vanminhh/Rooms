import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner, StatusBadge, TextField } from '../../components'
import { buildingIdQuery } from '../../features/buildings/api'
import { useBuildingSelection, type BuildingSelection } from '../../features/buildings/building-selection'
import { SelectField } from '../../features/buildings/fields'
import { listInvoices } from '../../features/invoices/api'
import { invoiceLabel, invoiceTypeLabels } from '../../features/invoices/status'
import type { InvoiceSummary, InvoiceType } from '../../features/invoices/types'
import { formatDate, formatMoney } from '../../shared/formatters'
import { invoiceStatusLabels, type InvoiceStatus } from '../../shared/status-labels'
import '../../features/invoices/invoices.css'

export function InvoiceRow({ invoice }: { invoice: InvoiceSummary }) {
  const status = invoiceLabel(invoice)
  return <ElevatedCard className="invoices-card">
    <div className="invoices-card-head">
      <h3><Link to={`/ql/hoa-don/${invoice.id}`}>{invoice.code}</Link> · {invoiceTypeLabels[invoice.type]}</h3>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    </div>
    <dl className="invoices-facts">
      <div><dt>Phòng</dt><dd>{invoice.contract.room.code} · {invoice.contract.building.name}</dd></div>
      {invoice.contract.tenant && <div><dt>Người thuê</dt><dd>{invoice.contract.tenant.fullName}</dd></div>}
      {invoice.periodStart && invoice.periodEnd && <div><dt>Kỳ</dt><dd>{formatDate(invoice.periodStart)}–{formatDate(invoice.periodEnd)}</dd></div>}
      <div><dt>Hạn thanh toán</dt><dd>{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</dd></div>
      <div><dt>Tổng tiền</dt><dd>{formatMoney(invoice.total)}</dd></div>
    </dl>
  </ElevatedCard>
}

// "Quá hạn" is a filter on the BE's derived flag, not a stored status (D-40).
type StatusFilter = InvoiceStatus | 'OVERDUE' | ''

function InvoiceList({ selection, scope }: { selection: BuildingSelection; scope: string }) {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<StatusFilter>(params.get('overdue') === 'true' ? 'OVERDUE' : '') // Q-P4-56: no filter by default
  const [type, setType] = useState<InvoiceType | ''>('')
  const [periodDraft, setPeriodDraft] = useState('')
  const [period, setPeriod] = useState('')
  const [page, setPage] = useState(1)
  const filters = { status, type, period }
  const query = useQuery({
    queryKey: ['invoices', 'list', scope, selection, filters, page],
    queryFn: () => listInvoices({ buildingId: buildingIdQuery(selection), page, limit: 20, type: type || undefined, period: period || undefined,
      ...(status === 'OVERDUE' ? { overdue: true } : { status: status || undefined }) }),
  })
  return <>
    <form className="invoices-toolbar" onSubmit={event => { event.preventDefault(); setPeriod(periodDraft.trim()); setPage(1) }}>
      <SelectField label="Trạng thái" value={status} onChange={event => { setStatus(event.target.value as StatusFilter); setPage(1) }}>
        <option value="">Tất cả trạng thái</option>
        {(Object.keys(invoiceStatusLabels) as InvoiceStatus[]).map(value => <option key={value} value={value}>{invoiceStatusLabels[value]}</option>)}
        <option value="OVERDUE">Quá hạn</option>
      </SelectField>
      <SelectField label="Loại hóa đơn" value={type} onChange={event => { setType(event.target.value as InvoiceType | ''); setPage(1) }}>
        <option value="">Tất cả loại</option>
        {(Object.keys(invoiceTypeLabels) as InvoiceType[]).map(value => <option key={value} value={value}>{invoiceTypeLabels[value]}</option>)}
      </SelectField>
      <TextField label="Kỳ (YYYY-MM)" name="period" placeholder="2026-11" value={periodDraft} onChange={event => setPeriodDraft(event.target.value)} />
      <RoomsButton type="submit">Lọc</RoomsButton>
    </form>
    {query.isPending && <Spinner block label="Đang tải hóa đơn" />}
    {query.isError && <div className="invoices-state"><FormError>{query.error.message}</FormError><RoomsButton type="button" onClick={() => void query.refetch()}>Thử lại</RoomsButton></div>}
    {query.isSuccess && query.data.data.length === 0 && <ElevatedCard><p>Không có hóa đơn phù hợp.</p></ElevatedCard>}
    {query.isSuccess && query.data.data.length > 0 && <div className="invoices-list">{query.data.data.map(invoice => <InvoiceRow key={invoice.id} invoice={invoice} />)}</div>}
    {query.isSuccess && (page > 1 || query.data.meta.total > query.data.meta.limit) && <nav className="invoices-actions" aria-label="Phân trang hóa đơn">
      <RoomsButton type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton>
      <span>Trang {page}</span>
      <RoomsButton type="button" variant="outline" disabled={page * query.data.meta.limit >= query.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
    </nav>}
  </>
}

// BE-P4-18 · UI-02, API-02, API-08.
export function InvoicesPage() {
  const { selectedBuildingId } = useBuildingSelection()
  const { user } = useAuth()
  const scope = authScopeKey(user)
  return <>
    <SectionHeading>Hóa đơn</SectionHeading>
    <InvoiceList key={`${scope}:${selectedBuildingId}`} selection={selectedBuildingId} scope={scope} />
  </>
}
