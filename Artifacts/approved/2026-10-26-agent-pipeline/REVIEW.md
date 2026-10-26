# Quy trình agent: orchestrator điều phối planner → coder → tester → reviewer

Trạng thái: ĐÃ DUYỆT 26/10/2026 ("Đồng ý, duyệt bản nháp 2026-10-26-agent-pipeline. Chép vào file chính.")
Task / spec: (cấu hình Claude Code, không có mã spec)

## Làm gì, vì sao

Khi một AI làm hết mọi việc thì dễ tràn context, và test do chính người viết code viết thì dễ "xanh ảo". Bản nháp này tách việc cho 5 agent. Mỗi agent bắt đầu với context sạch và chỉ nhận đường dẫn file. Agent `orchestrator` chạy cả chuỗi bên trong context riêng của nó, nên phiên chính chỉ nhận tin `DỪNG` (khi cần chủ dự án) hoặc `XONG` kèm báo cáo của reviewer.

| Agent | Model | Được làm | Bị chặn |
|---|---|---|---|
| orchestrator | `sonnet` (Sonnet 5.5) | gọi 4 agent dưới theo thứ tự, chỉ truyền đường dẫn và báo cáo; trả về `DỪNG` hoặc `XONG` | không có công cụ ghi (không có Edit/Write/Bash) |
| planner | `opus` (Opus 5.5) | đọc và viết `PLAN.md`: kiến trúc, câu hỏi bỏ ngỏ, checkpoint kèm kịch bản test | hook chặn ghi bất kỳ file nào khác `PLAN.md` |
| coder | `sonnet` | code đúng một checkpoint trong vùng nháp, chạy build và lint | hook chặn sửa file test và `PLAN.md` |
| tester | `sonnet` | tự viết test từ spec và `PLAN.md`, test nhiều kịch bản, chứng minh test có thể rớt; rớt thì dừng và báo `FAIL` | hook chặn sửa code của coder |
| reviewer | `opus` | đọc toàn bộ diff giữa bản nháp và file chính; kết luận `DUYỆT` hoặc `CHẶN`, mỗi lỗi kèm `file:dòng` | không có Edit/Write; hook chỉ cho Bash chạy một lệnh git chỉ đọc |

Theo lựa chọn của chủ dự án ngày 26/10/2026:
- Coder và tester dùng Sonnet mới nhất.
- Reviewer không đọc plan, checkpoint hay ghi chú của coder/tester, nhưng có đọc spec và luật dự án.
- Reviewer soi bản nháp trước khi trình duyệt.
- Test rớt thì trả coder sửa, tối đa 2 vòng, sau đó hỏi chủ dự án.
- `DUYỆT` / `CHẶN` của reviewer chỉ là đề xuất. Bản nháp luôn được trình kèm báo cáo đầy đủ, và chủ dự án quyết định gộp hay phải sửa thêm. Nếu sửa thêm thì quay lại coder (hoặc tester nếu lỗi nằm ở test), test lại, review lại.
- Có agent thứ 5 `orchestrator` chạy cả chuỗi; phiên chính chỉ nhận báo cáo của reviewer, hoặc tin `DỪNG` khi cần hỏi chủ dự án.
- Phiên chính so trạng thái file chính trước và sau mỗi lần chạy orchestrator, rồi báo cho chủ dự án nếu có file chính bị đổi. Prompt của tester có thêm câu cấm ghi file bằng lệnh shell.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `.claude/agents/orchestrator.md` | `.claude/agents/orchestrator.md` | Thêm |
| `.claude/agents/planner.md` | `.claude/agents/planner.md` | Thêm |
| `.claude/agents/coder.md` | `.claude/agents/coder.md` | Thêm |
| `.claude/agents/tester.md` | `.claude/agents/tester.md` | Thêm |
| `.claude/agents/reviewer.md` | `.claude/agents/reviewer.md` | Thêm |
| `.claude/settings.json` | `.claude/settings.json` | Sửa: thêm hook `agent-guard.mjs` cho Bash/Edit/Write, giữ nguyên `staging-guard` |
| `.claude/hooks/agent-guard.mjs` | `.claude/hooks/agent-guard.mjs` | Thêm |
| `.claude/hooks/agent-guard.test.mjs` | `.claude/hooks/agent-guard.test.mjs` | Thêm |
| `.claude/scripts/main-files.mjs` | `.claude/scripts/main-files.mjs` | Thêm |
| `.claude/scripts/main-files.test.mjs` | `.claude/scripts/main-files.test.mjs` | Thêm |
| `CLAUDE.md` | `CLAUDE.md` | Sửa: thêm mục "Agent pipeline" sau "How to work on a module" |

