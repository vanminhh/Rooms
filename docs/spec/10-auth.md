# 10 · Auth, roles, scope

Module: `auth` + `src/common/guards`. Tables: `users`, `sessions`, `password_reset_tokens`, and the table of email codes ([02-database.md](02-database.md#planned-changes)).


## Rules

- **AUTH-01** Login with `phone` + `password`. No role selector (the entry of D-43 is not one: it only restricts, AUTH-16). Wrong phone or password returns the same error (`INVALID_CREDENTIALS`, 401, "Số điện thoại hoặc mật khẩu không đúng").
  Owner feedback 16/11/2026: auth forms (login, sign-up and password recovery) trim leading/trailing whitespace from the phone before G-04 validation and submission. Embedded whitespace, missing digits and non-digits remain invalid. Password characters are preserved exactly. The API still receives and validates the canonical 10-digit phone.
- **AUTH-02** Inactive users cannot log in (`ACCOUNT_LOCKED`, 403, "Tài khoản đã bị khóa. Liên hệ quản lý.").
- **AUTH-03** Passwords hashed with argon2id. Minimum 8 characters.
- **AUTH-04** Login rate limit: 5 failures per phone per 15 minutes → 429. Also [ASSUMPTION A-08] 20 failures per IP per 15 minutes → 429, checked before the password check and counted in memory like the phone limit (DEP-02, DEP-04); a successful login does not reset the IP count. Reason: every attempt costs one argon2 check, even for an unknown phone (AUTH-01), so a flood spread over many phones would bypass the phone limit and exhaust the server. The IP limit is higher than the phone limit because the tenants of one building often share one Wi-Fi IP.
- **AUTH-05** If `must_change_password`, every API except `POST /auth/change-password`, `POST /auth/logout`, `GET /auth/me` returns `PASSWORD_CHANGE_REQUIRED`. FE redirects to `/doi-mat-khau`.
- **AUTH-06** After login FE routes by role: `GUEST` → `/toi`, `TENANT` → `/thue`, `MANAGER`/`BOSS` → `/ql`; a valid `?next=` wins over the role's home. Opening `/dang-nhap` while logged in redirects the same way.
- **AUTH-07** Forgot password: if the user has an email, send a single-use link valid 30 minutes; otherwise the response is identical (no account enumeration) and the page shows the building manager's contact. Every self-registered guest has a verified email (AUTH-11), so guests always recover this way. An account whose email is not verified yet gets no link. Staff can reset a tenant's password (temporary password, `must_change_password = true`, sessions revoked). Locking a guest account or resetting a guest's password by staff is not part of Phase Extra.
  Staff reset uses `POST /contracts/:id/reset-password` through a contract in the staff member's current scope. It returns a fresh temporary password once after commit, revokes all refresh sessions and invalidates unused reset links; earlier access JWTs remain invalid after the new password is changed (AUTH-T1, AUTH-T3). It preserves `is_active`. [ASSUMPTION A-23] An account still waiting for its initial signature returns `CONFLICT_STATE` until signing issues its first password. A guest-only account has no eligible contract and receives `NOT_FOUND`.
- **AUTH-08** Boss creates manager accounts (temporary password). Boss is created only by seed; on production the seeded Boss is edited, not re-created (DEP-08). Details (owner 01/11/2026):
  - Create `{ phone, fullName, email? }` → the BE generates a temporary password, returns it **once** in the response, and sets `must_change_password = true`. Duplicate phone → `PHONE_TAKEN`.
  - Deactivate (`is_active = false`) revokes all sessions (AUTH-T3) and **keeps** `buildings.manager_id`. While inactive, the building's public contact and tasks fall back to Boss (BLD-04, SCOPE-04). Reactivating gives the buildings back. An inactive manager's buildings still count toward the 2-building limit (BLD-03).
  - The endpoints live in the `auth` module (`managers.controller.ts`). Assigning buildings is done on the building (`PATCH /buildings/:id`), not here.
  - Audit `manager.create`, `manager.deactivate` (AUD-01).
- **AUTH-09** `PATCH /auth/me`: staff and tenants may change `email`; staff may also change `contact_phone`, `zalo_url`, `facebook_url` (shown publicly). A `GUEST` cannot change or clear `email` here (`FORBIDDEN`): it is the address the sign-up code verified (AUTH-12), used for password recovery and for the viewing confirmation email (owner 13/11/2026). [ASSUMPTION] Changing a guest's email with a new code is not built; the field is read only for guests.
- **AUTH-10** The login page shows "Chưa có tài khoản? Đăng ký" linking to `/dang-ky`, Boss's contact from `GET /public/contact` (= `settings.default_contact`: phone, Zalo, Facebook) and a link "Xem phòng trống" to `/phong` (D-25; before 12/11/2026 it said "Tài khoản được cấp khi ký hợp đồng").
- **AUTH-11** Sign-up (D-25): `POST /auth/register { fullName, phone, email, password }` creates a `GUEST` with `email_verified_at = null`, `must_change_password = false`, and emails a code to that address. Phone format G-04, password AUTH-03, email required. If the phone or the email belongs to an account that is verified, or was created by staff (AUTH-08, CON-07) → `PHONE_TAKEN` "Số điện thoại đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu", or `EMAIL_TAKEN` "Email đã được dùng cho tài khoản khác". If it belongs to a self-registered account that was never verified (which cannot log in, AUTH-12), that account's name, phone, email and password are replaced and a new code is sent, so nobody can block a number or an address they do not own.
- **AUTH-12** A self-registered account cannot log in until its email is verified: `EMAIL_NOT_VERIFIED`, and the FE opens `/xac-minh-email`. `POST /auth/verify-email { phone, code }` sets `email_verified_at` and logs the user in. Accounts created by staff (managers, tenants created at contract signing) need no email verification and log in as before; a tenant who wants to book a viewing uses the account they already have, must have an email, and does not need to verify it (VIEW-01; owner option B, 15/11/2026). A tenant without email first adds one via PATCH /auth/me. This does not relax the verification requirement for GUEST.
- **AUTH-13** Email code [ASSUMPTION A-11]: 6 digits, valid 5 minutes, single use, stored only as a hash, 5 wrong tries per code, resend after 60 s, at most 5 codes per email address per day and 10 per IP per hour → 429. Wrong, expired or used code → `OTP_INVALID`. Sent through `MailerService`; complete Resend configuration sends real email even in development (owner 15/11/2026, Q-14). Without complete configuration, development/test log the code; production fails with `MAIL_UNAVAILABLE`. A configured provider failure at sign-up also returns `MAIL_UNAVAILABLE`; a real send is never reported successful when the provider did not acknowledge it. Responses do not reveal whether a phone or an email has an account, except `PHONE_TAKEN` and `EMAIL_TAKEN` at sign-up.
- **AUTH-14** Verifying an email proves ownership of that address only. The phone number is not verified by the system: the manager confirms it by calling the guest (VIEW-15). Verifying never merges two accounts and never links viewings or contracts by itself (CON-07).
- **AUTH-16** Login by entry (owner 20/11/2026, D-43). `POST /auth/login` takes an optional `portal`: `TENANT` (entry "Tôi đang thuê") or `STAFF` (entry "Quản lý tòa nhà"); any other value → `VALIDATION_FAILED`. Without `portal` the login works for every role as before.
  - `TENANT` accepts only role `TENANT`; `STAFF` accepts only `MANAGER` and `BOSS`. A GUEST is refused at both entries (a guest uses "Tìm phòng").
  - The check runs **after** the password and lock checks: wrong phone or password still answers `INVALID_CREDENTIALS` (AUTH-01) and a locked account `ACCOUNT_LOCKED` (AUTH-02), so the entry never tells whether a phone has an account. A self-registered GUEST with an unverified email at a `portal` entry gets `WRONG_PORTAL`, not `EMAIL_NOT_VERIFIED`.
  - Refused: `WRONG_PORTAL` (403) "Tài khoản này không đăng nhập được ở lối vào này. Hãy chọn đúng lối vào hoặc dùng trang đăng nhập chung." No session, no refresh cookie, `last_login_at` unchanged. It does not count as a failed attempt of AUTH-04 (the password was right).
  - The entry is checked only at login. Refresh, `/auth/me` and every other route keep using the role alone (SCOPE-01, SCOPE-05); a session opened at `/dang-nhap` without an entry stays valid everywhere its role allows.
  - FE (UI-11): `/dang-nhap?loi-vao=thue` and `/dang-nhap?loi-vao=quan-ly` send `portal` and show the title "Đăng nhập người thuê" / "Đăng nhập quản lý"; the link "Chưa có tài khoản? Đăng ký" is hidden there (staff create these accounts, AUTH-08, CON-07), and a link "Dùng trang đăng nhập chung" opens `/dang-nhap` keeping `?next=`. The route guard adds the entry when it sends a logged-out visitor of `/thue/*` (`loi-vao=thue`) or `/ql/*` (`loi-vao=quan-ly`) to the login page. An unknown `loi-vao` value is ignored (plain login).
- **AUTH-15** `users.locale` (`vi` / `en`): set at sign-up from the language in use, changed with `PATCH /auth/me` (LOC-03, LOC-06).

## Scope guard

- **SCOPE-01** `@Roles(...)` decorator + guard on every controller. Default deny.
- **SCOPE-02** For MANAGER, the guard loads `allowedBuildingIds = buildings where manager_id = user.id AND is_active`. BOSS: all. Services MUST filter by it; a single helper `scopeWhere(user)` returns the Prisma `where` fragment.
- **SCOPE-03** `/me/*` resolves data through the logged-in user only: contracts, invoices and requests through `contracts.tenant_id = user.id` (TENANT; a GUEST gets `FORBIDDEN`), viewings through `viewings.user_id = user.id`, notifications through `notifications.user_id` (GUEST and TENANT). Accessing another user's id returns 404 (not 403) to avoid leaking existence.
- **SCOPE-04** A building whose manager is null or inactive is in Boss's task lists ("Việc hôm nay").
- **SCOPE-05** Rights come only from the account's role and data. Choosing "Tôi đang thuê" or "Quản lý tòa nhà" on the entry screen (D-23) grants nothing; it can only refuse a login of the wrong kind of account (AUTH-16, D-43); a GUEST never reads contracts, invoices or anyone else's data.

## API

| Method | Path | Body / result |
|---|---|---|
| POST | `/auth/login` | `{ phone, password, remember, portal? }` → `{ accessToken, user }` + refresh cookie; `portal` = `TENANT` / `STAFF` (AUTH-16) |
| POST | `/auth/refresh` | cookie → new access token, rotated cookie |
| POST | `/auth/logout` | revokes current session |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` → clears `must_change_password`, revokes other sessions (AUTH-T3) |
| POST | `/auth/register` | `{ fullName, phone, email, password }` → emails a code (AUTH-11) |
| POST | `/auth/verify-email` | `{ phone, code }` → `{ accessToken, user }` + refresh cookie (AUTH-12) |
| POST | `/auth/resend-code` | `{ phone }` → always 200 within the limits of AUTH-13 |
| POST | `/auth/forgot-password` | `{ phone }` → always 200 |
| POST | `/auth/reset-password` | `{ token, newPassword }` |
| GET | `/auth/me` | user + role + `buildings: [{id, code, name}]` (staff) |
| GET | `/public/contact` | public – `{ phone, zaloUrl, facebookUrl }` (AUTH-10) |
| PATCH | `/auth/me` | see AUTH-09 |
| GET/POST/PATCH | `/managers` **Boss** | list (with their buildings), create (temporary password returned once), deactivate / reactivate (AUTH-08) |

## Acceptance

- [ ] Each of the 4 roles logs in and lands on its home route.
- [ ] Through "Tôi đang thuê" a tenant logs in; a manager, the Boss and a guest with the right password get `WRONG_PORTAL` and no session. Through "Quản lý tòa nhà" a manager and the Boss log in; a tenant and a guest get `WRONG_PORTAL`. A wrong password at either entry still gets `INVALID_CREDENTIALS`. `/dang-nhap` without an entry logs in every role (AUTH-16, D-43).
- [ ] A visitor signs up, cannot log in before the email code (`EMAIL_NOT_VERIFIED`), and is logged in right after it (AUTH-11, AUTH-12).
- [ ] Signing up with a verified account's phone, a manager's phone or a tenant's phone returns `PHONE_TAKEN`; with another verified account's email `EMAIL_TAKEN`; with a never-verified self-registered phone or email it replaces that account (AUTH-11).
- [ ] The 6th wrong code, an expired code and a used code all return `OTP_INVALID`; the 6th code to one address in a day returns 429; a failing mailer at sign-up returns `MAIL_UNAVAILABLE` (AUTH-13).
- [ ] A GUEST gets `FORBIDDEN` on `/me/contracts` and 404 on another guest's viewing (SCOPE-03).
- [ ] A GUEST sending `email` (a new address or null) to `PATCH /auth/me` gets `FORBIDDEN` and keeps the verified address; a tenant still changes theirs (AUTH-09).
- [ ] With `Accept-Language: en`, `/auth/login` with a wrong password answers in English; a staff route answers in Vietnamese (LOC-02).
- [ ] A new tenant is forced to `/doi-mat-khau` and no other API works until changed.
- [ ] Manager A gets `OUT_OF_SCOPE` for any id in manager B's building (rooms, contracts, invoices, requests).
- [ ] Tenant X gets 404 for tenant Y's invoice id.
- [ ] Deactivated manager's refresh token stops working immediately.
- [ ] A new manager's temporary password is in the create response only; the manager is forced to `/doi-mat-khau` on first login.
- [ ] Deactivating a manager keeps `manager_id`; their building shows Boss's contact; reactivating restores theirs.
