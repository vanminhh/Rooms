import { useQuery } from '@tanstack/react-query'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import { allPages } from '../contracts/forms'
import type { StaffRequest } from './api'

export interface TenantRequest extends StaffRequest {
  createdAt: string
  updatedAt: string
  closedAt: string | null
  resolvedAt: string | null
  escalatedAt: string | null
  reviewAt: string | null
  reviewUpdatedAt: string | null
  reviewHiddenAt: string | null
  reviewRating: number | null
  reviewComment: string | null
}
export function useMyRequests() {
  const { user } = useAuth()
  const key = ['my-requests', authScopeKey(user)]
  const query = useQuery({ queryKey: key, enabled: user?.role === 'TENANT', queryFn: () => allPages(page =>
    apiRequestPage<TenantRequest>(listPath('/me/requests', { page, limit: 100 }))) })
  return { query, key }
}
export function changeRequest(id: number, action: 'cancel' | 'confirm' | 'reopen') {
  return apiRequest('/me/requests/' + id + '/' + action, { method: 'POST' })
}
export function saveReview(row: TenantRequest, rating: number, comment: string) {
  const stamp = row.reviewUpdatedAt ?? row.reviewAt
  return apiRequest('/me/requests/' + row.id + '/review', { method: 'PUT', body: row.reviewHiddenAt ? { rating } : { rating, comment }, ifMatch: stamp ? '"' + stamp + '"' : undefined })
}
