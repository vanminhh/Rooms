# P4-6 · Quyết toán trả phòng và trả lại cọc (BE-P4-29..33)

Bản vẽ cho phiên chính. Không có mã nguồn trong file này. Đọc trước: `CLAUDE.md` (gốc), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`, `docs/phase-4-money/README.md` (D-44 — đặc biệt Q-P4-8 ghi đã trả lại cọc, Q-P4-10 khoảng ngày dọn đi, Q-P4-12 hạn FINAL hôm nay + 7, Q-P4-13 nước PER_PERSON không chia tỉ lệ ngày, Q-P4-15 chuyển ca gia hạn, Q-P4-24..27), `docs/phase-4-money/feature_p4-6-backend-settlement.md`, `plans/PHASE/PLAN.md` §2/§3/§7/§8 và mục P4-6, `docs/spec/16-billing.md` (Settlement BIL-13..20, BIL-21, BIL-12a, D-41), `docs/spec/14-contracts.md` (CON-12, CON-13/14, CON-20/21, D-26/A-16), `docs/spec/15-meters.md` (MTR-02..05, MTR-10, MTR-12), `docs/spec/00-overview.md` (D-12..D-14, D-26, D-38, D-41, D-44, A-01, A-06, A-10, A-16, A-21), `docs/spec/01-architecture.md` (API-02, API-05, API-07, bảng mã lỗi), `docs/spec/20-reports-audit-settings.md` (RPT-01, AUD-01..03), `docs/phase-3-contracts/README.md` (Q-P3-3).

---

## 1. Mục tiêu và phạm vi

**Mục tiêu:** khách trả phòng → nhân sự nhập ngày dọn đi, chỉ số cuối, hư hỏng, cọc giữ lại → **xem trước** (`dryRun`) thấy đúng từng khoản → xác nhận → **một** transaction đóng toàn bộ hợp đồng: cọc trừ nợ, hóa đơn FINAL nếu khách còn thiếu, hợp đồng `ENDED`, phòng về "Trống". Khi cọc còn dư, nhân sự bấm "Đã trả lại tiền" một lần.

### Trong phạm vi

| Nhóm | Nội dung | Mã |
|---|---|---|
| Toán thuần | `settlement-calc.ts`: j, `last_period_amount`, `remaining_rent`, `previous_debt`, `net`, các dòng hóa đơn FINAL | BIL-13..18, D-14, D-41, A-01, A-21 |
| Xem trước | `POST /contracts/:id/settlement?dryRun=true` — **cùng** số liệu như lượt ghi thật, không ghi gì, `no-store` | BIL-13, UI-06 |
| Chặn | Còn kỳ chưa có hóa đơn → `CONFLICT_STATE` + "Còn kỳ chưa có hóa đơn, hãy tạo hóa đơn kỳ đó trước" | A-10, BIL-21 |
| Ghi thật | Một `prisma.$transaction`: chỉ số cuối, dòng `settlements`, DRAFT gộp → `CANCELLED` "Gộp vào thanh lý", UNPAID → `SETTLED` + `settlement_id`, hóa đơn FINAL (UNPAID, hạn hôm nay + 7) khi `net < 0`, hợp đồng `ENDED` + `ended_at`, người ở `move_out_date`, xe `is_active = false`, audit `contract.settle`, thông báo | BIL-18, BIL-19, Q-P4-12 |
| Trả lại cọc | `POST /settlements/:id/refund-paid` `{ method, paidAt?, note? }`, một lần, không hoàn tác, chỉ `net > 0` | Q-P3-3, Q-P4-8 |

### Ngoài phạm vi

| Việc | Ở đâu |
|---|---|
| Hủy hợp đồng HOLD trước khi vào ở | **đã có**: CON-12 `contract-cancel.service.ts`, không sửa |
| Giảm trừ khi khách đi sớm mà phòng được cho thuê lại | Phase 5 (Q-01); BIL-15 vẫn thu đủ tiền phòng còn lại |
| Tự thu ngày ở quá `end_date` | Không làm (A-06, BIL-20): chỉ vào được qua `damages` kèm ghi chú |
| Tạo hợp đồng gia hạn (CON-17..19) | Phase 5; Phase 4 chỉ có bước chuyển ca BIL-06 (đã làm ở P4-2) |
| Trang `/ql/hop-dong/:id` phần quyết toán | FE-P4-06 (P4-7) |
| Hoàn tác một lượt quyết toán | Không có luật nào → **không làm**; sai thì chủ dự án quyết ở Phase 5 |
| Báo cáo doanh thu dùng `settlements` (RPT-01) | Phase 5 |

**Schema: không migration.** `settlements` (UK `contract_id`, CHECK `settlements_parts`/`_net`/`_final_invoice`/`_refund`), `invoices` (`settlement_id`, UK riêng phần `invoices_one_per_period` → mỗi hợp đồng đúng **một** FINAL vì `period_no = 0`), `invoice_lines` (CHECK `amount = quantity × unit_price`, chỉ `DEPOSIT_OFFSET` được đơn giá âm), enum `LineKind` (có đủ `REMAINING_RENT`, `PREVIOUS_DEBT`, `DAMAGE`, `DEPOSIT_FORFEIT`, `DEPOSIT_OFFSET`) đều đã có từ Phase 1. **Không dependency mới**, **không mã lỗi mới** (`CONFLICT_STATE`, `VALIDATION_FAILED`, `OUT_OF_SCOPE`, `NOT_FOUND`, `METER_VALUE_DECREASED`, `RATE_PLAN_MISSING` đã đủ → test đếm mã trong `app.setup.spec.ts` không đổi, bài học BE-P2-02), **không thêm module** vào `AppModule` (dùng `BillingModule` sẵn có → `prisma.service.spec.ts` không đổi, bài học BE-P2-10), **không khóa seed mới** (`EXPECTED_COUNTS` không đổi, bài học BE-P3-18), **không mẫu mail mới**, **không giá trị enum mới**. Nếu phát hiện cần migration hoặc dependency thì **dừng và hỏi** chủ dự án (xem Q-P4-49).

**"Phòng về Trống" không phải một lệnh ghi:** `rooms` không có cột trạng thái — `roomStatus()` (`src/modules/rooms/room-status.ts`) suy ra từ hợp đồng HOLD/ACTIVE. Hợp đồng thành `ENDED` là phòng tự về "Trống" và công khai lại. Không thêm mã cho việc này; chỉ test.

---

## 2. Kiến trúc

### 2.1 Sơ đồ

```
 QL (MANAGER trong phạm vi · BOSS mọi tòa)
   /ql/hop-dong/:id  ──► POST /contracts/:id/settlement?dryRun=true   (xem trước, no-store, KHÔNG ghi)
                     ──► POST /contracts/:id/settlement               (ghi thật, Idempotency-Key, API-05)
                     ──► POST /settlements/:id/refund-paid            (một lần, chỉ net > 0)
                                   │
                                   ▼
            SettlementController (mỏng)  ─ cùng DTO cho cả hai lượt, chỉ khác cờ dryRun
                                   │
                                   ▼
            SettlementService.quote(actor, id, dto, { write })   ── MỘT đường đi, một truy vấn, một phép tính
              1. prisma.$transaction
              2. lockViewingMapping(tx)            SCOPE-02: phạm vi token + phân công hiện tại
              3. SELECT … FROM rooms     WHERE id = room      FOR UPDATE   ┐ đúng thứ tự khóa của
                 SELECT … FROM contracts WHERE id = :id       FOR UPDATE   │ move-in / cancel
                 SELECT … FROM invoices  WHERE contract_id    ORDER BY id FOR UPDATE ┘ (không bao giờ ngược lại)
              4. kiểm trạng thái: ACTIVE, chưa có settlement, moveOutDate trong [start_date, hôm nay] (Q-P4-10),
                 mọi kỳ có billingDate ≤ hôm nay và ≤ j đều có hóa đơn (A-10) → nếu thiếu: CONFLICT_STATE + câu tiếng Việt
              5. đọc dữ liệu: periods, rent, chuỗi cọc đã trả, hóa đơn UNPAID/DRAFT, chỉ số chốt cuối đã phát hành,
                 người ở, xe, dịch vụ, ratesAt(buildingId, period_j.periodStart)
              6. settlementAmounts(input)  ← HÀM THUẦN, không I/O, không new Date()
              7. dryRun ? trả về (ROLLBACK ngầm: không có lệnh ghi nào) : ghi theo §2.5 rồi trả về CÙNG hình dạng
                                   │
                                   ▼
   common/money/settlement-calc.ts  (thuần)  ──dùng lại──► period.ts (periodContaining, contractPeriods, proratedAmount)
                                                           tiers.ts (electricLines), invoice-calc.ts (occupantCount,
                                                           vehicleCount, monthlyInvoiceLines), consumption.ts
