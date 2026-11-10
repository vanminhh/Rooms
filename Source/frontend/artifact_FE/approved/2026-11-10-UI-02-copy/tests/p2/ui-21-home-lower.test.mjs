import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// From the main app this is Source/frontend; from a draft folder each file is read from the draft when the draft has it.
const testRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const frontendRoot = existsSync(resolve(testRoot, 'package.json')) ? testRoot : resolve(testRoot, '..', '..')
const readSource = path => readFileSync(existsSync(resolve(testRoot, path)) ? resolve(testRoot, path) : resolve(frontendRoot, path), 'utf8')
const page = readSource('src/pages/public/PublicHomePage.tsx')
const card = readSource('src/features/public/RoomCard.tsx')
const css = readSource('src/features/public/home-lower.css')
const publicLayout = readSource('src/layouts/PublicLayout.tsx')

test('UI-21/UI-02: phần dưới trang chủ dùng đủ câu chữ đã duyệt, không còn cam kết mẫu Stitch', () => {
  for (const text of [
    'Vì sao chọn ROOMS?', 'Tìm phòng, xem thông tin và đặt lịch trên cùng một nơi.',
    'Thông tin giá rõ ràng', 'Đặt lịch xem thuận tiện', 'Thông tin theo từng phòng', 'Liên hệ thuận tiện',
    'Tìm và xem phòng trong 3 bước', 'Chọn phòng phù hợp với bạn',
  ]) assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const forbidden of ['Không phí ẩn', '24/7', 'trong 15 phút', 'Xem 3D', 'Hợp đồng điện tử']) {
    assert.doesNotMatch(page, new RegExp(forbidden))
  }
})

test('UI-21/PUB-01: phòng nổi bật giữ dữ liệu API, tiền qua formatMoney và CTA tới chi tiết phòng', () => {
  assert.match(page, /listFeaturedRooms/)
  assert.match(page, /ctaLabel="Đặt hẹn xem phòng"/)
  assert.match(card, /formatMoney\(room\.price\)/)
  assert.match(card, /to={`\/phong\/\${room\.id}`}/)
  assert.match(card, /<dt>Diện tích<\/dt>/)
  assert.match(card, /<dt>Tầng<\/dt>/)
  assert.match(card, /Chưa có ảnh/)
})

test('UI-21/BLD-05/KIT-11: khu vực có id đích, số phòng API, ảnh minh họa đúng ba quận và URL lọc', () => {
  assert.match(page, /id="khu-vuc"/)
  assert.match(page, /item\.roomCount} phòng trống/)
  assert.match(page, /new URLSearchParams\({ district }\)/)
  for (const image of ['area-lang-ha.webp', 'area-ba-dinh.webp', 'area-cau-giay.webp']) assert.match(page, new RegExp(image))
  assert.match(page, /<IllustrationLabel \/>/)
})

test('UI-21/BLD-04/UI-03: liên hệ lấy từ API và có đủ tải, lỗi, trống, có dữ liệu', () => {
  assert.match(page, /usePublicContact\(\)/)
  assert.match(page, /contact\.isPending/)
  assert.match(page, /contact\.isError/)
  assert.match(page, /contact\.isSuccess && !phone && !zalo/)
  assert.match(page, /href={`tel:\${phone}`}/)
  assert.match(page, /to="\/phong"/)
  assert.match(page, /id="dat-lich"/)
})

test('UI-40/UI-01: "Liên hệ" targets only the public footer, so the home page has no second id="lien-he"', () => {
  assert.doesNotMatch(page, /id="lien-he"/)
  assert.match(publicLayout, /<RoomsFooter id="lien-he"/)
})

test('UI-21/KIT-05: CSS đáp ứng 360 px, focus từ kit, hover theo khả năng và giảm chuyển động', () => {
  assert.match(css, /@media \(max-width: 679px\)/)
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.doesNotMatch(css, /100vh|user-scalable\s*=\s*no|maximum-scale\s*=\s*1/)
  assert.doesNotMatch(css, /calc\(50%\s*-\s*50vw\)|calc\(50%\s*-\s*50dvw\)/)
  assert.match(css, /clip-path: inset\(0 -100vmax\)/)
})

