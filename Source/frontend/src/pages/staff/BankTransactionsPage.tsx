import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { ConfirmDialog, ElevatedCard, FilterChip, FormError, RoomsButton, SectionHeading, Spinner, StatusBadge } from '../../components'
import { assignTransaction, bankTxLabels, listBankTransactions, markTransactionRefunded, type BankTransaction, type BankTxStatus } from '../../features/bank/api'
import { TextAreaField } from '../../features/buildings/fields'
import { operationKey, useContractAction } from '../../features/contracts/actions'
import { listInvoices } from '../../features/invoices/api'
import type { InvoiceSummary } from '../../features/invoices/types'
import { formatDate, formatMoney } from '../../shared/formatters'
import '../../features/invoices/invoices.css'

const invalidate = (client: ReturnType<typeof useQueryClient>) =>
  Promise.all(['bank-transactions', 'invoices', 'dashboard', 'notifications'].map(key => client.invalidateQueries({ queryKey: [key] })))

// Q-P4-59: Boss picks among unpaid invoices of the same amount (the BE filters by total); the BE checks the amount again.
function AssignForm({ tx, scope }: { tx: BankTransaction; scope: string }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [picked, setPicked] = useState<InvoiceSummary | null>(null)
  const operation = useRef<{ body: string; key: string } | null>(null)
  const candidates = useQuery({ queryKey: ['invoices', 'list', scope, 'assign', tx.amount], queryFn: () => listInvoices({ status: 'UNPAID', total: tx.amount, limit: 50 }) })
  async function assign() {
    if (!picked) return
    const body = String(picked.id)
    if (operation.current?.body !== body) operation.current = { body, key: operationKey() }
    await action.run(async () => { await assignTransaction(tx.id, picked.id, operation.current!.key); operation.current = null; await invalidate(client) })
    setPicked(null)
  }
  if (candidates.isPending) return <Spinner label="Đang tìm hóa đơn cùng số tiền" />
  if (candidates.isError) return <FormError>{candidates.error.message}</FormError>
  return <div className="invoices-form">
    {candidates.data.data.length === 0 ? <p>Không có hóa đơn chưa thanh toán nào đúng {formatMoney(tx.amount)}.</p>
      : <ul>{candidates.data.data.map(invoice => <li key={invoice.id}>
        <RoomsButton type="button" variant="outline" disabled={action.pending} onClick={() => setPicked(invoice)}>
          Gán vào {invoice.code} · phòng {invoice.contract.room.code}{invoice.contract.tenant ? ` · ${invoice.contract.tenant.fullName}` : ''} · {formatMoney(invoice.total)}
        </RoomsButton></li>)}</ul>}
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={!!picked} title="Gán giao dịch vào hóa đơn?" confirmLabel="Gán vào hóa đơn" pending={action.pending}
      description={picked && <p>Giao dịch {formatMoney(tx.amount)} ("{tx.content}") sẽ thanh toán hóa đơn {picked.code} ({formatMoney(picked.total)}), phòng {picked.contract.room.code}. Không hoàn tác được.</p>}
      onClose={() => { if (!action.pending) setPicked(null) }} onConfirm={() => void assign()} />
  </div>
}

// Q-P4-34: only an unmatched transfer can be marked refunded, with a note.
function RefundForm({ tx }: { tx: BankTransaction }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const operation = useRef<{ body: string; key: string } | null>(null)
  async function refund() {
    if (operation.current?.body !== note.trim()) operation.current = { body: note.trim(), key: operationKey() }
    await action.run(async () => { await markTransactionRefunded(tx.id, note.trim(), operation.current!.key); operation.current = null; await invalidate(client) })
    setOpen(false)
  }
  return <form className="invoices-form" noValidate onSubmit={event => { event.preventDefault(); if (!note.trim()) { setError('Hãy nhập ghi chú hoàn tiền'); return } setError(''); setOpen(true) }}>
    <TextAreaField label="Ghi chú hoàn tiền" value={note} error={error} onChange={event => setNote(event.target.value)} />
    <RoomsButton type="submit" variant="outline" disabled={action.pending}>Đánh dấu đã hoàn tiền</RoomsButton>
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={open} title="Đánh dấu đã hoàn tiền?" confirmLabel="Đã hoàn tiền" pending={action.pending}
      description={<p>Đã trả lại {formatMoney(tx.amount)} cho người chuyển ngoài hệ thống. Không hoàn tác được.</p>}
      onClose={() => { if (!action.pending) setOpen(false) }} onConfirm={() => void refund()} />
  </form>
}

