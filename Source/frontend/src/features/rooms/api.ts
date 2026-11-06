import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import type { RoomStatus } from '../../shared/status-labels'
import { buildingIdQuery } from '../buildings/api'
import type { BuildingSelection } from '../buildings/building-selection'

export interface RoomImageView {
  id: number
  roomId: number
  publicId: string
  url: string
  sortOrder: number
}

export interface RoomView {
  id: number
  buildingId: number
  code: string
  floor: number
  areaM2: number
  price: number | null
  maxOccupants: number
  furniture: string[]
  description: string | null
  underMaintenance: boolean
  isActive: boolean
  status: RoomStatus
  images: RoomImageView[]
  pendingViewingCount?: number
}

export interface RoomPendingProposal {
  id: number
  price: number
  effectiveFrom: string
  expired: boolean
}

// The grid item carries no furniture, description, images or viewing count (those come from GET /rooms/:id).
export type RoomGridItem = Omit<RoomView, 'furniture' | 'description' | 'images' | 'pendingViewingCount'> & {
  pendingProposal: RoomPendingProposal | null
  imageCount: number
}

// price is absent on purpose: the room form never writes it (ROOM-02, PRC).
export interface CreateRoomInput {
  buildingId: number
  code: string
  floor: number
  areaM2: number
  maxOccupants?: number
  furniture?: string[]
  description?: string | null
}

export interface UpdateRoomInput {
  code?: string
  floor?: number
  areaM2?: number
  maxOccupants?: number
  furniture?: string[]
  description?: string | null
  underMaintenance?: boolean
  isActive?: boolean
}

// The only Cloudinary fields the API takes for a room image (FILE-02); the delivery URL is built by the BE.
export interface RoomImageAsset {
  assetId: string
  publicId: string
  version: number
  format: string
}

export type RoomSort = 'code' | '-code' | 'floor' | '-floor'

export interface RoomListQuery {
  buildingId?: BuildingSelection
  includeInactive?: boolean
  page?: number
  limit?: number
  sort?: RoomSort
}

export function listRooms(query: RoomListQuery = {}) {
  return apiRequestPage<RoomGridItem>(listPath('/rooms', {
    buildingId: buildingIdQuery(query.buildingId),
    includeInactive: query.includeInactive,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  }))
}

// Read before the lock/maintenance dialog (pendingViewingCount, ROOM-09) and after a refresh (images).
// Q-FE8A-2/3; the BE endpoint is pending in a separate backend draft.
export function getRoom(id: number) {
  return apiRequest<RoomView & { pendingViewingCount: number }>(`/rooms/${id}`)
}

export function createRoom(input: CreateRoomInput) {
  return apiRequest<RoomView>('/rooms', {
    method: 'POST',
    body: {
      buildingId: input.buildingId,
      code: input.code,
      floor: input.floor,
      areaM2: input.areaM2,
      maxOccupants: input.maxOccupants,
      furniture: input.furniture,
      description: input.description,
    },
  })
}

export function updateRoom(id: number, input: UpdateRoomInput) {
  return apiRequest<RoomView>(`/rooms/${id}`, {
    method: 'PATCH',
    body: {
      code: input.code,
      floor: input.floor,
      areaM2: input.areaM2,
      maxOccupants: input.maxOccupants,
      furniture: input.furniture,
      description: input.description,
      underMaintenance: input.underMaintenance,
      isActive: input.isActive,
    },
  })
}

export function attachRoomImage(roomId: number, asset: RoomImageAsset) {
  return apiRequest<RoomImageView>(`/rooms/${roomId}/images`, {
    method: 'POST',
    body: { assetId: asset.assetId, publicId: asset.publicId, version: asset.version, format: asset.format },
  })
}

export function reorderRoomImages(roomId: number, imageIds: number[]) {
  return apiRequest<RoomImageView[]>(`/rooms/${roomId}/images/order`, { method: 'PATCH', body: { imageIds } })
}

export function deleteRoomImage(roomId: number, imageId: number) {
  return apiRequest<null>(`/rooms/${roomId}/images/${imageId}`, { method: 'DELETE' })
}
