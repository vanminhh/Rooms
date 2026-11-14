import { useI18n } from '../../shared/i18n'
import { SectionHeading } from '../../components'

// /toi (VIEW-20). The list of viewings comes with EX-7; until then only the empty state is shown.
// The link is a plain anchor styled as the kit button: GuestLayout keeps internal anchors inside the SPA.
export function GuestHomePage() {
  const { t } = useI18n()
  return <>
    <SectionHeading>{t('guest.title')}</SectionHeading>
    <p>{t('guest.empty')}</p>
    <a className="rooms-button rooms-button--primary" href="/phong">{t('nav.findRoom')}</a>
  </>
}
