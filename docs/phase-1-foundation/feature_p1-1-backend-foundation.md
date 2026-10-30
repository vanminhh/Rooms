# Phase 1 · Part 1 – Backend foundation (BE-LOGIN-01..08)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order unless a task says otherwise. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`, "Review before changing main files"). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 0: `Source/backend/.env` with the Supabase URLs (P1-SETUP-01), backend packages installed (P1-SETUP-02) |
| Unblocks | Part 2; P1-QA-02 in part 5 |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-LOGIN-01-08/`, plus a small draft in `Artifacts/` for the doc path edits of BE-LOGIN-02 |
| How | Pipeline |
| Part done when | On the main files: `npx prisma validate` passes; the first migration is applied to the dev database; `node prisma/check-constraints.mjs . .` prints 50/50; the seed runs twice without errors; `npm run lint` and `npm run test` pass |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` – roles, global rules G-01..G-10, decisions
3. `docs/spec/01-architecture.md` – API-01..08, error codes, the roadmap's Phase 1 seed
4. `docs/spec/02-database.md` – conventions, the DB check; tables `users`, `sessions`, `password_reset_tokens`, `buildings`, `settings`, and for the seed `rooms`, `room_prices`, `services`, `rate_plans`, `rate_tiers`, `contracts`, `contract_services`, `occupants`, `vehicles`, `meter_readings`
5. `docs/spec/10-auth.md` – roles and account states; the seed (BE-LOGIN-06) must serve the login tests of part 2
6. For the seed only: `11-buildings-rooms.md` (SVC-01), `12-pricing.md` (PRC-04, RATE-02, seed values), `14-contracts.md` (CON-04, CON-07, CON-10), `16-billing.md` (periods, BIL-01, BIL-09)

## Scope

In: the foundation the login feature needs – Prisma, first migration, seed, `PrismaService`, the API skeleton and the envelope/error format (API-02, API-03, API-04).
Out: everything from BE-LOGIN-09 on (part 2): passwords, tokens, auth endpoints, guards, scope, audit.

## 0 · Foundation (needed before login can work)

- [x] **BE-LOGIN-01** Remove `ObserveModule` (placeholder keys `YOUR_APP_KEY`) from `src/app.module.ts` and the `@nestjs/observe` dependency.
  Done when: `npm run build` and `npm run test` pass.
- [x] **BE-LOGIN-02** Install `prisma@6`, `@prisma/client@6`. Move (do not copy) `docs/database/schema.prisma`, `constraints.sql`, `check-constraints.mjs` to `Source/backend/prisma/`; update the paths in `docs/spec/02-database.md` and root `CLAUDE.md`.
  Done when: `npx prisma validate` passes and `docs/database/` no longer holds the files.
  Note: the packages are installed in P1-SETUP-02. The two doc files sit outside `Source/backend/`, so their path edits go in a separate small draft in `Artifacts/`; the old files in `docs/database/` are deleted by hand after the owner's OK.
- [x] **BE-LOGIN-03** Add `.env.example` with `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CCCD_KEY`, `BANK_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `MAIL_FROM`, `APP_URL` (placeholder values only). Validate required env vars at startup (fail fast with a clear message).
  Done when: starting without `DATABASE_URL` prints which variable is missing.
- [x] **BE-LOGIN-04** First migration: `npx prisma migrate dev --create-only --name init`, append `prisma/constraints.sql` to the generated `migration.sql`, then apply to the dev database (Neon or Supabase — ask the owner for the connection string; never commit it).
  Done when: migration applied; `node prisma/check-constraints.mjs` (see `02-database.md`) still prints 50/50.
  Depends on: owner provides `DATABASE_URL` / `DIRECT_URL` (P1-SETUP-01: Supabase, already in `Source/backend/.env`; never paste it into chat).
- [x] **BE-LOGIN-05** `PrismaService` (global module) with graceful shutdown.
- [x] **BE-LOGIN-06** Seed (`prisma/seed.ts`, `npx prisma db seed`), everything the roadmap lists for Phase 1 (`01-architecture.md#roadmap`). Every row goes in through the same rules the app enforces, so it passes `constraints.sql`.
  - Users: 1 BOSS, 2 MANAGERs, 1 TENANT with `must_change_password = true`, 1 inactive TENANT. Dev passwords are fixed strings documented at the top of `seed.ts` (dev only).
  - Buildings: `CG01`, `DD01` → manager 1; `HM01` → no manager. `water_mode = PER_M3`, `due_days = 5`.
  - Settings: `settings.default_contact` = Boss's `{ phone, zaloUrl, facebookUrl }` and `settings.bank_account` placeholders.
  - Rooms: 2–3 per building. A priced room has an APPROVED `room_prices` row (`effective_from` 01/09/2026, proposed and reviewed by the Boss, PRC-04) and `rooms.price` set. Each building keeps at least one priced room free (for the public pages of Phase 2); `CG01` also has one room without a price (hidden from guests, CON-02).
  - Services per building (SVC-01): "Wifi" ROOM, "Rác" PERSON, "Gửi xe máy" VEHICLE, "Gửi xe điện" VEHICLE.
  - Rate plans per building, APPROVED by the Boss, `effective_from` 01/09/2026, with the seed values of `12-pricing.md`: ELECTRIC tiers 0–50: 3.000 · 51–100: 3.500 · 101+: 4.000; WATER 15.000 đ/m³; Wifi 100.000; Rác 30.000; Gửi xe máy 100.000 (RATE-02: one tier for water and services). "Gửi xe điện" gets no rate plan until the owner gives its price (Questions for the owner).
  - Active contract: the TENANT with the flag holds one ACTIVE contract shaped like BIL-01 and BIL-09, so Phase 4 can reuse it: a `CG01` room priced 2.500.000, `start_date` 15/09/2026, `term_months` 6, `end_date` 14/03/2027, `billing_day` 15, `rent` 2.500.000, `deposit` 0 (CON-10: no deposit invoice needed). `signed_at` and `moved_in_at` set; the tenant is the signer occupant (CON-04, CCCD fields empty) plus a second occupant; contract services Wifi and Rác; 1 motorbike on "Gửi xe máy"; first readings on 15/09/2026: electric 1.284, water any value.
  Done when: seed runs twice without errors (idempotent upsert by phone / building code / setting key / room code in its building / service name in its building / contract code).

