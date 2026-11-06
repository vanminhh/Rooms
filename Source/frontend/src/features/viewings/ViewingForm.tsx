import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { applyApiError } from '../../shared/form-errors'
import { SelectField, TextAreaField } from '../buildings/fields'
import { plusDays, todayHanoi } from '../pricing/labels'
import { listRooms } from '../rooms/api'
import { createViewing } from './api'
import { timeSlotChoices, viewingFormSchema } from './schemas'
import type { ViewingFormValues } from './schemas'
import './viewings.css'

const viewingFields = ['roomId', 'guestName', 'guestPhone', 'visitDate', 'timeSlot', 'note'] as const

// Staff adds a viewing by hand for a guest who called or messaged (VIEW-03, source MANUAL). The caller picks the building.
export function ViewingForm({ buildingId, onSaved, onCancel }: { buildingId: number; onSaved(): void; onCancel(): void }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState('')
  // shortcut: the room dropdown reads one page of 100 (the BE maximum); paginate it if a building has more active rooms.
  const rooms = useQuery({
    queryKey: ['rooms', 'options', buildingId],
    queryFn: () => listRooms({ buildingId, limit: 100, sort: 'code' }),
  })
  const { register, handleSubmit, setError, formState: { errors } } = useForm<ViewingFormValues>({
    resolver: zodResolver(viewingFormSchema),
    defaultValues: { guestName: '', guestPhone: '', visitDate: '', note: '' },
  })

  const create = useMutation({
    mutationFn: (values: ViewingFormValues) => createViewing({
      roomId: values.roomId,
      guestName: values.guestName,
      guestPhone: values.guestPhone,
      visitDate: values.visitDate,
      timeSlot: values.timeSlot,
      note: values.note?.trim() || undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['viewings'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onSaved()
    },
  })

  async function onSubmit(values: ViewingFormValues) {
    setFormError('')
    try {
      await create.mutateAsync(values)
    } catch (error) {
      setFormError(applyApiError(error, setError, viewingFields))
    }
  }

  return <form noValidate className="viewings-form" onSubmit={handleSubmit(onSubmit)}>
    <SelectField label="Phòng" error={errors.roomId?.message} {...register('roomId', { valueAsNumber: true })}>
      <option value="">—</option>
      {(rooms.data?.data ?? []).map(room => <option key={room.id} value={room.id}>{room.code}</option>)}
    </SelectField>
    {rooms.isError && <FormError>{rooms.error.message}</FormError>}
    <TextField label="Họ tên khách" autoComplete="off" error={errors.guestName?.message} {...register('guestName')} />
    <TextField label="Số điện thoại" type="tel" inputMode="tel" autoComplete="off" error={errors.guestPhone?.message} {...register('guestPhone')} />
    <TextField label="Ngày xem" type="date" min={todayHanoi()} max={plusDays(todayHanoi(), 30)} error={errors.visitDate?.message} {...register('visitDate')} />
    <SelectField label="Khung giờ" error={errors.timeSlot?.message} {...register('timeSlot')}>
      <option value="">—</option>
      {timeSlotChoices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
    </SelectField>
    <TextAreaField label="Ghi chú" rows={3} error={errors.note?.message} {...register('note')} />
    <FormError>{formError}</FormError>
    <div className="viewings-form-actions">
      <RoomsButton type="submit" disabled={create.isPending}>Lưu{create.isPending && <Spinner label="Đang xử lý" />}</RoomsButton>
      <RoomsButton variant="outline" onClick={onCancel}>Hủy</RoomsButton>
    </div>
  </form>
}
