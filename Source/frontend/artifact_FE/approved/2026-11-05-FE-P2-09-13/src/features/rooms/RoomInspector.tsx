import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog, FormError, RoomsButton, Spinner, StatusBadge } from '../../components'
import { RoomPriceDialog } from '../pricing/RoomPriceDialog'
import { formatDate, formatMoney } from '../../shared/formatters'
import { approvalStatusLabels, derivedApprovalLabels, roomStatusLabels } from '../../shared/status-labels'
import { getRoom, updateRoom } from './api'
import type { RoomGridItem } from './api'
import { RoomForm } from './RoomForm'
import { RoomImages } from './RoomImages'

type RoomToggle = 'isActive' | 'underMaintenance'

// value is the new flag. pendingViewings is set only when the change takes the room out of use (ROOM-09).
interface PendingToggle {
  field: RoomToggle
  value: boolean
  pendingViewings?: number
}

function toggleCopy(toggle: PendingToggle, code: string) {
  if (toggle.field === 'isActive') {
    return toggle.value
      ? { title: `Mở khóa phòng ${code}?`, text: 'Phòng sẽ hiện lại trong danh sách.', confirmLabel: 'Mở khóa' }
      : { title: `Khóa phòng ${code}?`, text: `Phòng sẽ không còn công khai. Còn ${toggle.pendingViewings} lịch hẹn chưa xử lý.`, confirmLabel: 'Khóa phòng' }
  }
  return toggle.value
    ? { title: `Bật bảo trì cho phòng ${code}?`, text: `Phòng sẽ không công khai cho đến khi tắt bảo trì. Còn ${toggle.pendingViewings} lịch hẹn chưa xử lý.`, confirmLabel: 'Bật bảo trì' }
    : { title: `Tắt bảo trì cho phòng ${code}?`, text: 'Trạng thái phòng sẽ được tính lại từ hợp đồng.', confirmLabel: 'Tắt bảo trì' }
}

// Edit needs furniture and description, which the grid item does not carry: read the room first (GET /rooms/:id).
function RoomEditPanel({ room, onDone }: { room: RoomGridItem; onDone(): void }) {
  const detail = useQuery({ queryKey: ['rooms', 'detail', room.id], queryFn: () => getRoom(room.id) })
  if (detail.isPending) return <Spinner label="Đang tải thông tin phòng" />
  if (detail.isError) return <div className="staff-room-state">
    <FormError>{detail.error.message}</FormError>
    <RoomsButton variant="sand" onClick={() => void detail.refetch()}>Thử lại</RoomsButton>
  </div>
  return <RoomForm buildingId={room.buildingId} room={detail.data} onSaved={onDone} onCancel={onDone} />
}

// Selected room: facts, edit, lock and maintenance with the VIEW-13 count, and the price proposal dialog.
export function RoomInspector({ room }: { room: RoomGridItem }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [showImages, setShowImages] = useState(false)
  const [pricing, setPricing] = useState(false)
  const [dialog, setDialog] = useState<PendingToggle | null>(null)
  const [openError, setOpenError] = useState('')
  const toggle = useMutation({
    mutationFn: ({ field, value }: PendingToggle) => updateRoom(room.id, field === 'isActive' ? { isActive: value } : { underMaintenance: value }),
    onSuccess: () => setDialog(null),
    // A 409 (contract, capacity) stays in the dialog; the refetch shows the state the server kept, and the user may retry.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['rooms'] }),
  })

  // Taking a room out of use reads the open viewing count first; it is never guessed or shown as 0 on failure.
  async function openToggle(field: RoomToggle, value: boolean) {
    setOpenError('')
    toggle.reset()
    const takesOut = field === 'isActive' ? !value : value
    if (!takesOut) {
      setDialog({ field, value })
      return
    }
    try {
      const fresh = await queryClient.fetchQuery({ queryKey: ['rooms', 'detail', room.id], queryFn: () => getRoom(room.id), staleTime: 0 })
      setDialog({ field, value, pendingViewings: fresh.pendingViewingCount })
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : 'Chưa mở được xác nhận, vui lòng thử lại')
    }
  }

  const copy = dialog && toggleCopy(dialog, room.code)
  const proposal = room.pendingProposal
  const status = roomStatusLabels[room.status]

  return <aside className="staff-room-inspector" aria-label={`Chi tiết phòng ${room.code}`}>
    <div className="staff-room-head">
      <h3>Phòng {room.code}</h3>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    </div>
    <p className="staff-room-meta">Tầng {room.floor}</p>
    <dl className="staff-room-facts">
      <div><dt>Giá hiện tại</dt><dd>{room.price === null ? 'Chưa có giá' : formatMoney(room.price)}</dd></div>
      <div><dt>Diện tích</dt><dd>{room.areaM2.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m²</dd></div>
      <div><dt>Số người tối đa</dt><dd>{room.maxOccupants} người</dd></div>
    </dl>
    {!room.isActive && <p className="staff-room-notice">Phòng đã khóa, không xuất hiện trong danh sách công khai.</p>}
    {proposal && <div className="staff-room-notice">
      <div><StatusBadge tone={proposal.expired ? 'maintenance' : 'reserved'}>{proposal.expired ? derivedApprovalLabels.expired : approvalStatusLabels.PENDING}</StatusBadge></div>
      <p>{proposal.expired ? 'Đề xuất đã quá hạn. Cần đề xuất lại để duyệt.' : `Đề xuất giá áp dụng từ ${formatDate(proposal.effectiveFrom)}.`}</p>
    </div>}

    <div className="staff-room-actions">
      <RoomsButton variant="outline" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? 'Đóng form sửa' : 'Sửa thông tin'}</RoomsButton>
      <RoomsButton variant="outline" aria-expanded={showImages} onClick={() => setShowImages(!showImages)}>{showImages ? 'Đóng ảnh phòng' : 'Ảnh phòng'}</RoomsButton>
      <RoomsButton variant="outline" onClick={() => void openToggle('isActive', !room.isActive)}>{room.isActive ? 'Khóa phòng' : 'Mở khóa phòng'}</RoomsButton>
      <RoomsButton variant="outline" onClick={() => void openToggle('underMaintenance', !room.underMaintenance)}>{room.underMaintenance ? 'Tắt bảo trì' : 'Bật bảo trì'}</RoomsButton>
      {openError && <FormError>{openError}</FormError>}
      <RoomsButton variant="outline" onClick={() => setPricing(true)}>{proposal?.expired ? 'Đề xuất lại' : 'Đề xuất giá'}</RoomsButton>
    </div>

    {/* Gallery loads only when opened: opening, unlocking or turning maintenance off must not call GET /rooms/:id (ROOM-09). */}
    {showImages && <RoomImages roomId={room.id} />}

    {editing && <RoomEditPanel room={room} onDone={() => setEditing(false)} />}

    {dialog && copy && <ConfirmDialog
      open
      title={copy.title}
      description={<>
        <p>{copy.text}</p>
        <FormError>{toggle.error?.message}</FormError>
      </>}
      confirmLabel={copy.confirmLabel}
      pending={toggle.isPending}
      onConfirm={() => toggle.mutate(dialog)}
      onClose={() => setDialog(null)}
    />}

    {pricing && <RoomPriceDialog room={room} onClose={() => setPricing(false)} />}
  </aside>
}
