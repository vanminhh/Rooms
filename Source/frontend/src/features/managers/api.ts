import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import { buildingIdQuery } from '../buildings/api'
import type { BuildingSelection } from '../buildings/building-selection'

export interface ManagerBuilding {
  id: number
  code: string
  name: string
  isActive: boolean
}

export interface ManagerView {
  id: number
  phone: string
  fullName: string
  email: string | null
  isActive: boolean
  mustChangePassword: boolean
  contactPhone: string | null
  zaloUrl: string | null
  facebookUrl: string | null
  buildings: ManagerBuilding[]
  createdAt: string
}

// temporaryPassword is returned once, on creation only; the caller must not store it.
export interface CreatedManager {
  manager: ManagerView
  temporaryPassword: string
}

export type ManagerSort = '-createdAt' | 'createdAt' | 'fullName' | '-fullName'

export interface ManagerListQuery {
  buildingId?: BuildingSelection
  page?: number
  limit?: number
  sort?: ManagerSort
}

export function listManagers(query: ManagerListQuery = {}) {
  return apiRequestPage<ManagerView>(listPath('/managers', {
    buildingId: buildingIdQuery(query.buildingId),
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  }))
}

export function createManager(input: { phone: string; fullName: string; email?: string }) {
  return apiRequest<CreatedManager>('/managers', {
    method: 'POST',
    body: { phone: input.phone, fullName: input.fullName, email: input.email },
  })
}

// Deactivating keeps the manager's buildings (BLD-04, AUTH-08); only isActive is sent.
export function updateManager(id: number, input: { isActive: boolean }) {
  return apiRequest<ManagerView>(`/managers/${id}`, { method: 'PATCH', body: { isActive: input.isActive } })
}
