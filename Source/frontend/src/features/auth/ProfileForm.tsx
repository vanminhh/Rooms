import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { useAuth } from '../../app/auth-context'
import { applyApiError } from '../../shared/form-errors'
import { ContactInfo } from './ContactInfo'
import { updateMe } from './api'
import { staffProfileSchema, tenantProfileSchema } from './schemas'
import type { StaffProfileValues } from './schemas'
import './auth.css'

// Tenants change only the email; staff also set the contact fields guests see (AUTH-09). Empty text is sent as null (A8).
export function ProfileForm({ staff }: { staff: boolean }) {
  const { user, refreshMe } = useAuth()
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  // One form type for both: the tenant schema only drops the contact keys, which a tenant never edits or sends.
  // The two schemas give different resolver types, so the union is cast (TS cannot unify them).
  const resolver = zodResolver(staff ? staffProfileSchema : tenantProfileSchema) as unknown as Resolver<StaffProfileValues>
  const { register, handleSubmit, setError, control, formState: { errors, isSubmitting } } = useForm<StaffProfileValues>({
    resolver,
    defaultValues: {
      email: user?.email ?? '',
      contactPhone: user?.contactPhone ?? '',
      zaloUrl: user?.zaloUrl ?? '',
      facebookUrl: user?.facebookUrl ?? '',
    },
  })
  const typed = useWatch({ control })

  async function onSubmit(values: StaffProfileValues) {
    setFormError('')
    setSaved(false)
    // The body is built field by field so a tenant never sends the contact fields.
    const body = staff
      ? { email: values.email || null, contactPhone: values.contactPhone || null, zaloUrl: values.zaloUrl || null, facebookUrl: values.facebookUrl || null }
      : { email: values.email || null }
    try {
      await updateMe(body)
      await refreshMe()
      setSaved(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, staff ? ['email', 'contactPhone', 'zaloUrl', 'facebookUrl'] : ['email']))
    }
  }

  const preview = { phone: typed.contactPhone || null, zaloUrl: typed.zaloUrl || null, facebookUrl: typed.facebookUrl || null }
  const hasContact = Boolean(preview.phone || preview.zaloUrl || preview.facebookUrl)

  return <>
    {saved && <p className="auth-notice" role="status">Đã lưu.</p>}
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      {staff && <>
        <TextField
          label="Số điện thoại liên hệ"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          error={errors.contactPhone?.message}
          {...register('contactPhone')}
        />
        <TextField
          label="Zalo"
          type="url"
          error={errors.zaloUrl?.message}
          {...register('zaloUrl')}
        />
        <TextField
          label="Facebook"
          type="url"
          error={errors.facebookUrl?.message}
          {...register('facebookUrl')}
        />
        <div>
          <p>Khách sẽ thấy:</p>
          {hasContact ? <ContactInfo contact={preview} /> : <p>Chưa có thông tin liên hệ</p>}
        </div>
      </>}
      <FormError>{formError}</FormError>
      <RoomsButton type="submit" disabled={isSubmitting}>
        Lưu{isSubmitting && <Spinner label="Đang lưu" />}
      </RoomsButton>
    </form>
  </>
}
