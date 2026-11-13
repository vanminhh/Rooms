import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { SectionHeading } from '../../components'
import { getPublicBuilding, getPublicFilters, publicQueryKeys } from '../../features/public/api'
import type { PublicBuildingDetail, PublicFiltersView } from '../../features/public/api'
import { labelOf } from '../../features/public/attributes'
import { ContactCard } from '../../features/public/ContactCard'
import { ListState } from '../../features/public/ListState'
import { RateTable } from '../../features/public/RateTable'
import { RoomCard } from '../../features/public/RoomCard'
import '../../features/public/public-building.css'
import { ApiError } from '../../shared/api'
import { NotFoundPage } from './NotFoundPage'

// PUB-02: a building that is not public, or a bad id, shows the 404 page. No automatic retry, so a 404 shows at once.
export function PublicBuildingPage() {
  const { id } = useParams()
  const buildingId = Number(id)
  const valid = Number.isSafeInteger(buildingId) && buildingId > 0
  const building = useQuery({ queryKey: publicQueryKeys.building(buildingId), queryFn: () => getPublicBuilding(buildingId), enabled: valid, retry: false })
  const catalog = useQuery({ queryKey: publicQueryKeys.filters, queryFn: getPublicFilters, enabled: building.isSuccess })
  if (!valid || (building.error instanceof ApiError && building.error.status === 404)) return <NotFoundPage />

  return <ListState
    status={building.status}
    error={building.error}
    isEmpty={false}
    loadingLabel="Đang tải thông tin tòa"
    emptyTitle=""
    onRetry={() => void building.refetch()}
  >
    {building.data && <BuildingDetail building={building.data} catalog={catalog.data} catalogLoading={catalog.isPending} />}
  </ListState>
}

function waterModeLabel(building: PublicBuildingDetail): string {
  return building.waterMode === 'PER_M3' ? 'Theo đồng hồ từng phòng' : 'Theo số người ở'
}

// `catalog` (GET /public/filters) gives the amenity labels (BLD-08); without it a code shows as is.
export function BuildingDetail({ building, catalog, catalogLoading = false }: { building: PublicBuildingDetail; catalog?: PublicFiltersView; catalogLoading?: boolean }) {
  const roomCount = building.rooms.length
  const amenities = catalogLoading ? [] : building.amenities // wait for the labels instead of showing codes
  return <article className="public-building">
    <nav className="public-building-breadcrumb" aria-label="Đường dẫn">
      <Link to="/">Trang chủ</Link><span aria-hidden="true">›</span><Link to="/phong">Tìm phòng</Link><span aria-hidden="true">›</span><span>{building.name}</span>
    </nav>

    <header className="public-building-hero">
      <div className="public-building-intro">
        <SectionHeading eyebrow={`Tòa ${building.code}`} description={building.description ?? undefined}>{building.name}</SectionHeading>
        <p className="public-building-address">{building.address}, {building.ward}, {building.district}</p>
      </div>
      <dl className="public-building-facts" aria-label="Thông tin tòa">
        <div><dt>Khu vực</dt><dd>{building.ward}, {building.district}</dd></div>
        <div><dt>Tính tiền nước</dt><dd>{waterModeLabel(building)}</dd></div>
        <div><dt>Phòng đang trống</dt><dd>{roomCount.toLocaleString('vi-VN')}</dd></div>
      </dl>
    </header>

    {amenities.length > 0 && <section className="public-building-amenities" aria-labelledby="building-amenities-title">
      <p className="rooms-eyebrow">Tiện ích tại tòa</p>
      <h2 id="building-amenities-title">Những gì có sẵn khi chuyển vào</h2>
      <ul className="public-tags">{amenities.map(item => <li key={item}>{labelOf(item, catalog?.amenities)}</li>)}</ul>
    </section>}

    <div className={`public-building-panels${building.contact ? '' : ' public-building-panels--rates-only'}`}>
      <section className="public-building-panel public-building-rates" aria-label="Bảng đơn giá">
        <RateTable rates={building.rates} upcomingRates={building.upcomingRates} waterMode={building.waterMode} />
      </section>
      {building.contact && <aside className="public-building-panel public-building-contact" aria-label="Liên hệ tòa nhà">
        <p className="rooms-eyebrow">Hẹn xem phòng</p>
        <ContactCard contact={building.contact} />
      </aside>}
    </div>

    <section className="public-building-rooms" aria-label="Còn trống tại tòa">
      <div className="public-building-section-heading">
        <SectionHeading eyebrow={`${roomCount.toLocaleString('vi-VN')} phòng đang trống`}>Còn trống tại tòa</SectionHeading>
        <Link className="public-building-all-rooms" to={`/phong?buildingId=${building.id}`}>Xem phòng trống của tòa này</Link>
      </div>
      {roomCount > 0
        ? <div className="public-grid">{building.rooms.map(room => <RoomCard key={room.id} room={room} ctaLabel="Xem chi tiết" />)}</div>
        : <div className="rooms-empty"><p>Chưa có phòng trống nào</p></div>}
    </section>
  </article>
}
