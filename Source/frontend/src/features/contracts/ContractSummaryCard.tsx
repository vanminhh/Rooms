import { Link } from 'react-router'
import { ElevatedCard, StatusBadge } from '../../components'
import { useI18n } from '../../shared/i18n'
import { formatDate, formatMoney } from '../../shared/formatters'
import { contractStatusTones } from '../../shared/status-labels'
import type { ContractSummary } from './types'

export function ContractSummaryCard({ contract, detailHref }: { contract: ContractSummary; detailHref?: string }) {
  const { t } = useI18n()
  return <ElevatedCard className="contracts-card">
    <div className="contracts-card-head"><h3>{detailHref ? <Link to={detailHref}>{contract.code}</Link> : contract.code}</h3>
      <StatusBadge tone={contractStatusTones[contract.status]}>{t(`contract.status.${contract.status}`)}</StatusBadge></div>
    <p>{contract.building.name} · {t('contracts.room')} {contract.room.code}</p>
    <p>{contract.tenant.fullName} · {contract.tenant.phone}</p>
    <dl className="contracts-facts">
      <div><dt>{t('contracts.dates')}</dt><dd>{formatDate(contract.startDate)} – {formatDate(contract.endDate)}</dd></div>
      <div><dt>{t('contracts.rent')}</dt><dd>{formatMoney(contract.rent)}</dd></div>
      <div><dt>{t('contracts.deposit')}</dt><dd>{formatMoney(contract.deposit)}</dd></div>
    </dl>
  </ElevatedCard>
}
