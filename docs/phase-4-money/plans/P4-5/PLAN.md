# P4-5 · Webhook ngân hàng và giao dịch (BE-P4-24..28)

Bản vẽ cho phiên chính. Không có mã nguồn trong file này. Đọc trước: `CLAUDE.md` (gốc), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`, `docs/phase-4-money/README.md` (D-44, đặc biệt Q-P4-2 adapter + adapter giả, Q-P4-3 không làm job đối chiếu, Q-P4-11 không có công tắc, Q-P4-27 thư nhân sự khi nhận tiền), `docs/phase-4-money/feature_p4-5-backend-bank.md`, `plans/PHASE/PLAN.md` §2/§3/§7/§8 và mục P4-5, `docs/spec/17-bank.md` (toàn bộ), `docs/spec/00-overview.md` (D-10, D-12, Q-03, Q-04, D-44), `docs/spec/01-architecture.md` (API-05, API-07, bảng mã lỗi), `docs/spec/19-notifications.md` (NOTI-04, NOTI-07, NOTI-11), `docs/spec/02-database.md` (`bank_transactions`, trigger `payments`), `docs/spec/20-reports-audit-settings.md` (AUD-01..03).

---

## 1. Mục tiêu và phạm vi

**Mục tiêu:** người thuê quét VietQR, chuyển tiền với nội dung `TT{id}`; hệ thống tự ghi nhận, hóa đơn thành PAID, người thuê và nhân sự tòa thấy "Đã nhận tiền" — không ai phải bấm gì. Tiền không khớp vẫn **không bao giờ mất dấu**: nó nằm ở trang "Giao dịch ngân hàng" của Boss để gán hoặc hoàn.

### Trong phạm vi

| Nhóm | Nội dung | Mã |
|---|---|---|
| Adapter | `BankWebhookAdapter` (interface) + **adapter giả** (`FAKE`, chỉ test và môi trường dev) + chỗ cắm adapter thật khi chốt Q-03 | BANK-01, Q-P4-2, D-44 |
| Kiểm chữ ký | So sánh **hằng thời gian** với `BANK_WEBHOOK_SECRET` (env, BANK-07); sai → 401 `WEBHOOK_SIGNATURE_INVALID`, không ghi dòng nào; secret trống → route 503, **app vẫn khởi động** | BANK-01, BANK-07 |
| Lọc giao dịch | Chỉ **ghi có** (`amount > 0`) vào đúng `accountNo` trong `settings.bank_account`; còn lại bỏ qua | 17-bank "Adapter" |
| Nhận webhook | `POST /webhooks/bank` (`@Public()`), mỗi giao dịch **một** `prisma.$transaction`, chèn `bank_transactions` trước, trùng UK `(provider, provider_tx_id)` → bỏ qua; một giao dịch lỗi không cuốn các giao dịch khác; luôn 200 nhanh khi chữ ký đúng | BANK-01, BANK-02 |
| Khớp | `/TT(\d+)/i` trong `content`; hóa đơn tồn tại + `UNPAID` + `total = amount` → `MATCHED` + `payments` (`source = WEBHOOK`, `method = BANK_TRANSFER`, `bank_transaction_id`) → trigger PAID + thông báo người thuê (dòng + mail) và thư nhân sự tòa; còn lại `UNMATCHED` | BANK-03, BANK-04, D-44/Q-P4-1, Q-P4-27 |
| Boss | `GET /bank-transactions?status&from&to`, `POST /bank-transactions/:id/assign`, `POST /bank-transactions/:id/mark-refunded` — chỉ BOSS, có audit | BANK-05, D-12, API-07, AUD-01 |

### Ngoài phạm vi

| Việc | Ở đâu |
|---|---|
| Job đối chiếu giao dịch bỏ sót (BANK-08) | **Hoãn** (D-44/Q-P4-3). Nêu lại ở checkpoint BE-P4-28 rằng chưa làm |
| Adapter thật SePay/Casso | Sau khi chủ dự án chốt Q-03; thêm một file adapter + một dòng trong bảng tra adapter, không đổi service |
| "Báo lỗi thanh toán" của người thuê (BANK-06, REQ-07) | Phase 5 |
| Công tắc bật/tắt webhook ở trang Cài đặt | Không làm (D-44/Q-P4-11): muốn tắt thì đổi `BANK_WEBHOOK_SECRET` |
| Trang `/ql/giao-dich` | FE-P4-07 (P4-7) |
| Thanh toán một phần, phí trả muộn | Không có (D-10) |

**Schema: không migration.** `bank_transactions`, `payments`, enum `BankProvider`/`BankTxStatus`/`PaymentSource`, UK `(provider, provider_tx_id)`, CHECK `bank_tx_amount`, CHECK `bank_tx_invoice_link`, CHECK `payments_source` và trigger `payments_invoice_check` đã có từ Phase 1. **Không dependency mới** (`node:crypto` đủ cho `timingSafeEqual` + `createHash`). Nếu phát hiện cần migration hoặc dependency thì **dừng và hỏi** chủ dự án (xem Q-P4-28, Q-P4-35).

---

## 2. Kiến trúc

### 2.1 Sơ đồ

```
 Nhà cung cấp (FAKE bây giờ · SEPAY/CASSO sau Q-03)
        │  POST /api/v1/webhooks/bank   (@Public(), không cookie, không Idempotency-Key — API-05 không áp dụng)
        ▼
 WebhookController (mỏng)                       BANK_WEBHOOK_SECRET trống
        │                                        └─► 503 (Q-P4-35), app vẫn khởi động bình thường
        ▼
 adapter.verify({ headers, body })  ──► sai ─► 401 WEBHOOK_SIGNATURE_INVALID, KHÔNG ghi dòng nào (BANK-01)
        │ đúng
        ▼
 adapter.parse(body) → IncomingTx[]  ──► lọc: amount > 0  và  accountNumber === settings.bank_account.accountNo
        │                                    (giao dịch khác → bỏ qua, chỉ log số lượng — 17-bank "Adapter")
        ▼  vòng lặp tuần tự, MỖI giao dịch một prisma.$transaction (BANK-02)
 ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
 │ 1. INSERT bank_transactions (status = UNMATCHED, invoice_id = null, raw = payload của        │
 │    giao dịch đó, KHÔNG có header/secret — BANK-07)                                           │
 │      └─ P2002 trên (provider, provider_tx_id) → ném ra ngoài, bắt ở vòng lặp → "đã xử lý",   │
 │         bỏ qua (webhook gửi lại là vô hại)                                                   │
 │ 2. invoiceCodeFrom(content)  (/TT(\d+)/i, không có → giữ UNMATCHED)                          │
 │ 3. SELECT … FOR UPDATE hóa đơn → UNPAID và total = amount ?                                  │
 │      ├─ không → giữ UNMATCHED (BANK-04), note nêu lý do (Q-P4-30)                            │
 │      └─ có  → UPDATE bank_transactions SET status = MATCHED, invoice_id = …                   │
 │               INSERT payments (WEBHOOK / BANK_TRANSFER / bank_transaction_id,                │
 │                                recorded_by_id = NULL)  ──► trigger đặt invoices.status = PAID │
 │               audit payment.record (actor_id = NULL, AUD-03)                                  │
 │               paymentReceivedNotice(): dòng người thuê + thư nhân sự tòa (Q-P4-27) + mail     │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
        │ mỗi giao dịch lỗi (không phải P2002): log + thử lại MỘT lần, chỉ chèn dòng UNMATCHED
        ▼
 200 { received: n, matched: m, skipped: k }  ← luôn 200 khi chữ ký đúng (BANK-01)
 mail gửi SAU khi transaction commit (NOTI-07), lỗi mail không hoàn tác gì

 Boss                                   BankTransactionsController (@Roles('BOSS'))
 ────                                   ──────────────────────────────────────────────────────
 /ql/giao-dich ──► GET  /bank-transactions?status&from&to&page&limit   (Paginated, no-store)
               ──► POST /bank-transactions/:id/assign { invoiceId }  → ASSIGNED + payments(ASSIGNED,
               │                                                       recorded_by_id = Boss) + audit payment.assign
               └─► POST /bank-transactions/:id/mark-refunded { note } → REFUNDED + note + audit payment.refund
