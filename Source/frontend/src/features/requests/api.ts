import { apiRequest, apiRequestPage, listPath } from '../../shared/api'

export const requestTypes = {
  INCIDENT: 'Sự cố', MOVE_OUT: 'Trả phòng', RENEW: 'Gia hạn',
  PAYMENT_ISSUE: 'Báo lỗi thanh toán', OCCUPANT_CHANGE: 'Cập nhật người ở', VEHICLE_CHANGE: 'Cập nhật xe',
}
export const requestStatuses = {
  PENDING: 'Chờ xử lý', IN_PROGRESS: 'Đang xử lý', ESCALATED: 'Đã chuyển Boss',
  RESOLVED: 'Hoàn thành', CLOSED: 'Đã đóng', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã rút',
}
export type RequestStatus = keyof typeof requestStatuses
export interface StaffRequest {
  id: number
  type: keyof typeof requestTypes
  status: RequestStatus
  contractId: number
  title: string
  description: string | null
  decisionNote: string | null
  cost: number | null
  photos: { url: string; publicId: string }[]
  payload: {
    invoiceId?: number; amount?: number; transferredAt?: string; paymentId?: number
    termMonths?: number; contractId?: number; plannedMoveOutDate?: string; endDate?: string; remainingRent?: number
    add?: Record<string, string | number | null>[]; remove?: Record<string, string | number | null>[]
  }
}
export function listRequests(query: { buildingId?: number; type?: string; status?: string; page: number }) {
  return apiRequestPage<StaffRequest>(listPath('/requests', { ...query, limit: 20 }))
}
export const actionLabels = {
  start: 'Bắt đầu xử lý', finish: 'Hoàn thành sửa chữa', approve: 'Duyệt', reject: 'Từ chối',
  escalate: 'Chuyển Boss', resolve: 'Xác nhận đã nhận tiền',
}
export type RequestAction = keyof typeof actionLabels
export function availableActions(row: StaffRequest, boss: boolean): RequestAction[] {
  if (row.type === 'INCIDENT') {
    if (row.status === 'PENDING') return ['start']
    return row.status === 'IN_PROGRESS' ? ['finish'] : []
  }
  if (row.status === 'ESCALATED' && row.type === 'PAYMENT_ISSUE' && boss) return ['resolve']
  if (row.status !== 'PENDING') return []
  return row.type === 'PAYMENT_ISSUE' ? ['resolve', 'reject', 'escalate'] : ['approve', 'reject']
}
export function applyRequestAction(id: number, action: RequestAction, value: string) {
  const path = `/requests/${id}`
  if (action === 'start' || action === 'finish') {
    return apiRequest(path, { method: 'PATCH', body: action === 'start' ? { status: 'IN_PROGRESS' } : { status: 'RESOLVED', cost: Number(value) } })
  }
  const body = action === 'reject' ? { decisionNote: value.trim() } :
    action === 'resolve' && value ? { bankTransactionId: Number(value) } : {}
  return apiRequest(path + '/' + action, { method: 'POST', body })
}
