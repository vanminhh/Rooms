import { useI18n } from '../../shared/i18n'
import type { ViewingContact } from './api'

export function ViewingContacts({ contact, bossContact }: { contact: ViewingContact | null; bossContact: ViewingContact | null }) {
  const { t } = useI18n()
  const contacts = [
    ...(contact?.phone && contact.phone !== bossContact?.phone ? [{ value: contact, label: t('viewing.manager') }] : []),
    ...(bossContact?.phone ? [{ value: bossContact, label: t('viewing.boss') }] : []),
  ]
  return <div className="viewing-contacts">{contacts.length ? contacts.map(({ value, label }) => <p key={label}>{label}: <a href={`tel:${value.phone}`}>{value.phone}</a></p>) : <p>{t('viewing.noContact')}</p>}</div>
}
