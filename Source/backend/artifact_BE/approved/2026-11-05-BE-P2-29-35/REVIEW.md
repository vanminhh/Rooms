# P2-6 · Backend API công khai, lịch hẹn, Việc hôm nay

Trạng thái: ĐÃ DUYỆT 05/11/2026
Task / spec: BE-P2-29..35 · PUB-01..04, ROOM-05, ROOM-08, BLD-04/05, SVC-04, VIEW-01..04, VIEW-07..13, NOTI-06 (Phase 2), PRC-11
Gốc: 8bec6ab

## Làm gì, vì sao

- **API công khai** `/public/*`: `GET /public/locations`, `/public/rooms` (lọc, sắp xếp, `meta`), `/public/featured-rooms`, `/public/rooms/:id`, `/public/buildings/:id` (ảnh, tiền cọc, đơn giá hôm nay và sắp tới, `monthlyEstimate` theo ROOM-08, liên hệ BLD-04). Phòng/tòa không công khai → 404; không lộ trường nội bộ.
- **Đặt lịch xem** `POST /public/viewings` (VIEW-01/02/08/11/12): honeypot, giới hạn theo IP (trong bộ nhớ, 5/giờ), đếm theo số điện thoại với `pg_advisory_xact_lock`, cùng nội dung không tạo bản ghi mới.
- **Quản lý lịch** (staff): `GET /viewings`, `POST /viewings` thủ công (VIEW-03), `PATCH /viewings/:id` (VIEW-04, VIEW-09) với cập nhật có điều kiện và `handled_by_id`.
- **`GET /dashboard`** (Việc hôm nay): lịch mới, giá chờ duyệt (PRC-11), lịch của tòa khóa trên thẻ Boss (VIEW-07).
- VIEW-13: khóa tòa/phòng hay bảo trì giữ nguyên lịch hẹn.

## File sẽ thêm / sửa / xóa ở bản chính (đích từ `Source/backend/`)

Sửa (5, chỉ thêm hàm/tham số/import, không đổi hành vi cũ): `src/app.module.ts`, `src/common/rates/rates-at.ts` (+ `rates-at.spec.ts`), `src/modules/auth/rate-limiter.ts`, `src/modules/buildings/buildings.module.ts`, `src/modules/rooms/rooms.module.ts`.

Thêm (~35): `src/common/rooms/{monthly-estimate,public-price-order,public-view}.ts` (+spec); `src/modules/buildings/public-buildings.{controller,service}.ts`; `src/modules/rooms/{public-rooms.controller,public-rooms.service,public.types}.ts`, `dto/public-rooms.dto.ts`; `src/modules/viewings/*` (module, controller, public controller, service, slot, types, dto); `src/modules/notifications/*` (module, `dashboard.{controller,service}.ts`, dto); các file `*.spec.ts` tương ứng; `test/viewings.e2e-spec.ts`.

Không xóa file nào. `ref/`, `PLAN.md`, `REVIEW.md` không áp dụng.

## Cách xem và kiểm tra

Sau khi duyệt và áp dụng (không cần migration mới): `npm run lint`, `npm run build`, `npm run test`, rồi `npm run test:e2e` (ghi DB dev, dữ liệu `[E2E <runId>]` tự dọn), rồi `node --env-file=../.env scripts/e2e/cleanup.mjs` (chỉ liệt kê).

## Đã kiểm tra

- Tester CP-1..CP-5 PASS: 34 + 48 + 30 + 53 + 24 test mới; toàn bộ unit qua overlay 1456 test (76 file) đạt; mỗi checkpoint đã làm fail-proof.
- `oxlint` 0 lỗi; `npm run lint` 0 lỗi (3 cảnh báo sẵn có); `npm run build` đạt.
- Reviewer: **DUYỆT**, không lỗi chặn. Nên theo dõi: (1) `dashboard.service.ts:55` nạp mọi lịch NEW trong phạm vi rồi lấy 5 dòng đầu; (2) `viewings.service.ts:176` sắp `time_slot` bằng JS sau phân trang nên có thể lệch ở mép trang. Cả hai đã ghi `shortcut:` trong mã.
- `main-files.mjs check`: không file chính nào đổi.
- **Chưa chạy:** `test/viewings.e2e-spec.ts` trên DB thật (agent bị cấm ghi DB dev); chạy vitest thường không overlay sẽ đỏ ở 2 file HTTP mới cho đến khi áp dụng (lỗi `app.setup.js`, đúng thiết kế draft).

## Giả định hoặc câu hỏi cho chủ dự án

Đã chốt với chủ dự án 05/11/2026 (không phải assumption): Q-P6-1 B, Q-P6-2 A, Q-P6-3 A, Q-P6-4 A.

Các [ASSUMPTION] chính (đủ danh sách ở PLAN.md mục 3, 18 mục):
- Honeypot `website`: có tính vào giới hạn IP, không ghi DB; `POST /public/viewings` trả `{ received: true }` cả hai nhánh.
- `/public/rooms` sắp: `price`, `-price`, `newest`; `/public/locations` lồng phường với `roomCount`, phường A→Z.
- Giới hạn IP 5/giờ chỉ đúng với một instance (trong bộ nhớ).
- `GET /viewings`: không có khoảng ngày mặc định, sắp `visitDate` tăng dần.
- `PATCH`: lịch đã quá ngày chỉ đổi được ghi chú, không đổi ngày/khung giờ (400 `fields.visitDate`); `outcomeNote` tối đa 500 ký tự; WON hoặc NEW→LOST → 409 `CONFLICT_STATE`.
- `/dashboard`: đếm + tối đa 5 mục; Boss với `?buildingId` chỉ thu hẹp thẻ (tòa có manager → 0).
- Chi tiết công khai: PER_PERSON dùng đơn giá bậc 1; `contact = null` khi không có số điện thoại (BLD-04); dịch vụ khóa bị loại (SVC-04).
- Mọi chuỗi tiếng Việt mới (thông báo validation, nhãn) là đề xuất, chủ dự án cần xem.

Đã chép vào file chính 05/11/2026 bằng apply-draft.mjs: 41 file.
