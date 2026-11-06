# P2-4b · Backend `GET /rooms/:id`

Trạng thái: ĐÃ DUYỆT 04/11/2026
Task / spec: Q-FE8A-2/3 · ROOM-07, ROOM-09, VIEW-13, SCOPE-02, UI-10
Gốc: e91e3cd

## Làm gì, vì sao

Thêm route `GET /rooms/:id` cho staff trong phạm vi tòa: trả chi tiết phòng như `GET /rooms` cộng `furniture`, `description`, danh sách `images` (ROOM-07) và `pendingViewingCount` = số lịch NEW/CONFIRMED (ROOM-09, VIEW-13). FE-P2-07 cần để hiện số lịch chờ trước khi khóa/bảo trì và để đọc lại ảnh sau refresh (chủ dự án chọn Q-FE8A-2 B, Q-FE8A-3 A ngày 04/11/2026). Phòng ngoài phạm vi → 403 `OUT_OF_SCOPE`; không tồn tại → 404 `NOT_FOUND`; tenant → 403 `FORBIDDEN`; id không phải số → 400 `VALIDATION_FAILED`.

## File sẽ thêm / sửa / xóa ở bản chính (đích từ `Source/backend/`)

| Bản nháp | Thêm / Sửa |
|---|---|
| `src/modules/rooms/rooms.service.ts` (+12 dòng: method `get()`, dùng lại `ROOM_INCLUDE`, `toView`, `assertRoomScope`, `PENDING_VIEWING_STATUSES`) | Sửa |
| `src/modules/rooms/rooms.controller.ts` (+6 dòng: `@Get(':id')`) | Sửa |
| `src/modules/rooms/rooms.detail.spec.ts` (14 test) | Thêm |

Kèm bản nháp spec riêng `Artifacts/2026-11-04-BE-P2-GET-ROOM-spec/` thêm 1 dòng vào bảng API của `docs/spec/11-buildings-rooms.md`. Diff so với main hiện tại: chỉ thêm dòng, không xóa dòng nào; thay đổi P2-5 (`syncRoomPrices`) được giữ nguyên. `ref/` không áp dụng.

## Cách xem và kiểm tra

Từ `Source/backend`: `node ./node_modules/vitest/vitest.mjs run --config artifact_BE/2026-11-04-BE-P2-GET-ROOM/ref/vitest.preview.config.ts --reporter=dot`. Sau áp dụng: `npm run test`, `lint`, `build`; gọi thật `GET /rooms/:id` (phiên chính làm).

## Đã kiểm tra

- Tester: CP-2 và CP-3 PASS, 14 test trong `rooms.detail.spec.ts`; overlay toàn bộ unit 61 file, 1267 test đạt; oxlint 0 lỗi; đã đổi kỳ vọng tạm để thấy đỏ rồi trả lại. Bao gồm: đếm đúng NEW/CONFIRMED (bỏ DONE/CANCELLED), phòng không có ảnh, thứ tự ảnh, 3 trạng thái dẫn xuất, scope hai chiều, tenant 403, 404, routing HTTP thật (`:id` không bị `GET /rooms` nuốt, id không phải số → 400).
- Reviewer: **DUYỆT**, không lỗi chặn, không mục phải sửa. Reviewer không chạy được test; kết luận dựa trên đọc mã, test thật do tester chạy.
- `main-files.mjs check`: không file chính nào đổi.
- Chưa chạy: lint/test/build trên main sau áp dụng; gọi API thật.

## Giả định hoặc câu hỏi cho chủ dự án

- [ASSUMPTION] Phòng `is_active=false` vẫn trả 200 cho staff trong phạm vi (FE cần để mở khóa).
- [ASSUMPTION] Tòa đã khóa → manager nhận 403 `OUT_OF_SCOPE` vì khóa tòa gỡ `manager_id` (BLD-06), nên manager không xem được phòng của tòa khóa; chỉ Boss xem được.
- `pendingViewingCount` luôn có trong response (rộng hơn chữ ROOM-09), theo lựa chọn Q-FE8A-2 B của chủ dự án.
- Ảnh trả về 5 trường theo UI-10/FILE-02, không lộ `assetId`/`version`/`format`.

Đã chép vào file chính 04/11/2026 bằng apply-draft.mjs: 3 file.
