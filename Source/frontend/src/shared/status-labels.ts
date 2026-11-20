// The 4 tones of StatusBadge (KIT-06).
export type StatusTone = 'available' | 'occupied' | 'reserved' | 'maintenance'

export type RoomStatus = 'Đang thuê' | 'Đã cọc' | 'Bảo trì' | 'Trống'
export type ViewingStatus = 'NEW' | 'CONFIRMED' | 'DONE' | 'WON' | 'LOST' | 'CANCELLED'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'
export type ContractStatus = 'HOLD' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
export type InvoiceStatus = 'DRAFT' | 'UNPAID' | 'PAID' | 'SETTLED' | 'CANCELLED'

// Room status is derived by the BE (G-08); the FE shows it and never recomputes it from contracts.
export const roomStatusLabels: Record<RoomStatus, { label: string; tone: StatusTone }> = {
  'Trống': { label: 'Trống', tone: 'available' },
  'Đã cọc': { label: 'Đã cọc', tone: 'reserved' },
  'Đang thuê': { label: 'Đang thuê', tone: 'occupied' },
  'Bảo trì': { label: 'Bảo trì', tone: 'maintenance' },
}

export const viewingStatusLabels: Record<ViewingStatus, string> = {
  NEW: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  DONE: 'Đã xem',
  WON: 'Đã chốt',
  LOST: 'Không thành',
  CANCELLED: 'Đã hủy',
}

export const approvalStatusLabels: Record<ApprovalStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  SUPERSEDED: 'Đã thay thế',
}

// Derived, not stored: a pending or approved price whose effective date has passed (PRC-07, PRC-10).
export const derivedApprovalLabels = { expired: 'Quá hạn' } as const

// UI-02: exact Vietnamese labels from specs 14 and 16; tenant translations use the same status keys.
export const contractStatusLabels: Record<ContractStatus, string> = {
  HOLD: 'Giữ chỗ',
  ACTIVE: 'Đang hiệu lực',
  ENDED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
}

export const contractStatusTones: Record<ContractStatus, StatusTone> = {
  HOLD: 'reserved', ACTIVE: 'occupied', ENDED: 'maintenance', CANCELLED: 'maintenance',
}

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  DRAFT: 'Nháp',
  UNPAID: 'Chưa thanh toán',
  PAID: 'Đã thanh toán',
  SETTLED: 'Đã quyết toán',
  CANCELLED: 'Đã hủy',
}

export const invoiceStatusTones: Record<InvoiceStatus, StatusTone> = {
  DRAFT: 'maintenance', UNPAID: 'reserved', PAID: 'available', SETTLED: 'occupied', CANCELLED: 'maintenance',
}

// Overdue is a derived display label, not an invoice status stored in the DB. No date calculation here.
export const derivedInvoiceLabels = { overdue: 'Quá hạn' } as const
export const derivedInvoiceTones = { overdue: 'reserved' } as const satisfies Record<'overdue', StatusTone>
