import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { IllustrationLabel, RoomSearch, SectionHeading } from '../../components'
import type { RoomSearchValues } from '../../components'
import { usePublicContact } from '../../features/auth/usePublicContact'
import { listFeaturedRooms, listPublicLocations, publicQueryKeys } from '../../features/public/api'
import type { PublicLocation } from '../../features/public/api'
import { ListState } from '../../features/public/ListState'
import { RoomCard } from '../../features/public/RoomCard'
import '../../features/public/home-lower.css'

const budgets = [
  { value: '2000000', label: 'Đến 2.000.000 đ' },
  { value: '3000000', label: 'Đến 3.000.000 đ' },
  { value: '4000000', label: 'Đến 4.000.000 đ' },
  { value: '5000000', label: 'Đến 5.000.000 đ' },
  { value: '5000000+', label: 'Trên 5.000.000 đ' },
]

const reasons = [
  { number: '01', title: 'Thông tin giá rõ ràng', body: 'Xem giá thuê, chi phí ước tính và đơn giá công khai trước khi đặt lịch.', note: 'Xem chi phí trước khi đặt lịch' },
  { number: '02', title: 'Đặt lịch xem thuận tiện', body: 'Chọn ngày và buổi xem phù hợp; yêu cầu được gửi tới quản lý tòa nhà để xác nhận.', note: 'Chọn Sáng, Chiều hoặc Tối' },
  { number: '03', title: 'Thông tin theo từng phòng', body: 'Xem ảnh phòng, diện tích, sức chứa, nội thất và chi phí của từng phòng.', note: 'Dữ liệu riêng cho từng phòng' },
  { number: '04', title: 'Liên hệ thuận tiện', body: 'Xem địa chỉ tòa nhà và liên hệ trực tiếp với người quản lý phụ trách.', note: 'Gọi điện hoặc liên hệ Zalo' },
]

const steps = [
  { number: '01', title: 'Chọn phòng phù hợp', body: 'Xem ảnh, giá, diện tích, nội thất và chi phí ước tính của phòng.' },
  { number: '02', title: 'Đặt lịch xem trực tiếp', body: 'Chọn ngày, buổi xem và để lại thông tin liên hệ. Quản lý tòa nhà sẽ xác nhận lịch hẹn.' },
  { number: '03', title: 'Đến xem phòng theo lịch hẹn', body: 'Kiểm tra phòng thực tế và trao đổi trực tiếp với quản lý tòa nhà.' },
]

const districtImages: Record<string, string> = {
  'Đống Đa': '/images/area-lang-ha.webp',
  'Ba Đình': '/images/area-ba-dinh.webp',
  'Cầu Giấy': '/images/area-cau-giay.webp',
}

function roomsSearch({ district, maxPrice }: RoomSearchValues): string {
  const params = new URLSearchParams()
  if (district) params.set('district', district)
  if (maxPrice === '5000000+') params.set('minPrice', '5000000')
  else if (maxPrice) params.set('maxPrice', maxPrice)
  return params.toString()
}

function districtHref(district: string) {
  return { pathname: '/phong', search: new URLSearchParams({ district }).toString() }
}

function DistrictCard({ item }: { item: PublicLocation }) {
  const image = districtImages[item.district]
  return <Link className="public-district" to={districtHref(item.district)}>
    <span className={`public-district-media${image ? '' : ' public-district-media--empty'}`}>
      {image
        ? <><img src={image} alt={`Khu vực minh họa tại ${item.district}`} /><IllustrationLabel /></>
        : <span>Chưa có ảnh minh họa</span>}
    </span>
    <span className="public-district-copy">
      <span className="rooms-eyebrow">{item.roomCount} phòng trống</span>
      <strong>{item.district}</strong>
      <span>Xem phòng tại khu vực <span aria-hidden="true">→</span></span>
    </span>
  </Link>
}

