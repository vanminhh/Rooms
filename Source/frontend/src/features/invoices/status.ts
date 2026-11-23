import { derivedInvoiceLabels, derivedInvoiceTones, invoiceStatusLabels, invoiceStatusTones, type StatusTone } from '../../shared/status-labels'
import type { InvoiceSummary } from './types'

// UI-02: "Quá hạn" only when the BE says so (UNPAID and past its due date, D-40).
export function invoiceLabel(row: Pick<InvoiceSummary, 'status' | 'overdue'>): { label: string; tone: StatusTone } {
  return row.overdue && row.status === 'UNPAID'
    ? { label: derivedInvoiceLabels.overdue, tone: derivedInvoiceTones.overdue }
    : { label: invoiceStatusLabels[row.status], tone: invoiceStatusTones[row.status] }
}

export const invoiceTypeLabels = { DEPOSIT: 'Tiền cọc', MONTHLY: 'Hóa đơn tháng', FINAL: 'Quyết toán' } as const
export const paymentMethodLabels = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', CARD: 'Thẻ', OTHER: 'Khác' } as const
