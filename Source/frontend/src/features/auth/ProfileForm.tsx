import { useState } from 'react'
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
const contactSchema = staffProfileSchema.omit({ email: true })
type ContactValues = Omit<StaffProfileValues, 'email'>

function SubmitButton({ label, submitting }: { label: string; submitting: boolean }) {
  return <RoomsButton className="auth-account-submit" type="submit" disabled={submitting}>
    <span>{label}</span>
    {submitting ? <Spinner label="Đang lưu" /> : <span aria-hidden="true">→</span>}
  </RoomsButton>
}

// Everyone: the email used for notices and password recovery. Sends exactly { email }.
export function EmailForm() {
  const { user, refreshMe } = useAuth()
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<TenantProfileValues>({
    resolver: zodResolver(tenantProfileSchema),
    defaultValues: { email: user?.email ?? '' },
  })

  async function onSubmit(values: TenantProfileValues) {
    setFormError('')
    setSaved(false)
    try {
      await updateMe({ email: values.email || null })
      await refreshMe()
      setSaved(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, ['email']))
    }
  }

  return <>
    {saved && <p className="auth-notice" role="status">Đã lưu.</p>}
    <form className="auth-account-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="name@example.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormError>{formError}</FormError>
      <SubmitButton label="Lưu email" submitting={isSubmitting} />
    </form>
  </>
}

// Staff only: the contact guests see (BLD-04). Sends exactly { contactPhone, zaloUrl, facebookUrl }.
export function PublicContactForm() {
  const { user, refreshMe } = useAuth()
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, setError, control, formState: { errors, isSubmitting } } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      contactPhone: user?.contactPhone ?? '',
      zaloUrl: user?.zaloUrl ?? '',
      facebookUrl: user?.facebookUrl ?? '',
    },
  })
  const typed = useWatch({ control })

  async function onSubmit(values: ContactValues) {
    setFormError('')
    setSaved(false)
    try {
      await updateMe({ contactPhone: values.contactPhone || null, zaloUrl: values.zaloUrl || null, facebookUrl: values.facebookUrl || null })
      await refreshMe()
      setSaved(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, ['contactPhone', 'zaloUrl', 'facebookUrl']))
    }
  }

  const preview = { phone: typed.contactPhone || null, zaloUrl: typed.zaloUrl || null, facebookUrl: typed.facebookUrl || null }
  const hasContact = Boolean(preview.phone || preview.zaloUrl || preview.facebookUrl)

  return <>
    {saved && <p className="auth-notice" role="status">Đã lưu.</p>}
    <form className="auth-account-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label="Số điện thoại liên hệ"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="09xx xxx xxx"
        error={errors.contactPhone?.message}
        {...register('contactPhone')}
      />
      <TextField
        label="Zalo"
        type="url"
        placeholder="https://zalo.me/…"
        error={errors.zaloUrl?.message}
        {...register('zaloUrl')}
      />
      <TextField
        label="Facebook"
        type="url"
        placeholder="https://facebook.com/…"
        error={errors.facebookUrl?.message}
        {...register('facebookUrl')}
      />
      <FormError>{formError}</FormError>
      <SubmitButton label="Lưu liên hệ" submitting={isSubmitting} />
    </form>
    <div className="auth-account-preview" aria-live="polite">
      <p className="auth-account-preview-title">Khách sẽ thấy:</p>
      {hasContact ? <ContactInfo contact={preview} /> : <p>Chưa có thông tin liên hệ</p>}
    </div>
  </>
}
