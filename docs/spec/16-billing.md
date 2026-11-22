# 16 · Billing, payments, settlement

Module: `billing`. Tables: `invoices`, `invoice_lines`, `payments`, `settlements`. Webhook side: [17-bank.md](17-bank.md).

## Invoice types and statuses

| Type | Created | Contents |
|---|---|---|
| `DEPOSIT` | At signing (CON-08) | 1 line `DEPOSIT` |
| `MONTHLY` | DRAFT by cron on each billing date (a missed run is caught up, BIL-05), issued when readings are in | rent + utilities + services of the period just lived (postpaid, D-05) |
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

Changed 16/11/2026 (owner, D-40, D-41): periods are calendar months for every contract, partial first and last months prorated. Before, each contract had its own billing day = its move-in day.

```
clamp(y, m, d)  = date(y, m, min(d, daysInMonth(y, m)))
T               = term_months
end_date        = clamp(year/month of start_date + T months, day of start_date) − 1 day
points          = start_date, every 1st of a month strictly after start_date and ≤ end_date, end_date + 1   (in order: p(0) < p(1) < … < p(N))
period k        = [p(k−1), p(k) − 1 day]                                       k = 1..N   (N = number of periods)
billing date k  = p(k), the 1st of the next month (or end_date + 1 for the last period)
                  → cron creates the DRAFT for period k at 00:05 (or the next run, up to p(k) + 7 days)
period k is partial when it does not cover its whole calendar month; then every fixed amount is
  amount × days(period k) ÷ days(that calendar month), rounded to the đồng (D-41, A-21)
```

- **BIL-01** Example (move-in on the 1st, so no partial month): start 01/09/2026, 6 months → periods 01/09–30/09, 01/10–31/10, …, 01/02–28/02/2027; `end_date` 28/02/2027; invoice for period 1 issued on 01/10/2026, due 31/10/2026.
- **BIL-02** Example: start 31/01/2027, 3 months → `end_date` 29/04/2027 (31/04 does not exist, so 30/04 − 1); periods 31/01–31/01 (partial: 1 of 31 days), February, March, 01/04–29/04 (partial: 29 of 30 days). With rent 2.500.000: period 1 rent 80.645, periods 2 and 3 rent 2.500.000, period 4 rent 2.416.667.
- **BIL-03** A renewal's `start_date` = old `end_date` + 1, so the calendar months continue without a gap; when the old contract ended inside a month, the renewal starts with the rest of that month (partial).
- **BIL-22** Example: start 20/03/2027, 6 months → `end_date` 19/09/2027; periods 20/03–31/03 (12 of 31 days: rent 967.742), April to August (five full months), 01/09–19/09 (19 of 30 days: rent 1.583.333). A move-in on the 1st has no partial first month.
- **BIL-04** No period exists beyond `end_date` (D-13).

## Cron

The job runs at 00:05 daily **and at app start** (D-21, owner 04/11/2026): the server can be off at 00:05 (deploy, restart, crash), and a run that only looks at "today" would lose that day's invoices and renewals for good.

- **BIL-05** For each `ACTIVE` contract with some k in 1..N where **today − 7 days ≤ p(k) ≤ today** and no non-cancelled MONTHLY invoice for k → create `DRAFT` (period_no = k, the dates of period k, never the run date). Idempotent through the partial unique index; a unique violation from a parallel run counts as "already created", not as an error.
  - A period whose billing date p(k) is more than 7 days ago and still has no invoice is **not** created automatically. The job's summary line counts these periods, and they show in "Việc hôm nay" (NOTI-06), where staff create them with "Tạo hóa đơn kỳ này" (BIL-21).
