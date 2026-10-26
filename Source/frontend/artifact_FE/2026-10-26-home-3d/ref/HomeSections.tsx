import { useState } from 'react'
import { Reveal, RoomsButton, SectionHeading } from '../../../src/components'
import { formatMoney } from '../../../src/shared/formatters'
import { buildings, allRooms, districtOrder, featuredIds } from './sample-data'
import { Arrow, Pin, SearchChart, Key, Star } from './icons'

const available = [...allRooms.values()].filter(({ room }) => room.available)
const tabs = districtOrder.filter(name => buildings.some(building => building.district === name))
const rank = (id: string) => { const i = featuredIds.indexOf(id); return i < 0 ? 99 : i }

// "Danh sách phòng trống hôm nay": district tabs and three cards; the button opens the room on the 3D model.
export function RoomList({ onOpenRoom }: { onOpenRoom: (buildingId: string, roomId: string) => void }) {
  const [district, setDistrict] = useState('')
  const pool = available.filter(item => !district || item.building.district === district).sort((a, b) => rank(a.room.id) - rank(b.room.id))
  const count = (name: string) => available.filter(item => item.building.district === name).length
  return <section className="home-sec home-sec--paper" id="phong-trong" aria-labelledby="home-rooms-title">
    <div className="home-head">
      <Reveal>
        <SectionHeading eyebrow="Căn hộ dịch vụ sẵn sàng bàn giao" description="Đầy đủ nội thất cao cấp: sofa mây indochine, tủ lạnh Inverter, giường nệm cao su non, bếp từ âm.">
          <span id="home-rooms-title">Danh sách phòng trống hôm nay</span>
        </SectionHeading>
      </Reveal>
      <div className="home-tabs" role="group" aria-label="Lọc phòng theo quận">
        <button type="button" className="home-tab" aria-pressed={district === ''} onClick={() => setDistrict('')}>Tất cả ({available.length})</button>
        {tabs.map(name => <button key={name} type="button" className="home-tab" aria-pressed={district === name} onClick={() => setDistrict(name)}>{name} ({count(name)})</button>)}
      </div>
    </div>
    <ul className="home-grid">
      {pool.slice(0, 3).map(({ room, building }, i) => <li key={room.id}>
        <Reveal delay={i * 0.06} className="home-card home-room">
          <figure>
            <img src={room.image} alt={`${room.card.title}, phòng ${room.code}`} loading="lazy" decoding="async" />
            <span className="home-room-tag"><i aria-hidden="true" />Phòng trống • P.{room.code}</span>
            <p className="home-room-price">{formatMoney(room.price)}<small>/tháng</small></p>
          </figure>
          <div className="home-room-body">
            <p className="home-meta">{building.name} {building.id} • Tầng {room.floor}</p>
            <h3>{room.card.title}</h3>
            <dl className="home-specs">{room.card.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <ul className="home-chips">{room.card.chips.map(chip => <li key={chip}>{chip}</li>)}</ul>
            <RoomsButton className="home-room-cta" onClick={() => onOpenRoom(building.id, room.id)}>Đặt hẹn xem phòng</RoomsButton>
          </div>
        </Reveal>
      </li>)}
    </ul>
    {pool.length > 3 && <p className="home-more"><a href={district ? `/phong?district=${encodeURIComponent(district)}` : '/phong'}>Xem tất cả {pool.length} phòng trống <Arrow /></a></p>}
  </section>
}

// "Khu vực tòa nhà tiêu biểu": one card per building; opening it flies the 3D model to that building.
export function Areas({ onOpenBuilding }: { onOpenBuilding: (buildingId: string) => void }) {
  return <section className="home-sec" id="khu-vuc" aria-labelledby="home-areas-title">
    <div className="home-head">
      <Reveal>
        <SectionHeading eyebrow="Vị trí đắc địa Hà Nội" description="Được tuyển chọn theo tiêu chí: ngõ rộng thông thoáng, gần ga tàu điện và trục giao thông chính.">
          <span id="home-areas-title">Khu vực tòa nhà tiêu biểu</span>
        </SectionHeading>
      </Reveal>
      <a className="home-link" href="/phong">Xem tất cả tòa nhà trên bản đồ <span aria-hidden="true">↗</span></a>
    </div>
    <ul className="home-grid">
      {buildings.map((building, i) => {
        const free = building.rooms.filter(room => room.available)
        return <li key={building.id}>
          <Reveal delay={i * 0.06} className="home-card home-area">
            <figure>
              <img src={building.image} alt={`Minh họa khu phố quanh ${building.name}`} loading="lazy" decoding="async" />
              <span className="home-area-tag">Quận {building.district}</span>
            </figure>
            <div className="home-area-body">
              <h3><button type="button" className="home-area-open" onClick={() => onOpenBuilding(building.id)}>{building.areaTitle}<span className="home-sr"> · xem {building.name} trên mô hình 3D</span></button></h3>
              <p>{building.description}</p>
              <div className="home-area-foot">
                <span>Quy mô: 1 tòa • {building.rooms.length} phòng</span>
                <span>Từ {formatMoney(Math.min(...free.map(room => room.price)))} / tháng</span>
              </div>
            </div>
          </Reveal>
        </li>
      })}
    </ul>
  </section>
}

const steps = [
  { title: 'Chọn phòng & Xem 3D', text: 'Xem đầy đủ ảnh thực tế, video tour, hướng phòng, diện tích và mô phỏng vị trí từng tầng trên hệ thống ROOMS trực tuyến.', icon: <SearchChart /> },
  { title: 'Đặt lịch xem thực tế', text: 'Lên lịch trong 30 giây. Quản lý đón tiếp trực tiếp tại sảnh tòa nhà, kiểm tra chất lượng nội thất và trải nghiệm không gian sống.', icon: <Pin /> },
  { title: 'Ký hợp đồng & Nhận phòng', text: 'Hợp đồng điện tử minh bạch, cài đặt mã vân tay cửa chính và nhận phòng trong ngày. Có đội ngũ hỗ trợ kỹ thuật xuyên suốt thời gian thuê.', icon: <Key /> },
]
export function Steps() {
  return <section className="home-sec home-sec--cream home-center" id="quy-trinh" aria-labelledby="home-steps-title">
    <Reveal>
      <SectionHeading eyebrow="Minh bạch & thuận tiện" description="Từ lúc lướt chọn đến khi dọn va li vào ở chỉ trong vòng 24 giờ làm việc.">
        <span id="home-steps-title">Quy trình thuê phòng 3 bước</span>
      </SectionHeading>
    </Reveal>
    <ol className="home-grid">
      {steps.map((step, i) => <li key={step.title}>
        <Reveal delay={i * 0.06} className="home-card home-step">
          <div className="home-step-top"><span className={i === 2 ? 'home-step-no is-gold' : 'home-step-no'}>{String(i + 1).padStart(2, '0')}</span><span className="home-step-icon">{step.icon}</span></div>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </Reveal>
      </li>)}
    </ol>
  </section>
}

const reviews = [
  { name: 'Minh Nhật', initials: 'MN', role: 'Senior Product Designer • Thuê 14 tháng', text: 'Mình chuyển từ căn hộ chung cư lớn sang studio tại Láng Hạ vì muốn tối ưu chi phí mà vẫn giữ được sự chỉn chu. Ban công đón nắng sáng rất dễ chịu, cách âm tốt nên tối làm việc online cực kỳ tập trung.' },
  { name: 'Thu Hằng', initials: 'TH', role: 'Chuyên viên Kiểm toán • Căn hộ Đội Cấn', text: 'Điểm mình ưng nhất là sự minh bạch. Tiền điện nước có công tơ chụp ảnh gửi qua app hàng tháng, không bị cảnh phát sinh tiền vô lý như các khu nhà trọ trước đây từng ở. Bác quản lý tòa nhà rất lịch sự.' },
  { name: 'Quang Dũng', initials: 'QD', role: 'Kỹ sư phần mềm FPT • Căn hộ Duy Tân', text: 'Mô hình xem 3D trực quan trước khi đến xem thực tế giúp mình tiết kiệm rất nhiều thời gian. Đến xem thực tế phòng y hệt như hình, máy giặt riêng trong phòng nên rất tiện sinh hoạt cá nhân.' },
]
export function Reviews() {
  return <section className="home-sec home-sec--paper home-center" aria-labelledby="home-reviews-title">
    <Reveal>
      <SectionHeading eyebrow="Chia sẻ từ cư dân"><span id="home-reviews-title">Trải nghiệm sống an tĩnh giữa phố</span></SectionHeading>
    </Reveal>
    <ul className="home-grid">
      {reviews.map((review, i) => <li key={review.name}>
        <Reveal delay={i * 0.06} className="home-card home-review">
          <p className="home-stars" role="img" aria-label="5 trên 5 sao">{Array.from({ length: 5 }, (_, k) => <Star key={k} />)}</p>
          <blockquote><p>“{review.text}”</p></blockquote>
          <footer><span className="home-avatar" aria-hidden="true">{review.initials}</span><span><strong>{review.name}</strong><small>{review.role}</small></span></footer>
        </Reveal>
      </li>)}
    </ul>
  </section>
}
