import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { applyApiError } from '../../shared/form-errors'
import { TextAreaField } from '../buildings/fields'
import { createRoom, updateRoom } from './api'
import type { RoomView } from './api'
import { roomFormSchema } from './schemas'
import type { RoomFormValues } from './schemas'
import './staff-rooms.css'

const roomFields = ['code', 'floor', 'areaM2', 'maxOccupants'] as const

// "ghế, bàn" becomes ["ghế", "bàn"]; the API takes lists for furniture.
function toList(text: string): string[] {
  return text.split(',').map(item => item.trim()).filter(Boolean)
}

// Create (room undefined) or edit one room (ROOM-01). The room's building is fixed by the caller.
export function RoomForm({ buildingId, room, onSaved, onCancel }: { buildingId: number; room?: RoomView; onSaved?(saved: RoomView): void; onCancel(): void }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors } } = useForm<RoomFormValues>({
    resolver: zodResolver(roomFormSchema),
    defaultValues: room
      ? {
        code: room.code,
        floor: room.floor,
        areaM2: room.areaM2,
        maxOccupants: room.maxOccupants,
        furniture: room.furniture.join(', '),
        description: room.description ?? '',
      }
      // shortcut: 2 is the BE default when maxOccupants is omitted (rooms.service create).
      : { maxOccupants: 2, furniture: '', description: '' },
  })

  const save = useMutation({
    mutationFn: (values: RoomFormValues) => {
      const input = {
        code: values.code,
        floor: values.floor,
        areaM2: values.areaM2,
        maxOccupants: values.maxOccupants,
        furniture: toList(values.furniture),
        description: values.description.trim() || null,
      }
      return room ? updateRoom(room.id, input) : createRoom({ buildingId, ...input })
    },
    onSuccess: saved => onSaved?.(saved),
    // After success or a 409 (capacity, locked building, duplicate code) the list refetches what the server kept.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['rooms'] }),
  })

  async function onSubmit(values: RoomFormValues) {
    setFormError('')
    try {
      await save.mutateAsync(values)
    } catch (error) {
      setFormError(applyApiError(error, setError, roomFields))
    }
  }

  return <form noValidate className="staff-room-form" onSubmit={handleSubmit(onSubmit)}>
    <TextField label="Mã phòng" autoComplete="off" error={errors.code?.message} {...register('code')} />
    <TextField label="Tầng" type="number" inputMode="numeric" min={1} error={errors.floor?.message} {...register('floor', { valueAsNumber: true })} />
    <TextField label="Diện tích (m²)" type="number" inputMode="decimal" step="0.1" min={0.1} max={9999.9} error={errors.areaM2?.message} {...register('areaM2', { valueAsNumber: true })} />
    <TextField label="Số người tối đa" type="number" inputMode="numeric" min={1} error={errors.maxOccupants?.message} {...register('maxOccupants', { valueAsNumber: true })} />
    <TextField label="Nội thất (cách nhau bằng dấu phẩy)" autoComplete="off" {...register('furniture')} />
    <TextAreaField label="Mô tả" rows={4} {...register('description')} />
    <FormError>{formError}</FormError>
    <div className="staff-room-form-actions">
      <RoomsButton type="submit" disabled={save.isPending}>Lưu{save.isPending && <Spinner label="Đang lưu" />}</RoomsButton>
      <RoomsButton variant="outline" onClick={onCancel}>Hủy</RoomsButton>
    </div>
  </form>
}
