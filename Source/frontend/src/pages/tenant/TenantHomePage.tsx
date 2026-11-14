import { useI18n } from '../../shared/i18n'
import { SectionHeading } from '../../components'
import { useAuth } from '../../app/auth-context'

export function TenantHomePage() {
  const { t } = useI18n()
  const { user } = useAuth()
  return <>
    <SectionHeading>{t('tenant.overview')}</SectionHeading>
    {user && <p>{t('tenant.greeting', { name: user.fullName })}</p>}
  </>
}
