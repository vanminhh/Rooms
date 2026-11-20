import { Link, useParams } from 'react-router'
import { FormError, SectionHeading } from '../../components'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { useI18n } from '../../shared/i18n'
import { TenantContractView } from '../../features/contracts/TenantContractView'
import '../../features/contracts/contracts.css'

export function TenantContractDetailPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { id } = useParams()
  const scope = authScopeKey(user)
  if (!Number.isInteger(Number(id)) || Number(id) < 1) return <FormError>{t('contracts.notFound')}</FormError>
  return <>
    <SectionHeading>{t('contracts.detailTitle')}</SectionHeading>
    <Link to="/thue/hop-dong">{t('contracts.back')}</Link>
    <TenantContractView key={`${scope}:${id}`} id={Number(id)} scope={scope} />
  </>
}
