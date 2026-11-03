import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Checkbox, CostBreakdown, FormError, RoomsButton, RoomsFooter, RoomsHeader,
  RoomSearch, SectionHeading, Spinner, StatusBadge, TextField,
} from '../../src/components'
import { formatMoney } from '../../src/shared/formatters'
import './sample.css'

type Screen = 'home' | 'rooms' | 'building' | 'room' | 'grid' | 'approval'
type ListState = 'data' | 'loading' | 'empty' | 'error'
type Room = {
  id: string; code: string; building: string; buildingName: string; address: string
  district: string; ward: string; area: number; price: number; noPhoto?: boolean
}
type Approval = {
  id: string; title: string; building: string; date: string; reason: string
  kind: 'single' | 'electric' | 'different'; old?: number; next?: number; percent?: string
  expired?: boolean; supersedes?: string
}

const params = new URLSearchParams(location.search)
const screenOptions: { value: Screen; label: string; route: string }[] = [
  { value: 'home', label: 'Trang chủ', route: '/' },
  { value: 'rooms', label: 'Tìm phòng', route: '/phong' },
  { value: 'building', label: 'Chi tiết tòa', route: '/toa/:id' },
  { value: 'room', label: 'Chi tiết phòng', route: '/phong/:id' },
  { value: 'grid', label: 'Lưới phòng', route: '/ql/phong' },
  { value: 'approval', label: 'Duyệt giá', route: '/ql/duyet-gia' },
]
const screen = screenOptions.find(item => item.value === params.get('screen'))?.value ?? 'home'
const href = (next: Screen, more?: Record<string, string>) => `?${new URLSearchParams({ screen: next, ...more })}`
const rooms: Room[] = [
  { id: 'hm101', code: '101', building: 'HM01', buildingName: 'Tòa Hoàng Mai', address: '3 Giải Phóng', district: 'Hoàng Mai', ward: 'Giáp Bát', area: 18, price: 2000000 },
  { id: 'dd101', code: '101', building: 'DD01', buildingName: 'Tòa Đống Đa', address: '2 Tây Sơn', district: 'Đống Đa', ward: 'Quang Trung', area: 20, price: 2200000 },
  { id: 'dd102', code: '102', building: 'DD01', buildingName: 'Tòa Đống Đa', address: '2 Tây Sơn', district: 'Đống Đa', ward: 'Quang Trung', area: 22, price: 2300000 },
  { id: 'cg204', code: '204', building: 'CG01', buildingName: 'Tòa Cầu Giấy', address: '1 Xuân Thủy', district: 'Cầu Giấy', ward: 'Dịch Vọng Hậu', area: 22, price: 2400000, noPhoto: true },
  { id: 'hm201', code: '201', building: 'HM01', buildingName: 'Tòa Hoàng Mai', address: '3 Giải Phóng', district: 'Hoàng Mai', ward: 'Giáp Bát', area: 25, price: 2600000 },
]
const approvals: Approval[] = [
  { id: 'room', title: 'Giá phòng 203', building: 'CG01 · Tòa Cầu Giấy', date: '10/11/2026', reason: 'Điều chỉnh giá cho hợp đồng mới; hợp đồng đang thuê giữ nguyên giá.', kind: 'single', old: 2500000, next: 2625000, percent: '+5,0%', supersedes: 'Giá 2.700.000 đ đã duyệt từ 15/11/2026 sẽ được thay thế.' },
  { id: 'water', title: 'Nước · theo đồng hồ', building: 'CG01 · Tòa Cầu Giấy', date: '10/11/2026', reason: 'Điều chỉnh đơn giá nước của tòa.', kind: 'single', old: 15000, next: 16000, percent: '+6,7%' },
  { id: 'electric', title: 'Điện · 3 bậc', building: 'CG01 · Tòa Cầu Giấy', date: '10/11/2026', reason: 'Cập nhật đơn giá, giữ nguyên các mốc kWh.', kind: 'electric' },
  { id: 'new', title: 'Giá phòng 301', building: 'CG01 · Tòa Cầu Giấy', date: '10/11/2026', reason: 'Phòng mới hoàn thiện, đề xuất giá lần đầu.', kind: 'single', next: 2300000 },
  { id: 'different', title: 'Điện · thay đổi số bậc', building: 'DD01 · Tòa Đống Đa', date: '15/11/2026', reason: 'Đề xuất chuyển từ 3 bậc sang 2 bậc.', kind: 'different' },
  { id: 'expired', title: 'Giá phòng 204', building: 'CG01 · Tòa Cầu Giấy', date: '01/11/2026', reason: 'Điều chỉnh sau khi bổ sung nội thất.', kind: 'single', old: 2400000, next: 2520000, percent: '+5,0%', expired: true },
]

function Button({ children, onClick, variant = 'primary', type = 'button' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'outline' | 'sand'; type?: 'button' | 'submit'
}) {
  return <RoomsButton magnetic={false} variant={variant} onClick={onClick} type={type}>{children}</RoomsButton>
}

