# 17 · Bank webhook

Module: `bank`. Tables: `bank_transactions`, `payments`, `invoices`. Provider: SePay or Casso ([OPEN] Q-03) behind one adapter.

## Adapter

```ts
interface BankWebhookAdapter {
  provider: 'SEPAY' | 'CASSO';
  verify(req: RawRequest): boolean;              // signature / API key from env BANK_WEBHOOK_SECRET
  parse(body: unknown): IncomingTx[];            // one webhook may carry several transactions
}
type IncomingTx = { providerTxId: string; amount: number; content: string; accountNumber: string; receivedAt: Date; raw: unknown };
```

Only incoming (credit) transactions to the account in `settings.bank_account` are processed; others are ignored.

## Rules

- **BANK-01** `POST /webhooks/bank`: `verify` fails → 401 `WEBHOOK_SIGNATURE_INVALID`, nothing stored. Otherwise always answer 200 quickly, even when a transaction is unmatched, so the provider does not retry.
- **BANK-02** Each transaction is processed in its own DB transaction. Insert `bank_transactions` first; a unique violation on (provider, provider_tx_id) means already processed → skip.
- **BANK-03** Matching: find `/TT(\d+)/i` in `content` → invoice id. Match only if that invoice exists, is `UNPAID`, and `total = amount`. Then status `MATCHED`, `invoice_id` set, insert `payments` (`source = WEBHOOK`, `method = BANK_TRANSFER`, `bank_transaction_id`), which sets the invoice PAID (trigger). Notify tenant "Đã nhận tiền".
- **BANK-04** Anything else → status `UNMATCHED` (no code, unknown id, wrong amount, invoice already PAID or CANCELLED). These appear on Boss's "Giao dịch ngân hàng" page.
- **BANK-05** Boss assigns an UNMATCHED transaction to an invoice: invoice must be UNPAID and `total = amount` → status `ASSIGNED`, payment `source = ASSIGNED`, `recorded_by_id` = Boss. Otherwise Boss marks it `REFUNDED` with a note after refunding outside the system.
- **BANK-06** Payment issue flow ([18-requests.md](18-requests.md)): tenant reports → manager checks → escalates; Boss sees escalated issues next to unmatched transactions and resolves them by BANK-05.
- **BANK-07** Raw payloads are stored in `raw` for audit; secrets are never stored in DB (`BANK_WEBHOOK_SECRET` in env).

## API

| Method | Path | Who |
|---|---|---|
| POST | `/webhooks/bank` | provider |
| GET | `/bank-transactions?status&from&to` | **Boss** |
| POST | `/bank-transactions/:id/assign` `{ invoiceId }` | **Boss** |
| POST | `/bank-transactions/:id/mark-refunded` `{ note }` | **Boss** |

## Acceptance

- [ ] Content "TT1523 P203" with exact total → invoice 1523 PAID, tenant notified.
- [ ] Same webhook delivered twice → one transaction row, one payment.
- [ ] Amount 1 đ less → UNMATCHED, invoice stays UNPAID.
- [ ] Second transfer for an already-paid invoice → UNMATCHED (Boss refunds).
- [ ] Bad signature → 401, no row.