```

### 2.2 File thêm / sửa

| File | Thêm/Sửa | Việc |
|---|---|---|
| `src/common/money/settlement-calc.ts` (+ `.spec.ts`) | thêm | **hàm thuần** `settlementAmounts(input): SettlementAmounts` — nơi duy nhất chứa BIL-13..18; dùng lại `periodContaining`, `proratedAmount`, `electricLines`, `occupantCount`, `vehicleCount`, `monthlyInvoiceLines` |
| `src/modules/billing/settlement.service.ts` (+ `settlement.service.spec.ts`) | thêm | `quote` (dryRun + ghi thật, một đường đi), `refundPaid`; khóa, phạm vi, A-10, audit, thông báo |
| `src/modules/billing/settlement.controller.ts` (+ `billing.settlement.http.spec.ts`) | thêm | hai class controller trong một file (như `invoices.controller.ts`): `contracts/:id/settlement` và `settlements/:id/refund-paid`, `@Roles('BOSS','MANAGER')`, `Cache-Control: no-store` |
| `src/modules/billing/dto/settlement.dto.ts` | thêm | `SettlementDto`, `SettlementQueryDto`, `RefundPaidDto`, `SettlementIdParamsDto`, `ContractIdParamsDto` (khuôn `record-payment.dto.ts`, mọi message tiếng Việt, `@NotContains('\0')` cho mọi text — bài học BE-P3-10) |
| `src/modules/billing/settlement-notice.ts` | thêm **nếu** Q-P4-46 = A | dòng `notifications` người thuê + thư nhân sự tòa qua `notifyBuildingStaff` (cùng khuôn `payment-notice.ts`) và `Mail | null` trả cho caller gửi sau commit |
| `src/modules/billing/billing.module.ts` | sửa | thêm `SettlementController`/`SettlementsController` + `SettlementService` (module đã `imports: [AuditModule, MailerModule]`) |
| `test/settlement.e2e-spec.ts` | thêm | e2e trên DB dev, rollback ngoài (§4 CP-5) |
| `docs/phase-4-money/PROGRESS.md`, `docs/LESSONS.md` | sửa | trước CP-5 |

**Không** sửa `contract-cancel.service.ts` (CON-12 là luồng khác, đã đạt), **không** sửa `issue-monthly.ts` (giữ nguyên để không làm đỏ `issue-monthly.spec.ts`), **không** sửa `invoice-queries.service.ts` (hóa đơn FINAL đi qua đúng đường dẫn hiện có: `type` là bộ lọc chung, VietQR hiện khi UNPAID theo BIL-10) — nếu phát hiện phải sửa thì báo ở checkpoint, đừng làm thêm.

### 2.3 Hợp đồng hàm thuần (BE-P4-29)

```
// Mọi số là số nguyên đồng. Hàm KHÔNG đọc DB, KHÔNG new Date(), KHÔNG ném cho lỗi nghiệp vụ của route.
interface UnbilledPeriod {               // kỳ ≤ j chưa có hóa đơn MONTHLY chưa hủy (DRAFT bị gộp cũng vào đây)
  period: ContractPeriod;
  draftInvoiceId: number | null;         // DRAFT sẽ bị hủy "Gộp vào thanh lý"
}

interface SettlementInput {
  periods: readonly ContractPeriod[];    // contractPeriods(start_date, term_months)
  moveOutDate: Date;                     // đã kiểm [start_date, hôm nay] trước khi gọi
  rent: number;
  deposit: number;                       // BIL-17: cọc đã THỰC NHẬN của cả chuỗi gia hạn (Q-P4-40)
  unbilled: readonly UnbilledPeriod[];   // kỳ j và các kỳ trước chưa phát hành (Q-P4-36)
  waterMode: 'PER_M3' | 'PER_PERSON';
  rates: RatesAt;                        // ratesAt(tx, buildingId, period_j.periodStart) — Q-P4-39
  services: readonly InvoiceService[];
  occupants: readonly { moveInDate: Date; moveOutDate: Date | null }[];
  vehicles: readonly { serviceId: number; registeredAt: Date; removedAt: Date | null }[];
  utilities: { electricKwh: number; waterM3: number | null } | null;  // tiêu thụ từ mốc chốt cuối đã phát hành
                                                                      // tới chỉ số cuối; null = không có khoảng nào
  previousDebt: readonly { invoiceId: number; total: number }[];       // BIL-16, KHÔNG gồm hóa đơn DEPOSIT
  damages: number;                       // ≥ 0
  depositForfeit: number;                // ≥ 0
}

interface SettlementAmounts {
  periodNo: number;                      // j (BIL-13)
  lastPeriodAmount: number;              // BIL-14
  remainingRent: number;                 // BIL-15
  remainingPeriods: readonly { periodNo: number; rent: number }[];     // một dòng REMAINING_RENT mỗi kỳ
  previousDebtTotal: number;             // BIL-16
  deposit: number; damages: number; depositForfeit: number;
  net: number;                           // BIL-17 — đúng công thức của CHECK settlements_net
  finalLines: readonly MoneyLine[];      // BIL-18, thứ tự: kỳ chưa phát hành → REMAINING_RENT → PREVIOUS_DEBT
                                         // → DAMAGE → DEPOSIT_FORFEIT → DEPOSIT_OFFSET; tổng amount = −net
}
```

- `net = deposit − lastPeriodAmount − remainingRent − previousDebtTotal − damages − depositForfeit` — viết **đúng** như CHECK `settlements_net` để DB không bao giờ phải chặn.
- Hàm **tự kiểm** trước khi trả: `sum(finalLines.amount) === −net`. Lệch → `RangeError` (lỗi lập trình, không phải lỗi người dùng) để không bao giờ ghi một hóa đơn FINAL sai tổng.
- Dòng bỏ qua khi bằng 0: `DAMAGE`, `DEPOSIT_FORFEIT`, `DEPOSIT_OFFSET` (cọc 0) — hóa đơn không có dòng rác; `REMAINING_RENT` chỉ khi `moveOutDate < end_date`.
- `DEPOSIT_OFFSET`: `quantity = 1`, `unitPrice = −deposit`, `amount = −deposit` (CHECK `invoice_lines_sign` chỉ cho kind này âm).
- Làm tròn: dùng `proratedAmount` (BigInt, nửa lên, A-21) **một lần mỗi dòng/mỗi kỳ**, không bao giờ làm tròn tổng (xem Q-P4-37).
- Tổng hóa đơn FINAL = `−net` > 0 → thỏa CHECK `invoices_total`.

### 2.4 Hợp đồng route

| Method | Path | Vai trò | Body / Query | Trả về | Lỗi |
|---|---|---|---|---|---|
| POST | `/contracts/:id/settlement` | BOSS, MANAGER trong phạm vi | `?dryRun=true\|false` (mặc định `false`); body `SettlementDto` | `SettlementView` (giống nhau cho cả hai lượt, thêm `dryRun: boolean`) + `Cache-Control: no-store` | `NOT_FOUND`, `OUT_OF_SCOPE`, `FORBIDDEN` (TENANT/GUEST), `CONFLICT_STATE` (không ACTIVE · đã có settlement · thiếu kỳ A-10 · Q-P4-50), `VALIDATION_FAILED`, `METER_VALUE_DECREASED`, `RATE_PLAN_MISSING` |
| POST | `/settlements/:id/refund-paid` | BOSS, MANAGER trong phạm vi | `RefundPaidDto` | `{ settlementId, net, refundPaidAt, method }` | `NOT_FOUND`, `OUT_OF_SCOPE`, `CONFLICT_STATE` (`net ≤ 0` hoặc đã ghi), `VALIDATION_FAILED` |

```
class SettlementDto {
  moveOutDate: string;                  // 'YYYY-MM-DD', parseDateOnly; [start_date, hôm nay] (Q-P4-10)
  finalReadings: { electric: number; water: number; electricPhotoUrl?: string; waterPhotoUrl?: string };
                                        // ảnh TÙY CHỌN (D-38); nước luôn bắt buộc, cả ở tòa PER_PERSON (MTR-06)
  damages?: number;                     // int ≥ 0, ≤ 2147483647, mặc định 0
  depositForfeit?: number;              // int ≥ 0, mặc định 0 (trần: Q-P4-45)
  note?: string;                        // ≤ 500, không NUL; bắt buộc khi damages > 0 (BIL-20, Q-P4-45)
}
class RefundPaidDto { method: PaymentMethod; paidAt?: string /* ISO + offset */; note?: string /* ≤ 500 */ }

