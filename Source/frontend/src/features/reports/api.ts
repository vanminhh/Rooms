import { apiRequest } from '../../shared/api'

export interface Revenue {
  months: { month: string; revenue: number; costs: number; profit: number }[]
  outstanding: number
  overdue: number
  depositsHeld: number
}
export interface Occupancy { occupied: number; rooms: number; percent: number }
type Report<T> = T & { comparison?: (T & { buildingId: number; name: string })[] }

export function getRevenue(buildingId?: number, to?: string) {
  const params = new URLSearchParams()
  if (buildingId) params.set('buildingId', String(buildingId))
  if (to) params.set('to', to)
  return apiRequest<Report<Revenue>>('/reports/revenue?' + params)
}
export function getOccupancy(buildingId?: number) {
  return apiRequest<Report<Occupancy>>('/reports/occupancy' + (buildingId ? '?buildingId=' + buildingId : ''))
}
