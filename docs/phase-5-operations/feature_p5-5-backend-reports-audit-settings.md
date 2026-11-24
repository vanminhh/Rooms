# Phase 5 · Part 5 – Backend: reports, audit log, settings (BE-P5-22..27)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P5-3 committed (RPT-03 reads `requests.cost`); owner approves migration M3 (create, then apply) |
| Unblocks | P5-7, P5-8 (`GET /me/consumption`) |
| How | main session builds; reviewer before the stop (money, authorization, schema) |
| Part done when | BE-P5-27 verified — roadmap goal: Boss compares buildings |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, D-44 (Q-P4-11)
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (migration M3), §4 "P5-5", §7, §8
4. `docs/spec/20-reports-audit-settings.md` (all, incl. the 80 / 5 million example); `docs/spec/16-billing.md` – BIL-12; `docs/spec/30-frontend.md` – `/ql/bao-cao`, `/ql/nhat-ky`, `/ql/cai-dat`
5. Code: `src/modules/audit/*`, `src/modules/settings/*`, `src/modules/mailer/email-templates.ts`, `src/modules/rooms/room-status.ts`, `src/modules/billing/{billing,invoice-queries}.service.ts`

## Scope

In: reports, Boss actions on overdue invoices with migration M3, audit log read, settings edit, tenant consumption.
Out: Excel/PDF export, the webhook switch (Q-P4-11).

## Tasks

- [x] **BE-P5-22** `report-math.ts` (pure, integer đồng): RPT-01 revenue (MONTHLY/FINAL payments by Hà Nội `paid_at` + deposit used by settlements that month; DEPOSIT is not revenue), RPT-02 outstanding with overdue apart, RPT-03 costs and profit, RPT-05 deposits held.
  Done when: unit tests from the 20-reports example (80 million paid + 5 million overdue: "Cất" → 80 / 5; "Xóa" with reason → 80 / 0); a paid DEPOSIT is not revenue.
- [x] **BE-P5-23** `GET /reports/revenue?buildingId&from&to` (at most 24 months, default the last 12, D-45 (13)) + `GET /reports/occupancy?buildingId` (RPT-04 via `deriveRoomStatus`); manager own buildings, Boss all + per-building comparison (RPT-06); `no-store`.
  Done when: **roadmap goal**: Boss gets the per-building comparison in one call; a manager gets no comparison block; other building → `OUT_OF_SCOPE`; 25 months → `VALIDATION_FAILED`.
- [x] **BE-P5-24** Migration M3 (D-45 (7)), only after approval: `invoices.archived_at` + `archived_by_id` + paired CHECK; DB checker scenario. Boss actions on an overdue invoice: "Sửa" = BIL-12 reissue, "Xóa" = cancel with reason, "Cất" = set `archived_at` (hidden from the Boss list, still counted; tenant and manager still see it red); audit.
  Done when: after "Cất" the overdue total is unchanged, the Boss list drops the row, `GET /me/invoices` and the manager dashboard still show it; after "Xóa" the overdue total drops.
- [x] **BE-P5-25** `GET /audit-logs?entity&entityId&actorId&from&to` (BOSS only, AUD-04): paged, newest first, actor name/role, `before`/`after` shown in full except hashes, temporary passwords and full ID numbers stripped by the BE (D-45 (16)); BigInt id serialized safely.
  Done when: MANAGER → `FORBIDDEN`; filters return the right rows; Hà Nội dates; an `occupant.view_id` row never shows a full ID number.
- [x] **BE-P5-26** `GET/PATCH /settings` (BOSS only): the 5 keys of 20-reports, one schema per key; `webhook` read-only (D-45 (5)); `contract_template` keeps `isDraft: true` (D-45 (14)); email templates keep their required placeholders; audit `settings.change`; never env secrets. Plus `GET /me/consumption?periods=6` (electric/water of the last ≤ 6 periods of the caller's contract, computed in the BE).
  Done when: unknown key → `VALIDATION_FAILED`; PATCH `webhook` → `VALIDATION_FAILED`; MANAGER → `FORBIDDEN`; bad `bank_account` → `VALIDATION_FAILED` and VietQR still works; another tenant's contract → `NOT_FOUND`; 2 periods → 2 items.
- [x] **BE-P5-27** ⏸ lint + test + build + check-constraints + e2e (a real month report on dev); reviewer.
  Done when: real output; cleanup list clean.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

BE-P5-22/23: report math, staff revenue and occupancy API, Boss comparisons and scoped filters implemented. Targeted tests 13/13; read-only report integration 1/1 on embedded PostgreSQL. Dev month report pending BE-P5-27. BE-P5-24 awaits approval to create migration M3.

BE-P5-24: creation of M3 approved. All 15 migrations replayed locally; 128/128 DB checks passed. The rollback HTTP test verifies 80M paid, 5M overdue before and after archive, then 0 overdue after cancellation; manager and tenant retain visibility, duplicate archive writes one audit, and a waived period cannot be recreated through the missed-invoice endpoint. Schema and money review approved. Dev deployment pending separate approval.

25/11/2026 - Owner reports dev E2E passed with isolated fixtures. BE-P5-24 accepted. See PROGRESS.md for independent local verification.

BE-P5-25: Boss-only audit read endpoint verified via HTTP with the Prisma edge replaced. Covers scope, filters, stable sort, pagination, Hanoi day limits, nested secret fields and lossless BigInt serialization. 2/2 HTTP tests, type build and module lint passed.

25/11/2026 - BE-P5-26 implemented and HTTP-tested. Reviewer approved settings, audit and consumption after compatibility and carried-deposit fixes. BE-P5-27: embedded report and renewal-switch E2Es passed individually, 128/128 DB checks; dev report and list-only cleanup could not connect to Supabase on port 6543.

25/11/2026 — Owner confirmed the dev checkpoint passed (reports, renewal and list-only cleanup). P5-5 accepted.
