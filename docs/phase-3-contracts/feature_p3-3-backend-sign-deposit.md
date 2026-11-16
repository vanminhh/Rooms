# Phase 3 · Part 3 – Backend: sign, temporary password, deposit invoice and payment, print (BE-P3-13..19)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-2 committed |
| Unblocks | P3-4, P3-5, P3-6, P3-7 |
| How | planner writes `plans/P3-3/PLAN.md` → main session builds → reviewer before the last stop (money + accounts) |
| Part done when | BE-P3-19 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/00-overview.md` – D-01, D-04, D-10, D-11, D-35, D-36, D-37, A-02, Q-15, G-01, G-09
3. `docs/spec/14-contracts.md` – CON-06..09, CON-16 (scan), CON-22, API table, Acceptance
4. `docs/spec/16-billing.md` – "Invoice types and statuses", BIL-07, BIL-10, BIL-11; `docs/spec/01-architecture.md` – API-05, API-07, error codes; `docs/spec/02-database.md` – the invoice and payment rules, DB-B4
5. `docs/spec/10-auth.md` – AUTH-05, AUTH-07, AUTH-T3, SCOPE-03; `docs/spec/20-reports-audit-settings.md` – AUD-01, settings `bank_account`, `contract_template`; `docs/spec/19-notifications.md` – NOTI-06
6. Code: `src/modules/auth/managers.service.ts` (temporary password pattern), `src/common/crypto/`, `src/common/guards/auth.decorators.ts` (`TenantMeRoles`), `src/modules/pricing/` (how `Idempotency-Key` is handled), `src/modules/settings/`, `prisma/seed.ts` (`bank_account`), the P3-1 upload helpers and the P3-2 contracts service

## Scope

In: `POST /contracts/:id/sign`, the account activation at signing, the deposit invoice, VietQR for it, recording the deposit payment by hand, staff reset of a tenant password, the tenant's own contract routes, the print data, the signed scan view, the "unpaid deposits" task.
Out: payments for any other invoice type, the bank webhook, monthly invoices (Phase 4); move-in and cancel (P3-4); a settings page to edit the template (Phase 5).

## Tasks

- [ ] **BE-P3-13** `POST /contracts/:id/sign` (CON-06, CON-07 "sign", CON-09, D-37): HOLD and not yet signed; the scan is a verified private `CONTRACT_SCAN` asset of this contract; an account created for this contract gets a random temporary password, `must_change_password = true`, `is_active = true`, returned **once** and never stored in clear or logged; an account that existed before keeps its password and no password is returned; `signed_at` set; audit `contract.sign`.
  Done when: tests `CON-06`, `CON-07`, `CON-09: …`: signing twice → `CONFLICT_STATE`; a public asset → refused; the temporary password logs in and is forced to `/doi-mat-khau` (AUTH-05); a reused guest account logs in with its old password.
- [ ] **BE-P3-14** Deposit invoice (CON-08, A-02, DB-B4): created in the sign transaction, one `DEPOSIT` line, `issue_date` today, `due_date` = max(today, `start_date`), status `UNPAID`; skipped when deposit = 0.
  Done when: tests: totals equal the line, deposit 0 creates nothing, the DB rule "one non-cancelled invoice per contract, type, period" holds.
- [ ] **BE-P3-15** ⏸ VietQR for the deposit invoice (BIL-10, G-09): staff contract detail and the tenant's routes include `vietqr` (bank from `settings.bank_account`, amount = total, content `TT{id}`) and `qrImageUrl`.
  Done when: test with the seed `bank_account`: amount and content match the invoice; no VietQR for a paid or cancelled invoice. Stop and report BE-P3-13..15.
- [ ] **BE-P3-16** Record the deposit by hand (BIL-11 for `DEPOSIT` only, D-11, API-05): `POST /invoices/:id/payment { method, paidAt?, note? }` by staff in scope, amount = invoice total, `Idempotency-Key` honoured; any other invoice type → `CONFLICT_STATE` until Phase 4; DB trigger errors mapped (`INVOICE_NOT_UNPAID`, `PAYMENT_AMOUNT_MISMATCH`); audit `payment.record`.
  Done when: tests: two parallel payments → one succeeds, the other `INVOICE_NOT_UNPAID`; the same key twice → same result, one payment row; a manager of another building → `OUT_OF_SCOPE`.
- [ ] **BE-P3-17** `POST /contracts/:id/reset-password` (AUTH-07, AUTH-T3): staff in scope reset the tenant's password to a new temporary one, returned once, `must_change_password = true`, all sessions revoked; audit (password reset by staff, AUD-01).
  Done when: tests: old sessions stop working; the new password logs in and must be changed; a guest-only account (no contract in scope) → `NOT_FOUND`.
- [ ] **BE-P3-18** Tenant routes and print (SCOPE-03, CON-16, CON-22, D-36): `GET /me/contracts`, `/me/contracts/:id` (with the deposit invoice and VietQR), `/me/contracts/:id/scan`, `/me/contracts/:id/print`; staff `GET /contracts/:id/scan`, `/contracts/:id/print`. Print returns the filled template (draft text while Q-15 is open, with the draft flag), CCCD as last 4 digits only. Scan views write `contract.view_scan`. Also the "Việc hôm nay" group of unpaid deposits (NOTI-06).
  Done when: tests: another tenant's id → 404; a GUEST → `FORBIDDEN`; money and dates in the print data use the spec formats; the audit row exists for each scan view; dashboard spec updated.
- [ ] **BE-P3-19** ⏸ `npm run lint`, `npm run test`, `npm run build`, e2e (create → sign → pay deposit on the dev DB). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; no password or CCCD value appears in any log or response body except the one-time temporary password; list the `[ASSUMPTION]`s used (A-02).

## Questions for the owner

<!-- none yet -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
