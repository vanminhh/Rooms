import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ElevatedCard, FormError, Spinner } from '../../components'
import { formatDate } from '../../shared/formatters'
import { useI18n } from '../../shared/i18n'
import { getMyContract } from '../contracts/api'
import { listMyInvoices } from './api'
import { TenantInvoiceRow } from './TenantInvoice'
import './invoices.css'

// FE-P4-08 (30-frontend /thue, Phase 4 row): invoices to pay and the next billing date of the shown contract.
// The date comes from the BE (UI-06); the contract query shares its cache with TenantContractView.
export function TenantMoneyBlock({ contractId, scope }: { contractId: number; scope: string }) {
  const { t } = useI18n()
  const invoices = useQuery({ queryKey: ['my-invoices', 'list', scope], queryFn: listMyInvoices })
  const contract = useQuery({ queryKey: ['my-contracts', 'detail', scope, contractId], queryFn: () => getMyContract(contractId) })
  const toPay = invoices.data?.data.filter(invoice => invoice.status === 'UNPAID') ?? []
  return <ElevatedCard className="invoices-card"><h2>{t('tenantInvoices.toPay')}</h2>
    {contract.data?.nextBillingDate && <p>{t('tenantInvoices.nextBilling', { date: formatDate(contract.data.nextBillingDate) })}</p>}
    {invoices.isPending && <Spinner label={t('tenantInvoices.loading')} />}
    {invoices.isError && <FormError>{invoices.error.message}</FormError>}
    {invoices.isSuccess && (toPay.length === 0 ? <p>{t('tenantInvoices.nothingToPay')}</p>
      : <div className="invoices-list">{toPay.map(invoice => <TenantInvoiceRow key={invoice.id} invoice={invoice} />)}</div>)}
    <Link to="/thue/hoa-don">{t('tenantInvoices.viewAll')}</Link>
  </ElevatedCard>
}
