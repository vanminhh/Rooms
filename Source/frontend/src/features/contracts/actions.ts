import { useRef, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../shared/api'
import { useI18n } from '../../shared/i18n'

export function useContractAction() {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const { t } = useI18n()
  async function run(action: () => Promise<unknown>, describe?: (error: unknown) => string) {
    if (busy.current) return false
    busy.current = true; setPending(true); setError('')
    try { await action(); return true }
    catch (cause) { setError(describe ? describe(cause) : cause instanceof ApiError ? cause.message : t('common.apiGeneric')); return false }
    finally { busy.current = false; setPending(false) }
  }
  return { run, pending, error, setError }
}

export function invalidateContracts(client: QueryClient) {
  return Promise.all(['contracts', 'my-contracts', 'rooms', 'viewings', 'dashboard', 'vehicles'].map(key => client.invalidateQueries({ queryKey: [key] })))
}

export function operationKey() { return crypto.randomUUID() }
