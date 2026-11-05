# 12 · Pricing and approval

Module: `pricing`. Tables: `room_prices`, `rate_plans`, `rate_tiers`.

## Room price

- **PRC-01** Manager proposes `{ roomId, price, effectiveFrom, reason }` → `room_prices` PENDING. `effectiveFrom` ≥ today.
- **PRC-02** A new proposal for a room with one already PENDING marks the old one `SUPERSEDED` in the same transaction (DB allows only 1 PENDING).
- **PRC-03** Boss approves → APPROVED; if `effectiveFrom` ≤ today, set `rooms.price` now (same transaction); else the price job sets it on that date (PRC-06). Boss rejects → REJECTED with `review_note` (required).
- **PRC-04** When Boss proposes, it is approved immediately (`reviewed_by_id = proposed_by_id`); a PENDING proposal of the same room becomes `SUPERSEDED` in the same transaction (PRC-02).
- **PRC-05** Changing `rooms.price` never changes existing contracts (D-08).
- **PRC-06** The current price of a room = the APPROVED `room_prices` row with the greatest `effective_from` ≤ today; on the same date the later `reviewed_at` wins. The price job (01:00 Asia/Ho_Chi_Minh **and at app start**, [01-architecture.md](01-architecture.md#cron-asiaho_chi_minh)) writes it to `rooms.price` when it differs, never writes `null`, and changes nothing when run again. It accepts a `roomIds` filter (used by tests).
- **PRC-07** A PENDING proposal whose `effective_from` is before today is **expired** (derived, shown as "Quá hạn" to Boss and the manager). Approving it → 409 `PRICE_PROPOSAL_EXPIRED`; Boss may still reject it; the manager gets "Đề xuất lại" (a new proposal prefilled from the old one, which supersedes it). Owner 01/11/2026.
- **PRC-08** Approving a price B (PRC-03 or PRC-04) also marks `SUPERSEDED` every APPROVED price of the same room that is not yet in effect (`effective_from` > today) and has `effective_from` ≥ B's. Example: A from 15/11 then B from 10/11 → A superseded; A from 15/11 then B from 20/11 → both stay. Same transaction, before B is written; audit (owner 01/11/2026).
- **PRC-09** Approve and reject are conditional updates on `status = PENDING`; 0 rows → `CONFLICT_STATE` (two clicks or two tabs).

## Rate plans (electric, water, services)

- **RATE-01** A rate plan = `{ buildingId, kind, serviceId?, effectiveFrom, tiers[] }`. Same proposal/approval flow and rules as PRC-01..04 and PRC-07..09, keyed by (building, kind, service). For PRC-08 the old plan is superseded before the new one is approved, so `rate_plans_one_per_day` is not hit. A locked service cannot get a plan (SVC-04).
- **RATE-02** Tiers: `tier_no` 1..n, `up_to` strictly increasing, last tier `up_to = null`, `unit_price ≥ 0`. WATER and SERVICE plans have exactly 1 tier with `up_to = null`.
- **RATE-03** WATER `unit_price` means đ/m³ when `water_mode = PER_M3`, đ/person/period when `PER_PERSON`.
- **RATE-04** The rate for a billing period = the APPROVED plan with the greatest `effective_from` ≤ `period_start` (D-09). No plan → `RATE_PLAN_MISSING`; the invoice stays DRAFT and the task shows in "Việc hôm nay".
- **RATE-05** Approving with `effectiveFrom` in the past is not allowed: 409 `PRICE_PROPOSAL_EXPIRED` (PRC-07; was 400, changed by the owner 01/11/2026).
- **RATE-06** One shared helper `ratesAt(buildingId, date)` returns RATE-04 for any date: billing calls it with `period_start`, public pages and ROOM-05 with today.

## Labels and the "Duyệt giá" page

- **PRC-10** Labels (UI-02): PENDING "Chờ duyệt", APPROVED "Đã duyệt", REJECTED "Từ chối", SUPERSEDED "Đã thay thế", expired (PRC-07) "Quá hạn".
- **PRC-11** "Giá chờ duyệt" on Boss's "Việc hôm nay" counts only PENDING items that are not expired.
- **PRC-12** The page shows old → new. Room price, water and service (1 tier): old → new and % change. Electric: a tier table old → new with % per tier; when the number of tiers differs, the two tables without %. No old value → "Giá mới", no %. % is computed by the BE, rounded to 1 decimal. Approving shows a confirm dialog with the amount (UI-04) and says when it will supersede another approved price (PRC-08). Every room-price list row and every propose/approve/reject response carries `roomCode` (`rooms.code`, e.g. "203") and `buildingName`, so the page can identify the room and building; a rate plan carries `buildingName`.

## Electric tier calculation

```
remaining = kWh
for tier in tiers ordered by tier_no:
  width = tier.up_to == null ? remaining : tier.up_to − previous_up_to   (previous_up_to starts at 0)
  q = min(remaining, width)
  if q > 0: line(kind=ELECTRIC, label="Điện bậc {n} ({from}–{to} kWh)", quantity=q, unit_price=tier.unit_price)
  remaining −= q
```

Tiers apply to the total kWh of the whole period (not split by calendar month).

Seed tiers until Q-02 is answered: 0–50: 3.000 đ · 51–100: 3.500 đ · 101+: 4.000 đ. Water PER_M3: 15.000 đ/m³. Wifi 100.000, Rác 30.000/người, Gửi xe máy 100.000/xe.

## API

| Method | Path | Who |
|---|---|---|
| GET/POST | `/room-prices?roomId&status` | staff |
| POST | `/room-prices/:id/approve` · `/reject` | **Boss** |
| GET/POST | `/rate-plans?buildingId&kind&status` | staff |
| POST | `/rate-plans/:id/approve` · `/reject` | **Boss** |

Boss's "Duyệt giá" page lists all PENDING room prices and rate plans with old → new and % change (PRC-12); expired ones are shown separately and can only be rejected (PRC-07).

## Acceptance

- [ ] 84 kWh with seed tiers → lines 50 × 3.000 and 34 × 3.500 = 269.000 đ.
- [ ] 0 kWh → exactly one line "Điện (0 kWh)" with quantity 0 and the tier-1 unit price, amount 0 (the tenant still sees the reading).
- [ ] Rate approved effective 20/10 does not apply to a period starting 15/10; applies to the period starting 15/11.
- [ ] Two quick proposals for the same room leave exactly one PENDING.
- [ ] Approving a proposal with `effective_from` yesterday returns `PRICE_PROPOSAL_EXPIRED` (PRC-07).
- [ ] PRC-08 both examples, for a room price and for a rate plan.
- [ ] With the server off at 01:00, the start-up run sets `rooms.price` for that day; a second run changes nothing (PRC-06).
