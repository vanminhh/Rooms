import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner, StatusBadge } from '../../components'
import { useAuth } from '../../app/auth-context'
import { useI18n } from '../../shared/i18n'
import { listOwnViewings } from '../../features/viewings/api'
import { isUpcoming, viewingTime } from '../../features/viewings/time'
import '../../features/viewings/viewings.css'

export function GuestHomePage() {
  const { user } = useAuth()
  return user ? <OwnViewings key={user.id} userId={user.id} /> : null
}
function OwnViewings({ userId }: { userId: number }) {
  const { t, lang } = useI18n()
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['own-viewings', userId, 'list', page], queryFn: () => listOwnViewings(page) })
  return <div className="viewings-days">
    <SectionHeading>{t('guest.title')}</SectionHeading>
    {query.isPending ? <Spinner block label={t('common.loading')} /> : query.isError ? <>
      <FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>{t('common.retry')}</RoomsButton>
    </> : !query.data.data.length ? <><p>{t('guest.empty')}</p><Link className="rooms-button rooms-button--primary" to="/phong">{t('nav.findRoom')}</Link></>
      : <>{[true, false].map(upcoming => {
        const rows = query.data.data.filter(v => isUpcoming(v) === upcoming)
        return rows.length ? <section key={String(upcoming)}><h3>{t(upcoming ? 'viewing.upcoming' : 'viewing.history')}</h3>
          <div className="viewings-cards">{rows.map(v => <ElevatedCard key={v.id} className="viewings-card">
            <Link to={`/toi/lich-hen/${v.id}`}>{t('viewing.room', { code: v.roomCode })} · {v.buildingName}</Link>
            <p>{viewingTime(v, lang)}</p><StatusBadge tone={isUpcoming(v) ? 'reserved' : 'maintenance'}>{t(`viewing.status.${v.status}`)}</StatusBadge>
          </ElevatedCard>)}</div></section> : null
      })}</>}
    {query.data && query.data.meta.total > 20 && <nav className="viewings-actions" aria-label={t('guest.title')}>
      <RoomsButton variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('viewing.previousPage')}</RoomsButton>
      <span>{t('viewing.page', { page })}</span>
      <RoomsButton variant="outline" disabled={page * 20 >= query.data.meta.total} onClick={() => setPage(page + 1)}>{t('viewing.nextPage')}</RoomsButton>
    </nav>}
  </div>
}
