import { useId, useState } from 'react'
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
  const { refreshMe } = useAuth()
  const navigate = useNavigate()
  const hintId = useId()
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
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
      setFormError(applyApiError(error, setError, ['currentPassword', 'newPassword']))
    }
  }

  return <>
    {saved && <p className="auth-notice" role="status">Đã đổi mật khẩu.</p>}
    <form className={page ? 'auth-recovery-form' : undefined} noValidate onSubmit={handleSubmit(onSubmit)}>
      <PasswordField
        label="Mật khẩu hiện tại"
        autoComplete="current-password"
        placeholder={page ? 'Nhập mật khẩu hiện tại' : undefined}
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <PasswordField
        label="Mật khẩu mới"
        autoComplete="new-password"
        placeholder={page ? 'Nhập mật khẩu mới' : undefined}
        aria-describedby={page ? hintId : undefined}
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      {page && <p className="auth-recovery-hint" id={hintId}>Tối thiểu 8 ký tự</p>}
      <PasswordField
        label="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        placeholder={page ? 'Nhập lại mật khẩu mới' : undefined}
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      {page
        ? <div className="auth-recovery-form-message" aria-live="polite"><FormError>{formError}</FormError></div>
        : <FormError>{formError}</FormError>}
      <RoomsButton className={page ? 'auth-recovery-submit' : undefined} type="submit" disabled={isSubmitting}>
        Đổi mật khẩu{isSubmitting ? <Spinner label="Đang lưu" /> : page && <span aria-hidden="true">→</span>}
      </RoomsButton>
    </form>
  </>
}
