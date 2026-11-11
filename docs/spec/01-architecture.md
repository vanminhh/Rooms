# 01 · Architecture

## Stack

| Layer | Tech | Location |
|---|---|---|
| FE | React 19, Vite, TypeScript, React Router, TanStack Query, react-hook-form + zod, Recharts | `Source/frontend/` |
| BE | NestJS 12, TypeScript, Prisma 6, Vitest, oxlint | `Source/backend/` |
| DB | PostgreSQL (Neon or Supabase), pooled `DATABASE_URL` + direct `DIRECT_URL` | schema in `Source/backend/prisma/` |
| Files | Cloudinary (room photos, meter photos, contract PDF/scan; CCCD photos as private/authenticated assets) | – |
| Bank | SePay or Casso webhook ([OPEN] Q-03) | `bank` module |
| Email | transactional email provider (any SMTP/API) | `mailer` module |

## Responsibilities

| | FE | BE | DB |
|---|---|---|---|
| MUST | Render 3 apps; validate forms early for UX; hide actions by role; format money/dates; upload files directly to Cloudinary with a BE-issued signature | Authenticate; authorize role + building scope on every request; validate every input; do all money math; run multi-step flows in one transaction; cron; webhook; email; encrypt CCCD; audit log; map DB errors to error codes | Keys, FKs, unique/partial unique, CHECK, triggers as the last safety net ([02-database.md](02-database.md)) |
| MUST NOT | Compute invoice amounts; decide permissions; hold secrets | Trust FE input; write money changes outside a transaction | Hold business logic that changes often; send email |

## Repository layout

```
Rooms/                       one git repo
├─ CLAUDE.md                 agent context (root)
├─ .claude/                  settings.json, agents/ (planner, reviewer), hooks/agent-guard.mjs
├─ Artifacts/                old shared staging area, history only (approved/, reviews/)
├─ assets/                   raw source assets: logos, fonts, mockup PDFs, design images (not served)
├─ docs/
│  └─ spec/                  this specification
└─ Source/
   ├─ frontend/              CLAUDE.md, artifact_FE/ (old staging, history), src/{app,layouts,pages,features,components,shared,assets}
   └─ backend/               CLAUDE.md, artifact_BE/ (old staging, history), prisma/ (schema, constraints, DB check, migrations, seed), src/{common,modules,jobs}
```

Each feature has a task file `feature_<name>.md` in `Source/backend/src/modules/<module>/` and `Source/frontend/src/features/<module>/` (workflow in root `CLAUDE.md`).

Backend module list (one Nest module per folder in `src/modules/`): `auth`, `buildings`, `rooms`, `pricing`, `viewings`, `contracts`, `meters`, `billing`, `bank`, `requests`, `notifications`, `reports`, `settings`, `files`, `mailer`, `sms` (Phase Extra, one provider adapter, Q-07), `audit`. Cross-cutting code in `src/common/` (guards, error filter, crypto, date utils). Cron in `src/jobs/`.

## API conventions

- **API-01** REST + JSON under `/api/v1`. Paths are English plural nouns (`/contracts/:id/occupants`).
- **API-02** Success body `{ "data": ..., "meta"?: {...} }`. Lists: `meta = { page, limit, total }`, query `?page=1&limit=20&sort=-createdAt`.
- **API-03** Error body `{ "error": { "code": "ROOM_NOT_AVAILABLE", "message": "<user-readable, Vietnamese or English per LOC-02>", "fields"?: { "<field>": "<message>" } } }`.
- **API-04** HTTP status: 400 invalid input · 401 not logged in · 403 role/scope · 404 · 409 wrong state or conflict · 429 rate limit · 500 unexpected.
- **API-05** Money-changing POSTs accept header `Idempotency-Key`; the same key within 24 h returns the first result.
- **API-06** Dates in JSON are `YYYY-MM-DD` (business dates) or ISO 8601 with offset (timestamps). Money is integer.
- **API-07** Route groups: `/public/*` no auth · `/auth/*` · `/me/*` GUEST and TENANT, own data only (viewings, notifications, account: both; contracts, invoices, requests: TENANT only, a GUEST gets 403 `FORBIDDEN`), never cached · everything else MANAGER or BOSS with building scope · routes marked **Boss** in module specs are BOSS only · `/webhooks/bank` provider signature only.
- **API-08** Every list endpoint for staff accepts `?buildingId=`; managers get 403 `OUT_OF_SCOPE` for a building they don't manage; without it they get all their buildings.

