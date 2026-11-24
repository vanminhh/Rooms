# Phase 5 · Part 3 – Backend: requests (BE-P5-10..18)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P5-1 and P5-2 committed |
| Unblocks | P5-4, P5-5 (RPT-03 reads `requests.cost`), P5-6, P5-8 |
| How | planner writes `plans/P5-3/PLAN.md` first; reviewer before the stop (authorization, money) |
| Part done when | BE-P5-18 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, D-14, D-15, A-P5-1..3 (README)
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2, §3, §4 "P5-3", §7, §8
4. `docs/spec/18-requests.md` (all, incl. Acceptance); `docs/spec/17-bank.md` – BANK-05, BANK-06; `docs/spec/14-contracts.md` – CON-13, CON-14; `docs/spec/19-notifications.md` – NOTI-06
5. Code: `src/modules/notifications/{notify,dashboard.service}.ts`, `src/jobs/{job-state,invoice-reminder.job}.ts`, `src/modules/files/*`, `src/modules/billing/billing.service.ts`, `src/modules/bank/*`

## Scope

In: the `requests` module (6 types), tenant photos, staff board API, approve/reject/escalate, 3-day close job, NOTI-06 groups.
Out: the repair review (P5-4), FE.

## Tasks

- [~] **BE-P5-10** Module `requests` + `POST /me/requests` (REQ-01, REQ-02): own ACTIVE contract only (SCOPE-03), `PAYMENT_ISSUE` also on a HOLD deposit invoice; DTO per type as the `payload` table of 18-requests; INCIDENT only by the tenant (D-45 (12)); second PENDING MOVE_OUT/RENEW → `PENDING_REQUEST_EXISTS`; notify the responsible staff (`notifyBuildingStaff`, SCOPE-04). Update `prisma.service.spec.ts` module list.
  Done when: Acceptance "second MOVE_OUT while one is PENDING"; two parallel creates → one row; another tenant's contract → `NOT_FOUND`; GUEST → `FORBIDDEN`; bad payload → `VALIDATION_FAILED` with `fields`.
- [~] **BE-P5-11** `GET /me/requests` + `POST /me/requests/:id/cancel` · `/confirm` · `/reopen` (REQ-01, REQ-06); every status change writes one `REQUEST_UPDATED` row, in-app only (REQ-08, D-45 (4)).
  Done when: cancel an APPROVED request → `CONFLICT_STATE`; confirm a PENDING incident → `CONFLICT_STATE`; another tenant → `NOT_FOUND`; exactly one notification per change.
- [~] **BE-P5-12** Upload purpose `REQUEST_PHOTO` (D-45 (3)): TENANT only, own contract, at most 5 photos per request, own folder and prefix, stored like room images. Update `sign.dto.spec.ts` and `sign.validation.spec.ts`.
  Done when: unknown purpose → `VALIDATION_FAILED` (`fields.purpose`); 6th photo → `VALIDATION_FAILED`; MANAGER with `REQUEST_PHOTO` → `FORBIDDEN`; signature carries the right folder.
- [~] **BE-P5-13** `GET /requests?buildingId&type&status` + `PATCH /requests/:id` (staff in scope, API-02, API-08): incident PENDING → IN_PROGRESS → RESOLVED and `cost` (REQ-06, D-15); audit.
  Done when: other building → `OUT_OF_SCOPE`; `cost` on a non-incident → `VALIDATION_FAILED` before the DB; PENDING → CLOSED → `CONFLICT_STATE`; `?buildingId` is really in the `where`.
- [~] **BE-P5-14** `POST /requests/:id/approve` · `/reject` (REQ-03, REQ-04, REQ-05, REQ-08): MOVE_OUT sets `move_out_notice_date` and `planned_move_out_date` and returns the D-14 warning with the amount (no settlement here); RENEW only becomes APPROVED and the renewal form is opened by staff, `payload.contractId` is written when the renewal is created (D-45 (15)); OCCUPANT_CHANGE/VEHICLE_CHANGE apply the payload in the same transaction (CON-13, CON-14, DB-B6; a vehicle added mid-month is billed the full month, D-45 (6)); reject needs `decision_note`.
  Done when: Acceptance "VEHICLE_CHANGE with a plate active elsewhere fails and the request stays PENDING"; approving twice → `CONFLICT_STATE`; reject without note → `VALIDATION_FAILED`; MOVE_OUT before `end_date` returns the D-14 amount.
- [~] **BE-P5-15** `POST /requests/:id/escalate` + PAYMENT_ISSUE resolution (REQ-07, BANK-06): manager resolves by manual payment (BIL-11), rejects with a reason or escalates; Boss resolves an ESCALATED one through BANK-05 assign.
  Done when: escalating twice → `CONFLICT_STATE`; manager resolving an ESCALATED request → `FORBIDDEN`; after the assign the request is RESOLVED and the invoice PAID in the same run.
- [~] **BE-P5-16** Job `close-incidents` at 08:00 + at start-up, once a day via `claimDailyRun` (add `'close_incidents'` to `DailyJob`): RESOLVED for 3 full Hà Nội days → CLOSED + `closed_at` + `REQUEST_UPDATED` (A-P5-1, A-P5-2).
  Done when: Acceptance "RESOLVED on day 1 closed by cron on day 4"; not on day 3; two runs on one day close once with no duplicate notification.
- [~] **BE-P5-17** NOTI-06 groups in `GET /dashboard`: `pendingRequests` (in scope, max 5 rows), approved RENEW requests without `payload.contractId` (D-45 (15)), `escalatedPaymentIssues` (Boss only); update `dto/dashboard.dto.ts` and **all 5** dashboard fakes.
  Done when: a manager sees only their buildings; `?buildingId` narrows; MANAGER gets no `escalatedPaymentIssues`; unit tests with fakes.
- [~] **BE-P5-18** ⏸ lint + test + build + e2e (incident → RESOLVED → cron close; MOVE_OUT → approve); reviewer.
  Done when: real output; cleanup list clean.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
