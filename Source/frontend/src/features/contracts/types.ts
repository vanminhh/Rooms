import type { BuildingSelection } from '../buildings/building-selection'
import type { ServiceUnit } from '../buildings/api'
import type { RoomImageAsset } from '../rooms/api'
import type { ContractStatus, InvoiceStatus } from '../../shared/status-labels'

export type ContractAsset = RoomImageAsset
export type VehicleType = 'MOTORBIKE' | 'E_BIKE' | 'BICYCLE' | 'CAR' | 'OTHER'
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER'

export interface ContractSummary {
  id: number
  code: string
  status: ContractStatus
  startDate: string
  endDate: string
  termMonths: number
  rent: number
  deposit: number
  createdAt: string
  room: { id: number; code: string }
  building: { id: number; code: string; name: string }
  tenant: { id: number; fullName: string; phone: string; email: string | null }
}

export interface DepositInvoice {
  id: number
  status: InvoiceStatus
  total: number
  issueDate: string | null
  dueDate: string | null
  vietqr: { bankBin: string; accountNo: string; accountName: string; amount: number; content: string } | null
  qrImageUrl: string | null
}

// Read models contain neither a full CCCD number nor private asset references.
export interface OccupantView {
  id: number
  fullName: string
  phone: string | null
  dateOfBirth: string | null
  isSigner: boolean
  idNumberLast4: string | null
  moveInDate: string
  moveOutDate: string | null
  hasIdFront?: boolean
  hasIdBack?: boolean
}

export interface VehicleView {
  id: number
  plate: string
  type: VehicleType
  serviceId: number
  isActive: boolean
  registeredAt: string
  removedAt: string | null
}

export interface VehicleLookupView extends VehicleView {
  contract: {
    id: number
    code: string
    status: ContractStatus
    room: { id: number; code: string }
    building: { id: number; code: string; name: string }
    tenant: { id: number; fullName: string; phone: string }
  }
}

export interface ContractService {
  id: number
  name: string
  unit: ServiceUnit
}
export interface SelectedContractService extends ContractService { isActive: boolean }

// Q-P4-54: the settlement row, also after a reload (BIL-13..19, CON-12).
export interface ContractSettlement {
  id: number; moveOutDate: string; deposit: number; lastPeriodAmount: number; remainingRent: number; previousDebt: number
  damages: number; depositForfeit: number; net: number; finalInvoiceId: number | null; refundPaidAt: string | null; note: string | null
}

export interface SettlementInput {
  moveOutDate: string
  finalReadings: { electric: number; water: number; electricPhotoUrl?: string; waterPhotoUrl?: string }
  damages: number; depositForfeit: number; note?: string
}

// Mirrors settlement.service.ts view(); the FE shows these numbers as they are (UI-06).
export interface SettlementView {
  dryRun: boolean; moveOutDate: string; periodNo: number
  lastPeriodAmount: number; remainingRent: number; previousDebt: number; deposit: number; damages: number; depositForfeit: number; net: number; refund: number
  lines: { kind: string; label: string; quantity: number; unitPrice: number; amount: number }[]
  mergedDrafts: number[]; settledInvoices: number[]
  settlementId: number | null; finalInvoice: { id: number; code: string; total: number; dueDate: string } | null
}

export interface ContractDetail extends ContractSummary {
  settlement?: ContractSettlement | null
  nextBillingDate?: string | null // FE-P4-08: from the BE, ACTIVE contracts only
  progress?: { elapsedDays: number; totalDays: number; percent: number }
  terms: string | null
  signedAt: string | null
  movedInAt: string | null
  occupants: OccupantView[]
  vehicles: VehicleView[]
  services: ContractService[]
  depositInvoice: DepositInvoice | null
}

export interface ContractListQuery {
  buildingId?: BuildingSelection
  status?: ContractStatus
  q?: string
  sort?: 'createdAt' | '-createdAt'
  page?: number
  limit?: number
}

export interface CreateContractInput {
  roomId: number
  signer: { fullName: string; phone: string; email?: string; dateOfBirth?: string; idNumber?: string }
  startDate: string
  termMonths: number
  deposit?: number
  serviceIds: number[]
  terms?: string
  viewingId?: number
  confirmedGuestAccountId?: number
  confirmDifferentViewingOwner?: boolean
}

export interface SignContractResult extends ContractSummary {
  signedAt: string
  depositInvoice: DepositInvoice | null
  temporaryPassword?: string
}
export interface SignedDocument { url: string; expiresAt: string }
export interface ContractPrintData { content: string; isDraft: boolean }

export interface OccupantChanges {
  fullName?: string
  phone?: string | null
  dateOfBirth?: string | null
  idNumber?: string | null
  idFront?: ContractAsset | null
  idBack?: ContractAsset | null
  moveInDate?: string
  moveOutDate?: string | null
}
export interface CreateOccupantInput extends OccupantChanges { fullName: string; moveInDate: string }

export interface VehicleChanges {
  plate?: string
  type?: VehicleType
  serviceId?: number
  registeredAt?: string
  isActive?: false
  removedAt?: string
}
export interface CreateVehicleInput { plate: string; type: VehicleType; serviceId: number; registeredAt?: string }
export interface VehicleLookupQuery { plate?: string; isActive?: boolean; page?: number; limit?: number }

export interface MoveInInput {
  electric: number
  water: number
  readOn: string
  note?: string
  electricReplacement?: { oldMeterFinal: number }
  waterReplacement?: { oldMeterFinal: number }
}
export interface MoveInResult {
  id: number
  code: string
  status: 'ACTIVE'
  movedInAt: string
  readings: { electric: { id: number; value: number; readOn: string }; water: { id: number; value: number; readOn: string } }
}

export interface CancelContractInput { reason: string; depositKept?: number; expectedDepositReceived?: number }
export interface CancelPreview { depositReceived: number; depositKept: number; refund: number; createsSettlement: boolean }
export interface CancelContractResult {
  id: number
  code: string
  status: 'CANCELLED'
  cancelReason: string
  depositInvoice: { id: number; status: InvoiceStatus } | null
  settlement: { id: number; deposit: number; depositForfeit: number; net: number; refundPaidAt: string | null; moveOutDate: string } | null
}
export interface RecordDepositInput { method: PaymentMethod; paidAt?: string; note?: string }
export interface PaymentReceipt {
  id: number
  invoiceId: number
  amount: number
  method: PaymentMethod
  source: 'MANUAL'
  paidAt: string
  note: string | null
  recordedById: number
}
