import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FormError, RoomsButton, Spinner, StatusBadge } from '../../components'
import { formatMoney } from '../../shared/formatters'
import { derivedApprovalLabels, roomStatusLabels } from '../../shared/status-labels'
import type { BuildingSelection } from '../buildings/building-selection'
import { listRooms } from './api'
import type { RoomGridItem } from './api'
import { RoomInspector } from './RoomInspector'

const PAGE_SIZE = 20

// The API sorts by floor, top first (sort -floor), so a page groups into floor rows in the same order.
function groupByFloor(rooms: RoomGridItem[]): [number, RoomGridItem[]][] {
  const floors = new Map<number, RoomGridItem[]>()
  for (const room of rooms) floors.set(room.floor, [...(floors.get(room.floor) ?? []), room])
  return [...floors]
}

// Floor grid of rooms with derived status (ROOM-05, UI-03). A null selection (manager with no pick) sends no buildingId (Q-FE8A-4).
export function RoomGrid({ selection, includeInactive }: { selection: BuildingSelection; includeInactive?: boolean }) {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const query = useQuery({
    queryKey: ['rooms', 'list', selection, includeInactive, page],
    queryFn: () => listRooms({ buildingId: selection, includeInactive, page, limit: PAGE_SIZE, sort: '-floor' }),
  })
  const selected = query.data?.data.find(room => room.id === selectedId)
  const meta = query.data?.meta

  return <>
    {query.isPending && <Spinner label="Đang tải danh sách phòng" />}
    {query.isError && <div className="staff-room-state">
      <FormError>{query.error.message}</FormError>
      <RoomsButton variant="sand" onClick={() => void query.refetch()}>Thử lại</RoomsButton>
    </div>}
    {query.isSuccess && query.data.data.length === 0 && <p className="rooms-empty">
      {typeof selection === 'number' ? 'Chưa có phòng nào ở tòa này. Bấm “Thêm phòng” để tạo phòng đầu tiên.' : 'Chưa có phòng nào trong phạm vi của bạn.'}
    </p>}
    {query.isSuccess && query.data.data.length > 0 && <>
      <div className="staff-room-layout">
        <div className="staff-room-floors">
          {groupByFloor(query.data.data).map(([floor, rooms]) => <section key={floor} className="staff-room-floor" aria-label={`Tầng ${floor}`}>
            <h3>Tầng {floor}</h3>
            <div className="staff-room-cards">
              {rooms.map(room => {
                const status = roomStatusLabels[room.status]
                return <button key={room.id} type="button"
                  className={`staff-room-card staff-room-card--${status.tone}${room.id === selectedId ? ' is-selected' : ''}${room.isActive ? '' : ' is-locked'}`}
                  aria-pressed={room.id === selectedId}
                  onClick={() => setSelectedId(room.id)}>
                  <span className="staff-room-code">{room.code}</span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <strong>{room.price === null ? 'Chưa có giá' : formatMoney(room.price)}</strong>
                  {!room.isActive && <span className="staff-room-extra">Đã khóa</span>}
                  {room.pendingProposal?.expired && <span className="staff-room-extra">Đề xuất giá: {derivedApprovalLabels.expired}</span>}
                </button>
              })}
            </div>
          </section>)}
        </div>
        <div className="staff-room-side">
          {selected
            ? <RoomInspector key={selected.id} room={selected} />
            : <p className="rooms-empty">Chọn một phòng trong lưới để xem và sửa.</p>}
        </div>
      </div>
      {meta && (page > 1 || meta.total > meta.limit) && <nav className="staff-room-pager" aria-label="Phân trang phòng">
        <RoomsButton variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton>
        <span>Trang {page}/{Math.max(1, Math.ceil(meta.total / meta.limit))}</span>
        <RoomsButton variant="outline" disabled={page * meta.limit >= meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
      </nav>}
    </>}
  </>
}
