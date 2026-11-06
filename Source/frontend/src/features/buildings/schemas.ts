import { z } from 'zod'

// Mirrors CreateBuildingDto in the BE (BLD-01, BLD-06, API-03): same limits and words, so the form shows what the API would say.
const CODE_MESSAGE = 'Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9'
const REQUIRED_MESSAGE = 'Vui lòng nhập nội dung'
const DUE_DAYS_MESSAGE = 'Số ngày thu phải từ 1 đến 31'

const requiredText = (max: number, tooLong: string) => z.string().trim().min(1, REQUIRED_MESSAGE).max(max, tooLong)

// Lowercase codes are accepted: the BE upper-cases them before saving.
export const buildingFormSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{2,6}$/, CODE_MESSAGE),
  name: requiredText(100, 'Tên tòa tối đa 100 ký tự'),
  address: requiredText(255, 'Địa chỉ tối đa 255 ký tự'),
  district: requiredText(50, 'Quận/huyện tối đa 50 ký tự'),
  ward: requiredText(50, 'Phường/xã tối đa 50 ký tự'),
  waterMode: z.enum(['PER_M3', 'PER_PERSON'], { error: 'Cách tính nước không hợp lệ' }),
  dueDays: z.number({ error: DUE_DAYS_MESSAGE }).int(DUE_DAYS_MESSAGE).min(1, DUE_DAYS_MESSAGE).max(31, DUE_DAYS_MESSAGE),
  managerId: z.number().int().min(1).nullable(),
  amenities: z.array(z.string()),
  description: z.string().nullable(),
})

// The manager's edit form (BLD-02) covers only these two fields.
export const buildingNotesFormSchema = buildingFormSchema.pick({ amenities: true, description: true })

export type BuildingFormValues = z.infer<typeof buildingFormSchema>
export type BuildingNotesFormValues = z.infer<typeof buildingNotesFormSchema>
