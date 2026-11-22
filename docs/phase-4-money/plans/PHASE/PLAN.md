# Phase 4 · Money — kế hoạch phase

Tài liệu này là bản vẽ để phiên chính viết `docs/phase-4-money/README.md`, `PROGRESS.md` và một file `feature_p4-*.md` cho mỗi phần, theo đúng khuôn của Phase 3. Không có mã nguồn trong đây.

Nguồn: roadmap dòng "4 · Money" (`docs/spec/01-architecture.md#roadmap`), `docs/spec/15-meters.md`, `16-billing.md`, `17-bank.md`, `19-notifications.md` (NOTI-04..07, NOTI-10), `12-pricing.md` (bậc điện), `14-contracts.md` (CON-20, CON-21, quyết toán), `30-frontend.md` (các trang tiền), các quyết định D-05, D-09, D-10..D-14, D-21, D-38, D-40, D-41, D-42 và câu trả lời của chủ dự án Q-P3-3, Q-P3-12/13, Q-P3-18, Q-P3-20 (`docs/phase-3-contracts/README.md`).

---

## 1. Mục tiêu và phạm vi

**Mục tiêu (roadmap):** hóa đơn ví dụ **3.119.000 đ** (BIL-09) và các tháng lẻ của BIL-22 đạt ở unit test; webhook khớp và không khớp đạt; một lần chạy 00:05 bị bỏ được bù lại (BIL-05, BIL-06).

Một tháng vận hành đầy đủ: quản lý chốt chỉ số cuối tháng → mùng 1 hệ thống phát hành hóa đơn → người thuê quét VietQR → webhook ngân hàng ghi nhận → hóa đơn quá hạn từ ngày đầu tháng kế tiếp được nhắc → khi trả phòng thì quyết toán và ghi đã trả lại cọc.

### Trong phạm vi

| Nhóm | Nội dung | Mã luật |
|---|---|---|
| Toán tiền | kỳ theo tháng dương lịch, tháng lẻ, bậc điện, tính hóa đơn | BIL-01..04, BIL-07, BIL-22, D-40, D-41, A-21, "Electric tier calculation" của 12-pricing, RATE-04, D-09 |
| Chỉ số | danh sách "Chốt chỉ số", nhập theo lô, tiêu thụ qua mốc, thay đồng hồ, cảnh báo bất thường | MTR-02..06, MTR-08..12, D-38 |
| Hóa đơn tháng | DRAFT bằng cron 00:05 + lúc khởi động, bù 7 ngày, nút "Tạo hóa đơn kỳ này", phát hành mùng 1, hạn cuối tháng thu, quá hạn từ ngày đầu tháng kế tiếp | BIL-05, BIL-06, BIL-08, BIL-21, D-21, A-09, A-10 |
| Thu tiền | VietQR cho mọi hóa đơn, ghi thu tay mọi loại hóa đơn, lập lại hóa đơn, nhắc nợ | BIL-10, BIL-11, BIL-12, API-05, G-09 |
| Ngân hàng | webhook một adapter, khớp theo `TT{id}`, giao dịch không khớp, Boss gán / đánh dấu đã hoàn | BANK-01..07 |
| Quyết toán | trả phòng với `dryRun`, hóa đơn FINAL, hóa đơn cũ thành SETTLED, ghi "đã trả lại tiền" (Q-P3-3) | BIL-13..20, A-01, A-06 |
| Email và việc hôm nay | mail Boss thiếu chỉ số mùng 2→mùng 10, nhắc hóa đơn 08:00, nhóm việc hôm nay của tiền | NOTI-04..07, NOTI-10, D-42, NOTI-06, CON-20, CON-21 |
| FE | `/ql/chi-so`, `/ql/hoa-don(/:id)`, `/ql/giao-dich`, thẻ tiền ở `/ql`, quyết toán trong `/ql/hop-dong/:id`; `/thue` phần hóa đơn, `/thue/hoa-don(/:id)` song ngữ | 30-frontend các dòng tương ứng, UI-01..09, UI-07, LOC-01 |

### Ngoài phạm vi (ở Phase 5 hoặc hoãn)

| Việc | Ở đâu |
|---|---|
| Module `requests`: "Báo lỗi thanh toán" của người thuê, luồng leo thang lên Boss (BANK-06, REQ-07), sự cố, chi phí sửa | Phase 5 |
| Hộp thư trong ứng dụng `/thue/thong-bao`, trang `/ql/thong-bao`, `announcements` (NOTI-01..03) | Phase 5 — Phase 4 chỉ ghi `notifications` rows nếu chủ dự án chọn phương án A của Q-P4-1 |
| Tạo gia hạn hợp đồng (CON-17..19). Phase 4 **chỉ** làm bước cron chuyển ca BIL-06 cho hợp đồng gia hạn đã ký | Phase 5 |
| Báo cáo `/ql/bao-cao` (RPT), nhật ký `/ql/nhat-ky`, trang Cài đặt `/ql/cai-dat` | Phase 5 |
| Job đối chiếu giao dịch bỏ sót (BANK-08) | Chờ Q-04 — xem Q-P4-3 |
| Đánh giá sửa chữa (REQ-09), Zalo/SMS, chữ ký điện tử | Phase 5 / hoãn (D-20) |

---

## 2. Đã có sẵn và phải sửa

### Dùng lại được (Phase 1–3 đã làm)

| Thứ đã có | Đường dẫn | Phase 4 dùng để |
|---|---|---|
| Helper kỳ tháng dương lịch, `contractEndDate`, `contractPeriods`, `proratedAmount` (BigInt, A-21), `dueDateOfBillingMonth` | `src/common/date/period.ts` | nền của mọi tính toán; chỉ **thêm** hàm, không viết lại |
| `today.ts`: ngày nghiệp vụ `Asia/Ho_Chi_Minh`, `toDateOnly`, `addDays`, `compareDates`, `formatDateOnly` | `src/common/date/today.ts` | mọi so sánh ngày; cấm `new Date()` trong logic nghiệp vụ |
| `ratesAt` (RATE-04/D-09, trả cả bậc điện), `currentRoomPrice` | `src/common/rates/rates-at.ts` | giá cho kỳ, `RATE_PLAN_MISSING` |
| View VietQR + `qrImageUrl` + kiểm `settings.bank_account` | `src/modules/contracts/deposit-invoice.ts` | tách thành helper chung cho mọi loại hóa đơn (BIL-10) |
| `recordPayment` (khóa hàng hóa đơn, idempotency, audit, trigger PAID) | `src/modules/billing/billing.service.ts` | mở cho MONTHLY/FINAL, tách phần lõi cho webhook dùng |
| Kho Idempotency-Key API-05 `runIdempotent` + `hashRequest` | `src/modules/pricing/pricing-idempotency.ts`, bảng `pricing_idempotency_keys` | mọi POST tiền; webhook **không** dùng (chống trùng bằng UK `(provider, provider_tx_id)`) |
| Mẫu job 00:05/01:00 + chạy lúc khởi động, log một dòng tổng kết | `src/jobs/room-price-sync.job.ts` | khuôn cho job hóa đơn và job 08:00 |
| Mailer (Resend/console), `emailTemplate` với kiểm placeholder bắt buộc | `src/modules/mailer/*` | mail thiếu chỉ số (NOTI-10), nhắc hóa đơn (NOTI-05) |
| `scopeWhere`, guard vai trò, `assertViewingScope`, lọc `buildingId` (API-08) | `src/common/scope/scope.ts`, `src/common/guards/*` | mọi route nhân sự |
| `GET /dashboard` (`dashboard.service.ts`) đã có `unpaidDeposits`, `depositCancelledViewings` | `src/modules/notifications/` | thêm nhóm của tiền (NOTI-06) |
| Quyết toán khi hủy HOLD (CON-12) đã ghi `settlements` đúng CHECK | `src/modules/contracts/contract-cancel.service.ts` | khuôn cho quyết toán trả phòng |
| FE: kit An Lâm, `formatMoney`/ngày, bản đồ nhãn trạng thái, `StaffLayout`/`TenantLayout`, trang hợp đồng và `DepositCard` (đã hiện VietQR) | `Source/frontend/src/{components,shared,features/contracts}` | trang hóa đơn, chỉ số, giao dịch |

