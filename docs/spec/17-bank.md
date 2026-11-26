# 17 · Bank webhook

Module: `bank`. Tables: `bank_transactions`, `payments`, `invoices`. Production provider: SePay, receiving bank: MB Bank (D-48). The owner configures the receiving account in settings.bank_account during setup.

## Adapter

```ts
interface BankWebhookAdapter {
  provider: 'SEPAY' | 'CASSO';
  verify(req: RawRequest): boolean;              // signature / API key from env BANK_WEBHOOK_SECRET
  parse(body: unknown): IncomingTx[];            // one webhook may carry several transactions
}
type IncomingTx = { providerTxId: string; amount: number; content: string; accountNumber: string; receivedAt: Date; raw: unknown };
```

Process credits under BANK-07a. Ignore debits. Keep a credit to a different receiving account UNMATCHED for the Boss.

## Rules

- **BANK-01** `POST /webhooks/bank`: `verify` fails → 401 `WEBHOOK_SIGNATURE_INVALID`, nothing stored. After a durable result, including an unmatched or duplicate credit, acknowledge with HTTP 200 and the provider response documented below. A failed database write must remain retryable.
- **BANK-02** Each transaction is processed in its own DB transaction. Insert `bank_transactions` first; a unique violation on (provider, provider_tx_id) means already processed → skip.
- **BANK-03** Matching: find `/TT(\d+)/i` in `content` → invoice id. Match only if that invoice exists, is `UNPAID`, and `total = amount`. Then status `MATCHED`, `invoice_id` set, insert `payments` (`source = WEBHOOK`, `method = BANK_TRANSFER`, `bank_transaction_id`), which sets the invoice PAID (trigger). Notify tenant "Đã nhận tiền".
- **BANK-04** Anything else → status `UNMATCHED` (no code, unknown id, wrong amount, invoice already PAID or CANCELLED). These appear on Boss's "Giao dịch ngân hàng" page.
- **BANK-05** Boss assigns an UNMATCHED transaction to an invoice: invoice must be UNPAID and `total = amount` → status `ASSIGNED`, payment `source = ASSIGNED`, `recorded_by_id` = Boss. Otherwise Boss marks it `REFUNDED` with a note after refunding outside the system.
- **BANK-06** Payment issue flow ([18-requests.md](18-requests.md)): tenant reports → manager checks → escalates; Boss sees escalated issues next to unmatched transactions and resolves them by BANK-05.
- **BANK-07** Raw payloads are stored in `raw` for audit; secrets are never stored in DB (`BANK_WEBHOOK_SECRET` in env).
- **BANK-07a** Phase 4 answers (owner 22/11/2026, Q-P4-28..35): the Phase 4 test adapter authenticates with header `X-Webhook-Secret` (constant-time compare with `BANK_WEBHOOK_SECRET`) and stores rows as `SEPAY`; a timestamp without offset is Asia/Ho_Chi_Minh. A credit to another account than `settings.bank_account` is kept `UNMATCHED` with a note (not dropped); a missing or invalid `bank_account` or an empty secret answers 503 `WEBHOOK_NOT_CONFIGURED` and stores nothing. An unmatched row with a `TT` code carries the reason in `note` (wrong amount, already paid, not payable, unknown invoice). A match also writes the staff inbox row (Q-P4-31); a deposit paid by transfer triggers nothing else (Q-P4-32). Only `UNMATCHED` rows can be marked `REFUNDED` (Q-P4-34).
- **BANK-08** Q-04, verified 26/11/2026: SePay retries failed webhook deliveries and exposes a transaction history API. Recover missed transfers using the existing BANK-02..04 rules. Phase 4 shipped without a reconciliation job (D-44). The GL-07 adapter covers webhook delivery; automatic reconciliation still needs implementation.

### SePay integration for MB Bank (GL-06, approved 26/11/2026)

- Configure the linked MB Bank account to send credit events to `POST /api/v1/webhooks/bank`, including credits without a payment code so BANK-04 can surface them.
- Approved authentication: HMAC-SHA256 with the existing `BANK_WEBHOOK_SECRET`. Verify `X-SePay-Signature` against the HMAC of the ASCII timestamp, one period and the original request bytes. The signature uses the `sha256=` prefix. Read Unix seconds from `X-SePay-Timestamp`, compare signatures in constant time, and use the documented five-minute tolerance. Reject invalid authentication under BANK-01. [Webhook authentication](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc)
- Each JSON object describes one transfer. Map integer `id` to the string provider transaction ID, `transferAmount` to integer đồng, `transactionDate` to a business timestamp in Asia/Ho_Chi_Minh, and preserve `accountNumber`, `content` and the raw payload. Use `transferType` to distinguish credits and debits. Match TT codes in the original content even when SePay's extracted code is null. For a processed or duplicate event, return HTTP 200 and top-level JSON `{"success":true}` within 30 seconds. A persistence failure must remain retryable. [Webhook payload and acknowledgement](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook)
- Connection failures trigger retries automatically. Enable **Tự động gửi lại khi server trả lỗi** in SePay so a non-2xx response (including a persistence failure) also triggers retries. After the initial delivery, SePay makes up to seven further attempts. The waits in minutes are 1, 1, 2, 3, 5, 8 and 13 (about 33 minutes total). Repeat delivery uses the same webhook ID. [Delivery retries](https://developer.sepay.vn/vi/sepay-webhooks/xu-ly-loi)
- For outages extending beyond retries, the history endpoint is `GET https://userapi.sepay.vn/v2/transactions` with a separate bearer API token. Query by date range and bank account, consuming every page. The v2 ID is a UUID, while the webhook ID is numeric. Before automatically importing a missing payment, verify a common identifier for the same transfer across both sources; an ambiguous reference requires manual reconciliation. Two different identifiers for one payment must never produce two postings. [Reconciliation](https://developer.sepay.vn/vi/sepay-webhooks/doi-soat-giao-dich) · [Transaction list](https://developer.sepay.vn/vi/sepay-api/v2/giao-dich/danh-sach)

## API

| Method | Path | Who |
|---|---|---|
| POST | `/webhooks/bank` | provider |
| GET | `/bank-transactions?status&from&to` | **Boss** |
| POST | `/bank-transactions/:id/assign` `{ invoiceId }` | **Boss** |
| POST | `/bank-transactions/:id/mark-refunded` `{ note }` | **Boss** |

## Acceptance

- [x] Content "TT1523 P203" with exact total → invoice 1523 PAID, tenant notified.
- [x] Same webhook delivered twice → one transaction row, one payment.
- [x] Amount 1 đ less → UNMATCHED, invoice stays UNPAID.
- [x] Second transfer for an already-paid invoice → UNMATCHED (Boss refunds).
- [x] Bad signature → 401, no row.
