import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { RoomsButton, SectionHeading, StatusBadge, Reveal } from '../../../src/components'
import { useReducedMotion } from '../../../src/components/useReducedMotion'
import { formatMoney } from '../../../src/shared/formatters'
import { createBuildingScene } from './building-scene'
import type { Side } from './building-scene'
import { buildings, allRooms, freeCount } from './sample-data'

const sides: [Side, string][] = [['front', 'Mặt trước'], ['left', 'Bên trái'], ['back', 'Mặt sau'], ['right', 'Bên phải']]
const label = (kind: 'building' | 'room', id: string) => {
  if (kind === 'building') {
    const building = buildings.find(item => item.id === id)!
    return `${building.id} · ${building.district} · ${freeCount(building)} phòng trống`
  }
  const { room } = allRooms.get(id)!
  return `Phòng ${room.code} · ${room.available ? `Trống · ${room.area} m²` : 'Chưa trống'}`
}
const webglSupported = () => {
  try { const canvas = document.createElement('canvas'); return !!(canvas.getContext('webgl2') || canvas.getContext('webgl')) } catch { return false }
}

// An Lâm motion: image opens from the centre (clip-path + settle from scale 1.25), title rises letter by letter.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1]
function RevealImage({ src, alt, reduce }: { src: string; alt: string; reduce: boolean }) {
  return <motion.figure className="b3-photo" initial={reduce ? { opacity: 0 } : { clipPath: 'inset(18% 18% 18% 18% round 24px)' }} animate={reduce ? { opacity: 1 } : { clipPath: 'inset(0% 0% 0% 0% round 0px)' }} transition={{ duration: reduce ? 0.2 : 1.3, ease: EASE_IN_OUT }}>
    <motion.img src={src} alt={alt} initial={reduce ? false : { transform: 'scale(1.25)' }} animate={{ transform: 'scale(1)' }} transition={{ duration: 1.6, ease: EASE }} />
  </motion.figure>
}
function RevealTitle({ text, reduce }: { text: string; reduce: boolean }) {
  return <h2 className="b3-title" aria-label={text}>
    {Array.from(text).map((char, i) => <motion.span key={i} aria-hidden="true" initial={reduce ? { opacity: 0 } : { transform: 'translateY(110%)' }} animate={reduce ? { opacity: 1 } : { transform: 'translateY(0%)' }} transition={{ duration: reduce ? 0.2 : 0.9, ease: EASE, delay: reduce ? 0 : 0.15 + i * 0.022 }}>{char === ' ' ? ' ' : char}</motion.span>)}
  </h2>
}
function Rise({ i, reduce, children, className }: { i: number; reduce: boolean; children: ReactNode; className?: string }) {
  return <motion.div className={className} initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(16px)' }} animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }} transition={{ duration: reduce ? 0.2 : 0.7, ease: EASE, delay: reduce ? 0 : 0.35 + i * 0.06 }}>{children}</motion.div>
}

export type PickerRequest = { buildingId: string; roomId?: string; n: number }

