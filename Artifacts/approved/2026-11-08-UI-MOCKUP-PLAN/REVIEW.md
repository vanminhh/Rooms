# Kế hoạch áp mockup vào giao diện + danh sách task

Trạng thái: ĐÃ DUYỆT 08/11/2026 (chủ dự án: "Duyệt, áp vào")
Task / spec: UI-01..40 · 30-frontend, 31-ui-kit (KIT-01..10), VIEW-08, ROOM-05, ROOM-07, ROOM-08, AUTH-01..10
Gốc: 2450365

## Làm gì, vì sao

Chủ dự án (08/11/2026) muốn giao diện cả 3 app theo mockup Stitch và bộ ảnh auth, làm từng task nhỏ, kiểm tay rồi duyệt từng task, có một file md để đánh dấu tiến độ. Bản 2 đã rà soát bản 1: 16 lỗ hổng và cách sửa nằm ở `PLAN.md` mục 1.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/phase-ui/feature_ui-mockup.md` | `docs/phase-ui/feature_ui-mockup.md` | Thêm |
| `PLAN.md` | không chép (lưu ở `approved/` làm lịch sử) | – |

Sau khi chép, ô đánh dấu trong `feature_ui-mockup.md` được sửa thẳng (ngoại lệ của CLAUDE.md cho `feature_*.md`). File dùng thêm dấu `[?]` = "AI xong, chờ kiểm tay".

## Cách xem và kiểm tra

Đọc `PLAN.md` (lỗ hổng, quyết định) và `docs/phase-ui/feature_ui-mockup.md` (20 task, mỗi task có "Xong khi" và "Bạn kiểm tay").

## Đã kiểm tra

- Đối chiếu code: `/` dùng `PublicHomePage` qua `PlaceholderPage`; `RoomsHeader` dùng ở cả 3 layout; font chỉ nạp Taviraj 200/300/400; `rooms.css` bo góc 2 px, tiêu đề 300; `tests/form-fields.test.mjs`, `tests/p2/qa-fixes.test.mjs` đọc thẳng `rooms.css`; tên các file test nêu trong task đều có.
- Máy không có công cụ chuyển WebP (`sharp`, Pillow) → UI-03 do chủ dự án làm bằng squoosh.app.
- Chưa mở giao diện thật trên trình duyệt; chưa kiểm DB dev có phòng nhiều ảnh để thử UI-23.

## Giả định hoặc câu hỏi cho chủ dự án

- Cách làm "không subagent, không pipeline" lệch với mục "Agent pipeline" của `CLAUDE.md` (cho tính năng/màn giao diện). Tôi ghi đây là quyết định riêng cho đợt giao diện này; `CLAUDE.md` giữ nguyên.
- Thông số WebP (chiều rộng, chất lượng, ≤ 300 KB) là đề xuất; đổi được khi duyệt.

Đã chép vào file chính 08/11/2026 bằng apply-draft.mjs: 1 file.
