# Chép bản nháp đã duyệt bằng một lệnh, chỉ hỏi 1 lần

Trạng thái: ĐÃ DUYỆT 26/10/2026 ("Đồng ý, duyệt bản nháp 2026-10-26-apply-draft. Cho phép ngoại lệ lần này: chép bằng chính lệnh apply-draft.mjs trong bản nháp.")
Task / spec: (quy trình làm việc, không có mã spec)

## Làm gì, vì sao

Khi chép một bản nháp đã duyệt vào file chính, `staging-guard` hỏi lại cho từng file. Bản nháp `agent-pipeline` có 11 file nên phải bấm 11 lần. Chủ dự án chọn ngày 26/10/2026: chỉ hỏi **1 lần cho mỗi bản nháp**.

- Lệnh mới `node .claude/scripts/apply-draft.mjs <thư mục nháp>`:
  - Chỉ chạy khi `REVIEW.md` của bản nháp đã ghi `Trạng thái: ĐÃ DUYỆT …`.
  - Chép mọi file sang đích, trừ `REVIEW.md`, `PLAN.md`, `ref/` và `preview.html`.
  - Chuyển thư mục nháp vào `approved/`, rồi ghi thêm vào `REVIEW.md` một dòng ngày chép và số file.
- `staging-guard.mjs` giờ kiểm cả lệnh Bash:
  - Phiên chính chạy `apply-draft.mjs` thì hook **luôn hỏi chủ dự án 1 lần**, kèm lệnh đầy đủ để bạn thấy thư mục nào sắp được chép.
  - Agent con (coder, tester…) thì bị chặn hẳn.
  - Các lệnh Bash khác không bị ảnh hưởng.
- Quy tắc số 5 trong `CLAUDE.md` ("không ghi file chính bằng lệnh shell") có thêm ngoại lệ duy nhất là `apply-draft.mjs`.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `.claude/scripts/apply-draft.mjs` | `.claude/scripts/apply-draft.mjs` | Thêm |
| `.claude/scripts/apply-draft.test.mjs` | `.claude/scripts/apply-draft.test.mjs` | Thêm |
| `.claude/hooks/staging-guard.mjs` | `.claude/hooks/staging-guard.mjs` | Sửa: thêm nhánh kiểm lệnh Bash `apply-draft.mjs` |
| `.claude/hooks/staging-guard.test.mjs` | `.claude/hooks/staging-guard.test.mjs` | Thêm (trước đây hook này chưa có test) |
| `.claude/settings.json` | `.claude/settings.json` | Sửa: `staging-guard` chạy cả với Bash |
| `CLAUDE.md` | `CLAUDE.md` | Sửa: bước 3, quy tắc 5 và dòng "Guard" của mục "Review before changing main files" |
| `Artifacts/README.md` | `Artifacts/README.md` | Sửa: bước 3–4 của "Quy trình" |

## Cách xem và kiểm tra

`node --test Artifacts/2026-10-26-apply-draft/.claude/scripts/apply-draft.test.mjs Artifacts/2026-10-26-apply-draft/.claude/hooks/staging-guard.test.mjs`

## Đã kiểm tra

- 26/10/2026: `apply-draft.test.mjs` → 3/3 pass, chạy trên repo git tạm:
  - bản nháp chưa ĐÃ DUYỆT thì bị từ chối và không file nào được chép;
  - bản nháp `artifact_BE` được chép đúng sang `Source/backend/`, bỏ qua `PLAN.md`, `REVIEW.md`, `ref/` và `preview.html`; thư mục nháp được chuyển vào `approved/` và `REVIEW.md` có thêm dòng "Đã chép";
  - bản nháp trong `Artifacts/` được chép về gốc repo;
  - thư mục không phải bản nháp (trong `approved/`, hoặc `Source/backend/src`) thì bị từ chối.
- Lần chạy test đầu bắt được một lỗi: thư mục `approved/` chưa có thì lệnh đã chép file xong nhưng không chuyển được bản nháp. Đã sửa (lệnh tự tạo `approved/`) và chạy lại → pass.
- 26/10/2026: `staging-guard.test.mjs` → 3/3 pass:
  - sửa file chính thì hỏi; sửa trong vùng nháp hoặc `feature_*.md` thì không hỏi;
  - `apply-draft.mjs` thì hỏi khi chạy từ phiên chính, bị chặn khi chạy từ agent con;
  - lệnh Bash khác cho qua; input hỏng thì hỏi.

## Giả định hoặc câu hỏi cho chủ dự án

Những điểm tôi tự quyết, cần chủ dự án xem lại:
1. Lệnh không xóa file chính được đánh dấu "Xóa" trong `REVIEW.md`. Việc này vẫn làm tay, sau khi bạn đồng ý, vì xóa là việc khó hoàn tác.
2. Dấu `ĐÃ DUYỆT` trong `REVIEW.md` do agent ghi sau câu duyệt của bạn trong chat. Chốt chặn thật là câu hỏi xác nhận 1 lần của hook.
3. Khi đang chạy hook `staging-guard`, Claude Code hiện dòng chữ "Kiểm tra vùng nháp chờ duyệt". Từ nay dòng này cũng hiện thoáng qua với mọi lệnh Bash, vì hook giờ chạy cả với Bash.
4. Chép chính bản nháp này vào file chính: lệnh `apply-draft.mjs` chưa có ở file chính, nên lần này hoặc vẫn duyệt từng file (7 lần), hoặc bạn cho phép chạy lệnh từ ngay trong bản nháp. Chủ dự án chọn cách thứ hai, là ngoại lệ một lần cho quy tắc số 5 (xem dòng "Trạng thái").

Đã chép vào file chính 26/10/2026 bằng apply-draft.mjs: 7 file.
Kiểm tra sau khi chép 26/10/2026: 7 file chính giống hệt bản nháp (`git diff --no-index`); `node --test` 4 file test trong `.claude/` → 14/14 pass; `settings.json` hợp lệ; `staging-guard` trả về "ask" cho lệnh `apply-draft.mjs`.
