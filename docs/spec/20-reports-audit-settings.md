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

- **AUD-01** Write `audit_logs` (actor, action, entity, entity_id, before, after, ip) for: price propose/approve/reject; contract create/sign/move-in/cancel/renew/settle; payment record/assign/refund; invoice issue/reissue/cancel; building manager change; manager create/deactivate; password reset by staff; CCCD photo view; settings change.
- **AUD-02** Action names: `<entity>.<verb>`, e.g. `invoice.reissue`, `price.approve`, `occupant.view_id`.
- **AUD-03** Webhook and cron actions use `actor_id = null`.
- **AUD-04** Boss reads it at "Nhật ký thao tác": `GET /audit-logs?entity&entityId&actorId&from&to` **Boss**.

## Settings

Key/value in `settings`, edited by Boss (`GET/PATCH /settings` **Boss**). No secrets here — secrets are env vars.

| Key | Value |
|---|---|
| `bank_account` | `{ bankBin, bankName, accountNo, accountName }` for VietQR |
| `webhook` | `{ provider: "SEPAY" | "CASSO", enabled }` |
| `contract_template` | template text with placeholders `{{tenant.fullName}}`, `{{room.code}}`, `{{contract.rent}}`… |
| `email_templates` | `{ invoiceIssued, invoiceDue, invoiceOverdue, contractExpiring, passwordReset }` |
| `default_contact` | Boss contact shown when a building has no manager |

Env vars (never committed, see root `.gitignore`): `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CCCD_KEY`, `BANK_WEBHOOK_SECRET`, `CLOUDINARY_URL`, `MAIL_*`.