## Languages

Owner 12/11/2026 (D-27). Built in Phase Extra part EX-3.

- **LOC-01** Two languages: `vi` (default) and `en`. English covers the public pages, the auth pages, the guest area `/toi` and the tenant area `/thue`. The staff app `/ql`, contract documents and the contract PDF are Vietnamese only.
- **LOC-02** The FE sends `Accept-Language: vi` or `en` with every request. The BE answers in English only on `/public/*`, `/auth/*` and `/me/*`: error `message` and `fields` texts. Error `code`s never change. Any other value → Vietnamese.
- **LOC-03** The choice is kept in the browser and, when logged in, in `users.locale` (AUTH-15). The language switch sits in the header of the public, guest and tenant layouts. Routes are the same in both languages (no `/en` prefix).
- **LOC-04** Fixed lists are translated (statuses, amenities, room types, notification texts). Text typed by people is shown as typed [ASSUMPTION A-12]. A missing English text falls back to the Vietnamese one; a raw key is never shown.
- **LOC-05** Language changes nothing else: money stays integer đồng shown as `2.984.000 đ` (G-01, no currency choice), times stay `Asia/Ho_Chi_Minh` (G-02), dates `dd/mm/yyyy`, phones Vietnamese format (G-04).
- **LOC-06** In-app notifications and emails use the recipient's `users.locale`.

## Error codes

BE maps DB constraint/trigger errors to these codes. Module specs add their own.

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Input fails schema validation |
| `UNAUTHENTICATED` | 401 | No/expired access token |
| `PASSWORD_CHANGE_REQUIRED` | 403 | `must_change_password` and route is not change-password/logout/me |
| `FORBIDDEN` | 403 | Role not allowed |
| `OUT_OF_SCOPE` | 403 | Manager touches another building's data (a tenant touching another tenant's data gets `NOT_FOUND`, SCOPE-03; owner 29/10/2026) |
| `NOT_FOUND` | 404 | |
| `CONFLICT_STATE` | 409 | Action not allowed in current status (generic) |
| `TOO_MANY_REQUESTS` | 429 | Rate limit |
| `PHONE_TAKEN` | 409 | `users_phone_key` |
| `PHONE_NOT_VERIFIED` | 403 | login or booking with a phone that has not passed the SMS code (AUTH-12, VIEW-01) |
| `OTP_INVALID` | 400 | SMS code wrong, expired, used, or out of tries (AUTH-13) |
| `SMS_UNAVAILABLE` | 503 | no SMS provider configured or the provider failed (AUTH-13); the app still starts without one |
| `VIEWING_TIME_TAKEN` | 409 | the person responsible already has a confirmed viewing in that time (VIEW-16) |
| `PROPOSAL_EXPIRED` | 409 | answering a time proposal that has expired (VIEW-17) |
| `MANAGER_MAX_2_BUILDINGS` | 409 | trigger |
| `ROOM_NOT_AVAILABLE` | 409 | `contracts_one_open_per_room` or room not listable |
| `CONTRACT_TERM_TOO_SHORT` | 400 | `contracts_term_min_3` |
| `DEPOSIT_NOT_PAID` | 409 | move-in before deposit invoice is PAID |
| `INVOICE_NOT_UNPAID` | 409 | trigger on payment |
| `PAYMENT_AMOUNT_MISMATCH` | 409 | trigger on payment |
| `METER_VALUE_DECREASED` | 400 | reading < previous without meter replacement |
| `PRICE_NOT_APPROVED` | 409 | room has `price = null` |
| `PRICE_PROPOSAL_EXPIRED` | 409 | approving a room price or rate plan whose `effective_from` is before today; message "Đề xuất đã quá ngày hiệu lực, vui lòng đề xuất lại" (PRC-07, owner 01/11/2026) |
| `UPLOAD_NOT_CONFIGURED` | 503 | `CLOUDINARY_URL` is not set; message "Chưa cấu hình tải ảnh" (FILE-01). The app still starts without it |
| `RATE_PLAN_MISSING` | 409 | no approved rate for a needed kind/service at period start |
| `PENDING_REQUEST_EXISTS` | 409 | `requests_one_pending_moveout_renew` |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | webhook signature check failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error; generic Vietnamese message, no internal details (owner, 29/10/2026) |

