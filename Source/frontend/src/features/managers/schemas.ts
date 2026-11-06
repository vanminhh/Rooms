import { z } from 'zod'

// Mirrors CreateManagerDto in the BE (AUTH-08, G-04): same phone pattern, limits and words.
const PHONE_MESSAGE = 'Số điện thoại không hợp lệ'
const NAME_MESSAGE = 'Vui lòng nhập họ và tên'
const EMAIL_MESSAGE = 'Email không hợp lệ'

export const managerFormSchema = z.object({
  phone: z.string().trim().regex(/^0[0-9]{9}$/, PHONE_MESSAGE),
  fullName: z.string().trim().min(1, NAME_MESSAGE).max(100, 'Họ và tên tối đa 100 ký tự'),
  // Empty means no email; the form drops it before the API call.
  email: z.string().trim().max(255, EMAIL_MESSAGE).refine(value => value === '' || z.email().safeParse(value).success, EMAIL_MESSAGE),
})

export type ManagerFormValues = z.infer<typeof managerFormSchema>
