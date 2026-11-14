import { useI18n } from '../../shared/i18n'
import { ElevatedCard, SectionHeading } from '../../components'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { EmailForm } from '../../features/auth/ProfileForm'
import '../../features/auth/auth.css'
import '../../features/auth/forgot-password.css'
import '../../features/auth/account.css'

// /thue/tai-khoan (mockup 06, mobile first): email card, then change password card (AUTH-09).
export function TenantAccountPage() {
  const { t } = useI18n()
  return <div className="auth-account-page">
    <SectionHeading>{t('account.title')}</SectionHeading>
    <div className="auth-account-stack">
      <ElevatedCard className="auth-account-card">
        <header className="auth-account-card-heading">
          <h3 id="account-info-title">{t('account.info')}</h3>
          <p>{t('account.emailIntro')}</p>
        </header>
        <EmailForm />
      </ElevatedCard>
      <ElevatedCard className="auth-account-card">
        <header className="auth-account-card-heading">
          <h3 id="account-password-title">{t('auth.changePassword')}</h3>
          <p>{t('account.passwordIntro')}</p>
        </header>
        <ChangePasswordForm afterSuccess="stay" layout="page" />
      </ElevatedCard>
    </div>
  </div>
}
