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

- [x] **BE-EX-17** ⏸ Revise the unapplied `viewing_hours` migration in place (owner 14/11/2026): add only owner `user_id null`, `visit_at timestamptz null`, and status DONE; make legacy date/slot nullable with the time CHECK; keep owner FK, two indexes and one-open-account/room partial unique. No confirmation/cancellation metadata or no-show status. Old rows remain unchanged. Re-run offline checks and reviewer, then ask again before applying to dev DB. No seed.
  Done when: `prisma migrate diff` shows only these changes; DB check passes all scenarios; every existing viewing still loads.
  Revision 15/11/2026: DB checker 82/82 and migration replay 3 PASS; validate/diff/lint/build pass (existing client). Full unit 915 pass / 740 fail, all connect EACCES on loopback; full pass pending outside sandbox. Reviewer DUYỆT revised offline scope; full report: plans/EX-6/CP-1-REVIEW.md. Earlier 76-case results and old apply permission are superseded; ask again before dev deployment.
- [x] **BE-EX-18** Time rule (VIEW-08): one helper for "on the hour, 8:00–19:00, in the future, at most 30 days ahead, Asia/Ho_Chi_Minh"; `viewing-slot.ts` stays only to label old rows.
  Done when: tests `VIEW-08: …` for 7:00, 8:00, 10:30, 19:00, 20:00, a past hour today, day 31, and the day boundary in Hà Nội time.
- [~] **BE-EX-19** Account booking (VIEW-01, VIEW-02, VIEW-02a, VIEW-16): POST /me/viewings for verified GUEST or TENANT with email (no tenant verification); copy account name/phone; 3 WEB creations/account/day including cancellations; one open viewing/account/room. Up to 3 distinct stored guest phones per building/hour across WEB/MANUAL, with multiple rooms for one phone counting once. Neither one phone nor one responsible person can hold open exact-hour viewings across different buildings at that hour. Lock account quota, guest phone, building capacity and responsibility checks with the insert in one transaction; violations of hour rules return VIEWING_TIME_TAKEN. Response no-store.
  Owner option B is resolved and implemented (15/11/2026). Remaining blocker: current HTTP/Postgres verification, not a missing tenant decision.
  Done when: acceptance lines 1, 2 and 6 of spec 13; the parallel case of line 6 runs real concurrent requests in e2e.
- [~] **BE-EX-20** ⏸ Remove the public form: delete `POST /public/viewings`, its controller, honeypot, per-IP and per-phone limits and their tests (VIEW-02, VIEW-11, VIEW-12). Ask the owner before deleting the files. `POST /viewings` (staff, manual) and `PATCH /viewings/:id` take `visitAt` with the rules of VIEW-08 and VIEW-16 (VIEW-03, VIEW-09).
  Done when: no route `POST /public/viewings`; manual creation/rescheduling of a fourth distinct phone or a guest/responsible cross-building conflict → `VIEWING_TIME_TAKEN`; same-building slots with remaining capacity or an already-counted phone remain valid; `npm run test` passes. Stop and report BE-EX-17..20.
- [~] **BE-EX-21** Availability and own viewings (VIEW-20, VIEW-21): public cached GET /public/rooms/:id/viewing-times?from&to (max31 days) shows hours for an additional guest; signed-in GET /me/rooms/:id/viewing-times uses the authenticated account phone and no-store, allowing extra rooms for an already-counted phone (even MANUAL-only at capacity), excluding their other-building hours. Both require public room, return only dates/hours, share the VIEW-16 helper and accept no phone override. GET /me/viewings and /:id remain userId-owned only, with room/time/status/contact, no confirmation/cancellation metadata and no claiming manual rows.
  Done when: acceptance lines 7 and 11 of spec 13; another user's id → 404.
- [~] **BE-EX-22** New-booking email (VIEW-19, NOTI-07): after the booking transaction, one email to the building's active manager when they have an email, else to Boss, with the guest's name, phone and email, room, building, date and hour, note; Vietnamese; a failure is logged, retried once and never fails the booking. No email for manual viewings.
  Done when: acceptance line 8 of spec 13, with a fake mailer.
