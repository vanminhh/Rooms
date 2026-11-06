import type { ReactElement, ReactNode } from 'react'
import { FormError, RoomsButton, Spinner } from '../../components'
import './public.css'

// Same text as shared/api.ts for errors without a message; the shared constant is not exported.
const GENERIC_MESSAGE = 'Có lỗi xảy ra, vui lòng thử lại sau'

// The 4 states of a list (UI-03): loading, error with retry, empty with the next action, data.
export function ListState({ status, error, isEmpty, loadingLabel, emptyTitle, emptyHint, onRetry, children }: {
  status: 'pending' | 'error' | 'success'
  error: unknown
  isEmpty: boolean
  loadingLabel: string
  emptyTitle: string
  emptyHint?: ReactNode
  onRetry: () => void
  children: ReactNode
}): ReactElement | null {
  if (status === 'pending') return <Spinner label={loadingLabel} />
  if (status === 'error') return <div className="public-state">
    <FormError>{error instanceof Error ? error.message : GENERIC_MESSAGE}</FormError>
    <RoomsButton variant="sand" onClick={onRetry}>Thử lại</RoomsButton>
  </div>
  if (isEmpty) return <div className="rooms-empty public-state">
    <p>{emptyTitle}</p>
    {emptyHint}
  </div>
  return <>{children}</>
}
