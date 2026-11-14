import { useValidationLanguage } from './useValidationLanguage'
import { t as translate, useI18n } from '../../shared/i18n'
import { useMemo, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { FormError, PasswordField, RoomsButton, Spinner } from '../../components'
import { useAuth } from '../../app/auth-context'
import { homeOf } from '../../app/guards'
import { applyApiError } from '../../shared/form-errors'
import { changePassword } from './api'
import { changePasswordSchema } from './schemas'
import type { ChangePasswordValues } from './schemas'
import './auth.css'

// Used by the forced change page (go-home) and the account pages (stay).
// `layout="page"` is the /doi-mat-khau card (mockup 05): placeholders, the 8-character hint, stable error space
// and a full-width submit. The account pages keep the plain layout until UI-33 restyles them.
export function ChangePasswordForm({ afterSuccess, layout = 'plain' }: { afterSuccess: 'go-home' | 'stay'; layout?: 'page' | 'plain' }) {
  const { t, lang } = useI18n()
  const { refreshMe } = useAuth()
  const navigate = useNavigate()
  const hintId = useId()
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const schema = useMemo(() => changePasswordSchema((key, params) => translate(key, params, lang)), [lang])
  const { register, trigger, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<ChangePasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  useValidationLanguage(lang, errors, trigger)
  const page = layout === 'page'

  async function onSubmit(values: ChangePasswordValues) {
    setFormError('')
    setSaved(false)
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword })
      if (afterSuccess === 'go-home') {
        // The forced-change flag must be cleared before navigating, or the guard sends the user back here.
        const me = await refreshMe()
        if (me) navigate(homeOf(me.role), { replace: true })
        return
      }
      reset()
      setSaved(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, ['currentPassword', 'newPassword'], lang))
    }
  }

  return <>
    {saved && <p className="auth-notice" role="status">{t('auth.passwordChanged')}</p>}
    <form className={page ? 'auth-recovery-form' : undefined} noValidate onSubmit={handleSubmit(onSubmit)}>
      <PasswordField
        showLabel={t('auth.show')} hideLabel={t('auth.hide')}
        showPasswordLabel={t('auth.showPassword')} hidePasswordLabel={t('auth.hidePassword')}
        label={t('auth.currentPassword')}
        autoComplete="current-password"
        placeholder={page ? t('auth.currentPasswordPlaceholder') : undefined}
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <PasswordField
        showLabel={t('auth.show')} hideLabel={t('auth.hide')}
        showPasswordLabel={t('auth.showPassword')} hidePasswordLabel={t('auth.hidePassword')}
        label={t('auth.newPassword')}
        autoComplete="new-password"
        placeholder={page ? t('auth.newPasswordPlaceholder') : undefined}
        aria-describedby={page ? hintId : undefined}
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      {page && <p className="auth-recovery-hint" id={hintId}>{t('auth.passwordHint')}</p>}
      <PasswordField
        showLabel={t('auth.show')} hideLabel={t('auth.hide')}
        showPasswordLabel={t('auth.showPassword')} hidePasswordLabel={t('auth.hidePassword')}
        label={t('auth.confirmPassword')}
        autoComplete="new-password"
        placeholder={page ? t('auth.confirmPassword') : undefined}
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      {page
        ? <div className="auth-recovery-form-message" aria-live="polite"><FormError>{formError}</FormError></div>
        : <FormError>{formError}</FormError>}
      <RoomsButton className={page ? 'auth-recovery-submit' : undefined} type="submit" disabled={isSubmitting}>
        {t('auth.changePassword')}{isSubmitting ? <Spinner label={t('auth.saving')} /> : page && <span aria-hidden="true">→</span>}
      </RoomsButton>
    </form>
  </>
}
