# Phase 4 · Part 3 – Backend: late-readings mail and invoice reminders (BE-P4-14..17)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P4-2 committed |
| Unblocks | – |
| How | main session builds; reviewer before the stop |
| Part done when | BE-P4-17 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md` or `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P4-1..12) and `docs/spec/00-overview.md` – D-05, D-09..D-14, D-21, D-35, D-38, D-40, D-41, D-42, **D-44**, A-01, A-04, A-06, A-09, A-10, A-21
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (what exists, schema), §3 (architecture), §7 (risks and test strategy), §8 (rights)
4. `docs/spec/19-notifications.md` – NOTI-04..07, NOTI-10; `docs/spec/01-architecture.md` – LOC-06
5. Code: `src/modules/mailer/*` (`emailTemplate`), `src/jobs/`

## Scope

In: NOTI-10 mail to Boss (2nd→10th), NOTI-05 reminders at 08:00 with one catch-up at start-up (D-44), mail templates, `notifications` rows (D-44).
Out: the in-app inbox page (Phase 5).

## Tasks

- [ ] **BE-P4-14** Job 08:00 mùng 2→mùng 10 + bù lúc khởi động trong khoảng đó, tối đa một mail/ngày (NOTI-10, D-42): mọi DRAFT MONTHLY đã qua ngày thu ít nhất một ngày trọn, kể cả draft tháng trước; gom theo tòa kèm quản lý; nêu phòng, người thuê, thiếu chỉ số nào; danh sách rỗng hoặc Boss không có email → không gửi, chỉ log; tiếng Việt (LOC-06); lỗi gửi log và thử lại một lần (NOTI-07).
  Done when: test `NOTI-10` cho mùng 2, mùng 10 (gửi) và mùng 11 (không gửi); chạy hai lần trong ngày → một mail; không có draft → không gửi.
- [ ] **BE-P4-15** Job 08:00 nhắc hóa đơn (NOTI-05): đến hạn ngày mai; quá hạn ngày 1, 4, 7… sau `due_date`; hợp đồng hết hạn trong 30 và 7 ngày (người thuê + quản lý); chỉ gửi cho người có email (NOTI-04), ngôn ngữ theo `users.locale` (LOC-06); bù hay bỏ theo Q-P4-4.
  Done when: hóa đơn hạn 31/10 → nhắc 30/10; quá hạn được nhắc đúng ngày 1/4/7, không nhắc ngày 2, 3; chạy hai lần cùng ngày không nhắc trùng.
- [ ] **BE-P4-16** Mẫu mail trong `settings.email_templates` theo khuôn `emailTemplate` (NOTI-07) với danh sách placeholder bắt buộc; nhớ cập nhật `EXPECTED_COUNTS` nếu seed thêm khóa.
  Done when: mẫu tùy biến thiếu placeholder bắt buộc → dùng mẫu mặc định; test danh sách khóa mẫu khớp spec.
- [ ] **BE-P4-17** ⏸ lint + test + build; reviewer. Done when: output thật, nêu `[ASSUMPTION]`.

## Questions for the owner

<!-- Q-P4-1..12 were answered on 22/11/2026 (README.md, D-44). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
