# Rooms — bộ component từ An Lâm

15 component React/TypeScript dùng cho Trọ Thông Minh. Giữ sắc cát ấm, xanh trầm, chữ Taviraj/Manrope và các chuyển động của An Lâm; thay nội dung villa bằng phòng thuê theo tháng.

Đây là **giao diện chính thức của frontend** (chủ dự án chốt ngày 25/10/2026). Luật dùng bộ component: `docs/spec/31-ui-kit.md`.

## Mở trang xem thử

Chạy trong `D:\rooms\Source\frontend`:

```powershell
npm install
npm run dev
```

Mở đường dẫn `/components.html` trên địa chỉ Vite in ra. Trang `/` là khung trống của Trọ Thông Minh (trang resort cũ đã xóa ngày 25/10/2026). `npm run build` xuất cả hai HTML vào `dist`.

## Bản đồ tệp

| Tệp | Mục đích |
|---|---|
| `components.html` | Điểm vào riêng của trang xem thử, kèm font và tiêu đề Rooms |
| `src/component-preview.tsx` · `src/component-preview.css` | Mount gallery bằng React StrictMode · bố cục riêng của trang xem thử |
| `src/pages/ComponentPreview.tsx` | Hiển thị từng component, dữ liệu mẫu, thao tác thử và ví dụ sử dụng |
| `src/components/index.ts` | Export component, kiểu dữ liệu và nạp CSS |
| `src/components/rooms.css` | Token, kiểu giao diện và responsive, giới hạn trong `.rooms-theme` |
| `src/components/Button.tsx` | Nút chính, nút viền và nút nền cát có hiệu ứng theo chuột |
| `src/components/Navigation.tsx` | Header có menu di động và footer Rooms |
| `src/components/SectionHeading.tsx` | Tiêu đề, nhãn và mô tả nhất quán |
| `src/components/StatusBadge.tsx` | Nhãn trạng thái có màu và chữ rõ ràng |
| `src/components/RoomSearch.tsx` | Form chọn quận và ngân sách, trả dữ liệu qua callback |
| `src/components/RoomAccordion.tsx` | Danh sách thẻ phòng mở rộng theo lựa chọn |
| `src/components/ImageJourney.tsx` · `depth-scene.ts` · `journey-frame.ts` | Ảnh 3D theo cuộn và ảnh tĩnh dự phòng · shader chiều sâu Three.js · chọn cặp ảnh chuyển cảnh |
| `src/components/FeatureList.tsx` | Danh sách tiện ích và ảnh thay đổi theo mục chọn |
| `src/components/FloorPlan.tsx` | Sơ đồ SVG chọn được bằng chuột, chạm và bàn phím |
| `src/components/QuoteCarousel.tsx` | Chuyển lời chia sẻ có điều khiển rõ ràng |
| `src/components/CostBreakdown.tsx` | Hiển thị các khoản và tổng tiền có sẵn |
| `src/components/effects.tsx` | Reveal, cuộn mượt và preloader do trang cha điều khiển |
| `src/components/useReducedMotion.ts` | Theo dõi tùy chọn giảm chuyển động và dọn listener |
| `src/shared/formatters.ts` | Định dạng tiền VND dùng chung |
| `public/images/rooms-*.webp` | Ảnh gallery (bản WebP nhẹ) và 2 bản đồ chiều sâu `*-depth.webp` của ảnh Hà Nội; ảnh PNG gốc `mini-*.png` vẫn giữ |
| `tests/*.test.mjs` | 14 test Node: chuyển cảnh, định dạng tiền, WebGL, giảm chuyển động, tương tác (`npm run test:components`) |
| `vite.config.ts` | Build đồng thời `index.html` và `components.html` |

## Dùng trong một trang

```tsx
import { RoomsButton, RoomAccordion } from './components'
import type { RoomCardData } from './components'

const rooms: RoomCardData[] = [{
  id: '101', name: 'Studio 101', image: '/images/rooms-hanoi-room.webp',
  metadata: '28 m² · Cửa sổ lớn', description: 'Không gian sống của bạn.',
  price: 4500000,
}]

export default function RoomsPage() {
  return <main className="rooms-theme">
    <RoomAccordion rooms={rooms} onSelect={(room) => console.log(room.id)} />
    <RoomsButton variant="outline" onClick={() => history.back()}>Quay lại</RoomsButton>
  </main>
}
```

Import từ `index.ts` tự tải `rooms.css`. CSS được giới hạn trong vùng `.rooms-theme`; thêm class này vào vùng chứa component. Nạp font Taviraj và Manrope bằng thẻ font trong `components.html` khi ghép vào HTML khác. Có font hệ thống dự phòng khi mất mạng.

## Danh sách và props