```

### 2.2 File thêm / sửa

| File | Thêm/Sửa | Việc |
|---|---|---|
| `src/modules/bank/webhook-adapter.ts` (+ `.spec.ts`) | thêm | `BankWebhookAdapter`, `WebhookRequest`, `IncomingTx`, `secretEquals` (hằng thời gian), `fakeAdapter`, `adapterFromEnv()` |
| `src/modules/bank/match-invoice.ts` (+ `.spec.ts`) | thêm | hàm **thuần** `invoiceCodeFrom(content)` và `matchOutcome(invoice, amount)` — nơi duy nhất chứa luật BANK-03/BANK-04 |
| `src/modules/bank/bank.service.ts` (+ `bank.webhook.http.spec.ts`) | thêm | `processWebhook(req)`: lọc tài khoản, vòng lặp một transaction/giao dịch, khớp, thông báo |
| `src/modules/bank/webhook.controller.ts` | thêm | một route `@Public()`, kiểm secret rỗng → 503, gọi service |
| `src/modules/bank/bank-transactions.service.ts` (+ `.spec.ts`) | thêm | `list`, `assign`, `markRefunded` (BANK-05) |
| `src/modules/bank/bank-transactions.controller.ts` (+ `bank-transactions.http.spec.ts`) | thêm | 3 route Boss, `Cache-Control: no-store` trên GET (API-07) |
| `src/modules/bank/dto/bank-transactions.dto.ts` | thêm | `BankTransactionsQueryDto`, `AssignTransactionDto`, `MarkRefundedDto`, `BankTxIdParamsDto` |
| `src/modules/bank/bank.module.ts` | thêm | `imports: [AuditModule, MailerModule]`, 2 controller, 2 service |
| `src/modules/billing/payment-notice.ts` (+ dùng trong `billing.service.ts`) | thêm + sửa | tách khối "dòng người thuê + thư nhân sự + mail paymentReceived" của `recordPayment` thành một hàm dùng chung cho webhook và cho `assign` → **một chỗ** giữ hình dạng Q-P4-27. Tiêu đề và link **giữ nguyên từng chữ** để `billing.payment.http.spec.ts` (dòng 249–250) không đổi |
| `src/app.module.ts` + `src/common/prisma/prisma.service.spec.ts` | sửa | thêm `BankModule` vào `AppModule` **và** cập nhật danh sách module trong spec cùng lúc (bài học BE-P2-10) |
| `src/common/errors/error-code.ts`, `src/common/i18n/messages.ts`, `src/app.setup.spec.ts`, `src/common/errors/all-exceptions.filter.spec.ts` | sửa **chỉ nếu** Q-P4-35 = A | thêm mã 503 `WEBHOOK_NOT_CONFIGURED`; đổi `toHaveLength(32)` → 33 và bảng `EXPECTED` (bài học BE-P2-02) |
| `test/bank-webhook.e2e-spec.ts` | thêm | e2e trên DB dev, rollback ngoài (§4 CP-5) |

**Không** thêm mẫu mail (dùng lại `paymentReceived`), **không** thêm khóa seed (`EXPECTED_COUNTS` của `seed.spec.ts` không đổi, bài học BE-P3-18), **không** thêm khóa `DB_ERROR_MAP` (trigger `INVOICE_NOT_UNPAID`/`PAYMENT_AMOUNT_MISMATCH` đã có, `db-errors.spec.ts` không đổi), **không** thêm giá trị enum.

### 2.3 Hợp đồng adapter (BE-P4-24)

```
interface WebhookRequest { headers: Record<string, string | string[] | undefined>; body: unknown; rawBody?: Buffer }

interface IncomingTx { providerTxId: string; amount: number; content: string; accountNumber: string; receivedAt: Date; raw: unknown }

interface BankWebhookAdapter {
  provider: BankProvider | 'FAKE';           // Q-P4-28: 'FAKE' không có trong enum DB → xem bảng câu hỏi
  verify(req: WebhookRequest, secret: string): boolean;   // hằng thời gian
  parse(body: unknown): IncomingTx[];        // bỏ qua phần tử sai định dạng, không bao giờ ném
}