function Select({ label, name, children, defaultValue = '', value, onChange }: { label: string; name: string; children: ReactNode; defaultValue?: string; value?: string; onChange?: (value: string) => void }) {
  return <label className="mock-select"><span>{label}</span><select name={name} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={event => onChange?.(event.target.value)}>{children}</select></label>
}

function ListContent({ state, retry, children }: { state: ListState; retry: () => void; children: ReactNode }) {
  if (state === 'loading') return <div className="mock-state"><Spinner label="Đang tải danh sách" /><p>Đang tải danh sách…</p></div>
  if (state === 'empty') return <div className="mock-state"><h3>Chưa có kết quả phù hợp</h3><p>Thử bỏ bớt bộ lọc để xem thêm lựa chọn.</p><Button variant="outline" onClick={retry}>Xem tất cả</Button></div>
  if (state === 'error') return <div className="mock-state"><FormError>Chưa tải được danh sách. Vui lòng thử lại.</FormError><Button variant="outline" onClick={retry}>Thử lại</Button></div>
  return children
}

function RoomCard({ room }: { room: Room }) {
  return <article className="mock-room-card">
    <a href={href('room', { room: room.id })} className="mock-card-photo" aria-label={`Xem phòng ${room.code}, ${room.buildingName}`}>
      {room.noPhoto ? <div className="mock-no-photo"><span aria-hidden="true">▧</span><span>Chưa có ảnh</span></div> : <img src="/images/rooms-hanoi-room.webp" alt={`Không gian phòng tại Hà Nội, ảnh minh họa cho phòng ${room.code}`} loading="lazy" />}
      <StatusBadge tone="available">Trống</StatusBadge>
    </a>
    <div className="mock-card-body"><p className="rooms-eyebrow">{room.district} · {room.building}</p>
      <h3><a href={href('room', { room: room.id })}>Phòng {room.code}</a></h3>
      <p className="mock-secondary">{room.buildingName} · {room.area} m² · Tối đa {room.id === 'hm201' ? '3' : '2'} người</p>
      <div className="mock-card-bottom"><p><strong>{formatMoney(room.price)}</strong><span>/ tháng</span></p><a className="mock-text-link" href={href('room', { room: room.id })} aria-label={`Chi tiết phòng ${room.code} tại ${room.buildingName}`}>Chi tiết <span aria-hidden="true">↗</span></a></div>
    </div>
  </article>
}

function Contact({ boss = false }: { boss?: boolean }) {
  return <div className="mock-contact"><span className="rooms-eyebrow">{boss ? 'Liên hệ chủ nhà' : 'Quản lý tòa nhà'}</span>
    <h3>{boss ? 'Phạm Minh Đức' : 'Nguyễn Thu Hà'}</h3><p>Hẹn xem phòng, hỏi thêm về chỗ ở.</p>
    <div className="mock-contact-links"><a href={`tel:${boss ? '0900000001' : '0900000002'}`}>{boss ? '0900 000 001' : '0900 000 002'} <span aria-hidden="true">↗</span></a><a href={`https://zalo.me/${boss ? '0900000001' : '0900000002'}`} target="_blank" rel="noreferrer">Nhắn Zalo ↗</a></div>
  </div>
}

function RateTable({ upcoming = true, perPerson = false }: { upcoming?: boolean; perPerson?: boolean }) {
  return <div className="mock-rates"><div className="mock-section-title"><h3>Đơn giá rõ ràng</h3><span className="mock-secondary">Đang áp dụng</span></div>
    <dl className="mock-rate-list"><div><dt>Điện · 0–50 kWh</dt><dd>{formatMoney(3000)} / kWh</dd></div><div><dt>Điện · 51–100 kWh</dt><dd>{formatMoney(3500)} / kWh</dd></div><div><dt>Điện · từ 101 kWh</dt><dd>{formatMoney(4000)} / kWh</dd></div>
      <div><dt>Nước</dt><dd>{formatMoney(perPerson ? 80000 : 15000)} / {perPerson ? 'người / kỳ' : 'm³'}</dd></div><div><dt>Wifi</dt><dd>{formatMoney(100000)} / phòng / kỳ</dd></div><div><dt>Rác</dt><dd>{formatMoney(30000)} / người / kỳ</dd></div><div><dt>Gửi xe máy</dt><dd>{formatMoney(100000)} / xe / kỳ</dd></div><div><dt>Gửi xe điện</dt><dd>{formatMoney(150000)} / xe / kỳ</dd></div>
    </dl>{upcoming && <p className="mock-notice">Từ 15/11/2026: Wifi {formatMoney(120000)} / phòng / kỳ.</p>}
  </div>
}

