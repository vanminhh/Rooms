import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { ConfirmDialog, ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import type { Me } from '../../features/auth/api'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import { buildingIdQuery } from '../../features/buildings/api'
import { SelectField, TextAreaField } from '../../features/buildings/fields'
import { useContractAction } from '../../features/contracts/actions'
import { allPages } from '../../features/contracts/forms'
import { listRooms } from '../../features/rooms/api'
import { listAnnouncements, sendAnnouncement, type AnnouncementInput } from '../../features/notifications/api'
import '../../features/contracts/contracts.css'

export function AnnouncementsPage() {
  const { user } = useAuth()
  const { selectedBuildingId } = useBuildingSelection()
  const filter = buildingIdQuery(selectedBuildingId)
  return user && <Announcements key={authScopeKey(user) + ':' + filter} user={user} filter={filter} />
}

function Announcements({ user, filter }: { user: Me; filter?: number }) {
  const scope = authScopeKey(user)
  const buildings = (user.buildings ?? []).filter(b => filter === undefined || b.id === filter)
  const [target, setTarget] = useState(buildings.length === 1 ? String(buildings[0].id) : '')
  const [room, setRoom] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [page, setPage] = useState(1)
  const [confirmation, setConfirmation] = useState<{ input: AnnouncementInput; audience: string } | null>(null)
  const [notice, setNotice] = useState('')
  const action = useContractAction()
  const client = useQueryClient()
  const building = buildings.find(b => String(b.id) === target)
  const chain = user.role === 'BOSS' && filter === undefined && target === 'all'
  const rooms = useQuery({ queryKey: ['rooms', 'announcement-options', scope, building?.id], enabled: !!building,
    queryFn: () => allPages(n => listRooms({ buildingId: building!.id, page: n, limit: 100 })) })
  const selectedRoom = rooms.data?.find(r => String(r.id) === room && r.buildingId === building?.id)
  const history = useQuery({ queryKey: ['announcements', scope, filter, page], queryFn: () => listAnnouncements(filter, page) })
  const canSend = (chain || !!building) && (!room || !!selectedRoom) && !!title.trim() && !!body.trim()

  function preview(event: FormEvent) {
    event.preventDefault()
    if (!canSend || action.pending) return
    action.setError('')
    setNotice('')
    setConfirmation({
      input: { title: title.trim(), body: body.trim(), buildingId: building?.id ?? null, ...(selectedRoom ? { roomId: selectedRoom.id } : {}) },
      audience: selectedRoom ? `Phòng ${selectedRoom.code} · ${building?.name}` : building?.name ?? 'Toàn hệ thống',
    })
  }
  async function send() {
    if (!confirmation) return
    await action.run(async () => {
      const sent = await sendAnnouncement(confirmation.input)
      setTitle(''); setBody(''); setPage(1)
      setNotice(`Đã gửi thông báo đến ${sent.recipientCount} người thuê.`)
      await client.invalidateQueries({ queryKey: ['announcements'] })
    })
    setConfirmation(null)
  }
  return <>
    <SectionHeading>Thông báo</SectionHeading>
    <form className="contracts-form" onSubmit={preview}>
      <SelectField name="building" label="Phạm vi gửi" required value={target} onChange={e => { setTarget(e.target.value); setRoom('') }}>
        <option value="">Chọn nơi nhận</option>
        {user.role === 'BOSS' && filter === undefined && <option value="all">Toàn hệ thống</option>}
        {buildings.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
      </SelectField>
      {building && <SelectField name="room" label="Phòng nhận" value={room} onChange={e => setRoom(e.target.value)}>
        <option value="">Cả tòa</option>
        {rooms.data?.map(r => <option key={r.id} value={r.id}>{r.code}</option>)}
      </SelectField>}
      {building && rooms.isPending && <Spinner label="Đang tải phòng" />}
      {building && rooms.isError && <><FormError>{rooms.error.message}</FormError><RoomsButton type="button" onClick={() => void rooms.refetch()}>Tải lại phòng</RoomsButton></>}
      <TextField label="Tiêu đề" name="title" required maxLength={150} value={title} onChange={e => setTitle(e.target.value)} />
      <TextAreaField label="Nội dung" name="body" required rows={4} value={body} onChange={e => setBody(e.target.value)} />
      <RoomsButton type="submit" disabled={!canSend || action.pending}>Gửi thông báo</RoomsButton>
    </form>
    {action.error && <FormError>{action.error}</FormError>}
    {notice && <p role="status">{notice}</p>}
    {confirmation && <ConfirmDialog open title="Gửi thông báo?" confirmLabel="Xác nhận gửi" pending={action.pending}
      description={<><p>Người thuê đang có hợp đồng tại: <strong>{confirmation.audience}</strong></p><p>{confirmation.input.title}</p></>}
      onConfirm={() => void send()} onClose={() => { if (!action.pending) setConfirmation(null) }} />}
    <h2>Thông báo đã gửi</h2>
    {history.isPending && <Spinner block label="Đang tải thông báo" />}
    {history.isError && <><FormError>{history.error.message}</FormError><RoomsButton onClick={() => void history.refetch()}>Thử lại</RoomsButton></>}
    {history.data && <div className="contracts-list">
      {history.data.data.length === 0 && <p>Chưa có thông báo.</p>}
      {history.data.data.map(a => <ElevatedCard className="contracts-card" key={a.id}>
        <h3>{a.title}</h3><p>{a.building?.name ?? 'Toàn hệ thống'}{a.room && ' · Phòng ' + a.room.code}</p>
        <p className="contracts-terms">{a.body}</p><p>{a.author.fullName} · {new Date(a.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
        <p>Đã đọc {a.readCount} / {a.recipientCount} người nhận</p>
      </ElevatedCard>)}
      {history.data.meta.total > history.data.meta.limit && <nav className="contracts-actions" aria-label="Phân trang thông báo">
        <RoomsButton disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton><span>Trang {page}</span>
        <RoomsButton disabled={page * history.data.meta.limit >= history.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
      </nav>}
    </div>}
  </>
}
