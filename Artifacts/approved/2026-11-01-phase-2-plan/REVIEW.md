# Kế hoạch Phase 2 · Rooms

Trạng thái: ĐÃ DUYỆT 01/11/2026
Task / spec: Phase 2 · Rooms (`docs/spec/01-architecture.md#roadmap`) · spec 11, 12, 13, 19, 30, AUTH-08
Gốc: f454cb3

## Làm gì, vì sao

Lập kế hoạch Phase 2 trước khi tạo file feature và chạy pipeline. Kế hoạch ở `PLAN.md` (bản 4, thư mục này): hiện trạng code, 18 quyết định của chủ dự án D2-1..D2-18 (01/11/2026), 21 quy tắc đề xuất R2-1..R2-21 cho chỗ spec im lặng (duyệt kế hoạch = đồng ý), 11 phần P2-0..P2-10 có thứ tự, mỗi phần ghi mục tiêu, file dự kiến, việc, cách kiểm tra, điều kiện hoàn thành; rủi ro.

## File sẽ thêm / sửa / xóa ở bản chính

Không có. `PLAN.md` và `REVIEW.md` không được chép. Sau khi duyệt, P2-1 tạo bản nháp riêng cho `docs/phase-2-rooms/` và phần spec cần sửa.

## Cách xem và kiểm tra

Đọc `Artifacts/2026-11-01-phase-2-plan/PLAN.md`; mục 7 liệt kê thay đổi của từng bản.

## Đã kiểm tra

01/11/2026, rà soát 4 lượt:
- Spec: roadmap, 00 (A-03, A-05, Q-02, D-08, D-09), 01 (module, cron, mã lỗi), 10, 11, 12, 13, 19 (`GET /dashboard`), 20 (AUD-01), 30.
- Schema và ràng buộc: `Room`, `RoomImage`, `RoomPrice` (`reviewedAt`), `RatePlan`, `Service`, `Viewing`, `Building`, `User`; `constraints.sql` (trigger quản lý chỉ khi đổi `manager_id` và đếm cả tòa khóa, `buildings_code_format`, `*_one_pending`, `rate_plans_one_per_day`, không có ràng buộc `WON` ↔ `contract_id`).
- Code: BE `src/modules`, `src/common` (`env.ts` không bắt `CLOUDINARY_URL`), `seed.ts` (giá phòng có `room_prices` APPROVED); FE `routes.tsx`, layouts, pages, kit `index.ts`, `package.json` (`test:components` liệt kê từng file); Node v24.22.0.

## Giả định hoặc câu hỏi cho chủ dự án

Không còn câu hỏi mở. Trả lời đã ghi: Q2-7 → D2-14 (e2e trên DB dev, dữ liệu `[E2E <runId>]`, nhật ký, vô hiệu hóa, dọn theo nhật ký), Q2-8 → D2-15 (làm rõ ở bản 4: chỉ thay giá đã duyệt có ngày ≥ ngày giá mới), Q2-9 → D2-16 (khóa tòa bỏ gán quản lý), D2-17 (lịch hẹn treo không tự hủy, cảnh báo), D2-18 (quản lý chưa có số liên hệ → liên hệ Boss).

Duyệt 01/11/2026, không có file để chép (chỉ PLAN.md, REVIEW.md); chuyển tay vào approved/.
