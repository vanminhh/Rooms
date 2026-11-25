import { RequestActions } from '../../features/requests/TenantRequestForm'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { getMyInvoice } from '../../features/invoices/api'
import { TenantInvoiceDetail } from '../../features/invoices/TenantInvoice'
import { useI18n } from '../../shared/i18n'
import '../../features/invoices/invoices.css'

function Detail({ id, scope }: { id: number; scope: string }) {
  const { t } = useI18n()
  // 30-frontend: the status refreshes when the tenant comes back to the tab (after paying in a bank app).
  const query = useQuery({ queryKey: ['my-invoices', 'detail', scope, id], queryFn: () => getMyInvoice(id), refetchOnWindowFocus: 'always' })
  if (query.isPending) return <Spinner block label={t('tenantInvoices.loading')} />
  if (query.isError) return <div className="invoices-state"><FormError>{query.error.message}</FormError><RoomsButton type="button" onClick={() => void query.refetch()}>{t('contracts.retry')}</RoomsButton></div>
  return <><TenantInvoiceDetail invoice={query.data} />
    {query.data.status === 'UNPAID' && (query.data.contract.status === 'ACTIVE' || query.data.contract.status === 'HOLD' && query.data.type === 'DEPOSIT') && <RequestActions contractId={query.data.contract.id} invoiceId={id} />}</>
}

// FE-P4-11 · BIL-10, D-38, UI-07. "Báo lỗi thanh toán" comes with requests in Phase 5 (FE-P4-13).
export function TenantInvoiceDetailPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { id } = useParams()
  const scope = authScopeKey(user)
  return <>
    <SectionHeading>{t('tenantInvoices.detailTitle')}</SectionHeading>
    <Link to="/thue/hoa-don">{t('tenantInvoices.back')}</Link>
    {Number.isInteger(Number(id)) && Number(id) >= 1 ? <Detail key={`${scope}:${id}`} id={Number(id)} scope={scope} /> : <FormError>{t('tenantInvoices.notFound')}</FormError>}
  </>
}
