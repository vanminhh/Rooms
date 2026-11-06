import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { applyApiError } from '../../shared/form-errors'
import { SelectField, TextAreaField } from '../buildings/fields'
import { plusDays, todayHanoi } from '../pricing/labels'
import { updateViewing } from './api'
import type { ViewingView } from './api'
import { outcomeFormSchema, rescheduleFormSchema, timeSlotChoices } from './schemas'
import type { OutcomeFormValues, RescheduleFormValues } from './schemas'
import './viewings.css'

type ViewingUpdate = Parameters<typeof updateViewing>[1]
type Panel = 'LOST' | 'CANCELLED' | 'RESCHEDULE'

const sourceLabels = { WEB: 'Nguồn: khách tự đặt', MANUAL: 'Nguồn: nhân viên thêm' } as const

// Note panel for "Không thành" (note required) and "Hủy lịch" (note optional). The BE checks the rule too.
function OutcomePanel({ status, pending, onSave, onCancel }: { status: 'LOST' | 'CANCELLED'; pending: boolean; onSave(input: ViewingUpdate): Promise<void>; onCancel(): void }) {
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors } } = useForm<OutcomeFormValues>({
    resolver: zodResolver(outcomeFormSchema(status === 'LOST')),
    defaultValues: { outcomeNote: '' },
  })

  async function submit(values: OutcomeFormValues) {
    setFormError('')
    try {
      await onSave({ status, outcomeNote: values.outcomeNote || undefined })
    } catch (error) {
      setFormError(applyApiError(error, setError, ['outcomeNote']))
    }
  }

  return <form noValidate className="viewings-panel" onSubmit={handleSubmit(submit)}>
    <TextAreaField label="Ghi chú kết quả" rows={2} error={errors.outcomeNote?.message} {...register('outcomeNote')} />
    <FormError>{formError}</FormError>
    <div className="viewings-actions">
      <RoomsButton type="submit" disabled={pending}>Lưu{pending && <Spinner label="Đang xử lý" />}</RoomsButton>
      <RoomsButton variant="outline" onClick={onCancel}>Hủy</RoomsButton>
    </div>
  </form>
}

// VIEW-09: date and slot change together; the form starts from the current values.
function ReschedulePanel({ viewing, pending, onSave, onCancel }: { viewing: ViewingView; pending: boolean; onSave(input: ViewingUpdate): Promise<void>; onCancel(): void }) {
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors } } = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleFormSchema),
    defaultValues: { visitDate: viewing.visitDate, timeSlot: viewing.timeSlot },
  })

  async function submit(values: RescheduleFormValues) {
    setFormError('')
    try {
      await onSave({ visitDate: values.visitDate, timeSlot: values.timeSlot })
    } catch (error) {
      setFormError(applyApiError(error, setError, ['visitDate', 'timeSlot']))
    }
  }

  return <form noValidate className="viewings-panel" onSubmit={handleSubmit(submit)}>
    <TextField label="Ngày xem" type="date" min={todayHanoi()} max={plusDays(todayHanoi(), 30)} error={errors.visitDate?.message} {...register('visitDate')} />
    <SelectField label="Khung giờ" error={errors.timeSlot?.message} {...register('timeSlot')}>
      {timeSlotChoices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
    </SelectField>
    <FormError>{formError}</FormError>
    <div className="viewings-actions">
      <RoomsButton type="submit" disabled={pending}>Lưu{pending && <Spinner label="Đang xử lý" />}</RoomsButton>
      <RoomsButton variant="outline" onClick={onCancel}>Hủy</RoomsButton>
    </div>
  </form>
}

// VIEW-04 buttons: NEW → Xác nhận / Hủy lịch / Đổi ngày/giờ; CONFIRMED → Không thành / Hủy lịch / Đổi ngày/giờ; others none.
// WON is never sent here: it is set only by contract creation (Phase 3).
export function ViewingCard({ viewing }: { viewing: ViewingView }) {
  const queryClient = useQueryClient()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [actionError, setActionError] = useState('')
  const open = viewing.status === 'NEW' || viewing.status === 'CONFIRMED'

  const update = useMutation({
    mutationFn: (input: ViewingUpdate) => updateViewing(viewing.id, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['viewings'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  // Resolves and closes the panel on success; on failure it rejects so the caller shows the message.
  async function save(input: ViewingUpdate) {
    setActionError('')
    await update.mutateAsync(input)
    setPanel(null)
  }

  function change(input: ViewingUpdate) {
    save(input).catch((error: Error) => setActionError(error.message))
  }

  function openPanel(next: Panel) {
    setActionError('')
    setPanel(next)
  }

  return <article className="viewings-card">
    <div className="viewings-card-head">
      <p className="viewings-card-title"><strong>{viewing.roomCode}</strong> · {viewing.buildingName}</p>
      <span className="viewings-status">{viewing.statusLabel}</span>
    </div>
    <p className="viewings-card-meta">{viewing.guestName} · {viewing.guestPhone}</p>
    <p className="viewings-card-meta">{viewing.timeSlotLabel} · {sourceLabels[viewing.source]}</p>
    {viewing.note && <p className="viewings-card-meta">Ghi chú: {viewing.note}</p>}
    {viewing.outcomeNote && <p className="viewings-card-meta">Ghi chú kết quả: {viewing.outcomeNote}</p>}
    {/* Q-FE8B-4: plain links; the Zalo link opens a new tab without giving it access to this page. */}
    <div className="viewings-actions">
      <a className="rooms-button rooms-button--outline" href={`tel:${viewing.guestPhone}`}>Gọi</a>
      <a className="rooms-button rooms-button--outline" href={`https://zalo.me/${viewing.guestPhone}`} target="_blank" rel="noopener noreferrer">Zalo</a>
    </div>
    {open && <div className="viewings-actions">
      {viewing.status === 'NEW' && <RoomsButton disabled={update.isPending} onClick={() => change({ status: 'CONFIRMED' })}>Xác nhận</RoomsButton>}
      {viewing.status === 'CONFIRMED' && <RoomsButton disabled aria-describedby={`won-hint-${viewing.id}`}>Chốt</RoomsButton>}
      {viewing.status === 'CONFIRMED' && <RoomsButton disabled={update.isPending} onClick={() => openPanel('LOST')}>Không thành</RoomsButton>}
      <RoomsButton variant="outline" disabled={update.isPending} onClick={() => openPanel('CANCELLED')}>Hủy lịch</RoomsButton>
      <RoomsButton variant="outline" disabled={update.isPending} onClick={() => openPanel('RESCHEDULE')}>Đổi ngày/giờ</RoomsButton>
    </div>}
    {/* VIEW-05: "Chốt" is set only by contract creation (Phase 3); until then the button is shown off, with the reason. */}
    {open && viewing.status === 'CONFIRMED' && <p id={`won-hint-${viewing.id}`} className="viewings-card-meta">Chốt lịch sẽ có khi làm phần Hợp đồng.</p>}
    <FormError>{actionError}</FormError>
    {open && (panel === 'LOST' || panel === 'CANCELLED') && <OutcomePanel key={panel} status={panel} pending={update.isPending} onSave={save} onCancel={() => setPanel(null)} />}
    {open && panel === 'RESCHEDULE' && <ReschedulePanel viewing={viewing} pending={update.isPending} onSave={save} onCancel={() => setPanel(null)} />}
  </article>
}
