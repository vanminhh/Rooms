# 16 · Billing, payments, settlement

Module: `billing`. Tables: `invoices`, `invoice_lines`, `payments`, `settlements`. Webhook side: [17-bank.md](17-bank.md).

## Invoice types and statuses

| Type | Created | Contents |
|---|---|---|
| `DEPOSIT` | At signing (CON-08) | 1 line `DEPOSIT` |
| `MONTHLY` | DRAFT by cron on each billing date, issued when readings are in | rent + utilities + services of the period just lived (postpaid, D-05) |
| `FINAL` | At settlement, only if the tenant still owes (net < 0) | see Settlement |

| Status | Vietnamese | Meaning |
|---|---|---|
| `DRAFT` | "Nháp" | waiting for readings, not visible to tenant |
| `UNPAID` | "Chưa thanh toán" | issued, has VietQR |
| `PAID` | "Đã thanh toán" | one payment row exists |
| `SETTLED` | "Đã quyết toán" | unpaid amount moved into a settlement |
| `CANCELLED` | "Đã hủy" | needs `cancel_reason` |
| (derived) | "Quá hạn" | UNPAID and today > `due_date` |

## Periods

```
clamp(y, m, d)  = date(y, m, min(d, daysInMonth(y, m)))
D(k)            = clamp(year/month of start_date + k months, billing_day)     k = 0..N, D(0) = start_date
period k        = [D(k−1), D(k) − 1 day]                                       k = 1..N
end_date        = D(N) − 1 day                                                 N = term_months
billing date k  = D(k)   → cron creates the DRAFT for period k at 00:05
```

- **BIL-01** Example: start 15/09/2026, 6 months → periods 15/09–14/10, …, 15/02–14/03/2027; `end_date` 14/03/2027; invoice for period 1 on 15/10/2026.
- **BIL-02** Example: start 31/01/2027, 3 months, billing_day 31 → D = 31/01, 28/02, 31/03, 30/04; periods 31/01–27/02, 28/02–30/03, 31/03–29/04; `end_date` 29/04/2027.
- **BIL-03** Renewal keeps `billing_day`; its `start_date` = old `end_date` + 1 = old D(N), so the cycle continues without a gap.
- **BIL-04** No period exists beyond `end_date` (D-13).

## Cron

- **BIL-05** 00:05 daily: for each `ACTIVE` contract with D(k) = today for some k in 1..N and no non-cancelled MONTHLY invoice for k → create `DRAFT` (period_no = k, period dates). Idempotent through the partial unique index.
- **BIL-06** Then, for each renewal whose `start_date` = today and is signed: old contract → `ENDED` (`ended_at`), new → `ACTIVE`, copy occupants and active vehicles (CON-18, CON-19).

## Calculation (issue)

For MONTHLY period k, rates = approved plans effective at `period_start` (RATE-04). Counts are taken at `period_start` so that approved changes apply from the next period:
- occupants counted: `move_in_date ≤ period_start` and (`move_out_date` null or `> period_start`);
- vehicles counted: `registered_at ≤ period_start` and (`removed_at` null or `> period_start`).

