import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { SectionHeading } from '../../components'
import { getPublicBuilding, publicQueryKeys } from '../../features/public/api'
import type { PublicBuildingDetail } from '../../features/public/api'
import { ContactCard } from '../../features/public/ContactCard'
import { ListState } from '../../features/public/ListState'
import { RateTable } from '../../features/public/RateTable'
import { RoomCard } from '../../features/public/RoomCard'
import { ApiError } from '../../shared/api'
import { NotFoundPage } from './NotFoundPage'

// PUB-02: a building that is not public, or a bad id, shows the 404 page. No automatic retry, so a 404 shows at once.
export function PublicBuildingPage() {
  const { id } = useParams()
  const buildingId = Number(id)
  const valid = Number.isSafeInteger(buildingId) && buildingId > 0
  const building = useQuery({ queryKey: publicQueryKeys.building(buildingId), queryFn: () => getPublicBuilding(buildingId), enabled: valid, retry: false })
  if (!valid || (building.error instanceof ApiError && building.error.status === 404)) return <NotFoundPage />

  return <ListState
    status={building.status}
    error={building.error}
    isEmpty={false}
    loadingLabel="Đang tải danh sách phòng"
    emptyTitle=""
    onRetry={() => void building.refetch()}
  >
    {building.data && <BuildingDetail building={building.data} />}
  </ListState>
}

function BuildingDetail({ building }: { building: PublicBuildingDetail }) {
  return <div className="public-detail">
    <SectionHeading>{building.name}</SectionHeading>
    <p>{building.address}, {building.ward}, {building.district}</p>
    {building.description && <p>{building.description}</p>}
    {building.amenities.length > 0 && <ul className="public-tags">{building.amenities.map(item => <li key={item}>{item}</li>)}</ul>}
    <RateTable rates={building.rates} upcomingRates={building.upcomingRates} waterMode={building.waterMode} />
    <ContactCard contact={building.contact} />
    <section className="public-results" aria-label="Còn trống tại tòa">
      <SectionHeading>Còn trống tại tòa</SectionHeading>
      <p><Link to={`/phong?buildingId=${building.id}`}>Xem phòng trống của tòa này</Link></p>
      {building.rooms.length > 0
        ? <div className="public-grid">{building.rooms.map(room => <RoomCard key={room.id} room={room} />)}</div>
        : <div className="rooms-empty"><p>Chưa có phòng trống nào</p></div>}
    </section>
  </div>
}
