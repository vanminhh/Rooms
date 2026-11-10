import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FormError, IllustrationLabel, PasswordField, RoomsButton, Spinner, TextField } from '../../components'
import { ContactInfo } from '../../features/auth/ContactInfo'
import { forgotPassword, resetPassword } from '../../features/auth/api'
import { forgotSchema, resetPasswordSchema } from '../../features/auth/schemas'
import type { ForgotValues, ResetPasswordValues } from '../../features/auth/schemas'
import { usePublicContact } from '../../features/auth/usePublicContact'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import '../../features/auth/auth.css'
import '../../features/auth/forgot-password.css'

const SENT_MESSAGE = 'Nếu số điện thoại có email, chúng tôi đã gửi link đặt lại mật khẩu. Nếu không, hãy liên hệ quản lý.'

export function ForgotPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')

  if (!token) return <RecoveryFrame><ForgotForm /></RecoveryFrame>
  return <RecoveryFrame><ResetForm token={token} /></RecoveryFrame>
}

function RecoveryFrame({ children }: { children: React.ReactNode }) {
  return <div className="auth-recovery-page">
    <section className="auth-login-visual" aria-label="Giới thiệu ROOMS">
      <img src="/images/auth-room.webp" alt="" />
      <IllustrationLabel className="auth-login-image-label" />
      <div className="auth-login-visual-copy">
        <p className="rooms-eyebrow">Phòng thuê tại Hà Nội</p>
        <p className="auth-login-promise">Một nơi ở <em>vừa vặn</em> giữa phố.</p>
      </div>
    </section>
    <section className="auth-recovery-panel">{children}</section>
  </div>
}

function RecoveryHeading({ id, title, description, descriptionRole }: { id: string; title: string; description: string; descriptionRole?: 'status' }) {
  return <header className="auth-recovery-heading">
    <span aria-hidden="true" />
    <h1 id={id}>{title}</h1>
    <p role={descriptionRole}>{description}</p>
  </header>
}

function managementHref(contact: ReturnType<typeof usePublicContact>['data']) {
  if (contact?.phone) return `tel:${contact.phone.replace(/[^\d+]/g, '')}`
  if (contact?.zaloUrl?.startsWith('https://')) return contact.zaloUrl
  if (contact?.facebookUrl?.startsWith('https://')) return contact.facebookUrl
  return null
}

function ContactSupport() {
  const contact = usePublicContact()
  const href = managementHref(contact.data)

  return <div className="auth-recovery-support">
    <p>Cần hỗ trợ? Vui lòng liên hệ quản lý.</p>
    {contact.isLoading && <p className="auth-contact-status" role="status">Đang tải thông tin liên hệ…</p>}
    {contact.isError && <p className="auth-contact-status">Chưa tải được thông tin liên hệ.</p>}
    {!contact.isLoading && !contact.isError && <ContactInfo contact={contact.data ?? null} />}
    <div className="auth-recovery-actions">
      {href ? <a href={href}>Liên hệ quản lý</a> : <span>Liên hệ quản lý</span>}
      <Link to="/dang-nhap">Quay lại đăng nhập</Link>
    </div>
  </div>
}

function ForgotForm() {
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

  if (sent) return <div className="auth-recovery-result" aria-labelledby="forgot-sent-title">
    <div className="auth-recovery-icon" aria-hidden="true">✓</div>
    <RecoveryHeading id="forgot-sent-title" title="Kiểm tra hướng dẫn" description={SENT_MESSAGE} descriptionRole="status" />
    <ContactSupport />
    <Link className="auth-recovery-primary-link" to="/dang-nhap">Quay lại đăng nhập <span aria-hidden="true">→</span></Link>
  </div>

  return <div aria-labelledby="forgot-title">
    <RecoveryHeading id="forgot-title" title="Quên mật khẩu" description="Nhập số điện thoại để nhận hướng dẫn đặt lại mật khẩu." />
    <form className="auth-recovery-form" noValidate onSubmit={handleSubmit(onSubmit)}>
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
      <div className="auth-recovery-form-message" aria-live="polite">
        <FormError>{formError}</FormError>
      </div>
      <RoomsButton className="auth-recovery-submit" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? 'Đang gửi' : 'Gửi'}</span>
        {isSubmitting && <Spinner label="Đang gửi" />}
      </RoomsButton>
    </form>
    <ContactSupport />
  </div>
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
      const invalid = error instanceof ApiError && error.fields?.token !== undefined
      setLinkInvalid(invalid)
      if (!invalid) setFormError(applyApiError(error, setError, ['newPassword', 'confirmPassword']))
    }
  }

  return <div aria-labelledby="reset-title">
    <RecoveryHeading id="reset-title" title="Đặt lại mật khẩu" description="Tạo mật khẩu mới cho tài khoản của bạn." />
    <form className="auth-recovery-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      {linkInvalid && <div className="auth-recovery-link-error">
        <FormError>Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn</FormError>
        <p>Liên kết có thể đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu một liên kết mới.</p>
        <Link to="/quen-mat-khau">Gửi lại liên kết</Link>
      </div>}
      <PasswordField
        label="Mật khẩu mới"
        autoComplete="new-password"
        placeholder="Nhập mật khẩu mới"
        aria-describedby="reset-password-hint"
        disabled={isSubmitting}
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <p className="auth-recovery-hint" id="reset-password-hint">Tối thiểu 8 ký tự</p>
      <PasswordField
        label="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        placeholder="Nhập lại mật khẩu mới"
        disabled={isSubmitting}
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <div className="auth-recovery-form-message" aria-live="polite">
        <FormError>{formError}</FormError>
      </div>
      <RoomsButton className="auth-recovery-submit" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? 'Đang đặt lại mật khẩu' : 'Đặt lại mật khẩu'}</span>
        {isSubmitting && <Spinner label="Đang lưu" />}
      </RoomsButton>
      <Link className="auth-recovery-back-link" to="/dang-nhap">Quay lại đăng nhập</Link>
    </form>
  </div>
}