## Auth tokens

- **AUTH-T1** Access token: JWT, 15 minutes, in `Authorization: Bearer`. Claims: `sub` (user id), `role`.
- **AUTH-T2** Refresh token: random 32 bytes, stored only as SHA-256 hash in `sessions.token_hash`, sent as httpOnly + Secure + SameSite=Lax cookie on path `/api/v1/auth`. Lifetime 30 days if "Ghi nhớ đăng nhập", else session cookie (browser close) with 12 h server expiry [ASSUMPTION A-07]. Rotated on every refresh.
- **AUTH-T3** Deactivating a user or resetting a password (email link or staff reset) revokes all their sessions. Changing one's own password revokes all their **other** sessions; the current one stays logged in (owner 29/10/2026).

## Files

- **FILE-01** `POST /files/sign` (staff) returns a signed Cloudinary upload for one purpose. Phase 2 has one purpose, `ROOM_IMAGE` with `roomId`: the room MUST be in the caller's scope (SCOPE-02); the signature fixes `folder = rooms/<buildingId>/<roomId>`, `allowed_formats = jpg,png,webp` and an incoming transformation that limits the long side to 1920 px. Without `CLOUDINARY_URL` → `UPLOAD_NOT_CONFIGURED`.
- **FILE-02** For room images, the client sends `assetId`, `publicId`, `version`, and `format` from the Cloudinary upload response, never a delivery URL. Before attaching an image, the BE retrieves Cloudinary metadata by immutable `assetId` and verifies that `asset_id`, `public_id`, `version`, `format`, `resource_type = image`, and `type = upload` match the request and the room folder. It stores `asset_id` uniquely with the image and builds the delivery URL itself. Missing or mismatched assets return 400 `VALIDATION_FAILED`; unavailable Cloudinary configuration returns 503 `UPLOAD_NOT_CONFIGURED`. The BE deletes the row, then requests Cloudinary destroy by the stored `asset_id` (not by `public_id`); a Cloudinary deletion failure is logged and does not block the request. Owner decision Q-P24-9, 03/11/2026.

## Cron (Asia/Ho_Chi_Minh)

