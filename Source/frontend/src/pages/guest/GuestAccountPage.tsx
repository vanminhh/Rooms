import { ElevatedCard, SectionHeading, TextField } from '../../components'
import { useAuth } from '../../app/auth-context'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { EmailForm } from '../../features/auth/ProfileForm'
import '../../features/auth/auth.css'
import '../../features/auth/forgot-password.css'
import '../../features/auth/account.css'

// /toi/tai-khoan (AUTH-09): name and phone are read only; the password can be changed.
// A guest's email is the address the sign-up code verified (AUTH-12), so it is read only; a tenant may edit theirs.
export function GuestAccountPage() {
  const { user } = useAuth()
  return <div className="auth-account-page">
    <SectionHeading>Tài khoản</SectionHeading>
    <div className="auth-account-stack">
      <ElevatedCard className="auth-account-card">
        <header className="auth-account-card-heading">
          <h3 id="account-info-title">Thông tin tài khoản</h3>
          <p>{user?.role === 'GUEST' ? 'Họ tên, số điện thoại và email' : 'Họ tên và số điện thoại'} không đổi được tại đây. Cần đổi, hãy liên hệ quản lý.</p>
        </header>
        <TextField label="Họ tên" readOnly defaultValue={user?.fullName ?? ''} />
        <TextField label="Số điện thoại" readOnly defaultValue={user?.phone ?? ''} />
        {user?.role === 'GUEST'
          ? <TextField label="Email" type="email" readOnly defaultValue={user.email ?? ''} />
          : <EmailForm />}
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
