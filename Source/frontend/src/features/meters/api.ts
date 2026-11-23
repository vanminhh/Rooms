import { apiRequest } from '../../shared/api'
import type { MeterKind } from '../invoices/types'
import { assertRoomImageFile, uploadToCloudinary, type SignedUpload } from '../rooms/upload'

// Mirrors meters.service.ts `due` (MTR-09): a plain array, no paging.
export interface DueReading {
  invoiceId: number; contractId: number; periodNo: number; periodStart: string; periodEnd: string; billingDate: string
  overdue: boolean; reviewRequired: boolean
  room: { id: number; code: string }; tenant: { id: number; fullName: string }; building: { id: number; name: string; waterMode: 'PER_M3' | 'PER_PERSON' }
  previousReadings: Record<MeterKind, { id: number; value: number; readOn: string } | null>
}
export interface ReadingInput { roomId: number; invoiceId: number; kind: MeterKind; value: number; readOn: string; photoUrl?: string }
export type ReadingResult = { index: number; ok: true; data: { invoiceId: number; status: string } } | { index: number; ok: false; error: string }

// Q-P4-58 (D-38): optional photo, signed per room by the BE into the room's meter folder; the BE checks the URL on save.
export async function uploadMeterPhoto(roomId: number, file: File): Promise<string> {
  assertRoomImageFile(file)
  const signed = await apiRequest<SignedUpload>('/files/sign', { method: 'POST', body: { purpose: 'METER_PHOTO', roomId } })
  const asset = await uploadToCloudinary(signed, file)
  return `https://res.cloudinary.com/${signed.cloudName}/image/upload/v${asset.version}/${asset.publicId}.${asset.format}`
}

export const listDueReadings = (buildingId?: number) => apiRequest<DueReading[]>(buildingId === undefined ? '/meter-readings/due' : `/meter-readings/due?buildingId=${buildingId}`)
export const recordReadings = (items: ReadingInput[]) => apiRequest<ReadingResult[]>('/meter-readings', { method: 'POST', body: items })
