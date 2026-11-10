import { ElevatedCard, SectionHeading } from '../../components'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { EmailForm } from '../../features/auth/ProfileForm'
import '../../features/auth/auth.css'
import '../../features/auth/forgot-password.css'
import '../../features/auth/account.css'

// /thue/tai-khoan (mockup 06, mobile first): email card, then change password card (AUTH-09).
export function TenantAccountPage() {
  return <div className="auth-account-page">
    <SectionHeading>Tài khoản</SectionHeading>
    <div className="auth-account-stack">
      <ElevatedCard className="auth-account-card">
        <header className="auth-account-card-heading">
          <h3 id="account-info-title">Thông tin tài khoản</h3>
          <p>Cập nhật địa chỉ email để nhận thông báo từ ROOMS.</p>
        </header>
        <EmailForm />
      </ElevatedCard>
      <ElevatedCard className="auth-account-card">
        <header className="auth-account-card-heading">
          <h3 id="account-password-title">Đổi mật khẩu</h3>
          <p>Cập nhật mật khẩu để bảo vệ tài khoản của bạn.</p>
        </header>
        <ChangePasswordForm afterSuccess="stay" layout="page" />
      </ElevatedCard>
    </div>
  </div>
}
