# Rooms — rà soát component và đề xuất bản tối ưu

Ngày kiểm tra: 25/10/2026. Phạm vi: 15 component trong `Source/frontend/src/components/rooms`, trang `components.html`, formatter, ảnh gallery, cấu hình build và dependency frontend. Đây là bộ giao diện được chuyển từ An Lâm cho Trọ Thông Minh; 15 component không tương đương 15 trang hoàn thiện theo sitemap.

## Kết quả đã sửa

| Vấn đề tìm thấy | Tác động trước khi sửa | Cách sửa và bằng chứng |
|---|---|---|
| Thay tùy chọn giảm chuyển động chưa có hiệu lực trực tiếp | Trình duyệt báo giảm chuyển động nhưng vẫn có canvas và Lenis cho tới khi tải lại | Hook `useSyncExternalStore` dùng chung; kiểm tra đổi ngay trên trang thấy 2 ảnh tĩnh, 0 canvas và Lenis tắt; đổi lại thì khôi phục. Có test đăng ký/gỡ listener. |
| 3D được tải ngay và vẫn giữ vòng frame ngoài màn hình | Tải thư viện/tài nguyên sớm, lên lịch frame khi người dùng chưa xem hoặc tab bị ẩn | Chỉ import khi cách viewport khoảng 300px, dùng `setAnimationLoop(null)` để dừng. Test kiểm tra ngoài màn hình, tab ẩn và dispose; trình duyệt xác nhận chưa tải `depth-scene` ở đầu trang rồi tải khi tới gần. |
| Preloader che trang nhưng focus còn ở nền | Người dùng bàn phím có thể thao tác nội dung bị che, đóng overlay mất vị trí focus | Dùng dialog modal, đóng xong trả focus về nút gọi. Kiểm tra trực tiếp `:modal`, focus bên trong và focus trở lại nút “Thử mở Rooms”. |
| Menu di động không đóng bằng Escape | Thao tác bàn phím không hoàn chỉnh | Thêm Escape, đóng menu và trả focus về nút mở. Kiểm tra `aria-expanded=false`. |
| Hover có thể đổi thẻ phòng khi đang dùng bàn phím | Nút “Xem phòng” đang focus có thể bị gỡ khỏi DOM | Giữ lựa chọn khi focus nằm trong accordion; kiểm tra hover thẻ khác vẫn giữ Studio An Yên và focus ở nút “Xem phòng”. |
| Số tiền lỗi hiển thị như giá tiền | Có thể xuất `NaN đ`, số vô hạn hoặc âm thầm làm tròn số lẻ | Formatter chỉ chấp nhận số nguyên an toàn, giá lỗi hiện `—`; không chuyển thành 0. Test gồm số hợp lệ, số âm, số lẻ, NaN, vô hạn và giá trị ngoài giới hạn. Không bổ sung tính hóa đơn ở frontend. |
| Dữ liệu dài làm tràn ngang | Thử tên dịch vụ không có khoảng trắng làm trang 360px tràn tới 1.296px | Cho chữ xuống dòng, hàng chi phí được wrap. Thử lại ở 360px: trang rộng 345px phần nội dung (còn lại là scrollbar), khối chi phí `clientWidth=scrollWidth=295px`, kể cả tổng tiền rất lớn. |
| Chữ phụ/vàng nhỏ thiếu tương phản trên nền cát | Nhãn nhỏ khó đọc hơn cần thiết | Tách màu vàng trang trí và màu chữ nhấn; tăng độ đậm chữ phụ. Giữ bảng màu và font An Lâm. Đây là kiểm tra token, không phải chứng nhận WCAG cho toàn bộ ảnh và trạng thái. |
| Bốn ảnh PNG dùng trong gallery nặng | Tổng ảnh màu gần 11 MB | Tạo 4 WebP và cập nhật tất cả chỗ dùng trong gallery. Giữ ảnh gốc và kích thước 1536 × 1024 để không lệch depth map. |

Các chỉnh sửa nhỏ đi kèm: đánh số hai chữ số đúng khi danh sách có từ 10 mục; gom xử lý scroll vào frame; không dựng lại GPU khi chỉ đổi nội dung chữ; bỏ lớp blur của thông báo demo; thông báo không chặn click nội dung bên dưới; trường select trên mobile có chiều cao tối thiểu 44px và chữ 16px.

## Dung lượng ảnh

| Ảnh | PNG gốc (byte) | WebP gallery (byte) |
|---|---:|---:|
| Ngoại thất Hà Nội | 3.379.226 | 451.890 |
| Phòng Hà Nội | 2.568.447 | 197.300 |
| Phòng Đà Nẵng | 2.637.033 | 222.836 |
| Phòng Sài Gòn | 2.365.151 | 158.024 |
| **Tổng** | **10.949.857** | **1.030.050** |

Giảm **90,6% dung lượng bốn ảnh màu** (10,95 MB → 1,03 MB, dùng MB thập phân). Không phải giảm 90,6% toàn bộ trang hay thời gian tải. WebP chất lượng 85, có mất dữ liệu; đã xem lại ảnh trên trình duyệt. Hai depth map giữ nguyên, không tính trong bảng này.

## Kiểm tra hoàn tất

