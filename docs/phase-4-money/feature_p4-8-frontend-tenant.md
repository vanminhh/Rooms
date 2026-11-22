# Phase 4 · Part 8 – Frontend: tenant invoices, Vietnamese + English (FE-P4-10..14)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | FE-P4-01 committed |
| Unblocks | P4-9 |
| How | main session builds |
| Part done when | FE-P4-14 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md` or `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P4-1..12) and `docs/spec/00-overview.md` – D-05, D-09..D-14, D-21, D-35, D-38, D-40, D-41, D-42, **D-44**, A-01, A-04, A-06, A-09, A-10, A-21
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (what exists, schema), §3 (architecture), §7 (risks and test strategy), §8 (rights)
4. `docs/spec/30-frontend.md` – rows `/thue`, `/thue/hoa-don`, `/thue/hoa-don/:id`; LOC-01..06, UI-07, UI-12
5. Code: `src/pages/tenant/`, `src/shared/i18n/`

## Scope

In: tenant invoice list and detail with VietQR, bilingual.
Out: "Báo lỗi thanh toán" (Phase 5), the inbox (Phase 5).

## Tasks

- [ ] **FE-P4-10** `/thue/hoa-don`: danh sách, chưa thanh toán/quá hạn lên đầu, 4 trạng thái UI-03.
- [ ] **FE-P4-11** `/thue/hoa-don/:id`: dòng + dòng bậc điện + mốc chỉ số (kèm ảnh nếu có, D-38), ảnh VietQR và nội dung `TT{id}` có nút copy, tự làm mới trạng thái khi focus.
- [ ] **FE-P4-12** Song ngữ (LOC-01, UI-12): toàn bộ chữ mới vào từ điển vi/en, tiền `2.984.000 đ` và ngày `dd/mm/yyyy` ở cả hai (LOC-05).
- [ ] **FE-P4-13** Nút "Báo lỗi thanh toán" ẩn tới Phase 5 (REQ-07 thuộc Phase 5) `[ASSUMPTION]`.
- [ ] **FE-P4-14** ⏸ lint + build + test:components; kiểm tay ở 360 px.

## Questions for the owner

<!-- Q-P4-1..12 were answered on 22/11/2026 (README.md, D-44). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- Nghiệm thu hạn cuối tháng (22/11/2026): người thuê thấy hóa đơn tháng của mình chưa trả hiển thị đỏ với nhãn “Quá hạn” từ ngày đầu tháng tiếp theo theo giờ Việt Nam.
