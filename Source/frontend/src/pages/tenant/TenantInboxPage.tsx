import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { listNotificationsPage, readAllNotifications, readNotification, type MyNotification } from '../../features/notifications/api'
import { useI18n } from '../../shared/i18n'
import '../../features/notifications/notifications.css'

export function TenantInboxPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const client = useQueryClient()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const scope = authScopeKey(user)
  const query = useQuery({ queryKey: ['notifications', 'me', scope, page], queryFn: () => listNotificationsPage(page) })
  const mark = useMutation({
    mutationFn: async (item: MyNotification | null) => {
      if (!item) await readAllNotifications()
      else if (!item.readAt) await readNotification(item.id)
    },
    onSuccess: async (_, item) => {
      await client.invalidateQueries({ queryKey: ['notifications', 'me', scope] })
      if (item?.link?.startsWith('/thue/')) void navigate(item.link)
    },
  })
  return <>
    <SectionHeading>{t('nav.announcements')}</SectionHeading>
    {query.isPending && <Spinner block label={t('inbox.loading')} />}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>{t('contracts.retry')}</RoomsButton></>}
    {mark.isError && <FormError>{mark.error.message}</FormError>}
    {query.data && <ElevatedCard>
      <div className="notifications-head"><strong aria-live="polite">{t('inbox.unread', { count: query.data.unreadCount })}</strong>
        {query.data.unreadCount > 0 && <RoomsButton disabled={mark.isPending} onClick={() => mark.mutate(null)}>{t('inbox.markAll')}</RoomsButton>}</div>
      {!query.data.data.length && <p>{t('inbox.empty')}</p>}
      <ul className="notifications-list">{query.data.data.map(item => <li key={item.id}>
        <button className={'notifications-item' + (item.readAt ? ' notifications-item--read' : '')} type="button" disabled={mark.isPending} onClick={() => mark.mutate(item)}>
          <span className="notifications-title">{!item.readAt && <span aria-label={t('inbox.new')}>● </span>}{item.title}</span>
          {item.body && <span className="notifications-body">{item.body}</span>}
          <time className="notifications-time" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })}</time>
        </button></li>)}</ul>
      {query.data.meta.total > query.data.meta.limit && <div className="notifications-head">
        <RoomsButton disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('viewing.previousPage')}</RoomsButton>
        <RoomsButton disabled={page * query.data.meta.limit >= query.data.meta.total} onClick={() => setPage(page + 1)}>{t('viewing.nextPage')}</RoomsButton>
      </div>}
    </ElevatedCard>}
  </>
}
