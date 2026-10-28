import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { RoomsButton, RoomsHeader, RoomsFooter, SectionHeading, StatusBadge, RoomSearch, RoomAccordion, ImageJourney, FeatureList, FloorPlan, QuoteCarousel, CostBreakdown, Reveal, SmoothScroll, Preloader, TextField, PasswordField, Checkbox, FormError, Spinner } from '../components'
import type { JourneySlide, RoomCardData, RoomFeature, PlanArea } from '../components'
import { formatMoney } from '../shared/formatters'

const exterior = '/images/rooms-hanoi-exterior.webp'
const interior = '/images/rooms-hanoi-room.webp'
const logo = '/images/rooms-logo.webp'
const sections = [
  ['foundation', 'Nền tảng'], ['search', 'Tìm phòng'], ['rooms', 'Thẻ phòng'],
  ['journey', 'Ảnh chiều sâu'], ['features', 'Tiện ích'], ['plan', 'Mặt bằng'],
  ['quotes', 'Chia sẻ'], ['cost', 'Bảng chi phí'], ['motion', 'Chuyển động'], ['form', 'Biểu mẫu'], ['footer', 'Footer'],
]
const slides: JourneySlide[] = [
  { image: exterior, depth: '/images/rooms-hanoi-exterior-depth.webp', eyebrow: '01 / Từ ngõ nhỏ', title: 'Bước chậm lại.\nThấy mình ở nhà.', description: 'Một khoảng xanh giữa nhịp phố. Một lối về dành riêng cho bạn.' },
  { image: interior, depth: '/images/rooms-hanoi-room-depth.webp', eyebrow: '02 / Đến không gian riêng', title: 'Đủ gần phố.\nĐủ riêng cho mình.', description: 'Ánh sáng, chất liệu ấm và một căn phòng vừa vặn với nhịp sống.' },
]
const rooms: RoomCardData[] = [
  { id: 'studio-01', name: 'Studio Ánh Sáng', image: interior, metadata: '28 m² · 1–2 người · Cửa sổ lớn', description: 'Nắng ghé qua khung cửa, một góc nhỏ để nghỉ ngơi và bắt đầu những điều mới.', price: 4500000 },
  { id: 'studio-02', name: 'Studio An Yên', image: '/images/rooms-danang-room.webp', metadata: '32 m² · 1–2 người · Bếp riêng', description: 'Không gian gọn gàng, có chỗ cho bữa tối và những buổi sáng thong thả.', price: 5200000 },
  { id: 'studio-03', name: 'Studio Ban Công', image: '/images/rooms-saigon-room.webp', metadata: '35 m² · 1–2 người · Ban công', description: 'Một góc sống mở, nơi bạn có thể đặt thêm cây xanh và thói quen yêu thích.', price: 5800000 },
]
const features: RoomFeature[] = [
  { id: 'light', title: 'Sống cùng ánh sáng', description: 'Không gian mở, chất liệu ấm, vừa đủ để thấy dễ chịu.', image: interior },
  { id: 'green', title: 'Một khoảng xanh riêng', description: 'Chậm lại một nhịp khi bước qua cửa.', image: exterior },
  { id: 'home', title: 'Vừa vặn mỗi ngày', description: 'Một góc nấu ăn, làm việc và nghỉ ngơi.', image: '/images/rooms-danang-room.webp' },
]
const areas: PlanArea[] = [
  { id: 'living', name: 'Không gian sống', description: 'Khu ngủ và làm việc trong sơ đồ mẫu.', image: interior, path: 'M25 25H315V305H25Z', labelX: 170, labelY: 165 },
  { id: 'kitchen', name: 'Bếp', description: 'Vị trí bếp minh họa, có thể thay bằng mặt bằng thực tế.', image: '/images/rooms-danang-room.webp', path: 'M335 25H575V175H335Z', labelX: 455, labelY: 100 },
  { id: 'entry', name: 'Lối vào', description: 'Khu vực vào phòng trong sơ đồ mẫu.', image: interior, path: 'M335 195H575V305H335Z', labelX: 455, labelY: 250 },
  { id: 'balcony', name: 'Khoảng xanh', description: 'Không gian ngoài trời minh họa.', image: exterior, path: 'M25 325H575V435H25Z', labelX: 300, labelY: 380 },
]
const quotes = [
  { quote: 'Một căn phòng tốt là nơi những điều bình thường nhất cũng trở nên dễ chịu.', author: 'Nội dung mẫu · Tinh thần Rooms' },
  { quote: 'Có ánh sáng bên cửa sổ, có một khoảng lặng cho riêng mình. Vậy là đủ để bắt đầu.', author: 'Nội dung mẫu · Không gian sống' },
  { quote: 'Từ một nơi để ở, thành một nơi để trở về.', author: 'Nội dung mẫu · Cảm hứng thiết kế' },
]

