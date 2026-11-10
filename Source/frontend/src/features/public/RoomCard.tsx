import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { formatMoney } from '../../shared/formatters'
import type { PublicRoomListItem } from './api'
import './public.css'

interface RoomCardProps {
  room: PublicRoomListItem
  ctaLabel?: string
}

// One room in a public list; the whole card links to the room detail (PUB-02).
export function RoomCard({ room, ctaLabel }: RoomCardProps): ReactElement {
  return <Link className="public-room-card" to={`/phong/${room.id}`}>
    {room.imageUrl
      ? <img className="public-room-image" src={room.imageUrl} alt={`Phòng ${room.code} – ${room.buildingName}`} />
      : <span className="public-room-media">Chưa có ảnh</span>}
    <h3>Phòng {room.code}</h3>
    <p>{room.buildingName}</p>
    <p>{room.ward}, {room.district}</p>
    <dl className="public-room-facts">
      <div><dt>Giá thuê</dt><dd>{formatMoney(room.price)}</dd></div>
      <div><dt>Diện tích</dt><dd>{room.areaM2.toLocaleString('vi-VN')} m²</dd></div>
      <div><dt>Tầng</dt><dd>{room.floor}</dd></div>
    </dl>
    {ctaLabel && <span className="public-room-cta">{ctaLabel}<span aria-hidden="true">→</span></span>}
  </Link>
}