- [~] **BE-EX-23** ⏸ Confirmation, cancellation and outcomes (VIEW-04, VIEW-15..18): POST /viewings/:id/confirm {via: PHONE|EMAIL} chooses the action only, never stores method/time; late confirmation allowed. EMAIL requires owner email and successful delivery before CONFIRMED. NEW/CONFIRMED may become DONE directly only after start; staff can cancel with a note, with no no-show status; only DONE can become LOST with outcome_note. WON only by contract. Owner cancellation before start sets CANCELLED and clears handled_by_id even if staff previously confirmed; staff actions record their id. Release capacity only after the last open row of that phone/building/hour closes. NEW past start stays unchanged and flagged overdue.
  Done when: acceptance lines 5, 9 and 10 of spec 13. Stop and report BE-EX-21..23.
- [~] **BE-EX-24** ⏸ Dashboard and closing (VIEW-07, VIEW-13, VIEW-22): count NEW, show overdue and genuine overlaps under current responsibility: cross-building conflicts for responsible person/phone, or >3 distinct phones in a building/hour. Valid same-building groups are not conflicts. Locking rooms/buildings preserves rows. Run lint/test/build and non-seeding e2e concurrency for the 3rd place, WEB/MANUAL phone dedup, guest/responsible cross-building conflicts, last-room cancellation and rescheduling. Legacy rows retain slot labels and accept confirmation/cancellation/exact-hour conversion. Reviewer examines authorization, lock protocol and schema.
  Done when: all pass with real output quoted; `dashboard.service.spec.ts` updated with spec values; list the `[ASSUMPTION]`s used (A-03, A-13, A-14).

## Questions for the owner

- **Q-EX6-4 / Q-EX7-01 — RESOLVED B (15/11/2026):** TENANT needs an email but no verification; GUEST still needs a verified email. Missing tenant email returns VALIDATION_FAILED / fields.email. No tenant verification flow is added.

Historical Q-EX6-1..3 below are resolved, as is Q-EX6-4 above; see Current owner revision for the effective answers.

- Q-EX6-1 (BE-EX-19): một tài khoản có được giữ nhiều lịch đang mở cho **cùng một phòng** không? Spec chỉ giới hạn 3 lượt đặt mỗi ngày.
  Đề xuất: không – mỗi tài khoản một lịch đang mở (NEW hoặc CONFIRMED) cho mỗi phòng.
- Q-EX6-2 (BE-EX-23): tài khoản người thuê do nhân sự tạo có thể không có email. Khi đó nút "Gửi email xác nhận" bị ẩn và quản lý chỉ xác nhận bằng gọi điện. Đồng ý?
  Đề xuất: đồng ý.

## Issues log

- 15/11/2026 · Historical BE-EX-19 blocker, now resolved: AUTH-12/VIEW-01 tenant eligibility was clarified by owner option B. Current HTTP/Postgres verification remains pending; see the resumption checkpoint report.

Historical entries below do not authorize applying the revised migration.

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

- Decisions 14/11/2026: Q-EX6-1 resolved: one open NEW/CONFIRMED viewing per account and room. NEW overdue may become LOST with a note; future NEW may not. Q-EX6-3 remains open: late PHONE/EMAIL confirmation; owner requested a clearer example, supplied in chat. Schema/migration creation not yet authorized. Plan: plans/EX-6/PLAN.md.

- 14/11/2026: Q-EX6-3 resolved B: late confirmation allowed, confirmedAt stores actual time. Owner approved creating schema/migration and offline verification only, not applying the database migration. BE-EX-17 files prepared; live application pending separate approval.

- 14/11/2026: BE-EX-17 blocked by P1001 from prisma migrate status. Owner approved applying viewing_hours; approval remains valid for this migration. No migration was applied and no seed was run. Restore connectivity, inspect pending migrations, compare legacy rows before/after, then continue BE-EX-18 in task order.

## Current owner revision (14/11/2026; clarified 15/11/2026)

Supersedes the historical answers and approval notes above in Questions/Issues: NO_SHOW and all confirmation/cancellation metadata are removed before first application. Same stored phone counts once across WEB/MANUAL and cannot be in two buildings at the same hour. NEW past start may become DONE directly; NEW/CONFIRMED outcomes are DONE or CANCELLED, while DONE → LOST remains. These are owner decisions, not new assumptions. Prior dev-DB apply permission no longer applies. Ask again after the new offline check/reviewer report; do not seed.

