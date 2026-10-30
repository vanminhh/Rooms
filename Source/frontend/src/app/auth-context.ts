import { createContext, useContext } from 'react'
import type { Me } from '../features/auth/api'

export type AuthStatus = 'loading' | 'ready' | 'error' // 'error': startup failed with a non-401 error (Q6-A)

export interface AuthContextValue {
  status: AuthStatus
  user: Me | null
  login(input: { phone: string; password: string; remember: boolean }): Promise<Me>
  logout(): Promise<void>
  refreshMe(): Promise<Me | null>
  retry(): void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
