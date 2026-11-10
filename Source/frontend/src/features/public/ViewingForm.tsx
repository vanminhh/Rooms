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
import './booking-panel.css'

function addVisitDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

// Booking form of /phong/:id (FE-P2-17). The success screen is the same for a saved and a honeypot submission (VIEW-12).
export function ViewingForm({ roomId, roomCode }: { roomId: number; roomCode?: string }) {
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')
  const sending = useRef(false)
  const visitDateInput = useRef<HTMLInputElement | null>(null)
  const today = hanoiToday()
  const tomorrow = addVisitDays(today, 1)
  const { control, register, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } = useForm<ViewingFormValues>({
    resolver: zodResolver(viewingFormSchema),
    defaultValues: { guestName: '', guestPhone: '', visitDate: '', note: '', website: '' },
  })
  const visitDate = useWatch({ control, name: 'visitDate' })
  const started = startedSlots(visitDate)
  const visitDateRegistration = register('visitDate')

  function openVisitDatePicker() {
    const input = visitDateInput.current
    if (!input) return
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        // Some browsers expose showPicker() but reject it; focusing keeps the control usable.
      }
    }
    input.focus()
  }

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

  if (sent) return <div className="public-viewing public-viewing-success" role="status">
    <p><strong>Đã nhận yêu cầu xem phòng.</strong> Quản lý sẽ gọi lại để xác nhận lịch hẹn.</p>
    <p className="public-hint">Gửi yêu cầu chưa giữ chỗ phòng.</p>
  </div>

  const submitLabel = roomCode ? `Xác nhận đặt lịch xem phòng ${roomCode}` : 'Gửi yêu cầu xem phòng'

  return <form className="public-viewing public-booking-form" noValidate onSubmit={event => void submitForm(event)}>
    <section className="public-booking-section" aria-labelledby="viewing-date-title">
      <div className="public-booking-section-heading">
        <h3 id="viewing-date-title">Chọn ngày xem phòng</h3>
        {visitDate && <span>{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(`${visitDate}T00:00:00+07:00`))}</span>}
      </div>
      <div className="public-date-shortcuts" role="group" aria-label="Chọn nhanh ngày xem">
        <button type="button" aria-pressed={visitDate === today} onClick={() => setValue('visitDate', today, { shouldValidate: true })}>Hôm nay</button>
        <button type="button" aria-pressed={visitDate === tomorrow} onClick={() => setValue('visitDate', tomorrow, { shouldValidate: true })}>Ngày mai</button>
        <button type="button" aria-pressed={Boolean(visitDate && visitDate !== today && visitDate !== tomorrow)} onClick={openVisitDatePicker}>Chọn ngày khác</button>
      </div>
      <TextField label="Ngày muốn xem" type="date" min={today} max={maxVisitDate()} aria-describedby="viewing-visit-date-hint"
        error={errors.visitDate?.message} {...visitDateRegistration}
        ref={element => { visitDateInput.current = element; visitDateRegistration.ref(element) }} />
      <p id="viewing-visit-date-hint" className="public-hint">Chọn trong 30 ngày tới, theo giờ Hà Nội</p>
    </section>

    <fieldset className="public-slots" aria-describedby={errors.timeSlot ? 'viewing-time-slot-error' : undefined}>
      <legend>Chọn buổi xem</legend>
      <div className="public-slot-grid">
        {TIME_SLOTS.map(slot => {
          const isStarted = started.includes(slot)
          return <label key={slot} className="public-slot">
            <input type="radio" value={slot} disabled={isStarted} {...register('timeSlot')} />
            <span>{timeSlotLabels[slot]}</span>
            {isStarted && <small>Đã bắt đầu</small>}
          </label>
        })}
      </div>
      {errors.timeSlot && <p id="viewing-time-slot-error" className="rooms-field-error">{errors.timeSlot.message}</p>}
    </fieldset>

    <div className="public-booking-fields">
      <TextField label="Họ và tên" autoComplete="name" error={errors.guestName?.message} {...register('guestName')} />
      <TextField label="Số điện thoại" type="tel" inputMode="tel" autoComplete="tel" error={errors.guestPhone?.message} {...register('guestPhone')} />
      <TextField label="Lời nhắn (không bắt buộc)" error={errors.note?.message} {...register('note')} />
    </div>
    {/* Honeypot (VIEW-02): hidden from people and from the tab order; bots that fill it get the same success screen. */}
    <div hidden aria-hidden="true">
      <input tabIndex={-1} autoComplete="off" {...register('website')} />
    </div>
    <FormError>{formError}</FormError>
    <RoomsButton type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang gửi…' : submitLabel}</RoomsButton>
  </form>
}