function Home({ listState, retry }: { listState: ListState; retry: () => void }) {
  return <><section className="mock-hero mock-container"><div className="mock-hero-copy"><p className="rooms-eyebrow">Một nhịp sống riêng · Hà Nội</p><h1>Chọn chỗ ở.<br /><em>Bắt đầu an yên.</em></h1><p>Phòng thuê theo tháng, chi phí rõ ràng.<br />Tìm một không gian vừa với cuộc sống của bạn.</p><a className="mock-text-link" href={href('rooms')}>Khám phá phòng trống <span aria-hidden="true">↗</span></a><span className="mock-hero-note">Cầu Giấy · Đống Đa · Hoàng Mai</span></div><figure className="mock-hero-image"><img src="/images/rooms-hanoi-exterior.webp" alt="Chung cư mini tại Hà Nội, ảnh minh họa" /><figcaption>Ở giữa phố, vẫn có một khoảng bình yên.</figcaption></figure></section>
    <div className="mock-container mock-home-search"><RoomSearch districts={['Cầu Giấy', 'Đống Đa', 'Hoàng Mai']} budgets={[{ value: '2300000', label: 'Đến 2.300.000 đ' }, { value: '2600000', label: 'Đến 2.600.000 đ' }]} onSearch={values => { location.href = href('rooms', { district: values.district, maxPrice: values.maxPrice }) }} /></div>
    <section className="mock-container mock-section"><div className="mock-heading-row"><SectionHeading eyebrow="Những lựa chọn mới" description="Những phòng trống có giá vừa được duyệt gần đây.">Một nơi để <em>thuộc về.</em></SectionHeading><a className="mock-text-link" href={href('rooms')}>Xem tất cả phòng ↗</a></div><ListContent state={listState} retry={retry}><div className="mock-cards">{[rooms[4], rooms[3], rooms[2], rooms[1], rooms[0]].map(room => <RoomCard key={room.id} room={room} />)}</div></ListContent></section>
    <section className="mock-district-band"><div className="mock-container"><SectionHeading eyebrow="Gần hơn với nhịp sống của bạn">Bạn muốn ở <em>khu vực nào?</em></SectionHeading><div className="mock-districts">{[{ name: 'Cầu Giấy', count: '01' }, { name: 'Đống Đa', count: '02' }, { name: 'Hoàng Mai', count: '02' }].map(district => <a href={href('rooms', { district: district.name })} key={district.name}><span className="rooms-eyebrow">{district.count} phòng trống</span><h3>{district.name}</h3><span aria-hidden="true">↗</span></a>)}</div></div></section>
  </>
}

function SearchPage({ listState, retry }: { listState: ListState; retry: () => void }) {
  const filtered = rooms.filter(room => (!params.get('district') || params.get('district') === room.district) && (!params.get('ward') || params.get('ward') === room.ward) && (!params.get('buildingId') || params.get('buildingId') === room.building) && (!params.get('minPrice') || room.price >= Number(params.get('minPrice'))) && (!params.get('maxPrice') || room.price <= Number(params.get('maxPrice'))))
  const ordered = params.get('sort') === 'newest' ? [...filtered].reverse() : filtered
  return <main className="mock-container mock-section"><div className="mock-page-intro"><p className="rooms-eyebrow">Phòng trống tại Hà Nội</p><h1>Chỗ ở vừa ý,<br /><em>chi phí vừa tầm.</em></h1><p>Chọn khu vực và khoảng giá để tìm nơi bạn muốn trở về.</p></div><div className="mock-search-layout"><form className="mock-filters" action="preview.html"><input type="hidden" name="screen" value="rooms" /><h2>Tìm phòng</h2>
    <Select label="Quận" name="district" defaultValue={params.get('district') ?? ''}><option value="">Tất cả quận</option>{['Cầu Giấy', 'Đống Đa', 'Hoàng Mai'].map(item => <option key={item}>{item}</option>)}</Select>
    <Select label="Phường" name="ward" defaultValue={params.get('ward') ?? ''}><option value="">Tất cả phường</option>{['Dịch Vọng Hậu', 'Quang Trung', 'Giáp Bát'].map(item => <option key={item}>{item}</option>)}</Select>
    <Select label="Tòa nhà" name="buildingId" defaultValue={params.get('buildingId') ?? ''}><option value="">Tất cả tòa</option><option value="CG01">CG01 · Tòa Cầu Giấy</option><option value="DD01">DD01 · Tòa Đống Đa</option><option value="HM01">HM01 · Tòa Hoàng Mai</option></Select>
    <div className="mock-price-filter"><TextField type="number" min="0" step="100000" inputMode="numeric" label="Giá từ (đ/tháng)" name="minPrice" placeholder="Không giới hạn" defaultValue={params.get('minPrice') ?? ''} /><TextField type="number" min="0" step="100000" inputMode="numeric" label="Giá đến (đ/tháng)" name="maxPrice" placeholder="Không giới hạn" defaultValue={params.get('maxPrice') ?? ''} /></div>
    <Select label="Sắp xếp" name="sort" defaultValue={params.get('sort') ?? 'price'}><option value="price">Giá tăng dần</option><option value="newest">Mới nhất</option></Select><Button type="submit">Áp dụng bộ lọc <span aria-hidden="true">↗</span></Button><a className="mock-text-link" href={href('rooms')}>Xóa bộ lọc</a>
  </form><section aria-label="Kết quả tìm phòng"><div className="mock-results-bar"><strong>{ordered.length} phòng phù hợp</strong><span className="mock-secondary">{params.get('sort') === 'newest' ? 'Mới nhất' : 'Giá tăng dần'}</span></div><ListContent state={ordered.length ? listState : 'empty'} retry={retry}><div className="mock-cards mock-cards-search">{ordered.map(room => <RoomCard key={room.id} room={room} />)}</div></ListContent></section></div></main>
}

