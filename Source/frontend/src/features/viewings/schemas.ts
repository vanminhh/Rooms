import { z } from 'zod'
import { plusDays, todayHanoi } from '../pricing/labels'

const VISIT_MESSAGE = 'Giờ xem phải tròn giờ từ 8:00 đến 19:00, trong tương lai và không quá 30 ngày tới'
export const visitAtInput = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(value)) return false
  const hour = Number(value.slice(11, 13)), day = value.slice(0, 10)
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day && hour >= 8 && hour <= 19 &&
    day <= plusDays(todayHanoi(), 30) && Date.parse(`${value}:00+07:00`) > Date.now()
}, VISIT_MESSAGE)
export const viewingFormSchema = z.object({
  roomId: z.number({ error: 'Mã phòng không hợp lệ' }).int('Mã phòng không hợp lệ').min(1, 'Mã phòng không hợp lệ').max(2147483647, 'Mã phòng không hợp lệ'),
  guestName: z.string().trim().min(2, 'Họ tên phải từ 2 đến 100 ký tự').max(100, 'Họ tên phải từ 2 đến 100 ký tự'),
  guestPhone: z.string().trim().regex(/^0[0-9]{9}$/, 'Số điện thoại không hợp lệ'),
  visitAt: visitAtInput,
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
})
export type ViewingFormValues = z.infer<typeof viewingFormSchema>
export function outcomeFormSchema(status: 'LOST' | 'CANCELLED') {
  return z.object({ outcomeNote: z.string().max(500, 'Ghi chú tối đa 500 ký tự').refine(value => !!value.trim(),
    status === 'LOST' ? 'Cần ghi kết quả khi đánh dấu không thành' : 'Cần ghi chú khi hủy lịch hẹn') })
}
export type OutcomeFormValues = z.infer<ReturnType<typeof outcomeFormSchema>>
export const rescheduleFormSchema = z.object({ visitAt: visitAtInput })
export type RescheduleFormValues = z.infer<typeof rescheduleFormSchema>
