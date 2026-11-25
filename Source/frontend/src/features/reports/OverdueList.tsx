import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ConfirmDialog, FormError, RoomsButton, Spinner, TextField } from '../../components'
import { listInvoices } from '../invoices/api'
import type { InvoiceSummary } from '../invoices/types'
import { useContractAction } from '../contracts/actions'
import { apiRequest } from '../../shared/api'
import { formatDate, formatMoney } from '../../shared/formatters'

function OverdueRow({ row, refresh }: { row: InvoiceSummary; refresh(): Promise<void> }) {
  const [decision, setDecision] = useState<'archive' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const action = useContractAction()
  const label = decision === 'archive' ? 'Cất' : 'Xóa'
  function choose(next: 'archive' | 'cancel') {
    setDecision(next); setReason(''); action.setError(''); setConfirm(next === 'archive')
  }
  async function submit() {
    if (!decision || (decision === 'cancel' && !reason.trim())) return
    await action.run(async () => {
      await apiRequest(`/invoices/${row.id}/${decision}`, { method: 'POST', body: decision === 'cancel' ? { reason: reason.trim() } : undefined })
      await refresh()
      setDecision(null)
    })
    setConfirm(false)
  }
  return <article className="contracts-card dashboard-card dashboard-card--red">
    <h3>{row.code} · {row.contract.room.code}</h3>
    <p>{row.contract.building.name} · {formatMoney(row.total)}{row.dueDate && ' · Hạn ' + formatDate(row.dueDate)}</p>
    <div className="contracts-actions">
      <Link to={`/ql/hoa-don/${row.id}`}>Sửa</Link>
      <RoomsButton variant="outline" onClick={() => choose('archive')}>Cất</RoomsButton>
      <RoomsButton variant="outline" onClick={() => choose('cancel')}>Xóa</RoomsButton>
    </div>
    {decision === 'cancel' && <form className="contracts-form" onSubmit={e => { e.preventDefault(); if (reason.trim()) setConfirm(true) }}>
      <TextField label="Lý do xóa" required value={reason} onChange={e => setReason(e.target.value)} />
      <RoomsButton type="submit" disabled={!reason.trim() || action.pending}>Tiếp tục</RoomsButton>
    </form>}
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={confirm} title={label + ' hóa đơn ' + row.code + '?'} confirmLabel={label} pending={action.pending}
      description={decision === 'archive' ? 'Ẩn hóa đơn khỏi danh sách của Boss. Số tiền vẫn được tính vào công nợ.' : 'Hủy hóa đơn và loại số tiền khỏi công nợ. Lý do: ' + reason}
      onConfirm={() => void submit()} onClose={() => { if (!action.pending) setConfirm(false) }} />
  </article>
}

export function OverdueList({ scope, buildingId, month }: { scope: string; buildingId?: number; month: string }) {
  const [page, setPage] = useState(1)
  const client = useQueryClient()
  const q = useQuery({ queryKey: ['invoices', 'report-overdue', scope, buildingId, month, page],
    queryFn: () => listInvoices({ buildingId, type: 'MONTHLY', overdue: true, status: 'UNPAID', period: month, page }) })
  async function refresh() {
    if (q.data?.data.length === 1 && page > 1) setPage(page - 1)
    await Promise.all(['invoices', 'reports', 'dashboard', 'audit-logs'].map(key => client.invalidateQueries({ queryKey: [key] })))
  }
  return <section><h2>Hóa đơn quá hạn · {month}</h2>
    {q.isPending && <Spinner block label="Đang tải hóa đơn" />}
    {q.isError && <><FormError>{q.error.message}</FormError><RoomsButton onClick={() => void q.refetch()}>Thử lại</RoomsButton></>}
    {q.data && <>{q.data.data.length ? q.data.data.map(row => <OverdueRow key={row.id} row={row} refresh={refresh} />) : <p>Không có hóa đơn quá hạn trong tháng.</p>}
      {q.data.meta.total > q.data.meta.limit && <nav className="contracts-actions" aria-label="Trang hóa đơn quá hạn">
        <RoomsButton disabled={page === 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton>
        <span>Trang {page}</span><RoomsButton disabled={page * q.data.meta.limit >= q.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
      </nav>}</>}
  </section>
}
