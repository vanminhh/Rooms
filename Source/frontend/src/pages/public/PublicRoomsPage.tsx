import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { RoomsButton, SectionHeading } from '../../components'
import { getPublicBuilding, listPublicLocations, listPublicRooms, publicQueryKeys } from '../../features/public/api'
import { ListState } from '../../features/public/ListState'
import { RoomCard } from '../../features/public/RoomCard'
import { RoomFilters } from '../../features/public/RoomFilters'
import { filtersToParams, filtersToQuery, parseFilters, validFilters } from '../../features/public/room-filters'
import type { PublicFilters } from '../../features/public/room-filters'

const PAGE_SIZE = 20

// Anything that is not a positive whole number in the URL means page 1.
function pageOf(params: URLSearchParams): number {
  const page = Number(params.get('page'))
  return Number.isInteger(page) && page >= 1 ? page : 1
}

// /phong (FE-P2-15): every filter, the page and the sort live in the URL query, both ways (PUB-01, ROOM-05).
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
  const goToPage = (target: number) => {
    const next = filtersToParams(values)
    next.set('page', String(target))
    setParams(next)
  }

  return <>
    <SectionHeading>Tìm phòng</SectionHeading>
    <RoomFilters locations={locations.data ?? []} values={values} onChange={apply} onReset={reset} />
    {hasBuilding && <p className="public-building-filter">
      {building.data && <span>Đang lọc theo tòa {building.data.name}</span>}
      <RoomsButton variant="outline" onClick={() => apply({ ...values, buildingId: '' })}>Bỏ lọc tòa</RoomsButton>
    </p>}
    {valid && <ListState
      status={rooms.status}
      error={rooms.error}
      isEmpty={!rooms.data?.data.length}
      loadingLabel="Đang tải danh sách phòng"
      emptyTitle="Chưa có phòng phù hợp với bộ lọc"
      emptyHint={<RoomsButton variant="outline" onClick={reset}>Xóa bộ lọc</RoomsButton>}
      onRetry={() => void rooms.refetch()}
    >
      <div className="public-results">
        <p>{rooms.data?.meta.total} phòng phù hợp</p>
        <div className="public-grid">
          {rooms.data?.data.map(room => <RoomCard key={room.id} room={room} />)}
        </div>
        {rooms.data && (page > 1 || rooms.data.meta.total > rooms.data.meta.limit) && <nav className="public-pager">
          <RoomsButton variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>Trang trước</RoomsButton>
          <RoomsButton variant="outline" disabled={page * rooms.data.meta.limit >= rooms.data.meta.total} onClick={() => goToPage(page + 1)}>Trang sau</RoomsButton>
        </nav>}
      </div>
    </ListState>}
  </>
}
