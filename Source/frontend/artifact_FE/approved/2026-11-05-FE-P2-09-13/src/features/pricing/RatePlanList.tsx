import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { formatDate, formatMoney } from '../../shared/formatters'
import { approvalStatusLabels, derivedApprovalLabels } from '../../shared/status-labels'
import { listServices } from '../buildings/api'
import type { ServiceView } from '../buildings/api'
import { listRatePlans } from './api'
import type { RateKind, RatePlanView, RateTierView } from './api'
import { groupRatePlans, rateKindLabels, tierRangeLabel, todayHanoi, waterUnitLabel } from './labels'
import { RatePlanForm } from './RatePlanForm'
import { useBuildingWaterMode } from './water-mode'
import './pricing.css'

// /ql/don-gia (FE-P2-10): electric, water and each service of one building, grouped by effective date (Q-FE8B-1).
export function RatePlanList({ buildingId }: { buildingId: number }) {
  const servicesQuery = useQuery({
    queryKey: ['services', 'list', buildingId],
    // shortcut: one page of 100 (the BE maximum) per building; paginate here if a building ever has more services.
    queryFn: () => listServices({ buildingId, limit: 100 }),
  })
  const services = servicesQuery.data?.data ?? []

  return <>
    <RatePlanSection buildingId={buildingId} kind="ELECTRIC" title={rateKindLabels.ELECTRIC} canPropose services={services} />
    <RatePlanSection buildingId={buildingId} kind="WATER" title={rateKindLabels.WATER} canPropose services={services} />
    {servicesQuery.isPending && <Spinner label="Đang xử lý" />}
    {servicesQuery.isError && <div className="pricing-state">
      <FormError>{servicesQuery.error.message}</FormError>
      <RoomsButton variant="sand" onClick={() => void servicesQuery.refetch()}>Thử lại</RoomsButton>
    </div>}
    {servicesQuery.isSuccess && services.map(service => <RatePlanSection key={service.id} buildingId={buildingId} kind="SERVICE"
      serviceId={service.id} title={`Dịch vụ · ${service.name}`} canPropose={service.isActive} services={services} />)}
  </>
}

interface RatePlanSectionProps {
  buildingId: number
  kind: RateKind
  serviceId?: number
  title: string
  canPropose: boolean
  services: ServiceView[]
}

function RatePlanSection({ buildingId, kind, serviceId, title, canPropose, services }: RatePlanSectionProps) {
  const [proposing, setProposing] = useState(false)
  const plans = useQuery({
    queryKey: ['rate-plans', 'list', buildingId, kind],
    // shortcut: one page of 100 per building and kind; a service's plans are filtered from it below.
    queryFn: () => listRatePlans({ buildingId, kind, limit: 100, sort: '-createdAt' }),
  })
  const unit = waterUnitLabel(useBuildingWaterMode(buildingId))
  // Electric and water plans have no serviceId; a service section keeps only its own plans (RATE-01).
  const rows = (plans.data?.data ?? []).filter(row => row.serviceId === (serviceId ?? null))
  const groups = groupRatePlans(rows, todayHanoi())

  return <section className="pricing-section" aria-label={title}>
    <div className="pricing-section-head">
      <SectionHeading>{title}</SectionHeading>
      {canPropose && <RoomsButton variant="outline" disabled={proposing} onClick={() => setProposing(true)}>Đề xuất đơn giá</RoomsButton>}
    </div>
    {proposing && <RatePlanForm buildingId={buildingId} kind={kind} serviceId={serviceId} services={services}
      prefillTiers={groups.current?.tiers} onSaved={() => setProposing(false)} onCancel={() => setProposing(false)} />}
    {plans.isPending && <Spinner label="Đang xử lý" />}
    {plans.isError && <div className="pricing-state">
      <FormError>{plans.error.message}</FormError>
      <RoomsButton variant="sand" onClick={() => void plans.refetch()}>Thử lại</RoomsButton>
    </div>}
    {plans.isSuccess && rows.length === 0 && <p className="rooms-empty">Chưa có biểu giá nào cho tòa này</p>}
    {rows.length > 0 && <>
      {groups.current && <PlanGroup title="Đang áp dụng" plans={[groups.current]} kind={kind} unit={unit} />}
      {groups.upcoming.length > 0 && <PlanGroup title="Sắp áp dụng" plans={groups.upcoming} kind={kind} unit={unit} />}
      {groups.history.length > 0 && <PlanGroup title="Lịch sử đơn giá" plans={groups.history} kind={kind} unit={unit} />}
    </>}
  </section>
}

function PlanGroup({ title, plans, kind, unit }: { title: string; plans: RatePlanView[]; kind: RateKind; unit: string }) {
  return <div className="pricing-group">
    <h3>{title}</h3>
    <ul className="pricing-list">
      {plans.map(plan => <li key={plan.id} className="pricing-plan">
        <p className="pricing-plan-title">Áp dụng từ {formatDate(plan.effectiveFrom)}</p>
        <p className="pricing-plan-meta">{plan.expired ? derivedApprovalLabels.expired : approvalStatusLabels[plan.status]}</p>
        <ul className="pricing-tiers">
          {plan.tiers.map((tier, index) => <li key={tier.tierNo}>{tierLabel(kind, plan.tiers, index, unit)}: {formatMoney(tier.unitPrice)}</li>)}
        </ul>
      </li>)}
    </ul>
  </div>
}

function tierLabel(kind: RateKind, tiers: RateTierView[], index: number, unit: string): string {
  if (kind === 'ELECTRIC') return tierRangeLabel(tiers, index)
  return kind === 'WATER' ? `Đơn giá nước (${unit})` : 'Đơn giá'
}
