import { useEffect, useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../app/auth-context'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { applyApiError } from '../../shared/form-errors'
import type { RoomGridItem } from '../rooms/api'
import { listRoomPrices, newIdempotencyKey, proposeRoomPrice } from './api'
import type { RoomPriceView } from './api'
import { todayHanoi } from './labels'
import { roomPriceFormSchema } from './schemas'
import type { RoomPriceFormValues } from './schemas'
import './pricing.css'

const priceFields = ['price', 'effectiveFrom', 'reason'] as const

// PRC-01/PRC-04/PRC-07: one dialog for a new room price proposal and for "Đề xuất lại" after an expired one.
export function RoomPriceDialog({ room, onClose }: { room: RoomGridItem; onClose(): void }) {
  const titleId = useId()
  const { user } = useAuth()
  const expired = room.pendingProposal?.expired === true
  // PRC-07/FE8B-12: one read of the room's pending proposal, only when expired; a failed read falls back to the room's price.
  const previousQuery = useQuery({
    queryKey: ['room-prices', room.id, 'pending'],
    queryFn: () => listRoomPrices({ roomId: room.id, status: 'PENDING', page: 1, limit: 1, sort: '-createdAt' }),
    enabled: expired,
    retry: false,
  })
  const previous = previousQuery.data?.data.find(row => row.id === room.pendingProposal?.id)

  // Focus goes back to the button that opened the dialog.
  useEffect(() => {
    const opener = document.activeElement
    return () => { if (opener instanceof HTMLElement) opener.focus() }
  }, [])

  return <div className="rooms-dialog-backdrop">
    <div className="rooms-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
      onKeyDown={event => { if (event.key === 'Escape') onClose() }}>
      <h2 id={titleId} className="rooms-dialog-title">{expired ? `Đề xuất lại giá phòng ${room.code}` : `Đề xuất giá phòng ${room.code}`}</h2>
      <div className="rooms-dialog-description">
        <p>{user?.role === 'BOSS' ? 'Bạn là chủ nhà: đề xuất được duyệt ngay.' : 'Đề xuất của bạn sẽ chờ chủ nhà duyệt.'}</p>
        {room.pendingProposal && !expired && <p>Đề xuất đang chờ duyệt cho phòng này sẽ được thay thế.</p>}
      </div>
      {expired && previousQuery.isPending
        ? <Spinner block label="Đang xử lý" />
        : <PriceForm room={room} previous={previous} onClose={onClose} />}
    </div>
  </div>
}

function PriceForm({ room, previous, onClose }: { room: RoomGridItem; previous?: RoomPriceView; onClose(): void }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState('')
  // Idempotency-Key (API-05): a double click replays one result; a changed proposal gets a new key, so it is never refused as a different payload.
  const sent = useRef<{ payload: string; key: string } | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<RoomPriceFormValues>({
    resolver: zodResolver(roomPriceFormSchema),
    defaultValues: { price: previous?.price ?? room.price ?? undefined, effectiveFrom: '', reason: previous?.reason ?? '' },
  })

  const propose = useMutation({
    mutationFn: (values: RoomPriceFormValues) => {
      const input = { roomId: room.id, price: values.price, effectiveFrom: values.effectiveFrom, reason: values.reason?.trim() || undefined }
      const payload = JSON.stringify(input)
      let current = sent.current
      if (current?.payload !== payload) {
        current = { payload, key: newIdempotencyKey() }
        sent.current = current
      }
      return proposeRoomPrice(input, current.key)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rooms'] })
      onClose()
    },
  })

  async function onSubmit(values: RoomPriceFormValues) {
    setFormError('')
    try {
      await propose.mutateAsync(values)
    } catch (error) {
      setFormError(applyApiError(error, setError, priceFields))
    }
  }

  return <form noValidate className="pricing-dialog-form" onSubmit={handleSubmit(onSubmit)}>
    <TextField label="Giá mới (đ/tháng)" type="number" inputMode="numeric" min={1} step={1} error={errors.price?.message} {...register('price', { valueAsNumber: true })} />
    <TextField label="Áp dụng từ ngày" type="date" min={todayHanoi()} error={errors.effectiveFrom?.message} {...register('effectiveFrom')} />
    <TextField label="Lý do (tuỳ chọn)" autoComplete="off" error={errors.reason?.message} {...register('reason')} />
    <FormError>{formError}</FormError>
    <div className="rooms-dialog-actions">
      <RoomsButton variant="outline" onClick={onClose}>Đóng</RoomsButton>
      <RoomsButton type="submit" disabled={propose.isPending}>Gửi đề xuất{propose.isPending && <Spinner label="Đang xử lý" />}</RoomsButton>
    </div>
  </form>
}
