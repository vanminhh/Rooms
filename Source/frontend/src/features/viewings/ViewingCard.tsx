import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog, FormError, RoomsButton, Spinner, StatusBadge, TextField } from '../../components'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import { TextAreaField } from '../buildings/fields'
import { plusDays, todayHanoi } from '../pricing/labels'
import { confirmViewing, invalidateViewings, updateViewing, type ViewingView } from './api'
import { viewingTime } from './time'
import { useViewingStarted } from './useViewingStarted'
import { outcomeFormSchema, rescheduleFormSchema, type OutcomeFormValues, type RescheduleFormValues } from './schemas'
import './viewings.css'
import { viewingContractPrefill } from '../contracts/prefill'

type ViewingUpdate = Parameters<typeof updateViewing>[1]
type Panel = 'LOST' | 'CANCELLED' | 'RESCHEDULE'
const sourceLabels = { WEB: 'Nguồn: khách tự đặt', MANUAL: 'Nguồn: nhân viên thêm' } as const

function OutcomePanel({ status, pending, onSave, onCancel }: { status: 'LOST' | 'CANCELLED'; pending: boolean; onSave(input: ViewingUpdate): Promise<void>; onCancel(): void }) {
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors } } = useForm<OutcomeFormValues>({
    resolver: zodResolver(outcomeFormSchema(status)), defaultValues: { outcomeNote: '' },
  })
  async function submit(values: OutcomeFormValues) {
    setFormError('')
    try { await onSave({ status, ...(status === 'CANCELLED' ? { note: values.outcomeNote } : { outcomeNote: values.outcomeNote }) }) }
    catch (error) {
      if (error instanceof ApiError && error.fields?.note) setError('outcomeNote', { type: 'server', message: error.fields.note })
      else setFormError(applyApiError(error, setError, ['outcomeNote']))
    }
  }
  return <form noValidate className="viewings-panel" onSubmit={handleSubmit(submit)}>
    <TextAreaField label={status === 'CANCELLED' ? 'Lý do hủy' : 'Ghi chú kết quả'} rows={2} disabled={pending} error={errors.outcomeNote?.message} {...register('outcomeNote')} />
    <FormError>{formError}</FormError>
    <div className="viewings-actions"><RoomsButton type="submit" disabled={pending}>Lưu{pending && <Spinner label="Đang xử lý" />}</RoomsButton><RoomsButton type="button" variant="outline" disabled={pending} onClick={onCancel}>Quay lại</RoomsButton></div>
  </form>
}
function ReschedulePanel({ viewing, pending, onSave, onCancel }: { viewing: ViewingView; pending: boolean; onSave(input: ViewingUpdate): Promise<void>; onCancel(): void }) {
  const [formError, setFormError] = useState('')
  const sending = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [overlap, setOverlap] = useState<{ values: RescheduleFormValues; message: string } | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleFormSchema),
    defaultValues: { visitAt: viewing.visitAt ? new Date(Date.parse(viewing.visitAt) + 7 * 3600_000).toISOString().slice(0, 16) : '' },
  })
  async function submit(values: RescheduleFormValues, acceptOverlap?: boolean) {
    if (sending.current) return
    sending.current = true
    setFormError('')
    setOverlap(null)
    try { await onSave({ visitAt: `${values.visitAt}:00+07:00`, acceptOverlap }) }
    catch (error) {
      if (error instanceof ApiError && error.code === 'VIEWING_OVERLAP_WARNING') {
        setOverlap({ values: { ...values }, message: error.fields?.visitAt ?? error.message })
      } else setFormError(applyApiError(error, setError, ['visitAt']))
    } finally { sending.current = false }
  }
  const locked = pending || !!overlap
  return <><form ref={formRef} tabIndex={-1} noValidate inert={!!overlap} className="viewings-panel" onSubmit={event => { if (overlap) { event.preventDefault(); return }; void handleSubmit(values => submit(values))(event) }}>
    <p>Thống nhất giờ mới với khách qua điện thoại trước khi lưu.</p>
    <TextField label="Giờ xem (Hà Nội)" type="datetime-local" step={3600} min={`${todayHanoi()}T08:00`} max={`${plusDays(todayHanoi(), 30)}T19:00`} disabled={locked} error={errors.visitAt?.message} {...register('visitAt')} />
    <FormError>{formError}</FormError>
    <div className="viewings-actions"><RoomsButton type="submit" disabled={locked}>Lưu{pending && <Spinner label="Đang xử lý" />}</RoomsButton><RoomsButton type="button" variant="outline" disabled={locked} onClick={onCancel}>Quay lại</RoomsButton></div>
  </form>
  <ConfirmDialog open={!!overlap} returnFocusRef={formRef} title="Lưu ý lịch xem cùng giờ" description={overlap?.message ?? ''}
    confirmLabel="Vẫn đổi giờ" cancelLabel="Chọn giờ khác"
    onConfirm={() => { if (overlap) void submit(overlap.values, true) }} onClose={() => setOverlap(null)} />
  </>
}
export function ViewingCard({ viewing }: { viewing: ViewingView }) {
  const navigate = useNavigate()
  const client = useQueryClient(), sending = useRef(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [actionError, setActionError] = useState('')
  const started = useViewingStarted(viewing)
  const open = viewing.status === 'NEW' || viewing.status === 'CONFIRMED'
  const mutation = useMutation({ mutationFn: (input: ViewingUpdate | { via: 'PHONE' | 'EMAIL' }) =>
    'via' in input ? confirmViewing(viewing.id, input.via) : updateViewing(viewing.id, input),
    onSettled: () => invalidateViewings(client),
  })
  async function save(input: ViewingUpdate | { via: 'PHONE' | 'EMAIL' }) {
    if (sending.current) return
    sending.current = true
    setActionError('')
    try { await mutation.mutateAsync(input); setPanel(null) } finally { sending.current = false }
  }
  function change(input: ViewingUpdate | { via: 'PHONE' | 'EMAIL' }) {
    void save(input).catch((error: Error) => setActionError(error.message))
  }
  return <article className="viewings-card">
    <div className="viewings-card-head"><p className="viewings-card-title"><strong>{viewing.roomCode}</strong> · {viewing.buildingName}</p>
      <StatusBadge tone={open ? 'reserved' : 'maintenance'}>{viewing.statusLabel}</StatusBadge></div>
    <p className="viewings-card-meta">{viewing.guestName} · {viewing.guestPhone}</p>
    <p className="viewings-card-meta">{viewingTime(viewing, 'vi')} · {sourceLabels[viewing.source]}</p>
    {viewing.overdue && <StatusBadge tone="maintenance">Quá giờ, chưa xác nhận</StatusBadge>}
    {viewing.overlap && <StatusBadge tone="maintenance">Trùng giờ</StatusBadge>}
    {viewing.roomLocked && <p className="viewings-card-meta">Phòng hoặc tòa nhà đang khóa/bảo trì. Liên hệ khách để xử lý lịch.</p>}
    {viewing.note && <p className="viewings-card-meta">Ghi chú: {viewing.note}</p>}
    {viewing.outcomeNote && <p className="viewings-card-meta">Ghi chú kết quả: {viewing.outcomeNote}</p>}
    <div className="viewings-actions"><a className="rooms-button rooms-button--outline" href={`tel:${viewing.guestPhone}`}>Gọi</a><a className="rooms-button rooms-button--outline" href={`https://zalo.me/${viewing.guestPhone}`} target="_blank" rel="noopener noreferrer">Zalo</a></div>
    <div className="viewings-actions">
      {viewing.status === 'NEW' && <>
        <RoomsButton disabled={mutation.isPending} onClick={() => change({ via: 'PHONE' })}>Xác nhận</RoomsButton>
        <RoomsButton disabled={mutation.isPending || !viewing.guestEmail} onClick={() => change({ via: 'EMAIL' })}>Gửi email xác nhận</RoomsButton>
      </>}
      {open && <>
        {started && <RoomsButton disabled={mutation.isPending} onClick={() => change({ status: 'DONE' })}>Đã xem</RoomsButton>}
        <RoomsButton variant="outline" disabled={mutation.isPending} onClick={() => setPanel('CANCELLED')}>Hủy</RoomsButton>
        <RoomsButton variant="outline" disabled={mutation.isPending} onClick={() => setPanel('RESCHEDULE')}>Đổi ngày/giờ</RoomsButton>
      </>}
      {viewing.status === 'DONE' && <RoomsButton disabled={mutation.isPending} onClick={() => setPanel('LOST')}>Không thành</RoomsButton>}
      {(viewing.status === 'DONE' || viewing.status === 'CONFIRMED') && <RoomsButton disabled={mutation.isPending} onClick={() => navigate('/ql/hop-dong/moi', { state: { viewing: viewingContractPrefill(viewing) } })}>Chốt</RoomsButton>}
    </div>
    {viewing.status === 'NEW' && !viewing.guestEmail && <p className="viewings-card-meta">Lịch này chưa có email tài khoản. Hãy xác nhận qua điện thoại.</p>}
    <FormError>{actionError}</FormError>
    {((open && panel === 'CANCELLED') || (viewing.status === 'DONE' && panel === 'LOST')) && <OutcomePanel key={panel} status={panel} pending={mutation.isPending} onSave={save} onCancel={() => setPanel(null)} />}
    {open && panel === 'RESCHEDULE' && <ReschedulePanel viewing={viewing} pending={mutation.isPending} onSave={save} onCancel={() => setPanel(null)} />}
  </article>
}
