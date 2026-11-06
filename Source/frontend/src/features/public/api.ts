import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import type { ListPage } from '../../shared/api'

// Mirrors Source/backend/src/modules/rooms/public.types.ts; the BE returns no internal fields (PUB-04).
export interface PublicRoomListItem {
  id: number
  code: string
  floor: number
  areaM2: number
  price: number
  maxOccupants: number
  buildingId: number
  buildingCode: string
  buildingName: string
  district: string
  ward: string
  imageUrl: string | null
}

export interface PublicLocation {
  district: string
  roomCount: number
  wards: { ward: string; roomCount: number }[]
}

export interface PublicRateTier {
  tierNo: number
  upTo: number | null
  unitPrice: number
}

export interface PublicRateView {
  kind: 'ELECTRIC' | 'WATER' | 'SERVICE'
  serviceId: number | null
  serviceName: string | null
  unit: 'ROOM' | 'PERSON' | 'VEHICLE' | null
  effectiveFrom: string
  tiers: PublicRateTier[]
}

export interface PublicRates {
  electric: PublicRateView | null
  water: PublicRateView | null
  services: PublicRateView[]
}

export interface PublicEstimate {
  items: { label: string; amount: number }[]
  missing: string[]
  meteredNote: string
}

export interface PublicBuildingSummary {
  id: number
  code: string
  name: string
  address: string
  district: string
  ward: string
  waterMode: 'PER_M3' | 'PER_PERSON'
  amenities: string[]
  description: string | null
}

export interface PublicRoomDetail {
  id: number
  code: string
  floor: number
  areaM2: number
  maxOccupants: number
  furniture: string[]
  description: string | null
  price: number
  deposit: number
  monthlyEstimate: number
  estimate: PublicEstimate
  images: { id: number; url: string; sortOrder: number }[]
  building: PublicBuildingSummary
  rates: PublicRates
  upcomingRates: PublicRateView[]
  contact: { phone: string; zaloUrl: string | null; facebookUrl: string | null } | null
}

export interface PublicBuildingDetail extends PublicBuildingSummary {
  contact: PublicRoomDetail['contact']
  rates: PublicRates
  upcomingRates: PublicRateView[]
  rooms: PublicRoomListItem[]
}

export type PublicRoomSort = 'price' | '-price' | 'newest'

export interface PublicRoomsQuery {
  district?: string
  ward?: string
  buildingId?: number
  minPrice?: number
  maxPrice?: number
  sort?: PublicRoomSort
  page?: number
  limit?: number
}

export interface PublicViewingInput {
  roomId: number
  guestName: string
  guestPhone: string
  visitDate: string
  timeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING'
  note?: string
  website?: string
}

export const publicQueryKeys = {
  locations: ['public', 'locations'] as const,
  featured: ['public', 'featured'] as const,
  rooms: (query: PublicRoomsQuery) => ['public', 'rooms', query] as const,
  room: (id: number) => ['public', 'room', id] as const,
  building: (id: number) => ['public', 'building', id] as const,
}

export function listPublicLocations(): Promise<PublicLocation[]> {
  return apiRequest<PublicLocation[]>('/public/locations')
}

export function listPublicRooms(query: PublicRoomsQuery): Promise<ListPage<PublicRoomListItem>> {
  return apiRequestPage<PublicRoomListItem>(listPath('/public/rooms', { ...query }))
}

export function listFeaturedRooms(): Promise<PublicRoomListItem[]> {
  return apiRequest<PublicRoomListItem[]>('/public/featured-rooms')
}

export function getPublicRoom(id: number): Promise<PublicRoomDetail> {
  return apiRequest<PublicRoomDetail>(`/public/rooms/${id}`)
}

export function getPublicBuilding(id: number): Promise<PublicBuildingDetail> {
  return apiRequest<PublicBuildingDetail>(`/public/buildings/${id}`)
}

export function createPublicViewing(input: PublicViewingInput): Promise<{ received: true }> {
  return apiRequest<{ received: true }>('/public/viewings', { method: 'POST', body: input })
}
