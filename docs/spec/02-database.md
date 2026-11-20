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
| Money | `meter_readings` | Electric/water readings | BE-P3-20: one opening per contract/kind; ordinary readings unique per contract/room/kind/day, unassigned per room/kind/day. Replaced meter needs old final value. Owner acceptance and deployment evidence recorded in the BE-P3-20 checkpoint |
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

The EX-1, EX-5 and EX-6 changes below are implemented and included in the owner-accepted Phase Extra (16/11/2026); the table retains their planning history. Phase 3/5 entries remain future work. Applied migration evidence is in `docs/phase-extra-home101/PROGRESS.md`. Future schema changes still require approval before application, and every change adds scenarios to `check-constraints.mjs`.

| Part | Table | Change | Rule |
|---|---|---|---|
| EX-1 | `users` | enum `Role` gets `GUEST`; `email_verified_at timestamptz null`; `locale` (`vi` / `en`, default `vi`). The first EX-1 migration (`guest_accounts`, applied to the dev database on 12/11/2026) added `phone_verified_at`, which is no longer used; a second migration adds `email_verified_at` | AUTH-11..15 |
| EX-1 | email codes (the table the first EX-1 migration created as `phone_otps`) | email, code hash, tries, expiry, used time | AUTH-13 |
| EX-5 | `rooms` | **Done 13/11/2026** (migration `room_attributes`): `room_type`, `has_balcony`, `has_window`, `pets_allowed`; null = not entered yet | ROOM-10 |
| EX-5 | `buildings` | **No migration.** `amenities` stays one jsonb array: an item in the fixed list is a code, any other item is old free text; the API splits them (`amenities` and `legacyAmenities`) and a save keeps the old text until staff clear it (BLD-08) | BLD-08 |
| EX-6 | `viewings` | Add only `user_id Int null` (owner FK users, ON DELETE RESTRICT), `visit_at timestamptz null`, and status `DONE`; make `visit_date`/`time_slot` nullable; CHECK exact time or both legacy fields; indexes `(user_id, created_at)` and `(visit_at, status)`; partial unique `(user_id, room_id)` for non-null owner and NEW/CONFIRMED. Keep existing rows unchanged. No confirmation/cancellation metadata columns or enums. Guest cancellation clears existing `handled_by_id`; staff sets it. Capacity and cross-building checks are BE transactions, not additional schema | VIEW-01, VIEW-02a, VIEW-04, VIEW-08, VIEW-15, VIEW-16, VIEW-18 |
| Phase 3 | `contracts` | trigger "tenant is TENANT" stays; the BE switches a `GUEST` to `TENANT` in the same transaction before the insert | CON-07 |
| Phase 3 | `contracts`, `occupants` | the signed scan and the two CCCD photos are private Cloudinary assets (D-37): store their verified asset ids instead of URLs (the exact columns and what happens to `signed_scan_url`, `id_front_url`, `id_back_url` are fixed in the part's PLAN.md; ask the owner before the migration) | CON-06, CON-16 |
| Phase 3 | `viewings` | who pressed "Đã gọi" and when, for the viewings cancelled by a deposit (D-39); ask the owner before the migration | VIEW-06 |
| Phase 3 | `meter_readings` | Owner approved schema/migration creation and dev DB application 20/11, then accepted BE-P3-20 after checking without errors: `is_opening` default false; preserve existing rows; partial indexes for one opening per contract/kind and ordinary readings per contract/day (or per room/day when unassigned). Same-day old closing/new opening/new closing coexist. Migration `20261120000000_contract_meter_openings` validated on full offline schema; acceptance and evidence in [checkpoint](../phase-3-contracts/plans/P3-4/CHECKPOINT-BE-P3-20.md). No independent deploy/status output was supplied to Codex | CON-10, MTR-02, BIL-07 |
| Phase 3 | `contracts` | `billing_day` is no longer used: every period is a calendar month (D-40). Whether to drop the column or fix it to 1 is decided in P3-1's PLAN.md; dropping needs the owner's OK before the migration | CON-03 |
| Phase 5 | `requests` | repair review: rating 1–5, comment, time, hidden reason; only on `INCIDENT` in `CLOSED` | REQ-09 |

## Enforced by DB (the BE still validates first and returns a friendly code)

Latest offline `check-constraints.mjs` result: **107/107** on 20/11/2026, from the local BE-P3-20 schema plus constraints (dev DB migration pending). This adds 10 meter-opening scenarios to the previous 97. Original coverage includes: second Boss; bad/duplicate phone; 3rd building for a manager; tenant as manager; delete building with rooms; duplicate room code; 2 pending price proposals; service rate without service; cross-building service rate; contract < 3 months; 2 open contracts per room; room/building mismatch; manager as signer; ACTIVE without move-in; re-rent after end (allowed); tenant with 2 rooms (allowed); 2 renewals from 1 contract; cross-building contract service; 2 signers; cross-building vehicle; duplicate active plate; re-register removed plate (allowed); duplicate unassigned readings same day; meter replacement without old value; 2 invoices same period; cancel + reissue (allowed); cancel without reason; issue without due date; wrong line amount; negative unit price; underpayment; exact payment sets PAID; second payment; webhook payment without transaction; valid webhook (allowed); duplicate webhook; matched transaction without invoice; wrong settlement math; negative net without final invoice; positive net (allowed); 2 pending move-out/renew; incident APPROVED; cost on non-incident; announcement to other building's room; duplicate notification.

## Enforced only by BE (each MUST have a unit test)

- **DB-B1** Contract `rent` = `rooms.price` at creation; renewal `rent` = previous contract rent.
- **DB-B2** `end_date` and period dates follow [16-billing.md#periods](16-billing.md#periods).
- **DB-B3** New reading ≥ previous reading of the same room and kind, unless `is_meter_replaced`.
- **DB-B4** `invoices.total` = sum of its lines. Tiers ascend by `up_to`, last tier `up_to = null`.
- **DB-B5** `contract_services` only reference services with unit ROOM or PERSON; `vehicles.service_id` only unit VEHICLE.
- **DB-B6** Active occupants ≤ `rooms.max_occupants`. When changing a room's limit, count occupants of ACTIVE contracts with `move_in_date <= today` and `move_out_date IS NULL OR move_out_date >= today`, using the business date in `Asia/Ho_Chi_Minh`. An occupant whose move-out date is today still counts through that day. The BE checks and updates the room in one transaction; a lower limit returns 409 `CONFLICT_STATE` (owner 04/11/2026; CON-13).
  - BE-P3-23 / A-26 implementation default for DB-B6 (pending separate owner confirmation): retain the current-day limit check and additionally reject a decrease below the peak of existing HOLD/ACTIVE stay plans from today onward. Occupant writes check their affected date range and move-in checks current/future plans; all keep the room lock. Past peaks do not prevent a limit decrease. This does not change BIL's separate billing departure boundary.
- **DB-B7** Renewal `start_date` = previous `end_date` + 1 day (periods are calendar months, D-40).
- **DB-B8** Building scope and tenant ownership on every read and write.
- **DB-B9** CCCD photo URLs are signed per request and expire in ≤ 5 minutes; each view writes `audit_logs` (`occupant.view_id`).

## Run the DB check

```bash
cd Source/backend
npm i --no-save @electric-sql/pglite@0.2   # prisma is already a dev dependency
export DATABASE_URL=postgresql://u:p@localhost/db DIRECT_URL=postgresql://u:p@localhost/db   # dummy, not used
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script -o prisma/schema.sql
node prisma/check-constraints.mjs . prisma   # expect every scenario to pass: "N/N tình huống đúng như mong đợi" (66/66 on 13/11/2026)
```

Any schema change MUST keep every scenario passing and SHOULD add a scenario for the new rule. The list above names the first 50; later migrations added theirs (Phase 2: 54, Phase Extra so far: 66).
