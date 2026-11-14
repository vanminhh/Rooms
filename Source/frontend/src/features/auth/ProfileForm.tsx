import { useValidationLanguage } from './useValidationLanguage'
import { t as translate, useI18n } from '../../shared/i18n'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { useAuth } from '../../app/auth-context'
import { applyApiError } from '../../shared/form-errors'
import { ContactInfo } from './ContactInfo'
import { updateMe } from './api'
import { staffProfileSchema, tenantProfileSchema } from './schemas'
import type { StaffProfileValues, TenantProfileValues } from './schemas'
import './auth.css'

// AUTH-09: PATCH /auth/me updates only the keys it receives (undefined = leave as is, null = clear),
// so the email card and the public contact card save separately (UI-33, mockup 07). Empty text is sent as null (A8).

type ContactValues = Omit<StaffProfileValues, 'email'>

function SubmitButton({ label, submitting }: { label: string; submitting: boolean }) {
  const { t } = useI18n()
  return <RoomsButton className="auth-account-submit" type="submit" disabled={submitting}>
    <span>{label}</span>
    {submitting ? <Spinner label={t('auth.saving')} /> : <span aria-hidden="true">→</span>}
  </RoomsButton>
}

// Staff and tenants: the email used for notices and password recovery. Guests see a read-only field (AUTH-09).
export function EmailForm() {
  const { t, lang } = useI18n()
  const { user, refreshMe } = useAuth()
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const schema = useMemo(() => tenantProfileSchema((key, params) => translate(key, params, lang)), [lang])
  const { register, trigger, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<TenantProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: user?.email ?? '' },
  })
  useValidationLanguage(lang, errors, trigger)

  async function onSubmit(values: TenantProfileValues) {
    setFormError('')
    setSaved(false)
    try {
      await updateMe({ email: values.email || null })
      await refreshMe()
      setSaved(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, ['email'], lang))
    }
  }

  return <>
    {saved && <p className="auth-notice" role="status">{t('account.saved')}</p>}
    <form className="auth-account-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        placeholder="name@example.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormError>{formError}</FormError>
      <SubmitButton label={t('account.saveEmail')} submitting={isSubmitting} />
    </form>
  </>
}

// Staff only: the contact guests see (BLD-04). Sends exactly { contactPhone, zaloUrl, facebookUrl }.
export function PublicContactForm() {
  const { t, lang } = useI18n()
  const { user, refreshMe } = useAuth()
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const schema = useMemo(() => staffProfileSchema((key, params) => translate(key, params, lang)).omit({ email: true }), [lang])
  const { register, trigger, handleSubmit, setError, control, formState: { errors, isSubmitting } } = useForm<ContactValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      contactPhone: user?.contactPhone ?? '',
      zaloUrl: user?.zaloUrl ?? '',
      facebookUrl: user?.facebookUrl ?? '',
    },
  })
  useValidationLanguage(lang, errors, trigger)
  const typed = useWatch({ control })

  async function onSubmit(values: ContactValues) {
    setFormError('')
    setSaved(false)
    try {
      await updateMe({ contactPhone: values.contactPhone || null, zaloUrl: values.zaloUrl || null, facebookUrl: values.facebookUrl || null })
      await refreshMe()
      setSaved(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, ['contactPhone', 'zaloUrl', 'facebookUrl'], lang))
    }
  }

  const preview = { phone: typed.contactPhone || null, zaloUrl: typed.zaloUrl || null, facebookUrl: typed.facebookUrl || null }
  const hasContact = Boolean(preview.phone || preview.zaloUrl || preview.facebookUrl)

  return <>
    {saved && <p className="auth-notice" role="status">{t('account.saved')}</p>}
    <form className="auth-account-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label={t('account.contactPhone')}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="09xx xxx xxx"
        error={errors.contactPhone?.message}
        {...register('contactPhone')}
      />
      <TextField
        label={t('account.zalo')}
        type="url"
        placeholder="https://zalo.me/…"
        error={errors.zaloUrl?.message}
        {...register('zaloUrl')}
      />
      <TextField
        label={t('account.facebook')}
        type="url"
        placeholder="https://facebook.com/…"
        error={errors.facebookUrl?.message}
        {...register('facebookUrl')}
      />
      <FormError>{formError}</FormError>
      <SubmitButton label={t('account.saveContact')} submitting={isSubmitting} />
    </form>
    <div className="auth-account-preview" aria-live="polite">
      <p className="auth-account-preview-title">{t('account.preview')}</p>
      {hasContact ? <ContactInfo contact={preview} /> : <p>{t('account.noContact')}</p>}
    </div>
  </>
}