### Mã lỗi: **không cần thêm mã mới**

`error-code.ts` đã có đủ `INVOICE_NOT_UNPAID`, `PAYMENT_AMOUNT_MISMATCH`, `METER_VALUE_DECREASED`, `RATE_PLAN_MISSING`, `WEBHOOK_SIGNATURE_INVALID`, `CONFLICT_STATE`, `VALIDATION_FAILED`, `OUT_OF_SCOPE`. Giữ nguyên để không phải sửa test đếm mã trong `src/app.setup.spec.ts` (bài học BE-P2-02).

### Thay đổi schema / migration

**Kết luận: Phase 4 dự kiến KHÔNG cần migration.** Mọi bảng, cột, enum và ràng buộc đã có đủ: `meter_readings` (có `is_opening`, 3 index riêng phần), `invoices` + `invoice_lines` (UK `invoices_one_per_period` làm cron idempotent, CHECK `amount = quantity × unit_price`, chỉ `DEPOSIT_OFFSET` được âm), `payments` (trigger kiểm UNPAID + đúng tổng rồi đặt PAID), `bank_transactions` (UK `(provider, provider_tx_id)`, CHECK `invoice_id` ⇔ MATCHED/ASSIGNED), `settlements` (CHECK `net`, CHECK `final_invoice_id` ⇔ `net < 0`, CHECK `refund_paid_at IS NULL OR net > 0`), enum `InvoiceType/InvoiceStatus/LineKind/PaymentSource/BankProvider/BankTxStatus/NotificationKind`.

Hai chỗ *có thể* cần đổi schema; cả hai đều có phương án không đổi schema và phải hỏi chủ dự án trước nếu chọn phương án migration:

| Nhu cầu | Phương án không migration (đề xuất) | Phương án migration (phải xin duyệt) |
|---|---|---|
| "Mỗi ngày tối đa một mail NOTI-10", bù khi server tắt | Một dòng `settings` khóa `job_state` (JSON: lần chạy cuối của từng job theo ngày Hà Nội) — lưu ý: thêm khóa seed làm vỡ `EXPECTED_COUNTS` trong `prisma/seed.spec.ts` (bài học BE-P3-18) | bảng `job_runs(job, run_on, summary)` + UK `(job, run_on)` |
| Không nhắc trùng trong ngày (NOTI-05) và không tạo trùng `notifications` | Kiểm trong cùng transaction: đã có `notifications` cùng `kind` + `link` tạo trong ngày Hà Nội thì bỏ qua | index riêng phần trên `notifications` trong `constraints.sql` |

Nếu phải đổi schema: `constraints.sql` phải giữ nguyên 10 index riêng phần + 38 CHECK + 3 trigger hiện có (DB-07), và `prisma/check-constraints.mjs` phải thêm kịch bản cho luật mới; báo số thật của bộ kiểm (gần nhất **107/107**).

### Việc phải sửa trên mã đang có

| File | Sửa gì | Vì |
|---|---|---|
| `src/modules/billing/billing.service.ts` | bỏ cổng `type !== 'DEPOSIT' → CONFLICT_STATE`; tách lõi tạo `payments` cho webhook và cho route gán của Boss | BIL-11 (D-35 chỉ giới hạn tới Phase 3) |
| `src/modules/contracts/deposit-invoice.ts` | chuyển view VietQR sang `src/common/money/vietqr.ts`, hợp đồng vẫn dùng lại | BIL-10 cho mọi hóa đơn UNPAID |
| `src/app.module.ts` + `src/common/prisma/prisma.service.spec.ts` | thêm module `meters`, `bank`, job mới → **cập nhật danh sách module trong spec cùng lúc** | bài học BE-P2-10 |
| `src/modules/notifications/dashboard.service.ts` + `dto/dashboard.dto.ts` | thêm nhóm: draft chờ chỉ số (đỏ từ mùng 2), kỳ chưa có hóa đơn > 7 ngày, hóa đơn quá hạn, hợp đồng sắp/đã quá hạn | NOTI-06, BIL-05, BIL-21, CON-20, CON-21 |
| `src/app.setup.ts` | chỉ nếu adapter webhook cần **raw body** để kiểm chữ ký: giữ bản thô cho đúng một route `/webhooks/bank`, không đổi parser toàn cục | BANK-01 |
| `prisma/seed.ts` (+ `seed.spec.ts`) | nếu QA cần hợp đồng ACTIVE có chỉ số đủ để chốt một kỳ; mọi thay đổi seed phải sửa `EXPECTED_COUNTS` | QA-P4 |
| FE `src/app/router.tsx` + `tests/**` | route mới `/ql/chi-so`, `/ql/hoa-don`, `/ql/hoa-don/:id`, `/ql/giao-dich`, `/thue/hoa-don`, `/thue/hoa-don/:id`; test route đọc `routes[0..2]`, cần stub từng trang và đếm lại menu | bài học FE-EX-03, FE-P3-01 |

---

## 3. Kiến trúc

```
                 ┌──────────── cron (Asia/Ho_Chi_Minh), mọi job idempotent + chạy lúc khởi động ───────────┐
 00:05 monthly-invoice.job ──► BIL-05 tạo DRAFT (bù 7 ngày) ──► BIL-06 chuyển ca hợp đồng gia hạn đã ký
 08:00 late-readings.job   ──► NOTI-10 (mùng 2→10) mail Boss: draft còn thiếu chỉ số, nhóm theo tòa
 08:00 invoice-reminder.job──► NOTI-05 sắp đến hạn / quá hạn ngày 1,4,7… / hợp đồng hết hạn 30 và 7 ngày
                 └──────────────────────────────────────────────────────────────────────────────────────────┘

 QL (MANAGER/BOSS)                    BE modules                                  DB
 ─────────────────                    ──────────────────────────────────────────  ─────────────────────────
 /ql/chi-so       ──► GET /meter-readings/due ──┐
                  ──► POST /meter-readings ─────┤ meters ──┐
 /ql/hoa-don      ──► GET /invoices(/:id)       │          │   common/money:         meter_readings
                  ──► POST /invoices/:id/issue  │          ├─► period.ts (có sẵn)    invoices
                      · /payment · /reissue     ├ billing ─┤   tiers.ts              invoice_lines
                      · /remind                 │          │   consumption.ts        payments
 /ql/hop-dong/:id ──► POST /contracts/:id/settlement?dryRun │   invoice-calc.ts      settlements
                  ──► POST /settlements/:id/refund-paid     │   settlement-calc.ts   bank_transactions
                  ──► POST /contracts/:id/monthly-invoices  │   vietqr.ts            audit_logs
 /ql (Boss)       ──► GET /dashboard (nhóm tiền) ─ notifications                     notifications
 /ql/giao-dich    ──► GET /bank-transactions ───┐
                  ──► POST /…/assign · /mark-refunded ─ bank ◄── POST /webhooks/bank ◄── nhà cung cấp
 THUÊ (TENANT)    ──► GET /me/invoices(/:id)  (billing, DRAFT bị ẩn, no-store)
```

Quy ước bắt buộc (nhắc lại từ `CLAUDE.md`): toàn bộ toán tiền là số nguyên đồng trong BE; mỗi luồng nhiều bước nằm trong **một** `prisma.$transaction`; đổi trạng thái bằng update có điều kiện (`where: { id, status: 'UNPAID' }`), 0 dòng = `CONFLICT_STATE`; mọi ngày đi qua helper `today.ts`/`period.ts`; mỗi hành động tiền ghi `audit_logs` (G-10).

