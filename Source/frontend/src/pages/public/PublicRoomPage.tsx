import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { StatusBadge } from '../../components'
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
import { RoomDetailView } from './RoomDetailView'

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

// This composition is deliberately thin: RoomDetailView is the single UI implementation used by both
// the real page and preview; these slots keep all API-aware components and money formatting unchanged.
export function RoomDetail({ room }: { room: PublicRoomDetail }) {
  return <RoomDetailView
    room={room}
    statusBadge={<StatusBadge>Đang trống</StatusBadge>}
    estimatePanel={<EstimatePanel monthlyEstimate={room.monthlyEstimate} deposit={room.deposit} estimate={room.estimate} />}
    rateTable={<RateTable rates={room.rates} upcomingRates={room.upcomingRates} waterMode={room.building.waterMode} />}
    contactCard={<ContactCard contact={room.contact} />}
    viewingForm={<ViewingForm roomId={room.id} roomCode={room.code} />}
    formatMoney={formatMoney}
  />
}
