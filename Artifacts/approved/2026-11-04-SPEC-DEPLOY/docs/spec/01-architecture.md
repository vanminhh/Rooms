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
├─ .claude/                  settings.json + hooks/staging-guard.mjs (edits outside staging ask the owner)
├─ Artifacts/                shared staging area for drafts awaiting approval (+ approved/, reviews/)
├─ assets/                   raw source assets: logos, fonts, mockup PDFs, design images (not served)
├─ docs/
│  └─ spec/                  this specification
└─ Source/
   ├─ frontend/              CLAUDE.md, artifact_FE/ (staging), src/{app,layouts,pages,features,components,shared,assets}
   └─ backend/               CLAUDE.md, artifact_BE/ (staging), prisma/ (schema, constraints, DB check, migrations, seed), src/{common,modules,jobs}
```

Each feature has a task file `feature_<name>.md` in `Source/backend/src/modules/<module>/` and `Source/frontend/src/features/<module>/` (workflow in root `CLAUDE.md`).

Backend module list (one Nest module per folder in `src/modules/`): `auth`, `buildings`, `rooms`, `pricing`, `viewings`, `contracts`, `meters`, `billing`, `bank`, `requests`, `notifications`, `reports`, `settings`, `files`, `mailer`, `audit`. Cross-cutting code in `src/common/` (guards, error filter, crypto, date utils). Cron in `src/jobs/`.

## API conventions

- **API-01** REST + JSON under `/api/v1`. Paths are English plural nouns (`/contracts/:id/occupants`).
- **API-02** Success body `{ "data": ..., "meta"?: {...} }`. Lists: `meta = { page, limit, total }`, query `?page=1&limit=20&sort=-createdAt`.
- **API-03** Error body `{ "error": { "code": "ROOM_NOT_AVAILABLE", "message": "<Vietnamese, user-readable>", "fields"?: { "<field>": "<message>" } } }`.
- **API-04** HTTP status: 400 invalid input · 401 not logged in · 403 role/scope · 404 · 409 wrong state or conflict · 429 rate limit · 500 unexpected.
- **API-05** Money-changing POSTs accept header `Idempotency-Key`; the same key within 24 h returns the first result.
- **API-06** Dates in JSON are `YYYY-MM-DD` (business dates) or ISO 8601 with offset (timestamps). Money is integer.
- **API-07** Route groups: `/public/*` no auth · `/auth/*` · `/me/*` TENANT only, own data · everything else MANAGER or BOSS with building scope · routes marked **Boss** in module specs are BOSS only · `/webhooks/bank` provider signature only.
- **API-08** Every list endpoint for staff accepts `?buildingId=`; managers get 403 `OUT_OF_SCOPE` for a building they don't manage; without it they get all their buildings.

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
- **FILE-02** The client sends back only `publicId` (+ `version`, `format`); the BE checks the folder and builds the delivery URL itself. URLs from the client are never stored.

## Cron (Asia/Ho_Chi_Minh)

| Time | Job | Spec |
|---|---|---|
| 00:05 daily **and at app start** | Create `DRAFT` monthly invoices for billing dates in the last 7 days that have none; switch signed renewals whose start date has come (catch-up of missed runs, D-21) | [16-billing.md](16-billing.md#cron) |
| 01:00 daily **and at app start** | Sync `rooms.price` with the current approved room price (PRC-06; the start-up run fixes days missed while the server was off); auto-close incidents `RESOLVED` > 3 days | [12-pricing.md](12-pricing.md), [18-requests.md](18-requests.md) |
| 08:00 daily | Invoice reminders; contract expiry notices (30 and 7 days); stale drafts > 2 days; expired unresolved contracts | [19-notifications.md](19-notifications.md) |

Every job MUST be idempotent (safe to run twice the same day) and log a summary line.

## Deployment

Scale: one chain of mini apartment buildings, hundreds of rooms. One server is enough; these rules keep it from going down or misbehaving behind a proxy (owner 04/11/2026).

- **DEP-01** FE and API are served from **one origin**: e.g. `https://<domain>/` serves the SPA and `https://<domain>/api/*` is forwarded to the BE, the same way the Vite proxy works in dev. Reason: the BE has no CORS and the refresh cookie is `SameSite=Lax` on path `/api/v1/auth` (AUTH-T2); on a second domain requests are blocked and users are logged out after 15 minutes.
- **DEP-02** The BE runs as **exactly one always-on instance** with at least 1 GB RAM; no free tier that sleeps (a sleeping server misses cron and webhooks). Reasons: the login and viewing IP limits are kept in memory (AUTH-04, VIEW-11) and cron runs inside the app; one argon2 check uses about 64 MB and up to 4 run at once (AUTH-03). Before a second instance: move those limits to a shared store and run cron on one instance only.
- **DEP-03** BE and DB run in the same region, Singapore (nearest to Hà Nội). The app uses the pooled `DATABASE_URL`; `DIRECT_URL` is for migrations only.
- **DEP-04** Behind a proxy or CDN, Express `trust proxy` is set to the **exact number of proxies** in front of the BE (env `TRUST_PROXY_HOPS`, default 0), so `req.ip` is the visitor's IP for the per-IP limits (AUTH-04, VIEW-02) and audit logs. Never `true`: anyone could then fake `X-Forwarded-For`. Without it every visitor shares the proxy's IP, and the whole site gets only 5 viewing bookings per hour.
- **DEP-05** `NODE_ENV` is required (`development`, `test` or `production`; added to `REQUIRED_ENV` and `.env.example`). Production runs with `production`, which makes the refresh cookie `Secure` (AUTH-T2); the app refuses to start without it instead of silently running with a non-secure cookie.
- **DEP-06** A CDN (e.g. Cloudflare) in front of the origin caches public GET responses for 60 s (PUB-05) and blocks obvious bots. Its cache rule covers only `GET /api/v1/public/*`; CDNs do not cache JSON by default.

## Roadmap

| Phase | Scope | Done when |
|---|---|---|
| 1 · Foundation | Move `docs/database/*` to `Source/backend/prisma/`; first migration = generated SQL + `constraints.sql`; seed (1 Boss, 2 managers, 3 buildings, rooms, services, rate plans, 1 tenant with active contract); `auth` module; scope guard; error filter; FE skeleton with 3 layouts and login | 3 roles log in and land in the right layout; `check-constraints.mjs` still 50/50; unit tests for scope guard |
| 2 · Rooms | buildings, rooms, services, pricing + approval, public pages, viewings | Guest finds a room and books a viewing; price changes only after Boss approval |
| 3 · Contracts | contracts (create, PDF, sign, move-in, cancel), tenant account, occupants, vehicles | From viewing to tenant logged in |
| 4 · Money | meters, billing, bank webhook, manual payment, reissue, settlement, reminders | Example invoice 3.119.000 đ passes as a unit test; webhook matched and unmatched cases pass; a missed 00:05 run is caught up (BIL-05, BIL-06) |
| 5 · Operations | requests, notifications inbox, renewal, reports, audit, settings | Boss compares buildings in reports |
