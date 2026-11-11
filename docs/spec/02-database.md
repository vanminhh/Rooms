# 02 · Database

Source files (verified): [schema.prisma](../../Source/backend/prisma/schema.prisma) (26 models, 20 enums, every column commented) · [constraints.sql](../../Source/backend/prisma/constraints.sql) (10 partial unique indexes, 38 CHECKs, 3 triggers) · [check-constraints.mjs](../../Source/backend/prisma/check-constraints.mjs) (50 scenarios). Read `schema.prisma` for exact columns; this file explains the rules.

## Conventions

- **DB-01** Primary key `id Int @default(autoincrement())` on every table (`audit_logs` uses BigInt). `contract_services` has composite PK `(contract_id, service_id)`; `settings` PK is `key`.
- **DB-02** Tables and columns are snake_case in PostgreSQL (`@@map`/`@map`); Prisma fields are camelCase.
- **DB-03** FKs default to `ON DELETE RESTRICT`. Only pure child data cascades: `sessions`, `password_reset_tokens`, `room_images`, `rate_tiers`, `invoice_lines`, `occupants`, `contract_services`, `notifications`.
- **DB-04** "Same building" is enforced with composite FKs: the child stores `building_id` and references `(id, building_id)` of the parent (`rooms`, `services`, `contracts` each have `@@unique([id, buildingId])`). Applies to `contracts→rooms`, `contract_services→contracts/services`, `vehicles→contracts/services`, `rate_plans→services`, `announcements→rooms`.
- **DB-05** Money `Int` (đồng). Business dates `@db.Date`. Timestamps `@db.Timestamptz`.
- **DB-06** Statuses are Postgres enums. Derived states (room status, overdue) are never stored.
- **DB-07** Prisma cannot declare partial unique indexes, CHECKs or triggers. They live in `constraints.sql`, appended to the first migration. Any later migration that touches those tables MUST keep them.

## Tables

| Group | Table | Purpose | Key rules |
|---|---|---|---|
| Accounts | `users` | Boss, managers, tenants | UK phone, email; only 1 BOSS; phone format CHECK |
| | `sessions` | Refresh tokens | UK token_hash |
| | `password_reset_tokens` | Email reset links | UK token_hash, single use |
| Buildings | `buildings` | Mini apartment buildings | UK code (`^[A-Z0-9]{2,6}$`); trigger: manager is active MANAGER with < 2 other buildings |
| | `rooms` | Rooms | UK (building_id, code); `price` null = not approved, not public |
| | `room_images` | Photos | |
| Pricing | `room_prices` | Proposals + history of room price | 1 PENDING per room |
| | `services` | Per-building service catalog | UK (building_id, name); unit ROOM / PERSON / VEHICLE |
| | `rate_plans` | Dated rate for ELECTRIC, WATER or a SERVICE | service_id iff kind = SERVICE; 1 PENDING per (building, kind, service); 1 APPROVED per day |
| | `rate_tiers` | Tiers of a rate plan | UK (rate_plan_id, tier_no); `up_to` null = last tier |
| Contracts | `viewings` | Viewing appointments | UK contract_id; phone CHECK |
| | `contracts` | Central table | UK code; composite FK to room; trigger tenant is TENANT; 1 HOLD/ACTIVE per room; term ≥ 3; ACTIVE needs signed_at + moved_in_at; UK previous_contract_id |
| | `contract_services` | Services chosen at signing | same building |
| | `occupants` | People living in the room incl. signer | 1 signer per contract |
| | `vehicles` | Registered vehicles | same building; plate unique while active |
| | `requests` | Incidents and requests | status valid per type; cost only on INCIDENT; 1 pending MOVE_OUT/RENEW per contract |
| Money | `meter_readings` | Electric/water readings | UK (room_id, kind, read_on); replaced meter needs old final value |
| | `invoices` | DEPOSIT / MONTHLY / FINAL | 1 non-cancelled per (contract, type, period_no); issued needs dates; cancelled needs reason; SETTLED ⇔ settlement_id |
| | `invoice_lines` | Lines | amount = quantity × unit_price; only DEPOSIT_OFFSET may be negative |
| | `bank_transactions` | Webhook payloads | UK (provider, provider_tx_id); invoice_id iff MATCHED/ASSIGNED |
| | `payments` | Exactly one per paid invoice | UK invoice_id, UK bank_transaction_id; source/column consistency; trigger: invoice UNPAID + exact total, then sets PAID |
| | `settlements` | Termination statement | UK contract_id; net = deposit − parts; final invoice iff net < 0 |
| Messages | `announcements` | Staff announcements | room must be in building |
| | `notifications` | Per-user inbox | 1 per (announcement, user) |
| System | `settings` | Key/value config (no secrets) | |
| | `audit_logs` | Who did what | |

## Planned changes

Not in `schema.prisma` yet. They follow the decisions of 12/11/2026 (D-25..D-33). Each one is a schema change, so the owner is asked before each migration (root `CLAUDE.md`, rule 7); exact column names are fixed in the part's `PLAN.md`. Every change adds its scenarios to `check-constraints.mjs`.

