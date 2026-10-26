import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Reveal } from '../../../src/components'
import { buildings } from './sample-data'
import { Chat, Headset, Shield } from './icons'

type Errors = { name?: string; phone?: string }

// Contact form of the reference design. It is not the viewing form of VIEW-01 (no room, date or time slot): see REVIEW.md.
export function ContactCta() {
  const uid = useId()
  const [values, setValues] = useState({ name: '', phone: '', building: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [done, setDone] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: Errors = {}
    if (values.name.trim().length < 2) next.name = 'Vui lòng nhập họ và tên.'
    if (!/^0\d{9}$/.test(values.phone.replace(/\s/g, ''))) next.phone = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.'
    setErrors(next)
    setDone(Object.keys(next).length === 0)
  }
  const change = (key: keyof typeof values) => (event: { target: { value: string } }) => { setValues(current => ({ ...current, [key]: event.target.value })); setDone(false) }
  return <section className="home-cta" id="dang-ky" aria-labelledby="home-cta-title">
    <Reveal className="home-cta-box">
      <div className="home-cta-copy">
        <p className="rooms-eyebrow">Khám phá không gian thực tế</p>
        <h2 id="home-cta-title">Bạn đã sẵn sàng tìm tổ ấm mới?</h2>
        <p>Để lại thông tin hoặc gọi hotline quản lý tòa nhà để nhận video tour chi tiết và giữ lịch xem phòng hoàn toàn miễn phí.</p>
        <p className="home-cta-contact"><a href="tel:0900000000"><Headset />Hotline 24/7: 0900 000 000</a><a href="https://zalo.me/0900000000"><Chat />Zalo Official: @rooms.example</a></p>
      </div>
      <form className="home-form" onSubmit={submit} noValidate aria-labelledby={`${uid}-title`}>
        <h3 id={`${uid}-title`}>Đăng ký xem phòng nhanh</h3>
        <label className="home-field">
          <span className="home-sr">Họ và tên của bạn</span>
          <input type="text" name="name" autoComplete="name" placeholder="Họ và tên của bạn" value={values.name} onChange={change('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? `${uid}-name` : undefined} />
        </label>
        {errors.name && <p className="home-error" id={`${uid}-name`}>{errors.name}</p>}
        <label className="home-field">
          <span className="home-sr">Số điện thoại / Zalo</span>
          <input type="tel" name="phone" autoComplete="tel" inputMode="numeric" placeholder="Số điện thoại / Zalo" value={values.phone} onChange={change('phone')} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? `${uid}-phone` : undefined} />
        </label>
        {errors.phone && <p className="home-error" id={`${uid}-phone`}>{errors.phone}</p>}
        <label className="home-field">
          <span className="home-sr">Tòa nhà bạn quan tâm</span>
          <select name="building" value={values.building} onChange={change('building')}>
            <option value="">Chọn tòa nhà bạn quan tâm</option>
            {buildings.map(building => <option key={building.id} value={building.id}>{building.name} · {building.district}</option>)}
          </select>
        </label>
        <button type="submit" className="rooms-button rooms-button--primary">Nhận tư vấn trong 15 phút</button>
        <p className="home-form-note" role="status">{done ? 'Bản mockup: thông tin hợp lệ, chưa gửi đi đâu.' : 'Thông tin của bạn được bảo mật tuyệt đối.'}</p>
      </form>
    </Reveal>
  </section>
}

export function HomeFooter() {
  return <footer className="home-footer" id="lien-he">
    <div className="home-footer-grid">
      <div>
        <p className="home-footer-brand">ROOMS <span>Boutique Living</span></p>
        <p>Hệ thống chung cư mini và căn hộ dịch vụ thiết kế phong cách Modern Indochine tại các quận nội thành trọng điểm Hà Nội. Không gian sống an tĩnh, bảo chứng tiện nghi và minh bạch giá trị.</p>
        <p className="home-footer-promise"><Shield />Bảo đảm 100% không phụ phí ẩn</p>
      </div>
      <nav aria-label="Khu vực trọng điểm">
        <h2>Khu vực trọng điểm</h2>
        <ul>{buildings.map(building => <li key={building.id}><a href="#khu-vuc">{building.name} · {building.district}</a></li>)}</ul>
      </nav>
      <nav aria-label="Dịch vụ">
        <h2>Trực giác &amp; Dịch vụ</h2>
        <ul>
          <li><a href="#chon-phong">Khám phá không gian 3D</a></li>
          <li><a href="#dang-ky">Đặt lịch xem phòng trực tiếp</a></li>
          <li><a href="#quy-trinh">Quy trình thuê phòng</a></li>
          <li><a href="#gioi-thieu">Vì sao chọn ROOMS</a></li>
        </ul>
      </nav>
      <div>
        <h2>Tư vấn &amp; Hỗ trợ</h2>
        <dl className="home-footer-contact">
          <div><dt>Hotline 24/7</dt><dd><a href="tel:0900000000">0900 000 000</a></dd></div>
          <div><dt>Văn phòng điều hành</dt><dd>Hà Nội (địa chỉ minh họa)</dd></div>
          <div><dt>Hộp thư điện tử</dt><dd>lienhe@rooms.example</dd></div>
        </dl>
      </div>
    </div>
    <div className="home-footer-bottom">
      <span>© 2026 ROOMS Apartments. Hệ thống căn hộ dịch vụ cao cấp Hà Nội. Tất cả quyền được bảo lưu.</span>
      <span><a href="#lien-he">Chính sách hợp đồng</a><a href="#lien-he">Bảo mật thông tin</a><a href="#quy-trinh">Quy trình nhận phòng</a></span>
    </div>
  </footer>
}
