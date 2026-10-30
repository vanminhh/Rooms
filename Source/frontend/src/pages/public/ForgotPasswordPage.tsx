import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FormError, PasswordField, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { ContactInfo } from '../../features/auth/ContactInfo'
import { forgotPassword, resetPassword } from '../../features/auth/api'
import { forgotSchema, resetPasswordSchema } from '../../features/auth/schemas'
import type { ForgotValues, ResetPasswordValues } from '../../features/auth/schemas'
import { usePublicContact } from '../../features/auth/usePublicContact'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import '../../features/auth/auth.css'

// Two modes by the ?token query: request a link (no token) or set a new password (with token).
export function ForgotPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  return token ? <ResetForm token={token} /> : <ForgotForm />
}

function ForgotForm() {
  const contact = usePublicContact()
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { phone: '' },
  })

  async function onSubmit(values: ForgotValues) {
    setFormError('')
    try {
      await forgotPassword(values)
      setSent(true)
    } catch (error) {
      setFormError(applyApiError(error, setError, ['phone']))
    }
  }

  return <>
    <SectionHeading>Quên mật khẩu</SectionHeading>
    <div className="auth-column">
      {sent ? <>
        <p className="auth-notice" role="status">Nếu số điện thoại có email, chúng tôi đã gửi link đặt lại mật khẩu. Nếu không, hãy liên hệ quản lý.</p>
        <ContactInfo contact={contact.data ?? null} />
      </> : <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <TextField
          label="Số điện thoại"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <FormError>{formError}</FormError>
        <RoomsButton type="submit" disabled={isSubmitting}>
          Gửi{isSubmitting && <Spinner label="Đang gửi" />}
        </RoomsButton>
      </form>}
    </div>
  </>
}

function ResetForm({ token }: { token: string }) {
  const navigate = useNavigate()
  const [formError, setFormError] = useState('')
  const [linkInvalid, setLinkInvalid] = useState(false)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  })

  async function onSubmit(values: ResetPasswordValues) {
    setFormError('')
    setLinkInvalid(false)
    try {
      await resetPassword({ token, newPassword: values.newPassword })
      navigate('/dang-nhap', { replace: true, state: { notice: 'password-reset' } })
    } catch (error) {
      setFormError(applyApiError(error, setError, ['newPassword', 'confirmPassword']))
      setLinkInvalid(error instanceof ApiError && error.fields?.token !== undefined)
    }
  }

  return <>
    <SectionHeading>Đặt lại mật khẩu</SectionHeading>
    <div className="auth-column">
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
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
        {linkInvalid && <Link to="/quen-mat-khau">Gửi lại liên kết</Link>}
        <RoomsButton type="submit" disabled={isSubmitting}>
          Đặt lại mật khẩu{isSubmitting && <Spinner label="Đang lưu" />}
        </RoomsButton>
      </form>
    </div>
  </>
}