### File dự kiến thêm (tên có thể đổi trong PLAN của từng phần)

| Phần | File | Việc |
|---|---|---|
| P4-1 | `src/common/money/tiers.ts`, `consumption.ts`, `invoice-calc.ts` (+ `.spec.ts`) | bậc điện, tiêu thụ qua các mốc, tính dòng hóa đơn (hàm thuần, không I/O) |
| P4-1 | `src/common/date/period.ts` (sửa) | thêm `periodContaining(date)`, `billingMonthOf(period)`, danh sách kỳ đến ngày X |
| P4-2 | `src/modules/meters/{meters.module,meters.controller,meters.service}.ts`, `dto/` | MTR-09, MTR-11 |
| P4-2 | `src/modules/billing/invoice-issue.service.ts`, `monthly-invoice.service.ts` | BIL-07, BIL-08, BIL-21 |
| P4-2 | `src/jobs/monthly-invoice.job.ts` | BIL-05, BIL-06, D-21 |
| P4-3 | `src/jobs/late-readings.job.ts`, `src/jobs/invoice-reminder.job.ts`, `src/modules/notifications/notify.service.ts` | NOTI-10, NOTI-05, NOTI-04/07 |
| P4-4 | `src/modules/billing/{invoices-read.service,invoice-reissue.service}.ts`, `me-invoices.controller.ts`, `src/common/money/vietqr.ts` | BIL-10/11/12, SCOPE-03 |
| P4-5 | `src/modules/bank/{bank.module,webhook.controller,bank.service,bank-transactions.controller}.ts`, `adapters/{sepay,casso}.ts` | BANK-01..07 |
| P4-6 | `src/modules/billing/settlement.service.ts`, `src/common/money/settlement-calc.ts` | BIL-13..20 |
| P4-7 | `src/pages/staff/{MetersPage,InvoicesPage,InvoiceDetailPage,BankTransactionsPage}.tsx`, `src/features/{meters,invoices,bank}/` | trang nhân sự |
| P4-8 | `src/pages/tenant/{TenantInvoicesPage,TenantInvoiceDetailPage}.tsx`, `src/features/invoices/tenant*` | trang người thuê song ngữ |

---

## 4. Các phần và thứ tự

Mỗi ⏸ là điểm dừng: báo cáo, chủ dự án kiểm và commit, rồi mới tiếp. Phần nào ghi "Reviewer: có" thì chạy reviewer trên thay đổi chưa commit **trước khi dừng** và đưa báo cáo đầy đủ vào checkpoint.

| Phần | Việc | Mã task | Cần trước | Planner | Reviewer |
|---|---|---|---|---|---|
| P4-0 | Chủ dự án: trả lời Q-P4-1..12, chọn nhà cung cấp webhook (Q-03), điền `BANK_WEBHOOK_SECRET` và `settings.bank_account` thật, đưa bảng bậc điện thật (Q-02) | – | – | – | – |
| P4-1 | Toán tiền: kỳ, tháng lẻ, bậc điện, tiêu thụ, tính hóa đơn (hàm thuần) | BE-P4-01..05 | – (Q-P4-5 cho MTR-08) | không | **có** |
| P4-2 | Chỉ số + hóa đơn tháng: `/meter-readings/due`, nhập lô, job 00:05 + bù, phát hành, "Tạo hóa đơn kỳ này", nhóm việc hôm nay | BE-P4-06..13 | P4-1; Q-P4-1, Q-P4-5, Q-P4-9 | **có** | **có** |
| P4-3 | Mail: NOTI-10 (mùng 2→10) và nhắc hóa đơn 08:00 | BE-P4-14..17 | P4-2; Q-P4-1, Q-P4-4 | không | có |
| P4-4 | API hóa đơn + thu tiền: list/detail nhân sự, `/me/invoices`, VietQR mọi loại, ghi thu tay mọi loại, lập lại, nhắc tay | BE-P4-18..23 | P4-2; Q-P4-6, Q-P4-7 | không | **có** |
| P4-5 | Ngân hàng: adapter, webhook, khớp, trang giao dịch của Boss | BE-P4-24..28 | P4-4; Q-P4-2, Q-P4-3, Q-P4-11 | **có** | **có** |
| P4-6 | Quyết toán trả phòng có `dryRun`, hóa đơn FINAL, ghi đã trả lại cọc | BE-P4-29..33 | P4-4; Q-P4-8, Q-P4-10, Q-P4-12 | **có** | **có** |
| P4-7 | FE nhân sự: `/ql/chi-so`, `/ql/hoa-don(/:id)`, `/ql/giao-dich`, thẻ tiền ở `/ql`, quyết toán trong `/ql/hop-dong/:id` | FE-P4-01..09 | P4-4 đã commit (phần quyết toán cần P4-6, giao dịch cần P4-5) | **có** | không |
| P4-8 | FE người thuê song ngữ: `/thue` phần hóa đơn, `/thue/hoa-don(/:id)` | FE-P4-10..14 | FE-P4-01 (khung route) đã commit | không | không |
| P4-9 | QA và chốt phase | QA-P4-01..06 | tất cả | – | – |

```
P4-0 ─► P4-1 ─► P4-2 ─► P4-3 ─┐
                       └─► P4-4 ─┬─► P4-5 ─┐
                                 ├─► P4-6 ─┼─► P4-9
                                 └─► P4-7 ─┤   (P4-8 sau khung route của P4-7)
                                           └─► P4-8
```

Quy tắc chạy: backend nối tiếp P4-1 → P4-2 → P4-3 → P4-4, sau đó P4-5 và P4-6 **không** chạy song song nếu cùng sửa `billing.service.ts`/`payments`; P4-7 chạy song song được sau khi P4-4 đã commit. Mỗi agent bắt đầu với `git status` sạch.

### P4-1 · Toán tiền (BE-P4-01..05) — reviewer: có

- **BE-P4-01** Mở rộng `period.ts`: kỳ chứa một ngày (cho j của BIL-13), tháng thu của một kỳ, danh sách kỳ có `billingDate ≤ hôm nay`, hạn trả ngày cuối của tháng thu (BIL-01..04, BIL-22, D-40, D-41).
  Done when: test `BIL-01`, `BIL-02` (80.645 / 2.500.000 / 2.416.667), `BIL-22` (967.742 … 1.583.333), `BIL-03`, `BIL-04` và một ca năm nhuận 2028 đúng từng ngày.
- **BE-P4-02** Bậc điện (`12-pricing.md` "Electric tier calculation"): chia theo `up_to` tăng dần, bậc cuối `up_to = null`, nhãn "Điện bậc {n} ({from}–{to} kWh)".
  Done when: 84 kWh → 50 × 3.000 + 34 × 3.500 = 269.000; 0 kWh → đúng một dòng "Điện (0 kWh)" số lượng 0, đơn giá bậc 1, tiền 0.
- **BE-P4-03** Tiêu thụ giữa các mốc (MTR-05): cộng từng cặp liên tiếp, mốc thay đồng hồ dùng `old_meter_final`; đầu kỳ 1 là mốc `is_opening` của **chính hợp đồng** (MTR-02, Q-P3-12/13), đầu kỳ k>1 là mốc chốt kỳ k−1 của chính hợp đồng.
  Done when: ca MTR "thay đồng hồ 20/09 → 16 + 40 = 56 kWh"; ca giao nhận cùng ngày 1.284 / 1.290 / 1.350 → khách mới 60 kWh, 6 kWh khoảng trống không tính cho ai.
