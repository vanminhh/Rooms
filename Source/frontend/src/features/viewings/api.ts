import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import type { QueryClient } from '@tanstack/react-query'
import type { ViewingStatus } from '../../shared/status-labels'
import { buildingIdQuery } from '../buildings/api'
import type { BuildingSelection } from '../buildings/building-selection'

export type TimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING'
export interface ViewingTime { visitAt: string | null; visitDate: string | null; timeSlot: TimeSlot | null }
export interface ViewingView extends ViewingTime {
  id: number; roomId: number; roomCode: string; buildingId: number; buildingName: string
  guestName: string; guestPhone: string; guestEmail: string | null; timeSlotLabel: string | null
  note: string | null; source: 'WEB' | 'MANUAL'; status: ViewingStatus; statusLabel: string
  handledById: number | null; outcomeNote: string | null; overdue: boolean; overlap: boolean; roomLocked: boolean
  createdAt: string; updatedAt: string
}
export interface ViewingContact { phone: string | null; zaloUrl: string | null; facebookUrl: string | null }
export interface OwnViewingView extends ViewingTime {
  id: number; roomId: number; roomCode: string; buildingName: string; buildingAddress: string
  note: string | null; status: ViewingStatus; contact: ViewingContact | null; bossContact: ViewingContact | null; createdAt: string
}
export interface ViewingDay { date: string; hours: string[] }
export interface ViewingListQuery {
  buildingId?: BuildingSelection; status?: ViewingStatus; from?: string; to?: string; page?: number; limit?: number
}
export function listViewings(query: ViewingListQuery = {}) {
  return apiRequestPage<ViewingView>(listPath('/viewings', { ...query, buildingId: buildingIdQuery(query.buildingId) }))
}
export function createViewing(input: { roomId: number; guestName: string; guestPhone: string; visitAt: string; note?: string }) {
  const { roomId, guestName, guestPhone, visitAt, note } = input
  return apiRequest<ViewingView>('/viewings', { method: 'POST', body: { roomId, guestName, guestPhone, visitAt, note } })
}
export function updateViewing(id: number, input: { status?: ViewingStatus; outcomeNote?: string; visitAt?: string; note?: string }) {
  const { status, outcomeNote, visitAt, note } = input
  return apiRequest<ViewingView>(`/viewings/${id}`, { method: 'PATCH', body: { status, outcomeNote, visitAt, note } })
}
export function confirmViewing(id: number, via: 'PHONE' | 'EMAIL') {
  return apiRequest<ViewingView>(`/viewings/${id}/confirm`, { method: 'POST', body: { via } })
}
export function getViewingTimes(roomId: number, from: string, to: string, signedIn: boolean) {
  return apiRequest<ViewingDay[]>(`/${signedIn ? 'me' : 'public'}/rooms/${roomId}/viewing-times?${new URLSearchParams({ from, to })}`)
}
export function bookViewing(input: { roomId: number; visitAt: string; note?: string }) {
  const { roomId, visitAt, note } = input
  return apiRequest<OwnViewingView>('/me/viewings', { method: 'POST', body: { roomId, visitAt, note } })
}
export function listOwnViewings(page = 1) {
  return apiRequestPage<OwnViewingView>(listPath('/me/viewings', { page, limit: 20 }))
}
export function getOwnViewing(id: number) { return apiRequest<OwnViewingView>(`/me/viewings/${id}`) }
export function cancelOwnViewing(id: number) { return apiRequest<OwnViewingView>(`/me/viewings/${id}/cancel`, { method: 'POST' }) }
// Capacity affects other rooms/buildings too. Let the BE recompute after every write.
export function invalidateViewings(client: QueryClient) {
  return Promise.all(['viewings', 'own-viewings', 'viewing-times', 'dashboard'].map(key => client.invalidateQueries({ queryKey: [key] })))
}
