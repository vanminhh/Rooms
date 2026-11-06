import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { SectionHeading } from '../../components'
import { getPublicRoom, publicQueryKeys } from '../../features/public/api'
import type { PublicRoomDetail } from '../../features/public/api'
import { ContactCard } from '../../features/public/ContactCard'
import { EstimatePanel } from '../../features/public/EstimatePanel'
import { ListState } from '../../features/public/ListState'
import { RateTable } from '../../features/public/RateTable'
import { ViewingForm } from '../../features/public/ViewingForm'
import { ApiError } from '../../shared/api'
import { formatMoney } from '../../shared/formatters'
import { NotFoundPage } from './NotFoundPage'

// PUB-02: a room that is not public, or a bad id, shows the 404 page. No automatic retry, so a 404 shows at once.
export function PublicRoomPage() {
  const { id } = useParams()
  const roomId = Number(id)
  const valid = Number.isSafeInteger(roomId) && roomId > 0
  const room = useQuery({ queryKey: publicQueryKeys.room(roomId), queryFn: () => getPublicRoom(roomId), enabled: valid, retry: false })
  if (!valid || (room.error instanceof ApiError && room.error.status === 404)) return <NotFoundPage />

  return <ListState
    status={room.status}
    error={room.error}
    isEmpty={false}
    loadingLabel="Đang tải danh sách phòng"
    emptyTitle=""
    onRetry={() => void room.refetch()}
  >
    {room.data && <RoomDetail room={room.data} />}
  </ListState>
}

function RoomDetail({ room }: { room: PublicRoomDetail }) {
  const { building } = room
  return <div className="public-detail">
    <SectionHeading>Phòng {room.code}</SectionHeading>
    <p><Link to={`/toa/${building.id}`}>{building.name}</Link></p>
    <p>{building.address}, {building.ward}, {building.district}</p>
    {room.images.length === 0
      ? <span className="public-room-media">Chưa có ảnh</span>
      : room.images.map((image, index) => <img key={image.id} className="public-room-image" src={image.url}
        alt={`Phòng ${room.code} – ${building.name}, ảnh ${index + 1}/${room.images.length}`} />)}
    <strong className="public-room-price">{formatMoney(room.price)}</strong>
    <dl className="public-room-facts">
      <div><dt>Diện tích</dt><dd>{room.areaM2.toLocaleString('vi-VN')} m²</dd></div>
      <div><dt>Số người tối đa</dt><dd>{room.maxOccupants}</dd></div>
    </dl>
    {room.description && <p>{room.description}</p>}
    {building.description && <p>{building.description}</p>}
    {building.amenities.length > 0 && <ul className="public-tags">{building.amenities.map(item => <li key={item}>{item}</li>)}</ul>}
    {room.furniture.length > 0 && <>
      <h3>Nội thất</h3>
      <ul className="public-tags">{room.furniture.map(item => <li key={item}>{item}</li>)}</ul>
    </>}
    <RateTable rates={room.rates} upcomingRates={room.upcomingRates} waterMode={building.waterMode} />
    <EstimatePanel monthlyEstimate={room.monthlyEstimate} deposit={room.deposit} estimate={room.estimate} />
    <ContactCard contact={room.contact} />
    <ViewingForm roomId={room.id} />
  </div>
}
