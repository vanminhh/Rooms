# P2-9 · Frontend trang công khai và form đặt lịch xem

Trạng thái: ĐÃ DUYỆT 06/11/2026
Task / spec: FE-P2-14..18 · PUB-01..04, ROOM-05, ROOM-08, BLD-04, VIEW-01/02/08/11/12, UI-01..10
Gốc: 77f5c31

## Làm gì, vì sao

Trang chủ `/` (phòng nổi bật, khu vực), tìm phòng `/phong` (lọc quận, phường, giá, sắp xếp, giữ trong URL), chi tiết tòa `/toa/:id` và phòng `/phong/:id` (ảnh, đơn giá, ước tính chi phí do BE trả, liên hệ), form đặt lịch xem (3 khung giờ, hôm nay đến +30 ngày, honeypot, màn hình thành công chung). Menu công khai thêm "Tìm phòng". Dùng đúng UI kit chính thức, không thêm mảnh kit mới.

## File sẽ thêm / sửa / xóa ở bản chính (đích từ `Source/frontend/`)

Thêm (~14): `src/features/public/*` (api, room-filters, viewing-schema, RoomFilters, RoomCard, ListState, RateTable, EstimatePanel, ContactCard, ViewingForm, public.css), `src/pages/public/PublicHomePage.tsx`, test `tests/draft-root.mjs`, `tests/p2/{cp1-public-harness,fe-p2-14-home,fe-p2-15-search,fe-p2-16-detail,fe-p2-17-viewing-form}.test.mjs`, `tests/p2/public-dom.mjs`.
Sửa: `src/layouts/PublicLayout.tsx` (menu "Tìm phòng"), `src/pages/public/{PlaceholderPage,PublicBuildingPage,PublicRoomPage,PublicRoomsPage}.tsx`; và ~18 file test cũ (bộ `tests/*.test.mjs`, `tests/p2/cp*.test.mjs`) được chép lại với một thay đổi: đọc file qua `draft-root.mjs` (ưu tiên nháp, dự phòng chính) thay vì đường dẫn tương đối cố định; `auth-login-flow` và `auth-guards` còn cập nhật kỳ vọng theo menu và trang mới.
Không xóa file nào. `ref/`, `PLAN.md`, `REVIEW.md`, `preview.html` không áp dụng.

## Cách xem và kiểm tra

Sau áp dụng: `npm run lint`, `npm run build`, `npm run test:components`; kiểm tay 360 px và đặt một lịch hẹn thật với backend (bước QA P2-10).

## Đã kiểm tra

- Tester CP-1..CP-6 PASS: 22 file test của bản nháp 497/497; tsc preview, lint, build đạt; `test:components` bản chính (không sửa package.json) 407/407; fail-proof từng CP.
- Reviewer: **DUYỆT**, không lỗi chặn. Nên biết: (1) PLAN có câu gợi ý "chọn ngày khác" khi 3 khung hôm nay đã qua nhưng code chỉ hiện "Đã bắt đầu" (chủ dự án đã chấp nhận bỏ); (2) nav phân trang chưa có `aria-label` và chữ "Trang x/y" (chưa có nguồn).
- Chưa kiểm: tay trên trình duyệt ở 360 px và đặt lịch thật (không có trình duyệt và DB trong môi trường chạy).
- Rủi ro test: `fe-p2-15-search` #6b timeout 1 lần khi chạy song song toàn bộ (CPU), ổn khi chạy riêng.

## Giả định hoặc câu hỏi cho chủ dự án

A-1 form ở `features/public/`; A-2 trang chủ ở file mới; A-3 test đặt tên `fe-p2-1x-*`; A-4 `limit=20` + "Trang trước"/"Trang sau"; A-5 khóa khung giờ theo giờ Hà Nội chỉ để khóa nút (BE phán quyết); A-6 ảnh hero `/images/rooms-hanoi-exterior.webp` alt "Ảnh minh họa"; A-7 chỉ 2 sort price/newest; A-8 "Trên 5.000.000 đ" mã hóa `minPrice=5000000`.

Quyết định đã có: D-1 không có select tòa (chỉ từ `/toa/:id`, nút "Bỏ lọc tòa"); D-2 ngân sách 2/3/4/5 triệu + "Trên 5.000.000 đ"; D-3 màn hình thành công câu chung; D-4 chữ nguyên văn mockup P2-7; D-5 menu "Tìm phòng"; D-6 nhãn đơn giá nguyên văn mockup, "Còn trống tại tòa", giá không "/ tháng".

**Chữ giao diện mới (chủ dự án đọc và có thể sửa):**
- Trang chủ (mockup P2-7): "Một nhịp sống riêng · Hà Nội", "Chọn chỗ ở.", "Bắt đầu an yên.", "Phòng thuê theo tháng, chi phí rõ ràng.", "Tìm một không gian vừa với cuộc sống của bạn.", "Khám phá phòng trống", "Phòng nổi bật", "Những lựa chọn mới", "Những phòng trống có giá vừa được duyệt gần đây.", "Một nơi để thuộc về.", "Xem tất cả phòng trống", "Khu vực", "Gần hơn với nhịp sống của bạn", "Bạn muốn ở khu vực nào?", "{n} phòng trống".
- Menu: "Tìm phòng".
- Bộ lọc: "Đến {2|3|4|5}.000.000 đ", "Trên 5.000.000 đ", "Tất cả quận", "Tất cả phường", "Không giới hạn", "Đang lọc theo tòa {tên}", "Bỏ lọc tòa", "Xóa bộ lọc", "Trang trước", "Trang sau", "Chưa có phòng phù hợp với bộ lọc"; thẻ phòng: alt "Phòng {code} – {buildingName}", giá "2.300.000 đ", diện tích kiểu vi-VN.
- Chi tiết: "Đơn giá rõ ràng", "Đang áp dụng", "Điện · 0–{upTo} kWh", "Điện · từ {n} kWh", "/ kWh", "Nước", "/ m³", "/ người / kỳ", "/ phòng / kỳ", "/ xe / kỳ", "Từ {dd/mm/yyyy}: {nhãn} {giá}.", "Còn trống tại tòa", "Chi phí minh bạch", "Một tháng, an tâm ở lại.", "Tổng chi phí", "Ước tính chi phí / tháng", "Đang tải danh sách phòng", "Xem phòng trống của tòa này", "Chưa có phòng trống nào", "Chưa có ảnh", "Liên hệ", "Nhắn Zalo", "Facebook", "Tiền cọc · 1 tháng", "Thời hạn tối thiểu 3 tháng", "Nội thất", "Diện tích", "Số người tối đa". Mô tả và tiện ích hiện nguyên văn, không nhãn.
- Form: "Đã bắt đầu", "Đang gửi…"; honeypot ẩn không nhãn; thành công: "Đã nhận yêu cầu xem phòng. Quản lý sẽ gọi lại để xác nhận lịch hẹn." và "Gửi yêu cầu chưa giữ chỗ phòng.".

Đã chép vào file chính 06/11/2026 bằng apply-draft.mjs: 42 file.
