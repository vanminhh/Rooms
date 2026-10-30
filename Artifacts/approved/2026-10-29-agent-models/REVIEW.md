# Đổi model và mức effort của 5 agent

Trạng thái: ĐÃ DUYỆT 29/10/2026 ("Duyệt")
Task / spec: (cấu hình Claude Code, không có mã spec)
Gốc: 9536e8d

## Làm gì, vì sao

Chủ dự án chọn ngày 29/10/2026. Riêng Sonnet: chủ dự án chọn bản 5.5 thay vì Sonnet 5 (cùng giá, mới hơn).

| Agent | Trước | Sau | Effort |
|---|---|---|---|
| orchestrator | `sonnet` | `claude-haiku-5-5` | high |
| planner | `opus` | `claude-opus-5-5` | high |
| coder | `sonnet` | `claude-haiku-5-5` | high |
| tester | `sonnet` | `claude-sonnet-5-5` | high |
| reviewer | `opus` | `claude-sonnet-5-5` | medium |

- Mỗi agent ghi đúng mã phiên bản thay vì tên chung (`opus`, `sonnet`), để không tự đổi sang model mới khi Anthropic ra bản mới.
- Trước đây các agent không đặt `effort` nên dùng chung mức của phiên đang chạy. Giờ mỗi agent có mức riêng, khai báo trong phần đầu file của nó.
- Mục "Agent pipeline" trong `CLAUDE.md` cập nhật tên model và effort theo bảng trên, kèm một dòng nhắc: khi đổi model hay effort thì sửa cả file agent lẫn `CLAUDE.md`.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `.claude/agents/orchestrator.md` | `.claude/agents/orchestrator.md` | Sửa: dòng `model`, thêm `effort` |
| `.claude/agents/planner.md` | `.claude/agents/planner.md` | Sửa: dòng `model`, thêm `effort` |
| `.claude/agents/coder.md` | `.claude/agents/coder.md` | Sửa: dòng `model`, thêm `effort` |
| `.claude/agents/tester.md` | `.claude/agents/tester.md` | Sửa: dòng `model`, thêm `effort` |
| `.claude/agents/reviewer.md` | `.claude/agents/reviewer.md` | Sửa: dòng `model`, thêm `effort` |
| `CLAUDE.md` | `CLAUDE.md` | Sửa: tên model và effort trong mục "Agent pipeline" |

## Cách xem và kiểm tra

`git diff --no-index -- .claude/agents Artifacts/2026-10-29-agent-models/.claude/agents`

## Đã kiểm tra

- 29/10/2026, kiểm tra tên model: theo tài liệu Claude API, cả 3 mã `claude-haiku-5-5`, `claude-opus-5-5`, `claude-sonnet-5-5` đều tồn tại, và cả 3 model đều nhận mức effort `medium` và `high`.
- 29/10/2026, chạy thử thật bằng Claude Code (`claude -p`) trong thư mục tạm ngoài repo:
  - Mỗi agent thử giữ nguyên phần đầu file của bản nháp (tên, công cụ, model, effort), chỉ thay phần prompt bằng việc "gọi Glob một lần rồi trả lời OK".
  - Model đọc từ log phản hồi; effort đọc từ dữ liệu hook nhận được.

  | Agent | Model chạy thật | Effort chạy thật |
  |---|---|---|
  | orchestrator | `claude-haiku-5-5` | high |
  | planner | `claude-opus-5-5` | high |
  | coder | `claude-haiku-5-5` | high |
  | tester | `claude-sonnet-5-5` | high |
  | reviewer | `claude-sonnet-5-5` | medium |

  Cả 5 agent khớp đúng cấu hình.

## Giả định hoặc câu hỏi cho chủ dự án

1. Coder trước dùng Sonnet, giờ dùng Haiku 5.5, rẻ hơn nhiều ($0.10/$0.50 so với $2/$10 cho mỗi 1 triệu token). Haiku yếu hơn khi viết code khó, nên có thể sẽ phải sửa nhiều vòng hơn. Nếu thấy tester báo `FAIL` nhiều, có thể nâng coder lên lại.
2. Reviewer trước dùng Opus, giờ dùng Sonnet 5.5 ở mức medium. Soi sẽ nhanh và rẻ hơn, nhưng có thể bắt sót lỗi tinh vi hơn so với trước.
3. Khi chép vào file chính sẽ dùng `apply-draft.mjs`, nên bạn chỉ phải xác nhận 1 lần.

Đã chép vào file chính 29/10/2026 bằng apply-draft.mjs: 6 file.
Kiểm tra sau khi chép 29/10/2026: 6 file chính giống hệt bản nháp; phần đầu 5 file agent đúng model và effort đã duyệt; `node --test .claude/hooks/*.test.mjs .claude/scripts/*.test.mjs` → 15/15 pass. Lần chạy đầu `apply-draft.mjs` từ chối vì thiếu dòng `Gốc` (quy định mới), không chép file nào; đã ghi `Gốc: 9536e8d` rồi chạy lại.
