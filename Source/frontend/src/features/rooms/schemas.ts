import { z } from 'zod'

// Mirrors CreateRoomDto and UpdateRoomDto in the BE (ROOM-01, ROOM-06): same limits and words, so the form shows what the API would say.
const INT_MAX = 2147483647
const CODE_MESSAGE = 'Mã phòng phải là chuỗi từ 1 đến 10 ký tự'
const FLOOR_MESSAGE = 'Tầng phải là số nguyên từ 1 đến 2147483647'
const AREA_MESSAGE = 'Diện tích phải lớn hơn 0 và tối đa 9999,9 m²'
const OCCUPANTS_MESSAGE = 'Số người tối đa không hợp lệ'

// The BE accepts at most one decimal place for area (maxDecimalPlaces: 1).
const oneDecimal = (value: number) => Math.round(value * 10) / 10 === value

// price is not a field here: the room form never writes it (ROOM-02).
export const roomFormSchema = z.object({
  code: z.string().trim().min(1, CODE_MESSAGE).max(10, CODE_MESSAGE),
  floor: z.number({ error: FLOOR_MESSAGE }).int(FLOOR_MESSAGE).min(1, FLOOR_MESSAGE).max(INT_MAX, FLOOR_MESSAGE),
  areaM2: z.number({ error: AREA_MESSAGE }).min(0.1, AREA_MESSAGE).max(9999.9, AREA_MESSAGE).refine(oneDecimal, AREA_MESSAGE),
  maxOccupants: z.number({ error: OCCUPANTS_MESSAGE }).int(OCCUPANTS_MESSAGE).min(1, OCCUPANTS_MESSAGE).max(INT_MAX, OCCUPANTS_MESSAGE),
  // Comma-separated text in the form; RoomForm turns it into a list before the API call.
  furniture: z.string(),
  description: z.string(),
})

export type RoomFormValues = z.infer<typeof roomFormSchema>
