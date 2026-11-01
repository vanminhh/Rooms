# Phase 2 · Part 5 – Backend pricing, approval, price job (BE-P2-22..28)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 4 on the main files |
| Unblocks | Part 6; frontend part 8b |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-P2-22-28/` |
| How | Pipeline |
| Part done when | BE-P2-28 on the main files; the public price does not change before Boss approves |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` (D-08, D-09), `docs/spec/01-architecture.md` (cron, error codes)
3. `docs/spec/12-pricing.md` – PRC-01..12, RATE-01..06 (this part)
4. `docs/spec/11-buildings-rooms.md` – SVC-04
5. `docs/spec/20-reports-audit-settings.md` – AUD-01
6. Part 2 code: `src/common/{date,rates}`; `@nestjs/schedule` is installed (P2-SETUP-01)

## Scope

In: `/room-prices`, `/rate-plans`, approve/reject, the price job, data for the "Duyệt giá" page.
Out: billing use of rates (Phase 4), FE (parts 8a/8b).

## Tasks

- [ ] **BE-P2-22** Propose a room price (PRC-01, PRC-02): `effectiveFrom` ≥ today, old PENDING → `SUPERSEDED` in one transaction; audit `price.propose`.
  Done when: acceptance spec 12 "Two quick proposals → exactly one PENDING".
- [ ] **BE-P2-23** Propose a rate plan (RATE-01, RATE-02, RATE-03, SVC-04): tier validation; locked service refused.
  Done when: unit tests for every RATE-02 rule and the locked-service case.
- [ ] **BE-P2-24** Approve / reject, Boss only (PRC-03, PRC-07, PRC-09, RATE-05): conditional update on PENDING; expired → `PRICE_PROPOSAL_EXPIRED`; reject needs `review_note`; room price effective today → `rooms.price` set in the same transaction; audit `price.approve`, `price.reject`.
  Done when: tests: double approve → `CONFLICT_STATE`; yesterday's proposal → 409; reject without note → `VALIDATION_FAILED`.
- [ ] **BE-P2-25** Boss proposal = approved at once (PRC-04) and PRC-08 superseding of future approved prices/plans (before writing the new one).
  Done when: tests for both PRC-08 examples, for a room price and a rate plan; no `rate_plans_one_per_day` error.
- [ ] **BE-P2-26** Price job `src/jobs/room-price-sync.job.ts` (PRC-06): 01:00 Asia/Ho_Chi_Minh and at app start; `roomIds` filter; never writes `null`; logs a summary line; `ScheduleModule` off in tests.
  Done when: tests: idempotent, null never written, the start-up run fixes a missed day.
- [ ] **BE-P2-27** Lists for staff and the "Duyệt giá" page (PRC-10..12): `expired` flag, old → new, % rounded to 1 decimal, electric tiers table, "Giá mới" when no old value.
  Done when: unit tests for each PRC-12 case.
- [ ] **BE-P2-28** `npm run lint`, `test`, `build`, `test:e2e` pass; e2e: manager proposes → public price unchanged → Boss approves → price changes (job run with the test's `roomIds`).
  Done when: all pass; list every `[ASSUMPTION]`.

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
