import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ConfirmDialog, ElevatedCard, FormError, RoomsButton, TextField } from '../../components'
import { SelectField, TextAreaField } from '../buildings/fields'
import { todayHanoi } from '../pricing/labels'
import { applyApiError } from '../../shared/form-errors'
import { formatMoney } from '../../shared/formatters'
import { invalidateContracts, operationKey, useContractAction } from './actions'
import { cancelContract, moveInContract, previewContractCancellation, recordDepositPayment, resetContractPassword, signContract } from './api'
import { CopyButton, PrivateUploadField } from './ContractDocuments'
import type { CancelContractInput, CancelPreview, ContractAsset, ContractDetail, PaymentMethod, RecordDepositInput } from './types'

export function TemporaryPassword({ password }: { password: string }) {
  return <ElevatedCard className="contracts-card"><h2>Mật khẩu tạm thời</h2>
    <p>Chỉ hiển thị trong lần này. Sao chép và bàn giao cho người thuê; mật khẩu sẽ mất khi rời trang.</p>
    <p><code>{password}</code></p><CopyButton value={password} /></ElevatedCard>
}

export function SignContractForm({ contract, onPassword }: { contract: ContractDetail; onPassword(password: string): void }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [asset, setAsset] = useState<ContractAsset | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirm, setConfirm] = useState(false)
  async function sign() {
    if (!asset) return
    await action.run(async () => {
      const result = await signContract(contract.id, asset)
      if (result.temporaryPassword) onPassword(result.temporaryPassword)
      setAsset(null); setConfirm(false)
      await invalidateContracts(client)
    })
  }
  return <ElevatedCard className="contracts-card"><h2>Ký hợp đồng</h2>
    <p>In và ký bản giấy, sau đó tải bản đã ký lên để mở tài khoản người thuê và hóa đơn cọc.</p>
    <fieldset className="contracts-fieldset" disabled={action.pending}>
      <PrivateUploadField contractId={contract.id} purpose="CONTRACT_SCAN" label="Bản hợp đồng đã ký (JPG, PNG, WebP hoặc PDF)" value={asset} onChange={setAsset} onBusy={setUploading} />
      <RoomsButton type="button" disabled={!asset || uploading || action.pending} onClick={() => setConfirm(true)}>Ký hợp đồng</RoomsButton>
    </fieldset>
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={confirm} title="Xác nhận đã ký hợp đồng" description="Bản tải lên là hợp đồng đã được hai bên ký. Hệ thống sẽ mở tài khoản người thuê và lập hóa đơn tiền cọc nếu có."
      confirmLabel="Xác nhận đã ký" pending={action.pending} onClose={() => { if (!action.pending) setConfirm(false) }} onConfirm={() => void sign()} />
  </ElevatedCard>
}

