# 15 · Meter readings (chốt chỉ số)

Module: `meters`. Table: `meter_readings`.

## Rules

- **MTR-01** Every room has its own electric and water meter (D-06). Readings belong to the room (`room_id`), with `contract_id` recorded for reference.
- **MTR-02** One reading per (room, kind, day). A move-out reading and the next tenant's move-in reading on the same day are the same row.
- **MTR-03** `value` ≥ previous reading of the same room and kind (`METER_VALUE_DECREASED`), unless the reading is a meter replacement.
- **MTR-04** Meter replacement = a reading with `is_meter_replaced = true`, `old_meter_final` = last value on the old meter, `value` = first value on the new meter, on the replacement day.
- **MTR-05** Consumption between two readings `a` (earlier) and `b` (later): if `b.is_meter_replaced` then `b.old_meter_final − a.value` plus 0 for the new meter at that instant; otherwise `b.value − a.value`. Over a period, sum consecutive pairs from the period's opening reading to its closing reading.
- **MTR-06** Water readings are taken for every room even when `water_mode = PER_PERSON` (history, leak detection) but are not billed in that mode.
- **MTR-07** A photo SHOULD be attached; it is shown to the tenant on the invoice.
- **MTR-08** Abnormal consumption warning [ASSUMPTION A-04]: period consumption > 2× the average of the previous 3 periods. The invoice then waits for the manager to press "Phát hành" instead of auto-issuing.

## "Chốt chỉ số" list

- **MTR-09** `GET /meter-readings/due` returns, in scope, every `DRAFT` monthly invoice (created by cron on its billing date) with room, tenant, previous readings and the billing date. Sorted: overdue drafts first.
- **MTR-10** The closing reading for period k MUST have `read_on` ≥ D(k) − 2 days and SHOULD be on D(k). It becomes the opening reading of period k+1.
- **MTR-11** `POST /meter-readings` accepts a batch `[{ roomId, kind, value, readOn, photoUrl, isMeterReplaced?, oldMeterFinal?, note? }]`. Each item is validated independently; the response lists per-item success or error. When a DRAFT gets all readings it needs (electric; water only if PER_M3), BE computes it and issues it ([16-billing.md](16-billing.md#issue)) unless MTR-08 applies.
- **MTR-12** Editing a reading is allowed only while no issued invoice uses it. After issue: cancel and reissue the invoice ([16-billing.md](16-billing.md#reissue)).

## Acceptance

- [ ] Reading 1.250 after 1.284 without replacement → `METER_VALUE_DECREASED`.
- [ ] Replacement on 20/09 (old final 1.300, new start 0), closing 40 on 15/10, opening 1.284 → 16 + 40 = 56 kWh.
- [ ] Submitting the electric reading for a PER_PERSON building issues the invoice; for a PER_M3 building it waits for the water reading.
