import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { ConfirmDialog, ElevatedCard, FormError, RoomsButton, TextField } from '../../components'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import { formatDate, formatMoney } from '../../shared/formatters'
import { SelectField, TextAreaField } from '../buildings/fields'
import { operationKey, useContractAction } from '../contracts/actions'
import type { PaymentMethod } from '../contracts/types'
import { issueInvoice, recordPayment, reissueInvoice, remindInvoice } from './api'
import { paymentMethodLabels } from './status'
import type { InvoiceDetail, MeterKind, ReadingCorrection } from './types'

const invalidateMoney = (client: ReturnType<typeof useQueryClient>, keys: string[]) =>
  Promise.all(keys.map(key => client.invalidateQueries({ queryKey: [key] })))

// BIL-08 / Q-P4-61: every DRAFT can be issued; missing readings come back as the BE's CONFLICT_STATE.
export function IssueAction({ invoice }: { invoice: InvoiceDetail }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [open, setOpen] = useState(false)
  const reviewRequired = invoice.lines.some(line => line.meta?.reviewRequired === true)
  async function issue() {
    await action.run(async () => {
      await issueInvoice(invoice.id)
      await invalidateMoney(client, ['invoices', 'meter-readings', 'dashboard', 'notifications'])
    })
    setOpen(false)
  }
  return <ElevatedCard className="invoices-card"><h2>Phát hành hóa đơn</h2>
    <RoomsButton type="button" disabled={action.pending} onClick={() => setOpen(true)}>Phát hành</RoomsButton>
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={open} title={`Phát hành hóa đơn ${invoice.code}?`} confirmLabel="Phát hành" pending={action.pending}
      description={<><p>Phòng {invoice.contract.room.code}{invoice.periodStart && invoice.periodEnd ? `, kỳ ${formatDate(invoice.periodStart)}–${formatDate(invoice.periodEnd)}` : ''}. Người thuê sẽ nhận email kèm VietQR.</p>
        {reviewRequired && <p><strong>Tiêu thụ bất thường:</strong> hãy kiểm tra lại chỉ số trước khi phát hành.</p>}</>}
      onClose={() => { if (!action.pending) setOpen(false) }} onConfirm={() => void issue()} />
  </ElevatedCard>
}