const paymentSchema = z.object({ method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']), note: z.string() })
const methodLabels: Record<PaymentMethod, string> = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', CARD: 'Thẻ', OTHER: 'Khác' }
export function DepositPaymentForm({ contract }: { contract: ContractDetail }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [confirmation, setConfirmation] = useState<RecordDepositInput | null>(null)
  const operation = useRef<{ body: string; key: string } | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<z.infer<typeof paymentSchema>>({ resolver: zodResolver(paymentSchema), defaultValues: { method: 'CASH', note: '' } })
  const invoice = contract.depositInvoice!
  async function pay() {
    if (!confirmation) return
    const body = JSON.stringify(confirmation)
    if (operation.current?.body !== body) operation.current = { body, key: operationKey() }
    await action.run(async () => {
      await recordDepositPayment(invoice.id, confirmation, operation.current!.key)
      operation.current = null; setConfirmation(null)
      await invalidateContracts(client)
    }, cause => applyApiError(cause, setError, ['method', 'note']))
  }
  return <ElevatedCard className="contracts-card"><h2>Ghi thu tiền cọc</h2>
    <form className="contracts-form" noValidate onSubmit={handleSubmit(values => setConfirmation(values))}>
      <fieldset className="contracts-fieldset" disabled={action.pending || !!confirmation}>
        <SelectField label="Phương thức nhận tiền" {...register('method')} error={errors.method?.message}>
          {(Object.keys(methodLabels) as PaymentMethod[]).map(method => <option key={method} value={method}>{methodLabels[method]}</option>)}
        </SelectField>
        <TextAreaField label="Ghi chú thanh toán" {...register('note')} error={errors.note?.message} />
        <RoomsButton type="submit">Ghi thu tiền cọc</RoomsButton>
      </fieldset>
      {action.error && <FormError>{action.error}</FormError>}
    </form>
    <ConfirmDialog open={!!confirmation} title="Xác nhận đã nhận tiền cọc" description={<p>Đã nhận đủ <strong>{formatMoney(invoice.total)}</strong> bằng {confirmation && methodLabels[confirmation.method]} cho hợp đồng {contract.code}?</p>}
      confirmLabel="Đã nhận đủ tiền" pending={action.pending} onClose={() => { if (!action.pending) setConfirmation(null) }} onConfirm={() => void pay()} />
  </ElevatedCard>
}

const meterNumber = z.number({ error: 'Vui lòng nhập chỉ số nguyên, không âm' }).int('Chỉ số phải là số nguyên').min(0, 'Chỉ số không được âm').max(2147483647, 'Chỉ số vượt giới hạn lưu trữ')
const moveInSchema = z.object({ electric: meterNumber, water: meterNumber, readOn: z.string().min(1, 'Vui lòng nhập ngày đọc chỉ số'), note: z.string().max(2000, 'Ghi chú tối đa 2000 ký tự'),
  replaceElectric: z.boolean(), replaceWater: z.boolean(), electricOld: meterNumber.optional(), waterOld: meterNumber.optional(),
}).superRefine((data, ctx) => {
  if (data.replaceElectric && data.electricOld === undefined) ctx.addIssue({ code: 'custom', path: ['electricOld'], message: 'Nhập chỉ số cuối đồng hồ điện cũ' })
  if (data.replaceWater && data.waterOld === undefined) ctx.addIssue({ code: 'custom', path: ['waterOld'], message: 'Nhập chỉ số cuối đồng hồ nước cũ' })
})
export function MoveInForm({ contract }: { contract: ContractDetail }) {
  const client = useQueryClient()
  const action = useContractAction()
  const { register, control, handleSubmit, setError, setValue, clearErrors, formState: { errors } } = useForm<z.infer<typeof moveInSchema>>({ resolver: zodResolver(moveInSchema), defaultValues: { readOn: todayHanoi(), note: '', replaceElectric: false, replaceWater: false } })
  const [readOn, replaceElectric, replaceWater] = useWatch({ control, name: ['readOn', 'replaceElectric', 'replaceWater'] })
  const needsNote = Math.abs(Date.parse(readOn) - Date.parse(contract.startDate)) > 3 * 86400_000
  return <ElevatedCard className="contracts-card"><h2>Nhận phòng và ghi chỉ số đầu</h2>
    <p>Nhập chỉ số điện và nước hiện tại của phòng để làm mốc cho kỳ thu tiền sau. Không cần ảnh đồng hồ.</p>
    <form className="contracts-form" noValidate onSubmit={handleSubmit(values => void action.run(async () => {
      await moveInContract(contract.id, { electric: values.electric, water: values.water, readOn: values.readOn, note: values.note || undefined,
        ...(values.replaceElectric ? { electricReplacement: { oldMeterFinal: values.electricOld! } } : {}), ...(values.replaceWater ? { waterReplacement: { oldMeterFinal: values.waterOld! } } : {}) })
      await invalidateContracts(client)
    }, cause => applyApiError(cause, (name, error) => setError(name === 'electricReplacement.oldMeterFinal' ? 'electricOld' : name === 'waterReplacement.oldMeterFinal' ? 'waterOld' : name as keyof z.infer<typeof moveInSchema>, error),
      ['electric', 'water', 'readOn', 'note', 'electricReplacement.oldMeterFinal', 'waterReplacement.oldMeterFinal'])))}>
      <fieldset className="contracts-fieldset" disabled={action.pending}>
        <div className="contracts-form-grid">
          <TextField label="Chỉ số điện đầu (kWh)" type="number" min="0" step="1" {...register('electric', { valueAsNumber: true })} error={errors.electric?.message} />
          <TextField label="Chỉ số nước đầu (m³)" type="number" min="0" step="1" {...register('water', { valueAsNumber: true })} error={errors.water?.message} />
          <TextField label="Ngày đọc chỉ số" type="date" {...register('readOn')} error={errors.readOn?.message} />
        </div>
        {(needsNote || errors.note) && <TextAreaField label="Ghi chú (bắt buộc khi lệch ngày vào ở quá 3 ngày)" {...register('note')} error={errors.note?.message} />}
        <label className="contracts-check"><input type="checkbox" {...register('replaceElectric', { onChange: event => { if (!event.target.checked) { setValue('electricOld', undefined); clearErrors('electricOld') } } })} />Đã thay đồng hồ điện</label>
        {replaceElectric && <TextField label="Chỉ số cuối đồng hồ điện cũ" type="number" min="0" step="1" {...register('electricOld', { setValueAs: value => value === '' ? undefined : Number(value) })} error={errors.electricOld?.message} />}
        <label className="contracts-check"><input type="checkbox" {...register('replaceWater', { onChange: event => { if (!event.target.checked) { setValue('waterOld', undefined); clearErrors('waterOld') } } })} />Đã thay đồng hồ nước</label>
        {replaceWater && <TextField label="Chỉ số cuối đồng hồ nước cũ" type="number" min="0" step="1" {...register('waterOld', { setValueAs: value => value === '' ? undefined : Number(value) })} error={errors.waterOld?.message} />}
        <RoomsButton type="submit" disabled={action.pending}>{action.pending ? 'Đang nhận phòng' : 'Xác nhận nhận phòng'}</RoomsButton>
      </fieldset>
      {action.error && <FormError>{action.error}</FormError>}
    </form>
  </ElevatedCard>
}

const cancelSchema = z.object({ reason: z.string().trim().min(1, 'Vui lòng nhập lý do hủy').max(2000, 'Lý do tối đa 2000 ký tự'), depositKept: z.number().int('Tiền giữ lại phải là số nguyên đồng').min(0, 'Tiền giữ lại không được âm') })
export function CancelContractForm({ contract }: { contract: ContractDetail }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [confirmation, setConfirmation] = useState<{ input: CancelContractInput; amounts: CancelPreview } | null>(null)
  const operation = useRef<{ body: string; key: string } | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<z.infer<typeof cancelSchema>>({ resolver: zodResolver(cancelSchema), defaultValues: { reason: '', depositKept: 0 } })
  const describe = (cause: unknown) => applyApiError(cause, setError, ['reason', 'depositKept'])
  async function cancel() {
    if (!confirmation) return
    const input = { ...confirmation.input, expectedDepositReceived: confirmation.amounts.depositReceived }
    const body = JSON.stringify(input)
    if (operation.current?.body !== body) operation.current = { body, key: operationKey() }
    const success = await action.run(async () => { await cancelContract(contract.id, input, operation.current!.key); operation.current = null; await invalidateContracts(client) }, describe)
    // A payment may have changed after preview. Always re-preview after a failed confirmation.
    setConfirmation(null)
    if (!success) await invalidateContracts(client)
  }
  return <ElevatedCard className="contracts-card"><h2>Hủy hợp đồng giữ chỗ</h2>
    <form className="contracts-form" noValidate onSubmit={handleSubmit(input => void action.run(async () => setConfirmation({ input, amounts: await previewContractCancellation(contract.id, input) }), describe))}>
      <fieldset className="contracts-fieldset" disabled={action.pending || !!confirmation}>
        <TextAreaField label="Lý do hủy hợp đồng" {...register('reason')} error={errors.reason?.message} />
        <TextField label="Tiền cọc giữ lại (đồng)" type="number" min="0" step="1" {...register('depositKept', { valueAsNumber: true })} error={errors.depositKept?.message} />
        <RoomsButton type="submit" variant="outline" disabled={action.pending}>Xem số tiền trước khi hủy</RoomsButton>
      </fieldset>
      {action.error && <FormError>{action.error}</FormError>}
    </form>
    <ConfirmDialog open={!!confirmation} title="Xác nhận hủy hợp đồng" description={confirmation && <>
      <p>Cọc đã nhận: {formatMoney(confirmation.amounts.depositReceived)}</p><p>Giữ lại: {formatMoney(confirmation.amounts.depositKept)}</p>
      <p>Hoàn khách: <strong>{formatMoney(confirmation.amounts.refund)}</strong></p><p>{confirmation.input.reason}</p>
    </>} confirmLabel="Hủy hợp đồng" pending={action.pending} onClose={() => { if (!action.pending) setConfirmation(null) }} onConfirm={() => void cancel()} />
  </ElevatedCard>
}

export function ResetPasswordAction({ contractId, onPassword }: { contractId: number; onPassword(password: string): void }) {
  const action = useContractAction()
  const [confirm, setConfirm] = useState(false)
  return <><RoomsButton type="button" variant="outline" disabled={action.pending} onClick={() => setConfirm(true)}>Đặt lại mật khẩu người thuê</RoomsButton>
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={confirm} title="Đặt lại mật khẩu người thuê?" description="Các phiên đăng nhập cũ sẽ bị thu hồi. Mật khẩu tạm mới chỉ hiển thị một lần để bàn giao cho người thuê." confirmLabel="Đặt lại mật khẩu" pending={action.pending}
      onClose={() => { if (!action.pending) setConfirm(false) }} onConfirm={() => void action.run(async () => { const result = await resetContractPassword(contractId); onPassword(result.temporaryPassword); setConfirm(false) })} />
  </>
}