## Cách xem và kiểm tra

- Đọc 5 file trong `.claude/agents/` và mục "Agent pipeline" trong `CLAUDE.md` của bản nháp.
- Chạy test hook và script: `node --test Artifacts/2026-10-26-agent-pipeline/.claude/hooks/agent-guard.test.mjs Artifacts/2026-10-26-agent-pipeline/.claude/scripts/main-files.test.mjs`
- Sau khi chép vào file chính: mở lại Claude Code rồi gõ `/agents` để thấy 5 agent. Thử chạy reviewer trên chính thư mục nháp này để chắc hook chặn được lệnh ghi.

## Đã kiểm tra

- 26/10/2026: `node --test …/agent-guard.test.mjs` → 6/6 pass. Các trường hợp được kiểm:
  - planner chỉ ghi được `PLAN.md`;
  - coder không ghi được `*.spec.ts`, `tests/`, `PLAN.md`;
  - tester không ghi được code;
  - reviewer bị chặn các lệnh `>`, `--output=`, `&&`, `|`, `$(…)`, `git checkout`, `git branch -D`, `git -c …`, `rm`, lệnh xuống dòng;
  - reviewer không ghi được file;
  - phiên chính và các agent khác không bị giới hạn;
  - input hỏng thì hook hỏi chủ dự án chứ không tự cho qua.
- 26/10/2026: `node --test …/main-files.test.mjs` → 2/2 pass, chạy trên một repo git tạm. Script báo đúng 4 loại thay đổi: file đang sạch bị sửa, file đã sửa sẵn bị sửa thêm lần nữa, file mới, file bị xóa. Script bỏ qua file trong vùng nháp và file `feature_*.md`. Chạy `check` mà chưa `save` thì báo lỗi.
- 26/10/2026: chạy `save` rồi `check` ngay trên repo này → "Không có file chính nào bị đổi.". Bản lưu nằm trong `.git/`, không hiện ra trong `git status`.
- 26/10/2026, thử bằng Claude Code 2.1.310 chạy `claude -p` trong thư mục tạm ngoài repo (chủ dự án yêu cầu thử trước khi duyệt):
  - Cả 5 agent thật đều nạp được và hiện đúng mô tả.
  - Hook khai báo trong file agent (`hooks:` ở đầu file) **không chạy**, kể cả khi gọi trực tiếp 1 tầng. Tài liệu Claude Code giải thích: loại hook này chỉ chạy khi thư mục đã được bấm tin cậy (workspace trust). Nếu hỏng, nó im lặng cho qua. Vì vậy tôi bỏ cách này.
  - Hook chung trong `.claude/settings.json` **có chạy** cho agent con ở cả tầng 1 và tầng 2. Dữ liệu hook nhận được có `agent_type`, cho biết agent nào đang gọi lệnh.
  - Thử lồng 2 tầng (phiên chính → orchestrator → từng vai trò), với `agent-guard.mjs` mới đặt trong settings:
    - planner tạo được `PLAN.md`, bị chặn khi tạo `plan-code.ts`;
    - coder tạo được `coder.ts`, bị chặn khi tạo `coder.spec.ts`;
    - tester tạo được `tester.test.ts`, bị chặn khi tạo `tester.ts`;
    - reviewer bị chặn khi chạy `echo x > reviewer.txt` và khi tạo `reviewer.md`.
    - Không file bị cấm nào được tạo ra. Thông báo chặn hiện đúng như hook viết.
  - Trong lần thử này, planner, coder, tester, reviewer là các agent thử mang đúng tên, với prompt trung tính, để chúng không tự từ chối làm việc bị cấm. Prompt thật của các agent đã được kiểm riêng là nạp được.