| Part | Table | Change | Rule |
|---|---|---|---|
| EX-1 | `users` | enum `Role` gets `GUEST`; `phone_verified_at timestamptz null`; `locale` (`vi` / `en`, default `vi`) | AUTH-11..15 |
| EX-1 | `phone_otps` (new) | phone, purpose (`REGISTER` / `RESET_PASSWORD` / `VERIFY_PHONE`), code hash, tries, expiry, used time | AUTH-13 |
| EX-5 | `rooms` | `room_type`, `has_balcony`, `has_window`, `pets_allowed`; null = not entered yet | ROOM-10 |
| EX-5 | `buildings` | `amenities` holds codes of a fixed list instead of free text; old values are kept until staff enter them again | BLD-08 |
| EX-6 | `viewings` | `user_id null` (owner account); `visit_at timestamptz null` (exact start); statuses `DONE`, `NO_SHOW`; who cancelled; `visit_date` + `time_slot` stay for old rows; CHECK: `visit_at`, or `visit_date` and `time_slot` | VIEW-01, VIEW-04, VIEW-08 |
| EX-6 | `viewing_proposals` (new) | viewing, side (`GUEST` / `STAFF`), user, proposed time, status (`PENDING` / `ACCEPTED` / `REJECTED` / `WITHDRAWN` / `EXPIRED`), source, note; at most 1 PENDING per viewing | VIEW-14..17 |
| EX-6 | `viewing_events` (new) | history of a viewing: actor, type, old → new, source, note, time | VIEW-22 |
| EX-8 | `notifications` | rows for viewing events; one reminder per (viewing, kind, time in effect) | NOTI-08, NOTI-09 |
| Phase 3 | `contracts` | trigger "tenant is TENANT" stays; the BE switches a `GUEST` to `TENANT` in the same transaction before the insert | CON-07 |
| Phase 5 | `requests` | repair review: rating 1–5, comment, time, hidden reason; only on `INCIDENT` in `CLOSED` | REQ-09 |

## Enforced by DB (the BE still validates first and returns a friendly code)

All 50 scenarios in `check-constraints.mjs` pass: second Boss; bad/duplicate phone; 3rd building for a manager; tenant as manager; delete building with rooms; duplicate room code; 2 pending price proposals; service rate without service; cross-building service rate; contract < 3 months; 2 open contracts per room; room/building mismatch; manager as signer; ACTIVE without move-in; re-rent after end (allowed); tenant with 2 rooms (allowed); 2 renewals from 1 contract; cross-building contract service; 2 signers; cross-building vehicle; duplicate active plate; re-register removed plate (allowed); 2 readings same day; meter replacement without old value; 2 invoices same period; cancel + reissue (allowed); cancel without reason; issue without due date; wrong line amount; negative unit price; underpayment; exact payment sets PAID; second payment; webhook payment without transaction; valid webhook (allowed); duplicate webhook; matched transaction without invoice; wrong settlement math; negative net without final invoice; positive net (allowed); 2 pending move-out/renew; incident APPROVED; cost on non-incident; announcement to other building's room; duplicate notification.

## Enforced only by BE (each MUST have a unit test)

- **DB-B1** Contract `rent` = `rooms.price` at creation; renewal `rent` = previous contract rent.
- **DB-B2** `end_date` and period dates follow [16-billing.md#periods](16-billing.md#periods).
- **DB-B3** New reading ≥ previous reading of the same room and kind, unless `is_meter_replaced`.
- **DB-B4** `invoices.total` = sum of its lines. Tiers ascend by `up_to`, last tier `up_to = null`.
- **DB-B5** `contract_services` only reference services with unit ROOM or PERSON; `vehicles.service_id` only unit VEHICLE.
- **DB-B6** Active occupants ≤ `rooms.max_occupants`. When changing a room's limit, count occupants of ACTIVE contracts with `move_in_date <= today` and `move_out_date IS NULL OR move_out_date >= today`, using the business date in `Asia/Ho_Chi_Minh`. An occupant whose move-out date is today still counts through that day. The BE checks and updates the room in one transaction; a lower limit returns 409 `CONFLICT_STATE` (owner 04/11/2026; CON-13).
- **DB-B7** Renewal `start_date` = previous `end_date` + 1 day and `billing_day` = previous `billing_day`.
- **DB-B8** Building scope and tenant ownership on every read and write.
- **DB-B9** CCCD photo URLs are signed per request and expire in ≤ 5 minutes; each view writes `audit_logs` (`occupant.view_id`).

## Run the DB check

```bash
cd Source/backend
npm i --no-save @electric-sql/pglite@0.2   # prisma is already a dev dependency
export DATABASE_URL=postgresql://u:p@localhost/db DIRECT_URL=postgresql://u:p@localhost/db   # dummy, not used
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script -o prisma/schema.sql
node prisma/check-constraints.mjs . prisma   # expect: 50/50 tình huống đúng như mong đợi
```

Any schema change MUST keep this at 50/50 and SHOULD add a scenario for the new rule.
