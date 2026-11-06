import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { useAuth } from '../../app/auth-context'
import { BuildingForm, BuildingNotesForm } from '../../features/buildings/BuildingForm'
import { BuildingLockControl } from '../../features/buildings/BuildingLockControl'
import { listBuildings } from '../../features/buildings/api'
import { managerText, waterModeLabels } from '../../features/buildings/labels'
import { ServicesPanel } from '../../features/buildings/ServicesPanel'
import '../../features/buildings/buildings.css'

// Staff building detail (BLD-02, BLD-03, BLD-06). There is no GET /buildings/:id in the API, so the page
// reads the building through the list filtered by id and takes the first row (Q5 CP-4).
export function BuildingDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const buildingId = Number(id)
  const validId = Number.isInteger(buildingId) && buildingId > 0
  const isBoss = user?.role === 'BOSS'
  // includeInactive is sent only for Boss: a manager asking for it gets 403 FORBIDDEN (API contract).
  const query = useQuery({
    queryKey: ['buildings', 'detail', buildingId, isBoss],
    queryFn: () => listBuildings({ buildingId, limit: 1, includeInactive: isBoss ? true : undefined }),
    enabled: validId,
  })
  const building = query.data?.data[0]

  if (!validId || (query.isSuccess && !building)) {
    return <>
      <SectionHeading>Chi tiết tòa nhà</SectionHeading>
      <p className="rooms-empty">Không tìm thấy tòa nhà</p>
      <p><Link className="buildings-link" to="/ql/toa-nha">Quay lại danh sách tòa</Link></p>
    </>
  }
  if (!building) {
    return <>
      <SectionHeading>Chi tiết tòa nhà</SectionHeading>
      {query.isPending && <Spinner block label="Đang tải tòa nhà" />}
      {query.isError && <div className="buildings-state">
        <FormError>{query.error.message}</FormError>
        <RoomsButton variant="sand" onClick={() => void query.refetch()}>Thử lại</RoomsButton>
      </div>}
    </>
  }

  return <>
    <SectionHeading eyebrow={`Tòa ${building.code}`}>{building.name}</SectionHeading>
    <p><Link className="buildings-link" to="/ql/toa-nha">Quay lại danh sách tòa</Link></p>
    <dl className="buildings-facts">
      <div><dt>Địa chỉ</dt><dd>{building.address}, {building.ward}, {building.district}</dd></div>
      <div><dt>Cách tính nước</dt><dd>{waterModeLabels[building.waterMode]}</dd></div>
      <div><dt>Số ngày thu</dt><dd>{building.dueDays} ngày</dd></div>
      <div><dt>Quản lý</dt><dd>{managerText(building.manager)}</dd></div>
      <div><dt>Trạng thái</dt><dd>{building.isActive ? 'Đang hoạt động' : 'Đã khóa'}</dd></div>
      <div><dt>Lịch hẹn chưa xử lý</dt><dd>{building.pendingViewingCount}</dd></div>
      <div><dt>Tiện ích</dt><dd>{building.amenities.length > 0 ? building.amenities.join(', ') : 'Chưa có'}</dd></div>
      <div><dt>Mô tả</dt><dd>{building.description ?? 'Chưa có mô tả'}</dd></div>
    </dl>

    {isBoss ? <>
      <SectionHeading>Sửa thông tin tòa</SectionHeading>
      {/* Keyed by updatedAt: after a lock or a save the form restarts from the server values, so a stale managerId is never sent back. */}
      <BuildingForm key={building.updatedAt} building={building} />
      <SectionHeading>Khóa hoặc mở khóa</SectionHeading>
      <BuildingLockControl building={building} />
    </> : <>
      <SectionHeading>Tiện ích và mô tả</SectionHeading>
      <BuildingNotesForm building={building} />
    </>}

    <ServicesPanel buildingId={building.id} canManage={isBoss} />
  </>
}