interface SettlementView {
  dryRun: boolean;
  contract: { id: number; code: string; status: 'ACTIVE' | 'ENDED'; endDate: string };
  moveOutDate: string; periodNo: number;
  lastPeriodAmount: number; remainingRent: number; previousDebt: number;
  deposit: number; damages: number; depositForfeit: number; net: number;
  refund: number;                       // max(net, 0) — số phải trả lại khách
  lines: { kind: LineKind; label: string; quantity: number; unitPrice: number; amount: number }[];
  mergedDrafts: number[];               // id hóa đơn DRAFT bị hủy "Gộp vào thanh lý"
  settledInvoices: number[];            // id hóa đơn UNPAID → SETTLED
  utilities: { electric: { opening: …; closing: …; consumption: number } | null; water: … | null };
  settlementId: number | null;          // null khi dryRun
  finalInvoice: { id: number; code: string; total: number; dueDate: string } | null;  // null khi net ≥ 0 hoặc dryRun
  refundPaidAt: string | null;
}
```

- `dryRun=true`: **không một lệnh ghi nào** (không `create`, không `update`, không `audit`, không `runIdempotent`) → test khẳng định bằng chính lời gọi (`tx.settlement.create` không được gọi — bài học BE-EX-08), không chỉ bằng số dòng.
- `dryRun=false` dùng `runIdempotent` (API-05) với `route = 'POST /contracts/:id/settlement'` và `hashRequest({ contractId, moveOutDate, finalReadings, damages, depositForfeit, note })`; lặp lại cùng `Idempotency-Key` trả **đúng** kết quả cũ, không ghi lần hai. `dryRun=true` **không** chạm vào kho idempotency.
- Phạm vi: khuôn `assertInvoiceScope` của `billing.service.ts` — `scopeWhere(actor)` rồi `assertViewingScope` (phân công **hiện tại**, dưới `lockViewingMapping`); ngoài phạm vi → `OUT_OF_SCOPE`, không tồn tại → `NOT_FOUND` (bài học BE-P3-07).
- `refund-paid`: khóa `SELECT … FROM settlements WHERE id = … FOR UPDATE`, cập nhật có điều kiện `where: { id, refundPaidAt: null }`; 0 dòng = `CONFLICT_STATE` (CHECK `settlements_refund` là lưới cuối, không phải cổng chính).

### 2.5 Thứ tự ghi trong **một** transaction (BIL-19) và vì sao đúng

```
 1. lockViewingMapping(tx)                           → phân công tòa không đổi giữa luồng (BE-P3-07)
 2. rooms FOR UPDATE → contracts FOR UPDATE          → cùng thứ tự với move-in/cancel ⇒ không deadlock
 3. invoices của hợp đồng ORDER BY id FOR UPDATE     → chặn đua với "Ghi thu tay" và webhook (P4-4/P4-5)
 4. kiểm: ACTIVE · chưa có settlement · Q-P4-10 · A-10 · Q-P4-50   (mọi lỗi nghiệp vụ xảy ra TRƯỚC lệnh ghi đầu tiên)
 5. tạo mốc chỉ số cuối (ELECTRIC + WATER), read_on và invoice_id theo Q-P4-43;
    value < mốc trước → METER_VALUE_DECREASED (Q-P4-44); trùng UK meter_readings_contract_daily_key → CONFLICT_STATE
 6. tính settlementAmounts(...)                      → mọi số có trước khi ghi ⇒ CHECK settlements_net và
                                                       settlements_final_invoice không bao giờ bị DB chặn
 7. net < 0 ? tạo hóa đơn FINAL: type FINAL, period_no 0, period_start/end NULL, status UNPAID,
      issue_date = hôm nay, due_date = hôm nay + 7 (Q-P4-12), total = −net, createdById = actor,
      invoice_lines = finalLines (sortOrder = thứ tự §2.3)
      ↳ trùng UK invoices_one_per_period → CONFLICT_STATE (đã quyết toán)
 8. INSERT settlements { contract_id, move_out_date, deposit, last_period_amount, remaining_rent, previous_debt,
      damages, deposit_forfeit, net, final_invoice_id, note, settled_by_id }    (sau FINAL vì cần final_invoice_id)
      ↳ trùng UK settlements_contract_id_key → CONFLICT_STATE (isUniqueOn, như contract-cancel)
 9. DRAFT (kỳ j và trước) → status CANCELLED + cancel_reason 'Gộp vào thanh lý'  (updateMany có điều kiện status)
10. UNPAID (trừ hóa đơn DEPOSIT) → status SETTLED + settlement_id = settlements.id   ⇒ invoices_settled_link
      ↳ updateMany where { id: { in }, status: 'UNPAID' }; count khác kỳ vọng = CONFLICT_STATE
11. contracts → status ENDED, ended_at = now()   (where { id, status: 'ACTIVE' }, 0 dòng = CONFLICT_STATE)
12. occupants / vehicles theo Q-P4-47 (CHECK occupants_dates: move_out_date ≥ move_in_date!)
13. tài khoản người thuê + session theo Q-P4-48 (BIL-19 ↔ D-26/A-16 đang xung đột — PHẢI hỏi trước)
14. audit 'contract.settle', entity 'contract', before { status: 'ACTIVE' },
      after { status: 'ENDED', settlementId, net, deposit, lastPeriodAmount, remainingRent, previousDebt,
              damages, depositForfeit, finalInvoiceId, mergedDrafts, settledInvoices, readingIds }   (AUD-01, AUD-02)
