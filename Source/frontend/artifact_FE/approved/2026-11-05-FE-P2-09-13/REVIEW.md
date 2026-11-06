# P2-8b · Frontend đơn giá, duyệt giá, lịch hẹn, việc hôm nay

Trạng thái: ĐÃ DUYỆT 06/11/2026
Task / spec: FE-P2-09..13 · PRC-01..12, RATE-01..06, VIEW-03/04/07/09/13, NOTI-06, API-05
Gốc: 418974c

## Làm gì, vì sao

- **Phòng (`/ql/phong`)**: nút "Đề xuất giá" mở hộp thoại đề xuất, "Quá hạn" và "Đề xuất lại" (PRC-07), thay link cũ trong `RoomInspector`.
- **Đơn giá (`/ql/don-gia`)**: biểu giá điện/nước/dịch vụ theo tòa (bậc điện), đang áp dụng / sắp áp dụng / lịch sử, form đề xuất biểu giá (RATE-02).
- **Duyệt giá (`/ql/duyet-gia`, Boss)**: danh sách PENDING với so sánh cũ → mới, % do BE trả, bảng bậc điện, hộp xác nhận duyệt (nói câu chung về PRC-08), từ chối bắt buộc lý do, "Quá hạn" tách riêng.
- **Lịch hẹn (`/ql/lich-hen`)**: theo ngày (mặc định hôm nay đến +30 ngày), thêm thủ công (VIEW-03), nút Gọi / Zalo, đổi trạng thái (VIEW-04, VIEW-09).
- **Việc hôm nay (`/ql`)**: thẻ "Lịch hẹn mới" và giá chờ duyệt từ `GET /dashboard`.
- `Idempotency-Key` gắn vào các POST tiền (đề xuất, duyệt, từ chối giá), một key cho mỗi nội dung đề xuất.

## File sẽ thêm / sửa / xóa ở bản chính (đích từ `Source/frontend/`)

Thêm (~28): `src/features/pricing/*` (11 file), `src/features/viewings/*` (5), `src/features/dashboard/{api.ts,dashboard.css}`; test `tests/p2/{fe09-pricing-api,fe09-room-price,fe10-rate-plans,fe11-approvals,fe12-dashboard,fe12-viewing-form,fe12-viewings-page}.test.mjs`.
Sửa (9): `src/features/rooms/RoomInspector.tsx`, `src/pages/staff/{ApprovalsPage,PricesPage,StaffHomePage,ViewingsPage}.tsx` (từ "Đang làm" sang trang thật), `src/shared/api.ts` (header `Idempotency-Key`), và ba file test cũ `tests/auth-guards.test.mjs`, `tests/p2/cp1-routes.test.mjs`, `tests/p2/cp7-rooms.test.mjs` — đã **ghép (3-way merge) với bản main hiện tại sau P2-9**, giữ cơ chế `draft-root.mjs`.
`StaffHomePage.tsx` trong draft là LF còn main CRLF: áp dụng sẽ đổi kiểu xuống dòng của file này.
Không xóa file nào. `ref/`, `PLAN.md`, `REVIEW.md`, `preview.html` không áp dụng.

## Cách xem và kiểm tra

Sau áp dụng: `npm run lint`, `npm run build`, `npm run test:components` (khuyên chạy với `--test-concurrency=1`, xem rủi ro), rồi kiểm tay trình duyệt với backend thật: "quản lý đề xuất → Boss duyệt → giá đổi" (bước QA P2-10).

## Đã kiểm tra

- Tester CP-1..CP-8 PASS; CP-8: 645/645 test, lint 0 lỗi, build đạt (chạy một lần với `--test-concurrency=1`); fail-proof từng CP.
- Reviewer: **DUYỆT**, không lỗi chặn. Góp ý: (1) nhóm "Lịch sử đơn giá" gồm cả dòng PENDING/REJECTED/SUPERSEDED, dễ hiểu nhầm là đã xong; (2) trang Duyệt giá lọc theo tòa đang chọn trong khi spec ghi "lists all PENDING" (mặc định Boss "Tất cả tòa" thì ra đủ).
- Chưa kiểm: API thật và kiểm tay trình duyệt; test chạy song song mặc định có 1 đến 7 test timeout ngẫu nhiên (DOM giả, tải CPU), chạy tuần tự đạt 645/645.

## Giả định hoặc câu hỏi cho chủ dự án

- FE8B-1..17 (đầy đủ ở PLAN.md §3); P5-1; phân trang: chỉ tải trang 1 (20 mỗi loại), không có nút chuyển trang.
- "Hủy lịch" và "Không thành" là hai bước (mở ô ghi chú rồi Lưu); ghi chú Hủy tùy chọn, "Không thành" bắt buộc (PLAN ghi "bấm một lần", cần chủ dự án xem lại).
- Prefill form đề xuất biểu giá bằng bậc đang áp dụng (FE8B-15).
- Chủ dự án đã chốt: câu chung PRC-08; `roomCode`/`buildingName`/`serviceName` từ backend; nút Zalo `zalo.me`; ngày mặc định hôm nay → +30; thẻ "Lịch hẹn mới" đếm mọi NEW.
- **Chữ giao diện mới ngoài đặc tả (đọc và sửa nếu cần):** "—" (dòng trống của ô Phòng và Khung giờ trong form lịch hẹn); "Hủy" (nút đóng form); "Chọn một tòa ở thanh chọn tòa để thêm lịch hẹn."; "Cần ghi kết quả khi đánh dấu không thành" (lỗi từ BE). Chữ đã chốt trước đó (Đang xử lý, Lý do từ chối, Vui lòng chọn ngày hiệu lực, Đề xuất đã quá hạn..., Chưa có đề xuất nào chờ duyệt, Vui lòng nhập lý do từ chối, Giá mới...) đều được test.

Đã chép vào file chính 06/11/2026 bằng apply-draft.mjs: 33 file.
