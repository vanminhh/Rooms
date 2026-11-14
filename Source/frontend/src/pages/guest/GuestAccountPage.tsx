import { useI18n } from '../../shared/i18n'
import { ElevatedCard, SectionHeading, TextField } from '../../components'
import { useAuth } from '../../app/auth-context'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { EmailForm } from '../../features/auth/ProfileForm'
import '../../features/auth/auth.css'
import '../../features/auth/forgot-password.css'
import '../../features/auth/account.css'

// /toi/tai-khoan (AUTH-09): name and phone are read only; the password can be changed.
// A guest's email is the address the sign-up code verified (AUTH-12), so it is read only; a tenant may edit theirs.
export function GuestAccountPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  return <div className="auth-account-page">
    <SectionHeading>{t('account.title')}</SectionHeading>
    <div className="auth-account-stack">
      <ElevatedCard className="auth-account-card">
        <header className="auth-account-card-heading">
          <h3 id="account-info-title">{t('account.info')}</h3>
          <p>{t(user?.role === 'GUEST' ? 'account.guestReadOnly' : 'account.tenantReadOnly')}</p>
        </header>
        <TextField label={t('auth.fullName')} readOnly defaultValue={user?.fullName ?? ''} />
        <TextField label={t('auth.phone')} readOnly defaultValue={user?.phone ?? ''} />
        {user?.role === 'GUEST'
          ? <TextField label={t('auth.email')} type="email" readOnly defaultValue={user.email ?? ''} />
          : <EmailForm />}
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
