import { useValidationLanguage } from '../../features/auth/useValidationLanguage'
import { t as translate, useI18n } from '../../shared/i18n'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FormError, IllustrationLabel, PasswordField, RoomsButton, Spinner, TextField } from '../../components'
import { ContactInfo } from '../../features/auth/ContactInfo'
import { forgotPassword, resetPassword } from '../../features/auth/api'
import { forgotSchema, resetPasswordSchema } from '../../features/auth/schemas'
import type { ForgotValues, ResetPasswordValues } from '../../features/auth/schemas'
import { usePublicContact } from '../../features/auth/usePublicContact'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import '../../features/auth/auth.css'
import '../../features/auth/forgot-password.css'


export function ForgotPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')

  if (!token) return <RecoveryFrame><ForgotForm /></RecoveryFrame>
  return <RecoveryFrame><ResetForm token={token} /></RecoveryFrame>
}

function RecoveryFrame({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  return <div className="auth-recovery-page">
    <section className="auth-login-visual" aria-label={t('auth.intro')}>
      <img src="/images/auth-room.webp" alt="" />
      <IllustrationLabel className="auth-login-image-label">{t('home.illustration')}</IllustrationLabel>
      <div className="auth-login-visual-copy">
        <p className="rooms-eyebrow">{t('home.hero.eyebrow')}</p>
        <p className="auth-login-promise">{t('home.hero.leading')}<em>{t('home.hero.highlight')}</em>{t('home.hero.trailing')}</p>
      </div>
    </section>
    <section className="auth-recovery-panel">{children}</section>
  </div>
}

function RecoveryHeading({ id, title, description, descriptionRole }: { id: string; title: string; description: string; descriptionRole?: 'status' }) {
  return <header className="auth-recovery-heading">
    <span aria-hidden="true" />
    <h1 id={id}>{title}</h1>
    <p role={descriptionRole}>{description}</p>
  </header>
}

function managementHref(contact: ReturnType<typeof usePublicContact>['data']) {
  if (contact?.phone) return `tel:${contact.phone.replace(/[^\d+]/g, '')}`
  if (contact?.zaloUrl?.startsWith('https://')) return contact.zaloUrl
  if (contact?.facebookUrl?.startsWith('https://')) return contact.facebookUrl
  return null
}

function ContactSupport() {
  const { t } = useI18n()
  const contact = usePublicContact()
  const href = managementHref(contact.data)

  return <div className="auth-recovery-support">
    <p>{t('auth.support')}</p>
    {contact.isLoading && <p className="auth-contact-status" role="status">{t('auth.contactLoading')}</p>}
    {contact.isError && <p className="auth-contact-status">{t('auth.contactError')}</p>}
    {!contact.isLoading && !contact.isError && <ContactInfo contact={contact.data ?? null} />}
    <div className="auth-recovery-actions">
      {href ? <a href={href}>{t('auth.contactManager')}</a> : <span>{t('auth.contactManager')}</span>}
      <Link to="/dang-nhap">{t('auth.backToLogin')}</Link>
    </div>
  </div>
}

function ForgotForm() {
  const { t, lang } = useI18n()
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')
  const schema = useMemo(() => forgotSchema((key, params) => translate(key, params, lang)), [lang])
  const { register, trigger, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ForgotValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '' },
  })
  useValidationLanguage(lang, errors, trigger)

  async function onSubmit(values: ForgotValues) {
    setFormError('')
    try {
      await forgotPassword(values)
      setSent(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, ['phone'], lang))
    }
  }

  if (sent) return <div className="auth-recovery-result" aria-labelledby="forgot-sent-title">
    <div className="auth-recovery-icon" aria-hidden="true">✓</div>
    <RecoveryHeading id="forgot-sent-title" title={t('auth.checkInstructions')} description={t('auth.forgotSent')} descriptionRole="status" />
    <ContactSupport />
    <Link className="auth-recovery-primary-link" to="/dang-nhap">{t('auth.backToLogin')} <span aria-hidden="true">→</span></Link>
  </div>

  return <div aria-labelledby="forgot-title">
    <RecoveryHeading id="forgot-title" title={t('auth.forgotTitle')} description={t('auth.forgotIntro')} />
    <form className="auth-recovery-form" noValidate onSubmit={handleSubmit(onSubmit)}>
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
      <div className="auth-recovery-form-message" aria-live="polite">
        <FormError>{formError}</FormError>
      </div>
      <RoomsButton className="auth-recovery-submit" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? t('auth.sending') : t('auth.send')}</span>
        {isSubmitting && <Spinner label={t('auth.sending')} />}
      </RoomsButton>
    </form>
    <ContactSupport />
  </div>
}

function ResetForm({ token }: { token: string }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [formError, setFormError] = useState('')
  const [linkInvalid, setLinkInvalid] = useState(false)
  const schema = useMemo(() => resetPasswordSchema((key, params) => translate(key, params, lang)), [lang])
  const { register, trigger, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ResetPasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  })
  useValidationLanguage(lang, errors, trigger)

  async function onSubmit(values: ResetPasswordValues) {
    setFormError('')
    setLinkInvalid(false)
    try {
      await resetPassword({ token, newPassword: values.newPassword })
      navigate('/dang-nhap', { replace: true, state: { notice: 'password-reset' } })
    } catch (error) {
      const invalid = error instanceof ApiError && error.fields?.token !== undefined
      setLinkInvalid(invalid)
      if (!invalid) setFormError(applyApiError(error, setError, ['newPassword', 'confirmPassword'], lang))
    }
  }

  return <div aria-labelledby="reset-title">
    <RecoveryHeading id="reset-title" title={t('auth.resetTitle')} description={t('auth.newPasswordIntro')} />
    <form className="auth-recovery-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      {linkInvalid && <div className="auth-recovery-link-error">
        <FormError>{t('auth.invalidLink')}</FormError>
        <p>{t('auth.invalidLinkHint')}</p>
        <Link to="/quen-mat-khau">{t('auth.requestLink')}</Link>
      </div>}
      <PasswordField
        showLabel={t('auth.show')} hideLabel={t('auth.hide')}
        showPasswordLabel={t('auth.showPassword')} hidePasswordLabel={t('auth.hidePassword')}
        label={t('auth.newPassword')}
        autoComplete="new-password"
        placeholder={t('auth.newPasswordPlaceholder')}
        aria-describedby="reset-password-hint"
        disabled={isSubmitting}
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <p className="auth-recovery-hint" id="reset-password-hint">{t('auth.passwordHint')}</p>
      <PasswordField
        showLabel={t('auth.show')} hideLabel={t('auth.hide')}
        showPasswordLabel={t('auth.showPassword')} hidePasswordLabel={t('auth.hidePassword')}
        label={t('auth.confirmPassword')}
        autoComplete="new-password"
        placeholder={t('auth.confirmPassword')}
        disabled={isSubmitting}
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <div className="auth-recovery-form-message" aria-live="polite">
        <FormError>{formError}</FormError>
      </div>
      <RoomsButton className="auth-recovery-submit" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? t('auth.resetting') : t('auth.resetTitle')}</span>
        {isSubmitting && <Spinner label={t('auth.saving')} />}
      </RoomsButton>
      <Link className="auth-recovery-back-link" to="/dang-nhap">{t('auth.backToLogin')}</Link>
    </form>
  </div>
}


