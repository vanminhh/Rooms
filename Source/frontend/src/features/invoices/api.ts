import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import type { PaymentMethod } from '../contracts/types'
import type { InvoiceDetail, InvoiceListQuery, InvoiceSummary, ReadingCorrection } from './types'

export const listInvoices = (q: InvoiceListQuery) => apiRequestPage<InvoiceSummary>(listPath('/invoices', {
  buildingId: q.buildingId, status: q.status, type: q.type, overdue: q.overdue, period: q.period, total: q.total, page: q.page, limit: q.limit,
}))
export const getInvoice = (id: number) => apiRequest<InvoiceDetail>(`/invoices/${id}`)
export const issueInvoice = (id: number) => apiRequest<{ invoiceId: number; status: string }>(`/invoices/${id}/issue`, { method: 'POST' })
export const recordPayment = (id: number, body: { method: PaymentMethod; paidAt?: string; note?: string }, idempotencyKey: string) =>
  apiRequest<{ id: number; amount: number }>(`/invoices/${id}/payment`, { method: 'POST', body, idempotencyKey })
export const reissueInvoice = (id: number, body: { reason: string; corrections: ReadingCorrection[] }, idempotencyKey: string) =>
  apiRequest<{ invoiceId: number; replacesId: number; status: string; total: number }>(`/invoices/${id}/reissue`, { method: 'POST', body, idempotencyKey })
export const remindInvoice = (id: number) => apiRequest<{ invoiceId: number; remindedAt: string; email: boolean }>(`/invoices/${id}/remind`, { method: 'POST' })
export const createMissedInvoice = (contractId: number, periodNo: number) =>
  apiRequest<{ id: number }>(`/contracts/${contractId}/monthly-invoices`, { method: 'POST', body: { periodNo } })
