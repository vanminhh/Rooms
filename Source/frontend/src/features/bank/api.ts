import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import type { StatusTone } from '../../shared/status-labels'

export type BankTxStatus = 'MATCHED' | 'UNMATCHED' | 'ASSIGNED' | 'REFUNDED'
// Mirrors bank-transactions.service.ts (BANK-05). `raw` never reaches the FE (BANK-07).
export interface BankTransaction {
  id: number; provider: string; providerTxId: string; amount: number; content: string; accountNumber: string; receivedAt: string
  status: BankTxStatus; note: string | null; handledAt: string | null
  invoice: { id: number; code: string; total: number; status: string; roomCode: string; tenantName: string } | null
}
export const bankTxLabels: Record<BankTxStatus, { label: string; tone: StatusTone }> = {
  UNMATCHED: { label: 'Chưa khớp', tone: 'reserved' }, MATCHED: { label: 'Đã khớp', tone: 'available' },
  ASSIGNED: { label: 'Đã gán', tone: 'available' }, REFUNDED: { label: 'Đã hoàn tiền', tone: 'maintenance' },
}

export const listBankTransactions = (q: { status?: BankTxStatus; page: number }) =>
  apiRequestPage<BankTransaction>(listPath('/bank-transactions', { status: q.status, page: q.page }))
export const assignTransaction = (id: number, invoiceId: number, idempotencyKey: string) =>
  apiRequest<{ status: 'ASSIGNED' }>(`/bank-transactions/${id}/assign`, { method: 'POST', body: { invoiceId }, idempotencyKey })
export const markTransactionRefunded = (id: number, note: string, idempotencyKey: string) =>
  apiRequest<{ status: 'REFUNDED' }>(`/bank-transactions/${id}/mark-refunded`, { method: 'POST', body: { note }, idempotencyKey })
