import { ElevatedCard, SectionHeading } from '../../components'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { EmailForm, PublicContactForm } from '../../features/auth/ProfileForm'
import '../../features/auth/auth.css'
import '../../features/auth/forgot-password.css'
import '../../features/auth/account.css'

// /ql/tai-khoan (mockup 07): email and password on the left, the public contact with its preview on the right (AUTH-09).
export function StaffAccountPage() {
  return <div className="auth-account-page">
    <SectionHeading description="Quản lý thông tin tài khoản và thông tin liên hệ hiển thị cho khách.">Tài khoản</SectionHeading>
    <div className="auth-account-grid">
      <div className="auth-account-stack">
        <ElevatedCard className="auth-account-card">
          <header className="auth-account-card-heading">
            <h3 id="account-info-title">Thông tin tài khoản</h3>
            <p>Email dùng để nhận thông báo và khôi phục mật khẩu.</p>
          </header>
          <EmailForm />
        </ElevatedCard>
        <ElevatedCard className="auth-account-card">
          <header className="auth-account-card-heading">
            <h3 id="account-password-title">Đổi mật khẩu</h3>
            <p>Cập nhật mật khẩu đăng nhập để bảo mật tài khoản.</p>
          </header>
          <ChangePasswordForm afterSuccess="stay" layout="page" />
        </ElevatedCard>
      </div>
      <ElevatedCard className="auth-account-card">
        <header className="auth-account-card-heading">
          <h3 id="account-contact-title">Thông tin liên hệ công khai</h3>
          <p>Thông tin này sẽ hiển thị cho khách khi xem phòng.</p>
        </header>
        <PublicContactForm />
      </ElevatedCard>
    </div>
  </div>
}