| Component | Props chính | Chuyển từ An Lâm |
|---|---|---|
| `RoomsHeader` | `links: {label, href}[]`, `action?`, `homeHref?`, `logoSrc?` | Header, tên Rooms, menu di động; `logoSrc` hiện biểu tượng cửa vòm + chìa khóa cạnh chữ ROOMS |
| `RoomsFooter` | `description`, `contact: ReactNode`, `links?` | Footer xanh trầm |
| `RoomsButton` | Props button HTML, `variant: primary/sand/outline`, `magnetic?` | Nút hút theo chuột |
| `SectionHeading` | `children`, `eyebrow?`, `description?` | Tiêu đề serif, chữ nghiêng |
| `StatusBadge` | `children`, `tone: available/occupied/reserved/maintenance` | Trạng thái phòng bổ sung cho Rooms |
| `RoomSearch` | `districts`, `budgets: {value,label}[]`, `onSearch` | Thanh đặt phòng → lọc quận/ngân sách |
| `RoomAccordion` | `rooms: RoomCardData[]`, `onSelect` | Thẻ villa mở rộng → thẻ phòng |
| `ImageJourney` | `slides: JourneySlide[]` | Ảnh 3D theo chuột/cuộn, chuyển cảnh theo chiều sâu |
| `FeatureList` | `items: RoomFeature[]` | Danh sách tiện ích + ảnh theo chuột |
| `FloorPlan` | `areas: PlanArea[]`, `viewBox?` | Mặt bằng SVG tương tác |
| `QuoteCarousel` | `quotes: {quote,author}[]` | Trình chiếu lời chia sẻ |
| `CostBreakdown` | `items: {label,amount}[]`, `total`, `note?` | Khối tính đầu tư → bảng chi phí chỉ đọc |
| `Reveal` | `children`, `delay?`, `className?` | Hiện nội dung khi cuộn |
| `SmoothScroll` | `children` | Cuộn mượt Lenis, chỉ bọc một lần ở gốc trang |
| `Preloader` | `visible`, `progress: 0..100`, `logoSrc?` | Màn hình chờ Rooms, tiến độ do bên gọi cung cấp; có `logoSrc` thì biểu tượng logo thay hình mặt trời |

`logoSrc` chỉ dùng với `/images/rooms-logo.webp`: CSS cắt phần cửa vòm + chìa khóa theo đúng bố cục file này (1275 × 1233). Đổi file logo thì phải sửa lại phần cắt trong `rooms.css`.

`RoomSearch` gửi hai chuỗi `district`, `maxPrice`; trang cha xử lý tìm kiếm. `CostBreakdown` nhận tổng tiền đã có, không tính điện/nước, thuế hay hóa đơn. Dùng chung `src/shared/formatters.ts` để hiển thị tiền VND: chỉ nhận số nguyên an toàn, dữ liệu không hợp lệ hiển thị `—`, không tự đổi thành 0 hoặc làm tròn. Kiểm tra lỗi dữ liệu tại lớp gọi API; dấu `—` chỉ bảo vệ phần hiển thị.

`FloorPlan` nhận đường SVG `path` và tọa độ nhãn `labelX`, `labelY`; thay dữ liệu minh họa bằng mặt bằng chính xác trước khi công bố. Các danh sách hỗ trợ rỗng, một phần tử và thay dữ liệu. Mỗi `id` trong cùng danh sách phải duy nhất.

## Ảnh và hiệu ứng chiều sâu

Ảnh gốc lấy từ `public/images/mini-hanoi-exterior.png`, `mini-hanoi-room.png`; thẻ phòng còn dùng ảnh Đà Nẵng và Sài Gòn đã có sẵn. Không thay đổi ảnh gốc.

Gallery dùng bốn bản WebP `rooms-hanoi-exterior.webp`, `rooms-hanoi-room.webp`, `rooms-danang-room.webp`, `rooms-saigon-room.webp`. Tổng dung lượng 1.030.050 byte, giảm 90,6% so với 10.949.857 byte PNG gốc. Ảnh giữ kích thước 1536 × 1024 và bố cục để tiếp tục khớp depth map; WebP là bản nén có mất dữ liệu, không phải bản sao pixel tuyệt đối.

Hai bản đồ mới `rooms-hanoi-exterior-depth.webp`, `rooms-hanoi-room-depth.webp` được tạo **cục bộ** bằng Depth Anything V2 Small (qua Transformers.js), tương ứng với đúng hai ảnh Hà Nội. `depth-scene.ts` chuyển shader của An Lâm sang TypeScript và bổ sung giải phóng tài nguyên khi unmount.

Khi thay ảnh trong `ImageJourney`, phải cung cấp bản đồ chiều sâu tương ứng: `image` là ảnh màu, `depth` là ảnh trắng đen (vùng gần sáng hơn). Component chỉ tải WebGL khi cuộn tới cách vùng hiển thị khoảng 300px; dừng vòng render khi nằm ngoài màn hình hoặc tab bị ẩn. Đổi nội dung chữ mà giữ nguyên nguồn ảnh không dựng lại tài nguyên GPU. Không hỗ trợ WebGL hoặc tải ảnh/depth lỗi thì vẫn hiển thị ảnh thường.

