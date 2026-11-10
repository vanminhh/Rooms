import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { FilterChip, RoomsButton, SectionHeading } from '../../components'
import { getPublicBuilding, listPublicLocations, listPublicRooms, publicQueryKeys } from '../../features/public/api'
import { ListState } from '../../features/public/ListState'
import { RoomCard } from '../../features/public/RoomCard'
import { RoomFilters } from '../../features/public/RoomFilters'
import { filtersToParams, filtersToQuery, parseFilters, validFilters } from '../../features/public/room-filters'
import type { PublicFilters } from '../../features/public/room-filters'
import '../../features/public/public-listing.css'

const PAGE_SIZE = 20

// Anything that is not a positive whole number in the URL means page 1.
function pageOf(params: URLSearchParams): number {
  const page = Number(params.get('page'))
  return Number.isInteger(page) && page >= 1 ? page : 1
}

// /phong (UI-22): every filter, the page and the sort live in the URL query, both ways (PUB-01, ROOM-05).
export function PublicRoomsPage() {
  const [params, setParams] = useSearchParams()
  const values = useMemo(() => parseFilters(params), [params])
  const page = pageOf(params)
  const valid = validFilters(values)
  const query = { ...filtersToQuery(values), page, limit: PAGE_SIZE }

  const locations = useQuery({ queryKey: publicQueryKeys.locations, queryFn: listPublicLocations })
  const rooms = useQuery({ queryKey: publicQueryKeys.rooms(query), queryFn: () => listPublicRooms(query), enabled: valid })
  const hasBuilding = valid && values.buildingId !== ''
  const building = useQuery({
    queryKey: publicQueryKeys.building(Number(values.buildingId)),
    queryFn: () => getPublicBuilding(Number(values.buildingId)),
    enabled: hasBuilding,
  })

  // A new filter set starts again at page 1, because the page is not carried over.
  const apply = (next: PublicFilters) => setParams(filtersToParams(next))
  const reset = () => setParams(new URLSearchParams())
  const selectDistrict = (district: string) => apply({ ...values, district, ward: '' })
  const goToPage = (target: number) => {
    const next = filtersToParams(values)
    next.set('page', String(target))
    setParams(next)
  }

  const totalLocations = locations.data?.reduce((sum, item) => sum + item.roomCount, 0) ?? 0
  const totalPages = rooms.data ? Math.max(1, Math.ceil(rooms.data.meta.total / rooms.data.meta.limit)) : 1

  return <>
    <section className="public-listing-intro" aria-labelledby="public-listing-title">
      <SectionHeading eyebrow="Phòng đang sẵn sàng" description="Chọn khu vực và khoảng giá phù hợp với bạn.">
        <span id="public-listing-title">Tìm phòng <em>vừa vặn</em> với bạn</span>
      </SectionHeading>

      <div className="public-district-filter" aria-label="Lọc nhanh theo quận">
        <div className="public-district-filter-heading">
          <strong>Chọn nhanh theo quận</strong>
          {locations.isPending && <span role="status">Đang tải khu vực…</span>}
          {locations.isError && <button type="button" onClick={() => void locations.refetch()}>Thử lại</button>}
        </div>
        <div className="public-district-chips">
          <FilterChip selected={!values.district} count={totalLocations} onClick={() => selectDistrict('')}>Tất cả</FilterChip>
          {locations.data?.map(item => <FilterChip key={item.district} selected={values.district === item.district}
            count={item.roomCount} onClick={() => selectDistrict(item.district)}>{item.district}</FilterChip>)}
        </div>
      </div>

      <RoomFilters locations={locations.data ?? []} values={values} onChange={apply} onReset={reset} />
      {hasBuilding && <div className="public-building-filter">
        <span className="public-building-filter-status" aria-live="polite">
          {building.isPending && <span role="status">Đang tải thông tin tòa</span>}
          {building.isError && <span role="alert">
            <span>{building.error instanceof Error ? building.error.message : 'Không tải được thông tin tòa'}</span>
            <button type="button" onClick={() => void building.refetch()}>Thử lại</button>
          </span>}
        </span>
        {building.data && <span>Đang lọc theo tòa {building.data.name}</span>}
        <RoomsButton variant="outline" onClick={() => apply({ ...values, buildingId: '' })}>Bỏ lọc tòa</RoomsButton>
      </div>}
    </section>

    {valid && <ListState
      status={rooms.status}
      error={rooms.error}
      isEmpty={!rooms.data?.data.length}
      loadingLabel="Đang tải danh sách phòng"
      emptyTitle="Chưa có phòng phù hợp với bộ lọc"
      emptyHint={<RoomsButton variant="outline" onClick={reset}>Xóa bộ lọc</RoomsButton>}
      onRetry={() => void rooms.refetch()}
    >
      <section className="public-results" aria-labelledby="public-results-title">
        <div className="public-results-heading">
          <div>
            <p className="rooms-eyebrow">Kết quả tìm kiếm</p>
            <h2 id="public-results-title">{rooms.data?.meta.total} phòng phù hợp</h2>
          </div>
          {rooms.data && rooms.data.meta.total > 0 && <p>Trang {page}/{totalPages}</p>}
        </div>
        <div className="public-grid public-room-listing">
          {rooms.data?.data.map(room => <RoomCard key={room.id} room={room} ctaLabel="Xem chi tiết phòng" />)}
        </div>
        {rooms.data && (page > 1 || rooms.data.meta.total > rooms.data.meta.limit) && <nav className="public-pager" aria-label="Phân trang danh sách phòng">
          <RoomsButton variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>Trang trước</RoomsButton>
          <span aria-current="page">Trang {page}/{totalPages}</span>
          <RoomsButton variant="outline" disabled={page * rooms.data.meta.limit >= rooms.data.meta.total} onClick={() => goToPage(page + 1)}>Trang sau</RoomsButton>
        </nav>}
      </section>
    </ListState>}
  </>
}

