import { useState } from 'react'
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
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [formError, setFormError] = useState('')
  const [taken, setTaken] = useState(false)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', phone: '', email: '', password: '' },
  })

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
        setError(error.code === 'PHONE_TAKEN' ? 'phone' : 'email', { type: 'server', message: error.message })
        return
      }
      setFormError(applyApiError(error, setError, ['fullName', 'phone', 'email', 'password']))
    }
  }

  return <AuthFrame titleId="register-title" title="Đăng ký" description="Tạo tài khoản để đặt lịch xem phòng.">
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label="Họ tên"
        autoComplete="name"
        placeholder="Nhập họ tên của bạn"
        disabled={isSubmitting}
        error={errors.fullName?.message}
        {...register('fullName')}
      />
      <TextField
        label="Số điện thoại"
        type="tel"
        inputMode="numeric"
        autoComplete="username"
        placeholder="Nhập số điện thoại của bạn"
        disabled={isSubmitting}
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="Nhập email để nhận mã xác minh"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Mật khẩu"
        autoComplete="new-password"
        placeholder="Tối thiểu 8 ký tự"
        disabled={isSubmitting}
        error={errors.password?.message}
        {...register('password')}
      />
      <div className="auth-login-form-message" aria-live="polite">
        <FormError>{formError}</FormError>
        {taken && <p className="auth-signup-switch"><Link to="/dang-nhap">Đăng nhập</Link></p>}
      </div>
      <RoomsButton className="auth-login-submit" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? 'Đang đăng ký' : 'Đăng ký'}</span>
        {isSubmitting ? <Spinner label="Đang đăng ký" /> : <span aria-hidden="true">→</span>}
      </RoomsButton>
    </form>
    <p className="auth-signup-switch">Đã có tài khoản? <Link to={next ? `/dang-nhap?next=${encodeURIComponent(next)}` : '/dang-nhap'}>Đăng nhập</Link></p>
  </AuthFrame>
}
