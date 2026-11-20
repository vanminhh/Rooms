# 20 · Reports, audit log, settings

Modules: `reports`, `audit`, `settings`. Tables: `payments`, `settlements`, `requests`, `contracts`, `audit_logs`, `settings`.

## Reports

- **RPT-01** Revenue of a month (by `payments.paid_at` in Asia/Ho_Chi_Minh) = sum of payments for MONTHLY and FINAL invoices + for settlements created that month: the part of the deposit used (`deposit − max(net, 0)`). DEPOSIT invoices are not revenue (deposits held are a liability).
- **RPT-02** Outstanding = sum of UNPAID MONTHLY/FINAL invoice totals; overdue shown separately.
- **RPT-03** Costs of a month = sum of `requests.cost` for incidents RESOLVED that month. Profit = revenue − costs.
- **RPT-04** Occupancy = rooms "Đang thuê" / active rooms, per building and total.
- **RPT-05** Deposits held = sum of paid deposits on HOLD/ACTIVE contracts.
- **RPT-06** Managers see their buildings; Boss sees all and a per-building comparison.

API: `GET /reports/revenue?buildingId&from&to` (monthly series) · `GET /reports/occupancy?buildingId`.

## Audit log

- **AUD-01** Write `audit_logs` (actor, action, entity, entity_id, before, after, ip) for: price propose/approve/reject; contract create/sign/move-in/cancel/renew/settle; payment record/assign/refund; invoice issue/reissue/cancel, create of a missed period (BIL-21); building manager change; manager create/deactivate; password reset by staff; CCCD photo view; signed contract scan view (`contract.view_scan`, CON-16); settings change; a guest account becoming a tenant (`user.role_change`, CON-07); hiding a repair review (`request.review_hide`, REQ-09).
- **AUD-02** Action names: `<entity>.<verb>`, e.g. `invoice.reissue`, `price.approve`, `occupant.view_id`.
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

CON-22 placeholders are limited to `contract.code`, `contract.startDate`, `contract.endDate`, `contract.termMonths`, `contract.rent`, `contract.deposit`, `contract.terms`, `building.name`, `building.code`, `building.address`, `building.ward`, `building.district`, `room.code`, `tenant.fullName`, `tenant.phone`, `tenant.dateOfBirth`, `tenant.idNumberLast4`. Tenant values come from the signer occupant snapshot, never a later profile name; CCCD is only its stored last four digits. Unknown/malformed placeholders or invalid settings fail with a controlled error. Rendering performs one plain-text substitution pass; inserted values are not interpreted as placeholders or HTML. Print-page consumers render content as text, not raw HTML.

When the setting is absent, the API uses its built-in draft. The dev seed adds a draft without overwriting an existing template; no seed run is required for printing. Draft output has `isDraft: true` and starts with `BẢN NHÁP – chưa dùng để ký`. A plain text setting remains draft; only an explicitly supplied `{ content, isDraft: false }` marks an approved template after the owner provides it (Q-15).

Env vars (never committed, see root `.gitignore`): `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CCCD_KEY`, `BANK_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `MAIL_*` (also the mail provider's key, Q-14; filled by the owner).
