import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Checkbox, FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { useAuth } from '../../app/auth-context'
import { BuildingForm } from '../../features/buildings/BuildingForm'
import { listBuildings } from '../../features/buildings/api'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import { managerText, waterModeLabels } from '../../features/buildings/labels'
import '../../features/buildings/buildings.css'

const PAGE_SIZE = 20

// Staff building list (BLD-07). Boss sees locked buildings on request; a manager never does (SCOPE-02).
export function BuildingsPage() {
  const { user } = useAuth()
  const { selectedBuildingId } = useBuildingSelection()
  const isBoss = user?.role === 'BOSS'
  const [page, setPage] = useState(1)
  const [showLocked, setShowLocked] = useState(false)
  const [creating, setCreating] = useState(false)
  const includeInactive = isBoss && showLocked ? true : undefined
  // A null selection (manager with no pick yet) loads every building in scope; no buildingId is sent (Q-FE8A-4).
  const query = useQuery({
    queryKey: ['buildings', 'list', selectedBuildingId, includeInactive, page],
    queryFn: () => listBuildings({ buildingId: selectedBuildingId, includeInactive, page, limit: PAGE_SIZE }),
  })

  return <>
    <SectionHeading>Tòa nhà</SectionHeading>
    <div className="buildings-toolbar">
      {isBoss && <RoomsButton disabled={creating} onClick={() => setCreating(true)}>Thêm tòa</RoomsButton>}
      {isBoss && <Checkbox label="Hiện tòa đã khóa" checked={showLocked} onChange={event => { setShowLocked(event.target.checked); setPage(1) }} />}
    </div>
    {isBoss && creating && <BuildingForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />}

    {query.isPending && <Spinner label="Đang tải danh sách tòa" />}
    {query.isError && <div className="buildings-state">
      <FormError>{query.error.message}</FormError>
      <RoomsButton variant="sand" onClick={() => void query.refetch()}>Thử lại</RoomsButton>
    </div>}
    {query.isSuccess && query.data.data.length === 0 && <p className="rooms-empty">
      {isBoss ? 'Chưa có tòa nhà nào. Bấm “Thêm tòa” để tạo tòa đầu tiên.' : 'Chưa có tòa nào trong phạm vi của bạn. Liên hệ Boss để được giao tòa.'}
    </p>}
    {query.isSuccess && query.data.data.length > 0 && <>
      <ul className="buildings-list">
        {query.data.data.map(building => <li key={building.id} className="buildings-item">
          <div>
            <p className="buildings-item-title">{building.name} <span>· {building.code}</span></p>
            <p className="buildings-item-meta">{building.address}, {building.ward}, {building.district}</p>
            <p className="buildings-item-meta">{managerText(building.manager)} · {waterModeLabels[building.waterMode]} · {building.isActive ? 'Đang hoạt động' : 'Đã khóa'}</p>
          </div>
          <Link className="buildings-link" to={`/ql/toa-nha/${building.id}`} aria-label={`Xem chi tiết ${building.name}`}>Xem chi tiết</Link>
        </li>)}
      </ul>
      {(page > 1 || query.data.meta.total > query.data.meta.limit) && <nav className="buildings-pager" aria-label="Phân trang tòa nhà">
        <RoomsButton variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton>
        <span>Trang {page}/{Math.max(1, Math.ceil(query.data.meta.total / query.data.meta.limit))}</span>
        <RoomsButton variant="outline" disabled={page * query.data.meta.limit >= query.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
      </nav>}
    </>}
  </>
}
