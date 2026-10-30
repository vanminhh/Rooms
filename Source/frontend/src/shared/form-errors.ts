import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from './api'

const GENERIC_MESSAGE = 'Có lỗi xảy ra, vui lòng thử lại sau'

// Returns the text for the form-level FormError: field messages that have no input here, else the API message.
export function applyApiError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fieldNames: readonly Path<T>[]): string {
  if (!(error instanceof ApiError)) return GENERIC_MESSAGE
  const unmatched: string[] = []
  for (const [name, message] of Object.entries(error.fields ?? {})) {
    if (fieldNames.includes(name as Path<T>)) setError(name as Path<T>, { type: 'server', message })
    else unmatched.push(message)
  }
  return unmatched.join(' ') || error.message || GENERIC_MESSAGE
}
