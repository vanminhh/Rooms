import type { ReactElement, ReactNode } from 'react'
import { FormError, RoomsButton, Spinner } from '../../components'
import { useI18n } from '../../shared/i18n'
import './public.css'

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
  const { t } = useI18n()
  if (status === 'pending') return <Spinner block label={loadingLabel} />
  if (status === 'error') return <div className="public-state">
    <FormError>{error instanceof Error ? error.message : t('common.apiGeneric')}</FormError>
    <RoomsButton variant="sand" onClick={onRetry}>{t('common.retry')}</RoomsButton>
  </div>
  if (isEmpty) return <div className="rooms-empty public-state">
    <p>{emptyTitle}</p>
    {emptyHint}
  </div>
  return <>{children}</>
}