- **BE-P4-04** Tính hóa đơn MONTHLY (hàm thuần, BIL-07): dòng RENT, ELECTRIC theo bậc, WATER (PER_M3 theo m³ / PER_PERSON theo số người), SERVICE unit ROOM × 1, SERVICE unit PERSON × số người, PARKING theo xe của dịch vụ; tháng lẻ nhân tỉ lệ ngày cho **mọi dòng cố định** (D-41, A-21, một lần làm tròn nửa lên cho mỗi dòng); đếm người theo Q-P3-18 (người mới +1 đơn vị trong tháng `move_in_date`, kể cả vào và đi trong cùng tháng; người có sẵn tính khi `move_out_date` null hoặc > `period_start`); đếm xe theo Q-P3-20 (giao nhau với tháng thu, kể cả xe đã `is_active = false` cuối tháng); thiếu đơn giá đã duyệt tại `period_start` → `RATE_PLAN_MISSING`; cờ bất thường MTR-08 (A-04).
  Done when: test `BIL-09` ra **3.119.000 đ** với đúng 7 dòng của spec; `total` = tổng `amount`; vào ở 20/03 lấy 12/31 tiền phòng và 12/31 từng dịch vụ cố định; đơn giá đổi hiệu lực 20/10 không áp cho kỳ 01/10–31/10, áp cho tháng 11 (D-09).
- **BE-P4-05** ⏸ `npm run lint`, `npm run test`, `npm run build`; reviewer (tiền) trước khi dừng.
  Done when: output thật được dán vào báo cáo; liệt kê `[ASSUMPTION]` đã dùng (A-21, A-04).

### P4-2 · Chỉ số và hóa đơn tháng (BE-P4-06..13) — planner + reviewer: có

- **BE-P4-06** Module `meters` + `GET /meter-readings/due` (MTR-09): mọi DRAFT MONTHLY trong phạm vi tòa, kèm phòng, người thuê, mốc trước, ngày thu, cờ quá hạn; draft quá hạn lên đầu; `?buildingId=` theo API-08.
  Done when: manager chỉ thấy tòa của mình, `buildingId` ngoài phạm vi → `OUT_OF_SCOPE`; draft của tháng trước xếp trước draft tháng này.
- **BE-P4-07** `POST /meter-readings` theo lô (MTR-11): mỗi phần tử kiểm riêng, trả thành công/lỗi theo từng phần tử; `value` < mốc trước và không phải thay đồng hồ → `METER_VALUE_DECREASED` (MTR-03, MTR-04); `read_on ≥ p(k) − 2 ngày` (MTR-10); không cần ảnh (D-38); nước vẫn ghi cả khi `PER_PERSON` (MTR-06).
  Done when: ca nghiệm thu MTR "nhập điện cho tòa PER_PERSON thì phát hành luôn, tòa PER_M3 chờ nước"; hai nhân sự nhập cùng phòng/ngày song song → một bên lỗi, không có hai dòng.
- **BE-P4-08** Tự tính và phát hành khi đủ chỉ số (BIL-07, BIL-08): `UNPAID`, `issue_date` = hôm nay, `due_date` = ngày cuối của tháng thu, `meta` ghi id/giá trị/ngày của mốc đầu và cuối; MTR-08 thì giữ DRAFT chờ bấm "Phát hành"; thông báo người thuê theo Q-P4-1.
  Done when: hóa đơn kỳ 01/09–30/09 phát hành 01/10 hạn 31/10 (BIL-01); `total` = tổng dòng (DB-B4); tiêu thụ gấp hơn 2 lần trung bình 3 kỳ trước → vẫn DRAFT kèm cờ.
- **BE-P4-09** `POST /invoices/:id/issue`: chỉ DRAFT, tính lại tại thời điểm bấm, nhân sự trong phạm vi, audit `invoice.issue`.
  Done when: DRAFT thiếu chỉ số → `CONFLICT_STATE`; hóa đơn đã UNPAID → `CONFLICT_STATE`; manager tòa khác → `OUT_OF_SCOPE`.
- **BE-P4-10** Job `monthly-invoice` 00:05 + lúc khởi động (BIL-05, D-21): mọi hợp đồng ACTIVE có k với `hôm nay − 7 ngày ≤ p(k) ≤ hôm nay` và chưa có hóa đơn MONTHLY chưa hủy → tạo DRAFT đúng ngày kỳ k; vi phạm UK = "đã có", không phải lỗi; đếm riêng kỳ quá 7 ngày trong dòng tổng kết.
  Done when: cả 3 ca nghiệm thu bù của BIL-05 (tắt 23:50 30/09 → 01:00 01/10; không chạy 01/10 và 02/10 → chạy 03/10 tạo một lần; ngày thu cách 8 ngày → không tạo, có đếm); chạy hai lần cùng ngày vẫn một DRAFT.
- **BE-P4-11** Cùng job: chuyển ca gia hạn (BIL-06, A-09) — hợp đồng gia hạn đã ký có `start_date ≤ hôm nay` và hợp đồng trước còn ACTIVE → cũ `ENDED` + `ended_at`, mới `ACTIVE` + `moved_in_at`, copy người ở và xe đang hoạt động (CON-18, CON-19); BIL-05 chạy trước nên DRAFT kỳ N của hợp đồng cũ đã có. Tạo hợp đồng gia hạn vẫn là Phase 5: test dựng sẵn hàng gia hạn.
  Done when: ca nghiệm thu "BIL-06 bù: ngày chuyển bị bỏ được chuyển ở lần chạy sau, sau khi DRAFT kỳ N của hợp đồng cũ đã được tạo".
- **BE-P4-12** `POST /contracts/:id/monthly-invoices { periodNo }` (BIL-21) + nhóm việc hôm nay (NOTI-06): draft chờ chỉ số (đỏ từ mùng 2, D-42), kỳ chưa có hóa đơn quá 7 ngày, hóa đơn quá hạn, hợp đồng sắp hết hạn 30 ngày và hợp đồng quá hạn chưa xử lý (CON-20, CON-21).
  Done when: ca nghiệm thu BIL-21 (tắt 30/09→11/10: không tự tạo, nút tạo được kỳ 01/09–30/09, bấm lần hai → `CONFLICT_STATE`); `periodNo` ngoài 1..N → `VALIDATION_FAILED`; ngày thu ở tương lai → `CONFLICT_STATE`; manager tòa khác → `OUT_OF_SCOPE`; audit `invoice.create_missed`.
- **BE-P4-13** ⏸ lint + test + build + e2e (chốt chỉ số → phát hành trên DB dev); reviewer.
  Done when: output thật; `cleanup.mjs` ở chế độ list sạch cho lượt này.

### P4-3 · Mail (BE-P4-14..17) — reviewer: có

- **BE-P4-14** Job 08:00 mùng 2→mùng 10 + bù lúc khởi động trong khoảng đó, tối đa một mail/ngày (NOTI-10, D-42): mọi DRAFT MONTHLY đã qua ngày thu ít nhất một ngày trọn, kể cả draft tháng trước; gom theo tòa kèm quản lý; nêu phòng, người thuê, thiếu chỉ số nào; danh sách rỗng hoặc Boss không có email → không gửi, chỉ log; tiếng Việt (LOC-06); lỗi gửi log và thử lại một lần (NOTI-07).
  Done when: test `NOTI-10` cho mùng 2, mùng 10 (gửi) và mùng 11 (không gửi); chạy hai lần trong ngày → một mail; không có draft → không gửi.
- **BE-P4-15** Job 08:00 nhắc hóa đơn (NOTI-05): đến hạn ngày mai; quá hạn ngày 1, 4, 7… sau `due_date`; hợp đồng hết hạn trong 30 và 7 ngày (người thuê + quản lý); chỉ gửi cho người có email (NOTI-04), ngôn ngữ theo `users.locale` (LOC-06); bù hay bỏ theo Q-P4-4.
  Done when: hóa đơn hạn 31/10 → nhắc 30/10; quá hạn được nhắc đúng ngày 1/4/7, không nhắc ngày 2, 3; chạy hai lần cùng ngày không nhắc trùng.
