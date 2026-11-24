# 20 · Reports, audit log, settings

Modules: `reports`, `audit`, `settings`. Tables: `payments`, `settlements`, `requests`, `contracts`, `audit_logs`, `settings`.

## Reports

- **RPT-01** Revenue of a month (by `payments.paid_at` in Asia/Ho_Chi_Minh) = sum of payments for MONTHLY and FINAL invoices + for settlements created that month: the part of the deposit used (`deposit − max(net, 0)`). DEPOSIT invoices are not revenue (deposits held are a liability).
- **RPT-02** Outstanding = sum of UNPAID MONTHLY/FINAL invoice totals; overdue shown separately.
- **RPT-03** Costs of a month = sum of `requests.cost` for incidents RESOLVED that month. Profit = revenue − costs.
- **RPT-04** Occupancy = rooms "Đang thuê" / active rooms, per building and total.
- **RPT-05** Deposits held = sum of paid deposits on HOLD/ACTIVE contracts.
- **RPT-06** Managers see their buildings; Boss sees all and a per-building comparison.

The Boss monthly summary lists overdue unpaid invoices for the selected billing month in red alongside the revenue total. Outstanding amounts are tracked separately from payments under RPT-01. The summary can be viewed while invoices remain outstanding.

Boss actions on an overdue monthly invoice (owner decision, 22/11/2026):

| Action | Effect |
|---|---|
| Sửa | Reissue under BIL-12. Use the corrected amount for the replacement and retain the original and adjustment history. |
| Xóa | Cancel with a reason. Retain the cancelled invoice in history and remove its amount from outstanding debt. |
| Cất | Hide the invoice from the Boss's main list. Include its amount in outstanding and overdue totals. The tenant and responsible manager continue to see the red overdue warning while the invoice is unpaid. |

Boss uses `POST /invoices/:id/archive` or `POST /invoices/:id/cancel` with `{ reason }` for an overdue unpaid monthly invoice. Repeating an archive preserves the original audit entry. Exact-amount lookups for bank reconciliation include archived debt.

Acceptance example: with 80 million VND collected and one overdue invoice of 5 million VND, archiving the invoice leaves the summary at 80 million collected and 5 million overdue. Cancelling it with a reason leaves 80 million collected and zero overdue.

API: `GET /reports/revenue?buildingId&from&to` (monthly series) · `GET /reports/occupancy?buildingId`.

## Audit log

- **AUD-01** Write `audit_logs` (actor, action, entity, entity_id, before, after, ip) for: price propose/approve/reject; contract create/sign/move-in/cancel/renew/settle; payment record/assign/refund; invoice issue/reissue/cancel, create of a missed period (BIL-21); building manager change; manager create/deactivate; password reset by staff; CCCD photo view; signed contract scan view (`contract.view_scan`, CON-16); settings change; a guest account becoming a tenant (`user.role_change`, CON-07); hiding a repair review (`request.review_hide`, REQ-09).
- **AUD-02** Action names: `<entity>.<verb>`, e.g. `invoice.reissue`, `price.approve`, `occupant.view_id`.
- **D-07 / BE-P3-26** Selected-service changes write `contract.update_services`, entity `contract`, with full before/after `serviceIds` sets in the same transaction as membership replacement; unchanged selections do not create a change audit. Current membership links may be replaced, while master services, rates, invoices and past audit rows are retained.
- **AUD-03** Webhook and cron actions use `actor_id = null`.
- **AUD-04** Boss reads it at "Nhật ký thao tác": `GET /audit-logs?entity&entityId&actorId&from&to` **Boss**.

## Settings

Key/value in `settings`, edited by Boss (`GET/PATCH /settings` **Boss**). No secrets here — secrets are env vars.

| Key | Value |
|---|---|
| `bank_account` | `{ bankBin, bankName, accountNo, accountName }` for VietQR |
| `webhook` | `{ provider: "SEPAY" | "CASSO", enabled }` |
| `contract_template` | Plain template text (treated as draft while Q-15 is open), or `{ content: string, isDraft: boolean }` with an explicit draft flag; placeholders `{{tenant.fullName}}`, `{{room.code}}`, `{{contract.rent}}`… |
| `email_templates` | `{ invoiceIssued, invoiceDue, invoiceOverdue, contractExpiring, passwordReset }` + `emailCode` (`vi`, `en`), `viewingNew` (to staff, `vi`), `readingsLate` (to Boss, `vi`, NOTI-10), `viewingConfirmed` (to the guest, `vi`, `en`) (AUTH-13, NOTI-08, LOC-06) |
| `default_contact` | Boss contact shown when a building has no manager |

The Boss editor replaces one setting per PATCH using `{ key, value }`. The bank account and public contact use the fields above. A contract edit accepts draft text or `{ content, isDraft: true }`. Email overrides use `{ subject, text }` per kind and locale; omitted translations use shipped defaults. Invalid legacy translation branches are omitted on read. Supported runtime kinds are `emailCode`, `passwordReset`, `viewingNew`, `viewingConfirmed`, `invoiceIssued`, `invoiceDueTomorrow`, `invoiceOverdue`, `contractExpiringTenant`, `contractExpiringStaff`, `lateReadings`, `invoiceReminder` and `paymentReceived`. The webhook status is read-only. Settings audit entries use entity `setting`, entity ID 0 and the setting key in the snapshot (settings have string primary keys).

`GET /me/consumption?periods=6&contractId=...` returns up to six issued monthly periods in chronological order. The default is the tenant's latest ACTIVE contract. An explicit ID can select an earlier contract belonging to the caller. Each item contains `periodNo`, `periodStart`, `periodEnd`, `electricKwh` and `waterM3`. Missing measurements are null. A measured zero remains zero, and per-person water fees are never interpreted as cubic metres.

CON-22 placeholders are limited to `contract.code`, `contract.startDate`, `contract.endDate`, `contract.termMonths`, `contract.rent`, `contract.deposit`, `contract.terms`, `building.name`, `building.code`, `building.address`, `building.ward`, `building.district`, `room.code`, `tenant.fullName`, `tenant.phone`, `tenant.dateOfBirth`, `tenant.idNumberLast4`. Tenant values come from the signer occupant snapshot, never a later profile name; CCCD is only its stored last four digits. Unknown/malformed placeholders or invalid settings fail with a controlled error. Rendering performs one plain-text substitution pass; inserted values are not interpreted as placeholders or HTML. Print-page consumers render content as text, not raw HTML.

When the setting is absent, the API uses its built-in draft. The dev seed adds a draft without overwriting an existing template; no seed run is required for printing. Draft output has `isDraft: true` and starts with `BẢN NHÁP – chưa dùng để ký`. A plain text setting remains draft; only an explicitly supplied `{ content, isDraft: false }` marks an approved template after the owner provides it (Q-15).

Env vars (never committed, see root `.gitignore`): `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CCCD_KEY`, `BANK_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `MAIL_*` (also the mail provider's key, Q-14; filled by the owner).
