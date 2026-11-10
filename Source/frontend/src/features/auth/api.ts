import { apiRequest } from '../../shared/api'

export type Role = 'BOSS' | 'MANAGER' | 'TENANT'

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

export function getPublicContact() {
  return apiRequest<PublicContact | null>('/public/contact')
}
