import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { ConfirmDialog, FormError, RoomsButton } from '../../components'
import { TextAreaField } from '../buildings/fields'
import { applyApiError } from '../../shared/form-errors'
import { formatDate, formatMoney } from '../../shared/formatters'
import { approveRatePlan, approveRoomPrice, newIdempotencyKey, rejectRatePlan, rejectRoomPrice } from './api'
import type { PriceChange, RatePlanComparison, RatePlanView, RoomPriceView } from './api'
import { waterUnitLabel } from './labels'
import { PriceComparison } from './PriceComparison'
import { useBuildingWaterMode } from './water-mode'

export type ApprovalItem = { type: 'room'; row: RoomPriceView } | { type: 'rate'; row: RatePlanView }

const REJECT_NOTE_MESSAGE = 'Vui lòng nhập lý do từ chối'
const rejectSchema = z.object({ reviewNote: z.string().trim().min(1, REJECT_NOTE_MESSAGE) })
type RejectValues = z.infer<typeof rejectSchema>
type Decision = { action: 'approve' } | { action: 'reject'; reviewNote: string }

function cardTitle(item: ApprovalItem): string {
  if (item.type === 'room') return `Giá phòng ${item.row.roomCode} · ${item.row.buildingName}`
  const { kind, serviceName, buildingName } = item.row
  if (kind === 'SERVICE') return serviceName ? `Đơn giá dịch vụ ${serviceName} · ${buildingName}` : `Đơn giá dịch vụ · ${buildingName}`
  return `Đơn giá ${kind === 'ELECTRIC' ? 'điện' : 'nước'} · ${buildingName}`
}

// comparison === null (rate plan): show the proposed tiers under "Giá mới", no extra line (PRC-12).
function newOnly(row: RatePlanView): RatePlanComparison {
  return row.kind === 'ELECTRIC'
    ? { oldTiers: null, newTiers: row.tiers, tierChanges: null, label: 'Giá mới' }
    : { oldValue: null, newValue: row.tiers[0].unitPrice, changePercent: null, label: 'Giá mới' }
}

// Q-FE8B-3: the unit follows this card's building (row.buildingId), not the building picked in the header.
function WaterUnit({ buildingId }: { buildingId: number }) {
  return <p className="pricing-plan-meta">Đơn giá nước ({waterUnitLabel(useBuildingWaterMode(buildingId))})</p>
}

// PRC-03/PRC-07/PRC-08/PRC-12: one proposal with its comparison, approve (not when expired) and reject (always).
export function ApprovalCard({ item, onDone }: { item: ApprovalItem; onDone(): void }) {
  const { row } = item
  const kind = item.type === 'rate' ? item.row.kind : undefined
  const comparison: PriceChange | RatePlanComparison = item.type === 'room' ? item.row.comparison : (item.row.comparison ?? newOnly(item.row))
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null)
  const [actionError, setActionError] = useState('')
  // Idempotency-Key (API-05, FE8B-11): the same decision reuses its key; a changed reviewNote gets a new one.
  const sent = useRef<{ payload: string; key: string } | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<RejectValues>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { reviewNote: '' },
  })

  const decide = useMutation({
    mutationFn: (decision: Decision): Promise<RoomPriceView | RatePlanView> => {
      const payload = JSON.stringify({ id: row.id, ...decision })
      let current = sent.current
      if (current?.payload !== payload) {
        current = { payload, key: newIdempotencyKey() }
        sent.current = current
      }
      const key = current.key
      if (item.type === 'room') {
        return decision.action === 'approve' ? approveRoomPrice(row.id, key) : rejectRoomPrice(row.id, decision.reviewNote, key)
      }
      return decision.action === 'approve' ? approveRatePlan(row.id, key) : rejectRatePlan(row.id, decision.reviewNote, key)
    },
    onSuccess: () => {
      setDialog(null)
      onDone()
    },
    onError: error => setActionError(applyApiError(error, setError, ['reviewNote'])),
  })

  function openDialog(next: 'approve' | 'reject') {
    setActionError('')
    setDialog(next)
  }

  const submitReject = (values: RejectValues) => {
    setActionError('')
    decide.mutate({ action: 'reject', reviewNote: values.reviewNote })
  }

  return <>
    <article className="pricing-plan">
      <p className="pricing-plan-title">{cardTitle(item)}</p>
      {item.type === 'rate' && item.row.kind === 'WATER' && <WaterUnit buildingId={row.buildingId} />}
      <p className="pricing-plan-meta">Áp dụng từ {formatDate(row.effectiveFrom)}</p>
      {row.expired && <p className="rooms-field-error">Đã qua ngày áp dụng. Cần quản lý đề xuất lại để duyệt.</p>}
      <PriceComparison comparison={comparison} kind={kind} />
      <div className="pricing-section-head">
        <RoomsButton variant="outline" onClick={() => openDialog('reject')}>Từ chối</RoomsButton>
        {!row.expired && <RoomsButton onClick={() => openDialog('approve')}>Duyệt giá</RoomsButton>}
      </div>
      <ConfirmDialog
        open={dialog === 'approve'}
        title="Duyệt giá mới?"
        confirmLabel="Xác nhận duyệt"
        cancelLabel="Quay lại"
        pending={decide.isPending}
        description={<>
          {item.type === 'room' && <p className="pricing-plan-title">{formatMoney(item.row.price)}</p>}
          <p>Áp dụng từ {formatDate(row.effectiveFrom)}</p>
          {/* PRC-08: fixed sentence, shown on every approval; the FE does not check whether a price would be replaced. */}
          <p>Duyệt có thể thay thế giá đã duyệt chưa có hiệu lực.</p>
          <FormError>{actionError}</FormError>
        </>}
        onConfirm={() => decide.mutate({ action: 'approve' })}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        title="Từ chối đề xuất?"
        confirmLabel="Xác nhận từ chối"
        cancelLabel="Quay lại"
        pending={decide.isPending}
        description={<>
          <TextAreaField label="Lý do từ chối" rows={3} error={errors.reviewNote?.message} {...register('reviewNote')} />
          <FormError>{actionError}</FormError>
        </>}
        onConfirm={() => void handleSubmit(submitReject)()}
        onClose={() => setDialog(null)}
      />
    </article>
    {row.reason && <p className="pricing-plan-meta">{row.reason}</p>}
  </>
}
