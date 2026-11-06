# P2-5 · Sửa hai test cũ sau khi áp dụng giá

Trạng thái: ĐÃ DUYỆT 04/11/2026
Task / spec: BE-P2-22, BE-P2-28 · PRC-06, BLD-06
Gốc: 2fa7acb

## Làm gì, vì sao

Sau khi áp dụng P2-5, `npm run test` trên main: 1270/1272 đạt, 2 test cũ fail vì P2-5 đổi hành vi (không phải lỗi logic):
1. `prisma.service.spec.ts` kỳ vọng AppModule chỉ import đến `RoomsModule`; nay có thêm `PricingModule`.
2. `buildings.http.spec.ts` (BLD-06 mở khóa tòa) dùng Prisma giả không có `room.findMany`/`roomPrice.findMany`; mở khóa nay gọi `syncRoomPrices`, nên 500.

## File sẽ sửa ở bản chính

| Bản nháp | Đích từ `Source/backend/` | Thêm / Sửa / Xóa |
|---|---|---|
| `src/common/prisma/prisma.service.spec.ts` | cùng đường dẫn | Sửa (thêm `PricingModule` vào danh sách imports kỳ vọng) |
| `src/modules/buildings/buildings.http.spec.ts` | cùng đường dẫn | Sửa (thêm mock `room`, `roomPrice` rỗng, cả ngoài và trong transaction) |

Không đổi code nghiệp vụ. `ref/` không áp dụng.

## Cách xem và kiểm tra

Từ `Source/backend`: `node ./node_modules/vitest/vitest.mjs run --config artifact_BE/2026-11-04-BE-P2-5-main-test-fix/ref/vitest.preview.config.ts --reporter=dot`.

## Đã kiểm tra

Overlay hai file nháp lên toàn bộ unit: 62/62 file, 1272/1272 test đạt; oxlint nháp 0 lỗi. Sau khi duyệt và áp dụng sẽ chạy lại `npm run test`, `lint`, `build` và `test:e2e` trên main.

## Giả định hoặc câu hỏi cho chủ dự án

Không có.

Đã chép vào file chính 04/11/2026 bằng apply-draft.mjs: 2 file.