adapterFromEnv(env = process.env): BankWebhookAdapter   // BANK_PROVIDER (mặc định adapter giả)
secretEquals(a: string, b: string): boolean             // timingSafeEqual trên sha256 của hai chuỗi
```

- `secretEquals` băm cả hai bên bằng `createHash('sha256')` rồi `timingSafeEqual` (độ dài luôn 32 byte) → so sánh hằng thời gian và không lộ độ dài. Secret **chỉ** đọc từ `process.env`, không bao giờ vào DB, log hay `raw` (BANK-07).
- `parse` không bao giờ ném: một phần tử sai định dạng bị bỏ qua và đếm vào `skipped`; webhook vẫn 200 (BANK-01).
- `amount` phải là số nguyên > 0 sau `parse` (CHECK `bank_tx_amount`); số lẻ/âm/không phải số → bỏ qua phần tử đó.
- **Chỗ cắm adapter thật:** thêm `src/modules/bank/adapters/sepay.ts` (hoặc `casso.ts`) xuất một `BankWebhookAdapter` và một dòng trong bảng tra của `adapterFromEnv`. `bank.service.ts` **không** phải đổi vì nó chỉ nói chuyện với `IncomingTx`.
- **Raw body:** đề xuất **không** cần. Cả hai nhà cung cấp đang xét đều xác thực bằng **một token tĩnh trong header** (SePay: `Authorization: Apikey …`; Casso: `Secure-Token: …`), nên `verify` chỉ cần `headers` — không sửa parser toàn cục, không sửa `app.setup.ts`. Nếu Q-03 chọn một nhà cung cấp ký HMAC thân yêu cầu thì lúc đó mới bật `NestFactory.create(AppModule, { rawBody: true })` trong `main.ts` (một dòng) và dùng `req.rawBody` — `WebhookRequest.rawBody` đã để sẵn chỗ. Xem Q-P4-28.

### 2.4 Hợp đồng route

| Method | Path | Vai trò | Body / Query | Trả về | Lỗi |
|---|---|---|---|---|---|
| POST | `/webhooks/bank` | `@Public()` (API-07, chỉ chữ ký) | payload của nhà cung cấp | `{ received, matched, skipped }` 200 | 401 `WEBHOOK_SIGNATURE_INVALID`; 503 khi `BANK_WEBHOOK_SECRET` trống (Q-P4-35) |
| GET | `/bank-transactions` | **BOSS** | `status?: BankTxStatus`, `from?: YYYY-MM-DD`, `to?: YYYY-MM-DD`, `page?`, `limit?` (API-02) | `Paginated<BankTransactionRow>` + `Cache-Control: no-store` | `FORBIDDEN` (MANAGER/TENANT/GUEST), 401, `VALIDATION_FAILED` |
| POST | `/bank-transactions/:id/assign` | **BOSS** | `{ invoiceId: number ≥ 1 }` | `{ bankTransactionId, invoiceId, paymentId, status: 'ASSIGNED' }` | `NOT_FOUND`, `CONFLICT_STATE`, `PAYMENT_AMOUNT_MISMATCH`, `INVOICE_NOT_UNPAID` |
| POST | `/bank-transactions/:id/mark-refunded` | **BOSS** | `{ note: string 3..500, bắt buộc }` | `{ bankTransactionId, status: 'REFUNDED', note }` | `NOT_FOUND`, `CONFLICT_STATE`, `VALIDATION_FAILED` (thiếu `note`) |

```
interface BankTransactionRow { id: number; provider: BankProvider; providerTxId: string; amount: number; content: string;
  accountNumber: string; receivedAt: string; status: BankTxStatus; note: string | null; handledAt: string | null;
  invoice: { id: number; code: string; total: number; status: InvoiceStatus; roomCode: string; tenantName: string } | null }