- **BIL-06** Then, in the same run, for each signed renewal whose `start_date` ≤ today and whose previous contract is still `ACTIVE`: old contract → `ENDED` (`ended_at`), new → `ACTIVE` (`moved_in_at` = its `start_date`), copy occupants and active vehicles (CON-18, CON-19). No 7-day limit here, so a missed switch, or a renewal signed after its `start_date`, is switched by the next run [ASSUMPTION A-09]. BIL-05 runs first, so the old contract's period-N DRAFT exists before it ends.
- **BIL-21** "Tạo hóa đơn kỳ này" (owner 04/11/2026, Q-05): `POST /contracts/:id/monthly-invoices` `{ periodNo }` by staff in scope creates the `DRAFT` for a period that BIL-05 did not create. Allowed only when:
  - the contract is `ACTIVE`, or `ENDED` without a settlement (ended by a renewal switch, BIL-06);
  - 1 ≤ `periodNo` ≤ N and p(`periodNo`) ≤ today;
  - the period has no non-cancelled MONTHLY invoice.

  Otherwise `CONFLICT_STATE` (`VALIDATION_FAILED` for a `periodNo` outside 1..N). The DRAFT is the same as BIL-05's (dates of period k, never today's) and then follows the normal readings and issue flow (MTR-09, BIL-08). Audit log `invoice.create_missed` (G-10).
  - [ASSUMPTION A-10] Settlement (BIL-13) of a contract that still has such a missing period returns `CONFLICT_STATE` with "Còn kỳ chưa có hóa đơn, hãy tạo hóa đơn kỳ đó trước", because BIL-14 only charges period j, so an earlier missing period would never be charged.

## Calculation (issue)

For MONTHLY period k, rates = approved plans effective at `period_start` (RATE-04). In a partial contract month (D-41) every fixed line (rent, ROOM, PERSON and VEHICLE services) keeps its quantity and uses the prorated unit price; electricity and water use the readings as usual. Owner 22/11/2026 (D-44 (13)): PER_PERSON water is **not** prorated in a partial month: occupants × the full water price.

Owner 20/11/2026 revises the old rule that additions only count from the next period: a newly added occupant's selected PERSON fees are included in the calendar month they move in, calculated when that month is closed. Rent, room electricity and ROOM-unit services remain room-based; adding an occupant never multiplies them. Parking requires an actual registered vehicle with its VEHICLE service, not a vehicle inferred from a new person; added parking charges belong to its registration month. Water mode PER_PERSON/PER_M3 is unchanged.

**Q-P3-18 answered by the owner 20/11/2026:** count each additional occupant as one unit for the applicable per-person fees in the calendar month of their move_in_date, regardless of entry day. No extra day-proration based on that person's entry date. For a contract covering all of November and a PERSON fee of 30.000 đ/month, entry on 16/11 or 29/11 adds 30.000 đ for November. The month comes from move_in_date, not the submission date. Include a person who enters and leaves within that same month; counting only the last day's headcount or the old period_start snapshot would omit them.

D-41 still applies to the contract's own partial first/last months; do not prorate a second time by the individual person's date or infer that the owner abolished contract-level proration. This answer does not settle vehicle-specific mid-month proration, infer a vehicle per person, change the building's water mode or authorize recalculating issued/paid invoices. The monthly invoice engine remains Phase 4; BE-P3-23 stores the occupant and move-in date needed for it.

For occupants already present at period_start, retain the existing departure boundary: counted when move_out_date is null or strictly greater than period_start. New people count in their entry month as above; the added-person answer does not change their departure-proration/refund rule.

**Q-P3-20 answered by the owner 20/11/2026:** parking is charged by calendar month. Stopping a registered vehicle during November still charges November; from December it is not charged. Include vehicle registration/removal history intersecting the billing month, including vehicles marked inactive by month-end; do not select is_active=true alone. A removal recorded by the end of the prior month excludes it from the following month. This does not change D-41 for the contract's own partial months, approve a separate vehicle-entry day-proration formula or authorize recalculating issued/paid invoices. BE-P3-25 stores registration/removal dates; calculation remains Phase 4.

