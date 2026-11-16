# Phase 3 · Part 4 – Backend: move-in and cancel (BE-P3-20..22)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-3 committed. Not at the same time as P3-5 (same module) |
| Unblocks | P3-5, the move-in and cancel screens of P3-6 |
| How | main session builds (two routes in one module) → reviewer before the stop (money) |
| Part done when | BE-P3-22 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/00-overview.md` – D-14, D-26, D-35, D-38, A-02, A-16
3. `docs/spec/14-contracts.md` – CON-10, CON-11, CON-12, Acceptance
4. `docs/spec/15-meters.md` – MTR-02, MTR-03, MTR-04, MTR-06, MTR-07; `docs/spec/16-billing.md` – "Settlement" (the parts of a settlement row), BIL-17
5. `docs/spec/02-database.md` – the rules on contracts (ACTIVE needs `signed_at` and `moved_in_at`), meter readings, settlements
6. Code: the contracts service of P3-2/P3-3, `prisma/schema.prisma` (`MeterReading`, `Settlement`), `prisma/constraints.sql`

## Scope

In: `POST /contracts/:id/move-in`, `POST /contracts/:id/cancel`.
Out: meter photos (not needed, D-38), the "Chốt chỉ số" list (Phase 4), marking a refund as paid (Phase 4, Q-P3-3), the move-out settlement of an ACTIVE contract (Phase 4).

## Tasks

- [ ] **BE-P3-20** Move-in (CON-10, CON-11, MTR-02, MTR-03, MTR-06): signed, deposit invoice `PAID` or deposit 0, else `DEPOSIT_NOT_PAID`; electric and water readings are both required (water also for `PER_PERSON`); a reading lower than the previous one of the room → `METER_VALUE_DECREASED` unless it is a meter replacement (MTR-04); a reading on the same day as an existing one is the same row (MTR-02); `readOn` more than 3 days from `start_date` needs a note; no meter photo (D-38); `moved_in_at` set, status `ACTIVE`; audit `contract.move_in`.
  Done when: tests `CON-10`, `CON-11`, `MTR-03: …`; acceptance "Move-in before deposit paid → `DEPOSIT_NOT_PAID`"; a deposit-0 contract moves in without payment.
- [ ] **BE-P3-21** Cancel (CON-12, D-35, A-16): HOLD only; deposit invoice `UNPAID` → `CANCELLED` with the reason; `PAID` → one settlement row with `deposit` = paid amount, `deposit_forfeit` = `depositKept` (0..deposit), other parts 0, `net` = refund (DB CHECK); status `CANCELLED`; the room is free again; the account is deactivated only if it was created for this contract and never activated; audit `contract.cancel`. Recording that the refund was paid is Phase 4 (Q-P3-3).
  Done when: acceptance test "Cancel after deposit paid with 1.000.000 kept from 2.500.000 → settlement net 1.500.000, room public again"; `depositKept` above the deposit → `VALIDATION_FAILED`; a reused guest account stays active with its viewings; an ACTIVE contract → `CONFLICT_STATE`.
- [ ] **BE-P3-22** ⏸ `npm run lint`, `npm run test`, `npm run build`, e2e (sign → pay → move-in, and sign → pay → cancel on the dev DB). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; `cleanup.mjs` list mode clean for this run; list the `[ASSUMPTION]`s used.

## Questions for the owner

Đã trả lời 16/11/2026:

- Q-P3-2 (BE-P3-20): không cần ảnh đồng hồ; đồng hồ lắp bên ngoài, quản lý tự xem (D-38).
- Q-P3-3 (BE-P3-21): Phase 3 chỉ lập quyết toán và hiện số tiền phải trả; ghi "đã trả lại tiền" làm ở Phase 4.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
