import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog, ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner, StatusBadge } from '../../components'
import { useAuth } from '../../app/auth-context'
import { ApiError } from '../../shared/api'
import { useI18n } from '../../shared/i18n'
import { cancelOwnViewing, getOwnViewing, invalidateViewings } from '../../features/viewings/api'
import { viewingTime } from '../../features/viewings/time'
import { useViewingStarted } from '../../features/viewings/useViewingStarted'
import { ViewingContacts } from '../../features/viewings/ViewingContacts'
import '../../features/viewings/viewings.css'

export function GuestViewingPage() {
  const { id } = useParams(), { user } = useAuth()
  return <ViewingDetail key={`${user?.id}:${id}`} id={Number(id)} userId={user?.id} />
}
function ViewingDetail({ id, userId }: { id: number; userId?: number }) {
  const { t, lang } = useI18n(), client = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const sending = useRef(false)
  const validId = Number.isSafeInteger(id) && id > 0
  const query = useQuery({ queryKey: ['own-viewings', userId, 'detail', id], queryFn: () => getOwnViewing(id), enabled: validId && !!userId })
  const started = useViewingStarted(query.data)
  const cancel = useMutation({ mutationFn: () => cancelOwnViewing(id), onSuccess: async data => {
    client.setQueryData(['own-viewings', userId, 'detail', id], data)
    setConfirm(false)
    await invalidateViewings(client)
  }, onError: () => { void invalidateViewings(client) } })
  async function cancelOnce() {
    if (sending.current) return
    sending.current = true
    try { await cancel.mutateAsync() } catch { /* The mutation error is rendered below. */ } finally { sending.current = false }
  }
  if (!validId || (query.error instanceof ApiError && query.error.status === 404)) return <><p>{t('viewing.notFound')}</p><Link to="/toi">{t('viewing.back')}</Link></>
  if (query.isPending) return <Spinner block label={t('common.loading')} />
  if (query.isError) return <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>{t('common.retry')}</RoomsButton></>
  const v = query.data, open = v.status === 'NEW' || v.status === 'CONFIRMED'
  return <div className="viewings-days">
    <Link to="/toi">{t('viewing.back')}</Link>
    <SectionHeading>{t('viewing.room', { code: v.roomCode })}</SectionHeading>
    <ElevatedCard className="viewings-card">
      <h3>{v.buildingName}</h3><p>{v.buildingAddress}</p><p>{viewingTime(v, lang)}</p>
      <StatusBadge tone={open ? 'reserved' : 'maintenance'}>{t(`viewing.status.${v.status}`)}</StatusBadge>
      {v.note && <p>{v.note}</p>}
      <ViewingContacts contact={v.contact} bossContact={v.bossContact} />
      {open && <p>{t('viewing.reschedule')}</p>}
      {open && !started && <RoomsButton variant="outline" disabled={cancel.isPending} onClick={() => { cancel.reset(); setConfirm(true) }}>{t('viewing.cancel')}</RoomsButton>}
      {!confirm && cancel.isError && <FormError>{cancel.error.message}</FormError>}
    </ElevatedCard>
    <ConfirmDialog open={confirm} title={t('viewing.cancelTitle')} description={<><p>{t('viewing.cancelDescription')}</p><FormError>{cancel.error?.message}</FormError></>}
      confirmLabel={t('viewing.cancel')} cancelLabel={t('viewing.keep')} pendingLabel={t('common.loading')} pending={cancel.isPending}
      onConfirm={() => void cancelOnce()} onClose={() => { if (!cancel.isPending) setConfirm(false) }} />
  </div>
}
