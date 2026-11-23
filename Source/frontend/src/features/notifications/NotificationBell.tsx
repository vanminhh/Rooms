import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { ElevatedCard, FormError, RoomsButton, Spinner } from '../../components'
import { listMyNotifications, readAllNotifications, readNotification, type MyNotification } from './api'
import './notifications.css'

// NOTI-11 (Q-P4-18, Q-P4-51): a red dot with the unread count; the popup lists the 10 newest, read ones dimmed but kept.
// In-app only: nothing here touches mail. Seen after login, no push.
// The kit header closes its mobile menu on any click in the action slot; the toggle stops that, an item click lets it close.
export function NotificationBell() {
  const { user } = useAuth()
  const client = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const focusBell = () => wrap.current?.querySelector<HTMLButtonElement>('button')?.focus()
  const query = useQuery({ queryKey: ['notifications', 'me', authScopeKey(user)], queryFn: listMyNotifications })
  const unread = query.data?.unreadCount ?? 0
  const badge = unread > 99 ? '99+' : String(unread)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) { setOpen(false); focusBell() }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  const refresh = () => client.invalidateQueries({ queryKey: ['notifications'] })
  async function openItem(item: MyNotification) {
    setError('')
    try {
      if (!item.readAt) { await readNotification(item.id); await refresh() }
      if (item.link) { setOpen(false); void navigate(item.link) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không mở được thông báo') }
  }
  async function readAll() {
    setError('')
    try { await readAllNotifications(); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đánh dấu được') }
  }

  return <div ref={wrap} className="notifications-bell" onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); focusBell() } }}>
    <RoomsButton type="button" variant="outline" aria-haspopup="true" aria-expanded={open}
      aria-label={unread ? `Thông báo, ${unread} thông báo chưa đọc` : 'Thông báo'} onClick={event => { event.stopPropagation(); setOpen(!open) }}>
      <span aria-hidden="true">🔔</span>{unread > 0 && <span className="notifications-dot" aria-hidden="true">{badge}</span>}
    </RoomsButton>
    {open && <div className="notifications-popup" role="region" aria-label="Thông báo">
      <ElevatedCard className="notifications-card">
        <div className="notifications-head"><strong>Thông báo</strong>
          {unread > 0 && <RoomsButton type="button" variant="outline" onClick={event => { event.stopPropagation(); void readAll() }}>Đánh dấu đã đọc tất cả</RoomsButton>}</div>
        {query.isPending && <Spinner label="Đang tải thông báo" />}
        {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton type="button" onClick={() => void query.refetch()}>Thử lại</RoomsButton></>}
        {error && <FormError>{error}</FormError>}
        {query.isSuccess && (query.data.items.length === 0 ? <p>Chưa có thông báo nào.</p>
          : <ul className="notifications-list">{query.data.items.map(item => <li key={item.id}>
            <button type="button" className={`notifications-item${item.readAt ? ' notifications-item--read' : ''}`} onClick={() => void openItem(item)}>
              <span className="notifications-title">{item.title}</span>
              {item.body && <span className="notifications-body">{item.body}</span>}
              <span className="notifications-time">{new Date(item.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
            </button></li>)}</ul>)}
      </ElevatedCard>
    </div>}
  </div>
}
