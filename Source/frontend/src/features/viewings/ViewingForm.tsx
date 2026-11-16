import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog, FormError, RoomsButton, Spinner, TextField } from '../../components'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import { SelectField, TextAreaField } from '../buildings/fields'
import { plusDays, todayHanoi } from '../pricing/labels'
import { listRooms } from '../rooms/api'
import { createViewing, invalidateViewings } from './api'
import { viewingFormSchema } from './schemas'
import type { ViewingFormValues } from './schemas'
import './viewings.css'

const viewingFields = ['roomId', 'guestName', 'guestPhone', 'visitAt', 'note'] as const

// Staff adds a viewing by hand for a guest who called or messaged (VIEW-03, source MANUAL). The caller picks the building.
export function ViewingForm({ buildingId, onSaved, onCancel }: { buildingId: number; onSaved(): void; onCancel(): void }) {
  const queryClient = useQueryClient()
  const sending = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [formError, setFormError] = useState('')
  const [overlap, setOverlap] = useState<{ values: ViewingFormValues; message: string } | null>(null)
  // shortcut: the room dropdown reads one page of 100 (the BE maximum); paginate it if a building has more active rooms.
  const rooms = useQuery({
    queryKey: ['rooms', 'options', buildingId],
    queryFn: () => listRooms({ buildingId, limit: 100, sort: 'code' }),
  })
  const { register, handleSubmit, setError, formState: { errors } } = useForm<ViewingFormValues>({
    resolver: zodResolver(viewingFormSchema),
    defaultValues: { guestName: '', guestPhone: '', visitAt: '', note: '' },
  })

  const create = useMutation({
    mutationFn: ({ values, acceptOverlap }: { values: ViewingFormValues; acceptOverlap?: boolean }) => createViewing({
      roomId: values.roomId,
      guestName: values.guestName,
      guestPhone: values.guestPhone,
      visitAt: `${values.visitAt}:00+07:00`,
      note: values.note || undefined,
      acceptOverlap,
    }),
    onSuccess: () => {
      void invalidateViewings(queryClient)
      onSaved()
    },
  })

  async function onSubmit(values: ViewingFormValues, acceptOverlap?: boolean) {
    if (sending.current) return
    sending.current = true
    setFormError('')
    setOverlap(null)
    try {
      await create.mutateAsync({ values, acceptOverlap })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VIEWING_OVERLAP_WARNING') {
        setOverlap({ values: { ...values }, message: error.fields?.visitAt ?? error.message })
        return
      }
      setFormError(applyApiError(error, setError, viewingFields))
    } finally { sending.current = false }
  }

  const locked = create.isPending || !!overlap
  return <><form ref={formRef} tabIndex={-1} noValidate inert={!!overlap} className="viewings-form" onSubmit={event => { if (overlap) { event.preventDefault(); return }; void handleSubmit(values => onSubmit(values))(event) }}>
    <SelectField label="Phòng" disabled={locked} error={errors.roomId?.message} {...register('roomId', { valueAsNumber: true })}>
      <option value="">—</option>
      {(rooms.data?.data ?? []).map(room => <option key={room.id} value={room.id}>{room.code}</option>)}
    </SelectField>
    {rooms.isError && <FormError>{rooms.error.message}</FormError>}
    <TextField label="Họ tên khách" disabled={locked} autoComplete="off" error={errors.guestName?.message} {...register('guestName')} />
    <TextField label="Số điện thoại" disabled={locked} type="tel" inputMode="tel" autoComplete="off" error={errors.guestPhone?.message} {...register('guestPhone')} />
    <TextField label="Giờ xem (Hà Nội)" disabled={locked} type="datetime-local" step={3600} min={`${todayHanoi()}T08:00`} max={`${plusDays(todayHanoi(), 30)}T19:00`} error={errors.visitAt?.message} {...register('visitAt')} />
    <TextAreaField label="Ghi chú" disabled={locked} rows={3} error={errors.note?.message} {...register('note')} />
    <FormError>{formError}</FormError>
    <div className="viewings-form-actions">
      <RoomsButton type="submit" disabled={locked}>Lưu{create.isPending && <Spinner label="Đang xử lý" />}</RoomsButton>
      <RoomsButton variant="outline" onClick={onCancel}>Hủy</RoomsButton>
    </div>
  </form>
  <ConfirmDialog open={!!overlap} returnFocusRef={formRef} title="Lưu ý lịch xem cùng giờ" description={overlap?.message ?? ''}
    confirmLabel="Vẫn đặt" cancelLabel="Chọn giờ khác"
    onConfirm={() => { if (overlap) void onSubmit(overlap.values, true) }} onClose={() => setOverlap(null)} />
  </>
}