- **BE-P4-16** Mẫu mail trong `settings.email_templates` theo khuôn `emailTemplate` (NOTI-07) với danh sách placeholder bắt buộc; nhớ cập nhật `EXPECTED_COUNTS` nếu seed thêm khóa.
  Done when: mẫu tùy biến thiếu placeholder bắt buộc → dùng mẫu mặc định; test danh sách khóa mẫu khớp spec.
- **BE-P4-17** ⏸ lint + test + build; reviewer. Done when: output thật, nêu `[ASSUMPTION]`.

### P4-4 · API hóa đơn và thu tiền (BE-P4-18..23) — reviewer: có

- **BE-P4-18** `GET /invoices?buildingId&status&type&overdue&period` + `GET /invoices/:id` (nhân sự trong phạm vi): phân trang API-02, "Quá hạn" là trạng thái suy ra (không lưu), chi tiết có dòng, mốc chỉ số, VietQR khi UNPAID.
  Done when: lọc `overdue=true` chỉ ra UNPAID có `due_date` < hôm nay (giờ Hà Nội); manager tòa khác → `OUT_OF_SCOPE`.
- **BE-P4-19** `GET /me/invoices` + `GET /me/invoices/:id` (SCOPE-03, API-07): ẩn DRAFT, GUEST → `FORBIDDEN`, hóa đơn của người khác → `NOT_FOUND`, `Cache-Control: no-store`, VietQR + `qrImageUrl` (BIL-10).
  Done when: DRAFT không xuất hiện ở cả list và detail; hóa đơn hợp đồng khác của cùng người thuê vẫn xem được.
- **BE-P4-20** Mở `POST /invoices/:id/payment` cho mọi loại hóa đơn (BIL-11): số tiền luôn bằng tổng, `method` CASH/BANK_TRANSFER/CARD/OTHER, trigger đặt PAID, idempotency API-05, audit `payment.record`, thông báo người thuê theo Q-P4-1.
  Done when: hóa đơn MONTHLY và FINAL ghi thu được; ghi hai lần (song song) → một bên `INVOICE_NOT_UNPAID`, chỉ một `payments`; hóa đơn PAID/CANCELLED → `INVOICE_NOT_UNPAID`.
- **BE-P4-21** `POST /invoices/:id/reissue { reason, corrections }` (BIL-12): chỉ DRAFT/UNPAID; hủy kèm `cancel_reason`, sửa chỉ số theo Q-P4-6, tạo hóa đơn mới cùng kỳ với `replaces_id`, tính lại, phát hành; PAID → `CONFLICT_STATE`.
  Done when: ca nghiệm thu "lập lại để lại đúng một hóa đơn chưa hủy cho kỳ đó" (UK `invoices_one_per_period`); audit `invoice.reissue`.
- **BE-P4-22** `POST /invoices/:id/remind` theo Q-P4-7.
  Done when: hóa đơn không UNPAID → `CONFLICT_STATE`; quá giới hạn trong ngày → `TOO_MANY_REQUESTS`.
- **BE-P4-23** ⏸ lint + test + build + e2e (phát hành → ghi thu tay → PAID); reviewer.

### P4-5 · Ngân hàng (BE-P4-24..28) — planner + reviewer: có

- **BE-P4-24** Adapter `BankWebhookAdapter` (17-bank) với `verify` so sánh hằng thời gian bằng `BANK_WEBHOOK_SECRET` và `parse` nhiều giao dịch; chỉ xử lý giao dịch **ghi có** vào số tài khoản trong `settings.bank_account`; nhà cung cấp theo Q-P4-2; nếu cần raw body thì chỉ cho route này.
  Done when: chữ ký sai → 401 `WEBHOOK_SIGNATURE_INVALID`, không ghi dòng nào; giao dịch ghi nợ hoặc sai số tài khoản → bỏ qua; `BANK_WEBHOOK_SECRET` trống → route trả 503 và app vẫn khởi động.
- **BE-P4-25** `POST /webhooks/bank` (BANK-01, BANK-02): mỗi giao dịch một DB transaction, chèn `bank_transactions` trước, trùng UK `(provider, provider_tx_id)` → bỏ qua; luôn trả 200 nhanh khi chữ ký đúng; `raw` được lưu, bí mật không bao giờ vào DB (BANK-07).
  Done when: cùng webhook gửi hai lần → một dòng giao dịch, một `payments`; một webhook chứa 3 giao dịch được xử lý độc lập, một lỗi không cuốn hai cái còn lại.
- **BE-P4-26** Khớp (BANK-03, BANK-04): tìm `/TT(\d+)/i` trong `content`; chỉ khớp khi hóa đơn tồn tại, `UNPAID` và `total = amount` → `MATCHED` + `payments` (`source = WEBHOOK`, `method = BANK_TRANSFER`, `bank_transaction_id`) → trigger PAID + thông báo; còn lại `UNMATCHED`.
  Done when: 4 ca nghiệm thu của 17-bank ("TT1523 P203" đúng tổng → PAID; thiếu 1 đ → UNMATCHED và hóa đơn vẫn UNPAID; chuyển lần hai cho hóa đơn đã PAID → UNMATCHED; chữ ký sai → 401 không có dòng).
- **BE-P4-27** `GET /bank-transactions?status&from&to`, `POST /bank-transactions/:id/assign { invoiceId }`, `POST /bank-transactions/:id/mark-refunded { note }` — **chỉ BOSS** (BANK-05, API-07): gán khi hóa đơn UNPAID và `total = amount`, trạng thái `ASSIGNED`, `payments.source = ASSIGNED`, `recorded_by_id` = Boss; audit.
  Done when: MANAGER gọi → `FORBIDDEN`; gán sai số tiền → `PAYMENT_AMOUNT_MISMATCH`; đã gán rồi → `CONFLICT_STATE`; đánh dấu đã hoàn cần `note`.
- **BE-P4-28** ⏸ lint + test + build + e2e webhook (khớp và không khớp); reviewer. Ghi rõ BANK-08 chưa làm (Q-P4-3).

### P4-6 · Quyết toán trả phòng (BE-P4-29..33) — planner + reviewer: có

- **BE-P4-29** `settlement-calc.ts` (hàm thuần, BIL-13..18): j = kỳ chứa `moveOutDate` (j = N nếu ≥ `end_date`); `last_period_amount` theo BIL-14 (kỳ j chưa phát hành → tiền phòng đủ + dịch vụ/xe đủ theo A-01; điện nước từ mốc chốt cuối đã phát hành tới mốc cuối; DRAFT bị gộp); `remaining_rent` theo BIL-15 (kỳ cuối lẻ prorate theo D-41); `previous_debt` theo BIL-16; `net` theo BIL-17.
  Done when: ca nghiệm thu "dọn sớm 25/11/2026 hợp đồng BIL-01, cọc 2.500.000: j = 3, `remaining_rent` = 3 × 2.500.000, net âm → tổng hóa đơn FINAL = −net"; ca "hợp đồng đã phát hành kỳ N, quyết toán sau 10 ngày → chỉ điện nước 10 ngày đó".
- **BE-P4-30** `POST /contracts/:id/settlement?dryRun=true` (BIL-13, UI-06): trả đúng cùng số liệu như lượt ghi thật, không ghi gì, `no-store`; từ chối khi còn kỳ chưa có hóa đơn (A-10) với thông báo "Còn kỳ chưa có hóa đơn, hãy tạo hóa đơn kỳ đó trước"; chỉ hợp đồng ACTIVE (HOLD dùng CON-12); `moveOutDate` theo Q-P4-10.
  Done when: ca A-10 (`CONFLICT_STATE`, sau khi bấm "Tạo hóa đơn kỳ này" thì quyết toán chạy được); `dryRun` không tạo dòng nào trong `settlements`/`invoices`.
