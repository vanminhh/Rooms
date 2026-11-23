import type { InvoiceStatus } from '../../shared/status-labels'
import type { PaymentMethod } from '../contracts/types'

export type InvoiceType = 'DEPOSIT' | 'MONTHLY' | 'FINAL'
export type LineKind = 'DEPOSIT' | 'RENT' | 'ELECTRIC' | 'WATER' | 'SERVICE' | 'PARKING' | 'REMAINING_RENT' | 'PREVIOUS_DEBT' | 'DAMAGE' | 'DEPOSIT_FORFEIT' | 'DEPOSIT_OFFSET'
export type MeterKind = 'ELECTRIC' | 'WATER'

// Mirrors invoice-queries.service.ts (BE-P4-18). `overdue` is derived by the BE (D-40); the FE never compares dates.
export interface InvoiceSummary {
  id: number; code: string; type: InvoiceType; status: InvoiceStatus; overdue: boolean
  periodNo: number; periodStart: string | null; periodEnd: string | null; issueDate: string | null; dueDate: string | null; total: number
  contract: { id: number; code: string; room: { id: number; code: string }; building: { id: number; code: string; name: string }; tenant?: { id: number; fullName: string; phone: string } }
}

export interface InvoiceLine { kind: LineKind; label: string; quantity: number; unitPrice: number; amount: number; meta?: Record<string, unknown> }

export interface InvoiceDetail extends InvoiceSummary {
  cancelReason: string | null; replacesId: number | null; replacedById: number | null
  lines: InvoiceLine[]
  meterReadings: { id: number; kind: MeterKind; value: number; readOn: string; isMeterReplaced: boolean; oldMeterFinal: number | null; photoUrl: string | null }[]
  payment: { amount: number; method: PaymentMethod; source: 'MANUAL' | 'WEBHOOK' | 'ASSIGNED'; paidAt: string } | null
  vietqr: { bankBin: string; accountNo: string; accountName: string; amount: number; content: string } | null
  qrImageUrl: string | null
}

export interface InvoiceListQuery { buildingId?: number; status?: InvoiceStatus; type?: InvoiceType; overdue?: boolean; period?: string; total?: number; page?: number; limit?: number }
export interface ReadingCorrection { kind: MeterKind; value: number; isMeterReplaced?: boolean; oldMeterFinal?: number }
