# 12 · Pricing and approval

Module: `pricing`. Tables: `room_prices`, `rate_plans`, `rate_tiers`.

## Room price

- **PRC-01** Manager proposes `{ roomId, price, effectiveFrom, reason }` → `room_prices` PENDING. `effectiveFrom` ≥ today.
- **PRC-02** A new proposal for a room with one already PENDING marks the old one `SUPERSEDED` in the same transaction (DB allows only 1 PENDING).
- **PRC-03** Boss approves → APPROVED; if `effectiveFrom` ≤ today, set `rooms.price` now; else the 01:00 cron sets it on that date. Boss rejects → REJECTED with `review_note` (required).
- **PRC-04** When Boss proposes, it is approved immediately (`reviewed_by_id = proposed_by_id`).
- **PRC-05** Changing `rooms.price` never changes existing contracts (D-08).

## Rate plans (electric, water, services)

- **RATE-01** A rate plan = `{ buildingId, kind, serviceId?, effectiveFrom, tiers[] }`. Same proposal/approval flow and supersede rule as PRC-01..04, keyed by (building, kind, service).
- **RATE-02** Tiers: `tier_no` 1..n, `up_to` strictly increasing, last tier `up_to = null`, `unit_price ≥ 0`. WATER and SERVICE plans have exactly 1 tier with `up_to = null`.
- **RATE-03** WATER `unit_price` means đ/m³ when `water_mode = PER_M3`, đ/person/period when `PER_PERSON`.
- **RATE-04** The rate for a billing period = the APPROVED plan with the greatest `effective_from` ≤ `period_start` (D-09). No plan → `RATE_PLAN_MISSING`; the invoice stays DRAFT and the task shows in "Việc hôm nay".
- **RATE-05** Approving with `effectiveFrom` in the past is not allowed (400).

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

Boss's "Duyệt giá" page lists all PENDING room prices and rate plans with old → new and % change.

## Acceptance

- [ ] 84 kWh with seed tiers → lines 50 × 3.000 and 34 × 3.500 = 269.000 đ.
- [ ] 0 kWh → exactly one line "Điện (0 kWh)" with quantity 0 and the tier-1 unit price, amount 0 (the tenant still sees the reading).
- [ ] Rate approved effective 20/10 does not apply to a period starting 15/10; applies to the period starting 15/11.
- [ ] Two quick proposals for the same room leave exactly one PENDING.