15. thông báo trong-ứng-dụng theo Q-P4-46 (Mail trả ra ngoài, GỬI SAU COMMIT qua sendWithRetry — NOTI-07)
```

Phòng về "Trống" là hệ quả của bước 11 (không có lệnh ghi). Thứ tự 7 → 8 → 10 là bắt buộc: `settlements.final_invoice_id` cần hóa đơn FINAL trước, `invoices.settlement_id` cần dòng `settlements` trước, và CHECK `invoices_settled_link` buộc đổi `status` và `settlement_id` trong **cùng** một lệnh `update`.

### 2.6 Hai ví dụ nghiệm thu (nguồn: 16-billing)

| Ca | Giả thiết | Kết quả mong đợi |
|---|---|---|
| **BIL-18 / dọn sớm** | Hợp đồng BIL-01 (01/09/2026, 6 tháng, `end_date` 28/02/2027, rent 2.500.000, cọc 2.500.000 đã trả), kỳ 1 và 2 đã PAID, `moveOutDate` 25/11/2026 | `j = 3` (01/11–30/11); `remaining_rent = 3 × 2.500.000 = 7.500.000` (12/2026, 01/2027, 02/2027 — tháng 2 là kỳ đủ vì `end_date` = 28/02); `net < 0` → hóa đơn FINAL tổng = `−net`, hạn = hôm nay + 7 |
| **BIL-14 / hết hạn rồi mới quyết toán** | Kỳ N đã phát hành, quyết toán 10 ngày sau `end_date` | `last_period_amount` **chỉ** gồm điện nước 10 ngày đó (từ mốc chốt kỳ N tới chỉ số cuối); không thu thêm tiền phòng (A-06/BIL-20 → chỉ qua `damages` kèm ghi chú) |

---

## 3. Câu hỏi cho chủ dự án

**Chủ dự án đã trả lời (22/11/2026): Q-P4-36..50 đều theo phương án đề xuất** (Q-P4-41 = B gộp cả chuỗi, Q-P4-49 = B audit + nối vào note, còn lại A). Ghi trong README phase.

Phiên chính hỏi **cả lượt** trước khi viết mã của checkpoint bị chặn, rồi chép câu trả lời vào bảng §1 của `docs/phase-4-money/README.md` và mục "Questions for the owner" của `feature_p4-6-backend-settlement.md`. **Không tự quyết luật nghiệp vụ.**

| Mã | Câu hỏi | Lựa chọn | Đề xuất | Chặn |
|---|---|---|---|---|
| **Q-P4-36** | BIL-14 chỉ nói tiền phòng + dịch vụ **của kỳ j**, nhưng cũng nói "mọi DRAFT kỳ j **hoặc trước đó** bị gộp vào thanh lý". Vậy một kỳ trước j chưa phát hành (có DRAFT) thì thu tiền phòng + dịch vụ của kỳ đó không? | **A** thu đủ tiền phòng + dịch vụ/xe của **mọi** kỳ chưa phát hành ≤ j (mỗi kỳ lẻ chia tỉ lệ ngày theo D-41), điện nước gộp một khoảng duy nhất · **B** chỉ kỳ j (đúng chữ BIL-14): kỳ trước đó chỉ bị hủy DRAFT, không thu tiền phòng · **C** chặn quyết toán khi còn DRAFT của kỳ trước j, buộc phát hành trước | **A** — B nghĩa là khách ở một tháng không mất tiền phòng; A-10 đã chặn kỳ *không có* hóa đơn, nên đây đúng là kỳ có DRAFT chờ chỉ số | CP-1, CP-3 |
| **Q-P4-37** | Kỳ j hoặc kỳ còn lại là **tháng lẻ** (ví dụ kỳ cuối 01/02–28/02 hay 01/09–19/09) thì tiền phòng tính sao, và làm tròn mấy lần? | **A** chia tỉ lệ ngày theo D-41/A-21 cho từng kỳ lẻ (`proratedAmount`, nửa lên, **một lần mỗi kỳ**); `remaining_rent` = tổng các số đã làm tròn, mỗi kỳ một dòng `REMAINING_RENT` · **B** kỳ lẻ vẫn thu **đủ tháng** (hiểu D-14 "thu đến hết hạn" theo nghĩa nguyên tháng) · **C** cộng số ngày của mọi kỳ còn lại rồi chia tỉ lệ một lần | **A** — khớp D-41, BIL-02/BIL-22 và cách hóa đơn tháng đang tính; mỗi dòng của hóa đơn FINAL khớp đúng một kỳ nên khách đối chiếu được | CP-1 |
| **Q-P4-38** | `moveOutDate` giữa kỳ j và kỳ j **chưa** phát hành: dịch vụ, gửi xe và **nước PER_PERSON** của kỳ j thu thế nào? | **A** dịch vụ ROOM/PERSON và gửi xe thu **đủ kỳ** (A-01, Q-P3-18, Q-P3-20); nước PER_PERSON = số người × giá nước **đủ tháng** (D-44/Q-P4-13) · **B** như A nhưng **không** có dòng nước ở tòa PER_PERSON khi quyết toán · **C** chia tỉ lệ dịch vụ tới ngày dọn đi | **A** — A-01 nói rõ "charged in full"; dùng lại `monthlyInvoiceLines` nên không có nhánh toán tiền thứ hai | CP-1 |
| **Q-P4-39** | Đơn giá nào áp cho các kỳ chưa phát hành và cho điện nước của khoảng cuối (RATE-04/D-09 nói "giá hiệu lực tại `period_start`")? | **A** `ratesAt(period_j.periodStart)` cho toàn bộ phần quyết toán; bậc điện áp **một lần** trên tổng kWh của cả khoảng chưa phát hành · **B** mỗi kỳ chưa phát hành lấy giá tại `period_start` của **chính nó**, điện nước chia theo kỳ · **C** giá tại `moveOutDate` | **A** — rẻ nhất và khớp ví dụ BIL-14 (một khoảng điện nước duy nhất); chỉ khác B khi giá đổi giữa hai kỳ chưa phát hành (rất hiếm, và Q-P4-36 = A đã chặn việc để nợ nhiều kỳ) | CP-1 |
| **Q-P4-40** | BIL-17 "cọc **đã thực trả** của chuỗi hợp đồng (gia hạn mang theo)". Lấy số từ đâu? | **A** đi ngược `previous_contract_id`, lấy `payments.amount` của hóa đơn `DEPOSIT` đã PAID trong chuỗi (bình thường đúng một cái); không có → cọc = 0 · **B** lấy cột `contracts.deposit` (số trên giấy, kể cả chưa thu) · **C** chỉ xét hóa đơn cọc của **chính** hợp đồng này → hợp đồng gia hạn luôn có cọc 0 | **A** — giống cách CON-12 đang làm (tiền thật, không phải số trên giấy) và đúng chữ "actually paid" | CP-2, CP-3 |
| **Q-P4-41** | BIL-16 `previous_debt` = hóa đơn UNPAID "của hợp đồng này". Hợp đồng **trước** trong chuỗi gia hạn (đã `ENDED` không quyết toán) còn hóa đơn UNPAID thì sao? | **A** chỉ hợp đồng này (đúng chữ BIL-16); nợ của hợp đồng cũ vẫn UNPAID, nhân sự thu riêng · **B** gộp cả hóa đơn UNPAID của các hợp đồng trước trong chuỗi (cùng khách, cùng phòng) vào `previous_debt` và cho chúng `SETTLED` · **C** chặn quyết toán khi chuỗi còn nợ | **B** — vì cọc lấy cả chuỗi (Q-P4-40) thì nợ cũng nên cả chuỗi, không thì món nợ đó không còn ai trừ vào đâu; chọn **A** nếu bạn muốn tách sổ từng hợp đồng | CP-2, CP-3 |
| **Q-P4-42** | BIL-13 nói quyết toán chỉ cho hợp đồng **ACTIVE**, nhưng BIL-21 lại cho tạo hóa đơn kỳ thiếu cho hợp đồng **ENDED chưa quyết toán** (bị gia hạn chuyển ca, Q-P4-15). Có cho quyết toán hợp đồng ENDED-chưa-quyết-toán không? | **A** không: chỉ ACTIVE; ENDED/CANCELLED/HOLD → `CONFLICT_STATE` (HOLD dùng CON-12) · **B** cho cả ENDED chưa có settlement (để đóng sổ hợp đồng cũ của chuỗi gia hạn) · **C** cho ENDED nhưng chỉ phần nợ, không chỉ số cuối | **A** — hợp đồng bị gia hạn chuyển ca thì khách **chưa** dọn đi, cọc theo chuỗi sang hợp đồng mới; đóng sổ nó là việc Phase 5 nếu bạn thấy cần | CP-2 |
| **Q-P4-43** | Chỉ số cuối lưu với `read_on` nào và gắn vào hóa đơn nào? (`finalReadings` của BIL-13 chỉ có giá trị, không có ngày) | **A** `read_on = moveOutDate`, `contract_id` = hợp đồng, `invoice_id = NULL`; ảnh chụp lưu vào `photo_url` nếu có; số liệu mốc đầu/cuối vẫn hiện trên dòng ELECTRIC/WATER của hóa đơn FINAL qua `meta` (như hóa đơn tháng) · **B** như A nhưng gắn `invoice_id` = hóa đơn FINAL khi có (khi `net ≥ 0` vẫn phải NULL → hai hình dạng khác nhau) · **C** `read_on` = hôm nay | **A** — một hình dạng duy nhất; ngày đọc đúng là ngày khách trả phòng. Lưu ý: nếu hôm đó **đã** có chỉ số cùng phòng/hợp đồng/loại thì UK `meter_readings_contract_daily_key` chặn → trả `CONFLICT_STATE` kèm câu tiếng Việt | CP-3 |
| **Q-P4-44** | Chỉ số cuối **nhỏ hơn** mốc chốt cuối đã phát hành (đồng hồ bị thay, hoặc nhập sai) thì sao? `finalReadings` không có trường thay đồng hồ. | **A** từ chối `METER_VALUE_DECREASED`; muốn khai thay đồng hồ thì nhập mốc thay qua `POST /meter-readings` (đường "thay đồng hồ không cần hóa đơn" đã có) rồi quyết toán lại · **B** thêm `electricReplacement/waterReplacement { oldMeterFinal }` vào body quyết toán (giống CON-10) · **C** chấp nhận và tính tiêu thụ = 0 | **A** — ít mã nhất, giữ MTR-03/MTR-04 ở đúng một chỗ; chọn **B** nếu bạn thấy cảnh "thay đồng hồ đúng ngày trả phòng" hay xảy ra | CP-3 |
| **Q-P4-45** | `damages` và `depositForfeit` kiểm tới đâu, và nhãn các dòng hóa đơn FINAL viết thế nào? (spec chỉ cho `LineKind`) | **A** `damages ≥ 0`; `depositForfeit` **0..cọc đã nhận** (vượt → `VALIDATION_FAILED` "Tiền cọc giữ lại không được vượt số tiền cọc đã nhận", đúng câu CON-12 đang dùng); `note` **bắt buộc** khi `damages > 0` (BIL-20) hoặc `depositForfeit > 0`; nhãn: `Tiền phòng {dd/mm}–{dd/mm}` · `Tiền phòng còn lại {dd/mm}–{dd/mm}` · `Nợ hóa đơn TT{id}` · `Hư hỏng, mất mát` · `Cọc giữ lại` · `Trừ tiền cọc` · **B** không giới hạn `depositForfeit` (chỉ CHECK ≥ 0), `note` luôn tùy chọn · **C** tách `damageNote` riêng khỏi `note` | **A** — `net` càng âm thì hóa đơn FINAL càng to, nên giữ trần bằng cọc như CON-12; bắt buộc ghi chú để BIL-20 có dấu vết | CP-1, CP-2 |
| **Q-P4-46** | Thông báo khi quyết toán: BIL-19 chỉ nói "thông báo người thuê". Gửi gì, cho ai? (`NotificationKind` không có loại "quyết toán") | **A** `net < 0`: dòng `INVOICE_ISSUED` "Hóa đơn quyết toán TT{id} đã phát hành · Số tiền … · Hạn thanh toán …" + mail kèm VietQR (như BIL-08) · `net ≥ 0`: dòng `ANNOUNCEMENT` "Đã quyết toán hợp đồng {code} · Hoàn lại {net}" + mail; **cả hai** trường hợp ghi thêm một thư nhân sự tòa (`notifyBuildingStaff`, như Q-P4-27) · **B** chỉ dòng in-app, không mail · **C** chỉ thông báo khi có hóa đơn FINAL | **A** — khách cần biết số tiền và cách trả; thư nhân sự giữ đúng khuôn Q-P4-27/Q-P4-31. Dùng lại mẫu mail sẵn có, **không** thêm khóa mẫu mới | CP-3 |
| **Q-P4-47** | Người ở và xe khi quyết toán: ghi `move_out_date` cho ai, ngày nào? (CHECK `occupants_dates` buộc `move_out_date ≥ move_in_date`) | **A** chỉ những dòng đang để trống: `move_out_date = max(moveOutDate, move_in_date)`; xe đang hoạt động → `is_active = false`, `removed_at = max(moveOutDate, registered_at)`; giữ nguyên các dòng đã có ngày đi · **B** ghi đè toàn bộ bằng `moveOutDate` (có thể vỡ CHECK) · **C** dùng hôm nay thay vì `moveOutDate` | **A** — giữ lịch sử (không hard-delete), không vỡ CHECK, và không đổi tiền của các tháng đã phát hành (Q-P3-20 tính xe theo tháng) | CP-3 |
| **Q-P4-48** | **Xung đột trong spec:** BIL-19 nói "vô hiệu hóa tài khoản người thuê nếu không còn hợp đồng HOLD/ACTIVE (thu hồi session)", nhưng D-26 + A-16 + CON-12 nói tài khoản **giữ nguyên** vùng khách sau khi hợp đồng kết thúc ("the same holds when a contract ends by settlement"). Làm theo cái nào? | **A** theo D-26/A-16: **không** vô hiệu hóa, **không** thu hồi session; khách vẫn đăng nhập xem hóa đơn cũ và dùng vùng khách (sửa lại một câu của BIL-19 trong spec) · **B** theo BIL-19: `is_active = false` + thu hồi session khi không còn hợp đồng HOLD/ACTIVE · **C** chỉ vô hiệu hóa tài khoản **được tạo cho hợp đồng này và chưa bao giờ đăng nhập** (giống CON-12) | **A** — D-26 là quyết định sau (12/11/2026) và nói thẳng tới trường hợp quyết toán; khách còn phải xem/thanh toán hóa đơn FINAL nên khóa tài khoản là tự chặn mình | CP-3 |
| **Q-P4-49** | `refund-paid` nhận `{ method, paidAt?, note? }` (Q-P4-8) nhưng bảng `settlements` **không có** cột cho `method`. Lưu đâu? | **A** chỉ `refund_paid_at` vào cột; `method`, `paidAt`, `note` vào `after` của audit `settlement.refund_paid` (không migration) · **B** như A và **nối thêm** một câu tiếng Việt vào `settlements.note` ("Đã trả lại bằng CASH ngày 25/11/2026") để nhân sự thấy ngay trên trang · **C** thêm cột `refund_method`/`refund_note` (**cần migration**, phải bạn duyệt) | **B** — vẫn không migration mà nhân sự đọc được trên màn hình; **A** nếu bạn muốn `note` chỉ là ghi chú của lượt quyết toán | CP-4 |
| **Q-P4-50** | `moveOutDate` ở quá khứ trong khi **đã có** hóa đơn MONTHLY chưa hủy của một kỳ **sau** j (ví dụ dọn 25/11 nhưng hóa đơn tháng 12 đã phát hành). Kỳ đó sẽ vào **cả** `previous_debt` (nếu UNPAID) **và** `remaining_rent` → thu hai lần. | **A** từ chối `CONFLICT_STATE` "Còn hóa đơn của kỳ sau ngày dọn đi, hãy hủy hoặc lập lại hóa đơn đó trước" · **B** trừ các kỳ đã có hóa đơn khỏi `remaining_rent` (chỉ thu phần chưa có hóa đơn) · **C** cho thu hai lần | **A** — không bao giờ thu hai lần, và cảnh này rất hiếm (hóa đơn kỳ sau chỉ sinh khi ngày thu đã tới) | CP-2, CP-3 |

`[ASSUMPTION]` sẽ dùng và phải nêu lại ở checkpoint BE-P4-33:

- **A-01** dịch vụ/xe thu đủ kỳ đang ở, các kỳ sau chỉ tiền phòng · **A-06**/BIL-20 ngày ở quá hạn không tự thu · **A-10** chặn khi còn kỳ chưa có hóa đơn · **A-21** làm tròn nửa lên một lần mỗi dòng · **D-14** đi sớm vẫn trả tiền phòng tới hết hạn · **D-41** tháng lẻ theo số ngày thực.
- Audit: `contract.settle` (entity `contract`, AUD-01) và `settlement.refund_paid` (entity `settlement`, AUD-02 `<entity>.<verb>` — AUD-01 chỉ ghi "payment record/assign/refund" cho phía ngân hàng).
- `GET` không có route riêng cho `settlements`: trang hợp đồng đọc qua chi tiết hợp đồng (Phase 5/FE-P4-06 quyết); P4-6 chỉ có 2 route POST như bảng API của 16-billing.
- Hợp đồng gia hạn đã ký **không thể** cùng tồn tại với hợp đồng cũ ACTIVE trên cùng phòng vì index riêng phần `contracts_one_open_per_room` (HOLD + ACTIVE cùng `room_id`). Vì vậy P4-6 **không** thêm nhánh nào cho "quyết toán hợp đồng đang có gia hạn chờ"; nếu dựng được cảnh đó thì nó là lỗi của Phase 5. Nêu lại giới hạn này ở CP-5.
- `?dryRun` mặc định `false` theo đúng chữ của bảng API 16-billing (`dryRun=true|false`); FE luôn gửi tường minh. Nêu lại ở checkpoint để chủ dự án đổi nếu muốn mặc định an toàn hơn.

---

## 4. Checkpoints

File task P4-6 chỉ có **một** ⏸ ở **BE-P4-33** (CP-5); CP-1..CP-4 là các bước bên trong, mỗi bước vẫn tự kiểm được bằng lệnh. Trước CP-5: cập nhật `docs/phase-4-money/PROGRESS.md` và thêm vào `docs/LESSONS.md` lỗi nào đã mất một lượt làm lại.

Lệnh dùng ở "Done when" (chạy từ `Source/backend`):

```
npx vitest run <đường dẫn spec>                 # một file
npm run lint && npm run test && npm run build
node --env-file=.env ./node_modules/vitest/vitest.mjs run --config ./vitest.config.e2e.ts test/settlement.e2e-spec.ts   # e2e (bài học BE-EX-06)
```

### CP-1 · BE-P4-29: hàm thuần `settlement-calc.ts`

- **File:** `src/common/money/settlement-calc.ts` + `settlement-calc.spec.ts`.
- **Chặn bởi:** Q-P4-36, Q-P4-37, Q-P4-38, Q-P4-39, Q-P4-45 (nhãn dòng).
- **Done when:** `npx vitest run src/common/money` pass (gồm `money.spec.ts` **không đổi**); `npm run build` pass; `git status` chỉ có 2 file mới.
- **Kịch bản test** (giá trị mong đợi lấy từ spec, không lấy từ mã đang kiểm)

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | Hợp đồng BIL-01, cọc 2.500.000, kỳ 1–2 PAID, `moveOutDate` 25/11/2026 | BIL-13, BIL-15, 16-billing Acceptance | `j = 3`; `remainingRent = 7.500.000` (3 × 2.500.000); `net < 0`; `sum(finalLines) = −net` |
| 2 | Cùng ca 1, kiểm từng dòng | BIL-18 | thứ tự: dòng kỳ 3 (RENT/ELECTRIC/WATER/SERVICE/PARKING) → 3 dòng `REMAINING_RENT` (qty 1, đơn giá = tiền phòng của kỳ đó) → `PREVIOUS_DEBT` mỗi hóa đơn gộp → `DAMAGE` → `DEPOSIT_FORFEIT` → `DEPOSIT_OFFSET` (qty 1, đơn giá −2.500.000) |
| 3 | Kỳ N đã phát hành, quyết toán 10 ngày sau | BIL-14 | `lastPeriodAmount` chỉ gồm điện nước của khoảng đó; không có dòng RENT; `remainingRent = 0` |
| 4 | `moveOutDate ≥ end_date` | BIL-13 | `j = N` |
| 5 | `moveOutDate` = `end_date` − 1 ngày (vẫn trong kỳ N) | BIL-13, BIL-15 | `j = N`, `remainingRent = 0` |
| 6 | Kỳ j là tháng lẻ (hợp đồng BIL-22: 01/09–19/09, rent 2.500.000) | BIL-22, D-41, A-21 | tiền phòng kỳ j = **1.583.333** |
| 7 | Kỳ còn lại là tháng lẻ (hợp đồng BIL-02: kỳ 1 31/01, kỳ 4 01/04–29/04) | BIL-02, D-41 | các dòng `REMAINING_RENT` = 2.500.000 / 2.500.000 / **2.416.667**; `remainingRent` = tổng đúng ba số đó |
| 8 | Kỳ j chưa phát hành, tòa PER_PERSON, 2 người, tháng lẻ | D-44/Q-P4-13, Q-P4-38 | dòng nước = 2 × 15.000 (**không** chia tỉ lệ ngày); dịch vụ cố định **có** chia tỉ lệ |
| 9 | Kỳ trước j còn DRAFT | **Q-P4-36** | theo lựa chọn của chủ dự án |
| 10 | Điện của cả khoảng chưa phát hành 84 kWh, bậc seed | 12-pricing | 50 × 3.000 + 34 × 3.500 = **269.000** (một lần áp bậc, Q-P4-39 = A) |
| 11 | 0 kWh | 12-pricing | đúng một dòng "Điện (0 kWh)", qty 0, tiền 0 |
| 12 | `damages = 0`, `depositForfeit = 0`, cọc 0 | BIL-18 | **không** có dòng `DAMAGE`/`DEPOSIT_FORFEIT`/`DEPOSIT_OFFSET` |
| 13 | `net = 0` chính xác (cọc = đúng số nợ) | BIL-18 | `finalLines` không được dùng (service không tạo hóa đơn); `net ≥ 0` → không FINAL |
| 14 | `net > 0` | BIL-17, BIL-18 | `refund = net`, không có hóa đơn FINAL |
| 15 | Công thức `net` | CHECK `settlements_net` | `net === deposit − last − remaining − debt − damages − forfeit` cho 5 bộ số ngẫu nhiên có chủ đích |
| 16 | Tổng dòng ≠ −net (dựng input mâu thuẫn qua một mock nội bộ) | §2.3 | `RangeError` — không bao giờ trả về một hóa đơn lệch |
| 17 | `previousDebt` nhiều hóa đơn | BIL-16 | một dòng `PREVIOUS_DEBT` mỗi hóa đơn, `label` chứa `TT{id}`, tổng = `previousDebtTotal` |
| 18 | Hợp đồng vào ở mùng 1, 6 tháng, dọn đúng ngày cuối tháng | BIL-01, BIL-04 | không có kỳ nào vượt `end_date` (D-13) |
| 19 | Năm nhuận: kỳ 01/02–29/02/2028 lẻ | BIL-01 Acceptance | chia theo 29 ngày của tháng đó |
| 20 | Không `new Date()` / không I/O trong file | CLAUDE.md | test tĩnh: file không import Prisma và không gọi `new Date()`/`todayHanoi` |

### CP-2 · BE-P4-30: route xem trước (`dryRun`), phạm vi và A-10

- **File:** `src/modules/billing/dto/settlement.dto.ts`, `settlement.service.ts`, `settlement.controller.ts`, `billing.module.ts` (sửa), `settlement.service.spec.ts`.
- **Chặn bởi:** Q-P4-40, Q-P4-41, Q-P4-42, Q-P4-45 (trần `depositForfeit`), Q-P4-50.
- **Done when:** `npx vitest run src/modules/billing` pass (các spec cũ của billing **không đổi**); `npm run lint && npm run build` pass.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | MANAGER của tòa gọi `dryRun=true` | BIL-13, UI-06 | 200/201, `SettlementView` đủ các khoản, `dryRun: true`, `settlementId: null`; **không** gọi `settlement.create`/`invoice.create`/`invoice.updateMany`/`audit.log` (assert chính lời gọi — bài học BE-EX-08) |
| 2 | Header | API-07 | `Cache-Control: no-store` |
| 3 | MANAGER tòa khác | SCOPE-02 | `OUT_OF_SCOPE` |
| 4 | MANAGER bị thu hồi phân công giữa luồng | BE-P3-07 | `OUT_OF_SCOPE` (kiểm cả phân công **hiện tại** dưới `lockViewingMapping`) |
| 5 | TENANT / GUEST / không đăng nhập | PLAN phase §8 | `FORBIDDEN`, `FORBIDDEN`, 401 `UNAUTHENTICATED` |
| 6 | Hợp đồng không tồn tại | API | `NOT_FOUND` |
| 7 | Hợp đồng HOLD | CON-12 | `CONFLICT_STATE` (hủy HOLD đi đường CON-12) |
| 8 | Hợp đồng `ENDED`/`CANCELLED` | **Q-P4-42** | theo lựa chọn (đề xuất `CONFLICT_STATE`) |
| 9 | Đã có `settlements` cho hợp đồng này | UK `settlements_contract_id` | `CONFLICT_STATE` |
| 10 | Một kỳ có `billingDate ≤ hôm nay`, `≤ j`, không có hóa đơn MONTHLY chưa hủy | **A-10**, BIL-21, 16-billing Acceptance | `CONFLICT_STATE`, thông điệp **đúng từng chữ** "Còn kỳ chưa có hóa đơn, hãy tạo hóa đơn kỳ đó trước" |
| 11 | Sau khi `POST /contracts/:id/monthly-invoices { periodNo }` tạo kỳ thiếu | A-10 Acceptance | quyết toán chạy được (kỳ đó thành DRAFT và được gộp) |
| 12 | `moveOutDate` trước `start_date`, sau hôm nay, sai định dạng, 31/02 | **Q-P4-10**, bài học BE-P4-24 | `VALIDATION_FAILED` (dùng `parseDateOnly`, không `Date.UTC` thô) |
| 13 | `moveOutDate` = hôm nay và = `start_date` | Q-P4-10 | hợp lệ (bao gồm hai đầu) |
| 14 | Hóa đơn MONTHLY chưa hủy của kỳ > j | **Q-P4-50** | theo lựa chọn (đề xuất `CONFLICT_STATE` + câu tiếng Việt) |
| 15 | `damages` âm / không phải số nguyên / > 2147483647; `note` chứa NUL | bài học BE-P3-10, BE-P2-17 | `VALIDATION_FAILED` trước khi tới Prisma |
| 16 | `depositForfeit` > cọc đã nhận | **Q-P4-45** | `VALIDATION_FAILED` kèm câu tiếng Việt của CON-12 |
| 17 | `damages > 0` nhưng thiếu `note` | BIL-20, Q-P4-45 | theo lựa chọn (đề xuất `VALIDATION_FAILED`) |
| 18 | Thiếu `finalReadings.water` ở tòa PER_PERSON | MTR-06, BIL-06 (22/11) | `VALIDATION_FAILED` (nước vẫn phải ghi, chỉ không tính tiền) |
| 19 | Không có ảnh chỉ số | D-38 | hợp lệ |
| 20 | Cọc của chuỗi gia hạn | **Q-P4-40** | theo lựa chọn; test dựng hợp đồng gia hạn có hóa đơn cọc PAID ở hợp đồng gốc |
| 21 | Nợ của hợp đồng trước trong chuỗi | **Q-P4-41** | theo lựa chọn |
| 22 | Thiếu bảng giá đã duyệt tại `period_start` | RATE-04 | `RATE_PLAN_MISSING` |
| 23 | Hai lần `dryRun` liên tiếp | UI-06 | **cùng** số liệu; không dòng nào trong `settlements`/`invoices`/`meter_readings` |

### CP-3 · BE-P4-31: lượt ghi thật trong một transaction

- **File:** `settlement.service.ts` (phần ghi), `settlement-notice.ts` (nếu Q-P4-46 = A), `billing.settlement.http.spec.ts`.
- **Chặn bởi:** Q-P4-43, Q-P4-44, Q-P4-46, Q-P4-47, Q-P4-48 (và mọi câu của CP-1/CP-2).
- **Done when:** `npx vitest run src/modules/billing src/modules/contracts src/modules/meters` pass; `npm run lint && npm run build` pass. Kiểm tay: trên DB dev, một hợp đồng ACTIVE → `dryRun` → ghi thật → `GET /invoices/{finalId}` thấy VietQR và hạn = hôm nay + 7.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | Ghi thật ca BIL-18 (dọn sớm 25/11/2026) | BIL-18, BIL-19 | một dòng `settlements` đúng 6 khoản + `net`; hóa đơn FINAL `UNPAID`, `total = −net`, `period_no = 0`, `due_date` = hôm nay + 7 (Q-P4-12); `settlements.final_invoice_id` = hóa đơn đó |
| 2 | `net ≥ 0` | BIL-18 | **không** có hóa đơn FINAL; `final_invoice_id` null; `refund = net` |
| 3 | Số liệu của lượt ghi thật so với `dryRun` ngay trước đó | BIL-13 | **giống nhau từng số** (cùng một hàm, cùng input) |
| 4 | Hóa đơn UNPAID cũ (không phải DEPOSIT) | BIL-16 | `status = SETTLED` **và** `settlement_id` được đặt trong cùng một lệnh update (CHECK `invoices_settled_link`) |
| 5 | Hóa đơn DEPOSIT đã PAID | BIL-16 | **không** bị đổi trạng thái, vẫn là lịch sử |
| 6 | Hóa đơn DRAFT kỳ j và kỳ trước | BIL-14 | `CANCELLED`, `cancel_reason` = **"Gộp vào thanh lý"** (đúng từng chữ) |
| 7 | Hợp đồng | BIL-19 | `status = ENDED`, `ended_at` khác null |
| 8 | Phòng | CON-12, `room-status.ts` | `roomStatus()` trả **"Trống"**; `GET /public/rooms` thấy lại phòng (không có lệnh ghi nào vào `rooms`) |
| 9 | Người ở và xe | BIL-19, **Q-P4-47** | theo lựa chọn; CHECK `occupants_dates` không bao giờ bị vỡ (test ca người ở có `move_in_date` **sau** `moveOutDate`) |
| 10 | Tài khoản người thuê + session | BIL-19 ↔ **Q-P4-48** | theo lựa chọn; test khẳng định đúng hành vi đã chọn (gồm ca khách còn một hợp đồng ACTIVE khác → chắc chắn **không** bị khóa) |
| 11 | Chỉ số cuối | **Q-P4-43**, MTR-02 | hai mốc (ELECTRIC + WATER), `read_on` và `invoice_id` theo lựa chọn; mốc cũ **không** bị sửa hay gán lại |
| 12 | Chỉ số cuối nhỏ hơn mốc trước | MTR-03, **Q-P4-44** | theo lựa chọn (đề xuất `METER_VALUE_DECREASED`), **không** ghi dòng nào |
| 13 | Đã có chỉ số cùng phòng/hợp đồng/loại trong ngày `moveOutDate` | UK `meter_readings_contract_daily_key` | `CONFLICT_STATE` (P2002 được map, không 500 — bài học BE-P2-11) |
| 14 | Quyết toán hai lần (tuần tự) | UK `settlements.contract_id` | lần hai `CONFLICT_STATE`; đúng một `settlements`, một FINAL |
| 15 | Hai lượt quyết toán **song song** | PLAN phase §7 | đúng một thành công, một `CONFLICT_STATE`; test thực sự chạy song song (bài học BE-LOGIN-12) |
| 16 | Đua với "Ghi thu tay" trên một hóa đơn UNPAID của hợp đồng | BIL-11 | một trong hai thắng: hoặc hóa đơn `PAID` (và không vào `previous_debt`), hoặc `SETTLED`; **không bao giờ** cả hai |
| 17 | Cùng `Idempotency-Key` gọi hai lần | API-05 | lần hai trả **cùng** kết quả, không có `settlements`/FINAL thứ hai |
| 18 | `Idempotency-Key` cũ nhưng body khác | API-05 | lỗi theo đúng hành vi `runIdempotent` hiện có (không ghi) |
| 19 | CHECK của DB không bao giờ là cổng chính | BE-P4-31 "Done when" | test tĩnh/hành vi: mọi lỗi nghiệp vụ trả mã spec; không có ca nào để lọt `settlements_net`/`settlements_final_invoice` ra lỗi 500 |
| 20 | Audit | AUD-01, AUD-02 | đúng một dòng `contract.settle`, entity `contract`, `before.status = 'ACTIVE'`, `after` có `settlementId`/`net`/`finalInvoiceId`, `ip` được ghi |
| 21 | Thông báo | BIL-19, **Q-P4-46**, NOTI-04, NOTI-07 | theo lựa chọn; mail **chỉ** tới email đã xác minh; mail gửi **sau** commit; mail lỗi hai lần → `logger.warn`, dữ liệu **không** bị hoàn tác |
| 22 | Ngày ở quá `end_date` | A-06, BIL-20 | không có dòng tiền phòng tự động; chỉ vào được bằng `damages` + `note` (test một ca có `damages` + `note`) |
| 23 | Lỗi ở bước cuối (audit ném) | BIL-19 | **toàn bộ** rollback: không `settlements`, không FINAL, hợp đồng vẫn ACTIVE |
| 24 | Hóa đơn FINAL ra API | BIL-10, BE-P4-18/19 | `GET /invoices/{id}` (nhân sự) và `GET /me/invoices/{id}` (người thuê) thấy nó kèm VietQR và `content = TT{id}`; `GET /invoices?type=FINAL` lọc được |

### CP-4 · BE-P4-32: `POST /settlements/:id/refund-paid`

- **File:** `settlement.service.ts` (`refundPaid`), `settlement.controller.ts`, `dto/settlement.dto.ts`, `settlement.service.spec.ts`.
- **Chặn bởi:** Q-P4-49.
- **Done when:** `npx vitest run src/modules/billing` pass; `npm run lint && npm run build` pass.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | `net > 0`, MANAGER của tòa, `{ method: 'CASH' }` | Q-P3-3, Q-P4-8 | `refund_paid_at` khác null, trả `{ settlementId, net, refundPaidAt, method }`; audit `settlement.refund_paid` |
| 2 | `paidAt` được gửi | Q-P4-8 | dùng đúng mốc đó; thiếu `paidAt` → mốc lúc bấm |
| 3 | `paidAt` không có offset / sai định dạng | G-02, khuôn `RecordPaymentDto` | `VALIDATION_FAILED` "…phải có múi giờ hợp lệ" |
| 4 | `net = 0` và `net < 0` | CHECK `settlements_refund` | `CONFLICT_STATE`, **không** ghi (BE kiểm trước, CHECK chỉ là lưới) |
| 5 | Gọi lần hai | Q-P4-8 | `CONFLICT_STATE` (hoặc trả kết quả cũ nếu cùng `Idempotency-Key`, API-05); `refund_paid_at` **không** đổi |
| 6 | Hai lượt song song | PLAN phase §7 | đúng một thành công (update có điều kiện `refundPaidAt: null`) |
| 7 | MANAGER tòa khác / TENANT / GUEST / không đăng nhập | PLAN phase §8 | `OUT_OF_SCOPE` / `FORBIDDEN` / `FORBIDDEN` / 401 |
| 8 | `id` không tồn tại | API | `NOT_FOUND` |
| 9 | `method` không thuộc enum; `note` > 500 ký tự hoặc chứa NUL | API-04, bài học BE-P3-10 | `VALIDATION_FAILED` |
| 10 | `method`/`note` được lưu ở đâu | **Q-P4-49** | theo lựa chọn (audit, và nếu chọn B thì câu tiếng Việt nối vào `settlements.note`) |
| 11 | Không có route hoàn tác | Q-P4-8 | không tồn tại route nào đặt lại `refund_paid_at` (test tĩnh trên controller) |

### CP-5 · BE-P4-33 ⏸ (kết phần P4-6)

- **File:** `test/settlement.e2e-spec.ts`; `docs/phase-4-money/PROGRESS.md`, `docs/LESSONS.md` (nếu có bài học).
- **e2e trên DB dev** (theo mẫu `test/invoices-payments.e2e-spec.ts`): **một** `prisma.$transaction` ngoài luôn rollback, `rollbackPrismaFacade(tx)` thay `PrismaService`, `MailerService` bị ghi đè, fixture từ `seedMonthlyFixture` (hóa đơn kỳ 1 tổng **3.119.000** theo BIL-09, `monthsBack = 2`). Chuỗi:
  1. chốt chỉ số kỳ 1 → hóa đơn `UNPAID` 3.119.000;
  2. `dryRun=true` với `moveOutDate` trong kỳ 2 → xem trước (không dòng nào trong `settlements`/`invoices`/`meter_readings`: đếm trước/sau);
  3. MANAGER tòa khác → 403 `OUT_OF_SCOPE`; TENANT → 403;
  4. `moveOutDate` ngày mai → 400 (Q-P4-10);
  5. xóa/hủy hóa đơn kỳ 1 để dựng ca **A-10** → `CONFLICT_STATE` đúng câu; `POST /contracts/:id/monthly-invoices { periodNo: 1 }` rồi chốt lại → chạy được;
  6. ghi thật → `settlements` một dòng, FINAL `UNPAID` với `due_date` = hôm nay + 7, hóa đơn kỳ 1 UNPAID → `SETTLED`, DRAFT kỳ 2 → `CANCELLED` "Gộp vào thanh lý", hợp đồng `ENDED`, `roomStatus` "Trống", 2 (hoặc 3) dòng `notifications` theo Q-P4-46, audit `contract.settle`;
  7. ghi thật lần hai → `CONFLICT_STATE`;
  8. `GET /invoices/{finalId}` (nhân sự) và `GET /me/invoices/{finalId}` (người thuê) → có VietQR, `content = TT{id}`;
  9. `POST /invoices/{finalId}/payment { method: 'CASH' }` → `PAID` + thông báo (BIL-11);
  10. ca `net > 0`: fixture thứ hai có hóa đơn cọc PAID và không nợ → `refund-paid` thiếu `method` (400) → có `method` (OK) → gọi lại (`CONFLICT_STATE`).
- **Giới hạn đã biết của `rollbackPrismaFacade`:** **không** truyền option cho `$transaction` (một savepoint cho mỗi `$transaction`) → nếu service quyết toán cần `timeout`/`isolationLevel` thì ca đó phải chạy bằng unit fake (bài học BE-P4-12); **không** mô phỏng hai kết nối → ca đua thật (quyết toán và ghi thu tay cùng lúc) để **QA-P4-03**. Cuối spec: khẳng định `user.count`/`contract.count` của fixture = 0 sau rollback và log một dòng `BE-P4-33 {runId}: outer rollback verified`.
- **Nếu** một ca bắt buộc phải commit: chỉ trong QA-P4-03, dữ liệu mang tên `[E2E]` qua `e2eName`, dọn mềm bằng `node scripts/e2e/cleanup.mjs` chế độ list trước, `--apply` **chỉ khi chủ dự án đồng ý** (bài học P2-QA-03); không bao giờ hard-delete dòng có lịch sử.
- **Done when:** output thật của `npm run lint`, `npm run test`, `npm run build` và của lượt e2e dán vào báo cáo; `node prisma/check-constraints.mjs . prisma` vẫn pass với **số thật** (gần nhất 107/107 — schema không đổi nên không thêm kịch bản); reviewer (Sonnet 5, tiền + ủy quyền) chạy trên thay đổi chưa commit và **báo cáo đầy đủ** nằm trong checkpoint; nêu lại `[ASSUMPTION]` §3, câu trả lời của Q-P4-36..50 và các giới hạn (không hoàn tác quyết toán; `contracts_one_open_per_room` chặn cảnh "gia hạn + ACTIVE cùng phòng"; giảm trừ khi cho thuê lại là Q-01/Phase 5).
- Đánh dấu các dòng "Acceptance" liên quan của `16-billing.md` kèm tên test: dòng **A-10**, dòng **"Early move-out on 25/11/2026 … FINAL invoice total = −net"**; và dòng `14-contracts.md` "cancel after deposit paid … net 1.500.000" vẫn do CON-12 (Phase 3) phủ, không đổi.
- Thông điệp commit đề xuất: `feat(billing): move-out settlement with dry-run, FINAL invoice and deposit refund (BE-P4-29..33, BIL-13..20, A-01, A-06, A-10, A-21, D-14, D-41, AUD-01, API-05, SCOPE-02, Q-P3-3, Q-P4-8, Q-P4-10, Q-P4-12, Q-P4-36..50)`.

---

## 5. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| **Thu hai lần** (kỳ j vừa có hóa đơn vừa vào `last_period_amount`; kỳ sau j vừa `previous_debt` vừa `remaining_rent`) | `unbilled` chỉ gồm kỳ **không có** hóa đơn chưa hủy; `previous_debt` chỉ gồm hóa đơn **UNPAID** đã phát hành; Q-P4-50 chặn cảnh hóa đơn của kỳ > j; test ca 1/3/14 của CP-1 và ca 4/5 của CP-3 |
| **Lệch 1 đ** → vỡ CHECK `settlements_net` hoặc `invoice_lines_amount` | Chỉ số nguyên đồng; `proratedAmount` (BigInt, nửa lên) **một lần mỗi kỳ/mỗi dòng** (A-21); `net` viết đúng công thức của CHECK; hàm thuần tự kiểm `sum(lines) = −net` và ném `RangeError` nếu lệch; `total` của FINAL = tổng dòng |
| **Hóa đơn FINAL vượt `Int`** của Postgres | Kiểm `Number.isSafeInteger` + `≤ 2147483647` cho `total`, `quantity`, `amount` như `issue-monthly.ts` đang làm → `VALIDATION_FAILED`, không 500 (bài học BE-P2-17) |
| **Đua** với ghi thu tay / webhook / job 00:05 trên cùng hóa đơn | Khóa theo thứ tự `rooms → contracts → invoices (ORDER BY id)` trong **một** transaction, giống move-in/cancel; đổi trạng thái bằng update có điều kiện, 0 dòng = `CONFLICT_STATE`; trigger `payments_invoice_check` là lưới cuối |
| **Deadlock** vì thứ tự khóa khác các luồng cũ | Dùng **đúng** thứ tự của `contract-cancel.service.ts`/`contract-move-in.service.ts`; không bao giờ khóa `invoices` trước `contracts` |
| **Transaction dài trên DB dev chậm (0,3–0,8 s/truy vấn)** | Đọc gom (một `findMany` cho hóa đơn, một cho chỉ số, một cho người/xe/dịch vụ qua `include`); không chờ khóa trong transaction dài (bài học QA-P3-02: thời gian chờ khóa tính vào 30 s); ca nghi ngờ chạy riêng trước khi kết luận lỗi logic |
| **`dryRun` âm thầm ghi** (ví dụ `runIdempotent` hay audit) | Một đường đi với cờ `write`; mọi lệnh ghi nằm sau **một** câu `if (!write) return view;`; test assert chính lời gọi `create`/`update`/`audit.log` (bài học BE-EX-08) |
| **Khóa tài khoản người thuê sai** (BIL-19 ↔ D-26/A-16) | **Chặn ở Q-P4-48**: không viết dòng mã nào cho bước 13 trước khi có câu trả lời; mặc định đề xuất là không khóa |
| **Vỡ CHECK `occupants_dates`** khi người ở vào sau ngày dọn đi | `move_out_date = max(moveOutDate, move_in_date)` (Q-P4-47), test ca 9 của CP-3 |
| **Mất dấu tiền cọc** khi `net > 0` mà không ai bấm "Đã trả lại" | `refund_paid_at` null là dấu hiệu; FE-P4-06 hiện nút, "Việc hôm nay"/báo cáo Phase 5 có thể lọc. Nêu ở CP-5 rằng Phase 4 **không** có nhắc tự động cho việc này |
| **Test danh sách cố định bị vỡ** | Không thêm mã lỗi (`app.setup.spec.ts` không đổi), không thêm module (`prisma.service.spec.ts` không đổi), không thêm khóa seed (`seed.spec.ts` không đổi), không thêm khóa `DB_ERROR_MAP`, không thêm mẫu mail. Nếu một trong các điều này hóa ra cần thiết: sửa test trong **cùng** thay đổi (bài học BE-P2-02, BE-P2-10, BE-P3-18, BE-EX-34) |
| **Spec boot `AppModule` gửi mail thật** | Ghi đè `MailerService` trong mọi spec mới boot `AppModule`; hai config vitest đã đặt `MAIL_PROVIDER: ''` — giữ nguyên (bài học EX-8) |
| **`Paginated` bị spread** (nếu thêm danh sách) | P4-6 không có route list; nếu phải thêm, dùng `new Paginated(data, meta)` (bài học BE-P4-19) |

---

## 6. Ma trận luật → checkpoint

| Luật | CP |
|---|---|
| BIL-13 (j), BIL-14, BIL-15, BIL-16 (toán), BIL-17, BIL-18 (dòng), D-14, D-41, A-01, A-21, 12-pricing (bậc điện), MTR-05 | CP-1 |
| BIL-13 (route, ACTIVE), A-10, BIL-21, Q-P4-10, SCOPE-02, API-02/API-07, PLAN phase §8, BIL-17 (cọc chuỗi), BIL-16 (chọn hóa đơn) | CP-2 |
| BIL-18 (ghi), BIL-19, BIL-20/A-06, Q-P4-12, MTR-02/MTR-03/MTR-10, D-38, API-05, AUD-01/AUD-02, NOTI-04/NOTI-07/NOTI-11, BIL-10, BIL-11, CON-13/CON-14, D-26/A-16 | CP-3 |
| Q-P3-3, Q-P4-8, CHECK `settlements_refund`, AUD-02, API-05 | CP-4 |
| Hai dòng Acceptance của 16-billing (A-10, dọn sớm 25/11/2026), lint/test/build, e2e DB dev, DB checker, reviewer | CP-5 |
| Giảm trừ khi cho thuê lại (Q-01), hoàn tác quyết toán, báo cáo RPT-01 dùng `settlements`, trang `/ql/hop-dong/:id` phần quyết toán | **ngoài P4-6**: Phase 5 · không làm · FE-P4-06 |
