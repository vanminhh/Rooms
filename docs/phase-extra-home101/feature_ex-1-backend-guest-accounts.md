# Phase Extra · Part 1 – Backend guest accounts and SMS code (BE-EX-01..09)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Fixes | Phase 1 (auth) |
| Needs first | – (clean `git status`) |
| Unblocks | EX-2, EX-6, Phase 3 (CON-07) |
| How | planner writes `plans/EX-1/PLAN.md` → main session builds → reviewer before the last stop (authorization + schema) |
| Part done when | BE-EX-09 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` – roles, G-04, D-25, D-26, A-11, Q-07
3. `docs/spec/01-architecture.md` – API-07, error codes, AUTH-T1..T3, DEP-02, DEP-04
4. `docs/spec/10-auth.md` – all of it (AUTH-06, 07, 10..15, SCOPE-03, SCOPE-05 are new or changed)
5. `docs/spec/02-database.md` – DB-07, "Planned changes" (rows EX-1)
6. Code: `Source/backend/src/modules/auth/` (service, controller, `rate-limiter.ts`, specs), `src/common/guards/`, `src/common/errors/error-code.ts`, `src/modules/mailer/mailer.service.ts` (the pattern for the SMS adapter), `prisma/schema.prisma`, `prisma/constraints.sql`, `prisma/check-constraints.mjs`

## Scope

In: role `GUEST`, sign-up, SMS code, phone verification, password reset by code, `users.locale`, who may call `/me/*`.
Out: the English texts of error messages (EX-3), viewings (EX-6), turning a guest into a tenant (Phase 3, CON-07), a real SMS provider SDK (waits for Q-07; the adapter and the dev logger are in).

## Tasks

- [ ] **BE-EX-01** ⏸ Migration `guest_accounts` (ask the owner before creating and before applying): enum `Role` + `GUEST`; `users.phone_verified_at timestamptz null`; `users.locale` (`vi` / `en`, default `vi`, CHECK); table `phone_otps` (phone, purpose `REGISTER` / `RESET_PASSWORD` / `VERIFY_PHONE`, code hash, tries, expires, used). Keep every rule of `constraints.sql` (DB-07). New scenarios in `check-constraints.mjs`: a GUEST as building manager is refused, a GUEST as contract tenant is refused, a bad `locale` is refused.
  Done when: `prisma migrate diff` shows only these changes; `node prisma/check-constraints.mjs . prisma` passes all old and new scenarios; `seed.spec.ts` passes. Report the new scenario count.
- [ ] **BE-EX-02** `sms` module: abstract `SmsService` + `ConsoleSmsService` that writes the code to the server log (dev and test), same pattern as `MailerService`. In production without a provider, sending throws `SMS_UNAVAILABLE` (503). `SMS_*` env vars are optional in `env.ts`; the app starts without them. No provider SDK is installed in this part (Q-07).
  Done when: unit tests for both cases; the app boots with no `SMS_*` set.
- [ ] **BE-EX-03** SMS code service (AUTH-13, A-11): 6 digits, valid 5 minutes, single use, stored as a hash, 5 wrong tries per code, resend after 60 s, 5 SMS per phone per day, 10 per IP per hour (reuse `rate-limiter.ts`; in memory, DEP-02). New error codes `OTP_INVALID`, `SMS_UNAVAILABLE`, `PHONE_NOT_VERIFIED` in `error-code.ts` and the filter.
  Done when: tests named `AUTH-13: …` for wrong, expired, used, 6th wrong try, resend before 60 s, 6th SMS of the day, 11th per IP; a send failure never returns success.
- [ ] **BE-EX-04** `POST /auth/register` (AUTH-11). A self-registered unverified account is exactly: role `GUEST` and `phone_verified_at` null (staff never create a GUEST), so no extra column is needed.
  Done when: tests `AUTH-11: …` for a new phone; a verified GUEST phone, a TENANT phone and a MANAGER phone → `PHONE_TAKEN`; an unverified GUEST phone → name and password replaced, new code sent, old password no longer works.
- [ ] **BE-EX-05** `POST /auth/verify-phone`, `POST /auth/resend-code`; login refuses an unverified GUEST with `PHONE_NOT_VERIFIED` (AUTH-12); a successful verify sets `phone_verified_at` and returns the same session as login (AUTH-T1, AUTH-T2).
  Done when: acceptance of spec 10 "A visitor signs up, cannot log in before the SMS code, and is logged in right after it"; accounts created by staff still log in with `phone_verified_at` null.
- [ ] **BE-EX-06** ⏸ `POST /auth/phone/send-code`, `POST /auth/phone/verify` for a logged-in account created by staff (AUTH-12, AUTH-14). Verifying links nothing and merges nothing.
  Done when: tests; `/auth/me` shows `phoneVerified`. Stop and report BE-EX-02..06.
- [ ] **BE-EX-07** Forgot and reset by SMS code (AUTH-07): a verified phone gets a code (purpose `RESET_PASSWORD`) and resets with `{ phone, code, newPassword }`; other accounts keep the email-link flow. The forgot response is identical in every case. A reset revokes all sessions (AUTH-T3).
  Done when: tests for both branches, an unknown phone, and "same response body" across the three.
- [ ] **BE-EX-08** Roles and scope: `GUEST` accepted by `@Roles`; one helper for "`/me/*` = GUEST or TENANT, own data" (API-07, SCOPE-03); a GUEST on a tenant-only `/me` route → `FORBIDDEN`; a GUEST on any staff route → `FORBIDDEN`; `GET /auth/me` returns the role and `locale`; `PATCH /auth/me` accepts `locale` (AUTH-15). Dev seed gets one verified GUEST (see Q-EX1-1).
  Done when: tests `SCOPE-03`, `SCOPE-05`, `AUTH-15`; `guards.spec.ts` covers the 4 roles.
- [ ] **BE-EX-09** ⏸ `npm run lint`, `test`, `build`, `test:e2e` (extend `test/auth.e2e-spec.ts` with sign-up → verify → login → reset by code). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; list the `[ASSUMPTION]`s used (A-11).

## Questions for the owner

- Q-EX1-1 (BE-EX-08): thêm một tài khoản khách mẫu vào seed dev (ví dụ `0900000006`, đã xác minh) để thử tay? Nếu có, danh sách tài khoản dev ở mục "Go-live checklist" của `01-architecture.md` (DEP-08) phải ghi thêm tài khoản này.
  Đề xuất: có.
- Q-07 (spec): nhà gửi SMS. Không chặn phần này; chặn chạy thật trên production.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
