# Phase 3 · Part 1 – Backend foundation: calendar-month periods, CCCD encryption, private uploads (BE-P3-01..06)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-0: the owner has put `CCCD_KEY` in `Source/backend/.env`; clean `git status` |
| Unblocks | P3-2 |
| How | planner writes `plans/P3-1/PLAN.md` → main session builds → reviewer before the last stop (schema + security) |
| Part done when | BE-P3-06 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/00-overview.md` – D-16, D-17, D-35..D-41, A-21, G-01, G-02
3. `docs/spec/14-contracts.md` – CON-03, CON-04, CON-06, CON-16; `docs/spec/16-billing.md` – "Periods", BIL-01..04, BIL-08, BIL-22
4. `docs/spec/01-architecture.md` – FILE-01, FILE-02, error codes, DEP-05; `docs/spec/02-database.md` – DB-07, "Planned changes" (row Phase 3), DB-B9
5. Code: `src/common/date/today.ts`, `src/common/crypto/` (`password.ts`, `token.ts`), `src/common/env.ts` and `env.spec.ts`, `src/modules/files/` (`cloudinary.ts`, `files.service.ts`, `dto/sign.dto.ts`, specs), `src/common/errors/error-code.ts`, `src/app.module.ts`, `src/app.setup.spec.ts`, `src/common/prisma/prisma.service.spec.ts`, `prisma/schema.prisma` (`Contract`, `Occupant`), `prisma/constraints.sql`, `prisma/check-constraints.mjs`

## Scope

In: the period/`end_date` helper, CCCD encryption, the two private upload purposes and signed delivery URLs, the empty `contracts` module, new error codes, one small migration for asset ids.
Out: every contract route (P3-2..P3-5), any frontend change.

## Tasks

- [ ] **BE-P3-01** Period helper in `src/common/date/` (BIL-01..04, BIL-22, D-40, D-41, CON-03): `end_date` = start + N months − 1 day with the month clamp; periods cut at every 1st of a month; whether a period is partial; the prorated amount (days ÷ days of that month) rounded half up to the đồng (A-21); the due date of a monthly invoice = the 9th of its billing month (BIL-08). Business dates only (G-02). No library.
  Done when: tests `BIL-01: …`, `BIL-02: …` and `BIL-22: …` with the exact dates and amounts of the spec, a move-in on the 1st (no partial month), a leap-year case in 2028 (29/02), `BIL-03` (a renewal continues the months without a gap), and `BIL-04` (no period after `end_date`).
- [ ] **BE-P3-02** CCCD encryption (CON-04, D-17): AES-256-GCM with a random IV per value, key from `CCCD_KEY` (32 bytes, base64); `last4` helper; decrypt only where a later task needs it. `CCCD_KEY` becomes required at start like `NODE_ENV` (owner 16/11/2026, Q-P3-4, DEP-05): missing or wrong length → the app refuses to start with a clear message; add it to `.env.example` with an empty value.
  Done when: tests: round trip, two encryptions of the same number differ, a tampered value fails, a wrong-length key is refused; `env.spec.ts` updated (it currently says a missing `CCCD_KEY` does not throw); the key never appears in a log.
- [ ] **BE-P3-03** ⏸ Migration for private assets (D-37, `02-database.md` "Planned changes"): ask the owner before creating the file and again before applying it to the dev database. Also the plan's choice for the now unused `contracts.billing_day` (drop, or fix to 1; dropping needs the owner's OK) and the matching change to the dev seed (`HD000001` uses billing day 15). The signed scan and the two CCCD photos store a verified Cloudinary asset id (and whatever the signed URL needs, decided in the plan) instead of a URL; the plan says what happens to `signed_scan_url`, `id_front_url`, `id_back_url` (they are empty today). Add DB-check scenarios for the new rules and keep every existing one (DB-07).
  Done when: `prisma migrate diff` shows only these changes; `node prisma/check-constraints.mjs . prisma` passes every scenario (report the count); `seed.spec.ts` passes. Stop and report BE-P3-01..03.
- [ ] **BE-P3-04** Private uploads (FILE-01, FILE-02, D-37): purposes `CONTRACT_SCAN` (jpg, png, webp, pdf) and `ID_PHOTO` (jpg, png, webp), both with `contractId` in the caller's scope, signed as `type = authenticated` in folder `contracts/<buildingId>/<contractId>`; a verify step by asset id like `verifyRoomImage` but expecting `authenticated`; one helper that returns a signed delivery URL valid ≤ 5 minutes. `ROOM_IMAGE` stays unchanged.
  Done when: tests: a contract of another building → `OUT_OF_SCOPE`; a public asset or an asset outside the contract folder is refused; the signed URL expires within 5 minutes; the existing `ROOM_IMAGE` specs still pass.
- [ ] **BE-P3-05** Empty `contracts` module registered in `AppModule`, and the error codes Phase 3 needs that are not in `error-code.ts` yet (check the spec table first; `ROOM_NOT_AVAILABLE`, `DEPOSIT_NOT_PAID`, `PRICE_NOT_APPROVED`, `METER_VALUE_DECREASED` already exist). Update the module-list and error-count tests in the same change (LESSONS).
  Done when: `npm run test` passes with the updated counts.
- [ ] **BE-P3-06** ⏸ `npm run lint`, `npm run test`, `npm run build`; e2e if a route changed (command in `LESSONS.md`). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; list the `[ASSUMPTION]`s used.

## Questions for the owner

Đã trả lời 16/11/2026:

- Q-P3-4 (BE-P3-02): thiếu `CCCD_KEY` thì app không khởi động.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
