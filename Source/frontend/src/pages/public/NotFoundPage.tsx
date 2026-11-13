import { Link } from 'react-router'
import { SectionHeading } from '../../components'
import { useI18n } from '../../shared/i18n'

export function NotFoundPage() {
  const { t } = useI18n()
  return <>
    <SectionHeading>{t('home.notFound.title')}</SectionHeading>
    <p><Link to="/">{t('home.notFound.back')}</Link></p>
  </>
}