function BuildingPage({ listState, retry }: { listState: ListState; retry: () => void }) {
  const building = rooms.find(room => room.building === params.get('building')) ?? rooms[3]
  return <main><section className="mock-container mock-section"><a className="mock-text-link" href={href('rooms')}>← Tất cả phòng trống</a><div className="mock-building-head"><div><p className="rooms-eyebrow">{building.building} · {building.ward}</p><h1>Tòa <em>{building.district}.</em></h1><p>{building.address}, {building.ward}, {building.district}, Hà Nội</p><div className="mock-tags"><span>Chỗ để xe</span><span>Wifi</span><span>Lối đi riêng</span></div></div><img src="/images/rooms-hanoi-exterior.webp" alt={`Mặt ngoài chung cư mini Hà Nội, ảnh minh họa ${building.buildingName}`} /></div><div className="mock-detail-columns"><div><SectionHeading eyebrow="Nhịp sống của khu phố">Gần phố xá,<br /><em>gọn những lo toan.</em></SectionHeading><p>Không gian sống riêng tại {building.district}. Các phòng có đồng hồ điện, nước riêng; xem rõ đơn giá và liên hệ quản lý trước khi đến.</p><RateTable upcoming={building.building === 'CG01'} /></div><Contact boss={building.building === 'HM01'} /></div></section><section className="mock-container mock-section mock-top-line"><SectionHeading eyebrow="Còn trống tại tòa">Chọn một <em>căn phòng.</em></SectionHeading><ListContent state={listState} retry={retry}><div className="mock-cards">{rooms.filter(room => room.building === building.building).map(room => <RoomCard key={room.id} room={room} />)}</div></ListContent></section></main>
}

function ViewingForm() {
  const [date, setDate] = useState('2026-11-03')
  const [sent, setSent] = useState(false)
  return <section id="hen-xem" className="mock-viewing"><p className="rooms-eyebrow">Đến xem trước khi quyết định</p><h2>Hẹn xem <em>phòng.</em></h2><p>Để lại thông tin, quản lý sẽ liên hệ xác nhận lịch hẹn của bạn.</p><form onSubmit={event => { event.preventDefault(); setSent(true) }}><TextField label="Họ và tên" name="guestName" required autoComplete="name" placeholder="Tên của bạn" /><TextField label="Số điện thoại" name="guestPhone" type="tel" inputMode="tel" pattern="0[0-9]{9}" title="Số điện thoại gồm 10 chữ số, bắt đầu bằng 0" required autoComplete="tel" placeholder="0xxxxxxxxx" /><TextField label="Ngày muốn xem" type="date" name="visitDate" min="2026-11-02" max="2026-12-02" required value={date} onChange={event => setDate(event.target.value)} aria-describedby="visit-date-note" /><p id="visit-date-note" className="mock-secondary">Chọn trong 30 ngày tới. Giờ hẹn theo giờ Hà Nội.</p>
    <fieldset className="mock-slots"><legend>Ca xem phòng</legend>{[{ value: 'MORNING', label: 'Sáng (8:00–11:00)' }, { value: 'AFTERNOON', label: 'Chiều (14:00–17:00)' }, { value: 'EVENING', label: 'Tối (18:00–20:00)' }].map(slot => <label key={slot.value}><input type="radio" name="timeSlot" value={slot.value} required disabled={date === '2026-11-02' && slot.value !== 'EVENING'} /><span>{slot.label}</span>{date === '2026-11-02' && slot.value !== 'EVENING' && <small>Đã bắt đầu</small>}</label>)}</fieldset>
    <TextField label="Lời nhắn (không bắt buộc)" name="note" placeholder="Bạn muốn hỏi thêm điều gì?" /><div className="mock-honeypot" aria-hidden="true"><label>Để trống ô này<input name="website" tabIndex={-1} autoComplete="off" /></label></div><Button type="submit">Gửi lịch hẹn <span aria-hidden="true">↗</span></Button><p className="mock-secondary">Gửi lịch hẹn chưa giữ chỗ phòng. Quản lý sẽ gọi lại để xác nhận.</p>{sent && <p role="status" className="mock-notice">Đã xem thử trạng thái gửi. Đây là bản mẫu, lịch hẹn chưa được tạo.</p>}</form></section>
}