- **BE-P4-31** Ghi thật trong **một** transaction (BIL-18, BIL-19): mốc chỉ số cuối, dòng `settlements`, hóa đơn FINAL khi `net < 0` (các dòng period-j, `REMAINING_RENT` mỗi kỳ còn lại, `PREVIOUS_DEBT` mỗi hóa đơn gộp, `DAMAGE`, `DEPOSIT_FORFEIT`, `DEPOSIT_OFFSET` âm; tổng = −net), hạn trả theo Q-P4-12; hóa đơn UNPAID cũ → `SETTLED` + `settlement_id`; DRAFT bị hủy với lý do "Gộp vào thanh lý"; hợp đồng `ENDED` + `ended_at`; người ở có `move_out_date`; xe `is_active = false`; phòng về "Trống"; tài khoản người thuê bị vô hiệu nếu không còn hợp đồng HOLD/ACTIVE (thu hồi session); audit; thông báo người thuê.
  Done when: CHECK `settlements_net` và `settlements_final_invoice` không bao giờ bị DB chặn (BE tính trước); `net ≥ 0` → không có hóa đơn FINAL; quyết toán hai lần → `CONFLICT_STATE` (UK `settlements.contract_id`); A-06/BIL-20: ngày ở quá hạn chỉ vào được qua `damages` kèm ghi chú.
- **BE-P4-32** `POST /settlements/:id/refund-paid` (Q-P3-3) theo Q-P4-8: đặt `refund_paid_at` một lần, audit; lưu ý CHECK của DB chỉ cho ghi khi `net > 0`.
  Done when: `net ≤ 0` → `CONFLICT_STATE`; gọi lần hai → `CONFLICT_STATE` (hoặc trả lại kết quả cũ nếu có `Idempotency-Key`).
- **BE-P4-33** ⏸ lint + test + build + e2e (quyết toán dry-run → ghi thật → FINAL → ghi thu); reviewer.

### P4-7 · FE nhân sự (FE-P4-01..09) — planner: có

- **FE-P4-01** Khung route và menu của cả phase: `/ql/chi-so`, `/ql/hoa-don`, `/ql/hoa-don/:id`, `/ql/giao-dich` (Boss); cập nhật mọi test đọc `routes[0..2]`, stub trang mới và mảng menu mong đợi (bài học FE-EX-03, FE-P3-01). Done when: `npm run test:components` và `npm run build` đạt, guard theo vai trò đúng.
- **FE-P4-02** `/ql/chi-so` (MTR-09, MTR-11, UI-07 — 360 px trước): danh sách draft đến hạn, ô số điện/nước, ảnh tùy chọn, cờ bất thường, phòng còn thiếu sau mùng 1 hiện đỏ (D-42), lưu theo lô và hiện kết quả từng dòng. Done when: 4 trạng thái UI-03; lỗi `METER_VALUE_DECREASED` hiện đúng ô.
- **FE-P4-03** `/ql/hoa-don`: lọc theo tòa/trạng thái/loại/quá hạn/kỳ, nhãn trạng thái từ bản đồ chung (UI-02). Done when: nhãn "Nháp/Chưa thanh toán/Đã thanh toán/Đã quyết toán/Đã hủy/Quá hạn" đúng 16-billing.
- **FE-P4-04** `/ql/hoa-don/:id`: dòng hóa đơn, dòng bậc điện, mốc chỉ số, VietQR; "Phát hành", "Ghi thu tay" (chọn phương thức + hộp xác nhận nêu số tiền, UI-04), "Lập lại", "Nhắc". Done when: mọi hành động tiền đều có hộp xác nhận nêu số tiền; không có phép tính nào ở FE (UI-06).
- **FE-P4-05** Thẻ tiền ở `/ql` (NOTI-06): "Chờ chỉ số", thẻ đỏ "Kỳ chưa có hóa đơn" liệt kê từng kỳ thiếu kèm nút "Tạo hóa đơn kỳ này" (xác nhận rồi mở "Chốt chỉ số"), "Hóa đơn quá hạn", "Hợp đồng quá hạn".
- **FE-P4-06** Quyết toán trong `/ql/hop-dong/:id`: form ngày trả phòng, chỉ số cuối, hư hỏng, cọc giữ lại; xem trước bằng `dryRun` rồi xác nhận; nút "Đã trả lại tiền" khi `net > 0`.
- **FE-P4-07** `/ql/giao-dich` (Boss): không khớp lên đầu, gán vào hóa đơn, đánh dấu đã hoàn (chỗ của "báo lỗi thanh toán" để trống tới Phase 5).
- **FE-P4-08** `/thue` phần "hóa đơn cần trả" + ngày thu kế tiếp (dòng Phase 4 của 30-frontend) — làm cùng FE-P4-01 nếu tiện, nếu không thì thuộc P4-8.
- **FE-P4-09** ⏸ `npm run lint`, `npm run build`, `npm run test:components` (chạy lại một lượt khi có ca nhạy thời gian, bài học 13/11).

### P4-8 · FE người thuê (FE-P4-10..14)

- **FE-P4-10** `/thue/hoa-don`: danh sách, chưa thanh toán/quá hạn lên đầu, 4 trạng thái UI-03.
- **FE-P4-11** `/thue/hoa-don/:id`: dòng + dòng bậc điện + mốc chỉ số (kèm ảnh nếu có, D-38), ảnh VietQR và nội dung `TT{id}` có nút copy, tự làm mới trạng thái khi focus.
- **FE-P4-12** Song ngữ (LOC-01, UI-12): toàn bộ chữ mới vào từ điển vi/en, tiền `2.984.000 đ` và ngày `dd/mm/yyyy` ở cả hai (LOC-05).
- **FE-P4-13** Nút "Báo lỗi thanh toán" theo Q-P4-14 (đề xuất: ẩn tới Phase 5).
- **FE-P4-14** ⏸ lint + build + test:components; kiểm tay ở 360 px.

### P4-9 · QA và chốt phase (QA-P4-01..06)

- **QA-P4-01** Chạy hết mục "Acceptance" của `15-meters.md`, `16-billing.md` (16 dòng), `17-bank.md` (5 dòng) và các dòng tiền của `14-contracts.md`; đánh dấu từng dòng kèm tên test.
- **QA-P4-02** `node prisma/check-constraints.mjs . prisma` — báo **số thật** bộ kiểm in ra (gần nhất 107/107); thêm kịch bản nếu có đổi ràng buộc.
- **QA-P4-03** e2e trên DB dev theo lệnh trong `docs/LESSONS.md` (`.env` ở `Source/backend`): chốt chỉ số → phát hành → webhook khớp → quyết toán; chạy riêng ca nghi ngờ trước khi kết luận lỗi logic (bài học QA-P3-02 về khóa advisory và timeout 30 s).
- **QA-P4-04** Hồi quy: đăng nhập 4 vai trò + lối vào (D-43), lịch hẹn, giá và duyệt giá, trang công khai, vòng cọc của Phase 3 (ký → thu cọc → vào ở → hủy).
- **QA-P4-05** `scripts/e2e/cleanup.mjs` chế độ list (chỉ `--apply` khi chủ dự án đồng ý); dọn dữ liệu thử của lượt này.
- **QA-P4-06** ⏸ Cập nhật `PROGRESS.md`, `docs/spec/README.md` mục Status, `02-database.md` nếu schema đổi, `LESSONS.md`; viết `p4-9-qa-checklist.md`; đề nghị thông điệp commit kèm mã task và mã spec.

---

## 5. Ma trận yêu cầu