Tùy chọn giảm chuyển động có hiệu lực ngay khi thay đổi: hiển thị ảnh tĩnh, tắt cuộn mượt và chuyển động theo chuột. `useReducedMotion.ts` dùng chung theo dõi thay đổi hệ điều hành/trình duyệt và gỡ listener khi unmount. Hiệu ứng trên cảm ứng không phụ thuộc hover.

Menu di động đóng bằng Escape và trả focus về nút mở. Thẻ phòng đang được thao tác bằng bàn phím không bị đổi bởi hover qua thẻ khác. `Preloader` dùng dialog modal, giữ focus trong lúc hiển thị và trả focus về phần tử trước đó khi đóng. Trang cha phải tắt `visible` cả khi tải xong lẫn khi tải thất bại; không dùng preloader giả lập của gallery làm cơ chế chờ API thật.

## Phạm vi

### Tương tác — phiên bản 02

Đã tinh chỉnh theo `emil-design-eng`: thao tác lặp lại phản hồi nhanh; hiệu ứng trang trí giữ nhẹ và phù hợp tinh thần An Lâm.

- Nút chính phản hồi nhấn ở tỉ lệ 0,97 trong 120ms. Hiệu ứng hút chuột giảm một nửa biên độ, chỉ dành cho chuột có hover; không ghi CSS variable theo từng lần di chuyển. `magnetic={false}` tắt hiệu ứng này; `style.transform` do bên gọi cung cấp được ưu tiên.
- Thẻ phòng mở rộng trong 240ms bằng chuột; khi dùng bàn phím hoặc con trỏ cảm ứng thì đổi ngay. Nút, mặt bằng và ảnh tiện ích không thêm chuyển động cho thao tác bàn phím.
- Carousel cập nhật nội dung ngay, không chờ câu cũ thoát. Chuột/chạm dùng CSS transition 180ms; bàn phím đổi ngay. Trong chế độ giảm chuyển động chỉ còn mờ dần 120ms. Trình duyệt không hỗ trợ `@starting-style` hiển thị ngay, chức năng vẫn hoạt động.
- Mỗi nút điều khiển carousel có vùng nhấn 44 × 44px. Hover màu chỉ áp dụng cho `(hover: hover) and (pointer: fine)`; tiện ích và mặt bằng nhận `PointerEvent` để không coi chạm là hover chuột.
- `Preloader` thoát bằng opacity trong 180ms, hoặc ngay nếu mở từ bàn phím. Chế độ giảm chuyển động dùng opacity 120ms. Vẫn giữ modal và trả focus khi đóng.
- `Reveal` hiện một lần trong 450ms với dịch chuyển 16px; đây là hiệu ứng giới thiệu ít lặp lại. Dùng chuỗi `transform` đầy đủ, nội dung có focus được hiển thị ngay. Các liên kết đến mục trong trang đến ngay; Lenis vẫn làm mượt cuộn bánh xe.

Chi tiết Before/After và bằng chứng kiểm tra: `../../../../Artifacts/reviews/2026-10-25-rooms-emil-polish.md`. Có 14 test sau bổ sung kiểm tra cảm ứng, callback/style của nút và bấm nhanh carousel; không thêm dependency.

### Giới hạn sử dụng

Đây là thư viện giao diện và trang xem thử, chưa phải 31 trang theo sitemap. Tên phòng, giá, diện tích, lời chia sẻ và mặt bằng trong gallery là dữ liệu minh họa. Không kết nối API, đăng nhập, thanh toán hay tạo dữ liệu thật.

Ba dependency hiệu ứng `lenis`, `motion`, `three` dùng cùng phiên bản với dự án An Lâm; `@types/three` chỉ hỗ trợ kiểm tra TypeScript. Bộ kiểm tra logic chạy bằng `npm run test:components`, không cần thêm test framework.

Đợt rà soát 25/10/2026: 12 test, build và lint qua; kiểm tra trực tiếp menu Escape, tìm/chọn phòng, focus khi hover, mặt bằng bằng bàn phím, carousel, preloader, dữ liệu dài ở 360px, chuyển chế độ giảm chuyển động khi trang đang mở và ảnh dự phòng sau mất WebGL. `npm audit` và `npm audit --omit=dev` báo 0 lỗ hổng đã biết tại thời điểm kiểm tra.

Chưa đo bộ nhớ GPU hoặc hiệu năng trên điện thoại thật. Gói Three.js tải riêng 529,78 kB trước gzip (132,66 kB nén); Vite còn cảnh báo kích thước gói này. Xem kết quả và đề xuất bước tiếp theo ở `../../../../Artifacts/reviews/2026-10-25-rooms-components-review.md`.
