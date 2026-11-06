# P2-4b · Spec: dòng API `GET /rooms/:id`

Trạng thái: ĐÃ DUYỆT 04/11/2026
Task / spec: Q-FE8A-2/3 · ROOM-07, ROOM-09, VIEW-13
Gốc: e91e3cd

## Làm gì, vì sao

Thêm đúng một dòng vào bảng API của `docs/spec/11-buildings-rooms.md`, ngay dưới dòng `/rooms`, để ghi route chi tiết phòng `GET /rooms/:id` (staff trong phạm vi tòa) mà backend sắp bổ sung (`Source/backend/artifact_BE/2026-11-04-BE-P2-GET-ROOM/`). Không đổi chữ nào khác trong file.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/spec/11-buildings-rooms.md` | `docs/spec/11-buildings-rooms.md` | Sửa (thêm 1 dòng) |

## Cách xem và kiểm tra

- `git --no-pager diff --no-index -- "docs/spec/11-buildings-rooms.md" "Artifacts/2026-11-04-BE-P2-GET-ROOM-spec/docs/spec/11-buildings-rooms.md"` chỉ hiện một dòng `+`:
  `| GET | `/rooms/:id` | staff in scope – chi tiết phòng: như `/rooms` + `furniture`, `description`, `images` (ROOM-07) và `pendingViewingCount` (ROOM-09, VIEW-13) |`

## Đã kiểm tra

- Diff với bản chính: đúng 1 dòng thêm, 0 dòng xóa (kiểm tra bằng `git diff --no-index`).
- Tài liệu, không có test tự động.

## Giả định hoặc câu hỏi cho chủ dự án

- Không có. Hai điểm im lặng của spec (phòng đã khóa trả 200 cho staff trong phạm vi; tòa đã khóa → 403 `OUT_OF_SCOPE`) được ghi là `[ASSUMPTION]` trong `PLAN.md` mục 3, chưa đưa vào spec.

Đã chép vào file chính 04/11/2026 bằng apply-draft.mjs: 1 file.