function RoomPage() {
  const room = rooms.find(item => item.id === params.get('room')) ?? rooms[3]
  const [perPerson, setPerPerson] = useState(false)
  const costs = perPerson
    ? [{ label: 'Tiền phòng', amount: 2400000 }, { label: 'Wifi · 1 phòng', amount: 100000 }, { label: 'Rác · 1 người', amount: 30000 }, { label: 'Nước · 1 người', amount: 80000 }]
    : [{ label: 'Tiền phòng', amount: 2400000 }, { label: 'Wifi · 1 phòng', amount: 100000 }, { label: 'Rác · 1 người', amount: 30000 }]
  const snapshots: Record<string, { total: number; items: { label: string; amount: number }[] }> = {
    hm101: { total: 2130000, items: [{ label: 'Tiền phòng', amount: 2000000 }, { label: 'Wifi · 1 phòng', amount: 100000 }, { label: 'Rác · 1 người', amount: 30000 }] },
    dd101: { total: 2330000, items: [{ label: 'Tiền phòng', amount: 2200000 }, { label: 'Wifi · 1 phòng', amount: 100000 }, { label: 'Rác · 1 người', amount: 30000 }] },
    dd102: { total: 2430000, items: [{ label: 'Tiền phòng', amount: 2300000 }, { label: 'Wifi · 1 phòng', amount: 100000 }, { label: 'Rác · 1 người', amount: 30000 }] },
    hm201: { total: 2730000, items: [{ label: 'Tiền phòng', amount: 2600000 }, { label: 'Wifi · 1 phòng', amount: 100000 }, { label: 'Rác · 1 người', amount: 30000 }] },
    cg204: { total: perPerson ? 2610000 : 2530000, items: costs },
  }
  return <main><div className="mock-container mock-room-breadcrumb"><a href={href('rooms')}>Tìm phòng</a><span aria-hidden="true">/</span><a href={href('building', { building: room.building })}>{room.buildingName}</a><span aria-hidden="true">/</span><span>Phòng {room.code}</span></div><section className="mock-container"><div className="mock-room-heading"><div><p className="rooms-eyebrow">{room.building} · {room.district}</p><h1>Phòng {room.code}<em>.</em></h1><p>{room.address}, {room.ward}, {room.district}, Hà Nội</p></div><div className="mock-room-price"><StatusBadge tone="available">Trống</StatusBadge><strong>{formatMoney(room.price)}<small>/ tháng</small></strong></div></div><div className="mock-room-photo">{room.noPhoto ? <div className="mock-no-photo"><span aria-hidden="true">▧</span><h2>Chưa có ảnh</h2><p>Bạn có thể hẹn xem để cảm nhận không gian thực tế.</p><a className="mock-text-link" href="#hen-xem">Hẹn xem phòng ↗</a></div> : <img src="/images/rooms-hanoi-room.webp" alt={`Phòng ${room.code}, ảnh không gian minh họa tại Hà Nội`} />}</div><div className="mock-facts"><div><span>Diện tích</span><strong>{room.area} m²</strong></div><div><span>Số người tối đa</span><strong>{room.id === 'hm201' ? '3' : '2'} người</strong></div><div><span>Thời hạn tối thiểu</span><strong>3 tháng</strong></div><div><span>Tiền cọc · 1 tháng</span><strong>{formatMoney(room.price)}</strong></div></div></section>
    <div className="mock-container mock-room-layout mock-section"><div><SectionHeading eyebrow="Không gian của bạn">Gọn gàng để <em>sống thoải mái.</em></SectionHeading><p>Phòng có không gian sinh hoạt riêng. Liên hệ quản lý để xác nhận nội thất và các nhu cầu cụ thể trước khi ký hợp đồng.</p><div className="mock-tags"><span>Điều hòa</span><span>Bình nóng lạnh</span><span>Khu bếp</span></div><RateTable perPerson={perPerson && room.id === 'cg204'} /><Contact boss={room.building === 'HM01'} /><ViewingForm /></div><aside className="mock-estimate"><p className="rooms-eyebrow">Ước tính chi phí / tháng</p><CostBreakdown items={snapshots[room.id].items} total={snapshots[room.id].total} note={perPerson && room.id === 'cg204' ? 'Ước tính cho 1 người. Đã gồm nước theo người; chưa gồm điện – tính theo đồng hồ của phòng.' : 'Ước tính cho 1 người; chưa gồm điện, nước – tính theo đồng hồ của phòng.'} /><p className="mock-notice">Tiền cọc {formatMoney(room.price)} thanh toán khi ký hợp đồng, tách riêng chi phí hàng tháng.</p><p className="mock-secondary">Gửi xe tính theo số xe thực tế, chưa cộng vào ước tính.</p>{room.id === 'cg204' && <><p className="mock-secondary">Chưa gồm: Vệ sinh hành lang (chưa có giá).</p><div className="mock-preview-case"><Checkbox label="Xem mẫu nước theo người" checked={perPerson} onChange={event => setPerPerson(event.target.checked)} /><p>Trường hợp minh họa: 80.000 đ/người/kỳ. Seed hiện tại tính nước theo m³.</p></div></>}</aside></div></main>
}

const gridRooms: { code: string; floor: number; status: string; tone: 'available' | 'occupied' | 'reserved' | 'maintenance'; price: number | null; locked?: boolean; expired?: boolean }[] = [
  { code: '203', floor: 2, status: 'Đang thuê', tone: 'occupied', price: 2500000 },
  { code: '204', floor: 2, status: 'Trống', tone: 'available', price: 2400000, expired: true },
  { code: '301', floor: 3, status: 'Trống', tone: 'available', price: null },
  { code: '302', floor: 3, status: 'Đã cọc', tone: 'reserved', price: 2600000 },
  { code: '401', floor: 4, status: 'Bảo trì', tone: 'maintenance', price: 2800000 },
  { code: '402', floor: 4, status: 'Trống', tone: 'available', price: 2800000, locked: true },
]

