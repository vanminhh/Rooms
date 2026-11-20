import { ElevatedCard } from '../../components'
import { useI18n } from '../../shared/i18n'
import { formatDate } from '../../shared/formatters'
import type { ContractDetail, OccupantView, VehicleView } from './types'

export function OccupantInformation({ occupant, tenant = false }: { occupant: OccupantView; tenant?: boolean }) {
  const { t } = useI18n()
  return <><h3>{occupant.fullName} · {t(occupant.isSigner ? 'contracts.signer' : 'contracts.roommate')}</h3>
    {occupant.phone && <p>{occupant.phone}</p>}
    {occupant.idNumberLast4 && (!tenant || occupant.isSigner) && <p>{t('contracts.idLast4', { last4: occupant.idNumberLast4.slice(-4) })}</p>}
    <p>{t('contracts.moveInDate')}: {formatDate(occupant.moveInDate)}{occupant.moveOutDate && <> · {t('contracts.moveOutDate')}: {formatDate(occupant.moveOutDate)}</>}</p>
  </>
}

export function VehicleInformation({ vehicle }: { vehicle: VehicleView }) {
  const { t } = useI18n()
  return <><h3>{vehicle.plate} · {t(`contracts.vehicle.${vehicle.type}`)}</h3>
    <p>{t(vehicle.isActive ? 'contracts.vehicleActive' : 'contracts.vehicleStopped')}</p>
    <p>{t('contracts.vehicleDates', { from: formatDate(vehicle.registeredAt), to: vehicle.removedAt ? formatDate(vehicle.removedAt) : '—' })}</p>
  </>
}

export function ContractInformation({ contract, tenant = false }: { contract: ContractDetail; tenant?: boolean }) {
  const { t } = useI18n()
  return <>
    <ElevatedCard className="contracts-card"><h2>{t('contracts.termProgress')}</h2><p>{t('contracts.term', { months: contract.termMonths })}</p>
      <p>{formatDate(contract.startDate)} – {formatDate(contract.endDate)}</p>
      {contract.progress && <><progress max={100} value={contract.progress.percent} aria-label={t('contracts.termProgress')} />
        <p>{t('contracts.termDays', { elapsed: contract.progress.elapsedDays, total: contract.progress.totalDays })}</p></>}
    </ElevatedCard>
    {tenant && <><ElevatedCard className="contracts-card"><h2>{t('contracts.occupants')}</h2>
      {contract.occupants.length ? contract.occupants.map(occupant => <section key={occupant.id}><OccupantInformation occupant={occupant} tenant /></section>) : <p>{t('contracts.noOccupants')}</p>}
    </ElevatedCard>
      <ElevatedCard className="contracts-card"><h2>{t('contracts.vehicles')}</h2>{contract.vehicles.length ? contract.vehicles.map(vehicle => <section key={vehicle.id}><VehicleInformation vehicle={vehicle} /></section>) : <p>{t('contracts.noVehicles')}</p>}</ElevatedCard>
      <ElevatedCard className="contracts-card"><h2>{t('contracts.services')}</h2>{contract.services.length ? <ul>{contract.services.map(service => <li key={service.id}>{service.name} · {t(`contracts.unit.${service.unit}`)}</li>)}</ul> : <p>{t('contracts.noServices')}</p>}</ElevatedCard>
    </>}
    {contract.terms && <ElevatedCard className="contracts-card"><h2>{t('contracts.terms')}</h2><p className="contracts-terms">{contract.terms}</p></ElevatedCard>}
  </>
}
