# Phase Extra · Part 6 – Backend viewings: account, exact time, proposals (BE-EX-17..27)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Fixes | Phase 2 (viewings, "Việc hôm nay") |
| Needs first | EX-1 committed. Not at the same time as another part with a migration (EX-5, EX-8) |
| Unblocks | EX-7, EX-8 |
| How | planner writes `plans/EX-6/PLAN.md` → main session builds → reviewer before the last stop (authorization + schema + concurrency) |
| Part done when | BE-EX-27 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` – D-28..D-31, A-03, A-13, A-14, Q-12 (answered)
3. `docs/spec/13-viewings.md` – all of it (VIEW-01..23, API, acceptance)
4. `docs/spec/10-auth.md` – AUTH-12, AUTH-14, SCOPE-02..05; `docs/spec/11-buildings-rooms.md` – ROOM-05, ROOM-09, BLD-04, BLD-06, PUB-05
5. `docs/spec/02-database.md` – DB-07, "Planned changes" (rows EX-6); `docs/spec/19-notifications.md` – NOTI-06; `docs/spec/20-reports-audit-settings.md` – AUD-01
6. Code: `src/modules/viewings/` (everything, including `viewing-slot.ts` and the specs), `src/modules/notifications/dashboard.service.ts`, `src/modules/buildings/building-contact.service.ts`, `src/common/date/`, `src/common/scope/`, `test/viewings.e2e-spec.ts`, `scripts/e2e/`

## Scope

In: VIEW-01..04, VIEW-07..23 on the backend, `GET /public/rooms/:id/viewing-times`, the dashboard counts of VIEW-07, removing `POST /public/viewings`.
Out: VIEW-05 and VIEW-06 (contracts, Phase 3 – keep the hooks they need: status `WON` only by contract, a function that cancels the other viewings of a room and expires their proposals), sending notifications (EX-8 – this part only writes `viewing_events`), every frontend change (EX-7).

## Tasks

- [ ] **BE-EX-17** ⏸ Migration `viewing_proposals` (ask the owner before creating and before applying): `viewings.user_id null`, `visit_at timestamptz null`, statuses `DONE` and `NO_SHOW`, who cancelled; `visit_date` + `time_slot` become nullable and stay for old rows; CHECK "`visit_at`, or `visit_date` and `time_slot`"; table `viewing_proposals` with a partial unique index "one PENDING per viewing"; table `viewing_events`. Old rows are not rewritten. New DB-check scenarios: two PENDING proposals refused, a viewing with neither time form refused, an old slot viewing still valid.
  Done when: `prisma migrate diff` shows only these changes; DB check passes all scenarios; every existing viewing still loads.
- [ ] **BE-EX-18** Time rule (VIEW-08): one helper for "future, at most 30 days ahead, start 8:00–19:30 on the hour or half hour, Asia/Ho_Chi_Minh"; `viewing-slot.ts` stays only to label old rows.
  Done when: tests `VIEW-08: …` for 7:30, 8:00, 10:15, 19:30, 20:00, a past time, day 31, and the day boundary in Hà Nội time.
- [ ] **BE-EX-19** Guest booking and reading (VIEW-01, VIEW-02, VIEW-20): `POST /me/viewings`, `GET /me/viewings`, `GET /me/viewings/:id` for GUEST and TENANT with a verified phone; name and phone copied from the account; daily limit 3 per account under an advisory lock; answers carry `Cache-Control: no-store`.
  Done when: acceptance lines 1, 2 and 12 of spec 13; another user's id → 404.
- [ ] **BE-EX-20** ⏸ Remove the public form: delete `POST /public/viewings`, its controller, honeypot, per-IP and per-phone limits and their tests (VIEW-02, VIEW-11, VIEW-12). Ask the owner before deleting the files. `POST /viewings` (staff, manual) takes `visitAt` (VIEW-03).
  Done when: no route `POST /public/viewings`; `npm run test` passes; stop and report BE-EX-17..20.
- [ ] **BE-EX-21** Proposals (VIEW-14): guest `POST /me/viewings/:id/proposals`, staff `POST /viewings/:id/proposals`; one PENDING per viewing; a proposal from the other side rejects the pending one, one from the same side withdraws it; the time in effect and the status do not change. Staff `PATCH /viewings/:id` no longer accepts a time (VIEW-09).
  Done when: acceptance line 6 of spec 13; `PATCH` with a time → `VALIDATION_FAILED`.
- [ ] **BE-EX-22** Answers (VIEW-15, VIEW-16): accept and reject for both sides; staff "confirm" of a NEW viewing; accept re-checks the time rule and the double-booking rule in one transaction, with a conditional update on the proposal and an advisory lock on the person responsible (VIEW-07: the building's active manager, else Boss).
  Done when: acceptance lines 7 and 8 of spec 13 (the parallel test runs real concurrent requests in e2e); a confirmed 10:00 blocks 9:30 and 10:30 and allows 9:00 and 11:00 for the same person.
- [ ] **BE-EX-23** ⏸ Expiry (VIEW-17, A-13): a PENDING proposal past its limit cannot be answered (`PROPOSAL_EXPIRED`) and reads as expired; a NEW viewing past its requested time is flagged `overdue` for staff and changes nothing by itself. `GET /public/rooms/:id/viewing-times?date=` lists the start times of that day still free for the person responsible, with no personal data.
  Done when: acceptance line 9 of spec 13; the times endpoint hides a time blocked by a confirmed viewing and shows one that only has NEW requests. Stop and report BE-EX-21..23.
- [ ] **BE-EX-24** Cancel and outcome (VIEW-04, VIEW-18): `POST /me/viewings/:id/cancel` before the start time only; which side cancelled is stored; staff set `DONE` / `NO_SHOW` only after the start time; `CONFIRMED` → `LOST` still allowed with a note; `WON` never by `PATCH`.
  Done when: acceptance lines 5 and 10 of spec 13.
- [ ] **BE-EX-25** By phone (VIEW-19): staff accept, reject, propose or cancel for the guest with `source: PHONE` and a required note; writes audit `viewing.record_by_phone` (AUD-01).
  Done when: acceptance line 11 of spec 13; the audit row exists.
- [ ] **BE-EX-26** History, claim, responsibility (VIEW-21, VIEW-22, VIEW-23, VIEW-07): every create, proposal, answer, status change and cancel writes one `viewing_events` row; the guest view drops internal notes and staff ids; `GET /me/viewings/claimable` + `POST /me/viewings/claim` for a verified phone only; overlapping confirmed viewings after a manager change are flagged `overlap`; `GET /dashboard` counts viewings waiting for staff and lists overdue and overlapping ones.
  Done when: acceptance line 13 of spec 13; `dashboard.service.spec.ts` updated with spec values; a guest never sees `outcome_note`.
- [ ] **BE-EX-27** ⏸ `npm run lint`, `test`, `build`, `test:e2e` (rewrite `test/viewings.e2e-spec.ts`; an old slot viewing can still be confirmed, cancelled and given an exact time – acceptance line 14). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; list the `[ASSUMPTION]`s used (A-03, A-13, A-14).

## Questions for the owner

- Q-EX6-1 (BE-EX-19): một tài khoản có được giữ nhiều lịch đang mở cho **cùng một phòng** không? Spec chỉ giới hạn 3 lượt đặt mỗi ngày.
  Đề xuất: không – mỗi tài khoản một lịch đang mở (NEW hoặc CONFIRMED) cho mỗi phòng; muốn đổi giờ thì dùng đề xuất giờ.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
