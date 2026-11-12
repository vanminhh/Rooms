# Phase Extra · Part 6 – Backend viewings: account, hourly booking, confirmation (BE-EX-17..24)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

Rewritten 12/11/2026 after the owner's final decisions (D-28..D-30, D-34): no time proposals, no history table, no claiming of old viewings. Task IDs BE-EX-25..27 are retired.

| | |
|---|---|
| Fixes | Phase 2 (viewings, "Việc hôm nay") |
| Needs first | EX-1 committed. Not at the same time as another part with a migration (EX-5) |
| Unblocks | EX-7, EX-8 |
| How | planner writes `plans/EX-6/PLAN.md` → main session builds → reviewer before the last stop (authorization + schema + concurrency) |
| Part done when | BE-EX-24 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` – D-28..D-31, D-34, A-03, A-13, A-14, Q-12 (answered)
3. `docs/spec/13-viewings.md` – all of it (flow, VIEW-01..22, API, acceptance)
4. `docs/spec/10-auth.md` – AUTH-12, SCOPE-02..05; `docs/spec/11-buildings-rooms.md` – ROOM-05, ROOM-09, BLD-04, BLD-06, PUB-05
5. `docs/spec/02-database.md` – DB-07, "Planned changes" (row EX-6); `docs/spec/19-notifications.md` – NOTI-06, NOTI-07, NOTI-08
6. Code: `src/modules/viewings/` (everything, including `viewing-slot.ts` and the specs), `src/modules/notifications/dashboard.service.ts`, `src/modules/buildings/building-contact.service.ts`, `src/modules/mailer/`, `src/common/date/`, `src/common/scope/`, `test/viewings.e2e-spec.ts`, `scripts/e2e/`

## Scope

In: VIEW-01..04 and VIEW-07..22 on the backend, the dashboard counts of VIEW-07, the two viewing emails through the existing `MailerService` (it logs in dev), removing `POST /public/viewings`.
Out: VIEW-05 and VIEW-06 (contracts, Phase 3 – keep what they need: status `WON` only by contract, a function that cancels the other open viewings of a room), a real email provider and the final email templates (EX-8), every frontend change (EX-7).

## Tasks

- [ ] **BE-EX-17** ⏸ Migration `viewing_hours` (ask the owner before creating and before applying): `viewings.user_id null`, `visit_at timestamptz null`, statuses `DONE` and `NO_SHOW`, how and when it was confirmed (`PHONE` / `EMAIL`), who cancelled; `visit_date` + `time_slot` become nullable and stay for old rows; CHECK "`visit_at`, or `visit_date` and `time_slot`". Old rows are not rewritten. New DB-check scenarios: a viewing with neither time form is refused, an old slot viewing is still valid.
  Done when: `prisma migrate diff` shows only these changes; DB check passes all scenarios; every existing viewing still loads.
- [ ] **BE-EX-18** Time rule (VIEW-08): one helper for "on the hour, 8:00–19:00, in the future, at most 30 days ahead, Asia/Ho_Chi_Minh"; `viewing-slot.ts` stays only to label old rows.
  Done when: tests `VIEW-08: …` for 7:00, 8:00, 10:30, 19:00, 20:00, a past hour today, day 31, and the day boundary in Hà Nội time.
- [ ] **BE-EX-19** Booking with an account (VIEW-01, VIEW-02, VIEW-16): `POST /me/viewings` for GUEST and TENANT; name and phone copied from the account; daily limit 3 per account; the hour is held per person responsible (VIEW-07): refused with `VIEWING_TIME_TAKEN` when that person already has a NEW or CONFIRMED viewing at that hour in any room of their buildings. Limit, hold check and insert run in one transaction under advisory locks. `no-store` on the answer.
  Done when: acceptance lines 1, 2 and 6 of spec 13; the parallel case of line 6 runs real concurrent requests in e2e.
- [ ] **BE-EX-20** ⏸ Remove the public form: delete `POST /public/viewings`, its controller, honeypot, per-IP and per-phone limits and their tests (VIEW-02, VIEW-11, VIEW-12). Ask the owner before deleting the files. `POST /viewings` (staff, manual) and `PATCH /viewings/:id` take `visitAt` with the rules of VIEW-08 and VIEW-16 (VIEW-03, VIEW-09).
  Done when: no route `POST /public/viewings`; a manual viewing or a time change into a held hour → `VIEWING_TIME_TAKEN`; `npm run test` passes. Stop and report BE-EX-17..20.
- [ ] **BE-EX-21** Free hours and own viewings (VIEW-20, VIEW-21): `GET /public/rooms/:id/viewing-times?from&to` (at most 31 days; future hours not held for the room's person responsible; no guest data; cached like other public GETs); `GET /me/viewings`, `GET /me/viewings/:id` with the public contact of the person responsible.
  Done when: acceptance lines 7 and 11 of spec 13; another user's id → 404.
- [ ] **BE-EX-22** New-booking email (VIEW-19, NOTI-07): after the booking transaction, one email to the building's active manager when they have an email, else to Boss, with the guest's name, phone and email, room, building, date and hour, note; Vietnamese; a failure is logged, retried once and never fails the booking. No email for manual viewings.
  Done when: acceptance line 8 of spec 13, with a fake mailer.
- [ ] **BE-EX-23** ⏸ Confirm, cancel, outcome (VIEW-04, VIEW-15, VIEW-17, VIEW-18): `POST /viewings/:id/confirm { via }` – `PHONE` sets CONFIRMED; `EMAIL` sends the guest the confirmation email in their language and sets CONFIRMED only when it was sent, refused when the owner account has no email; `POST /me/viewings/:id/cancel` before the start time only, storing which side cancelled and freeing the hour; staff set `DONE` / `NO_SHOW` only after the start time; `WON` never by `PATCH`; a NEW viewing past its start is flagged `overdue` and changes nothing by itself.
  Done when: acceptance lines 5, 9 and 10 of spec 13. Stop and report BE-EX-21..23.
- [ ] **BE-EX-24** ⏸ Dashboard and closing (VIEW-07, VIEW-13, VIEW-22): `GET /dashboard` counts NEW viewings and lists overdue ones and open viewings that share an hour after a manager change (`overlap`); locking a room or building still keeps its viewings. `npm run lint`, `test`, `build`, `test:e2e` (rewrite `test/viewings.e2e-spec.ts`; an old slot viewing can still be confirmed, cancelled and given an exact hour – acceptance line 12). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; `dashboard.service.spec.ts` updated with spec values; list the `[ASSUMPTION]`s used (A-03, A-13, A-14).

## Questions for the owner

- Q-EX6-1 (BE-EX-19): một tài khoản có được giữ nhiều lịch đang mở cho **cùng một phòng** không? Spec chỉ giới hạn 3 lượt đặt mỗi ngày.
  Đề xuất: không – mỗi tài khoản một lịch đang mở (NEW hoặc CONFIRMED) cho mỗi phòng.
- Q-EX6-2 (BE-EX-23): tài khoản người thuê do nhân sự tạo có thể không có email. Khi đó nút "Gửi email xác nhận" bị ẩn và quản lý chỉ xác nhận bằng gọi điện. Đồng ý?
  Đề xuất: đồng ý.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