function Sample({ id, number, name, hint, code, children }: { id: string; number: string; name: string; hint: string; code: string; children: ReactNode }) {
  return <section id={id} className="preview-section">
    <div className="preview-section-label"><span>{number} / {name}</span><p>{hint}</p></div>
    {children}
    <details className="preview-code"><summary>Cách dùng component <span aria-hidden="true">+</span></summary><pre><code>{code}</code></pre></details>
  </section>
}

export default function ComponentPreview() {
  const [feedback, setFeedback] = useState('Thử chọn khu vực, thẻ phòng hoặc các nút bên dưới.')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [signingIn, setSigningIn] = useState(false)
  const [signInError, setSignInError] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const signInTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])
  useEffect(() => () => clearTimeout(signInTimer.current), [])
  const showPreloader = () => {
    clearInterval(timer.current)
    let value = 0
    setProgress(0)
    setLoading(true)
    timer.current = setInterval(() => {
      value = Math.min(100, value + 10)
      setProgress(value)
      if (value === 100) { clearInterval(timer.current); setLoading(false) }
    }, 150)
  }
  const submitDemoForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (signingIn) return
    setSigningIn(true)
    setSignInError(false)
    signInTimer.current = setTimeout(() => {
      setSigningIn(false)
      setSignInError(true)
      setFeedback('Đây là bản xem thử: biểu mẫu chưa gọi API đăng nhập.')
    }, 1200)
  }
  return <div className="rooms-theme rooms-preview" id="top">
    <a className="preview-skip" href="#library">Đến bộ component</a>
    <SmoothScroll>
      <RoomsHeader homeHref="#top" logoSrc={logo} links={[{ label: 'Thư viện', href: '#library' }, { label: 'Không gian', href: '#journey' }, { label: 'Cách dùng', href: '#usage' }]} action={<RoomsButton variant="outline" onClick={showPreloader}>Thử mở Rooms <span aria-hidden="true">↗</span></RoomsButton>} />
      <div className="preview-intro">
        <div><span className="rooms-eyebrow">Rooms / Component collection / 02</span><h1>Những mảnh ghép<br />của <em>một nơi ở.</em></h1><p>Tinh thần An Lâm, trong hình hài Rooms. Một bộ component để bạn ghép nên giao diện Trọ Thông Minh.</p><div className="preview-intro-meta"><span>20 component</span><i /><span>React + TypeScript</span><i /><span>Chuột · Cảm ứng · Bàn phím</span></div></div>
        <figure><img src={exterior} alt="Tòa nhà với ban công xanh trong bộ ảnh Rooms" /><figcaption><span>Chất liệu có sẵn, câu chuyện mới.</span><span>Hà Nội / 01</span></figcaption></figure>
      </div>
      <div className="preview-shell" id="library">
        <aside className="preview-sidebar"><span className="rooms-eyebrow">Mục lục</span><nav aria-label="Danh mục component">{sections.map(([id, label], i) => <a key={id} href={`#${id}`}><span>{String(i + 1).padStart(2, '0')}</span>{label}</a>)}</nav><p>Giá, diện tích, nội dung và mặt bằng đều là dữ liệu minh họa.</p></aside>
        <main>
          <Sample id="foundation" number="01" name="Nền tảng giao diện" hint="Logo · RoomsButton · SectionHeading · StatusBadge · RoomsHeader" code={'import { RoomsButton, SectionHeading, StatusBadge, RoomsHeader } from "./components"\n\n<div className="rooms-theme">\n  <RoomsButton onClick={handleSelect}>Xem phòng ↗</RoomsButton>\n  <StatusBadge tone="available">Còn trống</StatusBadge>\n</div>'}>
            <Reveal><SectionHeading eyebrow="Cảm hứng An Lâm">Vẫn ấm áp.<br /><em>Gần hơn với đời sống.</em></SectionHeading></Reveal>
            <div className="preview-palette">{[['#153d36', 'Xanh trầm'], ['#f8f2e6', 'Cát ấm'], ['#aa7d45', 'Vàng đất'], ['#efe8d4', 'Kem nhạt']].map(([color, label]) => <div key={color}><i style={{ background: color }} /><span>{label}<small>{color}</small></span></div>)}</div>
            <figure className="preview-logo"><img src={logo} width="1275" height="1233" loading="lazy" alt="Logo Rooms Apartments: cửa sổ vòm xanh trầm viền vàng với chiếc chìa khóa ở giữa" /><figcaption><span className="rooms-eyebrow">Logo thương hiệu</span><h3>Rooms <em>Apartments</em></h3><p>Cửa sổ vòm và chiếc chìa khóa, cùng bảng màu xanh trầm và vàng đất của bộ giao diện. Header và màn chờ dùng phần cửa sổ vòm và chìa khóa (<code>logoSrc</code> của <code>RoomsHeader</code> và <code>Preloader</code>); footer chưa dùng.</p></figcaption></figure>
            <div className="preview-button-row"><RoomsButton onClick={() => setFeedback('Đã nhấn nút chính — bạn có thể truyền onClick để mở chi tiết phòng.')}>Khám phá phòng ↗</RoomsButton><RoomsButton variant="outline" onClick={() => setFeedback('Đã nhấn nút viền — hành động do trang sử dụng component quyết định.')}>Tìm hiểu thêm</RoomsButton><RoomsButton disabled>Chưa khả dụng</RoomsButton></div>
            <div className="preview-badges"><StatusBadge>Còn trống</StatusBadge><StatusBadge tone="occupied">Đang thuê</StatusBadge><StatusBadge tone="reserved">Đã giữ chỗ</StatusBadge><StatusBadge tone="maintenance">Bảo trì</StatusBadge></div>
          </Sample>
          <Sample id="search" number="02" name="Tìm phòng" hint="RoomSearch · Chọn quận và ngân sách, gửi dữ liệu qua onSearch." code={'<RoomSearch\n  districts={["Ba Đình", "Cầu Giấy"]}\n  budgets={[{ value: "5000000", label: "Đến 5 triệu" }]}\n  onSearch={({ district, maxPrice }) => searchRooms({ district, maxPrice })}\n/>'}>
            <SectionHeading eyebrow="Một nơi phù hợp">Bắt đầu từ điều bạn cần.</SectionHeading>
            <RoomSearch districts={['Ba Đình', 'Cầu Giấy', 'Tây Hồ']} budgets={[{ value: '5000000', label: 'Đến 5 triệu' }, { value: '7000000', label: 'Đến 7 triệu' }]} onSearch={({ district, maxPrice }) => setFeedback(`Đã nhận bộ lọc: ${district || 'Tất cả quận'} · ${maxPrice ? `Đến ${formatMoney(Number(maxPrice))}/tháng` : 'Mọi ngân sách'}. Đây là bản xem thử, chưa gọi API.`)} />
          </Sample>
          <Sample id="rooms" number="03" name="Thẻ phòng mở rộng" hint="RoomAccordion · Rê chuột, chạm hoặc dùng Tab để chọn một phòng." code={'<RoomAccordion rooms={rooms} onSelect={(room) => openRoom(room.id)} />\n// rooms: { id, name, image, description, metadata, price }[]'}>
            <SectionHeading eyebrow="Một góc sống của riêng bạn" description="Giữ chuyển động mở rộng của thẻ villa An Lâm, chuyển nội dung sang phòng thuê theo tháng.">Chọn một nhịp sống.</SectionHeading>
            <RoomAccordion rooms={rooms} onSelect={(room) => setFeedback(`Đã chọn ${room.name} (${room.id}). Gắn onSelect với trang chi tiết khi ghép vào ứng dụng.`)} />
          </Sample>
          <Sample id="journey" number="04" name="Hành trình ảnh 3D" hint="ImageJourney · Di chuyển chuột và cuộn qua hai không gian." code={'<ImageJourney slides={[{\n  image: "/images/rooms-hanoi-exterior.webp",\n  depth: "/images/rooms-hanoi-exterior-depth.webp",\n  eyebrow: "01 / Chào Rooms",\n  title: "Một nơi để trở về.",\n  description: "Khoảng xanh giữa lòng phố."\n}]} />'}>
            <ImageJourney slides={slides} />
          </Sample>
          <Sample id="features" number="05" name="Danh sách tiện ích" hint="FeatureList · Ảnh đi theo chuột, nội dung thay khi chọn từng mục." code={'<FeatureList items={features} />\n// features: { id, title, description, image }[]'}>
            <SectionHeading eyebrow="Những điều nhỏ, vừa đủ">Ở dễ chịu.<br /><em>Sống nhẹ nhàng.</em></SectionHeading>
            <FeatureList items={features} />
          </Sample>
          <Sample id="plan" number="06" name="Mặt bằng tương tác" hint="FloorPlan · Chọn từng vùng bằng chuột, cảm ứng hoặc bàn phím." code={'<FloorPlan areas={areas} viewBox="0 0 600 460" />\n// areas: { id, name, description, image, path, labelX, labelY }[]'}>
            <SectionHeading eyebrow="Hiểu không gian trước khi đến">Mỗi góc, một công năng.</SectionHeading>
            <FloorPlan areas={areas} />
          </Sample>
          <Sample id="quotes" number="07" name="Chia sẻ dạng trình chiếu" hint="QuoteCarousel · Chuột và chạm chuyển nhẹ; bàn phím đổi ngay. Không tự chạy." code={'<QuoteCarousel quotes={[{ quote: "Một nơi để trở về.", author: "Tên người chia sẻ" }]} />'}>
            <QuoteCarousel quotes={quotes} />
          </Sample>
          <Sample id="cost" number="08" name="Bảng chi phí" hint="CostBreakdown · Chỉ trình bày số tiền đã nhận, không tính hóa đơn." code={'<CostBreakdown\n  items={invoice.items}\n  total={invoice.total}\n  note="Số tiền do hệ thống cung cấp."\n/>'}>
            <CostBreakdown items={[{ label: 'Tiền phòng', amount: 4500000 }, { label: 'Internet', amount: 100000 }, { label: 'Dịch vụ chung', amount: 150000 }]} total={4750000} note="Ví dụ trình bày · Không phải báo giá. Chưa gồm điện, nước. Khi dùng thật, nhận từng khoản và tổng tiền từ backend." />
          </Sample>
          <Sample id="motion" number="09" name="Chuyển động & mở đầu" hint="Reveal · SmoothScroll · Preloader · Tôn trọng tùy chọn giảm chuyển động." code={'<SmoothScroll>\n  <Reveal><SectionHeading>Chào Rooms.</SectionHeading></Reveal>\n</SmoothScroll>\n<Preloader visible={isLoading} progress={progress} />'}>
            <Reveal><div className="preview-motion-card"><span className="rooms-eyebrow">Nhẹ vừa đủ để cảm nhận</span><h3>Mượt mà,<br /><em>không vội vàng.</em></h3><p>Hiệu ứng hiện khi cuộn đang được dùng trong trang này. Nút bên dưới mở bản xem thử màn hình chờ.</p><RoomsButton onClick={showPreloader}>Xem preloader <span aria-hidden="true">↗</span></RoomsButton></div></Reveal>
          </Sample>
          <Sample id="form" number="10" name="Biểu mẫu" hint="TextField · PasswordField · Checkbox · FormError · Spinner · Nhãn, chữ lỗi và viền focus cho bàn phím." code={'<form onSubmit={handleSubmit(onSubmit)}>\n  <FormError>{apiError?.message}</FormError>\n  <TextField label="Số điện thoại" type="tel" autoComplete="tel" {...register("phone")} error={errors.phone?.message} />\n  <PasswordField label="Mật khẩu" autoComplete="current-password" {...register("password")} error={errors.password?.message} />\n  <Checkbox label="Ghi nhớ đăng nhập" {...register("remember")} />\n  <RoomsButton type="submit" disabled={isSubmitting}>{isSubmitting && <Spinner label="Đang đăng nhập" />}Đăng nhập</RoomsButton>\n</form>'}>
            <form className="preview-form" noValidate onSubmit={submitDemoForm}>
              <FormError>{signInError && 'Số điện thoại hoặc mật khẩu không đúng'}</FormError>
              <TextField label="Số điện thoại" type="tel" inputMode="numeric" autoComplete="tel" />
              <PasswordField label="Mật khẩu" autoComplete="current-password" />
              <Checkbox label="Ghi nhớ đăng nhập" />
              <RoomsButton type="submit" disabled={signingIn}>{signingIn && <Spinner label="Đang đăng nhập" />}Đăng nhập</RoomsButton>
            </form>
            <div className="preview-form-states">
              <TextField label="Số điện thoại" defaultValue="0912" error="Số điện thoại gồm 10 chữ số, bắt đầu bằng 0" />
              <TextField label="Ô bị khóa" defaultValue="Không nhập được" disabled />
              <Spinner label="Đang tải" />
            </div>
          </Sample>
          <Sample id="footer" number="11" name="Chân trang Rooms" hint="RoomsFooter · Nội dung liên hệ và các liên kết truyền từ bên ngoài." code={'<RoomsFooter\n  description="Không gian để thuộc về."\n  contact={<a href="/lien-he">Liên hệ Rooms ↗</a>}\n  links={[{ label: "Tìm phòng", href: "/phong" }]}\n/>'}>
            <RoomsFooter description="Từ một căn phòng vừa vặn, đến một nhịp sống của riêng bạn." contact={<a href="#search">Khám phá không gian ↗</a>} links={[{ label: 'Tìm phòng', href: '#search' }, { label: 'Tiện ích', href: '#features' }, { label: 'Về đầu trang ↑', href: '#top' }]} />
          </Sample>
          <section id="usage" className="preview-usage"><span className="rooms-eyebrow">Sẵn sàng để ghép trang</span><h2>Import. Truyền dữ liệu.<br /><em>Đặt vào giao diện của bạn.</em></h2><p>Component nằm ở <code>src/components</code>. Bao vùng sử dụng bằng <code>rooms-theme</code> để áp dụng màu, font và kiểu hiển thị. Xem README trong thư mục để biết props và phần chuyển từ An Lâm.</p><pre><code>{'import { RoomsButton } from "./components"\n\n<div className="rooms-theme">\n  <RoomsButton onClick={handleSelect}>Xem phòng ↗</RoomsButton>\n</div>'}</code></pre></section>
        </main>
      </div>
      <div className="preview-feedback" role="status" aria-live="polite"><span className="preview-feedback-dot" /><p>{feedback}</p></div>
      <Preloader visible={loading} progress={progress} logoSrc={logo} />
    </SmoothScroll>
  </div>
}