- `npm run test:components`: **12/12 qua**, gồm tiền VND, tiến độ/cặp ảnh, mất context lúc đang tải, thay canvas, tải 3D gần viewport, vòng render và listener giảm chuyển động. Các test GPU dùng renderer giả lập, không đo GPU thật.
- `npm run build`: qua TypeScript và build cả `index.html` lẫn `components.html`.
- `npm run lint`: qua.
- `npm audit` và `npm audit --omit=dev`: **0 lỗ hổng đã biết** tại thời điểm chạy; không có thay đổi dependency trong đợt sửa này.
- Trình duyệt: callback tìm phòng trả đúng Cầu Giấy/5.000.000 đ; chọn phòng, mặt bằng bằng phím Space, chuyển carousel, menu Escape, focus preloader, hover khi đang focus, giảm chuyển động trực tiếp, ảnh dự phòng khi mất WebGL, dữ liệu dài ở 360px và bố cục 1280px.
- Sau lần tải sạch và đổi chế độ chuyển động, không có lỗi/warning mới trong console được theo dõi. Log nóng trong lúc thay hook ở môi trường phát triển được loại khỏi kết luận của lần tải sạch.
- SHA-256 của năm tệp trang chủ cũ (`App.tsx`, `App.css`, `index.css`, `main.tsx`, `index.html`) không đổi so với trước đợt rà soát. Không sửa dự án An Lâm gốc, không commit/push.

15 component đã được đọc theo nhóm: điều hướng (`RoomsHeader`, `RoomsFooter`); nền tảng (`RoomsButton`, `SectionHeading`, `StatusBadge`); dữ liệu phòng (`RoomSearch`, `RoomAccordion`, `FeatureList`, `FloorPlan`, `CostBreakdown`); trình bày/chuyển động (`ImageJourney`, `QuoteCarousel`, `Reveal`, `SmoothScroll`, `Preloader`). Các danh sách có nhánh dữ liệu rỗng; lựa chọn theo `id` của phòng, tiện ích và mặt bằng có giá trị dự phòng khi dữ liệu đổi. Đây là rà soát có phạm vi, không chứng minh không còn mọi lỗi có thể xảy ra.

## Đề xuất bản tiếp theo

**Giữ bộ hiện tại làm thư viện giao diện; chỉ xây thêm thành phần khi một trang thật cần đến.** Bộ khung nên tách cách trình bày trang giới thiệu và trang nghiệp vụ, nhưng dùng chung màu, font, nút, trạng thái và định dạng tiền.

| Bước | Làm gì | Tiêu chí hoàn thành |
|---|---|---|
| 1 — Chốt hợp đồng dữ liệu | Khi ghép trang tìm phòng đầu tiên, nhận dữ liệu phòng thật qua API; kiểm tra shape, giá VND và thông báo lỗi ở lớp gọi API. | Có đủ 4 trạng thái đang tải / lỗi và thử lại / rỗng / có dữ liệu; bộ lọc không hiển thị kết quả cũ như kết quả mới. |
| 2 — Ghép một luồng hoàn chỉnh | Danh sách phòng → chi tiết phòng → yêu cầu xem phòng theo sitemap đã duyệt; dùng `RoomSearch`, `RoomAccordion`, `FloorPlan`, `CostBreakdown`. | Liên kết và callback mở đúng phòng; gửi yêu cầu có phản hồi thành công/thất bại; dữ liệu mẫu được thay bằng dữ liệu thực đã xác minh. |
| 3 — Tách khu vực sử dụng | Trang công khai giữ không khí An Lâm và hiệu ứng ảnh có chọn lọc. Khu người thuê và khu quản lý dùng bố cục làm việc gọn, cuộn thường; dùng lại token và component cơ bản. | Không ép người dùng chờ preloader/3D khi xem hóa đơn, hợp đồng hay xử lý yêu cầu. Có điều hướng theo vai trò và kiểm tra quyền tại backend. |
| 4 — Đo trên thiết bị thật | Kiểm tra một điện thoại Android tầm trung, Safari/iPhone và mạng chậm; kiểm tra font dự phòng/offline. | Không giật kéo dài hoặc nội dung bị che; nếu GPU yếu thì chọn ảnh tĩnh trước khi tăng thêm độ phức tạp shader. |

Các bước này là **đề xuất**, chưa được dựng trong lần sửa component. Không tạo sẵn toàn bộ 31 trang, không thêm state manager, Storybook hay test framework mới khi gallery hiện tại đã đủ để xem và thử bộ giao diện.

## Giới hạn cần giữ rõ

- Three.js vẫn tạo chunk **529,78 kB** trước gzip (**132,66 kB** gzip), Vite còn cảnh báo >500 kB. Chunk đã tải trễ; chưa đổi renderer hoặc giảm chất lượng shader để giữ hiệu ứng An Lâm. Không tăng ngưỡng cảnh báo để che vấn đề.
- Chưa đo FPS, bộ nhớ GPU, pin hoặc xác thực cảm ứng trên điện thoại thật. Kiểm tra viewport nhỏ không thay thế kiểm tra thiết bị.
- Chưa audit backend, phân quyền, phiên đăng nhập, API, hợp đồng hoặc thanh toán. Dependency audit bằng 0 không đồng nghĩa hệ thống đã an toàn toàn diện.
- Tên phòng, giá, diện tích, lời chia sẻ và mặt bằng vẫn là dữ liệu minh họa. `Preloader` do trang cha điều khiển; khi ghép API phải có đường thoát cả lúc lỗi, không để modal chờ vô hạn.
- Font hiện tải từ Google Fonts, có font hệ thống dự phòng; chưa đóng gói font cục bộ.
