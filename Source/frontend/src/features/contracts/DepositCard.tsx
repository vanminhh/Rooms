import { ElevatedCard, StatusBadge } from '../../components'
import { useI18n } from '../../shared/i18n'
import { invoiceStatusTones } from '../../shared/status-labels'
import { formatDate, formatMoney } from '../../shared/formatters'
import { CopyButton } from './ContractDocuments'
import type { DepositInvoice } from './types'

export function DepositCard({ invoice }: { invoice: DepositInvoice | null }) {
  const { t } = useI18n()
  return <ElevatedCard className="contracts-card">
    <h2>{t('contracts.depositInvoice')}</h2>
    {!invoice ? <p>{t('contracts.noDepositInvoice')}</p> : <>
      <StatusBadge tone={invoiceStatusTones[invoice.status]}>{t(`invoice.status.${invoice.status}`)}</StatusBadge>
      <dl className="contracts-facts"><div><dt>{t('contracts.amount')}</dt><dd>{formatMoney(invoice.total)}</dd></div>
        <div><dt>{t('contracts.dueDate')}</dt><dd>{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</dd></div></dl>
      {invoice.status === 'UNPAID' && <>
        {invoice.qrImageUrl && <img className="contracts-qr" src={invoice.qrImageUrl} alt={t('contracts.qrAlt')} />}
        {invoice.vietqr && <><p>{t('contracts.bankAccount')}: {invoice.vietqr.accountNo} · {invoice.vietqr.accountName}</p>
          <p>{t('contracts.transferContent')}: <strong>{invoice.vietqr.content}</strong></p><CopyButton value={invoice.vietqr.content} /></>}
      </>}
    </>}
  </ElevatedCard>
}
