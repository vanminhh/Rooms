import { useQuery } from '@tanstack/react-query'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { listMyInvoices } from '../../features/invoices/api'
import { TenantInvoiceRow } from '../../features/invoices/TenantInvoice'
import { unpaidFirst } from '../../features/invoices/tenant-status'
import { useI18n } from '../../shared/i18n'
import '../../features/invoices/invoices.css'

// FE-P4-10 · BE-P4-19, UI-03, LOC-01.
export function TenantInvoicesPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['my-invoices', 'list', authScopeKey(user)], queryFn: listMyInvoices })
  return <>
    <SectionHeading>{t('tenantInvoices.title')}</SectionHeading>
    {query.isPending && <Spinner block label={t('tenantInvoices.loading')} />}
    {query.isError && <div className="invoices-state"><FormError>{query.error.message}</FormError><RoomsButton type="button" onClick={() => void query.refetch()}>{t('contracts.retry')}</RoomsButton></div>}
    {query.isSuccess && query.data.data.length === 0 && <ElevatedCard><p>{t('tenantInvoices.empty')}</p></ElevatedCard>}
    {query.isSuccess && query.data.data.length > 0 && <div className="invoices-list">{unpaidFirst(query.data.data).map(invoice => <TenantInvoiceRow key={invoice.id} invoice={invoice} />)}</div>}
  </>
}