## Revised migration application approved — 15/11/2026

Owner explicitly approved applying the revised viewing_hours migration. This supersedes the pending-approval instructions above for this exact revision. Preflight prisma migrate status exited 1 with P1001; a separate TCP diagnostic using the configured target returned ENOTFOUND (hostname resolution failed). No deploy/seed ran, and legacy rows could not be captured. BE-EX-17 is blocked by connectivity; retry preflight when available, verify only the expected migration is pending, compare legacy rows before/after. Do not ask for the same permission again unless the migration changes.

## Migration applied — owner evidence 15/11/2026

Owner ran the approved helper in their terminal. Prisma reports all migrations successfully applied, including 20261114000000_viewing_hours. BEFORE 78; PASS 78/78 original viewings unchanged with new columns null; AFTER 78. No seed ran. This resolves the earlier connectivity block for BE-EX-17. BE-EX-18 is now in progress.

## BE-EX-18 implementation update — 15/11/2026

Added checkVisitAt and viewingStart with 27 time/boundary/legacy tests plus 2 projection tests. Red run: 17 validation failures; legacy/projection red run: 6 failures. Targeted time/projection/staff-service/dashboard suite now 85/85 pass. Nullable legacy fields and DONE projection handled in viewings.types/service and dashboard. Legacy booking DTO remains until BE-EX-20; BE-EX-18 stays [~] until CP-2 integration. Prisma generate wrote updated types but failed EPERM replacing query_engine-windows.dll.node; existing DLL hash matches the installed engine. Build after compatibility fixes exits 0; lint 0 errors / 7 existing warnings. Full unit 944 pass / 740 HTTP EACCES failures (1684 tests, 83 files, 44.05s). Need owner to stop the running backend if any and rerun prisma generate; no DB/schema/seed changes required.

- 15/11/2026: owner screenshot confirms Prisma Client v6.19.3 generated successfully (268ms); the EPERM issue is resolved. Continue BE-EX-19.

## Runtime implementation — 15/11/2026

BE-EX-18 time helper is verified. BE-EX-19..24 runtime, DTO/controller, shared capacity locks, ownership, email actions, availability and overlap/dashboard are implemented; full verification remains in progress. Public POST and its honeypot/IP/phone limits have been removed by editing existing files; no files deleted. Targeted initial group 103/103; subsequent service/dashboard/DB-map group 100/100; boundary/DTO/role-guard group 46/46. Full unit snapshot: 974 pass / 757 HTTP EACCES failures, 1731 total, 86 files. Lint 0 errors / 4 existing warnings; build passes. New non-seeding PostgreSQL/HTTP suite has 11 scenarios; no result is claimed until connection/preflight and assertions actually run. Prisma generate succeeded in owner terminal.

Final runtime checks 15/11/2026: lint exit0 (0 errors / 4 pre-existing warnings), build exit0, full unit 998 passed / 757 failed of 1755 tests in 87 files; every failure is HTTP connect EACCES. Eleven e2e cases never executed because first database read failed; no fixtures/seed written. Independent code reviewer DUYỆT; full report, retained assumptions, owner verification commands and suggested commit in plans/EX-6/CP-2-4-REVIEW.md.

## Tenant booking decision — 15/11/2026

Q-EX6-4 / Q-EX7-01 resolved: owner chose B. TENANT must have email but does not need email verification to book. Missing email returns VALIDATION_FAILED with fields.email; the existing account page lets TENANT add it. GUEST still needs verified email. Resend sends email, no SMS. This supersedes the pending question and the earlier verified-email-for-all wording. No schema or auth verification flow changes.

## Resumption checkpoint — 15/11/2026

EX-7 is implemented and its full frontend suite passes 853/853. After EX-8 integration the current backend full run is 1047 pass / 759 connect EACCES failures, 1806 tests, 89 files, 55.16s; lint/build pass with four pre-existing warnings. The latest database preflight is read-only and fails with PrismaClientInitializationError; the 11 non-seeding e2e cases remain unexecuted. No seed or migration was repeated. Earlier 1758/1758 was before EX-8, not evidence for the present working tree. See [checkpoint report](CHECKPOINT-2026-11-15-resume.md) for commands and review.
