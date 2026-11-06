# P2-5c · API bảng giá trả serviceName

Trạng thái: ĐÃ DUYỆT 06/11/2026
Task / spec: Q-FE8B-7 · PRC-10, PRC-12, RATE-01
Gốc: 77f5c31

## Làm gì, vì sao

Chủ dự án chọn (05/11/2026) cho backend thêm `serviceName` vào `RatePlanView` (`services.name` khi `kind = SERVICE`, `null` cho ELECTRIC/WATER) để trang `/ql/duyet-gia` hiện tiêu đề "Đơn giá dịch vụ {tên} · {tòa}". Có trong mọi response trả `RatePlanView` (list, propose, approve, reject); lấy qua `include` có sẵn, không thêm truy vấn, không migration. Dịch vụ đã khóa vẫn trả tên (Q-P5-9 A).

## File sẽ sửa ở bản chính (đích từ `Source/backend/`)

`src/modules/pricing/pricing.types.ts` (+1 trường), `pricing.service.ts` (+`service: { select: { name: true } }` trong include, `serviceName` trong `toRatePlanView`), `pricing.list.spec.ts` và `pricing.review.spec.ts` (fixture + test mới; ghi đè 2 spec cùng tên trên main). Kèm draft spec riêng `Artifacts/2026-11-05-BE-P2-SERVICE-NAME/` (1 câu PRC-12). `ref/`, `PLAN.md` không áp dụng.

## Đã kiểm tra

Tester CP-1, CP-2 PASS: pricing 296/296, toàn bộ unit qua overlay 1502/1502, oxlint 0 lỗi, fail-proof đã làm. Reviewer: DUYỆT, không lỗi chặn, không mục nên sửa. Chủ dự án đã duyệt trước (05/11/2026) các draft còn lại khi reviewer DUYỆT.

## Giả định

A1 `serviceName` là `services.name` trần; A2 trường mới thêm cuối interface; A3 dịch vụ khóa vẫn trả tên; A4 dùng `?.` vì quan hệ `RatePlan.service` optional.

Đã chép vào file chính 06/11/2026 bằng apply-draft.mjs: 4 file.
