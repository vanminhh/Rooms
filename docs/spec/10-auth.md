# 10 · Auth, roles, scope

Module: `auth` + `src/common/guards`. Tables: `users`, `sessions`, `password_reset_tokens`, `phone_otps` (planned, [02-database.md](02-database.md#planned-changes)).

> Changed 12/11/2026 (owner, D-25, D-26, D-27): AUTH-06, AUTH-07, AUTH-10 and SCOPE-03 are amended, AUTH-11..15 and SCOPE-05 are new. Phase 1 built the old rules; the code follows the new ones after Phase Extra parts EX-1 and EX-2.

## Rules

- **AUTH-01** Login with `phone` + `password`. No role selector. Wrong phone or password returns the same error (`INVALID_CREDENTIALS`, 401, "Số điện thoại hoặc mật khẩu không đúng").
- **AUTH-02** Inactive users cannot log in (`ACCOUNT_LOCKED`, 403, "Tài khoản đã bị khóa. Liên hệ quản lý.").
- **AUTH-03** Passwords hashed with argon2id. Minimum 8 characters.
- **AUTH-04** Login rate limit: 5 failures per phone per 15 minutes → 429. Also [ASSUMPTION A-08] 20 failures per IP per 15 minutes → 429, checked before the password check and counted in memory like the phone limit (DEP-02, DEP-04); a successful login does not reset the IP count. Reason: every attempt costs one argon2 check, even for an unknown phone (AUTH-01), so a flood spread over many phones would bypass the phone limit and exhaust the server. The IP limit is higher than the phone limit because the tenants of one building often share one Wi-Fi IP.
- **AUTH-05** If `must_change_password`, every API except `POST /auth/change-password`, `POST /auth/logout`, `GET /auth/me` returns `PASSWORD_CHANGE_REQUIRED`. FE redirects to `/doi-mat-khau`.
- **AUTH-06** After login FE routes by role: `GUEST` → `/toi`, `TENANT` → `/thue`, `MANAGER`/`BOSS` → `/ql`; a valid `?next=` wins over the role's home. Opening `/dang-nhap` while logged in redirects the same way.
- **AUTH-07** Forgot password: a user with a verified phone (AUTH-12) gets an SMS code and sets a new password with it (AUTH-13, purpose `RESET_PASSWORD`). Otherwise, as before: if the user has an email, send a single-use link valid 30 minutes; otherwise the response is identical (no account enumeration) and the page shows the building manager's contact. Staff can reset a tenant's password (temporary password, `must_change_password = true`, sessions revoked).
- **AUTH-08** Boss creates manager accounts (temporary password). Boss is created only by seed; on production the seeded Boss is edited, not re-created (DEP-08). Details (owner 01/11/2026):
  - Create `{ phone, fullName, email? }` → the BE generates a temporary password, returns it **once** in the response, and sets `must_change_password = true`. Duplicate phone → `PHONE_TAKEN`.
  - Deactivate (`is_active = false`) revokes all sessions (AUTH-T3) and **keeps** `buildings.manager_id`. While inactive, the building's public contact and tasks fall back to Boss (BLD-04, SCOPE-04). Reactivating gives the buildings back. An inactive manager's buildings still count toward the 2-building limit (BLD-03).
  - The endpoints live in the `auth` module (`managers.controller.ts`). Assigning buildings is done on the building (`PATCH /buildings/:id`), not here.
  - Audit `manager.create`, `manager.deactivate` (AUD-01).
- **AUTH-09** `PATCH /auth/me`: everyone may change `email`; staff may also change `contact_phone`, `zalo_url`, `facebook_url` (shown publicly).
- **AUTH-10** The login page shows "Chưa có tài khoản? Đăng ký" linking to `/dang-ky`, Boss's contact from `GET /public/contact` (= `settings.default_contact`: phone, Zalo, Facebook) and a link "Xem phòng trống" to `/phong` (D-25; before 12/11/2026 it said "Tài khoản được cấp khi ký hợp đồng").
- **AUTH-11** Sign-up (D-25): `POST /auth/register { fullName, phone, password }` creates a `GUEST` with `phone_verified_at = null`, `must_change_password = false`, and sends an SMS code. Phone format G-04, password AUTH-03. If the phone belongs to an account that is verified, or was created by staff (AUTH-08, CON-07) → `PHONE_TAKEN` with "Số điện thoại đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu". If it belongs to a self-registered account that was never verified, that account's name and password are replaced and a new code is sent, so nobody can block a number they do not own.
- **AUTH-12** A self-registered account cannot log in until its phone is verified: `PHONE_NOT_VERIFIED`, and the FE opens `/xac-minh-so`. `POST /auth/verify-phone { phone, code }` sets `phone_verified_at` and logs the user in. Accounts created by staff log in as before; they verify their phone later from the account page (needed to book or to claim viewings, VIEW-01, VIEW-21).
- **AUTH-13** SMS code [ASSUMPTION A-11]: 6 digits, valid 5 minutes, single use, stored only as a hash, 5 wrong tries per code, resend after 60 s, at most 5 SMS per phone per day and 10 per IP per hour → 429. Wrong, expired or used code → `OTP_INVALID`. Sent through one `SmsProvider` adapter (Q-07); in development the code is written to the server log instead. No provider or a provider failure → `SMS_UNAVAILABLE`; the request never reports success when no SMS left. Responses do not reveal whether a phone has an account, except `PHONE_TAKEN` at sign-up.
- **AUTH-14** Verifying a phone proves ownership of that number only. It never merges two accounts and never links viewings or contracts by itself (VIEW-21, CON-07).
- **AUTH-15** `users.locale` (`vi` / `en`): set at sign-up from the language in use, changed with `PATCH /auth/me` (LOC-03, LOC-06).

## Scope guard

- **SCOPE-01** `@Roles(...)` decorator + guard on every controller. Default deny.
- **SCOPE-02** For MANAGER, the guard loads `allowedBuildingIds = buildings where manager_id = user.id AND is_active`. BOSS: all. Services MUST filter by it; a single helper `scopeWhere(user)` returns the Prisma `where` fragment.
- **SCOPE-03** `/me/*` resolves data through the logged-in user only: contracts, invoices and requests through `contracts.tenant_id = user.id` (TENANT; a GUEST gets `FORBIDDEN`), viewings through `viewings.user_id = user.id`, notifications through `notifications.user_id` (GUEST and TENANT). Accessing another user's id returns 404 (not 403) to avoid leaking existence.
- **SCOPE-04** A building whose manager is null or inactive is in Boss's task lists ("Việc hôm nay").
- **SCOPE-05** Rights come only from the account's role and data. Choosing "Tôi đang thuê" or "Quản lý tòa nhà" on the entry screen (D-23) grants nothing; a GUEST never reads contracts, invoices or anyone else's data.

## API

| Method | Path | Body / result |
|---|---|---|
| POST | `/auth/login` | `{ phone, password, remember }` → `{ accessToken, user }` + refresh cookie |
| POST | `/auth/refresh` | cookie → new access token, rotated cookie |
| POST | `/auth/logout` | revokes current session |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` → clears `must_change_password`, revokes other sessions (AUTH-T3) |
| POST | `/auth/register` | `{ fullName, phone, password }` → sends an SMS code (AUTH-11) |
| POST | `/auth/verify-phone` | `{ phone, code }` → `{ accessToken, user }` + refresh cookie (AUTH-12) |
| POST | `/auth/resend-code` | `{ phone, purpose }` → always 200 within the limits of AUTH-13 |
| POST | `/auth/phone/send-code` · `/auth/phone/verify` | logged in: verify the phone of an account created by staff (AUTH-12) |
| POST | `/auth/forgot-password` | `{ phone }` → always 200; SMS code or email link (AUTH-07) |
| POST | `/auth/reset-password` | `{ token, newPassword }` (email link) or `{ phone, code, newPassword }` (SMS code) |
| GET | `/auth/me` | user + role + `buildings: [{id, code, name}]` (staff) |
| GET | `/public/contact` | public – `{ phone, zaloUrl, facebookUrl }` (AUTH-10) |
| PATCH | `/auth/me` | see AUTH-09 |
| GET/POST/PATCH | `/managers` **Boss** | list (with their buildings), create (temporary password returned once), deactivate / reactivate (AUTH-08) |

## Acceptance

- [ ] Each of the 4 roles logs in and lands on its home route.
- [ ] A visitor signs up, cannot log in before the SMS code, and is logged in right after it (AUTH-11, AUTH-12).
- [ ] Signing up with a verified phone, a manager's phone or a tenant's phone returns `PHONE_TAKEN`; with a never-verified self-registered phone it replaces that account (AUTH-11).
- [ ] The 6th wrong code, an expired code and a used code all return `OTP_INVALID`; the 6th SMS to one phone in a day returns 429 (AUTH-13).
- [ ] A GUEST gets `FORBIDDEN` on `/me/contracts` and 404 on another guest's viewing (SCOPE-03).
- [ ] With `Accept-Language: en`, `/auth/login` with a wrong password answers in English; a staff route answers in Vietnamese (LOC-02).
- [ ] A new tenant is forced to `/doi-mat-khau` and no other API works until changed.
- [ ] Manager A gets `OUT_OF_SCOPE` for any id in manager B's building (rooms, contracts, invoices, requests).
- [ ] Tenant X gets 404 for tenant Y's invoice id.
- [ ] Deactivated manager's refresh token stops working immediately.
- [ ] A new manager's temporary password is in the create response only; the manager is forced to `/doi-mat-khau` on first login.
- [ ] Deactivating a manager keeps `manager_id`; their building shows Boss's contact; reactivating restores theirs.
