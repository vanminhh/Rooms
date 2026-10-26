import { useState } from 'react'
import { formatMoney } from '../shared/formatters'
import { RoomsButton } from './Button'

export type RoomCardData = { id: string; name: string; image: string; description: string; metadata: string; price: number }

export function RoomAccordion({ rooms, onSelect }: { rooms: RoomCardData[]; onSelect: (room: RoomCardData) => void }) {
  const [selectedId, setSelectedId] = useState(rooms[0]?.id)
  const activeId = rooms.some(room => room.id === selectedId) ? selectedId : rooms[0]?.id
  if (!rooms.length) return <p className="rooms-empty">Chưa có phòng để hiển thị.</p>
  return <div className="rooms-accordion">
    {rooms.map((room, index) => {
      const active = room.id === activeId
      return <article key={room.id} className={`rooms-room ${active ? 'is-active' : ''}`} onPointerEnter={event => {
        if (event.pointerType === 'mouse' && !event.currentTarget.parentElement?.contains(document.activeElement)) setSelectedId(room.id)
      }}>
        <img src={room.image} alt={room.name} loading="lazy" />
        <div className="rooms-room-shade" />
        <div className="rooms-room-top"><span>{String(index + 1).padStart(2, '0')}</span><span aria-hidden="true">↗</span></div>
        <div className="rooms-room-body">
          <h3><button type="button" aria-expanded={active} onFocus={() => setSelectedId(room.id)} onClick={() => setSelectedId(room.id)}>{room.name}</button></h3>
          <p className="rooms-room-meta">{room.metadata}</p>
          {active && <div className="rooms-room-details"><p>{room.description}</p><p className="rooms-room-price">{formatMoney(room.price)} <small>/ tháng</small></p><RoomsButton variant="sand" onClick={() => onSelect(room)}>Xem phòng <span aria-hidden="true">↗</span></RoomsButton></div>}
        </div>
      </article>
    })}
  </div>
}
