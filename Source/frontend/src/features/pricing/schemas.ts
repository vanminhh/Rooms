import { z } from 'zod'
import { todayHanoi } from './labels'

// Mirrors the BE DTOs and ratePlanFieldErrors (PRC-01, RATE-01, RATE-02): same limits and words, so the form shows what the API would say.
const INT32_MAX = 2147483647
const PRICE_MESSAGE = 'Giá phòng phải là số nguyên đồng lớn hơn 0'
const DATE_REQUIRED_MESSAGE = 'Vui lòng chọn ngày hiệu lực'
const DATE_FORMAT_MESSAGE = 'Ngày hiệu lực phải có dạng YYYY-MM-DD'
const DATE_INVALID_MESSAGE = 'Ngày hiệu lực không hợp lệ'
const DATE_PAST_MESSAGE = 'Ngày hiệu lực không được trước hôm nay'
const KIND_MESSAGE = 'Loại biểu giá không hợp lệ'
const SERVICE_MESSAGE = 'Mã dịch vụ không hợp lệ'
const TIERS_MESSAGE = 'Biểu giá phải có ít nhất 1 bậc'
const TIER_MESSAGE = 'Bậc giá không hợp lệ'

// A real calendar day: 2026-02-30 and "2026-1-5" are rejected (the BE's parseDateOnly does the same).
function calendarDateError(value: string): string | null {
  if (value === '') return DATE_REQUIRED_MESSAGE
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return DATE_FORMAT_MESSAGE
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return DATE_INVALID_MESSAGE
  return value < todayHanoi() ? DATE_PAST_MESSAGE : null
}

const effectiveFromSchema = z.string().superRefine((value, ctx) => {
  const message = calendarDateError(value)
  if (message) ctx.addIssue({ code: 'custom', message })
})

// Price in đồng: integer 1..2147483647 (PRC-01, RATE-05).
export const roomPriceFormSchema = z.object({
  price: z.number({ error: PRICE_MESSAGE }).int(PRICE_MESSAGE).min(1, PRICE_MESSAGE).max(INT32_MAX, PRICE_MESSAGE),
  effectiveFrom: effectiveFromSchema,
  reason: z.string().optional(),
})

const tierSchema = z.object({
  tierNo: z.number().int(TIER_MESSAGE).min(1, TIER_MESSAGE).max(INT32_MAX, TIER_MESSAGE),
  upTo: z.number().int(TIER_MESSAGE).min(1, TIER_MESSAGE).max(INT32_MAX, TIER_MESSAGE).nullable(),
  unitPrice: z.number().int(TIER_MESSAGE).min(0, TIER_MESSAGE).max(INT32_MAX, TIER_MESSAGE),
})

// Rules that need no DB, in the BE's order: service iff SERVICE, WATER/SERVICE one unlimited tier, tierNo 1..n, upTo increasing.
function ratePlanError(plan: { kind: string; serviceId?: number; tiers: { tierNo: number; upTo: number | null }[] }):
  { path: 'serviceId' | 'tiers'; message: string } | null {
  const hasService = typeof plan.serviceId === 'number'
  if (plan.kind === 'SERVICE' && !hasService) return { path: 'serviceId', message: 'Biểu giá dịch vụ phải chọn dịch vụ' }
  if (plan.kind !== 'SERVICE' && hasService) return { path: 'serviceId', message: 'Chỉ biểu giá dịch vụ mới gắn với dịch vụ' }

  const { tiers } = plan
  if ((plan.kind === 'WATER' || plan.kind === 'SERVICE') && (tiers.length !== 1 || tiers[0].upTo !== null)) {
    return { path: 'tiers', message: 'Biểu giá nước và dịch vụ chỉ có đúng 1 bậc không giới hạn' }
  }
  let previousUpTo = 0
  for (const [index, tier] of tiers.entries()) {
    if (tier.tierNo !== index + 1) return { path: 'tiers', message: 'Số thứ tự bậc phải liên tục từ 1' }
    const isLast = index === tiers.length - 1
    if (isLast !== (tier.upTo === null)) {
      return { path: 'tiers', message: isLast ? 'Bậc cuối phải không giới hạn' : 'Bậc trước bậc cuối phải có cận trên' }
    }
    if (tier.upTo !== null) {
      if (tier.upTo <= previousUpTo) return { path: 'tiers', message: 'Cận trên của các bậc phải tăng dần' }
      previousUpTo = tier.upTo
    }
  }
  return null
}

export const ratePlanFormSchema = z.object({
  kind: z.enum(['ELECTRIC', 'WATER', 'SERVICE'], { error: KIND_MESSAGE }),
  serviceId: z.number().int(SERVICE_MESSAGE).min(1, SERVICE_MESSAGE).max(INT32_MAX, SERVICE_MESSAGE).optional(),
  effectiveFrom: effectiveFromSchema,
  reason: z.string().optional(),
  tiers: z.array(tierSchema).min(1, TIERS_MESSAGE),
}).superRefine((plan, ctx) => {
  const error = ratePlanError(plan)
  if (error) ctx.addIssue({ code: 'custom', path: [error.path], message: error.message })
})

export type RoomPriceFormValues = z.infer<typeof roomPriceFormSchema>
export type RatePlanFormValues = z.infer<typeof ratePlanFormSchema>
