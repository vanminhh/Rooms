import { z } from 'zod'
import { plusDays, todayHanoi } from '../pricing/labels'
import type { TimeSlot } from './api'

// Mirrors CreateViewingDto and the VIEW-08 check in the BE (checkVisitSlot): same limits and words, so the form shows what the API would say.
const INT32_MAX = 2147483647
const ROOM_MESSAGE = 'Mã phòng không hợp lệ'
const NAME_MESSAGE = 'Họ tên phải từ 2 đến 100 ký tự'
const PHONE_MESSAGE = 'Số điện thoại không hợp lệ'
const DATE_MESSAGE = 'Ngày xem không hợp lệ'
const VISIT_DATE_MESSAGE = 'Ngày xem phải từ hôm nay đến 30 ngày tới'
const SLOT_MESSAGE = 'Khung giờ không hợp lệ'
const NOTE_MESSAGE = 'Ghi chú tối đa 500 ký tự'

// VIEW-08 labels for the form's select. The list shows timeSlotLabel as the API sends it.
export const timeSlotChoices: { value: TimeSlot; label: string }[] = [
  { value: 'MORNING', label: 'Sáng (8:00–11:00)' },
  { value: 'AFTERNOON', label: 'Chiều (14:00–17:00)' },
  { value: 'EVENING', label: 'Tối (18:00–20:00)' },
]

// A real calendar day: 2026-02-30 is rejected (toISOString would roll it over to March).
function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// VIEW-08: from today to today + 30 days (Asia/Ho_Chi_Minh). The slot-already-started rule is left to the BE.
const visitDateSchema = z.string().superRefine((value, ctx) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isCalendarDate(value)) {
    ctx.addIssue({ code: 'custom', message: DATE_MESSAGE })
  } else if (value < todayHanoi() || value > plusDays(todayHanoi(), 30)) {
    ctx.addIssue({ code: 'custom', message: VISIT_DATE_MESSAGE })
  }
})

export const viewingFormSchema = z.object({
  roomId: z.number({ error: ROOM_MESSAGE }).int(ROOM_MESSAGE).min(1, ROOM_MESSAGE).max(INT32_MAX, ROOM_MESSAGE),
  guestName: z.string().trim().min(2, NAME_MESSAGE).max(100, NAME_MESSAGE),
  guestPhone: z.string().trim().regex(/^0[0-9]{9}$/, PHONE_MESSAGE),
  visitDate: visitDateSchema,
  timeSlot: z.enum(['MORNING', 'AFTERNOON', 'EVENING'], { error: SLOT_MESSAGE }),
  note: z.string().max(500, NOTE_MESSAGE).optional(),
})

export type ViewingFormValues = z.infer<typeof viewingFormSchema>

// VIEW-04: LOST needs outcomeNote, with the same words as the BE (UpdateViewing check); CANCELLED may leave it empty.
const OUTCOME_REQUIRED_MESSAGE = 'Cần ghi kết quả khi đánh dấu không thành'
const OUTCOME_NOTE_MESSAGE = 'Ghi chú kết quả tối đa 500 ký tự'

export function outcomeFormSchema(required: boolean) {
  const note = z.string().trim().max(500, OUTCOME_NOTE_MESSAGE)
  return z.object({ outcomeNote: required ? note.min(1, OUTCOME_REQUIRED_MESSAGE) : note })
}

export type OutcomeFormValues = z.infer<ReturnType<typeof outcomeFormSchema>>

// VIEW-09: date and slot follow the VIEW-08 rules; the slot-already-started rule is left to the BE.
export const rescheduleFormSchema = z.object({
  visitDate: visitDateSchema,
  timeSlot: z.enum(['MORNING', 'AFTERNOON', 'EVENING'], { error: SLOT_MESSAGE }),
})

export type RescheduleFormValues = z.infer<typeof rescheduleFormSchema>
