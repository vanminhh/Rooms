import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../shared/api'
import { getPublicContact } from './api'
import type { PublicContact } from './api'

// Shared by the public footer and the login page, so one GET /public/contact serves both (AUTH-10).
export function usePublicContact(): UseQueryResult<PublicContact | null, ApiError> {
  return useQuery<PublicContact | null, ApiError>({
    queryKey: ['public', 'contact'],
    queryFn: getPublicContact,
    staleTime: 5 * 60 * 1000,
  })
}