function GridPage({ listState, retry, showNotice }: { listState: ListState; retry: () => void; showNotice: () => void }) {
  const [includeLocked, setIncludeLocked] = useState(false)
  const [selected, setSelected] = useState('204')
  const current = gridRooms.find(room => room.code === selected) ?? gridRooms[1]
  return <div><div className="mock-staff-title"><div><p className="rooms-eyebrow">Quản lý không gian</p><h1>Phòng</h1><p>CG01 · Tòa Cầu Giấy</p></div><Button onClick={showNotice}>Thêm phòng <span aria-hidden="true">+</span></Button></div><div className="mock-grid-toolbar"><div className="mock-grid-legend"><StatusBadge tone="available">Trống</StatusBadge><StatusBadge tone="occupied">Đang thuê</StatusBadge><StatusBadge tone="reserved">Đã cọc</StatusBadge><StatusBadge tone="maintenance">Bảo trì</StatusBadge></div><Checkbox label="Hiện phòng đã khóa" checked={includeLocked} onChange={event => { setIncludeLocked(event.target.checked); if (!event.target.checked && selected === '402') setSelected('204') }} /></div>
    <div className="mock-floor-layout"><ListContent state={listState} retry={retry}><section aria-label="Lưới phòng theo tầng" className="mock-floor-grid">{[4, 3, 2].map(floor => <div className="mock-floor" key={floor}><h2>Tầng {floor}</h2><div className="mock-floor-rooms">{gridRooms.filter(room => room.floor === floor && (!room.locked || includeLocked)).map(room => <button key={room.code} type="button" className={`mock-floor-room mock-floor-room--${room.tone}${selected === room.code ? ' is-selected' : ''}${room.locked ? ' is-locked' : ''}`} aria-pressed={selected === room.code} onClick={() => setSelected(room.code)}><span className="mock-floor-number">{room.code}<span aria-hidden="true">↗</span></span><StatusBadge tone={room.tone}>{room.status}</StatusBadge><strong>{room.price === null ? 'Chưa có giá' : formatMoney(room.price)}</strong>{room.expired && <span className="mock-floor-extra">Đề xuất giá: Quá hạn</span>}{room.locked && <span className="mock-floor-extra">Đã khóa</span>}</button>)}</div></div>)}</section></ListContent><aside className="mock-room-inspector"><div className="mock-section-title"><h2>Phòng {current.code}</h2><StatusBadge tone={current.tone}>{current.status}</StatusBadge></div><p>Tòa Cầu Giấy · Tầng {current.floor}</p><dl className="mock-rate-list"><div><dt>Giá hiện tại</dt><dd>{current.price === null ? 'Chưa có giá' : formatMoney(current.price)}</dd></div><div><dt>Diện tích</dt><dd>{current.code === '301' ? '20' : '22'} m²</dd></div><div><dt>Số người tối đa</dt><dd>2 người</dd></div></dl>{current.code === '301' && <p className="mock-notice">Chưa công khai: phòng chưa có giá được duyệt.</p>}{current.expired && <div className="mock-notice"><StatusBadge tone="reserved">Quá hạn</StatusBadge><p>Đề xuất {formatMoney(2520000)} từ 01/11/2026 đã quá hạn.</p><Button variant="outline" onClick={showNotice}>Đề xuất lại</Button></div>}{current.locked && <p className="mock-notice">Phòng đã khóa, không xuất hiện trong danh sách công khai.</p>}<div className="mock-inspector-actions"><Button variant="outline" onClick={showNotice}>Sửa thông tin</Button><Button onClick={showNotice}>Đề xuất giá</Button></div></aside></div><p className="mock-data-note">Dữ liệu xem bố cục: phòng 203, 204, 301 theo seed; 302, 401, 402 bổ sung để xem trạng thái Đã cọc, Bảo trì và Đã khóa.</p></div>
}

function ElectricComparison({ different = false }: { different?: boolean }) {
  if (different) return <div className="mock-tier-pair"><div><h3>Hiện tại · 3 bậc</h3><dl className="mock-rate-list"><div><dt>0–50 kWh</dt><dd>{formatMoney(3000)}</dd></div><div><dt>51–100 kWh</dt><dd>{formatMoney(3500)}</dd></div><div><dt>Từ 101 kWh</dt><dd>{formatMoney(4000)}</dd></div></dl></div><div><h3>Đề xuất · 2 bậc</h3><dl className="mock-rate-list"><div><dt>0–100 kWh</dt><dd>{formatMoney(3500)}</dd></div><div><dt>Từ 101 kWh</dt><dd>{formatMoney(4200)}</dd></div></dl></div><p className="mock-secondary">Khác số bậc: hiển thị hai bảng, không so sánh phần trăm.</p></div>
  return <div className="mock-tier-table"><table><caption>Đơn giá điện theo bậc (đ/kWh)</caption><thead><tr><th scope="col">Bậc</th><th scope="col">Hiện tại</th><th scope="col">Đề xuất</th><th scope="col">Thay đổi</th></tr></thead><tbody>{[{ range: '0–50', old: 3000, next: 3200, percent: '+6,7%' }, { range: '51–100', old: 3500, next: 3700, percent: '+5,7%' }, { range: '101+', old: 4000, next: 4200, percent: '+5,0%' }].map(tier => <tr key={tier.range}><th scope="row">{tier.range}<small>kWh</small></th><td>{formatMoney(tier.old)}</td><td><strong>{formatMoney(tier.next)}</strong></td><td>{tier.percent}</td></tr>)}</tbody></table></div>
}

