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
3. `docs/spec/01-architecture.md` – API-01..08, error codes
4. `docs/spec/02-database.md` – conventions, the DB check; tables `users`, `sessions`, `password_reset_tokens`, `buildings`, `settings`
5. `docs/spec/10-auth.md` – roles and account states; the seed (BE-LOGIN-06) must serve the login tests of part 2

## Scope

In: the foundation the login feature needs – Prisma, first migration, seed, `PrismaService`, the API skeleton and the envelope/error format (API-02, API-03, API-04).
Out: everything from BE-LOGIN-09 on (part 2): passwords, tokens, auth endpoints, guards, scope, audit.

## 0 · Foundation (needed before login can work)

- [ ] **BE-LOGIN-01** Remove `ObserveModule` (placeholder keys `YOUR_APP_KEY`) from `src/app.module.ts` and the `@nestjs/observe` dependency.
  Done when: `npm run build` and `npm run test` pass.
- [ ] **BE-LOGIN-02** Install `prisma@6`, `@prisma/client@6`. Move (do not copy) `docs/database/schema.prisma`, `constraints.sql`, `check-constraints.mjs` to `Source/backend/prisma/`; update the paths in `docs/spec/02-database.md` and root `CLAUDE.md`.
  Done when: `npx prisma validate` passes and `docs/database/` no longer holds the files.
  Note: the packages are installed in P1-SETUP-02. The two doc files sit outside `Source/backend/`, so their path edits go in a separate small draft in `Artifacts/`; the old files in `docs/database/` are deleted by hand after the owner's OK.
- [ ] **BE-LOGIN-03** Add `.env.example` with `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CCCD_KEY`, `BANK_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `MAIL_FROM`, `APP_URL` (placeholder values only). Validate required env vars at startup (fail fast with a clear message).
  Done when: starting without `DATABASE_URL` prints which variable is missing.
- [ ] **BE-LOGIN-04** First migration: `npx prisma migrate dev --create-only --name init`, append `prisma/constraints.sql` to the generated `migration.sql`, then apply to the dev database (Neon or Supabase — ask the owner for the connection string; never commit it).
  Done when: migration applied; `node prisma/check-constraints.mjs` (see `02-database.md`) still prints 50/50.
  Depends on: owner provides `DATABASE_URL` / `DIRECT_URL` (P1-SETUP-01: Supabase, already in `Source/backend/.env`; never paste it into chat).
- [ ] **BE-LOGIN-05** `PrismaService` (global module) with graceful shutdown.
- [ ] **BE-LOGIN-06** Seed (`prisma/seed.ts`, `npx prisma db seed`): 1 BOSS, 2 MANAGERs, 3 buildings (`CG01`, `DD01` → manager 1; `HM01` → no manager), 1 TENANT with `must_change_password = true`, 1 inactive TENANT. Dev passwords are fixed strings documented at the top of `seed.ts` (dev only).
  Also seed `settings.default_contact` = Boss's `{ phone, zaloUrl, facebookUrl }` and `settings.bank_account` placeholders.
  Done when: seed runs twice without errors (idempotent upsert by phone / building code / setting key).

## 1 · API skeleton

- [ ] **BE-LOGIN-07** `main.ts`: global prefix `/api/v1`, cookie parser, global validation pipe (whitelist + forbid unknown fields), CORS off (FE uses the Vite dev proxy).
- [ ] **BE-LOGIN-08** Response interceptor wrapping results as `{ data }` (API-02) and a global exception filter producing `{ error: { code, message, fields? } }` (API-03, API-04). One `ErrorCode` enum with the codes from `01-architecture.md#error-codes` plus `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED` from `10-auth.md`; messages in Vietnamese. Validation errors → `VALIDATION_FAILED` with `fields`.
  Done when: unit test shows a thrown `ConflictException(ErrorCode.PHONE_TAKEN)` and a validation failure both render the spec format.

## Questions for the owner

- None yet. Add here (and mark the task `[!]`) if the spec does not answer something.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
