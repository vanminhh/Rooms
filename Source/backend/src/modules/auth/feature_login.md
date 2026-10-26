# Feature: Login (BE) · module `auth`

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order unless a task says otherwise. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`, "Review before changing main files"). Frontend counterpart: `Source/frontend/src/features/auth/feature_login.md`.

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` – roles, global rules G-01..G-10, decisions
3. `docs/spec/01-architecture.md` – API-01..08, error codes, AUTH-T1..T3
4. `docs/spec/02-database.md` – conventions; tables `users`, `sessions`, `password_reset_tokens`, `buildings`
5. `docs/spec/10-auth.md` – AUTH-01..09, SCOPE-01..04 (this feature)

## Scope

In: AUTH-01..07, AUTH-09, AUTH-10, AUTH-T1..T3, SCOPE-01..03, the API envelope/error format (API-02, API-03) and the foundation this feature needs (Prisma, migration, seed).
Out: `/managers` (AUTH-08, staff module), SCOPE-04 (Boss fallback in "Việc hôm nay", dashboard feature), staff resetting a tenant password (`POST /contracts/:id/reset-password`, contracts module), real email provider (a console mailer is enough here).

## 0 · Foundation (needed before login can work)

- [ ] **BE-LOGIN-01** Remove `ObserveModule` (placeholder keys `YOUR_APP_KEY`) from `src/app.module.ts` and the `@nestjs/observe` dependency.
  Done when: `npm run build` and `npm run test` pass.
- [ ] **BE-LOGIN-02** Install `prisma@6`, `@prisma/client@6`. Move (do not copy) `docs/database/schema.prisma`, `constraints.sql`, `check-constraints.mjs` to `Source/backend/prisma/`; update the paths in `docs/spec/02-database.md` and root `CLAUDE.md`.
  Done when: `npx prisma validate` passes and `docs/database/` no longer holds the files.
- [ ] **BE-LOGIN-03** Add `.env.example` with `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CCCD_KEY`, `BANK_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `MAIL_FROM`, `APP_URL` (placeholder values only). Validate required env vars at startup (fail fast with a clear message).
  Done when: starting without `DATABASE_URL` prints which variable is missing.
- [ ] **BE-LOGIN-04** First migration: `npx prisma migrate dev --create-only --name init`, append `prisma/constraints.sql` to the generated `migration.sql`, then apply to the dev database (Neon or Supabase — ask the owner for the connection string; never commit it).
  Done when: migration applied; `node prisma/check-constraints.mjs` (see `02-database.md`) still prints 50/50.
  Depends on: owner provides `DATABASE_URL` / `DIRECT_URL`.
- [ ] **BE-LOGIN-05** `PrismaService` (global module) with graceful shutdown.
- [ ] **BE-LOGIN-06** Seed (`prisma/seed.ts`, `npx prisma db seed`): 1 BOSS, 2 MANAGERs, 3 buildings (`CG01`, `DD01` → manager 1; `HM01` → no manager), 1 TENANT with `must_change_password = true`, 1 inactive TENANT. Dev passwords are fixed strings documented at the top of `seed.ts` (dev only).
  Also seed `settings.default_contact` = Boss's `{ phone, zaloUrl, facebookUrl }` and `settings.bank_account` placeholders.
  Done when: seed runs twice without errors (idempotent upsert by phone / building code / setting key).

## 1 · API skeleton

- [ ] **BE-LOGIN-07** `main.ts`: global prefix `/api/v1`, cookie parser, global validation pipe (whitelist + forbid unknown fields), CORS off (FE uses the Vite dev proxy).
- [ ] **BE-LOGIN-08** Response interceptor wrapping results as `{ data }` (API-02) and a global exception filter producing `{ error: { code, message, fields? } }` (API-03, API-04). One `ErrorCode` enum with the codes from `01-architecture.md#error-codes` plus `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED` from `10-auth.md`; messages in Vietnamese. Validation errors → `VALIDATION_FAILED` with `fields`.
  Done when: unit test shows a thrown `ConflictException(ErrorCode.PHONE_TAKEN)` and a validation failure both render the spec format.

## 2 · Passwords and tokens

- [ ] **BE-LOGIN-09** Password util: argon2id hash/verify, min length 8 (AUTH-03). Unit test.
- [ ] **BE-LOGIN-10** Token service: JWT access token 15 min with `sub`, `role` (AUTH-T1); refresh token = 32 random bytes, only its SHA-256 stored in `sessions.token_hash`; lifetime 30 days when `remember`, else 12 h [ASSUMPTION A-07] (AUTH-T2). Unit test for expiry choice.

