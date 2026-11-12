import { apiRequest } from '../../shared/api'

export type Role = 'BOSS' | 'MANAGER' | 'TENANT' | 'GUEST'

export interface MeBuilding {
  id: number
  code: string
  name: string
}

export interface Me {
  id: number
  role: Role
  phone: string
  fullName: string
  email: string | null
  emailVerified: boolean // AUTH-12: false only for a GUEST who has not entered the code yet
  locale: string // AUTH-15
  mustChangePassword: boolean
  contactPhone: string | null
  zaloUrl: string | null
  facebookUrl: string | null
  buildings?: MeBuilding[] // BOSS and MANAGER only
}

export interface PublicContact {
  phone: string | null
  zaloUrl: string | null
  facebookUrl: string | null
}

export type UpdateMeInput = Partial<Record<'email' | 'contactPhone' | 'zaloUrl' | 'facebookUrl', string | null>>

// Bodies are built field by field so extra form values (e.g. confirmPassword) are never sent.
export function loginRequest(input: { phone: string; password: string; remember: boolean }) {
  return apiRequest<{ accessToken: string; user: Me }>('/auth/login', {
    method: 'POST',
    body: { phone: input.phone, password: input.password, remember: input.remember },
  })
}

export function logoutRequest() {
  return apiRequest<null>('/auth/logout', { method: 'POST' })
}

export function getMe() {
  return apiRequest<Me>('/auth/me')
}

export function updateMe(input: UpdateMeInput) {
  return apiRequest<Me>('/auth/me', { method: 'PATCH', body: input })
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return apiRequest<null>('/auth/change-password', {
    method: 'POST',
    body: { currentPassword: input.currentPassword, newPassword: input.newPassword },
  })
}

export function forgotPassword(input: { phone: string }) {
  return apiRequest<null>('/auth/forgot-password', { method: 'POST', body: { phone: input.phone } })
}

export function resetPassword(input: { token: string; newPassword: string }) {
  return apiRequest<null>('/auth/reset-password', {
    method: 'POST',
    body: { token: input.token, newPassword: input.newPassword },
  })
}

// AUTH-11: a new GUEST; the API mails a 6-digit code. Bodies are built field by field.
export function registerRequest(input: { fullName: string; phone: string; email: string; password: string }) {
  return apiRequest<null>('/auth/register', {
    method: 'POST',
    body: { fullName: input.fullName, phone: input.phone, email: input.email, password: input.password },
  })
}

// AUTH-12: the right code verifies the email and signs the guest in.
export function verifyEmailRequest(input: { phone: string; code: string }) {
  return apiRequest<{ accessToken: string; user: Me }>('/auth/verify-email', {
    method: 'POST',
    body: { phone: input.phone, code: input.code },
  })
}

// AUTH-13: always answers 200 with no body, whether or not the phone has an account.
export function resendCodeRequest(input: { phone: string }) {
  return apiRequest<null>('/auth/resend-code', { method: 'POST', body: { phone: input.phone } })
}

export function getPublicContact() {
  return apiRequest<PublicContact | null>('/public/contact')
}
