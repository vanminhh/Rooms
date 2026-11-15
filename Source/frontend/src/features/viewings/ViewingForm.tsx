import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
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
  const [formError, setFormError] = useState('')
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
    mutationFn: (values: ViewingFormValues) => createViewing({
      roomId: values.roomId,
      guestName: values.guestName,
      guestPhone: values.guestPhone,
      visitAt: `${values.visitAt}:00+07:00`,
      note: values.note || undefined,
    }),
    onSuccess: () => {
      void invalidateViewings(queryClient)
      onSaved()
    },
  })

  async function onSubmit(values: ViewingFormValues) {
    if (sending.current) return
    sending.current = true
    setFormError('')
    try {
      await create.mutateAsync(values)
    } catch (error) {
      setFormError(applyApiError(error, setError, viewingFields))
    } finally { sending.current = false }
  }

  return <form noValidate className="viewings-form" onSubmit={event => void handleSubmit(onSubmit)(event)}>
    <SelectField label="Phòng" error={errors.roomId?.message} {...register('roomId', { valueAsNumber: true })}>
      <option value="">—</option>
      {(rooms.data?.data ?? []).map(room => <option key={room.id} value={room.id}>{room.code}</option>)}
    </SelectField>
    {rooms.isError && <FormError>{rooms.error.message}</FormError>}
    <TextField label="Họ tên khách" autoComplete="off" error={errors.guestName?.message} {...register('guestName')} />
    <TextField label="Số điện thoại" type="tel" inputMode="tel" autoComplete="off" error={errors.guestPhone?.message} {...register('guestPhone')} />
    <TextField label="Giờ xem (Hà Nội)" type="datetime-local" step={3600} min={`${todayHanoi()}T08:00`} max={`${plusDays(todayHanoi(), 30)}T19:00`} error={errors.visitAt?.message} {...register('visitAt')} />
    <TextAreaField label="Ghi chú" rows={3} error={errors.note?.message} {...register('note')} />
    <FormError>{formError}</FormError>
    <div className="viewings-form-actions">
      <RoomsButton type="submit" disabled={create.isPending}>Lưu{create.isPending && <Spinner label="Đang xử lý" />}</RoomsButton>
      <RoomsButton variant="outline" onClick={onCancel}>Hủy</RoomsButton>
    </div>
  </form>
}
