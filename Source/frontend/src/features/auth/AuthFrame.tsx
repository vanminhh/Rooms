import type { ReactNode } from 'react'
import { IllustrationLabel } from '../../components'
import './auth.css'
import './signup.css'

// The frame of /dang-nhap (photo and slogan on the left, form card on the right), for /dang-ky and /xac-minh-email.
export function AuthFrame({ titleId, title, description, children }: {
  titleId: string
  title: string
  description: string
  children: ReactNode
}) {
  return <div className="auth-login-page">
    <section className="auth-login-visual" aria-label="Giới thiệu ROOMS">
      <img src="/images/auth-room.webp" alt="" />
      <IllustrationLabel className="auth-login-image-label" />
      <div className="auth-login-visual-copy">
        <p className="rooms-eyebrow">Phòng thuê tại Hà Nội</p>
        <p className="auth-login-promise">Một nơi ở <em>vừa vặn</em> giữa phố.</p>
      </div>
    </section>

    <section className="auth-login-panel" aria-labelledby={titleId}>
      <header className="auth-login-heading">
        <span aria-hidden="true" />
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </header>
      <div className="auth-column">{children}</div>
    </section>
  </div>
}
