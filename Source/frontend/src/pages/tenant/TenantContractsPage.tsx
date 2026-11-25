import { useState } from 'react'
import { RequestActions } from '../../features/requests/TenantRequestForm'
import { useQuery } from '@tanstack/react-query'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { useI18n } from '../../shared/i18n'
import { listMyContracts } from '../../features/contracts/api'
import { ContractSummaryCard } from '../../features/contracts/ContractSummaryCard'
import '../../features/contracts/contracts.css'

export function TenantContractsPage() {
  const { user } = useAuth()
  return <MyContracts key={authScopeKey(user)} scope={authScopeKey(user)} />
}

function MyContracts({ scope }: { scope: string }) {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['my-contracts', 'list', scope, page], queryFn: () => listMyContracts(page) })
  const current = query.data?.data.filter(contract => contract.status === 'HOLD' || contract.status === 'ACTIVE') ?? []
  const past = query.data?.data.filter(contract => contract.status === 'ENDED' || contract.status === 'CANCELLED') ?? []
  return <>
    <SectionHeading>{t('contracts.title')}</SectionHeading>
    {query.isPending && <Spinner block label={t('contracts.loading')} />}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>{t('contracts.retry')}</RoomsButton></>}
    {query.isSuccess && query.data.data.length === 0 && <ElevatedCard><p>{t('contracts.none')}</p></ElevatedCard>}
    {current.length > 0 && <section className="contracts-list"><h3>{t('contracts.current')}</h3>{current.map(contract => <div key={contract.id}><ContractSummaryCard contract={contract} detailHref={`/thue/hop-dong/${contract.id}`} />{contract.status === 'ACTIVE' && <RequestActions contractId={contract.id} />}</div>)}</section>}
    {past.length > 0 && <section className="contracts-list"><h3>{t('contracts.history')}</h3>{past.map(contract => <ContractSummaryCard key={contract.id} contract={contract} detailHref={`/thue/hop-dong/${contract.id}`} />)}</section>}
    {query.isSuccess && (page > 1 || query.data.meta.total > query.data.meta.limit) && <nav className="contracts-actions" aria-label={t('contracts.back')}>
      <RoomsButton disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('viewing.previousPage')}</RoomsButton><span>{t('viewing.page', { page })}</span>
      <RoomsButton disabled={page * query.data.meta.limit >= query.data.meta.total} onClick={() => setPage(page + 1)}>{t('viewing.nextPage')}</RoomsButton>
    </nav>}
  </>
}