| Luật spec | Phần |
|---|---|
| BIL-01, BIL-02, BIL-03, BIL-04, BIL-22, D-40, D-41, A-21, "Electric tier calculation" (12-pricing), MTR-05, RATE-04, D-09 | P4-1 |
| BIL-05, BIL-06, BIL-07, BIL-08, BIL-21, D-21, A-09, A-10 (phần chặn), MTR-02, MTR-03, MTR-04, MTR-06, MTR-07, MTR-08, MTR-09, MTR-10, MTR-11, D-38, NOTI-06, CON-20, CON-21, Q-P3-18, Q-P3-20, DB-B2, DB-B3, DB-B4 | P4-2 |
| NOTI-10, D-42, NOTI-05, NOTI-04, NOTI-07, LOC-06, Q-06 (sau khi trả lời) | P4-3 |
| BIL-10, BIL-11, BIL-12, MTR-12, G-09, API-05, API-07, API-08, SCOPE-02, SCOPE-03, G-10/AUD-01 | P4-4 |
| BANK-01, BANK-02, BANK-03, BANK-04, BANK-05, BANK-07, D-10, D-12 (phần Boss gán/hoàn) | P4-5 |
| BIL-13, BIL-14, BIL-15, BIL-16, BIL-17, BIL-18, BIL-19, BIL-20, A-01, A-06, A-10, D-14, Q-P3-3 | P4-6 |
| 30-frontend: `/ql`, `/ql/chi-so`, `/ql/hoa-don`, `/ql/hoa-don/:id`, `/ql/giao-dich`, phần quyết toán của `/ql/hop-dong/:id`; UI-01..09, UI-07 | P4-7 |
| 30-frontend: `/thue` (phần Phase 4), `/thue/hoa-don`, `/thue/hoa-don/:id`; LOC-01, LOC-05, UI-07, UI-12 | P4-8 |
| Mục Acceptance của 15, 16, 17 và các dòng tiền của 14; DB check; e2e | P4-9 |
| BANK-06, BANK-08, NOTI-01..03, CON-17..19 (tạo), REQ-07, RPT | **không thuộc Phase 4** (xem §1) |

---

## 6. Câu hỏi cho chủ dự án (chỉ những chỗ spec không trả lời hoặc ghi `[OPEN]`)

| # | Câu hỏi | Lựa chọn | Đề xuất | Chặn |
|---|---|---|---|---|
| **Q-P4-1** | BIL-08 và BANK-03 nói "thông báo người thuê (trong ứng dụng + email)", nhưng hộp thư `/thue/thong-bao` thuộc Phase 5. Phase 4 làm gì? | **A** ghi dòng `notifications` ngay (bảng đã có, Phase 5 chỉ thêm trang) + gửi email · **B** chỉ gửi email, Phase 5 mới ghi thông báo · **C** chưa làm gì cả | **A**: rẻ, không mất dữ liệu, không cần UI mới | P4-2, P4-3, P4-4, P4-5 |
| **Q-P4-2** | Q-03 vẫn `[OPEN]`: nhà cung cấp webhook và ngân hàng. Enum DB đã có `SEPAY` và `CASSO` | **A** chọn SePay bây giờ · **B** chọn Casso · **C** chỉ làm interface + một adapter "giả" cho test, chọn nhà cung cấp lúc go-live | **A** nếu bạn đã có tài khoản; nếu chưa thì **C** rồi thêm adapter thật sau (một task nhỏ) | P4-5 |
| **Q-P4-3** | Q-04/BANK-08: job đối chiếu giao dịch bỏ sót có làm trong Phase 4? | **A** không làm, chỉ nhắc nợ và Boss gán tay · **B** làm khi nhà cung cấp có API liệt kê giao dịch · **C** làm luôn với một nhà cung cấp cụ thể | **A** cho Phase 4; chỉ làm sau khi trả lời Q-04 | P4-5 (một task tùy chọn) |
| **Q-P4-4** | Q-06 `[OPEN]`: nếu lượt 08:00 bị bỏ (server tắt) thì nhắc hóa đơn NOTI-05 có gửi muộn không? (NOTI-10 đã quy định là bù) | **A** bù một lần lúc khởi động nếu hôm nay chưa gửi · **B** bỏ luôn ngày đó · **C** bù cả các ngày đã mất | **A**: giống NOTI-10, không spam | P4-3 |
| **Q-P4-5** | MTR-08/A-04 cảnh báo bất thường > 2× trung bình 3 kỳ trước. Khi hợp đồng chưa có 3 kỳ trước thì sao? | **A** không cảnh báo, hóa đơn tự phát hành · **B** so với số kỳ đang có (1–2 kỳ) · **C** luôn chờ bấm "Phát hành" ở kỳ 1 | **A**: tránh chặn mọi khách mới | P4-1, P4-2 |
| **Q-P4-6** | BIL-12 `corrections` chưa được spec định nghĩa. Lập lại hóa đơn được sửa những gì? | **A** chỉ chỉ số điện/nước của kỳ đó (kèm trường thay đồng hồ) rồi tính lại tất cả · **B** thêm sửa số người/số xe của kỳ · **C** cho nhân sự sửa trực tiếp từng dòng tiền | **A**: giữ mọi toán tiền trong BE, ít chỗ sai | P4-4 |
| **Q-P4-7** | `POST /invoices/:id/remind` có trong bảng API nhưng không có luật. Nó làm gì? | **A** gửi lại mail + thông báo nhắc nợ cho hóa đơn UNPAID, tối đa 1 lần/hóa đơn/ngày · **B** chỉ gửi mail, không giới hạn · **C** không làm route này trong Phase 4 | **A** | P4-4 |
| **Q-P4-8** | `POST /settlements/:id/refund-paid` (Q-P3-3 đã chuyển sang Phase 4) cần nhập gì? CHECK của DB chỉ cho ghi khi `net > 0` | **A** `{ method, paidAt?, note? }`, đặt `refund_paid_at` một lần, không hoàn tác · **B** chỉ `{ note? }`, thời điểm = lúc bấm · **C** thêm quyền sửa lại cho Boss | **A**: khớp cách ghi thu tay (D-11) và còn dấu vết | P4-6 |
| **Q-P4-9** | MTR-12 cho sửa một mốc chỉ số khi chưa có hóa đơn đã phát hành dùng nó, nhưng bảng API không có route sửa | **A** không có route sửa; sai thì lập lại hóa đơn (BIL-12) · **B** thêm `PATCH /meter-readings/:id` chỉ khi chưa phát hành · **C** cho xóa mốc nhập sai | **A** cho Phase 4; thêm B nếu quản lý nhập sai nhiều | P4-2 |
| **Q-P4-10** | BIL-13 không giới hạn `moveOutDate`. Cho phép ngày nào? | **A** từ `start_date` đến hôm nay (quyết toán khi khách đã đi) · **B** cho cả ngày tương lai ≤ 30 ngày (chốt trước) · **C** bất kỳ ngày trong hợp đồng | **A**: chỉ số cuối là số đọc thật nên phải ở quá khứ hoặc hôm nay | P4-6 |
| **Q-P4-11** | 30-frontend ghi trang Cài đặt có "webhook toggle", nhưng không có luật nào. Phase 4 có công tắc bật/tắt webhook không? | **A** không có, route luôn bật, chỉ kiểm chữ ký · **B** một khóa `settings.webhook` để tắt khi cần (trang Cài đặt ở Phase 5) | **A**: ít mã, bật/tắt bằng cách đổi secret | P4-5 |
| **Q-P4-12** | BIL-18 ghi hóa đơn FINAL "hạn = hôm nay + `due_days`", nhưng `due_days` chưa được định nghĩa ở đâu trong spec | **A** hôm nay + 7 ngày · **B** mùng 9 của tháng sau (giống hóa đơn tháng, D-40) · **C** hôm nay + 3 ngày · **D** một khóa `settings` để bạn tự đổi | **A**: khách đã trả phòng nên không chờ chu kỳ tháng | P4-6 |
| (nhắc) | **Q-02** bảng bậc điện thật của từng tòa | dùng giá seed (0–50: 3.000 · 51–100: 3.500 · 101+: 4.000; nước 15.000 đ/m³) tới khi bạn đưa số thật | không chặn code | – |
| (nhắc) | **Q-01** khách đi sớm vẫn trả tiền tới hết hạn: có cho thuê lại phòng đó không | BIL-15 vẫn thu đủ tiền phòng còn lại; nếu bạn muốn giảm trừ thì đó là việc của Phase 5 | không chặn code | – |

