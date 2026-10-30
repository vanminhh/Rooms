import { SectionHeading } from '../../components'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { ProfileForm } from '../../features/auth/ProfileForm'
import '../../features/auth/auth.css'

export function TenantAccountPage() {
  return <>
    <SectionHeading>Tài khoản</SectionHeading>
    <div className="auth-column">
      <SectionHeading>Đổi mật khẩu</SectionHeading>
      <ChangePasswordForm afterSuccess="stay" />
      <SectionHeading>Email</SectionHeading>
      <ProfileForm staff={false} />
    </div>
  </>
}
