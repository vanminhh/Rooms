import { Link } from 'react-router'
import { ElevatedCard, StatusBadge } from '../../components'
import { formatDate, formatMoney } from '../../shared/formatters'
import { useI18n } from '../../shared/i18n'
import type { DictKey } from '../../shared/i18n'
import { CopyButton } from '../contracts/ContractDocuments'
import { useInvoiceStatus } from './tenant-status'
import type { InvoiceDetail, InvoiceLine, InvoiceSummary } from './types'

// LOC-04 [ASSUMPTION]: fixed line kinds are translated in English; service names are shown as typed (A-12); Vietnamese keeps the BE label.
function useLineLabel() {
  const { t, lang } = useI18n()
  return (line: InvoiceLine) => {
    if (lang === 'vi' || line.kind === 'SERVICE' || line.kind === 'PARKING') return line.label
    if (line.kind === 'ELECTRIC' && typeof line.meta?.tierNo === 'number') return t('tenantInvoices.line.ELECTRIC_TIER', { tier: line.meta.tierNo })
    return t(`tenantInvoices.line.${line.kind}` as DictKey)
  }
}

export function TenantInvoiceRow({ invoice }: { invoice: InvoiceSummary }) {
  const { t } = useI18n()
  const status = useInvoiceStatus()(invoice)
  return <ElevatedCard className="invoices-card">
    <div className="invoices-card-head">
      <h3><Link to={`/thue/hoa-don/${invoice.id}`}>{invoice.code}</Link> · {t(`tenantInvoices.type.${invoice.type}` as DictKey)}</h3>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    </div>
    <dl className="invoices-facts">
      <div><dt>{t('tenantInvoices.room')}</dt><dd>{invoice.contract.room.code} · {invoice.contract.building.name}</dd></div>
      {invoice.periodStart && invoice.periodEnd && <div><dt>{t('tenantInvoices.period')}</dt><dd>{formatDate(invoice.periodStart)}–{formatDate(invoice.periodEnd)}</dd></div>}
      <div><dt>{t('tenantInvoices.dueDate')}</dt><dd>{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</dd></div>
      <div><dt>{t('tenantInvoices.total')}</dt><dd>{formatMoney(invoice.total)}</dd></div>
    </dl>
  </ElevatedCard>
}

// BIL-07..10, D-38: lines and total exactly as sent (UI-06), readings with photos, VietQR while UNPAID.
export function TenantInvoiceDetail({ invoice }: { invoice: InvoiceDetail }) {
  const { t } = useI18n()
  const status = useInvoiceStatus()(invoice)
  const lineLabel = useLineLabel()
  const at = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  return <div className="invoices-detail">
    <ElevatedCard className="invoices-card">
      <div className="invoices-card-head"><h2>{invoice.code} · {t(`tenantInvoices.type.${invoice.type}` as DictKey)}</h2><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div>
      <dl className="invoices-facts">
        <div><dt>{t('tenantInvoices.room')}</dt><dd>{invoice.contract.room.code} · {invoice.contract.building.name}</dd></div>
        {invoice.periodStart && invoice.periodEnd && <div><dt>{t('tenantInvoices.period')}</dt><dd>{formatDate(invoice.periodStart)}–{formatDate(invoice.periodEnd)}</dd></div>}
        <div><dt>{t('tenantInvoices.dueDate')}</dt><dd>{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</dd></div>
      </dl>
      {invoice.payment && <p>{t('tenantInvoices.paidOn', { amount: formatMoney(invoice.payment.amount), time: at(invoice.payment.paidAt) })}</p>}
    </ElevatedCard>
    {invoice.status === 'UNPAID' && invoice.vietqr && <ElevatedCard className="invoices-card"><h2>{t('tenantInvoices.pay')}</h2>
      {invoice.qrImageUrl && <img className="invoices-qr" src={invoice.qrImageUrl} alt={t('tenantInvoices.qrAlt', { code: invoice.code })} />}
      <p>{t('contracts.bankAccount')}: {invoice.vietqr.accountNo} · {invoice.vietqr.accountName}</p>
      <p>{t('contracts.amount')}: <strong>{formatMoney(invoice.total)}</strong></p>
      <p>{t('contracts.transferContent')}: <strong>{invoice.vietqr.content}</strong></p><CopyButton value={invoice.vietqr.content} />
    </ElevatedCard>}
    <ElevatedCard className="invoices-card"><h2>{t('tenantInvoices.lines')}</h2>
      <div className="invoices-table-wrap"><table className="invoices-lines">
        <thead><tr><th>{t('tenantInvoices.item')}</th><th className="invoices-num">{t('tenantInvoices.quantity')}</th><th className="invoices-num">{t('tenantInvoices.unitPrice')}</th><th className="invoices-num">{t('tenantInvoices.amount')}</th></tr></thead>
        <tbody>{invoice.lines.map((line, index) => <tr key={index}><td>{lineLabel(line)}</td><td className="invoices-num">{line.quantity}</td>
          <td className="invoices-num">{formatMoney(line.unitPrice)}</td><td className="invoices-num">{formatMoney(line.amount)}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={3}>{t('tenantInvoices.grandTotal')}</th><th className="invoices-num">{formatMoney(invoice.total)}</th></tr></tfoot>
      </table></div>
    </ElevatedCard>
    {invoice.meterReadings.length > 0 && <ElevatedCard className="invoices-card"><h2>{t('tenantInvoices.readings')}</h2>
      <dl className="invoices-facts">{invoice.meterReadings.map(reading => <div key={reading.id}>
        <dt>{t(`tenantInvoices.${reading.kind}` as DictKey)} · {formatDate(reading.readOn)}</dt>
        <dd>{reading.value}{reading.isMeterReplaced && t('tenantInvoices.meterReplaced', { value: reading.oldMeterFinal ?? '—' })}</dd>
        {reading.photoUrl && <img className="invoices-photo" src={reading.photoUrl} alt={t('tenantInvoices.photoAlt', { kind: t(`tenantInvoices.${reading.kind}` as DictKey), date: formatDate(reading.readOn) })} />}
      </div>)}</dl></ElevatedCard>}
  </div>
}
