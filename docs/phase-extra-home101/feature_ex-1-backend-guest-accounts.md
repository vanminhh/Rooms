# Phase Extra · Part 1 – Backend guest accounts and email code (BE-EX-01..09, BE-EX-33..35)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Fixes | Phase 1 (auth) |
| Needs first | – (clean `git status`) |
| Unblocks | EX-2, EX-6, Phase 3 (CON-07) |
| How | planner writes `plans/EX-1/PLAN.md` → main session builds → reviewer before the last stop (authorization + schema) |
| Part done when | BE-EX-09 verified |

**Changed 12/11/2026, after BE-EX-01..06 were built.** The owner dropped the SMS code to avoid SMS fees (final D-25): a guest signs up with phone, **email** and password, and the email is verified by a 6-digit code. Tasks BE-EX-01..06 below stay marked done as they were built (SMS); tasks **BE-EX-33..35** convert that work to email and come **next, before BE-EX-07**. Read `docs/spec/10-auth.md` again first: AUTH-07 and AUTH-11..14 changed, and `plans/EX-1/PLAN.md` must be updated to match before coding.

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` – roles, G-04, D-25, D-26, A-11, Q-07
3. `docs/spec/01-architecture.md` – API-07, error codes, AUTH-T1..T3, DEP-02, DEP-04
4. `docs/spec/10-auth.md` – all of it (AUTH-06, 07, 10..15, SCOPE-03, SCOPE-05 are new or changed)
5. `docs/spec/02-database.md` – DB-07, "Planned changes" (rows EX-1)
6. Code: `Source/backend/src/modules/auth/` (service, controller, `rate-limiter.ts`, specs), `src/common/guards/`, `src/common/errors/error-code.ts`, `src/modules/mailer/mailer.service.ts` (the pattern for the SMS adapter), `prisma/schema.prisma`, `prisma/constraints.sql`, `prisma/check-constraints.mjs`

## Scope

In: role `GUEST`, sign-up with email, the email code, `users.locale`, who may call `/me/*`.
Out: the English texts of error messages (EX-3), viewings (EX-6), turning a guest into a tenant (Phase 3, CON-07), a real email provider (EX-8; the mailer logs in dev).

## Tasks

- [x] **BE-EX-01** ⏸ Migration `guest_accounts` (ask the owner before creating and before applying): enum `Role` + `GUEST`; `users.phone_verified_at timestamptz null`; `users.locale` (`vi` / `en`, default `vi`, CHECK); table `phone_otps` (phone, purpose `REGISTER` / `RESET_PASSWORD` / `VERIFY_PHONE`, code hash, tries, expires, used). Keep every rule of `constraints.sql` (DB-07). New scenarios in `check-constraints.mjs`: a GUEST as building manager is refused, a GUEST as contract tenant is refused, a bad `locale` is refused.
  Done when: `prisma migrate diff` shows only these changes; `node prisma/check-constraints.mjs . prisma` passes all old and new scenarios; `seed.spec.ts` passes. Report the new scenario count.
- [x] **BE-EX-02** `sms` module: abstract `SmsService` + `ConsoleSmsService` that writes the code to the server log (dev and test), same pattern as `MailerService`. In production without a provider, sending throws `SMS_UNAVAILABLE` (503). `SMS_*` env vars are optional in `env.ts`; the app starts without them. No provider SDK is installed in this part (Q-07).
  Done when: unit tests for both cases; the app boots with no `SMS_*` set.
- [x] **BE-EX-03** SMS code service (AUTH-13, A-11): 6 digits, valid 5 minutes, single use, stored as a hash, 5 wrong tries per code, resend after 60 s, 5 SMS per phone per day, 10 per IP per hour (reuse `rate-limiter.ts`; in memory, DEP-02). New error codes `OTP_INVALID`, `SMS_UNAVAILABLE`, `PHONE_NOT_VERIFIED` in `error-code.ts` and the filter.
  Done when: tests named `AUTH-13: …` for wrong, expired, used, 6th wrong try, resend before 60 s, 6th SMS of the day, 11th per IP; a send failure never returns success.
- [x] **BE-EX-04** `POST /auth/register` (AUTH-11). A self-registered unverified account is exactly: role `GUEST` and `phone_verified_at` null (staff never create a GUEST), so no extra column is needed.
  Done when: tests `AUTH-11: …` for a new phone; a verified GUEST phone, a TENANT phone and a MANAGER phone → `PHONE_TAKEN`; an unverified GUEST phone → name and password replaced, new code sent, old password no longer works.
- [x] **BE-EX-05** `POST /auth/verify-phone`, `POST /auth/resend-code`; login refuses an unverified GUEST with `PHONE_NOT_VERIFIED` (AUTH-12); a successful verify sets `phone_verified_at` and returns the same session as login (AUTH-T1, AUTH-T2).
  Done when: acceptance of spec 10 "A visitor signs up, cannot log in before the SMS code, and is logged in right after it"; accounts created by staff still log in with `phone_verified_at` null.
- [x] **BE-EX-06** ⏸ `POST /auth/phone/send-code`, `POST /auth/phone/verify` for a logged-in account created by staff (AUTH-12, AUTH-14). Verifying links nothing and merges nothing.
  Done when: tests; `/auth/me` shows `phoneVerified`. Stop and report BE-EX-02..06.
- [x] **BE-EX-33** ⏸ Schema for email verification (ask the owner before creating and before applying). The migration `guest_accounts` is already applied to the dev database, so this is a **new** migration: add `users.email_verified_at`; the code table gets an email target. Whether the now unused `users.phone_verified_at` and the phone columns of the code table are dropped or left is decided in the plan and asked of the owner (dropping a column cannot be undone by git). `constraints.sql` and the DB-check scenarios follow.
  Done when: `prisma migrate diff` shows only the intended changes; the migration runs on a database that already has `guest_accounts`; DB check passes all scenarios (report the count); `seed.spec.ts` passes.
- [x] **BE-EX-34** Code channel from SMS to email (AUTH-13, A-11): the code service sends through `MailerService` with the limits per email address (5 a day, 10 per IP per hour, resend after 60 s); error codes become `EMAIL_NOT_VERIFIED`, `MAIL_UNAVAILABLE`, `EMAIL_TAKEN`, and `PHONE_NOT_VERIFIED`, `SMS_UNAVAILABLE` are removed (`OTP_INVALID` stays). The `sms` module is no longer used: ask the owner, then delete it and its `SMS_*` env entries.
  Done when: the `AUTH-13: …` tests pass with email as the target; no `sms` import is left; the app boots without any `SMS_*`.
- [x] **BE-EX-35** ⏸ Sign-up with email (AUTH-11, AUTH-12, AUTH-14): `POST /auth/register { fullName, phone, email, password }`; `PHONE_TAKEN` / `EMAIL_TAKEN` for a verified or staff-created account; a never-verified self-registered account with the same phone or email is replaced; `POST /auth/verify-email`, `POST /auth/resend-code`; login of an unverified GUEST → `EMAIL_NOT_VERIFIED`; the routes `/auth/phone/send-code` and `/auth/phone/verify` are removed (staff-created accounts need no verification); `/auth/me` shows `emailVerified`. Update the tests written for BE-EX-04..06.
  Done when: the three sign-up acceptance lines of spec 10 pass; `npm run lint`, `test`, `build` pass. Stop and report BE-EX-33..35.
- [x] **BE-EX-07** Forgot password for guests (AUTH-07): the Phase 1 email-link flow also serves GUEST accounts; an account whose email is not verified gets no link; the response is identical for every case. No SMS branch.
  Done when: tests for a verified GUEST (link sent), an unverified GUEST and an unknown phone (no link), and "same response body" across the three.
- [x] **BE-EX-08** Roles and scope: `GUEST` accepted by `@Roles`; one helper for "`/me/*` = GUEST or TENANT, own data" (API-07, SCOPE-03); a GUEST on a tenant-only `/me` route → `FORBIDDEN`; a GUEST on any staff route → `FORBIDDEN`; `GET /auth/me` returns the role and `locale`; `PATCH /auth/me` accepts `locale` (AUTH-15). Dev seed gets one verified GUEST (see Q-EX1-1).
  Done when: tests `SCOPE-03`, `SCOPE-05`, `AUTH-15`; `guards.spec.ts` covers the 4 roles.
- [x] **BE-EX-09** ⏸ `npm run lint`, `test`, `build`, `test:e2e` (extend `test/auth.e2e-spec.ts` with sign-up → email code → login → forgot password by link). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; list the `[ASSUMPTION]`s used (A-11).

## Questions for the owner

- Q-EX1-1 (BE-EX-08): thêm một tài khoản khách mẫu vào seed dev (ví dụ `0900000006`, đã xác minh) để thử tay? Nếu có, danh sách tài khoản dev ở mục "Go-live checklist" của `01-architecture.md` (DEP-08) phải ghi thêm tài khoản này.
  Đề xuất: có.
- Q-07 (spec): nhà gửi SMS. Không chặn phần này; chặn chạy thật trên production.

Đã trả lời 12/11/2026 (chủ dự án chọn theo đề xuất):

- Q-EX1-1: có, seed dev thêm GUEST `0900000006` đã xác minh; ghi vào danh sách DEP-08.
- Migration `guest_accounts`: được tạo file; chạy vào DB thì hỏi riêng.
- Q-EX1-2: `/auth/forgot-password` và `/auth/resend-code` luôn 200, lỗi SMS chỉ ghi log; chỉ `register` và `/auth/phone/send-code` trả `SMS_UNAVAILABLE`.
- Q-EX1-3: "5 SMS mỗi số mỗi ngày" = ngày lịch giờ Việt Nam, đếm từ bảng `phone_otps`; "10 mỗi IP mỗi giờ" giữ trong bộ nhớ.
- Q-EX1-4: gửi mã mới cho cùng số + mục đích thì mã cũ chưa dùng hết hiệu lực.
- Q-EX1-5: GUEST chưa xác minh đăng nhập: kiểm mật khẩu trước, chỉ khi đúng mới trả `PHONE_NOT_VERIFIED`; không tự gửi mã.
- Q-EX1-6: `/auth/phone/*` cho mọi tài khoản đã đăng nhập mà số chưa xác minh (TENANT, MANAGER, BOSS).
- Q-EX1-7: tài khoản bị khóa không nhận mã SMS khi quên mật khẩu (như nhánh email).
- Q-EX1-8 (từ planner): `users.locale` lúc đăng ký lấy từ header `Accept-Language`.
- Q-EX1-9 (từ planner): đăng ký bằng số của GUEST chưa xác minh nhưng đã bị khóa → `PHONE_TAKEN`, không hồi sinh.

Sửa đổi 12/11/2026 (chủ dự án, sau khi BE-EX-01..06 đã làm): bỏ mã SMS, xác minh bằng mã gửi qua email. Các câu trả lời trên về SMS đổi theo như sau:

- Q-07: đóng, không cần nhà gửi SMS. Dịch vụ gửi email là Q-14 (phần EX-8).
- Q-EX1-1: tài khoản GUEST mẫu `0900000006` có email đã xác minh.
- Q-EX1-2: `/auth/forgot-password` và `/auth/resend-code` vẫn luôn 200; chỉ `register` trả `MAIL_UNAVAILABLE`.
- Q-EX1-3: "5 mã mỗi ngày" tính theo địa chỉ email, ngày lịch giờ Việt Nam; "10 mỗi IP mỗi giờ" giữ trong bộ nhớ.
- Q-EX1-5: GUEST chưa xác minh đăng nhập đúng mật khẩu → `EMAIL_NOT_VERIFIED`; không tự gửi mã.
- Q-EX1-6: bỏ, không còn `/auth/phone/*`.
- Q-EX1-7: không còn mã SMS khi quên mật khẩu; tài khoản bị khóa không nhận link như cũ.
- Q-EX1-4, Q-EX1-8, Q-EX1-9: giữ nguyên.
- Q-EX1-10 (planner): số thuộc một khách chưa xác minh, email thuộc một khách chưa xác minh khác → `EMAIL_TAKEN`, không gộp.
- Q-EX1-11 (planner): không thêm hạn mức theo số điện thoại hay IP mỗi ngày; giữ 5 mã/email/ngày và 10 mã/IP/giờ.
- Q-EX1-12 (planner): quy tắc "email chưa xác minh không nhận link quên mật khẩu" chỉ áp cho khách tự đăng ký; quản lý và người thuê do nhân sự tạo vẫn nhận link như Phase 1 (chủ dự án trả lời bằng lời, [ASSUMPTION] cách hiểu này).
- BE-EX-33: được xóa cột `users.phone_verified_at` và đổi `phone_otps` thành bảng mã email; được xóa module `sms`; được tạo file migration (áp vào DB dev thì hỏi riêng).

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 12/11/2026 · BE-EX-02..06 · chủ dự án đổi quyết định sau khi các task này đã làm xong (mã SMS → mã email) · làm tiếp BE-EX-33..35; phần đã viết cho SMS được chuyển sang email, module `sms` bị xóa sau khi chủ dự án đồng ý
