# Phase 1 · Part 2 – Backend login and access control (BE-LOGIN-09..25)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order unless a task says otherwise. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`, "Review before changing main files"). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 1 on the main files |
| Unblocks | Part 4 (the frontend calls this API); P1-QA-03 in part 5 |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-LOGIN-09-25/` |
| How | Pipeline |
| Part done when | BE-LOGIN-25 on the main files, and each seeded role can log in through `POST /api/v1/auth/login` |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` – roles, global rules G-01..G-10, decisions
3. `docs/spec/01-architecture.md` – API-01..08, error codes, AUTH-T1..T3
4. `docs/spec/02-database.md` – conventions; tables `users`, `sessions`, `password_reset_tokens`, `buildings`
5. `docs/spec/10-auth.md` – AUTH-01..09, SCOPE-01..04 (this part)
6. The code part 1 added: `prisma/`, `PrismaService`, `main.ts`, the response interceptor and the error filter

## Scope

In: AUTH-01..07, AUTH-09, AUTH-10, AUTH-T1..T3, SCOPE-01..03.
Out: `/managers` (AUTH-08, staff module), SCOPE-04 (Boss fallback in "Việc hôm nay", dashboard feature), staff resetting a tenant password (`POST /contracts/:id/reset-password`, contracts module), real email provider (a console mailer is enough here).

## 2 · Passwords and tokens

- [~] **BE-LOGIN-09** Password util: argon2id hash/verify, min length 8 (AUTH-03). Unit test.
- [~] **BE-LOGIN-10** Token service: JWT access token 15 min with `sub`, `role` (AUTH-T1); refresh token = 32 random bytes, only its SHA-256 stored in `sessions.token_hash`; lifetime 30 days when `remember`, else 12 h [ASSUMPTION A-07] (AUTH-T2). Unit test for expiry choice.

## 3 · Endpoints

- [~] **BE-LOGIN-11** `POST /auth/login` `{ phone, password, remember }` (AUTH-01, AUTH-02): same error `INVALID_CREDENTIALS` for unknown phone and wrong password; `ACCOUNT_LOCKED` for inactive users; sets `last_login_at`; returns `{ accessToken, user }` and sets the refresh cookie (httpOnly, Secure in prod, SameSite=Lax, path `/api/v1/auth`).
- [~] **BE-LOGIN-12** Login rate limit: 5 failures per phone per 15 minutes → 429 `TOO_MANY_REQUESTS` (AUTH-04). In-memory store is acceptable for now with a `shortcut:` comment (single instance only).
- [~] **BE-LOGIN-13** `POST /auth/refresh`: validates cookie against `sessions`, rejects revoked/expired, rotates (revoke old row, create new) (AUTH-T2).
- [~] **BE-LOGIN-14** `POST /auth/logout`: revokes the current session, clears the cookie.
- [~] **BE-LOGIN-15** `GET /auth/me`: user (no hash) + role + `mustChangePassword` + for staff `buildings: [{ id, code, name }]` (BOSS: all active).
- [~] **BE-LOGIN-16** `PATCH /auth/me` (AUTH-09): everyone `email`; staff also `contactPhone`, `zaloUrl`, `facebookUrl`. Tenants sending staff fields → 403.
- [~] **BE-LOGIN-17** `POST /auth/change-password` `{ currentPassword, newPassword }`: clears `must_change_password`, revokes all other sessions (AUTH-T3).
- [~] **BE-LOGIN-18** `POST /auth/forgot-password` `{ phone }` → always 200 with identical body; if the user has an email, create a `password_reset_tokens` row (hash only, 30 min, single use) and send the link via a `MailerService` interface (console implementation for dev). `POST /auth/reset-password` `{ token, newPassword }` → sets password, marks token used, revokes sessions (AUTH-07).
- [~] **BE-LOGIN-19** `GET /public/contact` (`@Public`): returns `settings.default_contact` `{ phone, zaloUrl, facebookUrl }` for the login page note (D-02, AUTH-10).

## 4 · Guards and scope

- [~] **BE-LOGIN-20** `JwtAuthGuard` global with `@Public()` opt-out; `RolesGuard` with `@Roles()`; routes without `@Roles` or `@Public` are denied (SCOPE-01).
- [~] **BE-LOGIN-21** `MustChangePasswordGuard`: when the flag is set, every route except change-password, logout, me returns 403 `PASSWORD_CHANGE_REQUIRED` (AUTH-05).
- [~] **BE-LOGIN-22** Scope helpers in `src/common/scope`: `allowedBuildingIds(user)` (MANAGER: own active buildings; BOSS: all) and `scopeWhere(user)` Prisma fragment (SCOPE-02); `tenantOwns(user, contractId)` returning 404 semantics (SCOPE-03). Unit tests with the seed shape.
- [~] **BE-LOGIN-23** Audit: write `audit_logs` for password changes and resets (AUD-01) via a small `AuditService.log(actorId, action, entity, entityId, before?, after?)`.

## 5 · Verification

- [~] **BE-LOGIN-24** e2e tests (`npm run test:e2e`), each named with its spec ID:
  - AUTH-01: each seeded role logs in; wrong password and unknown phone give the same error
  - AUTH-02: inactive tenant → `ACCOUNT_LOCKED`
  - AUTH-04: 6th failed attempt → 429
  - AUTH-05: tenant with the flag gets `PASSWORD_CHANGE_REQUIRED` on every route except change-password, logout, me, until the password is changed
  - AUTH-10: `/public/contact` works without login and returns the seeded Boss contact
  - AUTH-T2: refresh rotates; the old refresh token no longer works
  - AUTH-T3: after change-password, other sessions' refresh fails
  - SCOPE-01: a route without decorators is denied
  e2e tests need the whole app and the dev database (`Source/backend/.env`), so they cannot run while the work is a draft: run `npm run test:e2e` after the part is applied to the main files, and fix failures in a follow-up draft.
- [~] **BE-LOGIN-25** `npm run lint`, `npm run test`, `npm run test:e2e` all pass. List every `[ASSUMPTION]` used (A-07) in the final summary.

## Questions for the owner

- Pipeline Q1–Q6 and the spec conflicts in `Source/backend/artifact_BE/2026-10-29-BE-LOGIN-09-25/PLAN.md` §3.1 and §3.4 (each with a proposed option): Q1 session expiry on refresh rotation (BE-LOGIN-13) · Q2 AUTH-04 details and order with AUTH-02 (BE-LOGIN-11, 12) · Q3 change-password errors (BE-LOGIN-17) · Q4 forgot/reset details (BE-LOGIN-18) · Q5 `PATCH /auth/me` validation (BE-LOGIN-16) · Q6 restoring seed data after e2e (BE-LOGIN-24) · spec conflicts: AUTH-T3 "all sessions" vs API table "other sessions"; `OUT_OF_SCOPE` vs SCOPE-03 404.
  Answered 29/10/2026 (owner): every question as proposed in PLAN.md §3.1 (Q1 A keep the original expiry, Q2 A, Q3 A, Q4 proposed set, Q5 A, Q6 A re-run the seed); spec conflicts as proposed: change-password revokes the other sessions (reset by email revokes all), tenant touching another's contract gets 404. The spec wording is fixed later by a separate draft.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 29/10/2026 · BE-LOGIN-11, 12, 13, 16, 17, 18, 24 · planner stopped at PLAN.md with open questions Q1–Q6 and two spec conflicts; no checkpoint run yet · owner's answers (answered 29/10/2026: all as proposed)
