import type { Me, Role } from '../features/auth/api'

export function homeOf(role: Role): '/toi' | '/thue' | '/ql' {
  if (role === 'GUEST') return '/toi'
  return role === 'TENANT' ? '/thue' : '/ql'
}

// Only in-app paths: no protocol-relative or absolute URLs, and never back to the login page (A7).
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  if (raw.includes('://') || /^\/(dang-nhap|dang-ky|xac-minh-email)/.test(raw)) return null
  return raw
}

// Where a signed-in user goes from /dang-nhap (login result or revisit): the safe next, else the role home (A7, AUTH-06).
export function postLoginPath(role: Role, rawNext: string | null): string {
  return safeNext(rawNext) ?? homeOf(role)
}

// AUTH-16, D-43: the entry a login came through. `?loi-vao=thue` -> TENANT, `?loi-vao=quan-ly` -> STAFF; anything else is a plain login.
export type Portal = 'TENANT' | 'STAFF'

export function portalOf(param: string | null): Portal | undefined {
  if (param === 'thue') return 'TENANT'
  if (param === 'quan-ly') return 'STAFF'
  return undefined
}

// The entry of the area a signed-out visitor tried to open: /thue... and /ql... only.
export function entryOfPath(pathname: string): 'thue' | 'quan-ly' | null {
  if (pathname === '/thue' || pathname.startsWith('/thue/')) return 'thue'
  if (pathname === '/ql' || pathname.startsWith('/ql/')) return 'quan-ly'
  return null
}

// Order matters: the forced password change (AUTH-05) is checked before the role (AUTH-06).
export function guardRedirect(
  user: Pick<Me, 'role' | 'mustChangePassword'> | null,
  location: { pathname: string; search: string },
  allow: readonly Role[] | 'any',
): string | null {
  if (!user) {
    const entry = entryOfPath(location.pathname)
    return `/dang-nhap?${entry ? `loi-vao=${entry}&` : ''}next=${encodeURIComponent(location.pathname + location.search)}`
  }
  if (user.mustChangePassword && location.pathname !== '/doi-mat-khau') return '/doi-mat-khau'
  if (allow !== 'any' && !allow.includes(user.role)) return homeOf(user.role)
  return null
}
