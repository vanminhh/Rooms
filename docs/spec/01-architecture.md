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
| `OUT_OF_SCOPE` | 403 | Manager touches another building's data; tenant touches another's contract |
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
| `RATE_PLAN_MISSING` | 409 | no approved rate for a needed kind/service at period start |
| `PENDING_REQUEST_EXISTS` | 409 | `requests_one_pending_moveout_renew` |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | webhook signature check failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error; generic Vietnamese message, no internal details (owner, 29/10/2026) |

## Auth tokens

- **AUTH-T1** Access token: JWT, 15 minutes, in `Authorization: Bearer`. Claims: `sub` (user id), `role`.
- **AUTH-T2** Refresh token: random 32 bytes, stored only as SHA-256 hash in `sessions.token_hash`, sent as httpOnly + Secure + SameSite=Lax cookie on path `/api/v1/auth`. Lifetime 30 days if "Ghi nhớ đăng nhập", else session cookie (browser close) with 12 h server expiry [ASSUMPTION A-07]. Rotated on every refresh.
- **AUTH-T3** Deactivating a user or changing a password revokes all their sessions.

## Cron (Asia/Ho_Chi_Minh)

| Time | Job | Spec |
|---|---|---|
| 00:05 daily | Create `DRAFT` monthly invoices for contracts due today; switch renewed contracts | [16-billing.md](16-billing.md#cron) |
| 01:00 daily | Apply approved room prices whose effective date is today; auto-close incidents `RESOLVED` > 3 days | [12-pricing.md](12-pricing.md), [18-requests.md](18-requests.md) |
| 08:00 daily | Invoice reminders; contract expiry notices (30 and 7 days); stale drafts > 2 days; expired unresolved contracts | [19-notifications.md](19-notifications.md) |

Every job MUST be idempotent (safe to run twice the same day) and log a summary line.

## Roadmap

| Phase | Scope | Done when |
|---|---|---|
| 1 · Foundation | Move `docs/database/*` to `Source/backend/prisma/`; first migration = generated SQL + `constraints.sql`; seed (1 Boss, 2 managers, 3 buildings, rooms, services, rate plans, 1 tenant with active contract); `auth` module; scope guard; error filter; FE skeleton with 3 layouts and login | 3 roles log in and land in the right layout; `check-constraints.mjs` still 50/50; unit tests for scope guard |
| 2 · Rooms | buildings, rooms, services, pricing + approval, public pages, viewings | Guest finds a room and books a viewing; price changes only after Boss approval |
| 3 · Contracts | contracts (create, PDF, sign, move-in, cancel), tenant account, occupants, vehicles | From viewing to tenant logged in |
| 4 · Money | meters, billing, bank webhook, manual payment, reissue, settlement, reminders | Example invoice 3.119.000 đ passes as a unit test; webhook matched and unmatched cases pass |
| 5 · Operations | requests, notifications inbox, renewal, reports, audit, settings | Boss compares buildings in reports |
