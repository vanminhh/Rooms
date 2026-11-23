import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router'
import { z } from 'zod'
import { ConfirmDialog, ElevatedCard, FormError, RoomsButton, Spinner, TextField } from '../../components'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import { formatDate, formatMoney } from '../../shared/formatters'
import { SelectField, TextAreaField } from '../buildings/fields'
import { paymentMethodLabels } from '../invoices/status'
import { uploadMeterPhoto } from '../meters/api'
import { todayHanoi } from '../pricing/labels'
import { invalidateContracts, operationKey, useContractAction } from './actions'
import { markRefundPaid, previewSettlement, settleContract } from './api'
import type { ContractDetail, ContractSettlement, PaymentMethod, SettlementInput, SettlementView } from './types'

const whole = (message: string) => z.number({ error: message }).int(message).min(0, message).max(2147483647, message)
const schema = z.object({
  moveOutDate: z.string().min(1, 'Hãy chọn ngày trả phòng'),
  electric: whole('Chỉ số điện phải là số nguyên không âm'),
  water: whole('Chỉ số nước phải là số nguyên không âm'),
  damages: whole('Tiền hư hỏng phải là số nguyên đồng'),
  depositForfeit: whole('Tiền cọc giữ lại phải là số nguyên đồng'),
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự'),
})
type Values = z.infer<typeof schema>

// Shows the BE numbers only (UI-06): the dry run is the preview, the confirm dialog repeats it.
function Breakdown({ view }: { view: SettlementView }) {
  return <>
    <dl className="contracts-facts">
      <div><dt>Tiền kỳ cuối</dt><dd>{formatMoney(view.lastPeriodAmount)}</dd></div>
      <div><dt>Tiền phòng còn lại</dt><dd>{formatMoney(view.remainingRent)}</dd></div>
      <div><dt>Nợ cũ</dt><dd>{formatMoney(view.previousDebt)}</dd></div>
      <div><dt>Hư hỏng</dt><dd>{formatMoney(view.damages)}</dd></div>
      <div><dt>Cọc giữ lại</dt><dd>{formatMoney(view.depositForfeit)}</dd></div>
      <div><dt>Tiền cọc đã nhận</dt><dd>{formatMoney(view.deposit)}</dd></div>
      <div><dt>{view.net < 0 ? 'Khách còn phải trả' : 'Phải trả lại khách'}</dt><dd>{formatMoney(view.net < 0 ? view.finalInvoice?.total ?? Math.abs(view.net) : view.refund)}</dd></div>
    </dl>
    <ul>{view.lines.map((line, index) => <li key={index}>{line.label}: {formatMoney(line.amount)}</li>)}</ul>
    {view.mergedDrafts.length > 0 && <p>Hóa đơn nháp gộp vào quyết toán: {view.mergedDrafts.map(id => `TT${id}`).join(', ')}</p>}
    {view.settledInvoices.length > 0 && <p>Hóa đơn chưa trả gộp vào nợ cũ: {view.settledInvoices.map(id => `TT${id}`).join(', ')}</p>}
  </>
}

function MeterPhoto({ label, roomId, value, onChange }: { label: string; roomId: number; value?: string; onChange(url?: string): void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <label className="contracts-check">{label}
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
      const file = event.target.files?.[0]
      if (!file) return
      setBusy(true); setError('')
      uploadMeterPhoto(roomId, file).then(url => onChange(url), cause => setError(cause instanceof Error ? cause.message : 'Tải ảnh lên không thành công')).finally(() => setBusy(false))
    }} />
    {busy && <Spinner label="Đang tải ảnh" />}{value && <span>Đã đính kèm</span>}{error && <FormError>{error}</FormError>}
  </label>
}

