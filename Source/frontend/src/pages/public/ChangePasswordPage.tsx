import { useI18n } from '../../shared/i18n'
import { IllustrationLabel, RoomsButton } from '../../components'
import { useAuth } from '../../app/auth-context'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { useSignOut } from '../../features/auth/useSignOut'
import '../../features/auth/auth.css'
import '../../features/auth/forgot-password.css'
import '../../features/auth/change-password.css'

// /doi-mat-khau (mockup 05, AUTH-05): same two-column frame as the login and recovery pages.
export function ChangePasswordPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { signOut, signingOut } = useSignOut()
  const forced = user?.mustChangePassword === true

  return <div className="auth-recovery-page">
    <section className="auth-login-visual" aria-label={t('auth.intro')}>
      <img src="/images/auth-room.webp" alt="" />
      <IllustrationLabel className="auth-login-image-label">{t('home.illustration')}</IllustrationLabel>
      <div className="auth-login-visual-copy">
        <p className="rooms-eyebrow">{t('home.hero.eyebrow')}</p>
        <p className="auth-login-promise">{t('home.hero.leading')}<em>{t('home.hero.highlight')}</em>{t('home.hero.trailing')}</p>
      </div>
    </section>

    <section className="auth-recovery-panel" aria-labelledby="change-password-title">
      <header className="auth-recovery-heading">
        <span aria-hidden="true" />
        <h1 id="change-password-title">{t('auth.changePassword')}</h1>
        <p>{forced ? t('auth.forcedChange') : t('auth.newPasswordIntro')}</p>
      </header>
      <ChangePasswordForm afterSuccess="go-home" layout="page" />
      <RoomsButton className="auth-change-signout" variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>{t('auth.signOut')}</RoomsButton>
    </section>
  </div>
}
