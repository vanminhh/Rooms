import { useRef, useState } from 'react'
import type { Path } from 'react-hook-form'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import type { ServiceView } from '../buildings/api'
import { applyApiError } from '../../shared/form-errors'
import { newIdempotencyKey, proposeRatePlan } from './api'
import type { RateKind, RateTierView } from './api'
import { todayHanoi, waterUnitLabel } from './labels'
import { ratePlanFormSchema } from './schemas'
import type { RatePlanFormValues } from './schemas'
import { useBuildingWaterMode } from './water-mode'
import './pricing.css'

const planFields: Path<RatePlanFormValues>[] = ['effectiveFrom', 'reason', 'serviceId', 'tiers']
// Same words as TIER_MESSAGE in schemas.ts; shown on a tier whose number is empty or out of range.
const TIER_MESSAGE = 'Bậc giá không hợp lệ'

// An empty limit is the open last tier (null); a limit typed on a middle tier is a number.
const toUpTo = (value: string) => (value === '' ? null : Number(value))

interface RatePlanFormProps {
  buildingId: number
  kind: RateKind
  serviceId?: number
  services: ServiceView[]
  prefillTiers?: RateTierView[]
  onSaved(): void
  onCancel(): void
}

// PRC-01 / RATE-01..02: propose a rate plan. Electric has bậc; water and a service have one open tier.
export function RatePlanForm({ buildingId, kind, serviceId, services, prefillTiers, onSaved, onCancel }: RatePlanFormProps) {
  const queryClient = useQueryClient()
  const waterMode = useBuildingWaterMode(buildingId)
  const [formError, setFormError] = useState('')
  // Idempotency-Key (API-05, FE8B-11): the same payload reuses its key; a changed plan gets a new one.
  const sent = useRef<{ payload: string; key: string } | null>(null)
  const isTiered = kind === 'ELECTRIC'
  const serviceName = services.find(service => service.id === serviceId)?.name
  const { register, control, handleSubmit, setError, setValue, getValues, formState: { errors } } = useForm<RatePlanFormValues>({
    resolver: zodResolver(ratePlanFormSchema),
    defaultValues: {
      kind,
      serviceId,
      effectiveFrom: '',
      reason: '',
      tiers: prefillTiers?.length
        ? prefillTiers.map(({ tierNo, upTo, unitPrice }) => ({ tierNo, upTo, unitPrice }))
        : [{ tierNo: 1, upTo: null, unitPrice: Number.NaN }],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'tiers' })

  // RATE-02: tierNo runs 1..n and only the last tier is open (upTo null); the form keeps that while bậc change.
  function addTier() {
    append({ tierNo: fields.length + 1, upTo: null, unitPrice: Number.NaN })
  }

  function removeTier(index: number) {
    remove(index)
    getValues('tiers').forEach((_, position) => setValue(`tiers.${position}.tierNo`, position + 1))
    setValue(`tiers.${getValues('tiers').length - 1}.upTo`, null)
  }

  const propose = useMutation({
    mutationFn: (values: RatePlanFormValues) => {
      const input = {
        buildingId,
        kind,
        serviceId,
        effectiveFrom: values.effectiveFrom,
        reason: values.reason?.trim() || undefined,
        tiers: values.tiers,
      }
      const payload = JSON.stringify(input)
      let current = sent.current
      if (current?.payload !== payload) {
        current = { payload, key: newIdempotencyKey() }
        sent.current = current
      }
      return proposeRatePlan(input, current.key)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rate-plans'] })
      onSaved()
    },
  })

  async function onSubmit(values: RatePlanFormValues) {
    setFormError('')
    try {
      await propose.mutateAsync(values)
    } catch (error) {
      setFormError(applyApiError(error, setError, planFields))
    }
  }

  const unitPriceLabel = kind === 'WATER' ? `Đơn giá nước (${waterUnitLabel(waterMode)})` : 'Đơn giá (đ)'
  // Array-level zod issues (path ['tiers']) land in errors.tiers.root once tiers.N.* is registered (@hookform/resolvers toNestErrors).
  const planError = errors.serviceId?.message ?? errors.tiers?.root?.message ?? errors.tiers?.message

  return <form noValidate className="pricing-form" onSubmit={handleSubmit(onSubmit)}>
    <p className="pricing-form-title">Đề xuất đơn giá{serviceName ? ` · ${serviceName}` : ''}</p>
    <TextField label="Áp dụng từ ngày" type="date" min={todayHanoi()} error={errors.effectiveFrom?.message} {...register('effectiveFrom')} />
    {isTiered
      ? fields.map((field, index) => <div key={field.id} className="pricing-tier">
        <p className="pricing-tier-title">Bậc {index + 1}</p>
        {index === fields.length - 1
          ? <p className="pricing-tier-open">Bậc cuối không giới hạn</p>
          : <TextField label="Cận trên (kWh)" type="number" inputMode="numeric" min={1} step={1} {...register(`tiers.${index}.upTo`, { setValueAs: toUpTo })} />}
        <TextField label="Đơn giá (đ)" type="number" inputMode="numeric" min={0} step={1} error={errors.tiers?.[index] ? TIER_MESSAGE : undefined} {...register(`tiers.${index}.unitPrice`, { valueAsNumber: true })} />
        {fields.length > 1 && <RoomsButton variant="outline" aria-label={`Xóa bậc ${index + 1}`} onClick={() => removeTier(index)}>Xóa bậc</RoomsButton>}
      </div>)
      : <TextField label={unitPriceLabel} type="number" inputMode="numeric" min={0} step={1} error={errors.tiers?.[0] ? TIER_MESSAGE : undefined} {...register('tiers.0.unitPrice', { valueAsNumber: true })} />}
    {isTiered && <div><RoomsButton variant="outline" onClick={addTier}>Thêm bậc</RoomsButton></div>}
    {planError && <p className="rooms-field-error">{planError}</p>}
    <TextField label="Lý do (tuỳ chọn)" autoComplete="off" {...register('reason')} />
    <FormError>{formError}</FormError>
    <div className="rooms-dialog-actions">
      <RoomsButton variant="outline" onClick={onCancel}>Đóng</RoomsButton>
      <RoomsButton type="submit" disabled={propose.isPending}>Gửi đề xuất{propose.isPending && <Spinner label="Đang xử lý" />}</RoomsButton>
    </div>
  </form>
}
