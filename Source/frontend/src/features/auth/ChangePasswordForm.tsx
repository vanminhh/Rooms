import { useState } from 'react'
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
export function ChangePasswordForm({ afterSuccess }: { afterSuccess: 'go-home' | 'stay' }) {
  const { refreshMe } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

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
      setFormError(applyApiError(error, setError, ['currentPassword', 'newPassword']))
    }
  }

  return <>
    {saved && <p className="auth-notice" role="status">Đã đổi mật khẩu.</p>}
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <PasswordField
        label="Mật khẩu hiện tại"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <PasswordField
        label="Mật khẩu mới"
        autoComplete="new-password"
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <PasswordField
        label="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <FormError>{formError}</FormError>
      <RoomsButton type="submit" disabled={isSubmitting}>
        Đổi mật khẩu{isSubmitting && <Spinner label="Đang lưu" />}
      </RoomsButton>
    </form>
  </>
}
