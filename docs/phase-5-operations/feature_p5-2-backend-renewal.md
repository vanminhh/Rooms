# Phase 5 · Part 2 – Backend: renewal (BE-P5-05..09)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P5-1 committed; owner approves migration M1 (create, then apply) |
| Unblocks | P5-3 (REQ-04 → CON-17), P5-6 |
| How | planner writes `plans/P5-2/PLAN.md` first; reviewer before the stop (schema) |
| Part done when | BE-P5-09 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, D-13, A-06, A-09
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (migration M1), §4 "P5-2", §7 (index risk)
4. `docs/spec/14-contracts.md` – CON-06, CON-12, CON-17..21; `docs/spec/16-billing.md` – BIL-06, BIL-13; `docs/spec/02-database.md` – DB-B1, DB-B7, DB-07
5. Code: `src/modules/billing/renewal-switch.ts`, `src/jobs/monthly-invoice.job.ts`, `src/modules/contracts/contracts.service.ts`, `src/modules/billing/settlement.service.ts`, `prisma/constraints.sql:70`, `prisma/check-constraints.mjs`

## Scope

In: migration M1, create/sign/cancel a renewal, settlement guard, re-check of BIL-06 and CON-20/21.
Out: the renewal request (P5-3), FE.

## Tasks

- [ ] **BE-P5-05** Migration M1 (D-45 (1)), only after the owner approves creating it: `contracts_one_open_per_room` becomes `WHERE status = 'ACTIVE' OR (status = 'HOLD' AND previous_contract_id IS NULL)`; update `constraints.sql`; add/adjust `check-constraints.mjs` scenarios (renewal HOLD beside ACTIVE allowed; a second new contract for an ACTIVE/HOLD room blocked). Check offline (PGlite + `migrate diff`); apply to dev only after the second approval.
  Done when: the DB checker prints its real count and every scenario passes; the report says whether M1 is applied on dev.
- [ ] **BE-P5-06** `POST /contracts/:id/renewal` (CON-17): from an ACTIVE contract in scope create a HOLD contract with `previousContractId`, same room and tenant, same rent (DB-B1) and deposit, `startDate` = old `endDate` + 1 (DB-B7), `termMonths ≥ 3`, services copied and editable, **no** deposit invoice; lock old contract + room in one transaction; audit `contract.create`. Also block a brand-new contract for a room whose old contract has ended while its renewal is still HOLD (D-45 (1)).
  Done when: second renewal of the same contract → `CONFLICT_STATE`; HOLD/ENDED source → `CONFLICT_STATE`; `termMonths = 2` → `CONTRACT_TERM_TOO_SHORT`; other building → `OUT_OF_SCOPE`; no `DEPOSIT` invoice; `startDate` right across a leap February.
- [ ] **BE-P5-07** Sign a renewal (CON-18) through the existing CON-06 path (print page CON-22, private scan, no new account, no deposit, no move-in step).
  Done when: after signing `signedAt` is set and status stays HOLD; `switchDueRenewals` with `today ≥ startDate`, the final invoice of period N and handover readings → `SWITCHED`, occupants and vehicles copied (CON-19); without the final invoice → `WAITING_FINAL_INVOICE`, no throw.
- [ ] **BE-P5-08** Cancel a not-yet-switched renewal with the existing `POST /contracts/:id/cancel` (D-45 (10): CANCELLED, no settlement, no refund, audit). Settlement of a contract with a signed renewal → `CONFLICT_STATE` "Hợp đồng đã có gia hạn, hãy hủy gia hạn trước" (D-45 (9), `settlement.service.ts`). Re-check CON-20, CON-21: `expiringContracts`, `expiredContracts` and the 30/7-day reminders skip a contract that has a renewal; list any gap left.
  Done when: a contract with a signed renewal is not in `expiringContracts` and gets no expiry reminder; after cancelling the renewal it is back and the room is not wrongly locked; settlement with a renewal → `CONFLICT_STATE`.
- [ ] **BE-P5-09** ⏸ lint + test + build + check-constraints + e2e (create renewal → sign → run the switch job); reviewer.
  Done when: real output; `scripts/e2e/cleanup.mjs` list clean for the run.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