function SettlementForm({ contract }: { contract: ContractDetail }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [preview, setPreview] = useState<{ body: string; view: SettlementView } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [photos, setPhotos] = useState<{ electric?: string; water?: string }>({})
  const operation = useRef<{ body: string; key: string } | null>(null)
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema),
    defaultValues: { moveOutDate: todayHanoi(), damages: 0, depositForfeit: 0, note: '' } })
  const watched = useWatch({ control })
  const input = (values: Values): SettlementInput => ({ moveOutDate: values.moveOutDate,
    finalReadings: { electric: values.electric, water: values.water, ...(photos.electric ? { electricPhotoUrl: photos.electric } : {}), ...(photos.water ? { waterPhotoUrl: photos.water } : {}) },
    damages: values.damages, depositForfeit: values.depositForfeit, note: values.note.trim() || undefined })
  const describe = (cause: unknown) => {
    if (cause instanceof ApiError && cause.code === 'METER_VALUE_DECREASED') return `${cause.message}. Nếu đã thay đồng hồ, hãy nhập mốc thay ở trang Chốt chỉ số trước.`
    return applyApiError(cause, (name, error) => setError(name === 'finalReadings' ? 'electric' : name as keyof Values, error), ['moveOutDate', 'damages', 'depositForfeit', 'note', 'finalReadings'])
  }
  // A preview only counts for exactly the values on screen (UI-06): change any field and it must be previewed again.
  const current = JSON.stringify({ ...watched, photos })
  const fresh = preview && preview.body === current ? preview.view : null
  async function settle() {
    if (!fresh) return
    const values = schema.parse(watched)
    const body = JSON.stringify(input(values))
    if (operation.current?.body !== body) operation.current = { body, key: operationKey() }
    await action.run(async () => {
      await settleContract(contract.id, input(values), operation.current!.key)
      operation.current = null; setPreview(null)
      await invalidateContracts(client)
      await Promise.all(['invoices', 'notifications'].map(key => client.invalidateQueries({ queryKey: [key] })))
    }, describe)
    setConfirm(false)
  }
  return <form className="contracts-form" noValidate onSubmit={handleSubmit(values => void action.run(async () =>
    setPreview({ body: current, view: await previewSettlement(contract.id, input(values)) }), describe))}>
    <fieldset className="contracts-fieldset" disabled={action.pending}>
      <div className="contracts-form-grid">
        <TextField label="Ngày trả phòng" type="date" {...register('moveOutDate')} error={errors.moveOutDate?.message} />
        <TextField label="Chỉ số điện cuối (kWh)" type="number" inputMode="numeric" min="0" step="1" {...register('electric', { valueAsNumber: true })} error={errors.electric?.message} />
        <TextField label="Chỉ số nước cuối (m³)" type="number" inputMode="numeric" min="0" step="1" {...register('water', { valueAsNumber: true })} error={errors.water?.message} />
        <TextField label="Tiền hư hỏng (đồng)" type="number" min="0" step="1" {...register('damages', { valueAsNumber: true })} error={errors.damages?.message} />
        <TextField label="Tiền cọc giữ lại (đồng)" type="number" min="0" step="1" {...register('depositForfeit', { valueAsNumber: true })} error={errors.depositForfeit?.message} />
      </div>
      <MeterPhoto label="Ảnh đồng hồ điện (không bắt buộc)" roomId={contract.room.id} value={photos.electric} onChange={url => setPhotos(p => ({ ...p, electric: url }))} />
      <MeterPhoto label="Ảnh đồng hồ nước (không bắt buộc)" roomId={contract.room.id} value={photos.water} onChange={url => setPhotos(p => ({ ...p, water: url }))} />
      <TextAreaField label="Ghi chú (bắt buộc khi có hư hỏng hoặc giữ cọc)" {...register('note')} error={errors.note?.message} />
      <RoomsButton type="submit" variant="outline">Xem trước quyết toán</RoomsButton>
    </fieldset>
    {action.error && <FormError>{action.error}</FormError>}
    {action.error.startsWith('Còn kỳ chưa có hóa đơn') && <Link to="/ql">Sang Việc hôm nay để tạo hóa đơn kỳ đó</Link>}
    {fresh && <><Breakdown view={fresh} /><RoomsButton type="button" disabled={action.pending} onClick={() => setConfirm(true)}>Quyết toán</RoomsButton></>}
    <ConfirmDialog open={confirm && !!fresh} title="Xác nhận quyết toán" confirmLabel="Quyết toán" pending={action.pending}
      description={fresh && <><Breakdown view={fresh} />{fresh.net < 0
        ? <p>Hệ thống sẽ lập hóa đơn quyết toán, hạn thanh toán sau 7 ngày.</p>
        : <p>Không có hóa đơn quyết toán; nhớ ghi "Đã trả lại tiền" sau khi trả khách.</p>}<p>Hợp đồng sẽ kết thúc. Không hoàn tác được.</p></>}
      onClose={() => { if (!action.pending) setConfirm(false) }} onConfirm={() => void settle()} />
  </form>
}

