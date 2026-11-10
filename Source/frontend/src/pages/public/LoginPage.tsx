import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Checkbox, FormError, IllustrationLabel, PasswordField, RoomsButton, Spinner, TextField } from '../../components'
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
  const managementHref = contact.data?.phone
    ? `tel:${contact.data.phone.replace(/[^\d+]/g, '')}`
    : contact.data?.zaloUrl?.startsWith('https://')
      ? contact.data.zaloUrl
      : contact.data?.facebookUrl?.startsWith('https://')
        ? contact.data.facebookUrl
        : null

  async function onSubmit(values: LoginValues) {
    setFormError('')
    try {
      const user = await login(values)
      navigate(postLoginPath(user.role, params.get('next')), { replace: true })
    } catch (error) {
      setFormError(applyApiError(error, setError, ['phone', 'password']))
    }
  }

  return <div className="auth-login-page">
    <section className="auth-login-visual" aria-label="Giới thiệu ROOMS">
      <img src="/images/auth-room.webp" alt="" />
      <IllustrationLabel className="auth-login-image-label" />
      <div className="auth-login-visual-copy">
        <p className="rooms-eyebrow">Phòng thuê tại Hà Nội</p>
        <p className="auth-login-promise">Một nơi ở <em>vừa vặn</em> giữa phố.</p>
      </div>
    </section>

    <section className="auth-login-panel" aria-labelledby="login-title">
      <header className="auth-login-heading">
        <span aria-hidden="true" />
        <h1 id="login-title">Đăng nhập</h1>
        <p>Chào mừng bạn trở lại ROOMS.</p>
      </header>

      <div className="auth-column">
        {passwordReset && <p className="auth-notice" role="status">Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.</p>}
        <form noValidate onSubmit={handleSubmit(onSubmit)}>
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
          <PasswordField
            label="Mật khẩu"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            disabled={isSubmitting}
            error={errors.password?.message}
            {...register('password')}
          />
          <div className="auth-login-options">
            <Checkbox label="Ghi nhớ đăng nhập" disabled={isSubmitting} {...register('remember')} />
            <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
          </div>
          <div className="auth-login-form-message" aria-live="polite">
            <FormError>{formError}</FormError>
          </div>
          <RoomsButton className="auth-login-submit" type="submit" disabled={isSubmitting}>
            <span>{isSubmitting ? 'Đang đăng nhập' : 'Đăng nhập'}</span>
            {isSubmitting ? <Spinner label="Đang đăng nhập" /> : <span aria-hidden="true">→</span>}
          </RoomsButton>
        </form>

        <div className="auth-login-account-note">
          <p>Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng</p>
          {contact.isLoading && <p className="auth-contact-status" role="status">Đang tải thông tin liên hệ…</p>}
          {!contact.isLoading && !contact.isError && <ContactInfo contact={contact.data ?? null} />}
          <div className="auth-login-account-actions">
            {managementHref
              ? <a href={managementHref}>Liên hệ quản lý</a>
              : <span>Liên hệ quản lý</span>}
            <Link to="/phong">Xem phòng trống</Link>
          </div>
        </div>
      </div>
    </section>
  </div>
}