## 1 · API skeleton

- [x] **BE-LOGIN-07** `main.ts`: global prefix `/api/v1`, cookie parser, global validation pipe (whitelist + forbid unknown fields), CORS off (FE uses the Vite dev proxy).
- [x] **BE-LOGIN-08** Response interceptor wrapping results as `{ data }` (API-02) and a global exception filter producing `{ error: { code, message, fields? } }` (API-03, API-04). One `ErrorCode` enum with the codes from `01-architecture.md#error-codes` plus `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED` from `10-auth.md`; messages in Vietnamese. Validation errors → `VALIDATION_FAILED` with `fields`.
  Done when: unit test shows a thrown `ConflictException(ErrorCode.PHONE_TAKEN)` and a validation failure both render the spec format.

## Questions for the owner

- BE-LOGIN-06: what is the seed price of "Gửi xe điện" (đ/xe/kỳ)? `12-pricing.md` gives seed prices for Wifi, Rác and Gửi xe máy only. Until answered, the service is seeded without a rate plan.
- Pipeline Q1 (BE-LOGIN-07/08 e2e, typecheck): may the pipeline run `prisma generate` with dummy env (writes only `node_modules/.prisma`, no DB)? Proposed: yes.
- Pipeline Q2 (BE-LOGIN-02/04): may the coder write `migration.sql` with `prisma migrate diff -o <draft folder>`, an exception to "no file writes through shell" in `coder.md`? Proposed: yes; otherwise ~600 lines of SQL copied by hand.
- Pipeline Q3 (BE-LOGIN-03): which env vars are required at startup? Proposed: `DATABASE_URL` and `DIRECT_URL` only; later parts add their own. Alternatives: all 8, or those two plus `JWT_SECRET`.
- Pipeline Q4 (BE-LOGIN-08): error code for HTTP 500? `01-architecture.md#error-codes` has none. Proposed: `INTERNAL_ERROR`.
- Pipeline Q5 (BE-LOGIN-06): what does a re-run of the seed overwrite? Proposed: reset only the 5 dev accounts (part 2 e2e changes the flagged tenant's password). Alternatives: overwrite nothing, or reset every seeded row.
- Answered 29/10/2026 (owner): Q1 yes, Q2 yes, Q3 `DATABASE_URL` + `DIRECT_URL` only, Q4 `INTERNAL_ERROR` (to be added to `01-architecture.md#error-codes` by a draft), Q5 reset only the 5 dev accounts.
- Pipeline Q6 (BE-LOGIN-08): a path outside `/api/v1` gets Express's HTML "Cannot GET", not the API-03 error body (Nest 12 binds its not-found handler under the global prefix only). A) add a ~3-line middleware so every unknown path returns 404 `NOT_FOUND` in the API-03 format (proposed) · B) accept any 404 body outside `/api/v1`.
  Answered 29/10/2026 (owner): A.
- Pipeline Q7 (BE-LOGIN-06): `import.meta.main` (reviewer fix 5) fails `tsc` because `@types/node` is pinned at 24.0.0 (declared from 24.2.0). A) bump `@types/node` to 24.19.2 (package outside the part-0 list, proposed) · B) keep 24.0.0 and add a 3-line local type declaration in `seed.ts` · C) leave the type error.
- Pipeline Q8 (BE-LOGIN-08): body-parser client errors (413 too large, 415 bad charset) now return 400 `VALIDATION_FAILED` (API-04 lists no 413/415). A) keep 400 (proposed) · B) add 413/415 codes to the spec.
  Answered 29/10/2026 (owner): Q7 A, bump `@types/node` to 24.19.2 (exact); Q8 A, keep 400 `VALIDATION_FAILED`.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 29/10/2026 · BE-LOGIN-03, 04, 06, 08 · planner stopped at PLAN.md with 5 open questions (Q1–Q5 above); no checkpoint run yet · owner's answers (answered 29/10/2026: all as proposed)
- 29/10/2026 · BE-LOGIN-08 · CP-3 tester FAIL 103/104: paths outside `/api/v1` return Express HTML 404, not API-03 (`src/app.setup.spec.ts:238`, `test/app.e2e-spec.ts:33`); CP-1, CP-2 PASS · owner's choice for Q6
- 29/10/2026 · BE-LOGIN-06 · "sửa thêm" 5: `import.meta.main` fails `tsc` with `@types/node` 24.0.0; fix 3 written (413/415 → 400) · owner's choice for Q7, Q8