const refundSchema = z.object({ method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']), note: z.string().max(500, 'Ghi chú tối đa 500 ký tự') })
// Q-P3-3, Q-P4-8: once, no undo, only when money is owed back.
function RefundPaid({ settlement }: { settlement: ContractSettlement }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [confirmation, setConfirmation] = useState<z.infer<typeof refundSchema> | null>(null)
  const operation = useRef<{ body: string; key: string } | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<z.infer<typeof refundSchema>>({ resolver: zodResolver(refundSchema), defaultValues: { method: 'CASH', note: '' } })
  async function paid() {
    if (!confirmation) return
    const body = { method: confirmation.method, note: confirmation.note.trim() || undefined }
    if (operation.current?.body !== JSON.stringify(body)) operation.current = { body: JSON.stringify(body), key: operationKey() }
    await action.run(async () => { await markRefundPaid(settlement.id, body, operation.current!.key); operation.current = null; await invalidateContracts(client) },
      cause => applyApiError(cause, setError, ['method', 'note']))
    setConfirmation(null)
  }
  return <form className="contracts-form" noValidate onSubmit={handleSubmit(values => setConfirmation(values))}>
    <SelectField label="Cách trả lại tiền" {...register('method')} error={errors.method?.message}>
      {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map(method => <option key={method} value={method}>{paymentMethodLabels[method]}</option>)}
    </SelectField>
    <TextAreaField label="Ghi chú" {...register('note')} error={errors.note?.message} />
    <RoomsButton type="submit">Đã trả lại tiền</RoomsButton>
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={!!confirmation} title="Đã trả lại tiền cọc?" confirmLabel="Đã trả lại" pending={action.pending}
      description={<p>Đã trả lại khách <strong>{formatMoney(settlement.net)}</strong> bằng {confirmation && paymentMethodLabels[confirmation.method]}. Ghi một lần, không hoàn tác được.</p>}
      onClose={() => { if (!action.pending) setConfirmation(null) }} onConfirm={() => void paid()} />
  </form>
}

// BIL-13..19, Q-P4-53/54: a collapsed card at the end of the page; the form only for ACTIVE, the result after a reload too.
export function SettlementCard({ contract }: { contract: ContractDetail }) {
  const [open, setOpen] = useState(false)
  const s = contract.settlement
  if (!s && contract.status !== 'ACTIVE') return null
  return <ElevatedCard className="contracts-card"><h2>Quyết toán trả phòng</h2>
    {s ? <>
      <dl className="contracts-facts">
        <div><dt>Ngày trả phòng</dt><dd>{formatDate(s.moveOutDate)}</dd></div>
        <div><dt>{s.net < 0 ? 'Khách còn phải trả' : 'Phải trả lại khách'}</dt><dd>{formatMoney(Math.abs(s.net))}</dd></div>
      </dl>
      {s.finalInvoiceId && <Link to={`/ql/hoa-don/${s.finalInvoiceId}`}>Xem hóa đơn quyết toán TT{s.finalInvoiceId}</Link>}
      {s.net > 0 && (s.refundPaidAt ? <p>Đã trả lại tiền lúc {new Date(s.refundPaidAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.</p> : <RefundPaid settlement={s} />)}
      {s.note && <p className="contracts-terms">{s.note}</p>}
    </> : <>
      <RoomsButton type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Thu gọn' : 'Mở quyết toán'}</RoomsButton>
      {open && <SettlementForm contract={contract} />}
    </>}
  </ElevatedCard>
}
