import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog, FormError, RoomsButton } from '../../components'
import { formatMoney } from '../../shared/formatters'
import { useContractAction, invalidateContracts } from '../contracts/actions'
import { RequestDetails } from './RequestDetails'
import { actionLabels, availableActions, applyRequestAction, requestTypes, requestStatuses, type RequestAction, type StaffRequest } from './api'

export function RequestCard({ row, boss, expanded }: { row: StaffRequest; boss: boolean; expanded: boolean }) {
  const [choice, setChoice] = useState<RequestAction | null>(null)
  const [value, setValue] = useState('')
  const [confirm, setConfirm] = useState(false)
  const action = useContractAction()
  const client = useQueryClient()
  const navigate = useNavigate()
  const renewalUrl = `/ql/hop-dong/${row.contractId}/gia-han?requestId=${row.id}&termMonths=${row.payload.termMonths ?? ''}`
  async function save() {
    if (!choice) return
    const ok = await action.run(async () => {
      await applyRequestAction(row.id, choice, value)
      await Promise.all([invalidateContracts(client), ...['requests', 'invoices', 'bank-transactions'].map(key => client.invalidateQueries({ queryKey: [key] }))])
      if (choice === 'approve' && row.type === 'RENEW') navigate(renewalUrl)
    })
    setConfirm(false)
    if (ok) setChoice(null)
  }
  return <details open={expanded || undefined}><summary>{row.title} · #{row.id}
    <small>{requestTypes[row.type]} · {requestStatuses[row.status]}</small></summary>
    <RequestDetails row={row} />
    {row.type === 'RENEW' && row.status === 'APPROVED' && <Link to={row.payload.contractId ? `/ql/hop-dong/${row.payload.contractId}` : renewalUrl}>{row.payload.contractId ? 'Xem hợp đồng gia hạn' : 'Lập hợp đồng gia hạn'}</Link>}
    <div>{availableActions(row, boss).map(key => <RoomsButton key={key} type="button" variant="outline" disabled={action.pending} onClick={() => {
      setChoice(key); setValue(''); action.setError('')
    }}>{actionLabels[key]}</RoomsButton>)}</div>
    {choice && <form onSubmit={event => { event.preventDefault(); setConfirm(true) }}>
      {choice === 'reject' && <label>Lý do từ chối<input required pattern=".*\S.*" value={value} onChange={e => setValue(e.target.value)} /></label>}
      {choice === 'finish' && <label>Chi phí lần sửa này (đ)<input type="number" required min="0" max="2147483647" step="1" value={value} onChange={e => setValue(e.target.value)} /></label>}
      {choice === 'resolve' && <p>Kiểm tra hóa đơn và tiền thực nhận trước khi xác nhận. Nếu hóa đơn đã thanh toán đủ, hệ thống đóng yêu cầu mà không thu thêm.</p>}
      {choice === 'resolve' && row.status === 'ESCALATED' && <label>Mã giao dịch ngân hàng chưa ghép (bỏ trống nếu hóa đơn đã thanh toán đủ)<input type="number" min="1" max="2147483647" step="1" value={value} onChange={e => setValue(e.target.value)} /></label>}
      <RoomsButton type="submit" disabled={action.pending || (choice === 'reject' && !value.trim())}>Tiếp tục · {actionLabels[choice]}</RoomsButton>
      <RoomsButton type="button" variant="outline" disabled={action.pending} onClick={() => setChoice(null)}>Hủy</RoomsButton>
    </form>}
    {action.error && <FormError>{action.error}</FormError>}
    {choice && <ConfirmDialog open={confirm} title={actionLabels[choice] + '?'} description={<>
      {row.title}{value && <> · {choice === 'finish' ? formatMoney(Number(value)) : value}</>}
      {choice === 'approve' && row.type === 'MOVE_OUT' && row.payload.remainingRent != null &&
        <p>Tiền thuê các kỳ còn lại: {formatMoney(row.payload.remainingRent)}</p>}
    </>}
      confirmLabel={actionLabels[choice]} pending={action.pending} onClose={() => { if (!action.pending) setConfirm(false) }} onConfirm={() => void save()} />}
  </details>
}
