// The 4 tones of StatusBadge (KIT-06).
export type StatusTone = 'available' | 'occupied' | 'reserved' | 'maintenance'

export type RoomStatus = 'Đang thuê' | 'Đã cọc' | 'Bảo trì' | 'Trống'
export type ViewingStatus = 'NEW' | 'CONFIRMED' | 'WON' | 'LOST' | 'CANCELLED'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'

// Room status is derived by the BE (G-08); the FE shows it and never recomputes it from contracts.
export const roomStatusLabels: Record<RoomStatus, { label: string; tone: StatusTone }> = {
  'Trống': { label: 'Trống', tone: 'available' },
  'Đã cọc': { label: 'Đã cọc', tone: 'reserved' },
  'Đang thuê': { label: 'Đang thuê', tone: 'occupied' },
  'Bảo trì': { label: 'Bảo trì', tone: 'maintenance' },
}

export const viewingStatusLabels: Record<ViewingStatus, string> = {
  NEW: 'Mới',
  CONFIRMED: 'Đã xác nhận',
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
