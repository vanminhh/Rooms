import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { StatusBadge } from '../../components'
import { getPublicFilters, getPublicRoom, publicQueryKeys } from '../../features/public/api'
import type { PublicFiltersView, PublicRoomDetail } from '../../features/public/api'
import { labelOf, roomAttributeFacts } from '../../features/public/attributes'
import { ContactCard } from '../../features/public/ContactCard'
import { EstimatePanel } from '../../features/public/EstimatePanel'
import { ListState } from '../../features/public/ListState'
import { RateTable } from '../../features/public/RateTable'
import { ViewingForm } from '../../features/public/ViewingForm'
import { ApiError } from '../../shared/api'
import { formatMoney } from '../../shared/formatters'
import { useI18n } from '../../shared/i18n'
import { NotFoundPage } from './NotFoundPage'
import { RoomDetailView } from './RoomDetailView'

// PUB-02: a room that is not public, or a bad id, shows the 404 page. No automatic retry, so a 404 shows at once.
export function PublicRoomPage() {
  const { lang, t } = useI18n()
  const { id } = useParams()
  const roomId = Number(id)
  const valid = Number.isSafeInteger(roomId) && roomId > 0
  const room = useQuery({ queryKey: [...publicQueryKeys.room(roomId), lang], queryFn: () => getPublicRoom(roomId), enabled: valid, retry: false })
  const catalog = useQuery({ queryKey: [...publicQueryKeys.filters, lang], queryFn: getPublicFilters, enabled: room.isSuccess })
  if (!valid || (room.error instanceof ApiError && room.error.status === 404)) return <NotFoundPage />

  return <ListState
    status={room.status}
    error={room.error}
    isEmpty={false}
    loadingLabel={t('rooms.list.loading')}
    emptyTitle=""
    onRetry={() => void room.refetch()}
  >
    {room.data && <RoomDetail room={room.data} catalog={catalog.data} catalogLoading={catalog.isPending} />}
  </ListState>
}

// This composition is deliberately thin: RoomDetailView is the single UI implementation used by both
// the real page and preview; these slots keep all API-aware components and money formatting unchanged.
// `catalog` (GET /public/filters) turns room types and building amenity codes into their labels; without it a code shows as is.
export function RoomDetail({ room, catalog, catalogLoading = false }: { room: PublicRoomDetail; catalog?: PublicFiltersView; catalogLoading?: boolean }) {
  const { lang, t } = useI18n()
  // While the labels load, the amenity codes wait too, so a raw code never flashes on screen.
  const amenities = catalogLoading ? [] : room.building.amenities.map(code => labelOf(code, catalog?.amenities, lang))
  const labelled = { ...room, building: { ...room.building, amenities } }
  return <RoomDetailView
    room={labelled}
    attributeFacts={roomAttributeFacts(room, catalog, catalogLoading, lang)}
    statusBadge={<StatusBadge>{t('room.available')}</StatusBadge>}
    estimatePanel={<EstimatePanel monthlyEstimate={room.monthlyEstimate} deposit={room.deposit} estimate={room.estimate} />}
    rateTable={<RateTable rates={room.rates} upcomingRates={room.upcomingRates} waterMode={room.building.waterMode} />}
    contactCard={<ContactCard contact={room.contact} />}
    viewingForm={<ViewingForm roomId={room.id} roomCode={room.code} />}
    formatMoney={formatMoney}
  />
}
