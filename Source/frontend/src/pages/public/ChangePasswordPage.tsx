import { IllustrationLabel, RoomsButton } from '../../components'
import { useAuth } from '../../app/auth-context'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { useSignOut } from '../../features/auth/useSignOut'
import '../../features/auth/auth.css'
import '../../features/auth/forgot-password.css'
import '../../features/auth/change-password.css'

// /doi-mat-khau (mockup 05, AUTH-05): same two-column frame as the login and recovery pages.
export function ChangePasswordPage() {
  const { user } = useAuth()
  const { signOut, signingOut } = useSignOut()
  const forced = user?.mustChangePassword === true

  return <div className="auth-recovery-page">
    <section className="auth-login-visual" aria-label="Giới thiệu ROOMS">
      <img src="/images/auth-room.webp" alt="" />
      <IllustrationLabel className="auth-login-image-label" />
      <div className="auth-login-visual-copy">
        <p className="rooms-eyebrow">Phòng thuê tại Hà Nội</p>
        <p className="auth-login-promise">Một nơi ở <em>vừa vặn</em> giữa phố.</p>
      </div>
    </section>

    <section className="auth-recovery-panel" aria-labelledby="change-password-title">
      <header className="auth-recovery-heading">
        <span aria-hidden="true" />
        <h1 id="change-password-title">Đổi mật khẩu</h1>
        <p>{forced ? 'Bạn cần đổi mật khẩu trước khi tiếp tục.' : 'Tạo mật khẩu mới cho tài khoản của bạn.'}</p>
      </header>
      <ChangePasswordForm afterSuccess="go-home" layout="page" />
      <RoomsButton className="auth-change-signout" variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>Đăng xuất</RoomsButton>
    </section>
  </div>
}