- 26/10/2026, sau khi duyệt và chép bằng công cụ file (Write/Edit):
  - So từng file bằng `git diff --no-index`: cả 11 file chính giống hệt bản nháp.
  - `node --test .claude/hooks/agent-guard.test.mjs .claude/scripts/main-files.test.mjs` → 8/8 pass.
  - `.claude/settings.json` đọc được (JSON hợp lệ).
  - Chạy `main-files.mjs save` rồi `check` → "Không có file chính nào bị đổi.".
  - Chạy `claude -p` trong repo: cả 5 agent nạp đúng model (orchestrator sonnet, planner opus, coder sonnet, tester sonnet, reviewer opus).
- Chưa làm: commit. Theo bước 5 của `Artifacts/README.md`, sau khi commit sẽ dọn bản sao trong `approved/`.

## Giả định hoặc câu hỏi cho chủ dự án

Những điểm tôi tự quyết, cần chủ dự án xem lại:
1. Toàn bộ test do tester viết, coder không viết test. Đây là cách chống "xanh ảo".
2. Sửa nhỏ (lỗi chính tả, một dòng) được bỏ qua quy trình agent, nhưng vẫn phải qua bước duyệt.
3. Không có cơ chế git chặn cứng việc gộp. Người chặn là chủ dự án, khi đọc báo cáo của reviewer (repo chưa có remote, chỉ có nhánh `master`).
4. Hook chỉ chặn được việc ghi file qua Edit/Write. Nếu agent ghi file bằng lệnh shell thì hook không chặn được, nhưng `main-files.mjs check` sẽ phát hiện sau khi chạy nếu đó là file chính. Lệnh shell sửa file trong vùng nháp, ví dụ coder sửa test, thì chỉ reviewer bắt được.
5. Orchestrator dùng Sonnet, vì nó chỉ điều phối, không viết gì.
6. Claude Code bỏ qua `Agent(planner, coder, …)` trong agent con, nên việc orchestrator chỉ gọi 4 agent đúng tên chỉ được dặn trong prompt, không chặn cứng được.
7. Khi có `DỪNG`, phiên chính đánh dấu task `[!]`, hỏi chủ dự án, rồi tiếp tục orchestrator bằng `SendMessage`; agent vẫn giữ lịch sử làm việc nên không phải chạy lại từ đầu.
8. Tôi so bằng mã hash nội dung file thay vì so trực tiếp kết quả `git status`. Lý do: `git status` chỉ cho biết file đã bị sửa, không cho biết bị sửa thêm lần nữa. Hiện nhiều file chính đang sửa dở chưa commit, nên nếu chúng bị ghi đè thêm thì so `git status` không phát hiện được.
9. Có những lệnh hợp lệ tự sinh file chính, ví dụ `prisma migrate` tạo `prisma/migrations/` ở task BE-LOGIN-04. Những file này cũng bị liệt kê, và chủ dự án quyết định giữ hay bỏ.
10. Phần kiểm tra vai trò chạy từ `.claude/settings.json` cho mọi lệnh Bash/Edit/Write và nhận ra agent qua tên (`agent_type`). Với phiên chính và các agent khác, nó cho qua ngay. Nếu sau này có agent khác trùng tên `planner`, `coder`, `tester` hoặc `reviewer` (ví dụ từ plugin) thì cũng bị giới hạn theo luật này.