export function PublicHomePage() {
  const navigate = useNavigate()
  const featured = useQuery({ queryKey: publicQueryKeys.featured, queryFn: listFeaturedRooms })
  const locations = useQuery({ queryKey: publicQueryKeys.locations, queryFn: listPublicLocations })
  const contact = usePublicContact()
  const availableRoomCount = locations.data?.reduce((sum, item) => sum + item.roomCount, 0)
  const districtCount = locations.data?.length
  const wardCount = locations.data?.reduce((sum, item) => sum + item.wards.length, 0)
  const statValue = (value: number | undefined) => locations.isError ? '—' : value ?? '…'
  const phone = contact.data?.phone || null
  const zalo = contact.data?.zaloUrl?.startsWith('https://') ? contact.data.zaloUrl : null

  return <>
    <section className="public-hero" aria-labelledby="public-home-title">
      <div className="public-hero-copy">
        <p className="rooms-eyebrow">Phòng thuê tại Hà Nội</p>
        <h1 id="public-home-title">Một nơi ở <em>vừa vặn</em> giữa phố.</h1>
        <p className="public-hero-intro">Khám phá phòng thuê tại Hà Nội với thông tin rõ ràng về giá, diện tích và tiện ích. Chọn phòng phù hợp và đặt lịch xem trực tiếp.</p>
        <Link className="public-hero-link" to="/phong">Tìm phòng trống <span aria-hidden="true">→</span></Link>
        <dl className="public-hero-stats" aria-label="Số liệu phòng trống">
          <div><dt>{statValue(availableRoomCount)}</dt><dd>Phòng · Đang trống</dd></div>
          <div><dt>{statValue(districtCount)}</dt><dd>Quận · Đang có phòng cho thuê</dd></div>
          <div><dt>{statValue(wardCount)}</dt><dd>Phường · Đang có phòng cho thuê</dd></div>
        </dl>
      </div>
      <div className="public-hero-visual">
        <img className="public-hero-image" src="/images/hero-building.webp" alt="Tòa nhà minh họa cho phòng thuê ROOMS tại Hà Nội" />
        <IllustrationLabel />
        <div className="public-hero-availability" aria-live="polite">
          <span aria-hidden="true" />
          <p><strong>{availableRoomCount === undefined ? 'Đang cập nhật' : `Còn ${availableRoomCount} phòng trống`}</strong><small>Thông tin từ danh sách phòng công khai</small></p>
        </div>
      </div>
    </section>

    <div className="public-search">
      <RoomSearch districts={locations.data?.map(item => item.district) ?? []} budgets={budgets}
        districtLabel="Quận / Khu vực" budgetLabel="Khoảng giá" submitLabel="Lọc phòng trống"
        onSearch={values => navigate({ pathname: '/phong', search: roomsSearch(values) })} />
    </div>

    <section className="public-lower-section public-reasons" aria-labelledby="public-reasons-title">
      <div className="public-centered-heading">
        <p className="rooms-eyebrow">Thông tin để bạn chủ động lựa chọn</p>
        <h2 id="public-reasons-title">Vì sao chọn ROOMS?</h2>
        <p>Tìm phòng, xem thông tin và đặt lịch trên cùng một nơi.</p>
      </div>
      <div className="public-reason-grid">
        {reasons.map(reason => <article className="public-reason-card" key={reason.number}>
          <span className="public-card-number" aria-hidden="true">{reason.number}</span>
          <h3>{reason.title}</h3><p>{reason.body}</p><small>{reason.note}</small>
        </article>)}
      </div>
    </section>

    <section className="public-section public-featured" aria-label="Phòng nổi bật">
      <SectionHeading eyebrow="Phòng vừa cập nhật" description="Những phòng trống có giá vừa được duyệt gần đây.">Phòng nổi bật</SectionHeading>
      <p className="public-section-link"><Link to="/phong">Xem tất cả phòng trống</Link></p>
      <ListState status={featured.status} error={featured.error} isEmpty={!featured.data?.length}
        loadingLabel="Đang tải danh sách phòng" emptyTitle="Chưa có phòng trống nào"
        emptyHint={<Link to="/phong">Xem tất cả phòng trống</Link>} onRetry={() => void featured.refetch()}>
        <div className="public-grid">
          {featured.data?.map(room => <RoomCard key={room.id} room={room} ctaLabel="Đặt hẹn xem phòng" />)}
        </div>
      </ListState>
    </section>

    <section id="khu-vuc" className="public-section public-areas" aria-label="Khu vực">
      <SectionHeading eyebrow="Khu vực có phòng trống" description="Số phòng được cập nhật từ danh sách công khai.">Chọn khu vực phù hợp</SectionHeading>
      <ListState status={locations.status} error={locations.error} isEmpty={!locations.data?.length}
        loadingLabel="Đang tải danh sách phòng" emptyTitle="Chưa có phòng trống nào"
        emptyHint={<Link to="/phong">Xem tất cả phòng trống</Link>} onRetry={() => void locations.refetch()}>
        <div className="public-districts">{locations.data?.map(item => <DistrictCard key={item.district} item={item} />)}</div>
      </ListState>
    </section>

    <section className="public-lower-section public-process" aria-labelledby="public-process-title">
      <div className="public-centered-heading">
        <p className="rooms-eyebrow">Các bước xem phòng</p>
        <h2 id="public-process-title">Tìm và xem phòng trong 3 bước</h2>
        <p>Từ danh sách phòng trống đến lịch hẹn xem trực tiếp.</p>
      </div>
      <ol className="public-step-grid">
        {steps.map(step => <li key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}
      </ol>
    </section>

    <section id="dat-lich" className="public-contact-cta" aria-labelledby="public-contact-title">
      <div>
        <p className="rooms-eyebrow">Đặt lịch xem phòng</p>
        <h2 id="public-contact-title">Chọn phòng phù hợp với bạn</h2>
        <p>Xem danh sách phòng trống, chọn phòng và gửi yêu cầu đặt lịch.</p>
        <div className="public-contact-lines" aria-live="polite">
          {contact.isPending && <span role="status">Đang tải thông tin liên hệ</span>}
          {contact.isError && <span role="alert">Chưa tải được thông tin liên hệ. <button type="button" onClick={() => void contact.refetch()}>Thử lại</button></span>}
          {contact.isSuccess && !phone && !zalo && <span>Thông tin liên hệ đang được cập nhật.</span>}
          {phone && <a href={`tel:${phone}`}>Gọi {phone}</a>}
          {zalo && <a href={zalo} target="_blank" rel="noopener noreferrer">Liên hệ Zalo</a>}
        </div>
      </div>
      <div className="public-contact-action">
        <p className="rooms-eyebrow">Xem phòng trống</p>
        <p>Chọn theo khu vực và khoảng giá phù hợp.</p>
        <Link to="/phong">Tìm phòng trống <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  </>
}
