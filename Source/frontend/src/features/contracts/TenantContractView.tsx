import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ElevatedCard, FormError, RoomsButton, Spinner } from '../../components'
import { useI18n } from '../../shared/i18n'
import { ApiError } from '../../shared/api'
import { formatDate } from '../../shared/formatters'
import { getMyContract, getMyContractScan } from './api'
import { ContractSummaryCard } from './ContractSummaryCard'
import { ContractInformation } from './ContractInformation'
import { DepositCard } from './DepositCard'
import { DocumentAccess } from './ContractDocuments'
import { OccupantForm } from './OccupantForm'

export function TenantContractView({ id, scope, overview = false }: { id: number; scope: string; overview?: boolean }) {
  const { t } = useI18n()
  const query = useQuery({ queryKey: ['my-contracts', 'detail', scope, id], queryFn: () => getMyContract(id) })
  if (query.isPending) return <Spinner block label={t('contracts.loading')} />
  if (query.isError) return <><FormError>{query.error instanceof ApiError && query.error.status === 404 ? t('contracts.notFound') : query.error.message}</FormError>
    <RoomsButton type="button" onClick={() => void query.refetch()}>{t('contracts.retry')}</RoomsButton></>
  const contract = query.data
  const open = contract.status === 'HOLD' || contract.status === 'ACTIVE'
  return <div className="contracts-list">
    <ContractSummaryCard contract={contract} detailHref={overview ? `/thue/hop-dong/${id}` : undefined} />
    {contract.status === 'HOLD' && <p>{t('contracts.moveInDate')}: <strong>{formatDate(contract.startDate)}</strong></p>}
    {!open && <p>{t('contracts.readOnlyHistory')}</p>}
    <DepositCard invoice={contract.depositInvoice} />
    {!overview && <>
      <div className="contracts-actions"><Link to={`/thue/hop-dong/${id}/in`}>{t('contracts.print')}</Link>
        {contract.signedAt && <DocumentAccess label={t('contracts.scan')} load={async () => [{ label: contract.code, document: await getMyContractScan(id) }]} />}
      </div>
      <ContractInformation contract={contract} tenant />
      {open && <ElevatedCard className="contracts-card"><h2>{t('contracts.addOccupant')}</h2><OccupantForm contractId={id} tenant /></ElevatedCard>}
    </>}
  </div>
}