```

- `raw` **không** bao giờ ra API (có thể chứa dữ liệu nhà cung cấp); Boss cần nó thì tra DB. `handledById` trả ở Phase 5 nếu cần.
- Thứ tự mặc định: `UNMATCHED` lên đầu, rồi `receivedAt desc, id desc` (FE-P4-07 "không khớp lên đầu").
- `from`/`to` lọc `receivedAt` theo **ngày Hà Nội**, bao gồm cả hai đầu (`todayHanoi`/`HANOI_OFFSET_MS` của `common/date/today.ts`) — `[ASSUMPTION]`, xem §3.
- `assign`: lấy `FOR UPDATE` cả dòng giao dịch và dòng hóa đơn trong **một** transaction; giao dịch phải đang `UNMATCHED` (0 dòng cập nhật = `CONFLICT_STATE`), hóa đơn phải `UNPAID` (`INVOICE_NOT_UNPAID`) và `total = amount` (`PAYMENT_AMOUNT_MISMATCH`). Chuẩn bị ghi theo CHECK `payments_source`: `source = ASSIGNED` buộc `bank_transaction_id` **và** `recorded_by_id` khác null, `method = BANK_TRANSFER`. Có `Idempotency-Key` thì dùng `runIdempotent` như các POST tiền khác (API-05).
- `assign` cũng gọi `paymentReceivedNotice` (người thuê + nhân sự tòa) — cùng hình dạng Q-P4-27; `mark-refunded` không gửi gì.
- `mark-refunded` đặt `status = REFUNDED`, `note`, `handledById = Boss`, `handledAt = now()`; CHECK `bank_tx_invoice_link` buộc `invoice_id` phải null nên chỉ dòng `UNMATCHED` hoàn được (xem Q-P4-34).

### 2.5 Thứ tự ghi trong một giao dịch (vì sao đúng)

1. **Chèn trước** (BANK-02): dòng `UNMATCHED`, `invoice_id = null` — thỏa CHECK `bank_tx_invoice_link` (`invoice_id` chỉ được có khi MATCHED/ASSIGNED). Chèn trước mới có `id` để `payments.bank_transaction_id` trỏ tới, và UK `(provider, provider_tx_id)` là **khóa chống trùng duy nhất** (webhook không dùng `Idempotency-Key`, PLAN phase §2).
2. P2002 phải được bắt **ngoài** `prisma.$transaction`: một lỗi trong transaction làm Postgres hủy toàn bộ transaction đó, không thể "bắt rồi tiếp tục" bên trong (bài học chung của dự án: dùng savepoint hoặc để transaction chết). Vòng lặp bắt lỗi và đi tiếp giao dịch sau → "một lỗi không cuốn hai cái còn lại".
3. Khớp xong mới `UPDATE … SET status = 'MATCHED', invoice_id = …` rồi `INSERT payments`; trigger `payments_invoice_check` là **lưới an toàn cuối** (nó tự kiểm UNPAID + đúng tổng rồi đặt PAID). BE vẫn kiểm trước bằng `FOR UPDATE` để không phụ thuộc vào thông báo lỗi của DB.
4. Nếu nhánh khớp vẫn lỗi (đua với ghi thu tay, DB chậm…): transaction đó rollback → **thử lại một lần** trong transaction mới, chỉ chèn dòng `UNMATCHED`. Tiền không bao giờ mất dấu, Boss gán tay theo BANK-05.
5. Mail gửi sau khi commit, qua `sendWithRetry` + khóa idempotency `payment-received-{invoiceId}` như `BillingService.deliver` đang làm (NOTI-07).

### 2.6 Ma trận khớp (BANK-03/BANK-04) — nguồn kết quả mong đợi là 17-bank

| `content` | Hóa đơn | `amount` | Kết quả |
|---|---|---|---|
| `TT1523 P203` | 1523 UNPAID | `= total` | `MATCHED` + `payments` + hóa đơn `PAID` + thông báo |
| `tt1523` (chữ thường) | 1523 UNPAID | `= total` | `MATCHED` (regex không phân biệt hoa thường) |
| `TT1523` | 1523 UNPAID | `total − 1` | `UNMATCHED`, hóa đơn **vẫn** UNPAID, không có `payments` |
| `TT1523` | 1523 `PAID` | bất kỳ | `UNMATCHED` (chuyển lần hai → Boss hoàn) |
| `TT1523` | 1523 `DRAFT`/`CANCELLED`/`SETTLED` | bất kỳ | `UNMATCHED` |
| `TT999999` | không tồn tại | bất kỳ | `UNMATCHED` |
| `Chuyen tien phong 203` | – | bất kỳ | `UNMATCHED` (không có mã) |
| `TT` / `TT0` / `TT 1523` | – | bất kỳ | `UNMATCHED` (regex đòi chữ số liền sau `TT`; `0` không phải id hợp lệ) |
| `TT9999999999999` | – | bất kỳ | `UNMATCHED`, **không** truy vấn DB (vượt `Int` Postgres → trả null, bài học BE-P2-17) |

---

## 3. Câu hỏi cho chủ dự án

**Chủ dự án đã trả lời (22/11/2026): Q-P4-28..35 đều theo phương án đề xuất** (A, B cho Q-P4-29, A, A, A, A, A, A). Ghi trong README phase.

Phiên chính hỏi **cả lượt** trước khi viết mã của checkpoint bị chặn, rồi chép vào bảng §2 của `docs/phase-4-money/README.md` và mục "Questions for the owner" của file task. Không tự quyết luật nghiệp vụ.

| Mã | Câu hỏi | Lựa chọn | Đề xuất | Chặn |
|---|---|---|---|---|
| **Q-P4-28** | Adapter giả (D-44/Q-P4-2) nhận payload hình gì và ký thế nào? Enum DB chỉ có `SEPAY`, `CASSO` nên `provider` của adapter giả phải mượn một giá trị. | **A** payload `{ transactions: [{ id, amount, content, accountNumber, receivedAt }] }`, xác thực bằng header `X-Webhook-Secret` so sánh hằng thời gian với `BANK_WEBHOOK_SECRET`, ghi DB với `provider = 'SEPAY'` (vì SePay cũng dùng token tĩnh trong header) · **B** như A nhưng chữ ký là HMAC-SHA256 hex của **thân thô** trong header `X-Bank-Signature` → phải bật `rawBody: true` trong `main.ts` · **C** thêm giá trị enum `FAKE` vào `BankProvider` (**cần migration**, phải bạn duyệt) | **A** — ít mã nhất, không sửa parser, khớp cách SePay/Casso thật xác thực; khi chốt Q-03 chỉ thêm một file adapter | CP-1, CP-3 |
| **Q-P4-29** | "Tài khoản" là gì khi `settings.bank_account` đổi (đổi số tài khoản, hoặc chưa điền)? | **A** chỉ `accountNo` **hiện tại** lúc xử lý; tiền vào số cũ bị bỏ qua (chỉ còn một dòng log) · **B** số khác vẫn **lưu dòng `UNMATCHED`** để Boss thấy và hoàn (trái chữ "ignored" của 17-bank nhưng không mất dấu tiền) · **C** `settings.bank_account` giữ thêm danh sách số cũ được chấp nhận | **B** nếu bạn muốn chắc không mất tiền; **A** nếu muốn đúng nguyên văn spec. Thêm: `bank_account` **trống/sai định dạng** → đề xuất trả 503 và không ghi gì (để bạn biết là cấu hình thiếu) | CP-3 |
| **Q-P4-30** | Giao dịch có mã `TT` đúng nhưng **sai số tiền** (hoặc hóa đơn đã PAID) thì trang giao dịch hiện gì? CHECK của DB không cho gắn `invoice_id` khi còn `UNMATCHED`. | **A** ghi câu tiếng Việt vào `note`, ví dụ `Nội dung TT1523 nhưng số tiền lệch (3.119.000 đ)` / `Hóa đơn TT1523 đã thanh toán` · **B** không ghi gì, Boss tự đọc `content` · **C** thêm cột `suggested_invoice_id` (**cần migration**) | **A** — không migration, Boss gán nhanh hơn | CP-3, CP-4 |
| **Q-P4-31** | Khi webhook khớp, thư nhân sự có ghi như lúc ghi thu tay (Q-P4-27: luôn ghi cho người phụ trách tòa) không? | **A** có, **cùng** hình dạng Q-P4-27: dòng người thuê `PAYMENT_RECEIVED` + mail, và thư nhân sự tòa (quản lý đang hoạt động, Boss nếu tòa không có) · **B** chỉ thông báo người thuê, nhân sự xem ở `/ql/hoa-don` · **C** chỉ thư Boss | **A** — BANK-03 chỉ nói "notify tenant", nhưng thu tiền tự động mà nhân sự không biết thì họ vẫn đi nhắc nợ | CP-3 |
| **Q-P4-32** | Hóa đơn **cọc** (DEPOSIT) được trả bằng chuyển khoản qua webhook thì có kích hoạt gì thêm? | **A** không gì thêm: hóa đơn PAID + thông báo; nhân sự vẫn tự bấm các bước hợp đồng (vào ở) như Phase 3 · **B** tự chuyển hợp đồng sang bước tiếp theo · **C** thêm một thư nhân sự riêng "Cọc đã vào" | **A** — Phase 3 đã có luồng bấm tay, không đổi; ô "Cọc chưa thu" ở `/ql` tự hết (NOTI-06) | CP-3 |
| **Q-P4-33** | Múi giờ của mốc thời gian nhà cung cấp gửi (`receivedAt`). Nhiều nhà cung cấp gửi chuỗi kiểu `2026-11-22 10:05:00` **không có offset**. | **A** chuỗi không có offset = giờ `Asia/Ho_Chi_Minh` (cộng −07:00 khi lưu) · **B** coi là UTC · **C** bỏ qua giao dịch không có offset | **A** — nhà cung cấp và ngân hàng đều ở Việt Nam; sai giờ chỉ ảnh hưởng bộ lọc `from`/`to` của Boss | CP-1 |
| **Q-P4-34** | `mark-refunded` áp cho trạng thái nào? BANK-05 chỉ nói "ngược lại thì Boss đánh dấu REFUNDED". | **A** chỉ `UNMATCHED` → `REFUNDED`; `MATCHED`/`ASSIGNED`/`REFUNDED` → `CONFLICT_STATE` (muốn hoàn tiền đã khớp thì phải hủy thanh toán — chưa có luật nào cho việc đó) · **B** cho cả `MATCHED`/`ASSIGNED` nhưng giữ nguyên `payments` (số liệu sẽ nói tiền đã thu **và** đã hoàn) · **C** cho hoàn mọi trạng thái và tự hủy `payments` (chưa có luật, sẽ phá PAID) | **A** — một chiều, không bao giờ phá dữ liệu tiền; cũng khớp CHECK `bank_tx_invoice_link` | CP-4 |
| **Q-P4-35** | `BANK_WEBHOOK_SECRET` trống thì route trả 503 với **mã lỗi** nào? Spec không có mã cho việc này (`WEBHOOK_SIGNATURE_INVALID` là 401). | **A** thêm mã `WEBHOOK_NOT_CONFIGURED` (503) giống `UPLOAD_NOT_CONFIGURED` — phải sửa thêm test đếm mã trong `app.setup.spec.ts` (32 → 33) và `messages.ts` · **B** trả 503 với mã `INTERNAL_ERROR` (không thêm mã, thông điệp mơ hồ) · **C** trả 401 `WEBHOOK_SIGNATURE_INVALID` (nhà cung cấp sẽ gửi lại mãi) | **A** — một dòng ở 4 file, thông điệp rõ cho bạn khi quên điền `.env`; tuyệt đối không chọn **C** | CP-2 |

`[ASSUMPTION]` sẽ dùng và phải nêu lại ở checkpoint BE-P4-28:

- Webhook **không** nhận `Idempotency-Key` (API-05 dành cho POST của người dùng); chống trùng bằng UK `(provider, provider_tx_id)` theo đúng BANK-02.
- Audit: `payment.record` với `actor_id = null` cho lượt khớp của webhook (AUD-01 "payment record", AUD-03), `payment.assign` (entity `payment`) và `payment.refund` (entity `bank_transaction`) cho hai route của Boss (AUD-01 "payment record/assign/refund", AUD-02 `<entity>.<verb>`).
- `from`/`to` lọc theo ngày Hà Nội, bao gồm cả hai đầu; thiếu cả hai thì không lọc thời gian.
- Thân phản hồi 200 là `{ received, matched, skipped }` (spec chỉ đòi "200 nhanh").
- `raw` lưu **đúng phần tử giao dịch** mà nhà cung cấp gửi (không kèm header, không kèm secret) — BANK-07.
- Mã `TT0` và mã lớn hơn `Int` của Postgres bị coi là "không có mã".

---

## 4. Checkpoints

Mỗi ⏸ là điểm dừng: báo cáo (file đã sửa, output thật, cách kiểm tay, `[ASSUMPTION]`, thông điệp commit đề xuất), chủ dự án kiểm và commit, rồi mới tiếp. File task P4-5 chỉ có **một** ⏸ ở **BE-P4-28** (CP-5); CP-1..CP-4 là các bước bên trong, mỗi bước vẫn tự kiểm được bằng lệnh. Trước CP-5: cập nhật `docs/phase-4-money/PROGRESS.md` và thêm vào `docs/LESSONS.md` lỗi nào đã mất một lượt làm lại.

Lệnh dùng ở "Done when" (chạy từ `Source/backend`):

```
npx vitest run <đường dẫn spec>                 # một file
npm run lint && npm run test && npm run build
node --env-file=.env ./node_modules/vitest/vitest.mjs run --config ./vitest.config.e2e.ts test/bank-webhook.e2e-spec.ts   # e2e (bài học BE-EX-06)
```

### CP-1 · BE-P4-24 (phần 1): adapter, chữ ký, lọc giao dịch

- **File:** `src/modules/bank/webhook-adapter.ts` + `.spec.ts`, `src/modules/bank/match-invoice.ts` + `.spec.ts`.
- **Chặn bởi:** Q-P4-28 (hình dạng payload và `provider`), Q-P4-33 (múi giờ).
- **Done when:** `npx vitest run src/modules/bank/webhook-adapter.spec.ts src/modules/bank/match-invoice.spec.ts` pass; `git status` chỉ có 4 file mới; `npm run build` pass.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | `verify` với secret đúng trong header | BANK-01 | `true` |
| 2 | `verify` với secret sai cùng độ dài | BANK-01 | `false` |
| 3 | `verify` với secret sai khác độ dài / header thiếu / header là mảng | BANK-01 | `false`, không ném |
| 4 | `secretEquals` dùng `timingSafeEqual` trên hai hash dài bằng nhau | BANK-01, BANK-07 | test tĩnh: không có `===`/`startsWith` so sánh chuỗi secret trong file |
| 5 | Secret không bao giờ vào kết quả `parse`/`IncomingTx.raw` | BANK-07 | không trường nào chứa giá trị secret |
| 6 | `parse` payload 3 giao dịch | BANK-02 | 3 `IncomingTx`, đúng `providerTxId`, `amount`, `content`, `accountNumber` |
| 7 | `parse` payload 1 phần tử thiếu `content` hoặc `amount` không phải số | BANK-01 | phần tử đó bị bỏ, không ném, các phần tử khác giữ nguyên |
| 8 | `amount` = 0 hoặc âm (ghi nợ) | 17-bank "Adapter", CHECK `bank_tx_amount` | bị bỏ qua |
| 9 | `amount` là số lẻ (`1000.5`) | G-01 (đồng nguyên) | bị bỏ qua |
| 10 | `accountNumber` khác `settings.bank_account.accountNo` | 17-bank "Adapter" | theo **Q-P4-29** |
| 11 | `receivedAt` `2026-11-22T10:05:00+07:00` | LOC-05 | giữ đúng mốc |
| 12 | `receivedAt` `2026-11-22 10:05:00` (không offset) | **Q-P4-33** | theo lựa chọn của chủ dự án |
| 13 | `invoiceCodeFrom('TT1523 P203')` | BANK-03 | `1523` |
| 14 | `invoiceCodeFrom('tt1523')` | BANK-03 | `1523` (không phân biệt hoa thường) |
| 15 | `invoiceCodeFrom('Chuyen tien phong 203')`, `'TT'`, `'TT 1523'`, `'TT0'` | BANK-04 | `null` |
| 16 | `invoiceCodeFrom('TT9999999999999')` | BANK-04, bài học BE-P2-17 | `null` (vượt `Int`) |
| 17 | `invoiceCodeFrom('ND TT12 va TT13')` | BANK-03 | `12` (mã đầu tiên) |
| 18 | `matchOutcome` hóa đơn UNPAID, `total = amount` | BANK-03 | `MATCHED` |
| 19 | `matchOutcome` lệch 1 đ, hóa đơn PAID, DRAFT, CANCELLED, SETTLED, null | BANK-04 | `UNMATCHED` kèm lý do (Q-P4-30) |

### CP-2 · BE-P4-25 (phần 1): route `/webhooks/bank`, chữ ký và 503

- **File:** `src/modules/bank/webhook.controller.ts`, `bank.module.ts`, `src/app.module.ts` (sửa), `src/common/prisma/prisma.service.spec.ts` (sửa danh sách module), và — nếu Q-P4-35 = A — `error-code.ts`, `messages.ts`, `app.setup.spec.ts`, `all-exceptions.filter.spec.ts`.
- **Chặn bởi:** Q-P4-35.
- **Done when:** `npx vitest run src/modules/bank src/common/prisma/prisma.service.spec.ts src/app.setup.spec.ts` pass; `npm run build` pass.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | POST không có chữ ký | BANK-01 | 401, body `error.code = WEBHOOK_SIGNATURE_INVALID`, **không** gọi `bankTransaction.create` (assert chính lời gọi, bài học BE-EX-08) |
| 2 | Chữ ký sai | BANK-01 | 401, không ghi dòng nào |
| 3 | Chữ ký đúng, payload rỗng | BANK-01 | 200 `{ received: 0, matched: 0, skipped: 0 }` |
| 4 | `BANK_WEBHOOK_SECRET` trống (hoặc chỉ khoảng trắng) | BE-P4-24 | 503 theo Q-P4-35; **app vẫn khởi động** (test boot `AppModule` với env trống và gọi được route khác) |
| 5 | `BANK_WEBHOOK_SECRET` không có trong `REQUIRED_ENV` | `common/env.ts` | `validateEnv()` vẫn pass khi thiếu biến này (giữ nguyên hành vi hiện tại) |
| 6 | Route không cần token | API-07 | gọi không `Authorization` vẫn vào controller (`@Public()`), không 401 `UNAUTHENTICATED` |
| 7 | Route nằm dưới prefix `/api/v1` | API-03 | `/webhooks/bank` (không prefix) → 404 `NOT_FOUND` |
| 8 | `AppModule` có `BankModule` | bài học BE-P2-10 | danh sách module trong `prisma.service.spec.ts` được cập nhật cùng lúc |
| 9 | Body lạ (chuỗi, mảng, thiếu khóa) khi chữ ký đúng | BANK-01 | 200, `skipped` đếm đúng, không 500 |
| 10 | Thông điệp lỗi không lộ secret hay thông điệp DB thô | BANK-07, API-04 | body chỉ có `code` + câu tiếng Việt |

### CP-3 · BE-P4-25 (phần 2) + BE-P4-26: xử lý, chống trùng, khớp và thông báo

- **File:** `src/modules/bank/bank.service.ts` + `bank.webhook.http.spec.ts`, `src/modules/billing/payment-notice.ts` (mới) + `billing.service.ts` (dùng lại hàm chung).
- **Chặn bởi:** Q-P4-29, Q-P4-30, Q-P4-31, Q-P4-32.
- **Done when:** `npx vitest run src/modules/bank src/modules/billing` pass (gồm `billing.payment.http.spec.ts` **không đổi**: tiêu đề và link thông báo giữ nguyên từng chữ); `npm run lint` pass.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | `TT1523 P203`, hóa đơn 1523 UNPAID đúng tổng | 17-bank Acceptance 1, BANK-03 | dòng `MATCHED` + `invoice_id = 1523`, một `payments` (`WEBHOOK`, `BANK_TRANSFER`, `bank_transaction_id`, `recorded_by_id = null`), hóa đơn `PAID` |
| 2 | Ca 1: thông báo | BANK-03, D-44/Q-P4-1, **Q-P4-31** | dòng người thuê `PAYMENT_RECEIVED` `Đã nhận {total} cho hóa đơn TT{id}` link `/thue/hoa-don/{id}`; thư nhân sự tòa link `/ql/hoa-don/{id}`; một mail `paymentReceived` tới email **đã xác minh** (NOTI-04) |
| 3 | Người thuê chưa có email / chưa xác minh | NOTI-04 | không mail; dòng in-app vẫn ghi |
| 4 | Mail lỗi cả hai lần | NOTI-07 | `logger.warn`, hóa đơn **vẫn** PAID (không hoàn tác) |
| 5 | Cùng webhook gửi hai lần | 17-bank Acceptance 2, BANK-02 | đúng **một** dòng `bank_transactions`, **một** `payments`, **một** bộ thông báo; lần hai vẫn 200 |
| 6 | Thiếu 1 đ | 17-bank Acceptance 3, BANK-04 | `UNMATCHED`, hóa đơn **vẫn** UNPAID, **không** có `payments`, `note` theo Q-P4-30 |
| 7 | Chuyển lần hai cho hóa đơn đã PAID | 17-bank Acceptance 4, BANK-04 | `UNMATCHED`, không `payments` thứ hai (UK `payments.invoice_id`) |
| 8 | Không có mã `TT` | BANK-04 | `UNMATCHED` |
| 9 | Mã trỏ tới hóa đơn không tồn tại | BANK-04 | `UNMATCHED`, không 500 |
| 10 | Một webhook chứa 3 giao dịch, giao dịch giữa lỗi | BANK-02 | hai giao dịch còn lại vẫn được ghi; phản hồi 200; lỗi được log |
| 11 | Mỗi giao dịch một transaction | BANK-02 | `prisma.$transaction` được gọi đúng 3 lần cho 3 giao dịch (assert lời gọi) |
| 12 | Nhánh khớp ném lỗi (ví dụ trigger `INVOICE_NOT_UNPAID` do đua với ghi thu tay) | BANK-02, BANK-04 | thử lại một lần → dòng `UNMATCHED` tồn tại, không có `payments`, không 500 |
| 13 | `raw` được lưu | BANK-07 | `raw` = đúng phần tử giao dịch; **không** chứa header, **không** chứa giá trị `BANK_WEBHOOK_SECRET` (test tìm chuỗi secret trong mọi lời gọi `create`) |
| 14 | Giao dịch ghi nợ hoặc sai số tài khoản | 17-bank "Adapter", **Q-P4-29** | theo lựa chọn; `skipped` đếm đúng |
| 15 | `settings.bank_account` thiếu/sai định dạng | **Q-P4-29** | theo lựa chọn (đề xuất 503, không ghi gì) |
| 16 | Hóa đơn `DEPOSIT` khớp | **Q-P4-32**, BIL-11 | PAID + thông báo; không có hành động hợp đồng nào khác |
| 17 | Hóa đơn `MONTHLY` và `FINAL` khớp | BIL-11 | cùng hành vi (không còn cổng "chỉ DEPOSIT" của D-35) |
| 18 | Audit | AUD-01, AUD-03 | một dòng `payment.record`, `actor_id = null`, `entity = payment` |
| 19 | Luôn 200 khi chữ ký đúng, kể cả toàn bộ không khớp | BANK-01 | 200 (để nhà cung cấp không gửi lại) |
| 20 | Hàm thông báo dùng chung | Q-P4-27 | `recordPayment` và webhook gọi **cùng** `payment-notice.ts`; tiêu đề/link không đổi so với `billing.payment.http.spec.ts` |

### CP-4 · BE-P4-27: ba route của Boss

- **File:** `src/modules/bank/bank-transactions.service.ts` + `.spec.ts`, `bank-transactions.controller.ts` + `bank-transactions.http.spec.ts`, `dto/bank-transactions.dto.ts`, `bank.module.ts` (sửa).
- **Chặn bởi:** Q-P4-30 (`note`), Q-P4-34 (trạng thái được hoàn).
- **Done when:** `npx vitest run src/modules/bank` pass; `npm run lint && npm run build` pass. Kiểm tay: đăng nhập Boss trên DB dev, `GET /api/v1/bank-transactions` trả danh sách, `Cache-Control: no-store`.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | BOSS gọi GET | BANK-05, API-07 | 200, `Paginated` (`new Paginated(...)`, bài học BE-P4-19), `UNMATCHED` lên đầu |
| 2 | MANAGER gọi GET / assign / mark-refunded | API-07, PLAN phase §8 | `FORBIDDEN` cả ba route |
| 3 | TENANT, GUEST | API-07 | `FORBIDDEN` |
| 4 | Không đăng nhập | API-07 | 401 `UNAUTHENTICATED` |
| 5 | `status=UNMATCHED` | BANK-04 | chỉ dòng `UNMATCHED` |
| 6 | `from`/`to` theo ngày Hà Nội, bao gồm hai đầu | LOC-05, G-02 | giao dịch lúc 23:30 ngày `to` vẫn vào kết quả |
| 7 | `status` lạ, `from` sai định dạng, `limit=0`, `limit=101`, `page=0` | API-02 | `VALIDATION_FAILED` |
| 8 | `raw` không ra API | BANK-07 | khóa `raw` không có trong phản hồi |
| 9 | Header GET | API-07 | `Cache-Control: no-store` |
| 10 | Assign: giao dịch `UNMATCHED`, hóa đơn UNPAID đúng tổng | BANK-05 | `ASSIGNED` + `invoice_id`, một `payments` (`source = ASSIGNED`, `method = BANK_TRANSFER`, `recorded_by_id` = Boss), hóa đơn `PAID` |
| 11 | Assign: lệch số tiền | BE-P4-27 | `PAYMENT_AMOUNT_MISMATCH`, không ghi gì |
| 12 | Assign: hóa đơn không UNPAID (PAID/DRAFT/CANCELLED/SETTLED) | BANK-05 | `INVOICE_NOT_UNPAID` |
| 13 | Assign: giao dịch đã `ASSIGNED`/`MATCHED`/`REFUNDED` | BE-P4-27 | `CONFLICT_STATE` |
| 14 | Assign hai lần song song | PLAN phase §7 | đúng một thành công, một `CONFLICT_STATE`; đúng **một** `payments` |
| 15 | Assign: `invoiceId` không tồn tại | API | `NOT_FOUND` |
| 16 | Assign: thông báo + audit | Q-P4-27, AUD-01 | dòng người thuê + thư nhân sự tòa; audit `payment.assign`, `actor_id` = Boss, `ip` được ghi |
| 17 | Assign cùng `Idempotency-Key` hai lần | API-05 | lần hai trả **cùng** kết quả, không tạo `payments` thứ hai |
| 18 | Mark-refunded: `UNMATCHED` + `note` | BANK-05 | `REFUNDED`, `note`, `handled_by_id` = Boss, `handled_at` khác null; audit `payment.refund` |
| 19 | Mark-refunded thiếu `note` / `note` rỗng / chỉ khoảng trắng | BE-P4-27 | `VALIDATION_FAILED`, thông điệp tiếng Việt |
| 20 | Mark-refunded trên `MATCHED`/`ASSIGNED`/`REFUNDED` | **Q-P4-34** | theo lựa chọn (đề xuất `CONFLICT_STATE`); `payments` và hóa đơn PAID **không** bị đổi |
| 21 | Id không tồn tại | API | `NOT_FOUND` |
| 22 | `note` chứa NUL (U+0000) | bài học BE-P3-10 | `VALIDATION_FAILED` trước khi tới Prisma |

### CP-5 · BE-P4-28 ⏸ (kết phần P4-5)

- **File:** `test/bank-webhook.e2e-spec.ts`; `docs/phase-4-money/PROGRESS.md`, `docs/LESSONS.md` (nếu có bài học).
- **e2e trên DB dev** (theo mẫu `test/invoices-payments.e2e-spec.ts`): một `prisma.$transaction` ngoài **luôn rollback**, `rollbackPrismaFacade(tx)` thay `PrismaService`, `MailerService` bị ghi đè, fixture từ `seedMonthlyFixture` (hóa đơn kỳ 1 tổng **3.119.000** theo BIL-09). Chuỗi: chốt chỉ số → webhook chữ ký sai (401, không dòng) → webhook đúng tổng với `content = TT{id}` (`MATCHED`, hóa đơn PAID, 2 dòng `notifications`) → gửi lại **cùng** payload (vẫn một dòng, một `payments`) → webhook thiếu 1 đ cho hóa đơn thứ hai (`UNMATCHED`, hóa đơn vẫn UNPAID) → `GET /bank-transactions` bằng token Boss (`UNMATCHED` lên đầu) → MANAGER gọi (403) → `assign` dòng `UNMATCHED` lệch tiền (`PAYMENT_AMOUNT_MISMATCH`) → `assign` đúng hóa đơn (`ASSIGNED` + `payments` `ASSIGNED`) → `assign` lần hai (`CONFLICT_STATE`) → `mark-refunded` thiếu `note` (400) rồi có `note` (`REFUNDED`).
- **Không cần fixture commit:** mọi thứ nằm trong transaction ngoài. Giới hạn đã biết của `rollbackPrismaFacade`: **không** truyền option cho `$transaction` (nếu service webhook cần `timeout`/`isolationLevel` thì ca đó phải chạy bằng unit fake, bài học BE-P4-12) và **không** mô phỏng hai kết nối → ca đua thật (webhook và ghi thu tay cùng lúc) chuyển sang **QA-P4-03**. Cuối spec: khẳng định `user.count`/`contract.count` của fixture = 0 sau rollback và log một dòng `BE-P4-28 {runId}: outer rollback verified`.
- **Nếu** một ca nào bắt buộc phải commit (ví dụ muốn thử hai kết nối thật): chỉ làm trong QA-P4-03, dữ liệu mang tên `[E2E]` qua `e2eName`, dọn **mềm** bằng `node scripts/e2e/cleanup.mjs` chế độ list trước, `--apply` **chỉ khi chủ dự án đồng ý** (bài học P2-QA-03); không bao giờ hard-delete dòng có lịch sử.
- **Done when:** output thật của `npm run lint`, `npm run test`, `npm run build` (từ `Source/backend`) và của lượt e2e dán vào báo cáo; reviewer (Sonnet 5, tiền + bảo mật) chạy trên thay đổi chưa commit và **báo cáo đầy đủ** nằm trong checkpoint; nêu lại `[ASSUMPTION]` §3 và nói rõ **BANK-08 chưa làm (D-44/Q-P4-3)** cùng việc còn chờ Q-03 (adapter thật, `BANK_WEBHOOK_SECRET` và `settings.bank_account` thật là việc của chủ dự án).
- Đánh dấu 5 dòng "Acceptance" của `17-bank.md` kèm tên test (dòng BANK-06 vẫn để trống — Phase 5).
- Thông điệp commit đề xuất: `feat(bank): webhook adapter with constant-time verify, insert-first dedup, TT matching and Boss assign/refund (BE-P4-24..28, BANK-01..05, BANK-07, API-07, AUD-01, AUD-03, D-10, D-12, D-44, Q-P4-28..35)`.

---

## 5. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| **Giả mạo webhook** (ai cũng POST được) | So sánh hằng thời gian với secret env, sai → 401 và **không** ghi dòng nào; không bao giờ tin `amount`/`content` để **tạo** hóa đơn, chỉ để **khớp**; không tin số tiền trong payload làm `payments.amount` — luôn lấy `invoice.total` sau khi so khớp |
| **Lộ secret** | Secret chỉ ở env (BANK-07); không vào DB, `raw`, log hay thông điệp lỗi; test ca 13 của CP-3 tìm chuỗi secret trong mọi lời gọi `create` |
| **Nhà cung cấp gửi lại** → thu tiền hai lần | UK `(provider, provider_tx_id)` + chèn trước; UK `payments.invoice_id` là lưới thứ hai; luôn 200 khi chữ ký đúng để giảm số lần gửi lại |
| **Transaction bị hủy sau lỗi UK** (bắt P2002 bên trong rồi tiếp tục là sai) | Bắt lỗi **ngoài** `prisma.$transaction`, mỗi giao dịch một transaction; test ca 10/11 của CP-3 |
| **Đua với "Ghi thu tay"** cùng hóa đơn | `SELECT … FOR UPDATE` hóa đơn trong transaction; trigger `payments_invoice_check` là lưới cuối; nhánh khớp lỗi → thử lại một lần ghi `UNMATCHED` để tiền không mất dấu |
| **Mất tiền khỏi tầm nhìn** (số tài khoản đổi, payload lạ) | Q-P4-29/Q-P4-30; mọi giao dịch bị bỏ qua đều được **đếm và log**; Boss còn `GET /bank-transactions` + nhắc nợ (BANK-06 ở Phase 5) |
| **DB dev chậm (0,3–0,8 s/truy vấn)** | Transaction mỗi giao dịch rất ngắn, không chờ khóa trong transaction dài (bài học QA-P3-02); e2e dùng `testTimeout` dài đã cấu hình; ca nghi ngờ chạy riêng trước khi kết luận lỗi logic |
| **Test danh sách cố định bị vỡ** | `prisma.service.spec.ts` (thêm `BankModule`), `app.setup.spec.ts` + `all-exceptions.filter.spec.ts` + `messages.ts` (chỉ nếu Q-P4-35 = A), `billing.payment.http.spec.ts` (giữ nguyên tiêu đề thông báo). Không thêm khóa seed, không thêm khóa `DB_ERROR_MAP`, không thêm mẫu mail |
| **Spec nào boot `AppModule` gửi mail thật** | Ghi đè `MailerService` trong mọi spec mới boot `AppModule`; hai config vitest đã đặt `MAIL_PROVIDER: ''` — giữ nguyên (bài học EX-8) |
| **Adapter thật khác xa adapter giả** | Luật nghiệp vụ nằm hết trong `match-invoice.ts` + `bank.service.ts`, chỉ `verify`/`parse` thuộc adapter; thêm nhà cung cấp = một file + một dòng tra bảng, không sửa service |
| **Webhook bị bỏ khi BE tắt** | Ngoài phạm vi (BANK-08 hoãn, D-44/Q-P4-3): nhắc nợ 08:00 (NOTI-05) + Boss gán tay (BANK-05). Phải nói rõ giới hạn này ở CP-5 |

---

## 6. Ma trận luật → checkpoint

| Luật | CP |
|---|---|
| BANK-01 (`verify`, hằng thời gian), BANK-07 (secret không vào DB), lọc ghi có/đúng tài khoản, Q-P4-33 | CP-1 |
| BANK-01 (401 / 200 / 503), API-03, API-07, bài học BE-P2-10 | CP-2 |
| BANK-02 (một transaction/giao dịch, chèn trước, UK), BANK-03, BANK-04, BANK-07 (`raw`), D-44/Q-P4-1, Q-P4-27/Q-P4-31, NOTI-04, NOTI-07, AUD-01/AUD-03, BIL-11 | CP-3 |
| BANK-05, D-12, API-02, API-05, API-07, AUD-01, PLAN phase §8 (chỉ BOSS) | CP-4 |
| 5 dòng Acceptance của 17-bank, lint/test/build, e2e DB dev, reviewer | CP-5 |
| BANK-06 (báo lỗi thanh toán), BANK-08 (job đối chiếu), trang `/ql/giao-dich` | **ngoài P4-5**: Phase 5 · hoãn (D-44) · FE-P4-07 |
