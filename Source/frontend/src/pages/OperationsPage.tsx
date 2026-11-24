import { useI18n, type DictKey } from '../shared/i18n'

export function OperationsPage({ title }: { title: DictKey }) {
  const { t } = useI18n()
  return <section><h1>{t(title)}</h1><p>{t('common.comingSoon')}</p></section>
}
