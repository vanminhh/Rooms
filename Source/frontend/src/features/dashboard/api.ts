import { apiRequest } from '../../shared/api'
import { buildingIdQuery } from '../buildings/api'
import type { BuildingSelection } from '../buildings/building-selection'
import type { ViewingView } from '../viewings/api'

// Mirrors dashboard.service.ts in the BE (NOTI-06). pendingPrices is null for a manager (PRC-11, Boss only).
export interface DashboardView {
  pendingRequests?: RequestGroup
  approvedRenewals?: RequestGroup
  escalatedPaymentIssues?: RequestGroup
  newViewings: { count: number; items: ViewingView[] }
  overlappingViewings: { count: number; items: ViewingView[] }
  depositCancelledViewings: { count: number; items: ViewingView[] }
  unpaidDeposits: { count: number; items: { id: number; code: string; total: number; dueDate: string | null; contract: {
    id: number; code: string; room: { id: number; code: string }; building: { id: number; code: string; name: string }; tenant: { id: number; fullName: string; phone: string }
  } }[] }
  pendingPrices: { count: number; rooms: number; ratePlans: number } | null
  // Phase 4 money groups (NOTI-06, BIL-05, BIL-21, D-42, CON-20, CON-21); optional so an older API answer still renders.
  awaitingReadings?: { count: number; late: number; items: PeriodItem[] }
  missedPeriods?: { count: number; items: PeriodItem[] }
  overdueInvoices?: { count: number; items: DashboardView['unpaidDeposits']['items'] }
  expiringContracts?: { count: number; items: ContractItem[] }
  expiredContracts?: { count: number; items: ContractItem[] }
  renewalsWaiting?: { count: number; items: ContractItem[] }
}

type ContractRef = DashboardView['unpaidDeposits']['items'][number]['contract']
export interface RequestGroup {
  count: number
  items: { id: number; type: string; title: string; contractId: number }[]
}
export interface ContractItem extends ContractRef { endDate: string }
export interface PeriodItem {
  invoiceId: number | null; code: string | null; periodNo: number; periodStart: string; periodEnd: string
  billingDate: string; late: boolean; contract: ContractRef
}

// No page or limit on this endpoint; buildingId is sent only for a picked building (SCOPE-02).
export function getDashboard(buildingId?: BuildingSelection) {
  const id = buildingIdQuery(buildingId)
  return apiRequest<DashboardView>(id === undefined ? '/dashboard' : `/dashboard?buildingId=${id}`)
}
