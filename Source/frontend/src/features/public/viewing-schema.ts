import { z } from 'zod'

// Mirrors PublicViewingDto (VIEW-01, VIEW-02) and the date window of VIEW-08; messages copy the BE text.
export const TIME_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const
export type TimeSlot = (typeof TIME_SLOTS)[number]

export const timeSlotLabels: Record<TimeSlot, string> = {
  MORNING: 'Sáng (8:00–11:00)',
  AFTERNOON: 'Chiều (14:00–17:00)',
  EVENING: 'Tối (18:00–20:00)',
}

// Only used to disable a slot that already started; the BE decides (VIEW-08, A-5).
export const slotStartHour: Record<TimeSlot, number> = { MORNING: 8, AFTERNOON: 14, EVENING: 18 }

// Asia/Ho_Chi_Minh has no DST, so a fixed +07:00 offset is exact.
const HANOI_OFFSET_MS = 7 * 3600_000
const DAY_MS = 86_400_000

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export function hanoiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + HANOI_OFFSET_MS).toISOString().slice(0, 10)
}

export function maxVisitDate(now: Date = new Date()): string {
  return addDays(hanoiToday(now), 30)
}

// Slots whose start time has passed today (Hà Nội clock), matching the BE check.
export function startedSlots(visitDate: string, now: Date = new Date()): TimeSlot[] {
  if (visitDate !== hanoiToday(now)) return []
  const minutes = Math.floor((now.getTime() + HANOI_OFFSET_MS) / 60_000) % 1440
  return TIME_SLOTS.filter(slot => minutes >= slotStartHour[slot] * 60)
}

export const viewingFormSchema = z.object({
  guestName: z.string().min(2, 'Họ tên phải từ 2 đến 100 ký tự').max(100, 'Họ tên phải từ 2 đến 100 ký tự'),
  guestPhone: z.string().regex(/^0[0-9]{9}$/, 'Số điện thoại không hợp lệ'),
  visitDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày xem không hợp lệ')
    .refine(day => day >= hanoiToday() && day <= maxVisitDate(), 'Ngày xem phải từ hôm nay đến 30 ngày tới'),
  timeSlot: z.enum(TIME_SLOTS, { error: 'Khung giờ không hợp lệ' }),
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự'),
  website: z.string(),
})

export type ViewingFormValues = z.infer<typeof viewingFormSchema>