function ApprovalCard({ proposal, act }: { proposal: Approval; act: (proposal: Approval, reject: boolean) => void }) {
  return <article className={`mock-approval-card${proposal.expired ? ' is-expired' : ''}`}><div className="mock-approval-meta"><span className="rooms-eyebrow">{proposal.building}</span><StatusBadge tone={proposal.expired ? 'maintenance' : 'reserved'}>{proposal.expired ? 'Quá hạn' : 'Chờ duyệt'}</StatusBadge></div><h2>{proposal.title}</h2><p className="mock-secondary">Nguyễn Thu Hà đề xuất · Áp dụng từ {proposal.date}</p><p>{proposal.reason}</p>{proposal.kind === 'single' ? <div className="mock-price-change"><div><span>{proposal.old === undefined ? 'Giá mới' : 'Hiện tại'}</span><strong>{proposal.old === undefined ? '—' : formatMoney(proposal.old)}</strong></div><span aria-hidden="true">→</span><div><span>Đề xuất</span><strong>{formatMoney(proposal.next ?? 0)}</strong></div>{proposal.percent && <span className="mock-percent">{proposal.percent}</span>}</div> : <ElectricComparison different={proposal.kind === 'different'} />}{proposal.supersedes && <p className="mock-notice">{proposal.supersedes}</p>}{proposal.expired && <p className="mock-notice">Đã qua ngày áp dụng. Cần quản lý đề xuất lại để duyệt.</p>}<div className="mock-approval-actions"><Button variant="outline" onClick={() => act(proposal, true)}>Từ chối</Button>{!proposal.expired && <Button onClick={() => act(proposal, false)}>Duyệt {proposal.kind === 'single' ? 'giá' : 'đơn giá'} <span aria-hidden="true">✓</span></Button>}</div></article>
}

function ApprovalPage({ listState, retry, act, buildingFilter }: { listState: ListState; retry: () => void; act: (proposal: Approval, reject: boolean) => void; buildingFilter: string }) {
  const filtered = approvals.filter(proposal => !buildingFilter || proposal.building.startsWith(buildingFilter))
  return <div><div className="mock-staff-title"><div><p className="rooms-eyebrow">Dành cho chủ nhà</p><h1>Duyệt giá</h1><p>Đối chiếu trước khi giá mới có hiệu lực.</p></div><StatusBadge tone="reserved">{filtered.filter(proposal => !proposal.expired).length} đề xuất chờ duyệt</StatusBadge></div><ListContent state={filtered.length ? listState : 'empty'} retry={retry}><section aria-label="Đề xuất còn hạn"><div className="mock-approval-list">{filtered.filter(proposal => !proposal.expired).map(proposal => <ApprovalCard key={proposal.id} proposal={proposal} act={act} />)}</div></section>{filtered.some(proposal => proposal.expired) && <section className="mock-expired-section"><div className="mock-section-title"><h2>Đề xuất quá hạn</h2><StatusBadge tone="maintenance">1 đề xuất</StatusBadge></div><p>Không thể duyệt khi ngày áp dụng đã qua. Bạn vẫn có thể từ chối kèm ghi chú.</p>{filtered.filter(proposal => proposal.expired).map(proposal => <ApprovalCard key={proposal.id} proposal={proposal} act={act} />)}</section>}</ListContent></div>
}