`[ASSUMPTION]` sẽ dùng và phải nêu lại ở mỗi checkpoint: **A-21** (làm tròn nửa lên một lần mỗi dòng), **A-04** (ngưỡng 2× cho cảnh báo bất thường), **A-01** (dịch vụ thu đủ kỳ đang ở, các kỳ sau chỉ tiền phòng), **A-06** (ngày ở quá hạn không tự thu), **A-09** (chuyển ca gia hạn không giới hạn 7 ngày), **A-10** (quyết toán bị chặn khi còn kỳ chưa có hóa đơn), **A-02** (hạn hóa đơn cọc).

---

## 7. Rủi ro và cách kiểm thử

### Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| **Làm tròn tiền** — chia tỉ lệ ngày, bậc điện và `DEPOSIT_OFFSET` âm dễ lệch 1 đ và vỡ CHECK `invoice_lines` / `settlements_net` | Chỉ số nguyên đồng, dùng BigInt như `proratedAmount` đang làm; làm tròn **đúng một lần cho mỗi dòng** (A-21), không làm tròn tổng; `total` = tổng dòng được test riêng; hóa đơn FINAL kiểm `tổng dòng = −net` trước khi ghi |
| **Job chạy hai lần / bị bỏ** | Chống trùng bằng khóa của DB (`invoices_one_per_period`), coi vi phạm UK là "đã có"; mốc ngày chạy trong `settings.job_state` (hoặc bảng `job_runs` nếu được duyệt); mỗi job log một dòng tổng kết; test "chạy hai lần cùng ngày" cho cả ba job |
| **An toàn webhook** | So sánh chữ ký hằng thời gian, bí mật chỉ ở env (BANK-07), không bao giờ ghi vào DB/log; chữ ký sai → 401 và **không** ghi dòng nào; chỉ xử lý ghi có vào đúng số tài khoản; không bao giờ tin `amount`/`content` để tạo hóa đơn, chỉ để khớp; luôn 200 khi chữ ký đúng để nhà cung cấp không gửi lại |
| **Múi giờ `Asia/Ho_Chi_Minh`** | Mọi "hôm nay", "mùng 1", "mùng 9", "cuối tháng" đi qua `today.ts`/`period.ts`; không `new Date()` trong logic; test các mốc 23:30 ngày cuối tháng, 00:05 mùng 1, tháng 28/29/30/31 ngày và năm nhuận 2028 |
| **DB dev chậm (0,3–0,8 s/truy vấn)** | Job và quyết toán giữ transaction ngắn, không chờ khóa trong transaction dài (bài học QA-P3-02: chờ khóa tính vào 30 s); e2e dùng `testTimeout` dài đã cấu hình; ca nghi ngờ chạy riêng trước khi kết luận |
| **Test danh sách cố định bị vỡ** | Thêm module vào `AppModule` → sửa `prisma.service.spec.ts`; thêm khóa seed → sửa `EXPECTED_COUNTS` ở `seed.spec.ts`; route FE mới → sửa test đọc `routes[0..2]` và mảng menu; không thêm mã lỗi nên test đếm mã không đổi |
| **BIL-06 chưa có đường tạo gia hạn** | Phase 4 chỉ làm bước chuyển ca; test dựng sẵn hàng hợp đồng gia hạn đã ký. Nêu rõ giới hạn này ở checkpoint của P4-2 |
| **Hóa đơn đã phát hành không được tính lại** | Sửa đơn giá, người ở, xe không bao giờ chạm vào hóa đơn đã phát hành (owner 20/11/2026); sai thì đi qua BIL-12 |

### Chiến lược test

- Giá trị mong đợi **lấy từ spec**, không lấy từ mã đang kiểm: BIL-01/02/22 (ngày kỳ và tiền phòng lẻ), BIL-09 (3.119.000 đ), 12-pricing (84 kWh → 269.000; 0 kWh → một dòng số lượng 0), MTR acceptance (56 kWh khi thay đồng hồ; 60 kWh khi giao nhận cùng ngày), 17-bank (4 ca webhook), CON-12 (net 1.500.000), BIL-18 (dọn sớm 25/11/2026 → `remaining_rent` 3 × 2.500.000). Mỗi test mang mã luật trong tên: `it('BIL-09: hóa đơn ví dụ 3.119.000 đ', …)`.
- Unit test bắt buộc theo `Source/backend/CLAUDE.md`: helper kỳ, bậc điện, tính hóa đơn, toán quyết toán, khớp webhook, scope guard.
- Ca đồng thời bắt buộc: hai lượt job cùng lúc tạo DRAFT (một dòng); ghi thu tay hai lần (`INVOICE_NOT_UNPAID`, một `payments`); webhook gửi lại cùng `provider_tx_id`; hai nhân sự nhập chỉ số cùng phòng/ngày; webhook và ghi thu tay cùng hóa đơn.
- Phạm vi và vai trò cho từng route: manager tòa khác → `OUT_OF_SCOPE`; TENANT gọi route nhân sự → `FORBIDDEN`; GUEST gọi `/me/invoices` → `FORBIDDEN`; người thuê khác → `NOT_FOUND`; route `/bank-transactions*` MANAGER → `FORBIDDEN`.
- Không `.skip`/`.only`, không mock thứ đang kiểm; mỗi spec có thể chạy riêng; spec nào boot `AppModule` phải ghi đè `MailerService` (bài học EX-8).

---

## 8. Quyền theo đối tượng

| Việc | GUEST | TENANT | MANAGER (tòa của mình) | BOSS |
|---|---|---|---|---|
| Nhập chỉ số, phát hành, ghi thu tay, lập lại, nhắc, tạo hóa đơn kỳ thiếu | ✘ | ✘ | ✔ | ✔ (mọi tòa) |
| Quyết toán trả phòng, ghi đã trả lại cọc | ✘ | ✘ | ✔ | ✔ |
| Xem hóa đơn của mình (ẩn DRAFT), VietQR | `FORBIDDEN` | ✔ của mình | ✔ trong phạm vi | ✔ |
| Giao dịch ngân hàng, gán, đánh dấu đã hoàn | ✘ | ✘ | `FORBIDDEN` | ✔ |
| Hóa đơn ngoài phạm vi | `FORBIDDEN` | 404 | `OUT_OF_SCOPE` | ✔ |
| `POST /webhooks/bank` | – | – | – | – (chỉ chữ ký nhà cung cấp) |

## 9. Việc của chủ dự án trước/trong Phase 4

1. Trả lời **Q-P4-1..12** (một lượt) — vài câu chặn ngay P4-2.
2. Chọn nhà cung cấp webhook (Q-03) và trả lời Q-04; tạo `BANK_WEBHOOK_SECRET` rồi điền vào `Source/backend/.env` (chỉ bạn sửa `.env*`).
3. Điền `settings.bank_account` thật (bankBin, accountNo, accountName) trước khi thu tiền thật — VietQR và nội dung `TT{id}` sinh từ đó.
4. Đưa bảng bậc điện và giá nước thật của từng tòa (Q-02); tới khi có, dùng giá seed.
5. Duyệt trước nếu một phần cần migration (xem §2), xóa file hay cài gói mới.