| Time | Job | Spec |
|---|---|---|
| 00:05 daily **and at app start** | Create `DRAFT` monthly invoices for billing dates in the last 7 days that have none; switch signed renewals whose start date has come (catch-up of missed runs, D-21) | [16-billing.md](16-billing.md#cron) |
| 01:00 daily **and at app start** | Sync `rooms.price` with the current approved room price (PRC-06; the start-up run fixes days missed while the server was off); auto-close incidents `RESOLVED` > 3 days | [12-pricing.md](12-pricing.md), [18-requests.md](18-requests.md) |
| 08:00 daily | Invoice reminders; contract expiry notices (30 and 7 days); stale drafts > 2 days; expired unresolved contracts | [19-notifications.md](19-notifications.md) |
| every 10 minutes **and at app start** | Viewing reminders 24 h and 2 h before a confirmed viewing (NOTI-09, Phase Extra) | [19-notifications.md](19-notifications.md) |

Every job MUST be idempotent (safe to run twice the same day) and log a summary line.

## Deployment

Scale: one chain of mini apartment buildings, hundreds of rooms. One server is enough; these rules keep it from going down or misbehaving behind a proxy (owner 04/11/2026).

- **DEP-01** FE and API are served from **one origin**: e.g. `https://<domain>/` serves the SPA and `https://<domain>/api/*` is forwarded to the BE, the same way the Vite proxy works in dev. Reason: the BE has no CORS and the refresh cookie is `SameSite=Lax` on path `/api/v1/auth` (AUTH-T2); on a second domain requests are blocked and users are logged out after 15 minutes.
- **DEP-02** The BE runs as **exactly one always-on instance** with at least 1 GB RAM; no free tier that sleeps (a sleeping server misses cron and webhooks). Reasons: the login and viewing IP limits are kept in memory (AUTH-04, VIEW-11) and cron runs inside the app; one argon2 check uses about 64 MB and up to 4 run at once (AUTH-03). Before a second instance: move those limits to a shared store and run cron on one instance only.
- **DEP-03** BE and DB run in the same region, Singapore (nearest to Hà Nội). The app uses the pooled `DATABASE_URL`; `DIRECT_URL` is for migrations only.
- **DEP-04** Behind a proxy or CDN, Express `trust proxy` is set to the **exact number of proxies** in front of the BE (env `TRUST_PROXY_HOPS`, default 0), so `req.ip` is the visitor's IP for the per-IP limits (AUTH-04, VIEW-02) and audit logs. Never `true`: anyone could then fake `X-Forwarded-For`. Without it every visitor shares the proxy's IP, and the whole site gets only 5 viewing bookings per hour.
- **DEP-05** `NODE_ENV` is required (`development`, `test` or `production`; added to `REQUIRED_ENV` and `.env.example`). Production runs with `production`, which makes the refresh cookie `Secure` (AUTH-T2); the app refuses to start without it instead of silently running with a non-secure cookie.
- **DEP-06** A CDN (e.g. Cloudflare) in front of the origin caches public GET responses for 60 s (PUB-05) and blocks obvious bots. Its cache rule covers only `GET /api/v1/public/*`; CDNs do not cache JSON by default.

### Go-live checklist (owner 08/11/2026)

The dev seed (`prisma/seed.ts`) creates 5 accounts with fixed, public passwords (`0900000001` Boss, `0900000002`–`0900000003` managers, `0900000004`–`0900000005` tenants) and sample data (3 buildings, rooms, contract HD000001). The seed has no production guard by decision: it is dev only, and the steps below make the production database safe instead.

- **DEP-07** Never run `prisma db seed` on the production database: it resets the password of the 5 accounts above to the public ones, even after they were changed.
- **DEP-08** Before the domain points at the production site, in this order:
  1. Change the Boss account: real phone, a new password (hashed with argon2id, never written as plain text), `must_change_password` off. There is exactly one Boss ([00-overview.md](00-overview.md) roles, [02-database.md](02-database.md)), so the existing row is edited, not replaced.
  2. Change the Boss's public contact (`contact_phone`, `zalo_url`, `facebook_url`, AUTH-09) and `settings.default_contact`: the seed uses `0900000001`, and these are shown to guests.
  3. Deactivate (`is_active = false`) the two dev managers and the two dev tenants. Do not delete them while they have history (G-05); delete rows only on a database that has no real data yet and only if foreign keys allow it.
  4. Remove the sample buildings, rooms and contract, or lock the buildings so they do not appear in public lists (BLD-06, ROOM-05).
  5. Set `NODE_ENV=production` (DEP-05) and check that no dev password logs in.
- **DEP-09** The same steps apply when the production database is created from a copy of the dev database.

## Roadmap

| Phase | Scope | Done when |
|---|---|---|
| 1 · Foundation | Move `docs/database/*` to `Source/backend/prisma/`; first migration = generated SQL + `constraints.sql`; seed (1 Boss, 2 managers, 3 buildings, rooms, services, rate plans, 1 tenant with active contract); `auth` module; scope guard; error filter; FE skeleton with 3 layouts and login | 3 roles log in and land in the right layout; `check-constraints.mjs` still 50/50; unit tests for scope guard |
| 2 · Rooms | buildings, rooms, services, pricing + approval, public pages, viewings | Guest finds a room and books a viewing; price changes only after Boss approval |
| Extra · Home101 | Fixes to what Phase 1, Phase 2 and the UI work already built, after the Home101 brief (D-23..D-34): guest accounts with SMS code, entry screen, Vietnamese + English, room filters, viewings with exact time and two-way time proposals, viewing notifications. Parts and order: `docs/phase-extra-home101/README.md` | A visitor signs up, books a time, agrees a new time with the manager and gets reminded; old logins and public pages still work |
| 3 · Contracts | contracts (create, PDF, sign, move-in, cancel), tenant account (reusing the guest account, D-26), occupants, vehicles. Needs part EX-1 of Phase Extra first | From viewing to tenant logged in |
| 4 · Money | meters, billing, bank webhook, manual payment, reissue, settlement, reminders | Example invoice 3.119.000 đ passes as a unit test; webhook matched and unmatched cases pass; a missed 00:05 run is caught up (BIL-05, BIL-06) |
| 5 · Operations | requests (with the repair review, REQ-09), notifications inbox (the rest of it; viewing notifications come in Phase Extra), renewal, reports, audit, settings | Boss compares buildings in reports |
