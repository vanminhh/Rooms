import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Checkbox, FormError, PasswordField, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { useAuth } from '../../app/auth-context'
import { postLoginPath } from '../../app/guards'
import { ContactInfo } from '../../features/auth/ContactInfo'
import { loginSchema } from '../../features/auth/schemas'
import type { LoginValues } from '../../features/auth/schemas'
import { usePublicContact } from '../../features/auth/usePublicContact'
import { applyApiError } from '../../shared/form-errors'
import '../../features/auth/auth.css'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const contact = usePublicContact()
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '', remember: false },
  })
  const passwordReset = (location.state as { notice?: string } | null)?.notice === 'password-reset'

  async function onSubmit(values: LoginValues) {
    setFormError('')
    try {
      const user = await login(values)
      navigate(postLoginPath(user.role, params.get('next')), { replace: true })
    } catch (error) {
      setFormError(applyApiError(error, setError, ['phone', 'password']))
    }
  }

  return <>
    <SectionHeading>Đăng nhập</SectionHeading>
    <div className="auth-column">
      {passwordReset && <p className="auth-notice" role="status">Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.</p>}
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <TextField
          label="Số điện thoại"
          type="tel"
          inputMode="numeric"
          autoComplete="username"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <PasswordField
          label="Mật khẩu"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Checkbox label="Ghi nhớ đăng nhập" {...register('remember')} />
        <FormError>{formError}</FormError>
        <RoomsButton type="submit" disabled={isSubmitting}>
          Đăng nhập{isSubmitting && <Spinner label="Đang đăng nhập" />}
        </RoomsButton>
        <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
      </form>
      <div>
        <p>Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng</p>
        <ContactInfo contact={contact.data ?? null} />
        <Link to="/phong">Xem phòng trống</Link>
      </div>
    </div>
  </>
}
