import { useValidationLanguage } from '../../features/auth/useValidationLanguage'
import { t as translate, useI18n } from '../../shared/i18n'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Checkbox, FormError, IllustrationLabel, PasswordField, RoomsButton, Spinner, TextField } from '../../components'
import { useAuth } from '../../app/auth-context'
import { portalOf, postLoginPath, safeNext } from '../../app/guards'
import { ContactInfo } from '../../features/auth/ContactInfo'
import { writePending } from '../../features/auth/pendingVerification'
import { loginSchema } from '../../features/auth/schemas'
import type { LoginValues } from '../../features/auth/schemas'
import { usePublicContact } from '../../features/auth/usePublicContact'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import '../../features/auth/auth.css'

export function LoginPage() {
  const { t, lang } = useI18n()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const contact = usePublicContact()
  const [formError, setFormError] = useState('')
  const schema = useMemo(() => loginSchema((key, params) => translate(key, params, lang)), [lang])
  const { register, trigger, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', password: '', remember: false },
  })
  useValidationLanguage(lang, errors, trigger)
  const next = safeNext(params.get('next'))
  // AUTH-16, D-43: ?loi-vao= makes this page a login of one kind of account; the BE refuses the others (WRONG_PORTAL).
  const portal = portalOf(params.get('loi-vao'))
  const title = portal === 'TENANT' ? t('auth.portal.tenantTitle') : portal === 'STAFF' ? t('auth.portal.staffTitle') : t('auth.login')
  const signUpHref = next ? `/dang-ky?next=${encodeURIComponent(next)}` : '/dang-ky'
  const passwordReset = (location.state as { notice?: string } | null)?.notice === 'password-reset'
  const managementHref = contact.data?.phone
    ? `tel:${contact.data.phone.replace(/[^\d+]/g, '')}`
    : contact.data?.zaloUrl?.startsWith('https://')
      ? contact.data.zaloUrl
      : contact.data?.facebookUrl?.startsWith('https://')
        ? contact.data.facebookUrl
        : null

  async function onSubmit(values: LoginValues) {
    setFormError('')
    try {
      const user = await login({ ...values, portal })
      navigate(postLoginPath(user.role, params.get('next')), { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        // AUTH-12: right password, email not verified. No code was sent, so the next page offers to send one.
        writePending({ phone: values.phone, email: null, sentAt: null })
        const next = safeNext(params.get('next'))
        navigate(next ? `/xac-minh-email?next=${encodeURIComponent(next)}` : '/xac-minh-email', { replace: true })
        return
      }
      setFormError(applyApiError(error, setError, ['phone', 'password'], lang))
    }
  }

  return <div className="auth-login-page">
    <section className="auth-login-visual" aria-label={t('auth.intro')}>
      <img src="/images/auth-room.webp" alt="" />
      <IllustrationLabel className="auth-login-image-label">{t('home.illustration')}</IllustrationLabel>
      <div className="auth-login-visual-copy">
        <p className="rooms-eyebrow">{t('home.hero.eyebrow')}</p>
        <p className="auth-login-promise">{t('home.hero.leading')}<em>{t('home.hero.highlight')}</em>{t('home.hero.trailing')}</p>
      </div>
    </section>

    <section className="auth-login-panel" aria-labelledby="login-title">
      <header className="auth-login-heading">
        <span aria-hidden="true" />
        <h1 id="login-title">{title}</h1>
        <p>{t('auth.welcome')}</p>
      </header>

      <div className="auth-column">
        {passwordReset && <p className="auth-notice" role="status">{t('auth.resetDone')}</p>}
        <form noValidate onSubmit={handleSubmit(onSubmit)}>
          <TextField
            label={t('auth.phone')}
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            placeholder={t('auth.phonePlaceholder')}
            disabled={isSubmitting}
            error={errors.phone?.message}
            {...register('phone')}
          />
          <PasswordField
        showLabel={t('auth.show')} hideLabel={t('auth.hide')}
        showPasswordLabel={t('auth.showPassword')} hidePasswordLabel={t('auth.hidePassword')}
            label={t('auth.password')}
            autoComplete="current-password"
            placeholder={t('auth.passwordPlaceholder')}
            disabled={isSubmitting}
            error={errors.password?.message}
            {...register('password')}
          />
          <div className="auth-login-options">
            <Checkbox label={t('auth.remember')} disabled={isSubmitting} {...register('remember')} />
            <Link to="/quen-mat-khau">{t('auth.forgotLink')}</Link>
          </div>
          <div className="auth-login-form-message" aria-live="polite">
            <FormError>{formError}</FormError>
          </div>
          <RoomsButton className="auth-login-submit" type="submit" disabled={isSubmitting}>
            <span>{isSubmitting ? t('auth.signingIn') : t('auth.login')}</span>
            {isSubmitting ? <Spinner label={t('auth.signingIn')} /> : <span aria-hidden="true">→</span>}
          </RoomsButton>
        </form>

        <div className="auth-login-account-note">
          {!portal && <p>{t('auth.noAccount')} <Link to={signUpHref}>{t('auth.register')}</Link></p>}
          {contact.isLoading && <p className="auth-contact-status" role="status">{t('auth.contactLoading')}</p>}
          {!contact.isLoading && !contact.isError && <ContactInfo contact={contact.data ?? null} />}
          <div className="auth-login-account-actions">
            {managementHref
              ? <a href={managementHref}>{t('auth.contactManager')}</a>
              : <span>{t('auth.contactManager')}</span>}
            <Link to="/phong">{t('auth.viewRooms')}</Link>
          </div>
        </div>
      </div>
    </section>
  </div>
}
