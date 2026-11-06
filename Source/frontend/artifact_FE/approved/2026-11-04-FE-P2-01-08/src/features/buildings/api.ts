import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import type { BuildingSelection } from './building-selection'

export type WaterMode = 'PER_M3' | 'PER_PERSON'
export type ServiceUnit = 'ROOM' | 'PERSON' | 'VEHICLE'

export interface BuildingManager {
  id: number
  fullName: string
  isActive: boolean
}

export interface BuildingView {
  id: number
  code: string
  name: string
  address: string
  district: string
  ward: string
  waterMode: WaterMode
  dueDays: number
  managerId: number | null
  manager: BuildingManager | null
  amenities: string[]
  description: string | null
  isActive: boolean
  pendingViewingCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateBuildingInput {
  code: string
  name: string
  address: string
  district: string
  ward: string
  waterMode: WaterMode
  dueDays?: number
  managerId?: number | null
  amenities?: string[]
  description?: string | null
}

export type UpdateBuildingInput = Partial<CreateBuildingInput> & { isActive?: boolean }

// BLD-02: a manager may edit only these two fields of his own buildings.
export interface BuildingNotesInput {
  amenities?: string[]
  description?: string | null
}

export type BuildingSort = '-createdAt' | 'createdAt' | 'code' | '-code' | 'name' | '-name'

export interface BuildingListQuery {
  buildingId?: BuildingSelection
  includeInactive?: boolean
  page?: number
  limit?: number
  sort?: BuildingSort
}

// Query rule for every list filtered by building (SCOPE-02): a number is sent; 'all' and null send nothing.
// Shared with the managers and rooms APIs.
export function buildingIdQuery(selection: BuildingSelection | undefined): number | undefined {
  return typeof selection === 'number' ? selection : undefined
}

// Bodies are built field by field so unrelated form values are never sent; undefined fields are dropped by JSON.
function buildingBody(input: UpdateBuildingInput) {
  return {
    code: input.code,
    name: input.name,
    address: input.address,
    district: input.district,
    ward: input.ward,
    waterMode: input.waterMode,
    dueDays: input.dueDays,
    managerId: input.managerId,
    amenities: input.amenities,
    description: input.description,
    isActive: input.isActive,
  }
}

export function listBuildings(query: BuildingListQuery = {}) {
  return apiRequestPage<BuildingView>(listPath('/buildings', {
    buildingId: buildingIdQuery(query.buildingId),
    includeInactive: query.includeInactive,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  }))
}

export function createBuilding(input: CreateBuildingInput) {
  return apiRequest<BuildingView>('/buildings', { method: 'POST', body: buildingBody(input) })
}

export function updateBuilding(id: number, input: UpdateBuildingInput) {
  return apiRequest<BuildingView>(`/buildings/${id}`, { method: 'PATCH', body: buildingBody(input) })
}

export function updateBuildingNotes(id: number, input: BuildingNotesInput) {
  return apiRequest<BuildingView>(`/buildings/${id}`, {
    method: 'PATCH',
    body: { amenities: input.amenities, description: input.description },
  })
}

export interface ServiceView {
  id: number
  buildingId: number
  name: string
  unit: ServiceUnit
  isActive: boolean
  hasCurrentRate: boolean
}

export type ServiceSort = 'id' | '-id' | 'name' | '-name'

export interface ServiceListQuery {
  buildingId?: BuildingSelection
  page?: number
  limit?: number
  sort?: ServiceSort
}

export function listServices(query: ServiceListQuery = {}) {
  return apiRequestPage<ServiceView>(listPath('/services', {
    buildingId: buildingIdQuery(query.buildingId),
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  }))
}

export function createService(input: { buildingId: number; name: string; unit: ServiceUnit }) {
  return apiRequest<ServiceView>('/services', {
    method: 'POST',
    body: { buildingId: input.buildingId, name: input.name, unit: input.unit },
  })
}

// Services are soft-deleted with isActive=false; the unit is fixed after creation.
export function updateService(id: number, input: { name?: string; isActive?: boolean }) {
  return apiRequest<ServiceView>(`/services/${id}`, {
    method: 'PATCH',
    body: { name: input.name, isActive: input.isActive },
  })
}
