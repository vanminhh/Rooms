import { useI18n } from '../../shared/i18n'
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
  const { t } = useI18n()
  return <div className="auth-login-page">
    <section className="auth-login-visual" aria-label={t('auth.intro')}>
      <img src="/images/auth-room.webp" alt="" />
      <IllustrationLabel className="auth-login-image-label">{t('home.illustration')}</IllustrationLabel>
      <div className="auth-login-visual-copy">
        <p className="rooms-eyebrow">{t('home.hero.eyebrow')}</p>
        <p className="auth-login-promise">{t('home.hero.leading')}<em>{t('home.hero.highlight')}</em>{t('home.hero.trailing')}</p>
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
