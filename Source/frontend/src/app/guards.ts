import type { Me, Role } from '../features/auth/api'

export function homeOf(role: Role): '/thue' | '/ql' {
  return role === 'TENANT' ? '/thue' : '/ql'
}

// Only in-app paths: no protocol-relative or absolute URLs, and never back to the login page (A7).
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  if (raw.includes('://') || raw.startsWith('/dang-nhap')) return null
  return raw
}

// Where a signed-in user goes from /dang-nhap (login result or revisit): the safe next, else the role home (A7, AUTH-06).
export function postLoginPath(role: Role, rawNext: string | null): string {
  return safeNext(rawNext) ?? homeOf(role)
}

// Order matters: the forced password change (AUTH-05) is checked before the role (AUTH-06).
export function guardRedirect(
  user: Pick<Me, 'role' | 'mustChangePassword'> | null,
  location: { pathname: string; search: string },
  allow: readonly Role[] | 'any',
): string | null {
  if (!user) return `/dang-nhap?next=${encodeURIComponent(location.pathname + location.search)}`
  if (user.mustChangePassword && location.pathname !== '/doi-mat-khau') return '/doi-mat-khau'
  if (allow !== 'any' && !allow.includes(user.role)) return homeOf(user.role)
  return null
}
