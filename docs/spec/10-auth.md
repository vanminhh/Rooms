# 10 · Auth, roles, scope

Module: `auth` + `src/common/guards`. Tables: `users`, `sessions`, `password_reset_tokens`.

## Rules

- **AUTH-01** Login with `phone` + `password`. No role selector. Wrong phone or password returns the same error (`INVALID_CREDENTIALS`, 401, "Số điện thoại hoặc mật khẩu không đúng").
- **AUTH-02** Inactive users cannot log in (`ACCOUNT_LOCKED`, 403, "Tài khoản đã bị khóa. Liên hệ quản lý.").
- **AUTH-03** Passwords hashed with argon2id. Minimum 8 characters.
- **AUTH-04** Login rate limit: 5 failures per phone per 15 minutes → 429.
- **AUTH-05** If `must_change_password`, every API except `POST /auth/change-password`, `POST /auth/logout`, `GET /auth/me` returns `PASSWORD_CHANGE_REQUIRED`. FE redirects to `/doi-mat-khau`.
- **AUTH-06** After login FE routes by role: `TENANT` → `/thue`, `MANAGER`/`BOSS` → `/ql`. Opening `/dang-nhap` while logged in redirects the same way.
- **AUTH-07** Forgot password: if the user has an email, send a single-use link valid 30 minutes; otherwise the response is identical (no account enumeration) and the page shows the building manager's contact. Staff can reset a tenant's password (temporary password, `must_change_password = true`, sessions revoked).
- **AUTH-08** Boss creates manager accounts (temporary password). Boss is created only by seed.
- **AUTH-09** `PATCH /auth/me`: everyone may change `email`; staff may also change `contact_phone`, `zalo_url`, `facebook_url` (shown publicly).
- **AUTH-10** The login page shows "Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng" with Boss's contact from `GET /public/contact` (= `settings.default_contact`: phone, Zalo, Facebook) and a link "Xem phòng trống" to `/phong` (D-02, confirmed by owner).

## Scope guard

- **SCOPE-01** `@Roles(...)` decorator + guard on every controller. Default deny.
- **SCOPE-02** For MANAGER, the guard loads `allowedBuildingIds = buildings where manager_id = user.id AND is_active`. BOSS: all. Services MUST filter by it; a single helper `scopeWhere(user)` returns the Prisma `where` fragment.
- **SCOPE-03** For TENANT, `/me/*` resolves data through `contracts.tenant_id = user.id`. Accessing another tenant's id returns 404 (not 403) to avoid leaking existence.
- **SCOPE-04** A building whose manager is null or inactive is in Boss's task lists ("Việc hôm nay").

## API

| Method | Path | Body / result |
|---|---|---|
| POST | `/auth/login` | `{ phone, password, remember }` → `{ accessToken, user }` + refresh cookie |
| POST | `/auth/refresh` | cookie → new access token, rotated cookie |
| POST | `/auth/logout` | revokes current session |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` → clears `must_change_password`, revokes other sessions |
| POST | `/auth/forgot-password` | `{ phone }` → always 200 |
| POST | `/auth/reset-password` | `{ token, newPassword }` |
| GET | `/auth/me` | user + role + `buildings: [{id, code, name}]` (staff) |
| GET | `/public/contact` | public – `{ phone, zaloUrl, facebookUrl }` (AUTH-10) |
| PATCH | `/auth/me` | see AUTH-09 |
| GET/POST/PATCH | `/managers` **Boss** | list, create, deactivate (`is_active=false` → their buildings fall back to Boss, sessions revoked) |

## Acceptance

- [ ] Each of the 3 roles logs in and lands on its home route.
- [ ] A new tenant is forced to `/doi-mat-khau` and no other API works until changed.
- [ ] Manager A gets `OUT_OF_SCOPE` for any id in manager B's building (rooms, contracts, invoices, requests).
- [ ] Tenant X gets 404 for tenant Y's invoice id.
- [ ] Deactivated manager's refresh token stops working immediately.
