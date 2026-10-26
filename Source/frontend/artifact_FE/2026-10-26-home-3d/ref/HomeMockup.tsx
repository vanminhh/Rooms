import { useState } from 'react'
import { RoomsHeader, Reveal } from '../../../src/components'
import { useReducedMotion } from '../../../src/components/useReducedMotion'
import BuildingPicker from './BuildingPicker'
import type { PickerRequest } from './BuildingPicker'
import { RoomList, Areas, Steps, Reviews } from './HomeSections'
import { ContactCta, HomeFooter } from './HomeFooter'
import { Arrow, Icon } from './icons'

const reasons = [
  { title: 'Giá rõ ràng', text: 'Thông tin minh bạch, không phát sinh chi phí.', icon: <Icon><ellipse cx="16" cy="9" rx="8" ry="3.5" /><path d="M8 9v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V9M8 14v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5M8 19v4c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-4" /></Icon> },
  { title: 'Đặt lịch xem', text: 'Dễ dàng đặt lịch và được hỗ trợ nhanh chóng.', icon: <Icon><rect x="5" y="7" width="22" height="20" rx="2" /><path d="M5 13h22M11 4v6M21 4v6" /><circle cx="11" cy="18" r=".8" /><circle cx="16" cy="18" r=".8" /><circle cx="21" cy="18" r=".8" /><circle cx="11" cy="22.5" r=".8" /><circle cx="16" cy="22.5" r=".8" /></Icon> },
  { title: 'Không gian riêng', text: 'Phòng đầy đủ tiện ích, thoải mái như ở nhà.', icon: <Icon><path d="M4.5 15.5 16 6l11.5 9.5M8 13v13h16V13M13.5 26v-8h5v8" /></Icon> },
  { title: 'Kết nối thuận tiện', text: 'Gần các tuyến đường chính, dễ di chuyển khắp Hà Nội.', icon: <Icon><path d="M16 28s-8-7.2-8-14a8 8 0 0 1 16 0c0 6.8-8 14-8 14z" /><circle cx="16" cy="14" r="3" /></Icon> },
]

export default function HomeMockup() {
  const reduce = useReducedMotion()
  const [request, setRequest] = useState<PickerRequest>()
  // Cards in the lists below open the same building or room on the 3D model and scroll up to it.
  const open = (buildingId: string, roomId?: string) => {
    setRequest(previous => ({ buildingId, roomId, n: (previous?.n ?? 0) + 1 }))
    document.getElementById('chon-phong')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
  }
  return <div className="rooms-theme home">
    <p className="home-bar">Bản mockup trang chủ có mô hình 3D · tòa, phòng, giá, nhận xét, số liên hệ và ảnh là dữ liệu minh họa, chưa nối API</p>

    <section className="home-hero" aria-labelledby="home-title">
      <RoomsHeader logoSrc="/images/rooms-logo.webp" links={[
        { label: 'Tìm phòng', href: '#chon-phong' }, { label: 'Khu vực', href: '#khu-vuc' },
        { label: 'Giới thiệu', href: '#gioi-thieu' }, { label: 'Liên hệ', href: '#lien-he' },
      ]} action={<a className="rooms-button rooms-button--primary" href="/dang-nhap">Đăng nhập</a>} />
      <picture className="home-hero-photo">
        <img src="/images/rooms-hanoi-exterior.webp" alt="Mặt tiền một tòa chung cư mini có trụ gạch và ban công cây xanh trong ngõ Hà Nội" />
      </picture>
      <div className="home-hero-copy">
        <Reveal><p className="home-eyebrow">Phòng thuê tại Hà Nội</p></Reveal>
        <Reveal delay={0.08}><h1 id="home-title">Một nơi ở<br />vừa vặn giữa phố.</h1></Reveal>
        <Reveal delay={0.16}><p className="home-lead">Khám phá phòng thuê phù hợp với nhịp sống của bạn.</p></Reveal>
        <Reveal delay={0.24}>
          <div className="home-actions">
            <a className="rooms-button rooms-button--primary" href="#chon-phong">Tìm phòng trống <Arrow /></a>
            <a className="rooms-button rooms-button--outline" href="#khu-vuc">Xem khu vực</a>
          </div>
        </Reveal>
      </div>
    </section>

    <section className="home-why" id="gioi-thieu" aria-labelledby="home-why-title">
      <Reveal>
        <h2 id="home-why-title"><span className="home-orn" aria-hidden="true" />Vì sao chọn ROOMS?<span className="home-orn" aria-hidden="true" /></h2>
      </Reveal>
      <ul className="home-why-list">
        {reasons.map((item, i) => <li key={item.title}>
          <Reveal delay={i * 0.06}>
            <span className="home-why-icon">{item.icon}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </Reveal>
        </li>)}
      </ul>
    </section>

    <BuildingPicker request={request} />
    <RoomList onOpenRoom={open} />
    <Areas onOpenBuilding={id => open(id)} />
    <Steps />
    <Reviews />
    <div className="home-dark">
      <ContactCta />
      <HomeFooter />
    </div>
  </div>
}
