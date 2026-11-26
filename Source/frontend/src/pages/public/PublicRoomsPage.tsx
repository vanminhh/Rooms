import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { FilterChip, RoomsButton, SectionHeading } from '../../components'
import { getPublicBuilding, getPublicFilters, listPublicLocations, listPublicRooms, publicQueryKeys } from '../../features/public/api'
import { ListState } from '../../features/public/ListState'
import { RoomCard } from '../../features/public/RoomCard'
import { RoomFilters } from '../../features/public/RoomFilters'
import { filtersToParams, filtersToQuery, needsCatalog, parseFilters, validFilters, withCatalog } from '../../features/public/room-filters'
import type { PublicFilters } from '../../features/public/room-filters'
import { useI18n } from '../../shared/i18n'
import '../../features/public/public-listing.css'

const PAGE_SIZE = 20

// Anything that is not a positive whole number in the URL means page 1.
function pageOf(params: URLSearchParams): number {
  const page = Number(params.get('page'))
  return Number.isInteger(page) && page >= 1 ? page : 1
}

// /phong (UI-22): every filter, the page and the sort live in the URL query, both ways (PUB-01, ROOM-05).
export function PublicRoomsPage() {
  const { lang, t } = useI18n()
  const [params, setParams] = useSearchParams()
  const catalog = useQuery({ queryKey: [...publicQueryKeys.filters, lang], queryFn: getPublicFilters })
  // PUB-06: a code in the URL that the list does not know is dropped before the request; until the list loads, a URL that needs it waits.
  const parsed = useMemo(() => parseFilters(params), [params])
  const filterCatalog = needsCatalog(parsed) ? catalog.data : undefined
  const values = useMemo(() => filterCatalog ? withCatalog(parsed, filterCatalog) : parsed, [parsed, filterCatalog])
  const page = pageOf(params)
  const valid = validFilters(values)
  const ready = valid && (catalog.data !== undefined || catalog.isError || !needsCatalog(values))
  const query = { ...filtersToQuery(values), page, limit: PAGE_SIZE }

  const locations = useQuery({ queryKey: [...publicQueryKeys.locations, lang], queryFn: listPublicLocations })
  const rooms = useQuery({ queryKey: [...publicQueryKeys.rooms(query), lang], queryFn: () => listPublicRooms(query), enabled: ready })
  const hasBuilding = valid && values.buildingId !== ''
  const building = useQuery({
    queryKey: [...publicQueryKeys.building(Number(values.buildingId)), lang],
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
      <SectionHeading eyebrow={t('rooms.page.eyebrow')} description={t('rooms.page.description')}>
        <span id="public-listing-title">{t('rooms.page.leading')}<em>{t('rooms.page.highlight')}</em>{t('rooms.page.trailing')}</span>
      </SectionHeading>

      <div className="public-district-filter" aria-label={t('rooms.district.quickLabel')}>
        <div className="public-district-filter-heading">
          <strong>{t('rooms.district.quickTitle')}</strong>
          {locations.isPending && <span role="status">{t('rooms.district.loading')}</span>}
          {locations.isError && <button type="button" onClick={() => void locations.refetch()}>{t('common.retry')}</button>}
        </div>
        <div className="public-district-chips">
          <FilterChip selected={!values.district} count={totalLocations} onClick={() => selectDistrict('')}>{t('rooms.district.all')}</FilterChip>
          {locations.data?.map(item => <FilterChip key={item.district} selected={values.district === item.district}
            count={item.roomCount} onClick={() => selectDistrict(item.district)}>{item.district}</FilterChip>)}
        </div>
      </div>

      <RoomFilters locations={locations.data ?? []} catalog={catalog.data} values={values} onChange={apply} onReset={reset} />
      {hasBuilding && <div className="public-building-filter">
        <span className="public-building-filter-status" aria-live="polite">
          {building.isPending && <span role="status">{t('rooms.building.loading')}</span>}
          {building.isError && <span role="alert">
            <span>{building.error instanceof Error ? building.error.message : t('rooms.building.error')}</span>
            <button type="button" onClick={() => void building.refetch()}>{t('common.retry')}</button>
          </span>}
        </span>
        {building.data && <span>{t('rooms.building.active', { name: building.data.name })}</span>}
        <RoomsButton variant="outline" onClick={() => apply({ ...values, buildingId: '' })}>{t('rooms.building.remove')}</RoomsButton>
      </div>}
    </section>

    {ready && <ListState
      status={rooms.status}
      error={rooms.error}
      isEmpty={!rooms.data?.data.length}
      loadingLabel={t('rooms.list.loading')}
      emptyTitle={t('rooms.list.empty')}
      emptyHint={<RoomsButton variant="outline" onClick={reset}>{t('rooms.list.clear')}</RoomsButton>}
      onRetry={() => void rooms.refetch()}
    >
      <section className="public-results" aria-labelledby="public-results-title">
        <div className="public-results-heading">
          <div>
            <p className="rooms-eyebrow">{t('rooms.list.results')}</p>
            <h2 id="public-results-title">{t('rooms.list.count', { count: rooms.data?.meta.total ?? 0 })}</h2>
          </div>
          {rooms.data && rooms.data.meta.total > 0 && <p>{t('rooms.list.page', { page, total: totalPages })}</p>}
        </div>
        <div className="public-grid public-room-listing">
          {rooms.data?.data.map(room => <RoomCard key={room.id} room={room} ctaLabel={t('rooms.list.viewDetail')} />)}
        </div>
        {rooms.data && (page > 1 || rooms.data.meta.total > rooms.data.meta.limit) && <nav className="public-pager" aria-label={t('rooms.list.pagination')}>
          <RoomsButton variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>{t('rooms.list.previous')}</RoomsButton>
          <span aria-current="page">{t('rooms.list.page', { page, total: totalPages })}</span>
          <RoomsButton variant="outline" disabled={page * rooms.data.meta.limit >= rooms.data.meta.total} onClick={() => goToPage(page + 1)}>{t('rooms.list.next')}</RoomsButton>
        </nav>}
      </section>
    </ListState>}
  </>
}

