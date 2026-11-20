# 15 · Meter readings (chốt chỉ số)

Module: `meters`. Table: `meter_readings`.

## Rules

- **MTR-01** Every room has its own electric and water meter (D-06). Readings belong to the room (`room_id`). Tenant readings also belong to the contract (`contract_id`); its opening baseline is identified separately from closing readings.
- **MTR-02** Changed by the owner 20/11/2026: record the previous tenant's final readings when they leave, to close their utilities. When the new tenant actually moves in, the manager must enter the current electric and water readings as that new contract's own opening baseline. Preserve both records even if they have the same date or value; a month-end closing may also be distinct from that contract's opening on the same day. Never overwrite or reassign the old tenant's reading. First-period consumption starts from the new tenant's opening; vacancy consumption between handovers is not billed to either tenant. Subsequent periods start from the same contract's preceding closing reading. BE-P3-20 schema has one opening per (contract, kind), ordinary daily readings scoped to their contract; unassigned readings retain room/kind/day uniqueness. Owner approved schema/migration and dev DB application, then accepted BE-P3-20 on 20/11; verification evidence is recorded in its checkpoint. Same-day replacement chronology that cannot be resolved from dates returns a controlled conflict under A-24.
- **MTR-03** `value` ≥ previous reading of the same room and kind (`METER_VALUE_DECREASED`), unless the reading is a meter replacement.
- **MTR-04** Meter replacement = a reading with `is_meter_replaced = true`, `old_meter_final` = last value on the old meter, `value` = first value on the new meter, on the replacement day.
- **MTR-05** Consumption between two readings `a` (earlier) and `b` (later): if `b.is_meter_replaced` then `b.old_meter_final − a.value` plus 0 for the new meter at that instant; otherwise `b.value − a.value`. Over a period, sum consecutive pairs from the period's opening reading to its closing reading.
- **MTR-06** Water readings are taken for every room even when `water_mode = PER_PERSON` (history, leak detection) but are not billed in that mode.
- **MTR-07** No photo is required (owner 16/11/2026, D-38): every meter is outside the room and the manager reads it himself; tenants never declare readings. A photo MAY be attached and is then shown to the tenant on the invoice.
- **MTR-08** Abnormal consumption warning [ASSUMPTION A-04]: period consumption > 2× the average of the previous 3 periods. The invoice then waits for the manager to press "Phát hành" instead of auto-issuing.

## "Chốt chỉ số" list

- **MTR-09** `GET /meter-readings/due` returns, in scope, every `DRAFT` monthly invoice (created by cron on its billing date, or by the catch-up run up to 7 days later, BIL-05) with room, tenant, previous readings and the billing date. Sorted: overdue drafts first. The list fills at 00:05 on the 1st (calendar months, D-40); readings taken in the last two days of the month are entered then with their real `read_on` (MTR-10), so the invoices go out on the 1st.
- **MTR-10** The closing reading for period k MUST have `read_on` ≥ p(k) − 2 days and SHOULD be on p(k), its billing date ([16-billing.md#periods](16-billing.md#periods)); with calendar-month billing the manager reads the whole building at the end of the month, in time for the invoices of the 1st (D-40). It becomes the opening value of period k+1 of the same contract. The first period instead starts at that contract's move-in baseline (MTR-02); a period-opening value is not a second move-in record. Do not automatically use another contract's or unassigned room readings as the tenant's opening baseline.
- **MTR-11** `POST /meter-readings` accepts a batch `[{ roomId, kind, value, readOn, photoUrl?, isMeterReplaced?, oldMeterFinal?, note? }]` (photo optional, D-38). Each item is validated independently; the response lists per-item success or error. When a DRAFT gets all readings it needs (electric; water only if PER_M3), BE computes it and issues it ([16-billing.md](16-billing.md#issue)) unless MTR-08 applies.
- **MTR-12** Editing a reading is allowed only while no issued invoice uses it. After issue: cancel and reissue the invoice ([16-billing.md](16-billing.md#reissue)).

## Acceptance

- [ ] Same room/day: old tenant closes electric at 1.284, new tenant opens at 1.290, new tenant closes at 1.350. All three records remain separate; new tenant's usage is 60 kWh, and the 6 kWh between handovers is not added to either tenant's invoice. Repeat for water under PER_M3; PER_PERSON retains readings for history.
- [ ] Reading 1.250 after 1.284 without replacement → `METER_VALUE_DECREASED`.
- [ ] Replacement on 20/09 (old final 1.300, new start 0), closing 40 on 15/10, opening 1.284 → 16 + 40 = 56 kWh.
- [ ] Submitting the electric reading for a PER_PERSON building issues the invoice; for a PER_M3 building it waits for the water reading.