| Line kind | Quantity | Unit price |
|---|---|---|
| `RENT` "Tiền phòng {dd/mm}–{dd/mm}" | 1 | `contracts.rent` |
| `ELECTRIC` (one line per tier, [12-pricing.md](12-pricing.md#electric-tier-calculation)) | kWh in tier | tier price |
| `WATER` PER_M3 | m³ (MTR-05) | water price |
| `WATER` PER_PERSON | occupants | water price |
| `SERVICE` unit ROOM (each chosen service) | 1 | service price |
| `SERVICE` unit PERSON (each chosen service) | occupants | service price |
| `PARKING` per VEHICLE service | vehicles of that service | service price |

- **BIL-07** `amount = quantity × unit_price` per line; `total` = sum. `meta` stores opening/closing readings and dates.
- **BIL-08** <a id="issue"></a>Issue: status `UNPAID`, `issue_date` = today, `due_date` = today + `buildings.due_days`. Notify tenant (in-app + email) with VietQR.
- **BIL-09** Worked example (must be a unit test): start 15/09/2026, rent 2.500.000, readings electric 1.284 → 1.368, water 6 m³ PER_M3 at 15.000, Wifi (ROOM) 100.000, Rác (PERSON) 30.000 × 2, 1 motorbike 100.000, seed tiers → 2.500.000 + 150.000 + 119.000 + 90.000 + 100.000 + 60.000 + 100.000 = **3.119.000 đ**, due 20/10/2026 with `due_days` 5.

## VietQR

- **BIL-10** `GET /me/invoices/:id` and staff invoice detail include `vietqr = { bankBin, accountNo, accountName, amount: total, content: "TT{id}" }` from `settings.bank_account`, and `qrImageUrl` built as `https://img.vietqr.io/image/{bankBin}-{accountNo}-compact2.png?amount={total}&addInfo=TT{id}&accountName={urlencoded}`. Only for UNPAID invoices.

## Manual payment

- **BIL-11** `POST /invoices/:id/payment` `{ method: CASH|BANK_TRANSFER|CARD|OTHER, paidAt?, note? }` by staff in scope. Amount is always the invoice total (no partial, D-10). DB trigger sets PAID. Errors: `INVOICE_NOT_UNPAID`, `PAYMENT_AMOUNT_MISMATCH`. Notify tenant "Đã nhận tiền".

## Reissue

- **BIL-12** <a id="reissue"></a>`POST /invoices/:id/reissue` `{ reason, corrections }` on DRAFT or UNPAID only: cancel it (`cancel_reason`), apply reading corrections, create a new invoice for the same period with `replaces_id`, recompute, issue. PAID invoices cannot be reissued.

## Settlement

<a id="settlement"></a>`POST /contracts/:id/settlement?dryRun=true|false` `{ moveOutDate, finalReadings: { electric, water, photos }, damages, depositForfeit, note }`. `dryRun=true` returns the breakdown without writing. Allowed on ACTIVE contracts. (HOLD cancellation uses CON-12.)

- **BIL-13** j = the period containing `moveOutDate` (j = N if `moveOutDate` ≥ `end_date`).
- **BIL-14** `last_period_amount` = everything not yet issued up to `moveOutDate`, never charging anything twice:
  - if period j has no issued MONTHLY invoice: rent of period j in full (D-14) + services and parking of period j in full [ASSUMPTION A-01];
  - utilities from the last issued closing reading to the final reading (tiers on that kWh), if the final reading is later;
  - any DRAFT (period j or earlier) is cancelled with reason "Gộp vào thanh lý" and its charges are computed here instead.
  Example: an expired contract already invoiced for period N, settled 10 days later → only utilities of those 10 days.
- **BIL-15** `remaining_rent` = rent × (N − j) if `moveOutDate` < `end_date`, else 0. Utilities and services are not charged for those periods [ASSUMPTION A-01].
- **BIL-16** `previous_debt` = sum of UNPAID invoice totals of this contract (deposit invoice excluded); those invoices become `SETTLED` with `settlement_id`.
- **BIL-17** `deposit` = the deposit actually paid on this contract chain (renewals carry it). `net = deposit − last_period_amount − remaining_rent − previous_debt − damages − deposit_forfeit` (DB CHECK).
- **BIL-18** net < 0 → `FINAL` invoice, UNPAID, due today + `due_days`, lines: the period-j lines, `REMAINING_RENT` (qty N − j, unit rent), one `PREVIOUS_DEBT` per settled invoice, `DAMAGE`, `DEPOSIT_FORFEIT`, and `DEPOSIT_OFFSET` (qty 1, unit −deposit). Sum = −net. net ≥ 0 → no invoice; refund = net, staff records `refund_paid_at` when paid out.
- **BIL-19** Same transaction: final readings, settlement row, contract `ENDED` + `ended_at`, occupants `move_out_date`, vehicles inactive, room back to "Trống", tenant account deactivated if no other HOLD/ACTIVE contract (sessions revoked), audit log, tenant notification.
- **BIL-20** Stays after `end_date` are not charged automatically [ASSUMPTION A-06]; staff may add them as damages with a note.

## API

| Method | Path | Who |
|---|---|---|
| GET | `/invoices?buildingId&status&type&overdue&period` | staff |
| GET | `/invoices/:id` | staff |
| POST | `/invoices/:id/issue` · `/remind` · `/payment` · `/reissue` | staff |
| POST | `/contracts/:id/settlement?dryRun=` | staff |
| POST | `/settlements/:id/refund-paid` | staff |
| GET | `/me/invoices` · `/me/invoices/:id` | tenant (DRAFT hidden) |

## Acceptance

- [ ] BIL-09 example computes 3.119.000 đ with the listed lines.
- [ ] Period dates for BIL-01 and BIL-02 match exactly (unit test on the date helper, including leap year 2028).
- [ ] Cron run twice on the same day creates one DRAFT.
- [ ] Rate change effective 20/10 leaves the 15/10–14/11 period on the old rate.
- [ ] Occupant added on 20/10 is first counted in the period starting 15/11.
- [ ] Early move-out on 25/11/2026 for BIL-01 contract (deposit 2.500.000): j = 3, remaining_rent = 3 × 2.500.000, net negative → FINAL invoice total = −net.
- [ ] Reissue keeps exactly one non-cancelled invoice for the period.
