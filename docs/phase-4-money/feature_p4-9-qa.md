# Phase 4 · Part 9 – QA and closing the phase (QA-P4-01..06)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | every other part committed |
| Unblocks | Phase 5 |
| How | main session; manual walk with the owner |
| Part done when | QA-P4-06 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md` or `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P4-1..12) and `docs/spec/00-overview.md` – D-05, D-09..D-14, D-21, D-35, D-38, D-40, D-41, D-42, **D-44**, A-01, A-04, A-06, A-09, A-10, A-21
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (what exists, schema), §3 (architecture), §7 (risks and test strategy), §8 (rights)
4. Acceptance sections of `docs/spec/14-contracts.md` (money lines), `15-meters.md`, `16-billing.md`, `17-bank.md`
5. `docs/phase-3-contracts/p3-8-qa-checklist.md` (format), `scripts/e2e/cleanup.mjs`

## Scope

In: acceptance, DB checker, e2e, regression, dev DB cleanup, closing texts.
Out: new features.

## Tasks

- [x] **QA-P4-01** Chạy hết mục "Acceptance" của `15-meters.md`, `16-billing.md` (16 dòng), `17-bank.md` (5 dòng) và các dòng tiền của `14-contracts.md`; đánh dấu từng dòng kèm tên test.
- [x] **QA-P4-02** `node prisma/check-constraints.mjs . prisma` — báo **số thật** bộ kiểm in ra (gần nhất 107/107); thêm kịch bản nếu có đổi ràng buộc.
- [x] **QA-P4-03** e2e trên DB dev theo lệnh trong `docs/LESSONS.md` (`.env` ở `Source/backend`): chốt chỉ số → phát hành → webhook khớp → quyết toán; chạy riêng ca nghi ngờ trước khi kết luận lỗi logic (bài học QA-P3-02 về khóa advisory và timeout 30 s).
- [x] **QA-P4-04** Hồi quy: đăng nhập 4 vai trò + lối vào (D-43), lịch hẹn, giá và duyệt giá, trang công khai, vòng cọc của Phase 3 (ký → thu cọc → vào ở → hủy).
- [x] **QA-P4-05** `scripts/e2e/cleanup.mjs` chế độ list (chỉ `--apply` khi chủ dự án đồng ý); dọn dữ liệu thử của lượt này.
- [x] **QA-P4-06** ⏸ Cập nhật `PROGRESS.md`, `docs/spec/README.md` mục Status, `02-database.md` nếu schema đổi, `LESSONS.md`; viết `p4-9-qa-checklist.md`; đề nghị thông điệp commit kèm mã task và mã spec.

## Questions for the owner

<!-- Q-P4-1..12 were answered on 22/11/2026 (README.md, D-44). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

23/11/2026 — Phiên QA gặp lỗi kết nối dev. Ngày 24/11/2026 chủ dự án xác nhận kết quả CLEANED và đóng QA-P4-05. Bằng chứng từng mục ở [checklist](p4-9-qa-checklist.md).
