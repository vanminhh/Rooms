import { useI18n } from '../../shared/i18n'
import type { DictKey } from '../../shared/i18n'
import { derivedInvoiceTones, invoiceStatusTones } from '../../shared/status-labels'
import type { InvoiceSummary } from './types'

// UI-02 / LOC-04: status labels from the dictionary; "Quá hạn"/"Overdue" only from the BE flag (D-40).
export function useInvoiceStatus() {
  const { t } = useI18n()
  return (row: Pick<InvoiceSummary, 'status' | 'overdue'>) => row.overdue && row.status === 'UNPAID'
    ? { label: t('invoice.status.overdue'), tone: derivedInvoiceTones.overdue }
    : { label: t(`invoice.status.${row.status}` as DictKey), tone: invoiceStatusTones[row.status] }
}

// 30-frontend: unpaid/overdue first, then the API order (newest first). A stable re-order, no date or money math.
export const unpaidFirst = (rows: InvoiceSummary[]) =>
  [...rows].sort((a, b) => Number(b.status === 'UNPAID') - Number(a.status === 'UNPAID') || Number(b.overdue) - Number(a.overdue))