export default function App() {
  const [listState, setListState] = useState<ListState>('data')
  const dialog = useRef<HTMLDialogElement>(null)
  const [dialogAction, setDialogAction] = useState<{ proposal?: Approval; reject?: boolean }>({})
  const [message, setMessage] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('')
  const staff = screen === 'grid' || screen === 'approval'
  const retry = () => { if (screen === 'rooms' && location.search !== href('rooms')) location.href = href('rooms'); else setListState('data') }
  const act = (proposal: Approval, reject: boolean) => { setDialogAction({ proposal, reject }); dialog.current?.showModal() }
  const showNotice = () => { setDialogAction({}); dialog.current?.showModal() }
  const currentScreen = screenOptions.find(item => item.value === screen) ?? screenOptions[0]
  return <div className="rooms-theme p2-mockup"><a href="#noi-dung" className="mock-skip-link">Đến nội dung chính</a><div className="mock-preview-toolbar"><div><strong>Bản xem trước · Phòng</strong><span>Dữ liệu minh họa · 02/11/2026, 15:00 (Hà Nội)</span></div><label>Màn hình<select value={screen} onChange={event => { location.href = href(event.target.value as Screen) }}>{screenOptions.map(item => <option key={item.value} value={item.value}>{item.label} · {item.route}</option>)}</select></label><label>Trạng thái danh sách<select value={listState} onChange={event => setListState(event.target.value as ListState)}><option value="data">Có dữ liệu</option><option value="loading">Đang tải</option><option value="empty">Trống</option><option value="error">Lỗi</option></select></label></div>
    <RoomsHeader logoSrc="/images/rooms-logo.webp" homeHref={href('home')} links={staff ? [{ label: 'Phòng', href: href('grid') }, { label: 'Duyệt giá', href: href('approval') }] : [{ label: 'Trang chủ', href: href('home') }, { label: 'Tìm phòng', href: href('rooms') }, { label: 'Tòa Cầu Giấy', href: href('building') }]} action={<Button variant="outline" onClick={showNotice}>{staff ? 'Chủ nhà · Minh Đức' : 'Đăng nhập'}</Button>} />
    <div id="noi-dung" tabIndex={-1}>{staff ? <div className="mock-staff-shell">
      <aside className="mock-sidebar"><p className="rooms-eyebrow">Không gian quản lý</p>
        <Select label="Tòa nhà" name="staffBuilding" defaultValue={screen === 'grid' ? 'CG01' : ''} value={screen === 'approval' ? buildingFilter : undefined} onChange={setBuildingFilter}>
          {screen !== 'grid' && <option value="">Tất cả tòa</option>}
          <option value="CG01">CG01 · Tòa Cầu Giấy</option>
          {screen !== 'grid' && <><option value="DD01">DD01 · Tòa Đống Đa</option><option value="HM01">HM01 · Tòa Hoàng Mai</option></>}
        </Select>
        <nav aria-label="Quản lý phòng và giá"><a href={href('grid')} aria-current={screen === 'grid' ? 'page' : undefined}><span aria-hidden="true">▦</span>Phòng</a><a href={href('approval')} aria-current={screen === 'approval' ? 'page' : undefined}><span aria-hidden="true">↗</span>Duyệt giá <small>5</small></a></nav>
        <p className="mock-sidebar-note">Giá chỉ đổi sau khi được duyệt.<br />Giá hợp đồng đang thuê được giữ nguyên.</p>
      </aside>
      <main className="mock-staff-content">{screen === 'grid' ? <GridPage listState={listState} retry={retry} showNotice={showNotice} /> : <ApprovalPage listState={listState} retry={() => { setBuildingFilter(''); retry() }} act={act} buildingFilter={buildingFilter} />}</main>
    </div> : screen === 'home' ? <Home listState={listState} retry={retry} /> : screen === 'rooms' ? <SearchPage listState={listState} retry={retry} /> : screen === 'building' ? <BuildingPage listState={listState} retry={retry} /> : <RoomPage />}</div>
    {!staff && <RoomsFooter description="Phòng thuê tại Hà Nội. Một nơi ở, một nhịp sống riêng." contact={<a href="tel:0900000001">0900 000 001 · Liên hệ chủ nhà</a>} links={[{ label: 'Tìm phòng', href: href('rooms') }, { label: 'Tòa Cầu Giấy', href: href('building') }]} />}
    <p className="mock-preview-footnote">Bản mẫu {currentScreen.route} · Ảnh Hà Nội có sẵn chỉ để minh họa. Không kết nối API, không ghi dữ liệu.</p>
    {message && <div className="mock-feedback" role="status"><p>{message}</p><Button variant="outline" onClick={() => setMessage('')}>Đóng thông báo</Button></div>}
    <dialog ref={dialog} className="mock-dialog" aria-labelledby="dialog-title"><form onSubmit={event => { event.preventDefault(); dialog.current?.close(); setMessage('Đã xem thử thao tác. Bản mẫu không thay đổi dữ liệu hay giá.') }}><p className="rooms-eyebrow">{dialogAction.proposal ? 'Xác nhận đối chiếu' : 'Bản mẫu bố cục'}</p><h2 id="dialog-title">{dialogAction.proposal ? dialogAction.reject ? 'Từ chối đề xuất?' : 'Duyệt giá mới?' : 'Xem trước giao diện'}</h2>{dialogAction.proposal ? <><p>{dialogAction.proposal.title} · {dialogAction.proposal.building}</p>{dialogAction.proposal.kind === 'single' ? <p className="mock-dialog-amount">{formatMoney(dialogAction.proposal.next ?? 0)}</p> : <ElectricComparison different={dialogAction.proposal.kind === 'different'} />}<p>Áp dụng từ {dialogAction.proposal.date}.</p>{!dialogAction.reject && dialogAction.proposal.supersedes && <p className="mock-notice">{dialogAction.proposal.supersedes}</p>}{dialogAction.reject && <TextField label="Lý do từ chối" name="reviewNote" required autoFocus placeholder="Nhập ghi chú cho quản lý" />}</> : <p>Thao tác này sẽ được nối với luồng thật ở phần triển khai. Bạn có thể xem sáu màn hình bằng bộ chọn ở đầu trang.</p>}<div className="mock-dialog-actions"><Button variant="outline" onClick={() => dialog.current?.close()}>Quay lại</Button>{dialogAction.proposal && <Button type="submit">{dialogAction.reject ? 'Xác nhận từ chối' : 'Xác nhận duyệt'}</Button>}</div></form></dialog>
  </div>
}

