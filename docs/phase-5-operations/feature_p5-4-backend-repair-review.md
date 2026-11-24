# Phase 5 · Part 4 – Backend: repair review (BE-P5-19..21)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P5-3 committed; owner approves migration M2 (create, then apply) |
| Unblocks | P5-8 (review box) |
| How | main session builds; reviewer before the stop (schema) |
| Part done when | BE-P5-21 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, D-33, A-17 (confirmed), Q-13
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (migration M2), §4 "P5-4", §8
4. `docs/spec/18-requests.md` – REQ-09 and its Acceptance lines; `docs/spec/20-reports-audit-settings.md` – AUD-01; `docs/spec/02-database.md` – Phase 5 row
5. Code: the `requests` module of P5-3, `src/modules/audit/audit.service.ts`, `prisma/check-constraints.mjs`

## Scope

In: migration M2, tenant review, staff hide.
Out: any other kind of review (D-33).

## Tasks

- [x] **BE-P5-19** Migration M2 (D-45 (2)), only after approval: `review_rating smallint`, `review_comment text`, `review_at`, `review_updated_at`, `review_hidden_reason text`, `review_hidden_at`, `review_hidden_by_id` (FK users, ON DELETE SET NULL) + CHECKs (rating 1–5 and only on INCIDENT; hidden reason/at paired; hide only when reviewed). DB checker scenarios for each.
  Done when: DB checker real count, all pass; offline check before applying; `02-database.md` Phase 5 row updated.
- [x] **BE-P5-20** `PUT /me/requests/:id/review { rating, comment? }` and `POST /requests/:id/review/hide { reason }` (REQ-09, A-17): CLOSED INCIDENT only, by its creator, once, editable 7 days from `review_at` (Hà Nội days); never reopens, never changes `cost`, never refunds; hide keeps the review, audit `request.review_hide`.
  Done when: the 4 Acceptance rejections (not CLOSED, second review, edit on day 8, other tenant) + "1 star stays CLOSED and cost unchanged"; rating 0/6 → `VALIDATION_FAILED`; MANAGER on the tenant route → `FORBIDDEN`; other building hide → `OUT_OF_SCOPE`; empty reason → `VALIDATION_FAILED`.
- [x] **BE-P5-21** ⏸ lint + test + build + check-constraints; reviewer.
  Done when: real output; A-17 values listed.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

24/11/2026 — M2 verified offline: 124/124 checks, all 14 migrations replayed, seven columns verified. Schema review approved. Dev deployment pending separate approval.

24/11/2026 - BE-P5-20: embedded PostgreSQL HTTP E2E passed for creator, role and building scope, duplicate submission, stale edit, day 8, one-star cost preservation, comment hiding and audit retention after an edit. Implementation reviewed. Owner authorized M2 deployment; dev status check returned P1001.

Owner confirmed the dev checkpoint passed and authorized continuing without a commit.
