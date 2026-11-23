import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useI18n } from '../../shared/i18n'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { SelectField } from '../../features/buildings/fields'
import { listMyContracts } from '../../features/contracts/api'
import { allPages } from '../../features/contracts/forms'
import { TenantContractView } from '../../features/contracts/TenantContractView'
import { TenantMoneyBlock } from '../../features/invoices/TenantMoneyBlock'
import '../../features/contracts/contracts.css'

export function TenantHomePage() {
  const { user } = useAuth()
  return <TenantOverview key={authScopeKey(user)} scope={authScopeKey(user)} name={user?.fullName} enabled={user?.role === 'TENANT'} />
}

function TenantOverview({ scope, name, enabled }: { scope: string; name?: string; enabled: boolean }) {
  const { t } = useI18n()
  const [selected, setSelected] = useState(0)
  const query = useQuery({ queryKey: ['my-contracts', 'overview', scope], queryFn: () => allPages(page => listMyContracts(page, 100)), enabled })
  const current = query.data?.filter(contract => contract.status === 'HOLD' || contract.status === 'ACTIVE') ?? []
  const id = query.data?.some(contract => contract.id === selected) ? selected : current[0]?.id ?? query.data?.[0]?.id
  return <>
    <SectionHeading>{t('tenant.overview')}</SectionHeading>
    {name && <p>{t('tenant.greeting', { name })}</p>}
    {query.isPending && enabled && <Spinner block label={t('contracts.loading')} />}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>{t('contracts.retry')}</RoomsButton></>}
    {query.isSuccess && query.data.length === 0 && <ElevatedCard><p>{t('contracts.none')}</p></ElevatedCard>}
    {query.isSuccess && query.data.length > 0 && <>
      <h3>{t(current.length ? 'contracts.current' : 'contracts.history')}</h3>
      {query.data.length > 1 && <SelectField label={t('contracts.chooseRoom')} value={id} onChange={event => setSelected(Number(event.target.value))}>
        {query.data.map(contract => <option key={contract.id} value={contract.id}>{contract.building.name} · {contract.room.code} · {t(`contract.status.${contract.status}`)}</option>)}
      </SelectField>}
      {id && <TenantContractView key={id} id={id} scope={scope} overview />}
      {id && <TenantMoneyBlock key={`money-${id}`} contractId={id} scope={scope} />}
      <Link to="/thue/hop-dong">{t('contracts.back')}</Link>
    </>}
  </>
}
