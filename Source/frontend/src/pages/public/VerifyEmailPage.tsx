import { useValidationLanguage } from '../../features/auth/useValidationLanguage'
import { t as translate, useI18n } from '../../shared/i18n'
import { useMemo, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { useAuth } from '../../app/auth-context'
import { postLoginPath } from '../../app/guards'
import { resendCodeRequest, verifyEmailRequest } from '../../features/auth/api'
import { AuthFrame } from '../../features/auth/AuthFrame'
import { clearPending, readPending, secondsLeft, writePending } from '../../features/auth/pendingVerification'
import type { PendingVerification } from '../../features/auth/pendingVerification'
import { verifyEmailSchema } from '../../features/auth/schemas'
import type { VerifyEmailValues } from '../../features/auth/schemas'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'

// AUTH-12, AUTH-13. Reached after /dang-ky (a code was just mailed) and from a login answered with EMAIL_NOT_VERIFIED
// (no code yet: the guest asks for one). Without a stored phone there is nothing to verify, so it goes back to login.
export function VerifyEmailPage() {
  const [pending, setPending] = useState<PendingVerification | null>(() => readPending())
  if (!pending) return <Navigate to="/dang-nhap" replace />
  return <VerifyForm pending={pending} onPending={setPending} />
}

function VerifyForm({ pending, onPending }: { pending: PendingVerification; onPending: (value: PendingVerification) => void }) {
  const { t, lang } = useI18n()
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState(false)
  const [sending, setSending] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const schema = useMemo(() => verifyEmailSchema((key, params) => translate(key, params, lang)), [lang])
  const { register, trigger, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<VerifyEmailValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  })
  useValidationLanguage(lang, errors, trigger)
  const left = secondsLeft(pending.sentAt, now)

  useEffect(() => {
    if (left === 0) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [left === 0]) // eslint-disable-line react-hooks/exhaustive-deps -- only the running / stopped state matters

  async function onSubmit(values: VerifyEmailValues) {
    setFormError('')
    setNotice(false)
    try {
      const data = await verifyEmailRequest({ phone: pending.phone, code: values.code })
      const user = acceptSession(data)
      clearPending()
      navigate(postLoginPath(user.role, params.get('next')), { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'OTP_INVALID') {
        setError('code', { type: 'server', message: error.message })
        return
      }
      setFormError(applyApiError(error, setError, ['code'], lang))
    }
  }

  async function sendCode() {
    setFormError('')
    setNotice(false)
    setSending(true)
    try {
      await resendCodeRequest({ phone: pending.phone })
      const next = { ...pending, sentAt: Date.now() }
      writePending(next)
      onPending(next)
      setNow(Date.now())
      setNotice(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, [], lang))
    } finally {
      setSending(false)
    }
  }

  const description = pending.email
    ? t('auth.verifyDescription', { email: pending.email })
    : t('auth.verifyUnknownEmail')
  const neverSent = pending.sentAt === null

  return <AuthFrame titleId="verify-title" title={t('auth.verifyTitle')} description={description}>
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      {notice && <p className="auth-notice" role="status">{t('auth.codeSent')}</p>}
      <TextField
        label={t('auth.code')}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder={t('auth.codePlaceholder')}
        disabled={isSubmitting}
        error={errors.code?.message}
        {...register('code')}
      />
      <div className="auth-login-form-message" aria-live="polite">
        <FormError>{formError}</FormError>
      </div>
      <RoomsButton className="auth-login-submit" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? t('auth.verifying') : t('auth.verify')}</span>
        {isSubmitting ? <Spinner label={t('auth.verifying')} /> : <span aria-hidden="true">→</span>}
      </RoomsButton>
      <div className="auth-code-actions">
        <RoomsButton type="button" variant="outline" disabled={sending || left > 0} onClick={sendCode}>
          {neverSent ? t('auth.sendCode') : left > 0 ? t('auth.resendCountdown', { seconds: left }) : t('auth.resend')}
        </RoomsButton>
        <Link to="/dang-nhap">{t('auth.backToLogin')}</Link>
      </div>
    </form>
  </AuthFrame>
}
