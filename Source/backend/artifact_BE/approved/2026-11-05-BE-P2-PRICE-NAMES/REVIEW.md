# P2-5b · API giá trả roomCode và buildingName

Trạng thái: ĐÃ DUYỆT 05/11/2026
Task / spec: Q-FE8B-2 · PRC-10, PRC-12 · FE-P2-11
Gốc: d42fcb5

## Làm gì, vì sao

Chủ dự án chọn (05/11/2026) thêm vào backend các trường để trang `/ql/duyet-gia` nhận diện phòng và tòa: `RoomPriceView` thêm `roomCode` (mã phòng trần, ví dụ "203") và `buildingName`; `RatePlanView` thêm `buildingName`. Có trong mọi response trả hai view này: `GET /room-prices`, `GET /rate-plans`, propose, approve, reject. Lấy cùng truy vấn bằng `include` (không thêm N+1). Không đổi hành vi nghiệp vụ, controller hay DTO.

## File sẽ sửa ở bản chính (đích từ `Source/backend/`)

| Bản nháp | Sửa |
|---|---|
| `src/modules/pricing/pricing.types.ts` | thêm 2 trường vào `RoomPriceView`, 1 vào `RatePlanView` (thêm cuối interface) |
| `src/modules/pricing/pricing.service.ts` | `ROOM_PRICE_INCLUDE`/`RATE_PLAN_INCLUDE` lấy `room.code`, `building.name`; `toView`/`toRatePlanView` gán trường mới |
| `src/modules/pricing/pricing.{list,rate-proposal,supersede,review,http}.spec.ts` (5 file) | cập nhật fixture (thêm `room.code`, `building.name`) và thêm 4 test mới; **ghi đè 5 spec cùng tên trên main** |

Kèm draft spec riêng `Artifacts/2026-11-05-BE-P2-PRICE-NAMES/docs/spec/12-pricing.md` (PRC-12 mô tả hai trường mới). `ref/`, `PLAN.md`, `REVIEW.md` không áp dụng.

## Cách xem và kiểm tra

Sau khi duyệt và áp dụng: `npm run test`, `npm run lint`, `npm run build`, `npm run test:e2e` (không cần migration).

## Đã kiểm tra

- Tester CP-1, CP-2 PASS: pricing 277 test; toàn bộ unit qua overlay **1483/1483**; oxlint 0 lỗi; fail-proof đã làm.
- Reviewer: **DUYỆT**, không lỗi chặn, không mục nên sửa.
- `npm run test` thật (chưa áp dụng) không nạp được 5 spec của bản nháp vì thiếu module; chỉ là cấu trúc draft, hết sau áp dụng.
- `main-files.mjs check`: không agent nào ghi file chính (danh sách file "đổi" lúc kiểm là do commit của chính tôi).

## Giả định hoặc câu hỏi cho chủ dự án

- A1: `roomCode` là `rooms.code` trần, không ghép tên tòa.
- A2: hai trường mới thêm cuối interface, thứ tự trường cũ không đổi.
- Fixture rate-plan cũ thiếu `building` nên đã bổ sung trong test; service không thêm `?.` che lỗi.

Đã chép vào file chính 05/11/2026 bằng apply-draft.mjs: 7 file.