## 3 · Endpoints

- [ ] **BE-LOGIN-11** `POST /auth/login` `{ phone, password, remember }` (AUTH-01, AUTH-02): same error `INVALID_CREDENTIALS` for unknown phone and wrong password; `ACCOUNT_LOCKED` for inactive users; sets `last_login_at`; returns `{ accessToken, user }` and sets the refresh cookie (httpOnly, Secure in prod, SameSite=Lax, path `/api/v1/auth`).
- [ ] **BE-LOGIN-12** Login rate limit: 5 failures per phone per 15 minutes → 429 `TOO_MANY_REQUESTS` (AUTH-04). In-memory store is acceptable for now with a `shortcut:` comment (single instance only).
- [ ] **BE-LOGIN-13** `POST /auth/refresh`: validates cookie against `sessions`, rejects revoked/expired, rotates (revoke old row, create new) (AUTH-T2).
- [ ] **BE-LOGIN-14** `POST /auth/logout`: revokes the current session, clears the cookie.
- [ ] **BE-LOGIN-15** `GET /auth/me`: user (no hash) + role + `mustChangePassword` + for staff `buildings: [{ id, code, name }]` (BOSS: all active).
- [ ] **BE-LOGIN-16** `PATCH /auth/me` (AUTH-09): everyone `email`; staff also `contactPhone`, `zaloUrl`, `facebookUrl`. Tenants sending staff fields → 403.
- [ ] **BE-LOGIN-17** `POST /auth/change-password` `{ currentPassword, newPassword }`: clears `must_change_password`, revokes all other sessions (AUTH-T3).
- [ ] **BE-LOGIN-18** `POST /auth/forgot-password` `{ phone }` → always 200 with identical body; if the user has an email, create a `password_reset_tokens` row (hash only, 30 min, single use) and send the link via a `MailerService` interface (console implementation for dev). `POST /auth/reset-password` `{ token, newPassword }` → sets password, marks token used, revokes sessions (AUTH-07).
- [ ] **BE-LOGIN-19** `GET /public/contact` (`@Public`): returns `settings.default_contact` `{ phone, zaloUrl, facebookUrl }` for the login page note (D-02, AUTH-10).

## 4 · Guards and scope

- [ ] **BE-LOGIN-20** `JwtAuthGuard` global with `@Public()` opt-out; `RolesGuard` with `@Roles()`; routes without `@Roles` or `@Public` are denied (SCOPE-01).
- [ ] **BE-LOGIN-21** `MustChangePasswordGuard`: when the flag is set, every route except change-password, logout, me returns 403 `PASSWORD_CHANGE_REQUIRED` (AUTH-05).
- [ ] **BE-LOGIN-22** Scope helpers in `src/common/scope`: `allowedBuildingIds(user)` (MANAGER: own active buildings; BOSS: all) and `scopeWhere(user)` Prisma fragment (SCOPE-02); `tenantOwns(user, contractId)` returning 404 semantics (SCOPE-03). Unit tests with the seed shape.
- [ ] **BE-LOGIN-23** Audit: write `audit_logs` for password changes and resets (AUD-01) via a small `AuditService.log(actorId, action, entity, entityId, before?, after?)`.

## 5 · Verification

- [ ] **BE-LOGIN-24** e2e tests (`npm run test:e2e`), each named with its spec ID:
  - AUTH-01: each seeded role logs in; wrong password and unknown phone give the same error
  - AUTH-02: inactive tenant → `ACCOUNT_LOCKED`
  - AUTH-04: 6th failed attempt → 429
  - AUTH-05: tenant with the flag gets `PASSWORD_CHANGE_REQUIRED` on every route except change-password, logout, me, until the password is changed
  - AUTH-10: `/public/contact` works without login and returns the seeded Boss contact
  - AUTH-T2: refresh rotates; the old refresh token no longer works
  - AUTH-T3: after change-password, other sessions' refresh fails
  - SCOPE-01: a route without decorators is denied
- [ ] **BE-LOGIN-25** `npm run lint`, `npm run test`, `npm run test:e2e` all pass. List every `[ASSUMPTION]` used (A-07) in the final summary.

## Questions for the owner

- None yet. Add here (and mark the task `[!]`) if the spec does not answer something.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
