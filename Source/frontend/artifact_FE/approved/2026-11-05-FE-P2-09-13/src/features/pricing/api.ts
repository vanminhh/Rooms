import { apiRequest, apiRequestPage, listPath, type ListPage } from '../../shared/api'
import type { ApprovalStatus } from '../../shared/status-labels'
import { buildingIdQuery } from '../buildings/api'
import type { BuildingSelection } from '../buildings/building-selection'

export type RateKind = 'ELECTRIC' | 'WATER' | 'SERVICE'

export interface PriceChange {
  oldValue: number | null
  newValue: number
  changePercent: number | null
  label: string | null
}

export interface TierChange {
  tierNo: number
  oldValue: number
  newValue: number
  changePercent: number | null
}

export interface RateTierView {
  tierNo: number
  upTo: number | null
  unitPrice: number
}

export interface TierComparison {
  oldTiers: RateTierView[] | null
  newTiers: RateTierView[]
  tierChanges: TierChange[] | null
  label: string | null
}

export type RatePlanComparison = PriceChange | TierComparison

// Electric plans compare by tier (TierComparison); water, service and room prices compare by one value (PriceChange).
export function isTierComparison(comparison: RatePlanComparison): comparison is TierComparison {
  return 'newTiers' in comparison
}

export interface RoomPriceView {
  id: number
  roomId: number
  roomCode: string
  buildingId: number
  buildingName: string
  price: number
  effectiveFrom: string
  status: ApprovalStatus
  reason: string | null
  proposedById: number
  reviewedById: number | null
  reviewedAt: string | null
  reviewNote: string | null
  createdAt: string
  expired: boolean
  comparison: PriceChange
}

export interface RatePlanView {
  id: number
  buildingId: number
  buildingName: string
  kind: RateKind
  serviceId: number | null
  serviceName: string | null
  effectiveFrom: string
  status: ApprovalStatus
  reason: string | null
  proposedById: number
  reviewedById: number | null
  reviewedAt: string | null
  reviewNote: string | null
  createdAt: string
  expired: boolean
  tiers: RateTierView[]
  comparison: RatePlanComparison | null
}

export type PricingSort = 'createdAt' | '-createdAt'

export interface RoomPriceListQuery {
  buildingId?: BuildingSelection
  roomId?: number
  status?: ApprovalStatus
  page?: number
  limit?: number
  sort?: PricingSort
}

export interface RatePlanListQuery {
  buildingId?: BuildingSelection
  kind?: RateKind
  status?: ApprovalStatus
  page?: number
  limit?: number
  sort?: PricingSort
}

// SCOPE-02: a number is sent as buildingId; 'all' and null send nothing (buildingIdQuery).
export function listRoomPrices(query: RoomPriceListQuery = {}): Promise<ListPage<RoomPriceView>> {
  return apiRequestPage<RoomPriceView>(listPath('/room-prices', {
    buildingId: buildingIdQuery(query.buildingId),
    roomId: query.roomId,
    status: query.status,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  }))
}

export function listRatePlans(query: RatePlanListQuery = {}): Promise<ListPage<RatePlanView>> {
  return apiRequestPage<RatePlanView>(listPath('/rate-plans', {
    buildingId: buildingIdQuery(query.buildingId),
    kind: query.kind,
    status: query.status,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  }))
}

// Bodies are built field by field; tiers are copied so form-only keys (e.g. a field-array id) are never sent.
export function proposeRoomPrice(
  input: { roomId: number; price: number; effectiveFrom: string; reason?: string },
  idempotencyKey: string,
) {
  return apiRequest<RoomPriceView>('/room-prices', {
    method: 'POST',
    body: { roomId: input.roomId, price: input.price, effectiveFrom: input.effectiveFrom, reason: input.reason },
    idempotencyKey,
  })
}

export function proposeRatePlan(
  input: { buildingId: number; kind: RateKind; serviceId?: number; effectiveFrom: string; reason?: string; tiers: RateTierView[] },
  idempotencyKey: string,
) {
  return apiRequest<RatePlanView>('/rate-plans', {
    method: 'POST',
    body: {
      buildingId: input.buildingId,
      kind: input.kind,
      serviceId: input.serviceId,
      effectiveFrom: input.effectiveFrom,
      reason: input.reason,
      tiers: input.tiers.map(({ tierNo, upTo, unitPrice }) => ({ tierNo, upTo, unitPrice })),
    },
    idempotencyKey,
  })
}

export function approveRoomPrice(id: number, idempotencyKey: string) {
  return apiRequest<RoomPriceView>(`/room-prices/${id}/approve`, { method: 'POST', idempotencyKey })
}

export function rejectRoomPrice(id: number, reviewNote: string, idempotencyKey: string) {
  return apiRequest<RoomPriceView>(`/room-prices/${id}/reject`, { method: 'POST', body: { reviewNote }, idempotencyKey })
}

export function approveRatePlan(id: number, idempotencyKey: string) {
  return apiRequest<RatePlanView>(`/rate-plans/${id}/approve`, { method: 'POST', idempotencyKey })
}

export function rejectRatePlan(id: number, reviewNote: string, idempotencyKey: string) {
  return apiRequest<RatePlanView>(`/rate-plans/${id}/reject`, { method: 'POST', body: { reviewNote }, idempotencyKey })
}

// FE8B-14: randomUUID exists only in secure contexts. The key needs uniqueness, not secrecy, so the fallbacks are enough.
export function newIdempotencyKey(): string {
  const webCrypto = globalThis.crypto
  const uuid = webCrypto?.randomUUID?.()
  if (uuid) return uuid
  if (webCrypto?.getRandomValues) {
    return Array.from(webCrypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
