import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import type { ViewingStatus } from '../../shared/status-labels'
import { buildingIdQuery } from '../buildings/api'
import type { BuildingSelection } from '../buildings/building-selection'

export type TimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING'

// Mirrors viewings.types.ts in the BE (VIEW-03, VIEW-04, VIEW-10). The FE shows statusLabel and timeSlotLabel as sent.
export interface ViewingView {
  id: number
  roomId: number
  roomCode: string
  buildingId: number
  buildingName: string
  guestName: string
  guestPhone: string
  visitDate: string
  timeSlot: TimeSlot
  timeSlotLabel: string
  note: string | null
  source: 'WEB' | 'MANUAL'
  status: ViewingStatus
  statusLabel: string
  handledById: number | null
  outcomeNote: string | null
  createdAt: string
  updatedAt: string
}

export interface ViewingListQuery {
  buildingId?: BuildingSelection
  status?: ViewingStatus
  from?: string
  to?: string
  page?: number
  limit?: number
}

export function listViewings(query: ViewingListQuery = {}) {
  return apiRequestPage<ViewingView>(listPath('/viewings', {
    buildingId: buildingIdQuery(query.buildingId),
    status: query.status,
    from: query.from,
    to: query.to,
    page: query.page,
    limit: query.limit,
  }))
}

// No Idempotency-Key on create or update (PLAN CP-5); the form disables its submit button while saving.
export function createViewing(input: { roomId: number; guestName: string; guestPhone: string; visitDate: string; timeSlot: TimeSlot; note?: string }) {
  return apiRequest<ViewingView>('/viewings', {
    method: 'POST',
    body: {
      roomId: input.roomId,
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      visitDate: input.visitDate,
      timeSlot: input.timeSlot,
      note: input.note,
    },
  })
}

// Bodies are built field by field; undefined fields are dropped by JSON, so only the changed fields are sent.
export function updateViewing(id: number, input: { status?: ViewingStatus; outcomeNote?: string; visitDate?: string; timeSlot?: TimeSlot; note?: string }) {
  return apiRequest<ViewingView>(`/viewings/${id}`, {
    method: 'PATCH',
    body: {
      status: input.status,
      outcomeNote: input.outcomeNote,
      visitDate: input.visitDate,
      timeSlot: input.timeSlot,
      note: input.note,
    },
  })
}
