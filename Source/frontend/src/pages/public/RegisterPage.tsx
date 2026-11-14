import { useValidationLanguage } from '../../features/auth/useValidationLanguage'
import { t as translate, useI18n } from '../../shared/i18n'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FormError, PasswordField, RoomsButton, Spinner, TextField } from '../../components'
import { safeNext } from '../../app/guards'
import { registerRequest } from '../../features/auth/api'
import { AuthFrame } from '../../features/auth/AuthFrame'
import { rememberSentCode } from '../../features/auth/pendingVerification'
import { registerSchema } from '../../features/auth/schemas'
import type { RegisterValues } from '../../features/auth/schemas'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'

// AUTH-11. Success goes to the code step with ?next= kept; the code was mailed by the API.
export function RegisterPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [formError, setFormError] = useState('')
  const [taken, setTaken] = useState(false)
  const schema = useMemo(() => registerSchema((key, params) => translate(key, params, lang)), [lang])
  const { register, trigger, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', email: '', password: '' },
  })
  useValidationLanguage(lang, errors, trigger)

  async function onSubmit(values: RegisterValues) {
    setFormError('')
    setTaken(false)
    try {
      await registerRequest(values)
      rememberSentCode(values.phone, values.email.trim())
      navigate(next ? `/xac-minh-email?next=${encodeURIComponent(next)}` : '/xac-minh-email', { replace: true })
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'PHONE_TAKEN' || error.code === 'EMAIL_TAKEN')) {
        setTaken(true) // the API message goes on the field it is about (UI-05)
        const field = error.code === 'PHONE_TAKEN' ? 'phone' : 'email'
        // AUTH-11: the sign-up wording ("…Hãy đăng nhập hoặc dùng Quên mật khẩu") comes in fields; message is the generic text.
        setError(field, { type: 'server', message: error.fields?.[field] ?? error.message })
        return
      }
      setFormError(applyApiError(error, setError, ['fullName', 'phone', 'email', 'password'], lang))
    }
  }

  return <AuthFrame titleId="register-title" title={t('auth.register')} description={t('auth.registerIntro')}>
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label={t('auth.fullName')}
        autoComplete="name"
        placeholder={t('auth.namePlaceholder')}
        disabled={isSubmitting}
        error={errors.fullName?.message}
        {...register('fullName')}
      />
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
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        placeholder={t('auth.emailPlaceholder')}
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        showLabel={t('auth.show')} hideLabel={t('auth.hide')}
        showPasswordLabel={t('auth.showPassword')} hidePasswordLabel={t('auth.hidePassword')}
        label={t('auth.password')}
        autoComplete="new-password"
        placeholder={t('auth.passwordHint')}
        disabled={isSubmitting}
        error={errors.password?.message}
        {...register('password')}
      />
      <div className="auth-login-form-message" aria-live="polite">
        <FormError>{formError}</FormError>
        {taken && <p className="auth-signup-switch"><Link to="/dang-nhap">{t('auth.login')}</Link></p>}
      </div>
      <RoomsButton className="auth-login-submit" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? t('auth.registering') : t('auth.register')}</span>
        {isSubmitting ? <Spinner label={t('auth.registering')} /> : <span aria-hidden="true">→</span>}
      </RoomsButton>
    </form>
    <p className="auth-signup-switch">{t('auth.hasAccount')} <Link to={next ? `/dang-nhap?next=${encodeURIComponent(next)}` : '/dang-nhap'}>{t('auth.login')}</Link></p>
  </AuthFrame>
}
