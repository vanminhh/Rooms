# Phase Extra · Part 2 – Frontend guest accounts (FE-EX-01..07)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

Rewritten 12/11/2026 after the owner's final decision D-25: the account is verified by an email code, not an SMS code.

| | |
|---|---|
| Fixes | Phase 1 (login pages, route guard, layouts) |
| Needs first | EX-1 committed (including BE-EX-33..35) |
| Unblocks | EX-3, EX-7 |
| How | main session builds (one module); planner not needed |
| Part done when | FE-EX-07 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/10-auth.md` – AUTH-06, 07, 10..15
3. `docs/spec/30-frontend.md` – layouts table, route guard, Public pages `/dang-nhap`, `/dang-ky`, `/xac-minh-email`, `/quen-mat-khau`, Guest pages `/toi`, `/toi/tai-khoan`; UI-03, UI-05, UI-07..09
4. `docs/spec/31-ui-kit.md` – KIT-01, KIT-05, KIT-07
5. Code: `Source/frontend/src/app/` (`routes.tsx`, `guards.ts`, `RequireAuth.tsx`, `AuthProvider.tsx`), `src/features/auth/`, `src/pages/public/LoginPage.tsx`, `ForgotPasswordPage.tsx`, `src/layouts/`, `tests/auth-*.test.mjs`, `tests/p2/ui-30-login.test.mjs`

## Scope

In: 4-role routing, sign-up and email-code pages, the login page change, `GuestLayout`, `/toi` shell, `/toi/tai-khoan`.
Out: English texts and the language switch (EX-3; write the Vietnamese texts so they are easy to move into a dictionary), the viewing list and detail (EX-7), the entry screen (EX-4). `/quen-mat-khau` does not change: guests use the existing email link.

## Tasks

- [x] **FE-EX-01** Roles and guard (AUTH-06, AUTH-12): `Role` gets `GUEST`; `homeOf` returns `/toi`, `/thue`, `/ql`; routes `/dang-ky`, `/xac-minh-email`, `/toi`, `/toi/tai-khoan` (allowed: GUEST, TENANT). New tests go in `tests/ex/*.test.mjs`; add that glob to `test:components` in `package.json`.
  Done when: `tests/auth-guards.test.mjs` covers the 4 roles, `?next=` still wins, a GUEST opening `/thue` or `/ql` lands on `/toi`.
- [x] **FE-EX-02** `features/auth/api.ts` + `schemas.ts`: register, verify email, resend code. Phone `^0[0-9]{9}$` (G-04), email required and well-formed, password ≥ 8 (AUTH-03), code 6 digits.
  Done when: schema tests with the spec values; API tests against the EX-1 contract.
- [x] **FE-EX-03** `/dang-ky`: full name, phone, email, password, in the auth frame of `/dang-nhap`; link "Đã có tài khoản? Đăng nhập"; `PHONE_TAKEN` and `EMAIL_TAKEN` show the API message on their field with a link to login; `MAIL_UNAVAILABLE` shows the API message; on success → `/xac-minh-email` keeping `?next=`.
  Done when: page test; field errors from `error.fields` appear on the fields (UI-05).
- [x] **FE-EX-04** ⏸ `/xac-minh-email`: shows the address the code was sent to, 6-digit code, "Gửi lại mã" disabled with a 60 s countdown, `OTP_INVALID` and 429 messages; success logs in and goes to `?next=` or the role home.
  Done when: page test with fake timers for the countdown; manual check against the dev server (code read from the BE log). Stop and report FE-EX-01..04.
- [ ] **FE-EX-05** `/dang-nhap`: the note becomes "Chưa có tài khoản? Đăng ký" → `/dang-ky` (AUTH-10); a login answered with `EMAIL_NOT_VERIFIED` opens `/xac-minh-email` for that phone.
  Done when: `tests/p2/ui-30-login.test.mjs` updated to the new text and still green; `ui-31-forgot-password.test.mjs` untouched and green.
- [ ] **FE-EX-06** `GuestLayout` (bottom nav "Lịch hẹn", "Tài khoản", link "Tìm phòng"), `/toi` with an empty state and the button "Tìm phòng" (the list comes in EX-7), `/toi/tai-khoan`: name and phone (read only), email, change password (AUTH-09). `TenantLayout` gets the link "Lịch hẹn xem phòng" → `/toi`. "Trang của tôi" in `PublicLayout` goes to the role home.
  Done when: layout tests at 360 px (no horizontal overflow, UI-07); a TENANT can open `/toi`.
- [ ] **FE-EX-07** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted; manual walk: sign up → code from the BE log → `/toi` → log out → log in → forgot password by email link.

## Questions for the owner

Đã trả lời 13/11/2026:

- Q-EX2-1: khách đăng nhập EMAIL_NOT_VERIFIED chưa có mã nào được gửi; chủ dự án mô tả luồng đăng ký (BE gửi mã OTP qua email, khách nhập mã) nhưng không chọn cho trường hợp đăng nhập. Làm theo đề xuất: trang mở ra với nút "Gửi mã xác minh", gửi xong mới đếm ngược 60 giây `[ASSUMPTION]`.
- Q-EX2-2: giữ số điện thoại, email và giờ gửi trong `sessionStorage` (chủ dự án chọn theo đề xuất).

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
