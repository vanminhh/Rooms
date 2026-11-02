# Đổi lại model của planner, tester, reviewer

Trạng thái: ĐÃ DUYỆT 01/11/2026 ("Duyệt")
Task / spec: (cấu hình Claude Code, không có mã spec)
Gốc: eac272b

## Làm gì, vì sao

Chủ dự án chọn ngày 01/11/2026, đổi lại 3 trong 5 agent so với lần cấu hình trước (`Artifacts/approved/2026-10-29-agent-models/`). Coder và orchestrator giữ nguyên Haiku 5.5, effort high.

| Agent | Trước (29/10) | Sau (lần này) |
|---|---|---|
| planner | `claude-opus-5-5`, high | `claude-opus-5`, **medium** |
| tester | `claude-sonnet-5-5`, high | `claude-sonnet-5`, high |
| reviewer | `claude-sonnet-5-5`, medium | `claude-sonnet-5`, medium |
| coder | `claude-haiku-5-5`, high | không đổi |
| orchestrator | `claude-haiku-5-5`, high | không đổi |

Cả Opus 5 và Sonnet 5 đều là đời trước Opus 5.5 / Sonnet 5.5 (vẫn được phục vụ), và cả hai nhận mức effort `medium`/`high` bình thường.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `.claude/agents/planner.md` | `.claude/agents/planner.md` | Sửa: dòng `model`, `effort` |
| `.claude/agents/tester.md` | `.claude/agents/tester.md` | Sửa: dòng `model` |
| `.claude/agents/reviewer.md` | `.claude/agents/reviewer.md` | Sửa: dòng `model` |
| `CLAUDE.md` | `CLAUDE.md` | Sửa: tên model và effort của 3 agent trong mục "Agent pipeline" |

## Cách xem và kiểm tra

`git diff --no-index -- .claude/agents Artifacts/2026-11-01-agent-models-v2/.claude/agents`

## Đã kiểm tra

- 01/11/2026: 3 file target đang sạch (`git status --porcelain`), commit hiện tại `eac272b` ghi vào dòng `Gốc`.
- 01/11/2026, chạy thử thật bằng Claude Code (`claude -p`) trong thư mục tạm ngoài repo, giữ nguyên phần đầu file của bản nháp, chỉ đổi phần dặn việc:

  | Agent | Model chạy thật | Effort chạy thật |
  |---|---|---|
  | planner | `claude-opus-5` | medium |
  | tester | `claude-sonnet-5` | high |
  | reviewer | `claude-sonnet-5` | medium |

  Cả 3 khớp đúng cấu hình.

## Giả định hoặc câu hỏi cho chủ dự án

1. Planner đổi từ Opus 5.5 high sang Opus 5 medium: rẻ hơn (ít hơn cả về giá mỗi token và mức effort), nhưng là đời cũ hơn và nghĩ ít hơn, nên kế hoạch có thể kém chi tiết hơn so với lần trước.
2. Chép vào file chính dùng `apply-draft.mjs`, bạn xác nhận 1 lần.

Đã chép vào file chính 01/11/2026 bằng apply-draft.mjs: 4 file.
Kiểm tra sau khi chép 01/11/2026: 4 file chính giống hệt bản nháp; phần đầu 5 agent đúng model/effort (coder, orchestrator không đổi); `node --test .claude/hooks/*.test.mjs .claude/scripts/*.test.mjs` → 15/15 pass.