const paymentSchema = z.object({ method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']), note: z.string().max(2000, 'Ghi chú tối đa 2000 ký tự') })
// BIL-11 / UI-04: the dialog names the BE total; nothing is computed here (UI-06).
export function PaymentAction({ invoice }: { invoice: InvoiceDetail }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [confirmation, setConfirmation] = useState<z.infer<typeof paymentSchema> | null>(null)
  const operation = useRef<{ body: string; key: string } | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<z.infer<typeof paymentSchema>>({ resolver: zodResolver(paymentSchema), defaultValues: { method: 'CASH', note: '' } })
  async function pay() {
    if (!confirmation) return
    const body = { method: confirmation.method, note: confirmation.note.trim() || undefined }
    const serialized = JSON.stringify(body)
    if (operation.current?.body !== serialized) operation.current = { body: serialized, key: operationKey() } // API-05: one key per confirmation
    const ok = await action.run(async () => {
      await recordPayment(invoice.id, body, operation.current!.key)
      operation.current = null
      await invalidateMoney(client, ['invoices', 'dashboard', 'contracts', 'notifications', 'bank-transactions'])
    }, cause => applyApiError(cause, setError, ['method', 'note']))
    setConfirmation(null)
    if (!ok) await client.invalidateQueries({ queryKey: ['invoices', 'detail'] })
  }
  return <ElevatedCard className="invoices-card"><h2>Ghi thu tay</h2>
    <form className="invoices-form" noValidate onSubmit={handleSubmit(values => setConfirmation(values))}>
      <SelectField label="Phương thức nhận tiền" {...register('method')} error={errors.method?.message}>
        {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map(method => <option key={method} value={method}>{paymentMethodLabels[method]}</option>)}
      </SelectField>
      <TextAreaField label="Ghi chú thanh toán" {...register('note')} error={errors.note?.message} />
      <RoomsButton type="submit" disabled={action.pending}>Ghi thu tay</RoomsButton>
      {action.error && <FormError>{action.error}</FormError>}
    </form>
    <ConfirmDialog open={!!confirmation} title="Xác nhận đã nhận tiền" confirmLabel="Đã nhận đủ tiền" pending={action.pending}
      description={<p>Đã nhận đủ <strong>{formatMoney(invoice.total)}</strong> bằng {confirmation && paymentMethodLabels[confirmation.method]} cho hóa đơn {invoice.code}, phòng {invoice.contract.room.code}?</p>}
      onClose={() => { if (!action.pending) setConfirmation(null) }} onConfirm={() => void pay()} />
  </ElevatedCard>
}

// Q-P4-7, Q-P4-26/57: once a day; the second press gets this page's own wording instead of the generic 429 text.
export function RemindAction({ invoice }: { invoice: InvoiceDetail }) {
  const action = useContractAction()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState('')
  async function remind() {
    await action.run(async () => {
      const result = await remindInvoice(invoice.id)
      setDone(`Đã gửi nhắc lúc ${new Date(result.remindedAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}.${result.email ? '' : ' Người thuê chưa xác minh email nên chỉ nhận thông báo trong ứng dụng.'}`)
    }, cause => cause instanceof ApiError && cause.code === 'TOO_MANY_REQUESTS' ? 'Hôm nay đã nhắc hóa đơn này, hãy thử lại vào ngày mai.' : cause instanceof ApiError ? cause.message : 'Không gửi được nhắc thanh toán.')
    setOpen(false)
  }
  return <ElevatedCard className="invoices-card"><h2>Nhắc thanh toán</h2>
    <RoomsButton type="button" variant="outline" disabled={action.pending} onClick={() => setOpen(true)}>Nhắc</RoomsButton>
    {done && <p role="status">{done}</p>}
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={open} title="Gửi nhắc thanh toán?" confirmLabel="Gửi nhắc" pending={action.pending}
      description={<p>Nhắc người thuê trả <strong>{formatMoney(invoice.total)}</strong>{invoice.dueDate ? `, hạn ${formatDate(invoice.dueDate)}` : ''}. Tối đa một lần mỗi ngày.</p>}
      onClose={() => { if (!action.pending) setOpen(false) }} onConfirm={() => void remind()} />
  </ElevatedCard>
}

const meterValue = z.string().trim().refine(value => value === '' || /^\d+$/.test(value), 'Chỉ số phải là số nguyên không âm')
const reissueSchema = z.object({ reason: z.string().trim().min(1, 'Hãy nhập lý do lập lại').max(500, 'Lý do tối đa 500 ký tự'), ELECTRIC: meterValue, WATER: meterValue })
// BIL-12 / Q-P4-24/25: MONTHLY only; the corrections replace this invoice's closing readings and the BE recomputes everything.
export function ReissueAction({ invoice }: { invoice: InvoiceDetail }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const action = useContractAction()
  const [confirmation, setConfirmation] = useState<{ reason: string; corrections: ReadingCorrection[] } | null>(null)
  const operation = useRef<{ body: string; key: string } | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<z.infer<typeof reissueSchema>>({ resolver: zodResolver(reissueSchema), defaultValues: { reason: '', ELECTRIC: '', WATER: '' } })
  const current = (kind: MeterKind) => invoice.meterReadings.find(reading => reading.kind === kind)
  async function reissue() {
    if (!confirmation) return
    const serialized = JSON.stringify(confirmation)
    if (operation.current?.body !== serialized) operation.current = { body: serialized, key: operationKey() }
    await action.run(async () => {
      const result = await reissueInvoice(invoice.id, confirmation, operation.current!.key)
      operation.current = null
      await invalidateMoney(client, ['invoices', 'meter-readings', 'dashboard', 'notifications'])
      void navigate(`/ql/hoa-don/${result.invoiceId}`)
    }, cause => applyApiError(cause, setError, ['reason']))
    setConfirmation(null)
  }
  return <ElevatedCard className="invoices-card"><h2>Lập lại hóa đơn</h2>
    <form className="invoices-form" noValidate onSubmit={handleSubmit(values => setConfirmation({ reason: values.reason,
      corrections: (['ELECTRIC', 'WATER'] as const).flatMap(kind => values[kind] ? [{ kind, value: Number(values[kind]) }] : []) }))}>
      <TextAreaField label="Lý do lập lại" {...register('reason')} error={errors.reason?.message} />
      {current('ELECTRIC') && <TextField label={`Sửa chỉ số điện (đang là ${current('ELECTRIC')!.value})`} type="number" inputMode="numeric" min="0" step="1" {...register('ELECTRIC')} error={errors.ELECTRIC?.message} />}
      {current('WATER') && <TextField label={`Sửa chỉ số nước (đang là ${current('WATER')!.value})`} type="number" inputMode="numeric" min="0" step="1" {...register('WATER')} error={errors.WATER?.message} />}
      <RoomsButton type="submit" variant="outline" disabled={action.pending}>Lập lại</RoomsButton>
      {action.error && <FormError>{action.error}</FormError>}
    </form>
    <ConfirmDialog open={!!confirmation} title={`Lập lại hóa đơn ${invoice.code}?`} confirmLabel="Lập lại" pending={action.pending}
      description={confirmation && <><p>Tổng hiện tại {formatMoney(invoice.total)}. Hóa đơn cũ sẽ bị hủy và hệ thống tính lại toàn bộ.</p>
        <p>Lý do: {confirmation.reason}</p>
        {confirmation.corrections.map(c => <p key={c.kind}>{c.kind === 'ELECTRIC' ? 'Điện' : 'Nước'}: {current(c.kind)?.value} → {c.value}</p>)}</>}
      onClose={() => { if (!action.pending) setConfirmation(null) }} onConfirm={() => void reissue()} />
  </ElevatedCard>
}
