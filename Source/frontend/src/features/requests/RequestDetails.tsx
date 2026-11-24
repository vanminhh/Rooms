import { Link } from 'react-router'
import { formatDate, formatMoney } from '../../shared/formatters'
import type { StaffRequest } from './api'

const changeFields: Record<string, string> = {
  fullName: 'Họ tên', phone: 'Điện thoại', dateOfBirth: 'Ngày sinh', moveInDate: 'Ngày vào',
  moveOutDate: 'Ngày ra', idNumberLast4: 'Bốn số cuối CCCD', occupantId: 'Mã người ở', vehicleId: 'Mã xe',
  plate: 'Biển số', type: 'Loại xe', serviceId: 'Mã dịch vụ', removedAt: 'Ngày ngừng đăng ký',
}
export function RequestDetails({ row }: { row: StaffRequest }) {
  const p = row.payload
  return <div>
    <Link to={`/ql/hop-dong/${row.contractId}`}>Hợp đồng #{row.contractId}</Link>
    {row.description && <p>{row.description}</p>}
    {p.termMonths != null && <p>Thời hạn đề nghị: {p.termMonths} tháng</p>}
    {p.plannedMoveOutDate && <p>Ngày trả phòng đề nghị: {formatDate(p.plannedMoveOutDate)}</p>}
    {p.endDate && p.remainingRent != null && <p role="note">Trả phòng trước hạn {formatDate(p.endDate)}. Tiền thuê các kỳ còn lại: {formatMoney(p.remainingRent)}.</p>}
    {p.invoiceId && <p><Link to={`/ql/hoa-don/${p.invoiceId}`}>Hóa đơn #{p.invoiceId}</Link></p>}
    {p.amount != null && <p>Số tiền đã báo: {formatMoney(p.amount)}</p>}
    {p.transferredAt && <p>Thời điểm chuyển: {new Date(p.transferredAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
    {(['add', 'remove'] as const).map(key => p[key]?.length ? <div key={key}><strong>{key === 'add' ? 'Thêm' : 'Gỡ đăng ký'}</strong><ul>
      {p[key].map((item, index) => <li key={index}>{Object.entries(item).filter(([field, v]) => changeFields[field] && v != null)
        .map(([field, v]) => changeFields[field] + ': ' + v).join(' · ')}</li>)}
    </ul></div> : null)}
    {row.photos.map((photo, i) => <a key={photo.publicId} href={photo.url} target="_blank" rel="noreferrer">
      <img src={photo.url} alt={`Ảnh đính kèm ${i + 1}`} width="96" loading="lazy" />
    </a>)}
    {row.cost != null && <p>Chi phí lần sửa cuối: {formatMoney(row.cost)}</p>}
    {row.decisionNote && <p>Lý do: {row.decisionNote}</p>}
  </div>
}
