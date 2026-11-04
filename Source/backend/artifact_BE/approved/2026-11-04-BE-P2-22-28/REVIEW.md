# P2-5 · Backend đề xuất và duyệt giá

Trạng thái: ĐÃ DUYỆT 04/11/2026
Task / spec: BE-P2-22..28 · PRC-01..12 (PRC-11 thuộc BE-P2-33), RATE-01..06, SVC-04, AUD-01
Gốc: 2fa7acb (áp dụng cho `prisma/schema.prisma`, `src/app.module.ts`, `src/modules/rooms/rooms.service.ts`, `src/modules/buildings/buildings.service.ts`)

## Làm gì, vì sao

Thêm module `pricing`: đề xuất giá phòng và bảng giá (điện/nước/dịch vụ), Boss duyệt/từ chối, danh sách "Duyệt giá" kèm so sánh cũ → mới, job đồng bộ `rooms.price` lúc 01:00 (Asia/Ho_Chi_Minh) và khi khởi động, kho `Idempotency-Key` 24 giờ cho 6 POST. Mở khóa phòng/tòa cập nhật `rooms.price` trong cùng transaction. Giá công khai không đổi trước khi Boss duyệt.

## File sẽ thêm / sửa / xóa ở bản chính (đích từ `Source/backend/`)

| Bản nháp | Thêm / Sửa |
|---|---|
| `src/modules/pricing/{pricing.module,pricing.controller,pricing.service,pricing.types,pricing-idempotency,price-comparison,room-price-sync}.ts`, `dto/pricing.dto.ts` | Thêm |
| `src/jobs/room-price-sync.job.ts` | Thêm |
| `prisma/migrations/20261104000000_pricing_idempotency/migration.sql` | Thêm |
| 13 file `*.spec.ts` (pricing, jobs, rooms/buildings unlock) | Thêm |
| `prisma/schema.prisma`, `prisma/check-constraints.mjs`, `src/app.module.ts` | Sửa nhỏ |
| `src/modules/rooms/rooms.service.ts` (+8 dòng), `src/modules/buildings/buildings.service.ts` (+6 dòng): gọi `syncRoomPrices` khi mở khóa | Sửa |
| `rooms.service.spec.ts`, `buildings.service.spec.ts`: thêm mock `room.findMany`/`roomPrice.findMany`, không đổi assertion (**ghi đè file main, cần duyệt**) | Sửa |

Không xóa file nào. `ref/`, `PLAN.md`, `REVIEW.md` không áp dụng.

## Cách xem và kiểm tra

Sau khi duyệt và áp dụng: `npx prisma generate` → `npm run test` → `npm run build` → `npm run lint` → chạy migration (do chủ dự án kích hoạt, chỉ một lần) → `npm run test:e2e` → `node prisma/check-constraints.mjs` (kỳ vọng 54/54).

## Đã kiểm tra

- Preview vitest 299/299 xanh: CP-1 56, CP-2 46, CP-3 47, CP-4 16, CP-5 38, CP-6 60, CP-7 16; mỗi CP đã đổi kỳ vọng tạm để thấy đỏ rồi trả lại. `tsc` và `oxlint` bản nháp sạch.
- Reviewer: **DUYỆT**, không lỗi chặn. Nên sửa: (1) `pricing-idempotency.ts:54` xóa cứng bản ghi hết hạn — là cache TTL kỹ thuật, không phải dữ liệu nghiệp vụ; (2) `pricing.service.ts:530` list chạy 1 query phụ mỗi dòng (tối đa 100/trang), theo dõi khi tích hợp thật.
- `main-files.mjs check`: không file chính nào đổi.
- **Chưa chạy:** `check-constraints.mjs` (thiếu `@electric-sql/pglite`, cần chủ dự án cho cài `--no-save` ở thư mục tạm); `test:e2e` (chạy sau áp dụng). `npm run test` main: 1014 pass, 13 file spec draft không load được vì main thiếu resolver draft — chỉ lỗi cấu trúc, sẽ hết sau áp dụng.

## Giả định hoặc câu hỏi cho chủ dự án

- [ASSUMPTION P5-1] cấu trúc DTO `comparison` (FE P2-8b dùng đúng hợp đồng này); `ratePlanComparison` trả `null` khi tiers rỗng.
- [ASSUMPTION P5-2] `Idempotency-Key` dài 1..255 ký tự, sai → 400 `VALIDATION_FAILED`.
- [ASSUMPTION P5-3] `tiers` phải gửi đúng `tierNo = i+1`, BE không tự sắp xếp, sai → 400 field `tiers`.
- Đã chốt với chủ dự án 04/11/2026 (không phải assumption): Q-P5-1..9 trong `feature_p2-5-backend-pricing.md`.
- Shortcut: job đồng bộ đọc phòng không khóa hàng.

Đã chép vào file chính 04/11/2026 bằng apply-draft.mjs: 29 file.
