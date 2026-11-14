import { z } from 'zod'
import type { I18nValue } from '../../shared/i18n'

type Translate = I18nValue['t']

// Messages copy the BE DTO text, so the client shows the same words as the API (A4, G-04).
const phoneRule = (t: Translate) => z.string().regex(/^0[0-9]{9}$/, t('auth.validation.phone'))
const newPasswordRule = (t: Translate) => z.string().min(8, t('auth.validation.passwordLength'))
const confirmError = (t: Translate) => ({ message: t('auth.validation.confirmPassword'), path: ['confirmPassword'] })

export const loginSchema = (t: Translate) => z.object({
  phone: phoneRule(t),
  password: z.string().min(1, t('auth.validation.passwordRequired')),
  remember: z.boolean(),
})

export const forgotSchema = (t: Translate) => z.object({
  phone: phoneRule(t),
})

export const changePasswordSchema = (t: Translate) => z.object({
  currentPassword: z.string().min(1, t('auth.validation.currentPasswordRequired')),
  newPassword: newPasswordRule(t),
  confirmPassword: z.string(),
}).refine(values => values.newPassword === values.confirmPassword, confirmError(t))

export const resetPasswordSchema = (t: Translate) => z.object({
  newPassword: newPasswordRule(t),
  confirmPassword: z.string(),
}).refine(values => values.newPassword === values.confirmPassword, confirmError(t))

// AUTH-11: the same words as the BE DTOs. The name is trimmed like the API does (1..100 characters).
export const registerSchema = (t: Translate) => z.object({
  fullName: z.string().trim().min(1, t('auth.validation.nameRequired')).max(100, t('auth.validation.nameLength')),
  phone: phoneRule(t),
  email: z.string().trim().max(255, t('auth.validation.email')).refine(value => z.email().safeParse(value).success, t('auth.validation.email')),
  password: newPasswordRule(t),
})

// AUTH-12, AUTH-13: exactly 6 digits.
export const verifyEmailSchema = (t: Translate) => z.object({
  code: z.string().regex(/^[0-9]{6}$/, t('auth.validation.code')),
})

export type RegisterValues = z.infer<ReturnType<typeof registerSchema>>
export type VerifyEmailValues = z.infer<ReturnType<typeof verifyEmailSchema>>
export type LoginValues = z.infer<ReturnType<typeof loginSchema>>
export type ForgotValues = z.infer<ReturnType<typeof forgotSchema>>
export type ChangePasswordValues = z.infer<ReturnType<typeof changePasswordSchema>>
export type ResetPasswordValues = z.infer<ReturnType<typeof resetPasswordSchema>>

// Profile fields may be empty: empty means "clear the field" and is sent as null (A8).
const emailRule = (t: Translate) => z.string().trim().max(255, t('auth.validation.email')).refine(value => value === '' || z.email().safeParse(value).success, t('auth.validation.email'))
const contactPhoneRule = (t: Translate) => z.string().regex(/^(0[0-9]{9})?$/, t('auth.validation.phone'))
const httpsUrlRule = (t: Translate) => z.string().trim().regex(/^(https:\/\/\S+)?$/, t('auth.validation.url'))

export const tenantProfileSchema = (t: Translate) => z.object({
  email: emailRule(t),
})

export const staffProfileSchema = (t: Translate) => tenantProfileSchema(t).extend({
  contactPhone: contactPhoneRule(t),
  zaloUrl: httpsUrlRule(t),
  facebookUrl: httpsUrlRule(t),
})

export type TenantProfileValues = z.infer<ReturnType<typeof tenantProfileSchema>>
export type StaffProfileValues = z.infer<ReturnType<typeof staffProfileSchema>>
