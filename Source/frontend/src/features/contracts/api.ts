import { apiRequest, apiRequestPage, listPath } from '../../shared/api'
import { buildingIdQuery } from '../buildings/api'
import type {
  CancelContractInput, CancelContractResult, CancelPreview, ContractAsset, ContractDetail, ContractListQuery,
  ContractPrintData, ContractSummary, CreateContractInput, CreateOccupantInput, CreateVehicleInput,
  MoveInInput, MoveInResult, OccupantChanges, OccupantView, PaymentMethod, PaymentReceipt, RecordDepositInput, SettlementInput, SettlementView,
  SelectedContractService, SignContractResult, SignedDocument, VehicleChanges, VehicleLookupQuery,
  VehicleLookupView, VehicleView,
} from './types'

// Only provider metadata goes back to the API; never send a delivery URL or a signed upload response.
function assetBody(asset: ContractAsset): ContractAsset {
  return { assetId: asset.assetId, publicId: asset.publicId, version: asset.version, format: asset.format }
}
const nullableAsset = (asset: ContractAsset | null | undefined) => asset == null ? asset : assetBody(asset)

export function listContracts(query: ContractListQuery = {}) {
  return apiRequestPage<ContractSummary>(listPath('/contracts', {
    buildingId: buildingIdQuery(query.buildingId), status: query.status, q: query.q,
    sort: query.sort, page: query.page, limit: query.limit,
  }))
}

export const getContract = (id: number) => apiRequest<ContractDetail>(`/contracts/${id}`)
export const getContractDates = (startDate: string, termMonths: number) =>
  apiRequest<{ startDate: string; endDate: string; termMonths: number }>(`/contracts/end-date?${new URLSearchParams({ startDate, termMonths: String(termMonths) })}`)

export const listMyContracts = (page = 1, limit = 20) => apiRequestPage<ContractSummary>(listPath('/me/contracts', { page, limit }))
export const getMyContract = (id: number) => apiRequest<ContractDetail>(`/me/contracts/${id}`)
export const getMyContractPrint = (id: number) => apiRequest<ContractPrintData>(`/me/contracts/${id}/print`)
export const getMyContractScan = (id: number) => apiRequest<SignedDocument>(`/me/contracts/${id}/scan`)

export function createContract(input: CreateContractInput) {
  const { signer } = input
  return apiRequest<ContractSummary>('/contracts', { method: 'POST', body: {
    roomId: input.roomId,
    signer: { fullName: signer.fullName, phone: signer.phone, email: signer.email, dateOfBirth: signer.dateOfBirth, idNumber: signer.idNumber },
    startDate: input.startDate, termMonths: input.termMonths, deposit: input.deposit,
    serviceIds: input.serviceIds, terms: input.terms, viewingId: input.viewingId,
    confirmedGuestAccountId: input.confirmedGuestAccountId, confirmDifferentViewingOwner: input.confirmDifferentViewingOwner,
  } })
}

// Call these on an explicit action, not on hover/preload. Keep temporaryPassword in page state only.
export const signContract = (id: number, asset: ContractAsset) =>
  apiRequest<SignContractResult>(`/contracts/${id}/sign`, { method: 'POST', body: assetBody(asset) })
export const resetContractPassword = (id: number) =>
  apiRequest<{ temporaryPassword: string }>(`/contracts/${id}/reset-password`, { method: 'POST' })
export const getContractPrint = (id: number) => apiRequest<ContractPrintData>(`/contracts/${id}/print`)
export const getContractScan = (id: number) => apiRequest<SignedDocument>(`/contracts/${id}/scan`)

export function moveInContract(id: number, input: MoveInInput) {
  return apiRequest<MoveInResult>(`/contracts/${id}/move-in`, { method: 'POST', body: {
    electric: input.electric, water: input.water, readOn: input.readOn, note: input.note,
    electricReplacement: input.electricReplacement === undefined ? undefined : { oldMeterFinal: input.electricReplacement.oldMeterFinal },
    waterReplacement: input.waterReplacement === undefined ? undefined : { oldMeterFinal: input.waterReplacement.oldMeterFinal },
  } })
}

export const previewContractCancellation = (id: number, input: CancelContractInput) =>
  apiRequest<CancelPreview>(`/contracts/${id}/cancel-preview`, { method: 'POST', body: { reason: input.reason, depositKept: input.depositKept } })

