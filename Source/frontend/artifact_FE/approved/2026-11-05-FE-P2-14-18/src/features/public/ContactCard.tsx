import type { ReactElement } from 'react'
import type { PublicRoomDetail } from './api'

// BLD-04: the manager's contact as the API gives it; a missing link is left out, never shown empty.
export function ContactCard({ contact }: { contact: PublicRoomDetail['contact'] }): ReactElement | null {
  if (!contact) return null
  return <section className="public-contact">
    <h3>Liên hệ</h3>
    <p><a href={`tel:${contact.phone}`}>{contact.phone}</a></p>
    {contact.zaloUrl && <p><a href={contact.zaloUrl} target="_blank" rel="noreferrer">Nhắn Zalo</a></p>}
    {contact.facebookUrl && <p><a href={contact.facebookUrl} target="_blank" rel="noreferrer">Facebook</a></p>}
  </section>
}
