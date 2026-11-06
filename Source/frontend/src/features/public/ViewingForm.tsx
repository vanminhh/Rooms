import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormError, RoomsButton, TextField } from '../../components'
import { applyApiError } from '../../shared/form-errors'
import { createPublicViewing } from './api'
import { TIME_SLOTS, hanoiToday, maxVisitDate, startedSlots, timeSlotLabels, viewingFormSchema } from './viewing-schema'
import type { ViewingFormValues } from './viewing-schema'
import './public.css'

// Booking form of /phong/:id (FE-P2-17). The success screen is the same for a saved and a honeypot submission (VIEW-12).
export function ViewingForm({ roomId }: { roomId: number }) {
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')
  const sending = useRef(false)
  const { control, register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ViewingFormValues>({
    resolver: zodResolver(viewingFormSchema),
    defaultValues: { guestName: '', guestPhone: '', visitDate: '', note: '', website: '' },
  })
  const visitDate = useWatch({ control, name: 'visitDate' })
  const started = startedSlots(visitDate)

  async function onSubmit({ note, website, ...values }: ViewingFormValues) {
    setFormError('')
    try {
      await createPublicViewing({ roomId, ...values, ...(note ? { note } : {}), ...(website ? { website } : {}) })
      setSent(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, ['guestName', 'guestPhone', 'visitDate', 'timeSlot', 'note']))
    }
  }

  // Guard at the submit event: a second submit must not start another handleSubmit run, because its
  // isSubmitting:false would overwrite the state of the first one while its request is still pending (UI-09).
  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    try {
      await handleSubmit(onSubmit)(event)
    } finally {
      sending.current = false
    }
  }

  if (sent) return <div className="public-viewing" role="status">
    <p>Đã nhận yêu cầu xem phòng. Quản lý sẽ gọi lại để xác nhận lịch hẹn.</p>
    <p className="public-hint">Gửi yêu cầu chưa giữ chỗ phòng.</p>
  </div>

  return <form className="public-viewing" noValidate onSubmit={event => void submitForm(event)}>
    <TextField label="Họ và tên" autoComplete="name" error={errors.guestName?.message} {...register('guestName')} />
    <TextField label="Số điện thoại" type="tel" inputMode="tel" autoComplete="tel" error={errors.guestPhone?.message} {...register('guestPhone')} />
    <TextField label="Ngày muốn xem" type="date" min={hanoiToday()} max={maxVisitDate()} aria-describedby="viewing-visit-date-hint"
      error={errors.visitDate?.message} {...register('visitDate')} />
    <p id="viewing-visit-date-hint" className="public-hint">Chọn trong 30 ngày tới, theo giờ Hà Nội</p>
    <fieldset className="public-slots" aria-describedby={errors.timeSlot ? 'viewing-time-slot-error' : undefined}>
      <legend>Khung giờ</legend>
      {TIME_SLOTS.map(slot => {
        const isStarted = started.includes(slot)
        return <label key={slot} className="public-slot">
          <input type="radio" value={slot} disabled={isStarted} {...register('timeSlot')} />
          <span>{timeSlotLabels[slot]}</span>
          {isStarted && <small>Đã bắt đầu</small>}
        </label>
      })}
      {errors.timeSlot && <p id="viewing-time-slot-error" className="rooms-field-error">{errors.timeSlot.message}</p>}
    </fieldset>
    <TextField label="Lời nhắn (không bắt buộc)" error={errors.note?.message} {...register('note')} />
    {/* Honeypot (VIEW-02): hidden from people and from the tab order; bots that fill it get the same success screen. */}
    <div hidden aria-hidden="true">
      <input tabIndex={-1} autoComplete="off" {...register('website')} />
    </div>
    <FormError>{formError}</FormError>
    <RoomsButton type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang gửi…' : 'Gửi yêu cầu xem phòng'}</RoomsButton>
  </form>
}