export function cancelContract(id: number, input: CancelContractInput, idempotencyKey: string) {
  return apiRequest<CancelContractResult>(`/contracts/${id}/cancel`, {
    method: 'POST', body: { reason: input.reason, depositKept: input.depositKept, expectedDepositReceived: input.expectedDepositReceived }, idempotencyKey,
  })
}

// BIL-13..19: the dry run writes nothing and sends no Idempotency-Key; the real write sends one per confirmation (API-05).
export const previewSettlement = (contractId: number, input: SettlementInput) =>
  apiRequest<SettlementView>(`/contracts/${contractId}/settlement?dryRun=true`, { method: 'POST', body: input })
export const settleContract = (contractId: number, input: SettlementInput, idempotencyKey: string) =>
  apiRequest<SettlementView>(`/contracts/${contractId}/settlement?dryRun=false`, { method: 'POST', body: input, idempotencyKey })
export const markRefundPaid = (settlementId: number, body: { method: PaymentMethod; note?: string }, idempotencyKey: string) =>
  apiRequest<{ settlementId: number; net: number; refundPaidAt: string }>(`/settlements/${settlementId}/refund-paid`, { method: 'POST', body, idempotencyKey })

export function recordDepositPayment(invoiceId: number, input: RecordDepositInput, idempotencyKey: string) {
  return apiRequest<PaymentReceipt>(`/invoices/${invoiceId}/payment`, {
    method: 'POST', body: { method: input.method, paidAt: input.paidAt, note: input.note }, idempotencyKey,
  })
}

function occupantBody(input: OccupantChanges) {
  return {
    fullName: input.fullName, phone: input.phone, dateOfBirth: input.dateOfBirth, idNumber: input.idNumber,
    idFront: nullableAsset(input.idFront), idBack: nullableAsset(input.idBack),
    moveInDate: input.moveInDate, moveOutDate: input.moveOutDate,
  }
}
export const listOccupants = (id: number) => apiRequest<OccupantView[]>(`/contracts/${id}/occupants`)
export const createOccupant = (id: number, input: CreateOccupantInput) =>
  apiRequest<OccupantView>(`/contracts/${id}/occupants`, { method: 'POST', body: occupantBody(input) })
export const createMyOccupant = (id: number, input: CreateOccupantInput) =>
  apiRequest<OccupantView>(`/me/contracts/${id}/occupants`, { method: 'POST', body: occupantBody(input) })
export const updateOccupant = (id: number, oid: number, input: OccupantChanges) =>
  apiRequest<OccupantView>(`/contracts/${id}/occupants/${oid}`, { method: 'PATCH', body: occupantBody(input) })
export const getOccupantIdPhotos = (id: number, oid: number) =>
  apiRequest<{ front: SignedDocument | null; back: SignedDocument | null }>(`/contracts/${id}/occupants/${oid}/id-photos`)

export const listContractVehicles = (id: number) => apiRequest<VehicleView[]>(`/contracts/${id}/vehicles`)
export const createContractVehicle = (id: number, input: CreateVehicleInput) =>
  apiRequest<VehicleView>(`/contracts/${id}/vehicles`, { method: 'POST', body: {
    plate: input.plate, type: input.type, serviceId: input.serviceId, registeredAt: input.registeredAt,
  } })
export const updateContractVehicle = (id: number, vid: number, input: VehicleChanges) =>
  apiRequest<VehicleView>(`/contracts/${id}/vehicles/${vid}`, { method: 'PATCH', body: {
    plate: input.plate, type: input.type, serviceId: input.serviceId, registeredAt: input.registeredAt,
    isActive: input.isActive, removedAt: input.removedAt,
  } })

export function lookupVehicles(query: VehicleLookupQuery = {}) {
  return apiRequestPage<VehicleLookupView>(listPath('/vehicles', {
    plate: query.plate, isActive: query.isActive, page: query.page, limit: query.limit,
  }))
}

export const listContractServices = (id: number) => apiRequest<SelectedContractService[]>(`/contracts/${id}/services`)
export const updateContractServices = (id: number, serviceIds: number[]) =>
  apiRequest<SelectedContractService[]>(`/contracts/${id}/services`, { method: 'PATCH', body: { serviceIds } })
