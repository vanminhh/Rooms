import { z } from 'zod'

// Messages copy the BE DTO text, so the client shows the same words as the API (A4, G-04).
const phoneRule = z.string().regex(/^0[0-9]{9}$/, 'Số điện thoại không hợp lệ')
const newPasswordRule = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự')
const confirmError = { message: 'Mật khẩu nhập lại không khớp', path: ['confirmPassword'] }

export const loginSchema = z.object({
  phone: phoneRule,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
  remember: z.boolean(),
})

export const forgotSchema = z.object({
  phone: phoneRule,
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  newPassword: newPasswordRule,
  confirmPassword: z.string(),
}).refine(values => values.newPassword === values.confirmPassword, confirmError)

export const resetPasswordSchema = z.object({
  newPassword: newPasswordRule,
  confirmPassword: z.string(),
}).refine(values => values.newPassword === values.confirmPassword, confirmError)

export type LoginValues = z.infer<typeof loginSchema>
export type ForgotValues = z.infer<typeof forgotSchema>
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

// Profile fields may be empty: empty means "clear the field" and is sent as null (A8).
const EMAIL_ERROR = 'Email không hợp lệ'
const URL_ERROR = 'Đường dẫn không hợp lệ'
const emailRule = z.string().trim().max(255, EMAIL_ERROR).refine(value => value === '' || z.email().safeParse(value).success, EMAIL_ERROR)
const contactPhoneRule = z.string().regex(/^(0[0-9]{9})?$/, 'Số điện thoại không hợp lệ')
const httpsUrlRule = z.string().trim().regex(/^(https:\/\/\S+)?$/, URL_ERROR)

export const tenantProfileSchema = z.object({
  email: emailRule,
})

export const staffProfileSchema = tenantProfileSchema.extend({
  contactPhone: contactPhoneRule,
  zaloUrl: httpsUrlRule,
  facebookUrl: httpsUrlRule,
})

export type TenantProfileValues = z.infer<typeof tenantProfileSchema>
export type StaffProfileValues = z.infer<typeof staffProfileSchema>
