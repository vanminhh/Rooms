# Sửa đường dẫn cấu hình Codex

Trạng thái: ĐÃ DUYỆT 02/11/2026
Task / spec: không có task (sửa cấu hình Codex)
Gốc: d506f9c

## Làm gì, vì sao
- `AGENTS.md` trỏ tới `.Codex/scripts/` và `.Codex/settings.json`, nhưng script thật nằm ở `.claude/scripts/` và Codex dùng `.codex/hooks.json`. Sửa 4 dòng (14, 18, 55, 61) cho khớp thực tế, đổi `.Codex` thành `.codex`.
- `.codex/hooks.json` dùng đường dẫn tuyệt đối `C:\Users\Nguyen Danh Toan\Rooms\...`, chỉ chạy trên máy này. Đổi sang đường dẫn tương đối `node .codex/hooks/<tên>.mjs`.

## File sẽ thêm / sửa / xóa ở bản chính
| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `AGENTS.md` | `AGENTS.md` | Sửa |
| `.codex/hooks.json` | `.codex/hooks.json` | Sửa |

## Cách xem và kiểm tra
- `diff AGENTS.md ../../AGENTS.md` và `diff .codex/hooks.json ../../.codex/hooks.json`: chỉ 4 dòng của `AGENTS.md` và 2 dòng `command` của `hooks.json` khác nhau.

## Đã kiểm tra
- `hooks.json` nháp là JSON hợp lệ.
- `AGENTS.md` nháp giữ nguyên CRLF như bản chính; không còn chuỗi `.Codex`.
- Các file được trỏ tới đều tồn tại: `.claude/scripts/apply-draft.mjs`, `.claude/scripts/main-files.mjs`, `.codex/hooks/staging-guard.mjs`, `.codex/hooks/agent-guard.mjs`.
- Chạy thử hai hook từ gốc repo với dữ liệu mẫu: cả hai thoát mã 0.

## Giả định hoặc câu hỏi cho chủ dự án
- [ASSUMPTION] Codex chạy hook với thư mục làm việc là gốc repo, nên đường dẫn tương đối `.codex/hooks/...` hoạt động. Chưa kiểm chứng trong Codex thật; nếu hook không chạy, báo lại để đổi cách.
- Chưa sửa (ngoài phạm vi): `AGENTS.md` còn nội dung cũ so với `CLAUDE.md` (phần Status "Nothing implemented yet", đường dẫn `docs/database/`, `Source/backend/AGENTS.md`, tên model Sonnet/Opus). Bạn muốn đồng bộ thì báo, sẽ làm bản nháp riêng.

Đã chép vào file chính 02/11/2026 bằng apply-draft.mjs: 2 file.