| Line kind | Quantity | Unit price |
|---|---|---|
| `RENT` "Tiền phòng {dd/mm}–{dd/mm}" | 1 | `contracts.rent` |
| `ELECTRIC` (one line per tier, [12-pricing.md](12-pricing.md#electric-tier-calculation)) | kWh in tier | tier price |
| `WATER` PER_M3 | m³ (MTR-05) | water price |
| `WATER` PER_PERSON | occupants | water price |
| `SERVICE` unit ROOM (each chosen service) | 1 | service price |
| `SERVICE` unit PERSON (each chosen service) | occupants | service price |
| `PARKING` per VEHICLE service | vehicles of that service | service price |

- **BIL-07** `amount = quantity × unit_price` per line; `total` = sum. `meta` stores opening/closing reading ids, values and dates. Owner 20/11/2026 (MTR-02): the first period's electric and PER_M3 water consumption starts at this contract's actual move-in baseline; subsequent periods start at this contract's preceding closing reading. The previous tenant's final reading closes their utilities and stays in their history; it is not the new tenant's baseline. Vacancy consumption between tenants is not assigned to either tenant. Distinct handover and month-end readings may share a date. PER_PERSON water continues to use occupants, not consumption (MTR-06).
- **BIL-08** <a id="issue"></a>Issue: status `UNPAID`, `issue_date` = today, `due_date` = the last day of the month the invoice belongs to after its period (the billing month); unpaid after the last day of that month it is overdue (D-40). Managers enter the readings so that invoices go out on the 1st. Notify tenant (in-app + email) with VietQR.
- **BIL-09** Worked example (must be a unit test; the BIL-01 contract, so no partial month): start 01/09/2026, rent 2.500.000, readings electric 1.284 → 1.368, water 6 m³ PER_M3 at 15.000, Wifi (ROOM) 100.000, Rác (PERSON) 30.000 × 2, 1 motorbike 100.000, seed tiers → 2.500.000 + 150.000 + 119.000 + 90.000 + 100.000 + 60.000 + 100.000 = **3.119.000 đ**, issued 01/10/2026, due 31/10/2026.

## VietQR

- **BIL-10** `GET /me/invoices/:id` and staff invoice detail include `vietqr = { bankBin, accountNo, accountName, amount: total, content: "TT{id}" }` from `settings.bank_account`, and `qrImageUrl` built as `https://img.vietqr.io/image/{bankBin}-{accountNo}-compact2.png?amount={total}&addInfo=TT{id}&accountName={urlencoded}`. Only for UNPAID invoices.

## Manual payment

- **BIL-11** `POST /invoices/:id/payment` `{ method: CASH|BANK_TRANSFER|CARD|OTHER, paidAt?, note? }` by staff in scope. Amount is always the invoice total (no partial, D-10). DB trigger sets PAID. Errors: `INVOICE_NOT_UNPAID`, `PAYMENT_AMOUNT_MISMATCH`. Notify tenant "Đã nhận tiền". Phase 3 (D-35) builds this route for `DEPOSIT` invoices only; any other type returns `CONFLICT_STATE` until Phase 4, and the tenant notice waits for the inbox of Phase 5.

## Reissue

- **BIL-12** <a id="reissue"></a>`POST /invoices/:id/reissue` `{ reason, corrections }` on DRAFT or UNPAID only: cancel it (`cancel_reason`), apply reading corrections (only that period's readings, meter replacement fields included; D-44), create a new invoice for the same period with `replaces_id`, recompute, issue. PAID invoices cannot be reissued.

## Settlement

<a id="settlement"></a>`POST /contracts/:id/settlement?dryRun=true|false` `{ moveOutDate, finalReadings: { electric, water, photos? }, damages, depositForfeit, note }` (photos optional, D-38). `dryRun=true` returns the breakdown without writing. Allowed on ACTIVE contracts. (HOLD cancellation uses CON-12.)

- **BIL-13** j = the period containing `moveOutDate` (j = N if `moveOutDate` ≥ `end_date`).
- **BIL-14** `last_period_amount` = everything not yet issued up to `moveOutDate`, never charging anything twice:
  - if period j has no issued MONTHLY invoice: rent of period j in full (D-14) + services and parking of period j in full [ASSUMPTION A-01];
  - utilities from the last issued closing reading to the final reading (tiers on that kWh), if the final reading is later;
  - any DRAFT (period j or earlier) is cancelled with reason "Gộp vào thanh lý" and its charges are computed here instead.
  Example: an expired contract already invoiced for period N, settled 10 days later → only utilities of those 10 days.
- **BIL-15** `remaining_rent` = the rent of every period after j (a partial last period prorated, D-41) if `moveOutDate` < `end_date`, else 0. Utilities and services are not charged for those periods [ASSUMPTION A-01].
- **BIL-16** `previous_debt` = sum of UNPAID invoice totals of this contract (deposit invoice excluded); those invoices become `SETTLED` with `settlement_id`.
- **BIL-17** `deposit` = the deposit actually paid on this contract chain (renewals carry it). `net = deposit − last_period_amount − remaining_rent − previous_debt − damages − deposit_forfeit` (DB CHECK).
- **BIL-18** net < 0 → `FINAL` invoice, UNPAID, due today + 7 days (D-44), lines: the period-j lines, one `REMAINING_RENT` line per remaining period (qty 1, unit = that period's rent), one `PREVIOUS_DEBT` per settled invoice, `DAMAGE`, `DEPOSIT_FORFEIT`, and `DEPOSIT_OFFSET` (qty 1, unit −deposit). Sum = −net. net ≥ 0 → no invoice; refund = net, staff records `refund_paid_at` when paid out.
- **BIL-19** Same transaction: final readings, settlement row, contract `ENDED` + `ended_at`, occupants `move_out_date`, vehicles inactive, room back to "Trống", tenant account deactivated if no other HOLD/ACTIVE contract (sessions revoked), audit log, tenant notification.
- **BIL-20** Stays after `end_date` are not charged automatically [ASSUMPTION A-06]; staff may add them as damages with a note.

## API

| Method | Path | Who |
|---|---|---|
| GET | `/invoices?buildingId&status&type&overdue&period` | staff |
| GET | `/invoices/:id` | staff |
| POST | `/invoices/:id/issue` · `/remind` · `/payment` · `/reissue` | staff |
| POST | `/contracts/:id/monthly-invoices` `{ periodNo }` | staff (BIL-21) |
| POST | `/contracts/:id/settlement?dryRun=` | staff |
| POST | `/settlements/:id/refund-paid` | staff |
| GET | `/me/invoices` · `/me/invoices/:id` | tenant (DRAFT hidden) |

## Acceptance

- [ ] BIL-09 example computes 3.119.000 đ with the listed lines.
- [ ] Period dates and amounts for BIL-01, BIL-02 and BIL-22 match exactly (unit test on the date helper, including leap year 2028).
- [ ] Cron run twice on the same day creates one DRAFT.
- [ ] BIL-05 catch-up: server off from 23:50 30/09 to 01:00 01/10/2026 → the start-up run creates the period-1 DRAFT of the BIL-01 contract with period 01/09–30/09.
- [ ] BIL-05 catch-up: no run on 01/10 and 02/10 → the run on 03/10 creates that DRAFT once; running again creates nothing.
- [ ] BIL-05 limit: a period whose billing date was 8 days ago with no invoice is not created; it is counted in the summary line and shown in "Việc hôm nay".
- [ ] BIL-21: server off from 30/09 to 11/10/2026 → no automatic DRAFT for period 1 of the BIL-01 contract; "Việc hôm nay" shows it red; "Tạo hóa đơn kỳ này" creates it with period 01/09–30/09; pressing again → `CONFLICT_STATE`.
- [ ] BIL-21: `periodNo` whose billing date is in the future → `CONFLICT_STATE`; a manager of another building → `OUT_OF_SCOPE`.
- [ ] A-10: settlement of a contract with a missing period → `CONFLICT_STATE`; after the button creates it, settlement works.
- [ ] BIL-06 catch-up: a renewal whose switch day was missed is switched by the next run, after the old contract's period-N DRAFT was created.
- [ ] Rate change effective 20/10 leaves the October period (01/10–31/10) on the old rate; November uses the new one (D-09).
- [ ] Occupant added on 20/10 is first counted in the period starting 01/11.
- [ ] A move-in on 20/03 is charged 12/31 of the rent and of each fixed service in its first invoice, issued 01/04 (D-41).
- [ ] A monthly invoice unpaid at the end of its due date shows "Quá hạn" in red to the tenant and the responsible manager from the following day (Asia/Ho_Chi_Minh) (D-40).
- [ ] Early move-out on 25/11/2026 for BIL-01 contract (deposit 2.500.000): j = 3 (November), remaining_rent = 3 × 2.500.000 (December to February), net negative → FINAL invoice total = −net.
- [ ] Reissue keeps exactly one non-cancelled invoice for the period.

BIL-06 clarification (22/11/2026): keep the old contract ACTIVE and show a staff task while the final monthly invoice or handover readings are missing. Switch on the next run once both exist, including when the final invoice is unpaid. Owner 22/11/2026: the handover readings are electricity (kWh) and water (m³) in every building, also under PER_PERSON, where water is recorded but not billed (MTR-06).
