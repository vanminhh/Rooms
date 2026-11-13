import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from './api'
import { t } from './i18n/core'
import type { Lang } from './i18n/core'

// Returns the text for the form-level FormError: field messages that have no input here, else the API message.
export function applyApiError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fieldNames: readonly Path<T>[], lang: Lang = 'vi'): string {
  if (!(error instanceof ApiError)) return t('common.apiGeneric', undefined, lang)
  const unmatched: string[] = []
  for (const [name, message] of Object.entries(error.fields ?? {})) {
    if (fieldNames.includes(name as Path<T>)) setError(name as Path<T>, { type: 'server', message })
    else unmatched.push(message)
  }
  return unmatched.join(' ') || error.message || t('common.apiGeneric', undefined, lang)
}
