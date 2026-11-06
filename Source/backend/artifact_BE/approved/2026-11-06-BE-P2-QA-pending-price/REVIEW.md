# QA B1: đề xuất giá chờ duyệt có kèm giá

Trạng thái: ĐÃ DUYỆT 06/11/2026
Task / spec: P2-QA-01 (mục B1 của checklist) · PRC-01, PRC-10
Gốc: 9d13364

## Làm gì, vì sao

Chủ dự án chạy checklist B1: sau khi quản lý đề xuất giá, khung chi tiết phòng chỉ ghi "Đề xuất giá áp dụng từ <ngày>", **không** hiện giá đề xuất. `GET /rooms` (lưới phòng) trả `pendingProposal` chỉ có `id`, `effectiveFrom`, `expired`. Bản nháp thêm `price` (số nguyên đồng, lấy từ bảng giá PENDING đã có sẵn trong truy vấn) vào `pendingProposal`. Không đổi quyền, không thêm truy vấn.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `src/modules/rooms/rooms.service.ts` | `Source/backend/src/modules/rooms/rooms.service.ts` | Sửa (select `price`, trả `price`) |
| `src/modules/rooms/rooms.types.ts` | `Source/backend/src/modules/rooms/rooms.types.ts` | Sửa (kiểu `pendingProposal.price`) |
| `src/modules/rooms/rooms.grid.spec.ts` | `Source/backend/src/modules/rooms/rooms.grid.spec.ts` | Sửa (fixture và kỳ vọng có `price`) |

`ref/vitest.preview.config.ts` chỉ để chạy thử, không áp dụng. Spec không nhắc `pendingProposal` nên không cần sửa docs/spec.

## Cách xem và kiểm tra

`npx vitest run --config artifact_BE/2026-11-06-BE-P2-QA-pending-price/ref/vitest.preview.config.ts src/modules/rooms artifact_BE/2026-11-06-BE-P2-QA-pending-price/src` trong `Source/backend`.

## Đã kiểm tra

- 06/11/2026: 15 file / 172 test đạt (các spec rooms, bản nháp thay `rooms.grid.spec.ts`).

## Giả định hoặc câu hỏi cho chủ dự án

Không có. Phần giao diện hiện giá nằm ở bản nháp frontend `2026-11-06-FE-P2-QA-fixes`; áp dụng bản này **trước**.

Đã chép vào file chính 06/11/2026 bằng apply-draft.mjs: 3 file.