function TransactionCard({ tx, scope }: { tx: BankTransaction; scope: string }) {
  const [mode, setMode] = useState<'assign' | 'refund' | null>(null)
  const status = bankTxLabels[tx.status]
  const received = new Date(tx.receivedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  return <ElevatedCard className="invoices-card">
    <div className="invoices-card-head"><h3>{formatMoney(tx.amount)}</h3><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div>
    <dl className="invoices-facts">
      <div><dt>Nội dung</dt><dd>{tx.content}</dd></div>
      <div><dt>Tài khoản nhận</dt><dd>{tx.accountNumber}</dd></div>
      <div><dt>Thời điểm</dt><dd>{received}</dd></div>
      {tx.invoice && <div><dt>Hóa đơn</dt><dd><Link to={`/ql/hoa-don/${tx.invoice.id}`}>{tx.invoice.code}</Link> · phòng {tx.invoice.roomCode} · {tx.invoice.tenantName}</dd></div>}
      {tx.note && <div><dt>Ghi chú</dt><dd>{tx.note}</dd></div>}
      {tx.handledAt && <div><dt>Xử lý ngày</dt><dd>{formatDate(tx.handledAt.slice(0, 10))}</dd></div>}
    </dl>
    {tx.status === 'UNMATCHED' && <div className="invoices-actions">
      <RoomsButton type="button" variant={mode === 'assign' ? 'primary' : 'outline'} onClick={() => setMode(mode === 'assign' ? null : 'assign')}>Gán vào hóa đơn</RoomsButton>
      <RoomsButton type="button" variant={mode === 'refund' ? 'primary' : 'outline'} onClick={() => setMode(mode === 'refund' ? null : 'refund')}>Đã hoàn tiền</RoomsButton>
    </div>}
    {tx.status === 'UNMATCHED' && mode === 'assign' && <AssignForm tx={tx} scope={scope} />}
    {tx.status === 'UNMATCHED' && mode === 'refund' && <RefundForm tx={tx} />}
  </ElevatedCard>
}

// BANK-05 (Boss only, guarded in routes.tsx). Unmatched first by default; "Báo lỗi thanh toán" comes in Phase 5.
export function BankTransactionsPage() {
  const { user } = useAuth()
  const scope = authScopeKey(user)
  const [status, setStatus] = useState<BankTxStatus | undefined>('UNMATCHED')
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['bank-transactions', 'list', scope, status, page], queryFn: () => listBankTransactions({ status, page }) })
  const chips: [BankTxStatus | undefined, string][] = [['UNMATCHED', 'Chưa khớp'], [undefined, 'Tất cả'], ['MATCHED', 'Đã khớp'], ['ASSIGNED', 'Đã gán'], ['REFUNDED', 'Đã hoàn tiền']]
  return <>
    <SectionHeading description="Tiền chuyển khoản nhận qua ngân hàng. Giao dịch chưa khớp cần gán vào hóa đơn hoặc hoàn lại.">Giao dịch ngân hàng</SectionHeading>
    <div className="invoices-actions" role="group" aria-label="Lọc giao dịch">
      {chips.map(([value, label]) => <FilterChip key={label} selected={status === value} onClick={() => { setStatus(value); setPage(1) }}>{label}</FilterChip>)}
    </div>
    {query.isPending && <Spinner block label="Đang tải giao dịch" />}
    {query.isError && <div className="invoices-state"><FormError>{query.error.message}</FormError><RoomsButton type="button" onClick={() => void query.refetch()}>Thử lại</RoomsButton></div>}
    {query.isSuccess && query.data.data.length === 0 && <ElevatedCard><p>Không có giao dịch phù hợp.</p></ElevatedCard>}
    {query.isSuccess && query.data.data.length > 0 && <div className="invoices-list">{query.data.data.map(tx => <TransactionCard key={tx.id} tx={tx} scope={scope} />)}</div>}
    {query.isSuccess && (page > 1 || query.data.meta.total > query.data.meta.limit) && <nav className="invoices-actions" aria-label="Phân trang giao dịch">
      <RoomsButton type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton>
      <span>Trang {page}</span>
      <RoomsButton type="button" variant="outline" disabled={page * query.data.meta.limit >= query.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
    </nav>}
  </>
}
