import { apiRequest } from '../../shared/api'
import { buildingIdQuery } from '../buildings/api'
import type { BuildingSelection } from '../buildings/building-selection'
import type { ViewingView } from '../viewings/api'

// Mirrors dashboard.service.ts in the BE (NOTI-06). pendingPrices is null for a manager (PRC-11, Boss only).
export interface DashboardView {
  newViewings: { count: number; items: ViewingView[] }
  pendingPrices: { count: number; rooms: number; ratePlans: number } | null
}

// No page or limit on this endpoint; buildingId is sent only for a picked building (SCOPE-02).
export function getDashboard(buildingId?: BuildingSelection) {
  const id = buildingIdQuery(buildingId)
  return apiRequest<DashboardView>(id === undefined ? '/dashboard' : `/dashboard?buildingId=${id}`)
}
