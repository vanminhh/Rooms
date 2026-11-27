import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { FormError, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { apiRequestPage, listPath } from '../../shared/api'
import '../../features/contracts/contracts.css'

interface Entry {
  id: string; createdAt: string; action: string; entity: string; entityId: number; ip: string | null
  actor: { id: number; fullName: string } | null; before: unknown; after: unknown
}
// AUD-02 codes shown as Vietnamese labels; an unknown code falls back to the raw code.
const ACTION_LABELS: Record<string, string> = {
  'building.manager_change': 'Đổi quản lý tòa nhà',
  'contract.create': 'Tạo hợp đồng', 'contract.sign': 'Ký hợp đồng', 'contract.move_in': 'Nhận phòng',
  'contract.cancel': 'Hủy hợp đồng', 'contract.renew': 'Gia hạn hợp đồng', 'contract.settle': 'Thanh lý hợp đồng',
  'contract.update_services': 'Đổi dịch vụ hợp đồng', 'contract.view_scan': 'Xem bản scan hợp đồng',
  'invoice.issue': 'Phát hành hóa đơn', 'invoice.reissue': 'Phát hành lại hóa đơn', 'invoice.cancel': 'Hủy hóa đơn',
  'invoice.archive': 'Lưu trữ hóa đơn', 'invoice.create_missed': 'Tạo hóa đơn kỳ bị sót', 'invoice.remind': 'Nhắc thanh toán hóa đơn',
  'payment.record': 'Ghi nhận thanh toán', 'payment.assign': 'Gán thanh toán', 'payment.refund': 'Hoàn tiền',
  'settlement.refund_paid': 'Đã trả tiền hoàn khi thanh lý',
  'price.propose': 'Đề xuất giá', 'price.approve': 'Duyệt giá', 'price.reject': 'Từ chối giá',
  'manager.create': 'Tạo tài khoản quản lý', 'manager.deactivate': 'Khóa tài khoản quản lý',
  'user.change_password': 'Đổi mật khẩu', 'user.reset_password': 'Đặt lại mật khẩu',
  'user.reset_password_by_staff': 'Nhân viên đặt lại mật khẩu', 'user.role_change': 'Khách thành người thuê',
  'occupant.create': 'Thêm người ở', 'occupant.view_id': 'Xem ảnh CCCD',
  'vehicle.create': 'Thêm xe', 'vehicle.update': 'Sửa thông tin xe',
  'request.update': 'Cập nhật yêu cầu', 'request.approve': 'Duyệt yêu cầu', 'request.reject': 'Từ chối yêu cầu',
  'request.escalate': 'Chuyển yêu cầu lên chủ', 'request.resolve': 'Hoàn tất yêu cầu', 'request.review_hide': 'Ẩn đánh giá sửa chữa',
  'room.update': 'Cập nhật phòng', 'settings.change': 'Đổi cài đặt',
}
const empty = { entity: '', entityId: '', actorId: '', from: '', to: '' }
export function AuditPage() {
  const { user } = useAuth()
  const [draft, setDraft] = useState(empty)
  const [filters, setFilters] = useState(empty)
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['audit-logs', authScopeKey(user), filters, page],
    queryFn: () => apiRequestPage<Entry>(listPath('/audit-logs', { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v.trim())), page })) })
  function apply(e: FormEvent) { e.preventDefault(); setFilters({ ...draft, entity: draft.entity.trim() }); setPage(1) }
  return <><SectionHeading>Nhật ký thao tác</SectionHeading>
    <form className="contracts-form" onSubmit={apply}><div className="contracts-form-grid">
      {([['entity', 'Loại đối tượng', 'text'], ['entityId', 'Mã đối tượng', 'number'], ['actorId', 'Mã người thao tác', 'number'],
        ['from', 'Từ ngày', 'date'], ['to', 'Đến ngày', 'date']] as const).map(([key, label, type]) =>
        <TextField key={key} name={key} label={label} type={type} min={key === 'entityId' ? 0 : key === 'actorId' ? 1 : key === 'to' ? draft.from : undefined}
          maxLength={key === 'entity' ? 50 : undefined} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />)}
    </div><div className="contracts-actions"><RoomsButton type="submit">Lọc nhật ký</RoomsButton>
      <RoomsButton type="button" variant="outline" onClick={() => { setDraft(empty); setFilters(empty); setPage(1) }}>Xóa bộ lọc</RoomsButton></div></form>
    {q.isPending && <Spinner block label="Đang tải nhật ký" />}
    {q.isError && <><FormError>{q.error.message}</FormError><RoomsButton onClick={() => void q.refetch()}>Thử lại</RoomsButton></>}
    {q.data && <>{q.data.data.length === 0 && <p>Không có thao tác phù hợp.</p>}
      {q.data.data.map(row => <details key={row.id} className="contracts-card"><summary>
        {new Date(row.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · {ACTION_LABELS[row.action] ?? row.action} · {row.actor?.fullName ?? 'Hệ thống'}
      </summary><p>Mã thao tác {row.action} · {row.entity} #{row.entityId} · Nhật ký #{row.id}{row.ip && ' · IP ' + row.ip}</p>
        <h3>Trước thay đổi</h3><pre className="contracts-terms">{JSON.stringify(row.before, null, 2)}</pre>
        <h3>Sau thay đổi</h3><pre className="contracts-terms">{JSON.stringify(row.after, null, 2)}</pre>
      </details>)}
      {q.data.meta.total > q.data.meta.limit && <nav aria-label="Phân trang nhật ký" className="contracts-actions">
        <RoomsButton disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton>
        <span>Trang {page}</span><RoomsButton disabled={page * q.data.meta.limit >= q.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
      </nav>}</>}
  </>
}
