import { RoomsButton, SectionHeading } from '../../components'
import { useAuth } from '../../app/auth-context'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { useSignOut } from '../../features/auth/useSignOut'
import '../../features/auth/auth.css'

export function ChangePasswordPage() {
  const { user } = useAuth()
  const { signOut, signingOut } = useSignOut()

  return <>
    <SectionHeading>Đổi mật khẩu</SectionHeading>
    <div className="auth-column">
      {user?.mustChangePassword && <p>Bạn cần đổi mật khẩu trước khi tiếp tục</p>}
      <ChangePasswordForm afterSuccess="go-home" />
      <RoomsButton variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>Đăng xuất</RoomsButton>
    </div>
  </>
}
