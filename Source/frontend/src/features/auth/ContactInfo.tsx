import type { PublicContact } from './api'
import './auth.css'

// Only https links are shown (A11): a javascript: or http: value from the API is dropped.
function httpsOnly(url: string | null | undefined): string | null {
  return url?.startsWith('https://') ? url : null
}

export function ContactInfo({ contact }: { contact: PublicContact | null }) {
  const phone = contact?.phone || null
  const zalo = httpsOnly(contact?.zaloUrl)
  const facebook = httpsOnly(contact?.facebookUrl)
  if (!phone && !zalo && !facebook) return null
  return <div className="auth-contact">
    {phone && <p>Điện thoại: {phone}</p>}
    {(zalo || facebook) && <div className="auth-contact-links">
      {zalo && <a href={zalo} target="_blank" rel="noopener noreferrer">Zalo</a>}
      {facebook && <a href={facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}
    </div>}
  </div>
}