export default function BuildingPicker({ request }: { request?: PickerRequest }) {
  const reduce = useReducedMotion()
  const reduceRef = useRef(reduce)
  const stageRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ReturnType<typeof createBuildingScene> | null>(null)
  const [webgl] = useState(webglSupported)
  const [buildingId, setBuildingId] = useState<string | null>(null)
  const [floor, setFloor] = useState<number | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  // Another section asked to open a building or room: adjust state while rendering, no effect needed
  const [handled, setHandled] = useState(request)
  if (request !== handled) {
    setHandled(request)
    if (request) { setBuildingId(request.buildingId); setFloor(null); setRoomId(request.roomId ?? null); setNote('') }
  }

  useEffect(() => { reduceRef.current = reduce }, [reduce])
  useEffect(() => {
    if (!webgl) return
    const scene = createBuildingScene(stageRef.current!, {
      buildings, tooltip: tipRef.current!, label, reducedMotion: () => reduceRef.current,
      onPickBuilding: id => { setBuildingId(id); setFloor(null); setRoomId(null) },
      onPickRoom: id => setRoomId(id),
    })
    sceneRef.current = scene
    return () => { scene.dispose(); sceneRef.current = null }
  }, [webgl])
  useEffect(() => { sceneRef.current?.focusBuilding(buildingId) }, [buildingId])
  useEffect(() => { sceneRef.current?.setFloor(floor) }, [floor])
  useEffect(() => { sceneRef.current?.selectRoom(roomId) }, [roomId])

  const building = buildings.find(item => item.id === buildingId)
  const selected = roomId ? allRooms.get(roomId)?.room : undefined
  const enterBuilding = (id: string | null) => { setBuildingId(id); setFloor(null); setRoomId(null); setNote('') }
  const preview = (id: string | null) => sceneRef.current?.previewRoom(id)
  const floors = building ? Array.from({ length: building.floors - 1 }, (_, i) => building.floors - i) : []

  return <section className="b3-page" id="chon-phong">
    <div className="b3-main">
      <Reveal>
        <SectionHeading eyebrow={building ? `Tòa ${building.id} · ${building.ward}, ${building.district}` : 'Rooms Apartments · Hà Nội'} description={floor === 0 ? 'Kéo để xoay gara ngầm. Chọn “Cả tòa” hoặc một tầng để xem phòng.' : 'Kéo để xoay mô hình. Trỏ vào tòa hoặc phòng để xem nhanh, bấm để xem thông tin.'}>
          {floor === 0 ? <>Gara ngầm,<br /><em>dưới tầng trệt.</em></> : building ? <>Chọn tầng,<br /><em>chọn phòng.</em></> : <>Chọn một tòa,<br /><em>rồi chọn phòng.</em></>}
        </SectionHeading>
      </Reveal>

      <div className="b3-layout">
        <div>
          <div className="b3-stage" ref={stageRef}>
            <div className="b3-tip" ref={tipRef} aria-hidden="true" />
            {!webgl && <p className="rooms-empty b3-fallback">Trình duyệt này không hiển thị được mô hình 3D. Dùng các nút bên dưới để chọn tòa và phòng.</p>}
          </div>
          <div className="b3-toolbar">
            {building
              ? <>
                <button type="button" className="b3-chip" onClick={() => enterBuilding(null)}><span aria-hidden="true">←</span> Tất cả tòa</button>
                <div className="b3-floors" role="group" aria-label="Chọn tầng">
                  <button type="button" className="b3-chip" aria-pressed={floor === null} onClick={() => setFloor(null)}>Cả tòa</button>
                  <button type="button" className="b3-chip" aria-pressed={floor === 0} onClick={() => { setFloor(0); setRoomId(null) }}>Tầng hầm</button>
                  {floors.map(n => <button key={n} type="button" className="b3-chip" aria-pressed={floor === n} onClick={() => { setFloor(n); if (selected && selected.floor !== n) setRoomId(null) }}>Tầng {n}</button>)}
                </div>
                {webgl && floor !== 0 && <div className="b3-floors" role="group" aria-label="Xem các mặt tòa nhà">
                  {sides.map(([side, text]) => <button key={side} type="button" className="b3-chip" onClick={() => sceneRef.current?.viewSide(side)}>{text}</button>)}
                </div>}
              </>
              : <p className="b3-hint">Trỏ vào một tòa để xem tên · bấm để vào trong</p>}
            {floor !== 0 && <ul className="b3-legend" aria-label="Chú thích màu">
              <li><i className="is-available" />Phòng trống</li><li><i className="is-unavailable" />Chưa trống</li><li><i className="is-selected" />Đang chọn</li>
            </ul>}
          </div>

          {building && floor !== 0 && <div className="b3-list" aria-label={`Danh sách phòng tòa ${building.id}`}>
            {floors.filter(n => floor === null || n === floor).map(n => <div key={n} className="b3-list-row">
              <span>Tầng {n}</span>
              <div>
                {building.rooms.filter(room => room.floor === n).map(room => <button key={room.id} type="button" className={room.available ? 'b3-room is-available' : 'b3-room'} aria-pressed={room.id === roomId} aria-label={`Phòng ${room.code}, ${room.available ? 'trống' : 'chưa trống'}`} onClick={() => setRoomId(room.id)} onPointerEnter={() => preview(room.id)} onPointerLeave={() => preview(null)} onFocus={() => preview(room.id)} onBlur={() => preview(null)}>{room.code}</button>)}
              </div>
            </div>)}
          </div>}
        </div>

        <aside className="b3-panel" aria-live="polite">
          {!building && <div key="all">
            <p className="rooms-eyebrow">{buildings.length} tòa · {buildings.reduce((sum, item) => sum + freeCount(item), 0)} phòng trống</p>
            <RevealTitle text="Chọn một tòa nhà" reduce={reduce} />
            <p className="b3-lead">Mỗi ô cửa trên mô hình là một phòng. Cửa sáng màu xanh là phòng đang trống, xem được chi tiết.</p>
            <ul className="b3-buildings">
              {buildings.map(item => <li key={item.id}><button type="button" onClick={() => enterBuilding(item.id)}>
                <strong>{item.name}</strong><span>{item.id} · {item.district} · {item.facade}</span><em>{freeCount(item)} phòng trống <span aria-hidden="true">→</span></em>
              </button></li>)}
            </ul>
          </div>}

          {building && !selected && <div key={building.id}>
            <p className="rooms-eyebrow">Tòa {building.id} · {building.ward}, {building.district}</p>
            <RevealTitle text={building.name} reduce={reduce} />
            <Rise i={0} reduce={reduce}>
              <dl className="b3-facts">
                <div><dt>Mặt tiền</dt><dd>{building.facade}</dd></div>
                <div><dt>Số tầng</dt><dd>{building.floors} và 1 tầng hầm để xe</dd></div>
                <div><dt>Phòng trống</dt><dd>{freeCount(building)} / {building.rooms.length}</dd></div>
                <div><dt>Giá từ</dt><dd>{formatMoney(Math.min(...building.rooms.filter(room => room.available).map(room => room.price)))} / tháng</dd></div>
              </dl>
            </Rise>
            <Rise i={1} reduce={reduce}><p className="b3-lead">{floor === 0 ? 'Gara ngầm, lối dốc và xe máy chỉ là minh họa. Chọn “Cả tòa” hoặc một tầng để xem phòng.' : 'Bấm vào một ô cửa sáng xanh trên mô hình hoặc một phòng trong danh sách. Chọn tầng để mở nóc và nhìn xuống mặt bằng tầng đó.'}</p></Rise>
          </div>}

          {building && selected && <div key={selected.id}>
            {selected.available && <RevealImage src={selected.image} alt={`Ảnh minh họa phòng ${selected.code}`} reduce={reduce} />}
            <p className="rooms-eyebrow">Tòa {building.id} · Tầng {selected.floor} · {selected.side}</p>
            <RevealTitle text={`Phòng ${selected.code}`} reduce={reduce} />
            <Rise i={0} reduce={reduce} className="b3-status">
              {selected.available ? <StatusBadge tone="available">Trống</StatusBadge> : <StatusBadge tone="occupied">Chưa trống</StatusBadge>}
            </Rise>
            {selected.available ? <>
              <Rise i={1} reduce={reduce}>
                <dl className="b3-facts">
                  <div><dt>Diện tích</dt><dd>{selected.area} m²</dd></div>
                  <div><dt>Ở tối đa</dt><dd>{selected.occupants} người</dd></div>
                  <div><dt>Nội thất</dt><dd>{selected.furniture.join(', ')}</dd></div>
                </dl>
              </Rise>
              <Rise i={2} reduce={reduce} className="b3-price">
                <p>{formatMoney(selected.price)}<small> / tháng</small></p>
                <span>Ước tính mỗi tháng {formatMoney(selected.estimate)}, chưa gồm điện</span>
              </Rise>
              <Rise i={3} reduce={reduce} className="b3-actions">
                <RoomsButton onClick={() => setNote(`Bản nháp: trang thật mở /phong/${selected.code} với form đặt lịch xem (VIEW-01).`)}>Đặt lịch xem phòng <span aria-hidden="true">↗</span></RoomsButton>
                <RoomsButton variant="outline" onClick={() => setRoomId(null)}>Đóng</RoomsButton>
              </Rise>
              <p className="b3-note" role="status">{note}</p>
            </> : <Rise i={1} reduce={reduce}>
              <p className="b3-lead">Phòng này đang có người thuê hoặc đã được đặt cọc. Chỉ phòng trống mới hiện giá và ảnh (ROOM-05).</p>
              <p className="b3-sub">Phòng trống cùng tòa</p>
              <div className="b3-free">{building.rooms.filter(room => room.available).map(room => <button key={room.id} type="button" className="b3-room is-available" onClick={() => setRoomId(room.id)}>{room.code}</button>)}</div>
            </Rise>}
          </div>}
        </aside>
      </div>
    </div>
  </section>
}
