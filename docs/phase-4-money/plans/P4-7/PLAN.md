# P4-7 · Frontend nhân sự: các trang tiền (FE-P4-01..09, gồm FE-P4-08a)

Bản vẽ cho phiên chính. **Không có mã nguồn trong file này.** Đọc trước: `CLAUDE.md` (gốc), `Source/frontend/CLAUDE.md`, `docs/LESSONS.md` (mục "Tests and expected values" và "Working with the plan" — bài học FE-EX-03, FE-EX-09, FE-EX-18..20, FE-P3-01, FE-LP-01, FE-P3-03/06, 13/11 về ca nhạy thời gian), `docs/phase-4-money/README.md` (D-44 — đặc biệt Q-P4-18/20 chuông, Q-P4-24..27 hóa đơn, Q-P4-28..35 ngân hàng, Q-P4-36..50 quyết toán), `docs/phase-4-money/feature_p4-7-frontend-staff.md`, `plans/PHASE/PLAN.md` §3/§7/§8 và mục P4-7, `plans/P4-3/PLAN.md` CP-7 (chuông), `docs/spec/30-frontend.md` (các dòng `/ql`, `/ql/chi-so`, `/ql/hoa-don`, `/ql/hoa-don/:id`, `/ql/giao-dich`, `/ql/hop-dong/:id`; UI-01..09, LOC-01), `docs/spec/31-ui-kit.md` (KIT-01..08), `docs/spec/16-billing.md`, `15-meters.md`, `17-bank.md`, `19-notifications.md` (NOTI-06, NOTI-11).

---

## 1. Mục tiêu và phạm vi

**Mục tiêu:** quản lý/Boss làm được một tháng vận hành trên web, chỉ bằng bộ kit có sẵn: cuối tháng vào `/ql/chi-so` nhập chỉ số cả tòa trên điện thoại → mùng 1 hóa đơn tự phát hành, cái nào bất thường thì bấm "Phát hành" ở `/ql/hoa-don/:id` → thu tiền tay hoặc thấy webhook đã ghi nhận → nhắc nợ → trả phòng thì quyết toán ngay trong `/ql/hop-dong/:id` (xem trước bằng `dryRun`) → Boss đối soát tiền lạ ở `/ql/giao-dich`. Chuông hộp thư nhân sự (NOTI-11) nằm trong `StaffLayout`.

### Trong phạm vi

| Mã | Nội dung | Luật |
|---|---|---|
| FE-P4-01 | Khung route + menu cho cả phase (4 trang nhân sự + 2 trang người thuê để trống cho P4-8), guard theo vai trò | AUTH-05/06, 30-frontend |
| FE-P4-02 | `/ql/chi-so` — danh sách draft đến hạn, nhập điện/nước, lưu theo lô, kết quả từng dòng, dòng muộn hiện đỏ | MTR-09..MTR-12, D-42, UI-03, UI-05, UI-07 |
| FE-P4-03 | `/ql/hoa-don` — lọc tòa/trạng thái/loại/quá hạn/kỳ, nhãn trạng thái chung | BIL (bảng trạng thái), UI-02, UI-03 |
| FE-P4-04 | `/ql/hoa-don/:id` — dòng hóa đơn, dòng bậc điện, mốc chỉ số, VietQR, "Phát hành", "Ghi thu tay", "Lập lại", "Nhắc" | BIL-08, BIL-10, BIL-11, BIL-12, BIL-12a, UI-04, UI-06 |
| FE-P4-05 | Thẻ tiền ở `/ql` — "Chờ chỉ số", thẻ đỏ "Kỳ chưa có hóa đơn" + "Tạo hóa đơn kỳ này", "Hóa đơn quá hạn", hợp đồng sắp/đã hết hạn, gia hạn đang chờ | NOTI-06, BIL-05, BIL-21, D-42, CON-20/21 |
| FE-P4-06 | Quyết toán trong `/ql/hop-dong/:id` — form, xem trước `dryRun`, xác nhận, "Đã trả lại tiền" | BIL-13..BIL-20, Q-P3-3, Q-P4-8, UI-04, UI-06 |
| FE-P4-07 | `/ql/giao-dich` (Boss) — không khớp lên đầu, gán vào hóa đơn, đánh dấu đã hoàn | BANK-05, Q-P4-34 |
| FE-P4-08a | Chuông hộp thư nhân sự trong `StaffLayout` | NOTI-11, Q-P4-18, Q-P4-20 |
| FE-P4-09 | ⏸ lint + build + test:components | — |

### Ngoài phạm vi

| Việc | Ở đâu | Vì sao |
|---|---|---|
| **FE-P4-08** (`/thue` khối "hóa đơn cần trả" + ngày thu kế tiếp) | **chuyển sang P4-8** | Quyết định của planner: khối này đọc `GET /me/invoices`, cần **đúng** module api + type của người thuê mà FE-P4-10/11 tạo, và cần **cả hai** từ điển vi/en (LOC-01, UI-12, FE-P4-12). Làm ở P4-7 thì phải viết api người thuê hai lần hoặc để nửa chừng chuỗi song ngữ sang checkpoint khác — nhiều mã hơn, không ít hơn. P4-7 **chỉ** để lại hai route trống `/thue/hoa-don`, `/thue/hoa-don/:id` trong FE-P4-01 (đúng chữ "khung route của cả phase"), nhờ đó P4-8 không phải sửa `routes.tsx` và không làm đỏ lại các test đọc `routes[0..2]`. Nêu lại ở CP-1. |
| Trang người thuê `/thue/hoa-don(/:id)`, song ngữ, "Báo lỗi thanh toán" | P4-8 (FE-P4-10..14) | |
| Hộp thư đầy đủ `/ql/thong-bao`, `/thue/thong-bao`, NOTI-01..03 | Phase 5 | P4-7 chỉ có chuông + popup (Q-P4-18) |
| Báo cáo, nhật ký, trang Cài đặt, "báo lỗi thanh toán" (BANK-06/REQ-07) | Phase 5 | chỗ trên `/ql/giao-dich` để trống |
| Tiếng Anh cho trang nhân sự | không làm | LOC-01: app nhân sự chỉ tiếng Việt |
| Thêm component vào `src/components/` | **không**, trừ khi đúng KIT-07 | Mọi thứ dựng từ kit sẵn có; xem §2.4 |
| Thêm dependency, đổi schema, route BE mới | **không** (trừ Q-P4-54/Q-P4-57/Q-P4-58 nếu chủ dự án chọn phương án cần BE) | phải hỏi trước |

**Không dependency mới.** Đã có: `react` 19, `react-router`, `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`. Không thêm thư viện bảng, lịch, toast, QR.

---

## 2. Kiến trúc

### 2.1 Sơ đồ

```
 StaffLayout (menu + BuildingSelector + 🔔 NotificationBell)
   │
   ├─ /ql                 StaffHomePage ───────► GET /dashboard?buildingId=        (nhóm tiền: awaitingReadings,
   │                        └ features/dashboard/MoneyCards.tsx                     missedPeriods, overdueInvoices,
   │                             "Tạo hóa đơn kỳ này" ──► POST /contracts/:id/monthly-invoices { periodNo }
   │                                                                                expiringContracts, expiredContracts,
   │                                                                                renewalsWaiting)
   ├─ /ql/chi-so          MetersPage ──────────► GET /meter-readings/due?buildingId=
   │                        └ features/meters/ReadingRow + BatchSaveBar
   │                             "Lưu chỉ số" ──► POST /meter-readings  [ {roomId, invoiceId, kind, value, readOn} … ]
   │                                              → mảng kết quả TỪNG DÒNG { index, ok, data | error }
   │
   ├─ /ql/hoa-don         InvoicesPage ────────► GET /invoices?buildingId&status&type&overdue&period&page&limit
   │                        └ features/invoices/InvoiceFilters + InvoiceRow
   │
   ├─ /ql/hoa-don/:id     InvoiceDetailPage ───► GET /invoices/:id
   │                        └ features/invoices/{InvoiceLines,InvoiceReadings,InvoiceQr,InvoiceActions}
   │                             Phát hành   ──► POST /invoices/:id/issue
   │                             Ghi thu tay ──► POST /invoices/:id/payment   { method, paidAt?, note? }  + Idempotency-Key
   │                             Lập lại     ──► POST /invoices/:id/reissue   { reason, corrections[] }   + Idempotency-Key
   │                             Nhắc        ──► POST /invoices/:id/remind
   │
   ├─ /ql/hop-dong/:id    ContractDetailPage (sửa) ──► features/contracts/SettlementCard.tsx
   │                             Xem trước   ──► POST /contracts/:id/settlement?dryRun=true   (KHÔNG ghi gì)
   │                             Quyết toán  ──► POST /contracts/:id/settlement?dryRun=false  + Idempotency-Key
   │                             Đã trả lại  ──► POST /settlements/:id/refund-paid { method, paidAt?, note? }
   │
   └─ /ql/giao-dich (BOSS) BankTransactionsPage ─► GET /bank-transactions?status&from&to&page&limit
                                 Gán         ──► POST /bank-transactions/:id/assign { invoiceId }   + Idempotency-Key
                                 Đã hoàn     ──► POST /bank-transactions/:id/mark-refunded { note } + Idempotency-Key

 🔔 NotificationBell ──► GET /me/notifications?page&limit (&unread) → meta.unreadCount
                    ──► POST /me/notifications/:id/read · POST /me/notifications/read-all
```

Nguyên tắc bắt buộc (nhắc lại từ `CLAUDE.md` và UI-06): **FE không có một phép tính tiền nào.** Mọi `total`, `amount`, `net`, `refund`, tiêu thụ, dòng bậc điện, số ngày quá hạn đều lấy nguyên từ API; `dryRun` là nguồn duy nhất của bản xem trước quyết toán. FE chỉ `formatMoney`/`formatDate` để hiển thị. Không bao giờ cộng/trừ/nhân một con số tiền trong FE — kể cả để hiện "tổng đã lọc".

### 2.2 File thêm / sửa

| File | Thêm/Sửa | Việc | CP |
|---|---|---|---|
| `src/app/routes.tsx` | sửa | 4 route nhân sự + `/ql/giao-dich` trong khối `RequireAuth allow={['BOSS']}` + 2 route người thuê để trống | CP-1 |
| `src/layouts/StaffLayout.tsx` | sửa | thêm link menu (Q-P4-52) và `<NotificationBell />` trong `action` của `RoomsHeader` | CP-1, CP-8 |
| `src/pages/staff/MetersPage.tsx` | thêm | `/ql/chi-so` | CP-1, CP-2 |
| `src/pages/staff/InvoicesPage.tsx` | thêm | `/ql/hoa-don` | CP-1, CP-3 |
| `src/pages/staff/InvoiceDetailPage.tsx` | thêm | `/ql/hoa-don/:id` | CP-1, CP-4 |
| `src/pages/staff/BankTransactionsPage.tsx` | thêm | `/ql/giao-dich` | CP-1, CP-7 |
| `src/pages/tenant/TenantInvoicesPage.tsx`, `TenantInvoiceDetailPage.tsx` | thêm | **chỉ `SectionHeading` + ListState rỗng**, P4-8 điền ruột | CP-1 |
| `src/features/meters/api.ts`, `types.ts` | thêm | `listDueReadings`, `recordReadings`, `issueInvoice` (dùng `apiRequest`, `listPath` **không** dùng cho `/meter-readings/due` vì DTO không nhận `page/limit` — bài học FE-EX-22) | CP-2 |
| `src/features/meters/ReadingRow.tsx`, `meters.css` | thêm | một dòng phòng: ô điện, ô nước, ghi chú, trạng thái lưu, lỗi theo ô | CP-2 |
| `src/features/invoices/api.ts`, `types.ts` | thêm | `listInvoices`, `getInvoice`, `recordPayment`, `reissueInvoice`, `remindInvoice`, `createMissedInvoice` | CP-3, CP-4, CP-5 |
| `src/features/invoices/InvoiceFilters.tsx`, `InvoiceRow.tsx`, `invoices.css` | thêm | danh sách + bộ lọc | CP-3 |
| `src/features/invoices/InvoiceLines.tsx`, `InvoiceReadings.tsx`, `InvoiceQr.tsx`, `InvoiceActions.tsx` | thêm | chi tiết + 4 hành động, mỗi hành động một `ConfirmDialog` nêu số tiền | CP-4 |
| `src/features/invoices/status.ts` | thêm | `invoiceLabel(invoice)` → dùng `invoiceStatusLabels` + `derivedInvoiceLabels.overdue` theo cờ `overdue` của BE | CP-3 |
| `src/features/dashboard/api.ts` | sửa | thêm 6 nhóm tiền vào `DashboardView` (khớp `dashboard.service.ts`) | CP-5 |
| `src/features/dashboard/MoneyCards.tsx`, `dashboard.css` | thêm/sửa | 5 thẻ tiền + nút "Tạo hóa đơn kỳ này" | CP-5 |
| `src/features/contracts/SettlementCard.tsx` | thêm | form + xem trước + xác nhận + "Đã trả lại tiền" | CP-6 |
| `src/features/contracts/api.ts`, `types.ts` | sửa | `previewSettlement`, `settleContract`, `markRefundPaid` | CP-6 |
| `src/pages/staff/ContractDetailPage.tsx` | sửa | gắn `SettlementCard` (vị trí: Q-P4-53) | CP-6 |
| `src/features/bank/api.ts`, `types.ts`, `bank.css` | thêm | `listBankTransactions`, `assignTransaction`, `markRefunded` | CP-7 |
| `src/features/notifications/NotificationBell.tsx`, `useMyNotifications.ts`, `notifications.api.ts`, `notifications.css` | thêm | chuông + popup kiểu Facebook web | CP-8 |
| `tests/p4/*.test.mjs` (7 file, xem §4) | thêm | test theo từng CP | CP-1..CP-8 |
| `tests/auth-guards.test.mjs`, `tests/auth-login-flow.test.mjs`, `tests/p2/cp1-routes.test.mjs`, `tests/p2/cp2-staff-layout.test.mjs` | **sửa** | mảng menu, số item, danh sách stub route (xem §2.7) | CP-1, CP-8 |
| `docs/phase-4-money/PROGRESS.md`, `docs/LESSONS.md` | sửa | trước CP-9 | CP-9 |

**Không** sửa `src/components/` (kit đã đủ, KIT-01/KIT-07), **không** thêm thư mục component thứ hai, **không** sửa `src/shared/status-labels.ts` (nhãn hóa đơn và "Quá hạn" đã có đúng chữ 16-billing từ FE-P3-01), **không** sửa `src/shared/api.ts`, **không** sửa `src/app/RequireAuth.tsx`. Nếu phát hiện phải sửa một trong các file này → dừng, báo ở checkpoint, đừng làm thêm (bài học FE-LOGIN-09).

### 2.3 Hợp đồng API đang có (đọc từ mã BE, không phải từ spec)

Chỉ liệt kê những gì FE dùng. Mọi route dưới đây là `Cache-Control: no-store`, trả `{ data }` (list thêm `meta`), lỗi `{ error: { code, message, fields? } }` → `ApiError` của `shared/api.ts`.

| Method | Path | Vai trò | Request | Response (phần FE dùng) |
|---|---|---|---|---|
| GET | `/dashboard?buildingId=` | BOSS, MANAGER | — | …`awaitingReadings { count, late, items: PeriodItem[] }`, `missedPeriods { count, items }` (**mọi** kỳ thiếu, không phân trang), `overdueInvoices { count, items: InvoiceRef[] }`, `expiringContracts`/`expiredContracts`/`renewalsWaiting { count, items: ContractItem[] }` |
| GET | `/meter-readings/due?buildingId=` | BOSS, MANAGER | — | **mảng thuần, không phân trang**: `{ invoiceId, contractId, periodNo, periodStart, periodEnd, billingDate, overdue, reviewRequired, room { id, code }, tenant { id, fullName }, building { id, name, waterMode }, previousReadings: { ELECTRIC: { id, value, readOn } \| null, WATER: … } }` |
| POST | `/meter-readings` | BOSS, MANAGER | **mảng** `[{ roomId, invoiceId?, kind: 'ELECTRIC'\|'WATER', value, readOn, photoUrl?, isMeterReplaced?, oldMeterFinal?, note? }]` | `[{ index, ok: true, data: { invoiceId, readingId, status } } \| { index, ok: false, error: ErrorCode }]` — **200 cho cả lô** dù có dòng lỗi; mảng rỗng → 400 `VALIDATION_FAILED` |
| POST | `/invoices/:id/issue` | BOSS, MANAGER | — | `{ invoiceId, status }` |
| POST | `/contracts/:id/monthly-invoices` | BOSS, MANAGER | `{ periodNo }` | hóa đơn DRAFT vừa tạo |
| GET | `/invoices` | BOSS, MANAGER | `buildingId?`, `status?`, `type?`, `overdue?` (`true\|false`), `period?` (`YYYY-MM`), `page`, `limit` | `data: { id, code: 'TT{id}', type, status, periodNo, periodStart, periodEnd, issueDate, dueDate, total, overdue, contract { id, code, room, building, tenant } }[]` + `meta { page, limit, total }` |
| GET | `/invoices/:id` | BOSS, MANAGER | — | như trên **cộng** `cancelReason`, `replacesId`, `replacedById`, `lines[{ kind, label, quantity, unitPrice, amount, meta }]` (đã sắp theo `sortOrder`), `meterReadings[{ id, kind, value, readOn, isMeterReplaced, oldMeterFinal, photoUrl }]`, `payment { amount, method, source, paidAt } \| null`, `vietqr \| null`, `qrImageUrl \| null` (chỉ khi UNPAID, BIL-10) |
| POST | `/invoices/:id/payment` | BOSS, MANAGER | `{ method, paidAt?, note? }` + `Idempotency-Key` | `{ id, invoiceId, amount, method, source, paidAt }` |
| POST | `/invoices/:id/reissue` | BOSS, MANAGER | `{ reason, corrections: [{ kind, value, isMeterReplaced?, oldMeterFinal? }] }` + `Idempotency-Key` | `{ invoiceId, replacesId, status, total }` |
| POST | `/invoices/:id/remind` | BOSS, MANAGER | — | `{ invoiceId, remindedAt, email }` |
| POST | `/contracts/:id/settlement?dryRun=` | BOSS, MANAGER | `{ moveOutDate, finalReadings { electric, water, electricPhotoUrl?, waterPhotoUrl? }, damages?, depositForfeit?, note? }` (+ `Idempotency-Key` khi ghi thật) | `{ dryRun, contract { id, code, endDate }, moveOutDate, periodNo, lastPeriodAmount, remainingRent, previousDebt, deposit, damages, depositForfeit, net, refund, lines[{ kind, label, quantity, unitPrice, amount }], mergedDrafts[], settledInvoices[], utilities { electric { opening, closing, consumption }, water }, settlementId \| null, finalInvoice { id, code, total, dueDate } \| null, refundPaidAt }` |
| POST | `/settlements/:id/refund-paid` | BOSS, MANAGER | `{ method, paidAt?, note? }` + `Idempotency-Key` | `{ settlementId, net, refundPaidAt, method }` |
| GET | `/bank-transactions` | **BOSS** | `status?`, `from?`, `to?` (`YYYY-MM-DD`), `page`, `limit` | `data: { id, provider, providerTxId, amount, content, accountNumber, receivedAt, status, note, handledAt, invoice { id, code, total, status, roomCode, tenantName } \| null }[]` + `meta` |
| POST | `/bank-transactions/:id/assign` | **BOSS** | `{ invoiceId }` + `Idempotency-Key` | `{ bankTransactionId, invoiceId, paymentId, status: 'ASSIGNED' }` |
| POST | `/bank-transactions/:id/mark-refunded` | **BOSS** | `{ note }` (bắt buộc, ≤ 500) + `Idempotency-Key` | `{ bankTransactionId, status: 'REFUNDED', note, handledAt }` |
| GET | `/me/notifications` | BOSS, MANAGER, TENANT | `page`, `limit`, `unread?` | `data: { id, kind, title, body, link, readAt, createdAt }[]` + `meta { page, limit, total, unreadCount }` |
| POST | `/me/notifications/:id/read` · `/read-all` | như trên | — | `{ id, readAt }` · `{ updated }` |

**Chưa có** (quan trọng cho FE-P4-04/06, xem Q-P4-54 và Q-P4-57): `GET /contracts/:id` **không** trả thông tin `settlements` (không có `settlementId`, `net`, `refundPaidAt`), không có `GET /settlements/:id`, và chi tiết hóa đơn **không** có cờ "hôm nay đã nhắc".

### 2.4 Component kit dùng cho từng trang (KIT-01: chỉ dùng `src/components/`)

| Trang | Kit dùng |
|---|---|
| `/ql/chi-so` | `SectionHeading`, `ElevatedCard` (một thẻ mỗi phòng), `TextField` (`inputMode="numeric"`), `FormError`, `Spinner`, `RoomsButton`, `StatusBadge` (muộn/bất thường), `ConfirmDialog` (lưu lô), `FilterChip` (lọc "Còn thiếu"/"Tất cả") |
| `/ql/hoa-don` | `SectionHeading`, `TextField`, `FilterChip`, `ElevatedCard`, `StatusBadge`, `Spinner`, `FormError`, `RoomsButton` (phân trang), `SelectField`/`TextAreaField` của `features/buildings/fields.tsx` (đã dùng ở `ContractsPage`) |
| `/ql/hoa-don/:id` | `SectionHeading`, `ElevatedCard`, `StatusBadge`, `CostBreakdown` **hoặc** `<dl>`+`ElevatedCard` cho các dòng (xem ghi chú), `ConfirmDialog` (4 hành động), `TextField`/`SelectField`/`TextAreaField`, `FormError`, `Spinner`, `RoomsButton` |
| `/ql` thẻ tiền | `ElevatedCard`/`section.dashboard-card` sẵn có, `StatusBadge`, `RoomsButton`, `ConfirmDialog`, `Link` |
| `/ql/hop-dong/:id` quyết toán | `ElevatedCard`, `TextField`, `TextAreaField`, `SelectField`, `ConfirmDialog`, `FormError`, `Spinner`, `RoomsButton`, `StatusBadge` |
| `/ql/giao-dich` | `SectionHeading`, `FilterChip`, `ElevatedCard`, `StatusBadge`, `TextField`, `TextAreaField`, `ConfirmDialog`, `FormError`, `Spinner`, `RoomsButton` |
| 🔔 chuông | `RoomsButton` (nút chuông và từng dòng), `ElevatedCard` (hộp thả xuống), `Spinner`, `FormError`; mẫu mở/đóng + `Escape` + trả focus lấy theo `ConfirmDialog.tsx` |

Ghi chú `CostBreakdown`: đọc props của nó trước khi dùng; nếu nó không nhận được danh sách dòng của hóa đơn (nhãn + số lượng + đơn giá + tiền) thì **không** uốn nó — dùng `ElevatedCard` + `<dl>`/`<table>` với token của `rooms.css`, như `ContractInformation.tsx` đang làm. Không tạo component "InvoiceTable" trong `src/components/` (chỉ một trang dùng → để trong `features/invoices/`, đúng `Source/frontend/CLAUDE.md`).

Màu/khoảng cách chỉ lấy từ biến trong `.rooms-theme` của `rooms.css`; mỗi feature một file `*.css` nhỏ như `contracts.css`/`dashboard.css` đang làm.

### 2.5 Dữ liệu: khóa query và invalidate (UI-09)

Khóa theo đúng khuôn đang có (`['contracts', 'list', scope, …]`), với `scope = authScopeKey(user)` và `selection = selectedBuildingId` để không bao giờ trộn dữ liệu giữa hai tài khoản/hai phạm vi (bài học FE-P3-03/06):

| Khóa | Nguồn |
|---|---|
| `['dashboard', selection, scope]` | **đã có**, không đổi |
| `['meter-readings', 'due', scope, selection]` | `GET /meter-readings/due` |
| `['invoices', 'list', scope, selection, filters, page]` | `GET /invoices` |
| `['invoices', 'detail', scope, id]` | `GET /invoices/:id` |
| `['bank-transactions', 'list', scope, filters, page]` | `GET /bank-transactions` |
| `['notifications', 'me', scope]` | `GET /me/notifications` |
| `['contracts', 'detail', scope, id]` | **đã có** |

Sau mỗi mutation (gọi `client.invalidateQueries({ queryKey: [...] })`, **không** tự sửa cache bằng tay — số tiền phải đến từ BE):

| Hành động | Invalidate |
|---|---|
| `POST /meter-readings` (lô) | `['meter-readings']`, `['invoices']`, `['dashboard']`, `['notifications']` |
| `POST /invoices/:id/issue` | `['invoices']`, `['meter-readings']`, `['dashboard']`, `['notifications']` |
| `POST /invoices/:id/payment` | `['invoices']`, `['dashboard']`, `['contracts']` (thẻ cọc), `['notifications']`, `['bank-transactions']` |
| `POST /invoices/:id/reissue` | `['invoices']`, `['meter-readings']`, `['dashboard']`, `['notifications']` + điều hướng tới `/ql/hoa-don/{invoiceId mới}` |
| `POST /invoices/:id/remind` | `['invoices', 'detail']` (chỉ để nút khóa lại theo trạng thái mới) |
| `POST /contracts/:id/monthly-invoices` | `['dashboard']`, `['invoices']`, `['meter-readings']` rồi chuyển tới `/ql/chi-so` |
| `POST /contracts/:id/settlement?dryRun=false` | `invalidateContracts(client)` (đã có: contracts, my-contracts, rooms, viewings, dashboard, vehicles) **+** `['invoices']`, `['notifications']` |
| `POST /settlements/:id/refund-paid` | `['contracts', 'detail']`, `['dashboard']` |
| `POST /bank-transactions/:id/assign` · `/mark-refunded` | `['bank-transactions']`, `['invoices']`, `['dashboard']`, `['notifications']` |
| `POST /me/notifications/:id/read` · `read-all` | `['notifications']` |

`dryRun=true` **không** phải mutation có hậu quả nhưng vẫn gọi bằng `useMutation` (không `useQuery`) để không bị refetch tự động và không bao giờ chạy khi người dùng chưa bấm "Xem trước".

Mỗi hành động tiền dùng lại `useContractAction()` (`features/contracts/actions.ts`): chống bấm hai lần bằng `busy.current`, giữ `error` để hiện `FormError`. Mỗi lần mở hộp xác nhận sinh **một** `operationKey()` (`crypto.randomUUID`) và gửi làm `Idempotency-Key` cho mọi lần bấm lại của **cùng** hộp đó (API-05) — đúng cách `CancelContractForm`/`DepositPaymentForm` đang làm.

### 2.6 Hộp xác nhận, nhãn trạng thái, lỗi theo ô

**UI-04 — mọi hành động tiền có `ConfirmDialog` nêu số tiền**, lấy từ dữ liệu BE đã tải:

| Hành động | Tiêu đề | Nội dung phải nêu |
|---|---|---|
| Lưu lô chỉ số | "Lưu chỉ số đã nhập?" | số dòng sẽ lưu + câu "Hóa đơn của phòng đủ chỉ số sẽ được phát hành ngay" (**không** nêu số tiền: FE chưa có con số nào — UI-06; xem Q-P4-60) |
| Phát hành | "Phát hành hóa đơn TT{id}?" | phòng, kỳ, và câu "Người thuê sẽ nhận email kèm VietQR" |
| Ghi thu tay | "Xác nhận đã nhận tiền" | **`formatMoney(invoice.total)`**, phương thức đã chọn, mã `TT{id}`, phòng |
| Lập lại | "Lập lại hóa đơn TT{id}?" | tổng cũ `formatMoney(invoice.total)`, lý do, danh sách chỉ số sẽ sửa (cũ → mới), câu "Hóa đơn cũ sẽ bị hủy và hệ thống tính lại toàn bộ" |
| Nhắc | "Gửi nhắc thanh toán?" | `formatMoney(total)`, hạn, "tối đa một lần mỗi ngày" |
| Tạo hóa đơn kỳ này | "Tạo hóa đơn kỳ {dd/mm}–{dd/mm}?" | phòng, người thuê, kỳ (chưa có số tiền → nêu "Hóa đơn nháp, chờ chỉ số") |
| Quyết toán | "Xác nhận quyết toán" | **toàn bộ** bảng của `dryRun`: `lastPeriodAmount`, `remainingRent`, `previousDebt`, `deposit`, `damages`, `depositForfeit`, **`net`** và `refund`, cộng `finalInvoice.total`/`dueDate` nếu có |
| Đã trả lại tiền | "Đã trả lại tiền cọc?" | `formatMoney(net)`, phương thức, câu "Ghi một lần, không hoàn tác được" |
| Gán giao dịch | "Gán giao dịch vào hóa đơn?" | `formatMoney(tx.amount)`, `TT{invoiceId}`, `formatMoney(invoice.total)` nếu đã tải được, nội dung chuyển khoản |
| Đánh dấu đã hoàn | "Đánh dấu đã hoàn tiền?" | `formatMoney(tx.amount)`, ghi chú bắt buộc, "không hoàn tác" |

**UI-02 — nhãn trạng thái hóa đơn** lấy từ `src/shared/status-labels.ts` (đã đúng 16-billing, **không** sửa file này):

```
DRAFT → "Nháp" (tone maintenance) · UNPAID → "Chưa thanh toán" (reserved) · PAID → "Đã thanh toán" (available)
SETTLED → "Đã quyết toán" (occupied) · CANCELLED → "Đã hủy" (maintenance)
derivedInvoiceLabels.overdue → "Quá hạn" (tone reserved, hiện ĐỎ)
```

`features/invoices/status.ts`: `invoiceLabel(row)` trả `row.overdue ? derivedInvoiceLabels.overdue : invoiceStatusLabels[row.status]`. **Cờ `overdue` do BE tính** (`status === 'UNPAID' && dueDate < hôm nay Hà Nội`) — FE **không** so ngày, không `new Date()` để suy ra quá hạn (D-40, UI-06). Đây đúng là dòng nghiệm thu trong "Issues log" của file task.

**UI-05 — lỗi:** `applyApiError` (`shared/form-errors.ts`) map `error.fields` lên input của react-hook-form; `error.message` hiện trong `FormError` cạnh hành động. Các ca riêng:

| Mã lỗi | Hiện ở đâu |
|---|---|
| `METER_VALUE_DECREASED` (400) | **ngay dưới ô số của đúng dòng và đúng loại đồng hồ** đã gửi (`index` của kết quả lô → dòng), kèm `error.message` của BE ("Chỉ số mới nhỏ hơn chỉ số trước"); ô giữ nguyên giá trị đã nhập để sửa |
| `VALIDATION_FAILED` + `fields` | từng ô theo khóa `fields` (`paidAt`, `note`, `reason`, `corrections`, `moveOutDate`, `damages`, `depositForfeit`, `invoiceId`, `periodNo`) |
| `CONFLICT_STATE` (409) | `FormError` cạnh nút, giữ nguyên form, **và** refetch chi tiết để người dùng thấy trạng thái thật |
| `INVOICE_NOT_UNPAID`, `PAYMENT_AMOUNT_MISMATCH`, `DEPOSIT_NOT_PAID`, `RATE_PLAN_MISSING` | `FormError` + refetch |
| `TOO_MANY_REQUESTS` (429) trên `/remind` | Q-P4-57 |
| `OUT_OF_SCOPE` / `FORBIDDEN` / `NOT_FOUND` | trạng thái lỗi của trang (`UI-03`) với nút "Thử lại"; `NOT_FOUND` ở trang chi tiết hiện "Không tìm thấy hóa đơn." + link về danh sách |
| `NETWORK_ERROR` | `error.message` chung của api client, có "Thử lại" |

**UI-03 — 4 trạng thái** cho mọi danh sách (`/ql/chi-so`, `/ql/hoa-don`, `/ql/giao-dich`, popup chuông): `Spinner block` khi `isPending`; rỗng = câu tiếng Việt + hành động kế tiếp ("Chưa có phòng nào chờ chốt chỉ số." + link `/ql/hoa-don`); lỗi = `FormError` + `RoomsButton` "Thử lại"; có dữ liệu.

**UI-07 — 360 px trước cho `/ql/chi-so`** (và cho hộp "Ghi thu tay"): mỗi phòng là **một thẻ dọc** (không bảng ngang), ô số `inputMode="numeric"` cao ≥ 44 px, nút "Lưu chỉ số" nằm trong thanh dính (`position: sticky; bottom: 0`) để ngón tay không phải cuộn lên; nhãn luôn hiện (UI-08), không dùng placeholder làm nhãn. Chỉ dùng media query để **mở rộng** lên nhiều cột ở ≥ 768 px.

**Quyền (PLAN phase §8):** `/ql/chi-so`, `/ql/hoa-don(/:id)` cho BOSS + MANAGER (BE lọc theo phạm vi, FE không tự lọc); **`/ql/giao-dich` chỉ BOSS** — vừa guard trong `routes.tsx` (`RequireAuth allow={['BOSS']}`, như `/ql/nhan-su`) vừa ẩn link menu; quản lý gõ URL → bị đẩy về `/ql`. Nút quyết toán hiện cho cả hai vai trò (BE chặn ngoài phạm vi).

### 2.7 Test cũ **phải** sửa trong cùng thay đổi

| File | Vì sao |
|---|---|
`tests/p2/cp1-routes.test.mjs` | danh sách stub `'../pages/staff/…'` phải có 4 trang mới + 2 trang người thuê, nếu không loader ném "Unexpected route dependency"; test đọc `routes[0..2]` và đếm con của `GuestOnly` (bài học FE-EX-03) |
`tests/p2/cp2-staff-layout.test.mjs` | `BOSS_MENU`/`MANAGER_MENU` là mảng **chính xác** + `assert.equal(length, 10)`/`(length, 8)` |
`tests/auth-guards.test.mjs` | hai `assert.deepEqual(header.props.links, [...])` cho MANAGER và BOSS |
`tests/auth-login-flow.test.mjs` | mảng `common`/`boss` và tên test "manager 8 items, Boss 10"; **và** fake `fetch` trả 404 cho URL lạ → phải trả lời `/me/notifications` khi chuông vào `StaffLayout` (bài học FE-EX-18..20); loader kit thủ công (`['RoomsHeader','RoomsButton','LanguageSwitch']`) phải thêm component kit mà chuông dùng (bài học FE-EX-09) |
`tests/p3/fe01-skeleton.test.mjs` | chỉ lọc theo `href` nên **không** vỡ vì thêm link, nhưng `loadLayout` liệt kê `kit` và module của `StaffLayout` → thêm dependency của chuông vào danh sách đó |

Grep bắt buộc **trước** lần chạy đầu: `Tra cứu xe`, `props.links`, `routes[`, `pages/staff/`, `dang-nhap?loi-vao=` trong `Source/frontend/tests/` (bài học FE-P3-01, FE-LP-01).

---

## 3. Câu hỏi cho chủ dự án

**Chủ dự án đã trả lời (23/11/2026):** theo đề xuất trừ **Q-P4-58** (thêm tải ảnh đồng hồ ngay, BE + FE) và **Q-P4-59** (chọn hóa đơn từ danh sách chưa trả cùng số tiền). Q-P4-54 = thêm settlement vào GET /contracts/:id. Ghi trong README phase.

Phiên chính hỏi **cả lượt này** trước khi viết mã của checkpoint bị chặn, rồi chép câu trả lời vào bảng §1 của `docs/phase-4-money/README.md` và mục "Questions for the owner" của `feature_p4-7-frontend-staff.md`. **Không tự quyết luật nghiệp vụ.** Đánh số tiếp Q-P4-50.

| Mã | Câu hỏi | Lựa chọn | Đề xuất | Chặn |
|---|---|---|---|---|
| **Q-P4-51** | **Bấm vào từng thư trong popup chuông làm gì?** Q-P4-20 đã chốt "bấm chuông mở popup nhỏ như Facebook web", nhưng hành vi khi bấm một thư thì để lại cho M7. BE đã lưu `link` (`/ql/hoa-don/{id}`, `/ql/hop-dong/{id}`, `/ql/chi-so`). | **A** đánh dấu đã đọc rồi điều hướng tới `link` trong cùng tab, popup đóng; thư không có `link` thì chỉ đánh dấu đã đọc và ở lại · **B** chỉ đánh dấu đã đọc, không điều hướng (muốn xem thì tự vào menu) · **C** điều hướng nhưng **không** đánh dấu đã đọc (phải bấm "Đánh dấu đã đọc" riêng) | **A** — đúng cảm giác Facebook web và là lý do BE lưu `link`; đã đọc thì mờ nhưng vẫn giữ (Q-P4-18) | CP-8 |
| **Q-P4-52** | **Nhãn và thứ tự menu nhân sự** cho 3 link mới (menu hiện có 8 item cho quản lý, 10 cho Boss; test khẳng định mảng chính xác). | **A** chèn sau "Hợp đồng": `Chốt chỉ số` → `/ql/chi-so`, `Hóa đơn` → `/ql/hoa-don`, `Giao dịch` (chỉ Boss) → `/ql/giao-dich`, rồi mới "Tra cứu xe", "Tài khoản" (quản lý 10, Boss 13) · **B** đưa cả ba xuống cuối, trước "Tài khoản" · **C** gộp vào một menu con "Tiền" (cần sửa `RoomsHeader` của kit → **không** đề xuất) | **A** — nhóm theo luồng việc (hợp đồng → chỉ số → hóa đơn → tiền vào), không đụng kit | CP-1 |
| **Q-P4-53** | **Form quyết toán đặt ở đâu trong `/ql/hop-dong/:id`?** Trang đã dài (thẻ tóm tắt, thông tin, cọc, người ở, xe, dịch vụ). | **A** một thẻ "Trả phòng và quyết toán" ở **cuối** trang, chỉ hiện khi `status === 'ACTIVE'`, mặc định thu gọn sau nút "Bắt đầu quyết toán" · **B** route riêng `/ql/hop-dong/:id/quyet-toan` (phải thêm route + sửa lại các test route) · **C** thẻ mở sẵn ở cuối trang | **A** — ít mã nhất, không thêm route, và không ai bấm nhầm vào một form tiền đang mở sẵn | CP-6 |
| **Q-P4-54** | **Sau khi tải lại trang, FE không biết hợp đồng đã quyết toán hay chưa.** `GET /contracts/:id` không trả `settlements` (không có `settlementId`, `net`, `refundPaidAt`) và không có `GET /settlements/:id`, nên nút "Đã trả lại tiền" biến mất khi F5 và không ai biết `settlementId`. | **A** thêm `settlement { id, moveOutDate, net, refund, refundPaidAt, finalInvoiceId }` vào `CONTRACT_DETAIL` của `contracts.service.ts` (**một thay đổi BE nhỏ trong phần P4-7**, không migration, phải sửa test chi tiết hợp đồng của BE) · **B** chỉ giữ trong state của trang: ai tải lại trang thì mất nút, phải đi hỏi chủ dự án/Boss · **C** FE gọi lại `dryRun` để đoán: trả `CONFLICT_STATE` nghĩa là "đã quyết toán" — nhưng **không** đọc được `net` nên vẫn không hiện được nút | **A** — B làm mất dấu tiền cọc phải trả lại (rủi ro §5), C là đoán mò. Cần bạn duyệt vì P4-7 vốn là phần FE | CP-6 |
| **Q-P4-55** | **Kết quả lưu theo lô hiện thế nào?** BE trả `[{ index, ok, data \| error }]`, có thể 8 dòng xanh 2 dòng đỏ trong một lượt. | **A** giữ nguyên danh sách tại chỗ: dòng thành công đổi sang "Đã lưu" (và biến mất khỏi danh sách sau lần refetch kế tiếp), dòng lỗi giữ số đã nhập + thông báo lỗi ngay dưới đúng ô, phía trên hiện một câu tổng "Đã lưu 8/10 dòng, 2 dòng cần xem lại" · **B** chỉ hiện câu tổng rồi refetch cả danh sách (người dùng tự tìm lại dòng lỗi) · **C** refetch toàn bộ, dòng lỗi báo trong một hộp riêng | **A** — đúng MTR-11 ("response lists per-item success or error") và UI-05; nhập lại 60 phòng vì một dòng sai là không chấp nhận được | CP-2 |
| **Q-P4-56** | **`/ql/hoa-don` mặc định lọc gì?** | **A** không lọc sẵn: mới nhất trước (đúng thứ tự API), người dùng bấm chip "Chưa thanh toán"/"Quá hạn" · **B** mặc định `status=UNPAID` · **C** mặc định `overdue=true` | **A** — việc "quá hạn" và "chờ chỉ số" đã nằm ở `/ql` (NOTI-06); danh sách không mặc định thì ít state hơn và không làm người dùng tưởng mất hóa đơn. Chọn **B** nếu bạn muốn mở trang là thấy ngay cần thu ai | CP-3 |
| **Q-P4-57** | **Nút "Nhắc" sau khi đã nhắc trong ngày** → BE trả 429 `TOO_MANY_REQUESTS` với câu chung "Bạn thao tác quá nhiều lần, vui lòng thử lại sau" (Q-P4-26: chỉ đếm nhắc tay). | **A** hiện đúng câu của BE · **B** FE đổi riêng mã `TOO_MANY_REQUESTS` của route này thành "Hôm nay đã nhắc hóa đơn này rồi, mai nhắc lại được" và khóa nút tới khi tải lại (chỉ thêm chữ ở FE) · **C** thêm `remindedToday: boolean` vào `GET /invoices/:id` để khóa nút từ đầu (**thay đổi BE**) | **B** — câu chung làm nhân sự tưởng mình bị giới hạn tốc độ; C đúng nhất nhưng tốn một thay đổi BE cho một dòng chữ | CP-4 |
| **Q-P4-58** | **Ảnh chỉ số:** MTR-07/MTR-11 cho phép `photoUrl` tùy chọn, nhưng `POST /t/sign` **chỉ** có `ROOM_IMAGE`, `CONTRACT_SCAN`, `ID_PHOTO` — hiện **không có đường tải ảnh đồng hồ** nào. | **A** Phase 4 **không** có ô ảnh ở `/ql/chi-so` và ở form quyết toán (đúng D-38 "đồng hồ không cần ảnh"), ảnh đã có trong DB vẫn **hiện** ở chi tiết hóa đơn · **B** thêm `METER_PHOTO` vào `sign.dto.ts` + ký upload ở BE rồi dùng `ImageUploader` (**thay đổi BE**, cần bạn duyệt) · **C** ô nhập URL thủ công (không đề xuất: dán link lạ vào DB) | **A** — bỏ được một mảng mã mà không mất luật nào; mở lại ở Phase 5 nếu thực tế cần bằng chứng ảnh | CP-2, CP-6 |
| **Q-P4-59** | **Chọn hóa đơn khi gán một giao dịch lạ** (`POST /bank-transactions/:id/assign { invoiceId }`; BE từ chối nếu không UNPAID hoặc lệch tiền). | **A** ô nhập mã `TT{id}` (hoặc số) + hộp xác nhận nêu số tiền giao dịch và mã hóa đơn; lệch tiền thì hiện `PAYMENT_AMOUNT_MISMATCH` của BE · **B** thêm danh sách gợi ý: gọi `GET /invoices?status=UNPAID` rồi lọc đúng số tiền để bấm chọn (nhiều mã hơn, và FE phải so sánh tiền → sát ranh giới UI-06) · **C** A trước, B ở Phase 5 | **C** (tức là làm A bây giờ) — nội dung chuyển khoản gần như luôn chứa `TT{id}`, nên nhập mã là đủ; so khớp tiền là việc của BE | CP-7 |
| **Q-P4-60** | **Lưu lô chỉ số có cần hộp xác nhận (UI-04) không?** Nó không phải hành động tiền, nhưng hệ quả là **phát hành hóa đơn và gửi mail cho khách**. | **A** có hộp xác nhận nêu số dòng + câu "Hóa đơn của phòng đủ chỉ số sẽ được phát hành và gửi email ngay" (không nêu số tiền vì FE chưa có) · **B** không hộp xác nhận (lưu luôn, lỗi thì sửa bằng "Lập lại") · **C** có hộp xác nhận và hiển thị số tiền dự kiến (**vi phạm UI-06**, không làm) | **A** — một lần bấm sai gửi mail cho hàng chục khách; "Lập lại" không rút lại được email | CP-2 |
| **Q-P4-61** | **Nút "Phát hành" hiện khi nào** ở `/ql/hoa-don/:id`? BE cho phát hành mọi DRAFT (thiếu chỉ số → `CONFLICT_STATE`), còn `reviewRequired` (MTR-08, A-04) chỉ là cờ tiêu thụ bất thường. | **A** hiện cho **mọi** hóa đơn DRAFT, kèm cảnh báo vàng "Tiêu thụ bất thường, hãy kiểm tra lại chỉ số" khi có cờ bất thường; thiếu chỉ số thì BE trả `CONFLICT_STATE` và trang hiện câu đó + link `/ql/chi-so` · **B** chỉ hiện khi có cờ bất thường, các DRAFT khác chỉ chờ chỉ số · **C** hiện cho mọi DRAFT, không cảnh báo gì | **A** — giữ một đường, và nhân sự vẫn thấy vì sao hóa đơn chưa tự phát hành | CP-4 |

`[ASSUMPTION]` sẽ dùng và **phải nêu lại** ở checkpoint CP-9:

- **A-04/MTR-08** cảnh báo tiêu thụ bất thường chỉ là cờ `reviewRequired` của `GET /meter-readings/due` và `meta` của dòng hóa đơn; FE không tự tính ngưỡng 2×.
- `/ql/chi-so` **luôn** gửi `invoiceId` lấy từ dòng của `GET /meter-readings/due`, nên ca "nhiều kỳ hợp lệ" (MTR-11 clarification 22/11, Q-P4-14) không bao giờ xảy ra từ trang này; nếu BE vẫn trả `CONFLICT_STATE` thì hiện lỗi của BE, **không** tự đoán kỳ.
- `readOn` mặc định của mỗi dòng chỉ số = **hôm nay theo Hà Nội** lấy từ `todayHanoi()` của `features/pricing/labels.ts` (đã dùng ở form hợp đồng), cho phép sửa về 1–2 ngày trước (MTR-10); FE **không** tự chặn khoảng ngày, BE chặn.
- Hóa đơn `FINAL`/`DEPOSIT` không có nút "Lập lại" (Q-P4-25: chỉ MONTHLY) — FE ẩn nút thay vì để BE trả `CONFLICT_STATE`.
- `GET /meter-readings/due` và nhóm `missedPeriods` của `/dashboard` **không phân trang**; nếu một tòa có quá nhiều dòng thì trang vẫn dựng hết (shortcut của BE). Nêu lại ở CP-2/CP-5 để Phase 5 quyết phân trang.
- `/ql/chi-so` và `/ql/hoa-don` bám **ô chọn tòa** chung (`BuildingSelector`, SCOPE-02): đổi tòa thì khóa query đổi, không trộn dữ liệu.
- Hai trang người thuê tạo ở CP-1 chỉ có tiêu đề; chúng **chưa** vào menu người thuê (link menu `/thue/hoa-don` thuộc P4-8 cùng từ điển en/vi) — nên các mảng menu của `TenantLayout` trong test **không** đổi ở phần này.

---

## 4. Checkpoints

File task P4-7 chỉ có **một** ⏸ ở **FE-P4-09** (CP-9); CP-1..CP-8 là các bước bên trong, mỗi bước tự kiểm được bằng lệnh. Trước CP-9: cập nhật `docs/phase-4-money/PROGRESS.md` và thêm vào `docs/LESSONS.md` lỗi nào đã mất một lượt làm lại.

Lệnh dùng ở "Done when" (chạy từ `Source/frontend`):

```
node --test tests/p4/<file>.test.mjs        # một file (xem package.json script test:components để chắc runner)
npm run lint && npm run build               # oxlint + tsc -b && vite build
npm run test:components                     # toàn bộ; chạy LẠI một lượt nếu có ca nhạy thời gian (bài học 13/11)
```

Mỗi bảng "Kịch bản test" dưới đây: **giá trị mong đợi lấy từ spec**, không lấy từ mã đang kiểm; mỗi test mang mã luật trong tên (`it('BIL-10: …')`). Không `.skip`/`.only`. Test dựng bằng `mountContractPage` của `tests/p3/contracts-dom.mjs` (fake `fetch` theo `rules`, QueryClient riêng, role/selection/language thay được) — **không** viết harness mới.

### CP-1 · FE-P4-01: khung route, menu và 6 trang trống

- **File:** `src/app/routes.tsx`, `src/layouts/StaffLayout.tsx`, `src/pages/staff/{MetersPage,InvoicesPage,InvoiceDetailPage,BankTransactionsPage}.tsx`, `src/pages/tenant/{TenantInvoicesPage,TenantInvoiceDetailPage}.tsx`, `tests/p4/fe01-routes-menu.test.mjs`; **sửa** 4 test ở §2.7.
- **Chặn bởi:** Q-P4-52 (nhãn + thứ tự menu).
- **Done when:** `npm run test:components` và `npm run build` pass; gõ `/ql/giao-dich` bằng tài khoản quản lý bị đẩy về `/ql`.

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | `matchRoutes` cho `/ql/chi-so`, `/ql/hoa-don`, `/ql/hoa-don/42` | 30-frontend | khớp đúng trang, nằm trong `StaffLayout`, đúng **một** `RequireAuth` với `allow = ['MANAGER','BOSS']` |
| 2 | `/ql/giao-dich` | 30-frontend, §8 | khớp `BankTransactionsPage`, có **hai** `RequireAuth` lồng nhau, cái trong `allow = ['BOSS']` (như `/ql/nhan-su`) |
| 3 | `guardRedirect` cho mỗi route mới với 4 vai trò + chưa đăng nhập | AUTH-05/06, FE-LP-01 | TENANT → `/thue`, GUEST → `/toi`, MANAGER trên `/ql/giao-dich` → `/ql`, chưa đăng nhập → `/dang-nhap?loi-vao=quan-ly&next=…` (đúng URL hiện tại) |
| 4 | `mustChangePassword` | AUTH | `/doi-mat-khau` cho mọi route mới |
| 5 | Menu quản lý và Boss | Q-P4-52, LOC-01 | mảng **chính xác** theo câu trả lời; link Boss-only chỉ có với BOSS; toàn bộ tiếng Việt |
| 6 | Bấm link menu mới | UI-08 | điều hướng trong SPA (một `preventDefault`, `navigate(href)`), không reload |
| 7 | 6 trang mới khi query đang chạy | KIT-01, UI-03 | mỗi trang có `<h2>` tiếng Việt đúng ("Chốt chỉ số", "Hóa đơn", "Chi tiết hóa đơn", "Giao dịch ngân hàng", "Hóa đơn", "Chi tiết hóa đơn") |
| 8 | `/thue/hoa-don`, `/thue/hoa-don/42` | P4-8 | khớp trang người thuê trong `TenantLayout`, `allow = ['TENANT']`; **menu người thuê không đổi** |
| 9 | Test cũ | FE-EX-03, FE-P3-01 | `cp1-routes`, `cp2-staff-layout`, `auth-guards`, `auth-login-flow` xanh sau khi cập nhật mảng và danh sách stub |

### CP-2 · FE-P4-02: `/ql/chi-so` (360 px trước)

- **File:** `src/features/meters/{api.ts,types.ts,ReadingRow.tsx,meters.css}`, `src/pages/staff/MetersPage.tsx`, `tests/p4/fe02-meters.test.mjs`.
- **Chặn bởi:** Q-P4-55 (kết quả từng dòng), Q-P4-58 (ảnh), Q-P4-60 (hộp xác nhận).
- **Done when:** `node --test tests/p4/fe02-meters.test.mjs` pass; `npm run lint && npm run build` pass. Kiểm tay ở 360 px: nhập 2 phòng, lưu, thấy "Đã lưu" và một dòng lỗi giữ số đã nhập.

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | 4 trạng thái của danh sách | UI-03 | Spinner / "Chưa có phòng nào chờ chốt chỉ số." + link `/ql/hoa-don` / `FormError` + "Thử lại" / danh sách |
| 2 | Dòng `overdue: true` | D-42, MTR-09 | thẻ có class đỏ + `StatusBadge` "Quá ngày chốt"; các dòng quá hạn **lên đầu** (thứ tự của API, FE không sort lại) |
| 3 | Dòng `reviewRequired: true` | MTR-08, A-04 | cảnh báo "Tiêu thụ bất thường, hãy kiểm tra lại chỉ số" |
| 4 | Tòa `waterMode: 'PER_PERSON'` | MTR-06 | **vẫn** có ô nước (ghi lịch sử) + chú thích "Nước không tính tiền ở tòa này" |
| 5 | Mốc trước của từng loại | MTR-09, MTR-10 | hiện `previousReadings.ELECTRIC.value` + `readOn` (dd/mm/yyyy); `null` → "Chưa có mốc" và ô vẫn nhập được |
| 6 | Body gửi lên | MTR-11 | **một** mảng cho cả lô, mỗi phần tử `{ roomId, invoiceId, kind, value, readOn }`; chỉ gửi ô đã nhập; `readOn` mặc định hôm nay Hà Nội |
| 7 | Kết quả lô 8 ok / 2 lỗi | **Q-P4-55**, MTR-11 | theo lựa chọn (đề xuất: câu tổng + dòng lỗi tại chỗ) |
| 8 | Một dòng lỗi `METER_VALUE_DECREASED` | MTR-03, UI-05 | thông báo của BE **ngay dưới đúng ô** (điện hay nước đúng dòng đã gửi), ô giữ giá trị đã nhập |
| 9 | Một dòng lỗi `CONFLICT_STATE` | MTR-11 | lỗi tại dòng đó, các dòng khác vẫn "Đã lưu" |
| 10 | Lưu khi chưa nhập ô nào | API-04 | nút bị khóa, **không** gọi API (mảng rỗng là 400) |
| 11 | Hộp xác nhận | **Q-P4-60**, UI-04 | theo lựa chọn; nếu có: nêu số dòng, **không** nêu số tiền nào (UI-06) |
| 12 | Bấm "Lưu" hai lần nhanh | UI-09 | đúng **một** request (`useContractAction` chặn), nút hiện "Đang lưu" |
| 13 | Sau khi lưu thành công | UI-09 | invalidate `['meter-readings']`, `['invoices']`, `['dashboard']`, `['notifications']`; danh sách refetch đúng một lần |
| 14 | Đổi tòa ở `BuildingSelector` | SCOPE-02 | URL có `buildingId` mới, khóa query đổi, không hiện lại dữ liệu tòa cũ |
| 15 | Đổi tài khoản/phạm vi | FE-P3-03/06 | cache cũ không hiện lại (khóa có `authScopeKey`) |
| 16 | 360 px | UI-07 | mỗi phòng một thẻ dọc, không tràn ngang, nút lưu dính đáy, ô số cao ≥ 44 px |
| 17 | Nhãn, focus, nút | UI-08 | mỗi ô có `<label>`, mọi nút là `<button>`, focus thấy được |
| 18 | Chữ | LOC-01 | tiếng Việt, không chuỗi tiếng Anh, không khóa thô |
| 19 | Ảnh | **Q-P4-58** | theo lựa chọn (đề xuất: không có ô ảnh) |
| 20 | Phép tính | UI-06 | test tĩnh: file không có phép `*`, `-` nào trên `value`/tiền; không `new Date()` để suy ra quá hạn |

### CP-3 · FE-P4-03: `/ql/hoa-don`

- **File:** `src/features/invoices/{api.ts,types.ts,status.ts,InvoiceFilters.tsx,InvoiceRow.tsx,invoices.css}`, `src/pages/staff/InvoicesPage.tsx`, `tests/p4/fe03-invoices-list.test.mjs`.
- **Chặn bởi:** Q-P4-56 (lọc mặc định).
- **Done when:** `node --test tests/p4/fe03-invoices-list.test.mjs` pass; `npm run lint && npm run build` pass.

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | 5 trạng thái + cờ `overdue` | 16-billing bảng trạng thái, UI-02 | "Nháp" / "Chưa thanh toán" / "Đã thanh toán" / "Đã quyết toán" / "Đã hủy"; `overdue: true` → **"Quá hạn"** đỏ, **không** phải "Chưa thanh toán" |
| 2 | `overdue: true` nhưng `status: 'PAID'` (không thể có, dựng để chắc) | UI-02 | hiện theo `status` (`overdue` của BE chỉ bật khi UNPAID) |
| 3 | Lọc trạng thái, loại, quá hạn, kỳ, tòa | API-02/API-08 | đúng query string (`status`, `type`, `overdue=true`, `period=2026-11`, `buildingId`), `page` về 1 mỗi lần đổi lọc |
| 4 | Lọc mặc định khi mở trang | **Q-P4-56** | theo lựa chọn |
| 5 | Kỳ nhập sai (`2026-13`) | API-04 | ô hiện `error.message`/`fields.period` của BE; không làm trắng trang |
| 6 | 4 trạng thái danh sách | UI-03 | như CP-2 ca 1 (rỗng: "Không có hóa đơn phù hợp.") |
| 7 | Phân trang | API-02 | "Trang sau" bị khóa ở trang cuối theo `meta.total/limit` (dùng lại khuôn `ContractsPage`) |
| 8 | Một dòng | 30-frontend | `TT{id}`, phòng, người thuê, kỳ `dd/mm–dd/mm`, hạn, tiền đã `formatMoney`, nhãn trạng thái; bấm vào mở `/ql/hoa-don/{id}` |
| 9 | Quản lý tòa khác (BE trả `OUT_OF_SCOPE`) | SCOPE-02 | trạng thái lỗi + "Thử lại", không vòng lặp request |
| 10 | Tiền và ngày | UI-01, LOC-05 | `2.984.000 đ` và `dd/mm/yyyy` (dùng `formatMoney`/`formatDate` chung) |
| 11 | Chữ | LOC-01 | tiếng Việt |

### CP-4 · FE-P4-04: `/ql/hoa-don/:id` và 4 hành động tiền

- **File:** `src/features/invoices/{InvoiceLines,InvoiceReadings,InvoiceQr,InvoiceActions}.tsx` (+ `api.ts`), `src/pages/staff/InvoiceDetailPage.tsx`, `tests/p4/fe04-invoice-detail.test.mjs`.
- **Chặn bởi:** Q-P4-57 (nhắc sau giới hạn), Q-P4-61 (khi nào hiện "Phát hành").
- **Done when:** `node --test tests/p4/fe04-invoice-detail.test.mjs` pass; `npm run lint && npm run build` pass. Kiểm tay: một hóa đơn UNPAID → "Ghi thu tay" → hộp xác nhận nêu **đúng** số tiền → thành "Đã thanh toán".

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | Dòng hóa đơn | BIL-07, BIL-09 | hiện **đúng** `lines` theo thứ tự API: nhãn, số lượng, đơn giá, tiền — đều `formatMoney`; tổng hiện `total` của API, **không** tự cộng (UI-06) |
| 2 | Dòng bậc điện | 12-pricing | mỗi bậc một dòng theo `label` của BE (ví dụ 50 × 3.000, 34 × 3.500); 0 kWh → một dòng số lượng 0 |
| 3 | Mốc chỉ số | MTR-02, MTR-05, D-38 | mốc đầu/cuối + ngày; `isMeterReplaced` → hiện `oldMeterFinal`; có `photoUrl` → hiện ảnh kèm `alt` (UI-08) |
| 4 | VietQR | BIL-10 | UNPAID: ảnh `qrImageUrl` (có `alt`), số tài khoản, tên, nội dung `TT{id}` + nút copy (dùng lại `CopyButton`); PAID/DRAFT/CANCELLED: **không** QR |
| 5 | Nút theo trạng thái | BIL-08, BIL-11, BIL-12, Q-P4-25 | DRAFT: "Phát hành" (+ "Lập lại" nếu MONTHLY) · UNPAID: "Ghi thu tay", "Nhắc", "Lập lại" (chỉ MONTHLY) · PAID/SETTLED/CANCELLED: **không** nút tiền nào |
| 6 | "Phát hành" | **Q-P4-61** | theo lựa chọn; thiếu chỉ số → `CONFLICT_STATE` của BE + link `/ql/chi-so` |
| 7 | Hộp xác nhận "Ghi thu tay" | **UI-04** | nêu `formatMoney(total)` + phương thức + `TT{id}`; đóng bằng `Escape`/click ngoài không gửi gì |
| 8 | Phương thức và `paidAt` | BIL-11, G-02 | enum `PaymentMethod` của BE, nhãn tiếng Việt; `paidAt` để trống → không gửi; sai định dạng → `fields.paidAt` hiện ở ô |
| 9 | `Idempotency-Key` | API-05 | một key cho mỗi hộp xác nhận; bấm lại cùng hộp gửi **cùng** key; mở lại hộp sinh key mới |
| 10 | Hóa đơn đã PAID ở tab khác → bấm thu tay | BIL-11 | `INVOICE_NOT_UNPAID` của BE trong `FormError` + refetch, không mất dữ liệu đang nhập |
| 11 | "Lập lại": lý do rỗng | BIL-12 | `fields.reason` ("Hãy nhập lý do lập lại") hiện ở ô |
| 12 | "Lập lại" với sửa chỉ số | BIL-12, Q-P4-24 | gửi `corrections: [{ kind, value, isMeterReplaced?, oldMeterFinal? }]`, hộp xác nhận nêu cũ → mới và tổng cũ; thành công → chuyển tới `/ql/hoa-don/{invoiceId mới}` |
| 13 | "Lập lại" trên DEPOSIT/FINAL | Q-P4-25 | **không có** nút (FE ẩn) |
| 14 | "Nhắc" lần đầu | Q-P4-7 | gọi một lần, hiện "Đã gửi nhắc lúc …" theo `remindedAt`; `email: false` → thêm "Người thuê chưa xác minh email" |
| 15 | "Nhắc" lần hai trong ngày (429) | **Q-P4-57**, Q-P4-26 | theo lựa chọn |
| 16 | `NOT_FOUND` / `OUT_OF_SCOPE` | §8 | "Không tìm thấy hóa đơn." / câu của BE + link về `/ql/hoa-don`; không retry vòng lặp |
| 17 | `id` không phải số (`/ql/hoa-don/abc`) | API-04 | câu "Không tìm thấy hóa đơn.", **không** gọi API (khuôn `ContractDetailPage`) |
| 18 | Hóa đơn `CANCELLED` | BIL-12 | hiện `cancelReason` + link tới `replacedById` ("Đã được lập lại thành TT…") và tới `replacesId` |
| 19 | Hóa đơn FINAL | BIL-18 | hiện mọi dòng quyết toán (REMAINING_RENT, PREVIOUS_DEBT, DAMAGE, DEPOSIT_FORFEIT, DEPOSIT_OFFSET) với nhãn của BE, kể cả đơn giá **âm** của `DEPOSIT_OFFSET` (không đổi dấu, không ẩn) |
| 20 | Invalidate sau mỗi hành động | UI-09 | đúng danh sách khóa ở §2.5 |
| 21 | Phép tính | UI-06 | test tĩnh: trang không nhân/cộng/trừ bất kỳ số tiền nào; không tự tính "còn thiếu" |
| 22 | Chữ | LOC-01 | tiếng Việt |

### CP-5 · FE-P4-05: thẻ tiền ở `/ql`

- **File:** `src/features/dashboard/{api.ts,MoneyCards.tsx,dashboard.css}`, `src/pages/staff/StaffHomePage.tsx`, `tests/p4/fe05-dashboard-money.test.mjs`.
- **Done when:** `node --test tests/p4/fe05-dashboard-money.test.mjs` pass; `npm run lint && npm run build` pass.

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | "Chờ chỉ số" | NOTI-06, MTR-09 | `count` + tối đa 5 dòng của `items` + câu "Trong đó {late} phòng đã quá ngày chốt" khi `late > 0`; link `/ql/chi-so` |
| 2 | Thẻ đỏ "Kỳ chưa có hóa đơn" | BIL-21, 30-frontend | liệt kê **từng** kỳ thiếu (phòng, người thuê, `periodStart–periodEnd`) kèm nút "Tạo hóa đơn kỳ này"; `count = 0` → thẻ **không** hiện |
| 3 | "Tạo hóa đơn kỳ này" | BIL-21, UI-04 | hộp xác nhận nêu phòng + kỳ → `POST /contracts/:id/monthly-invoices { periodNo }` → invalidate → chuyển tới `/ql/chi-so` |
| 4 | Bấm lại khi đã tạo | BIL-21 | `CONFLICT_STATE` của BE hiện tại thẻ đó, các thẻ khác nguyên vẹn |
| 5 | "Hóa đơn quá hạn" | NOTI-06, D-40 | `count` + 5 dòng `TT{id}`, phòng, người thuê, tiền, hạn; nhãn **"Quá hạn"** đỏ; link `/ql/hoa-don?overdue=true` |
| 6 | "Hợp đồng sắp hết hạn" / "Hợp đồng quá hạn" / "Gia hạn đang chờ" | CON-20, CON-21, BIL-06 | ba thẻ riêng, đỏ cho "quá hạn", mỗi dòng link `/ql/hop-dong/{id}` kèm `endDate` |
| 7 | Mọi nhóm = 0 | UI-03 | giữ câu "Chưa có việc nào hôm nay" của thẻ, không hiện thẻ đỏ rỗng |
| 8 | Quản lý vs Boss | SCOPE-04, PRC-11 | thẻ tiền hiện cho cả hai; `pendingPrices: null` vẫn không hiện cho quản lý (không đổi hành vi cũ) |
| 9 | Test dashboard cũ | FE-P3-08 | `tests/p3/fe08-vehicles-dashboard.test.mjs` và `tests/p2/fe12-dashboard.test.mjs` xanh: fake của chúng phải trả **đủ** 6 nhóm tiền mới, nếu không trang vỡ (bài học FE-EX-18..20) |
| 10 | Phép tính | UI-06 | chỉ hiện `count`/`items` của API, không tự đếm lại, không tổng tiền |

### CP-6 · FE-P4-06: quyết toán trong `/ql/hop-dong/:id`

- **File:** `src/features/contracts/SettlementCard.tsx` (+ `api.ts`, `types.ts`, `contracts.css`), `src/pages/staff/ContractDetailPage.tsx`, `tests/p4/fe06-settlement.test.mjs`.
- **Chặn bởi:** Q-P4-53 (vị trí), Q-P4-54 (đọc lại trạng thái quyết toán), Q-P4-58 (ảnh chỉ số cuối).
- **Done when:** `node --test tests/p4/fe06-settlement.test.mjs` pass; `npm run lint && npm run build` pass. Kiểm tay: `dryRun` hai lần ra **cùng** số liệu; xác nhận một lần → hợp đồng "Đã kết thúc".

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | Thẻ chỉ hiện với hợp đồng ACTIVE | BIL-13, Q-P4-42 | HOLD → chỉ có "Hủy hợp đồng" (CON-12, đã có); ENDED/CANCELLED → **không** có thẻ quyết toán |
| 2 | Form | 16-billing settlement | ô `moveOutDate` (mặc định hôm nay Hà Nội), `finalReadings.electric`, `finalReadings.water` (**bắt buộc cả ở tòa PER_PERSON**, MTR-06), `damages` (mặc định 0), `depositForfeit` (mặc định 0), `note` |
| 3 | "Xem trước" | BIL-13, UI-06 | gọi `?dryRun=true`, hiện **nguyên** các khoản của API: tiền kỳ cuối, tiền phòng còn lại, nợ cũ, cọc, hư hỏng, cọc giữ lại, **`net`**, `refund`, từng dòng của `lines`, `utilities` (mốc đầu/cuối + tiêu thụ), danh sách `mergedDrafts`/`settledInvoices`, và `finalInvoice` nếu có |
| 4 | Xem trước hai lần | UI-06 | hiển thị **giống nhau từng số**; không có request ghi nào |
| 5 | Xác nhận | UI-04 | `ConfirmDialog` nêu lại toàn bộ bảng số tiền (§2.6) trước khi gọi `?dryRun=false` |
| 6 | Chưa xem trước mà bấm quyết toán | UI-06 | không thể: nút xác nhận chỉ bật khi đã có kết quả `dryRun` của **đúng** bộ dữ liệu đang nhập (đổi một ô → phải xem trước lại) |
| 7 | Ghi thật thành công, `net < 0` | BIL-18, Q-P4-12 | hiện "Đã quyết toán" + link tới hóa đơn FINAL (`finalInvoice.code`, `total`, `dueDate`); **không** có nút "Đã trả lại tiền" |
| 8 | Ghi thật thành công, `net > 0` | BIL-17, Q-P4-8 | hiện số phải trả lại = `refund` + nút "Đã trả lại tiền" |
| 9 | `net = 0` | BIL-18 | không hóa đơn FINAL, không nút trả lại |
| 10 | "Đã trả lại tiền" | Q-P4-8, Q-P4-49 | chọn `method`, `paidAt?`, `note?`; hộp xác nhận nêu `formatMoney(net)` + "không hoàn tác"; thành công → nút biến mất, hiện thời điểm đã trả |
| 11 | Bấm "Đã trả lại tiền" lần hai (409) | Q-P4-8 | `CONFLICT_STATE` của BE + refetch; không gọi lần ba |
| 12 | Tải lại trang sau khi quyết toán | **Q-P4-54** | theo lựa chọn (đề xuất A: trạng thái và nút lấy từ `GET /contracts/:id`) |
| 13 | `CONFLICT_STATE` "Còn kỳ chưa có hóa đơn…" | A-10, BIL-21 | hiện **đúng câu** của BE + link `/ql` ("Tạo hóa đơn kỳ này") |
| 14 | `CONFLICT_STATE` "Còn hóa đơn của kỳ sau ngày dọn đi…" | Q-P4-50 | hiện đúng câu + link `/ql/hoa-don` |
| 15 | `METER_VALUE_DECREASED` | Q-P4-44 | lỗi ngay dưới ô chỉ số cuối đúng loại; gợi ý "Thay đồng hồ thì nhập mốc thay ở Chốt chỉ số trước" |
| 16 | `VALIDATION_FAILED` các ô | Q-P4-10, Q-P4-45 | `moveOutDate` ngày mai / trước ngày bắt đầu / `31/02`; `damages` âm; `depositForfeit` > cọc; `damages > 0` thiếu `note` → mỗi lỗi lên **đúng** ô theo `error.fields` |
| 17 | `Idempotency-Key` | API-05 | chỉ gửi ở lượt ghi thật; `dryRun` **không** gửi; bấm lại cùng hộp dùng cùng key |
| 18 | Sau khi quyết toán | UI-09 | invalidate `invalidateContracts` + `['invoices']` + `['notifications']`; thẻ phòng/`roomStatus` về "Trống" ở lần refetch |
| 19 | Quản lý tòa khác | SCOPE-02 | `OUT_OF_SCOPE` của BE trong `FormError`, không gửi lại |
| 20 | Phép tính | UI-06 | test tĩnh: file **không** tự tính `net`, không cộng dòng, không tính số ngày |
| 21 | Chữ | LOC-01 | tiếng Việt |

### CP-7 · FE-P4-07: `/ql/giao-dich` (Boss)

- **File:** `src/features/bank/{api.ts,types.ts,bank.css}`, `src/pages/staff/BankTransactionsPage.tsx`, `tests/p4/fe07-bank.test.mjs`.
- **Chặn bởi:** Q-P4-59 (cách chọn hóa đơn khi gán).
- **Done when:** `node --test tests/p4/fe07-bank.test.mjs` pass; `npm run lint && npm run build` pass.

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | Quyền | §8, BANK-05 | trang chỉ mở với BOSS; MANAGER gõ URL bị guard đẩy về `/ql`; link menu ẩn |
| 2 | Thứ tự | 30-frontend | `UNMATCHED` **lên đầu** (mặc định lọc `status=UNMATCHED`, có chip "Tất cả"); trong mỗi nhóm giữ thứ tự của API (mới nhất trước) |
| 3 | Một dòng | BANK-05 | `formatMoney(amount)`, nội dung chuyển khoản, số tài khoản, `receivedAt` (ngày + giờ), `StatusBadge` trạng thái, và hóa đơn đã khớp (`TT{id}`, phòng, người thuê) khi có |
| 4 | 4 trạng thái + phân trang + lọc ngày | UI-03, API-02 | như CP-3; `from`/`to` gửi `YYYY-MM-DD`, sai định dạng → `fields` của BE |
| 5 | "Gán vào hóa đơn" | BANK-05, UI-04, **Q-P4-59** | theo lựa chọn; hộp xác nhận nêu `formatMoney(tx.amount)` + mã hóa đơn |
| 6 | Gán lệch tiền | BANK-04 | `PAYMENT_AMOUNT_MISMATCH` của BE ở ô/`FormError`; **không** gán |
| 7 | Gán vào hóa đơn không UNPAID | BANK-05 | `INVOICE_NOT_UNPAID` |
| 8 | Gán một giao dịch đã `ASSIGNED`/`REFUNDED` | Q-P4-34 | nút **không** hiện; nếu BE vẫn trả `CONFLICT_STATE` thì hiện + refetch |
| 9 | "Đánh dấu đã hoàn" | Q-P4-34, BANK-05 | chỉ với `UNMATCHED`; `note` **bắt buộc** (rỗng → `fields.note` "Hãy nhập ghi chú hoàn tiền"); hộp xác nhận nêu số tiền + "không hoàn tác" |
| 10 | `Idempotency-Key` | API-05 | như CP-4 ca 9 |
| 11 | Sau khi gán | UI-09 | invalidate `['bank-transactions']`, `['invoices']`, `['dashboard']`, `['notifications']`; dòng chuyển sang "Đã gán" kèm `TT{id}` |
| 12 | Chỗ "báo lỗi thanh toán" | REQ-07 | **không** có nút/khối nào (Phase 5); test khẳng định trang không chứa chữ "Báo lỗi thanh toán" |
| 13 | `raw`/bí mật | BANK-07 | trang không hiện trường nào ngoài danh sách §2.3 (không `raw`, không secret) |
| 14 | Chữ | LOC-01 | tiếng Việt |

### CP-8 · FE-P4-08a: chuông hộp thư nhân sự

Theo `plans/P4-3/PLAN.md` CP-7; bảng dưới là bản đầy đủ cho phần này.

- **File:** `src/features/notifications/{NotificationBell.tsx,useMyNotifications.ts,notifications.api.ts,notifications.css}`, `src/layouts/StaffLayout.tsx` (sửa), `tests/p4/fe08a-notification-bell.test.mjs`; **sửa** fake `fetch` của `tests/auth-login-flow.test.mjs` (và mọi test mount `StaffLayout`) + loader kit thủ công.
- **Chặn bởi:** **Q-P4-51** (bấm vào một thư).
- **Done when:** `node --test tests/p4/fe08a-notification-bell.test.mjs` pass; `npm run lint && npm run build && npm run test:components` pass. Kiểm tay ở 360 px: chấm đỏ có số, mở popup, bấm một thư → đúng trang, số giảm.

| # | Ca | Mã | Kết quả mong đợi |
|---|---|---|---|
| 1 | `meta.unreadCount = 3` | NOTI-11 | chấm đỏ + chữ `3`; `aria-label` nêu "3 thông báo chưa đọc" (UI-08) |
| 2 | `unreadCount = 0` | NOTI-11 | **không** chấm đỏ, chuông vẫn bấm được |
| 3 | `unreadCount = 150` | NOTI-11 | hiện `99+` (hiển thị, không phải phép tính tiền) |
| 4 | Mở popup | NOTI-11, Q-P4-18 | 10 dòng mới nhất (`limit=10`), dòng `readAt != null` mờ nhưng **vẫn** là `<button>` bấm được |
| 5 | Bấm một thư chưa đọc | **Q-P4-51** | theo lựa chọn (đề xuất: `POST /me/notifications/{id}/read` **một** lần rồi điều hướng tới `link`) |
| 6 | Bấm một thư đã đọc | Q-P4-51 | không gọi `read` lần nữa |
| 7 | Thư `link = null` | Q-P4-51 | đánh dấu đã đọc, không điều hướng |
| 8 | "Đánh dấu đã đọc tất cả" | NOTI-11 | gọi `read-all` một lần, chấm đỏ mất, danh sách thành mờ |
| 9 | API lỗi | UI-05 | `error.message` **trong popup**; trang `/ql` phía sau vẫn dựng bình thường (không trắng trang) |
| 10 | `Escape` và click ra ngoài | UI-09, UI-08 | đóng popup, focus trả về nút chuông |
| 11 | 360 px | UI-07 | popup không tràn ngang, cuộn trong popup |
| 12 | Chỉ trong app nhân sự | NOTI-11 | `TenantLayout`, `PublicLayout`, `GuestLayout` **không** đổi; menu nhân sự **không** đổi (chuông nằm ở `action`, không phải `links`) |
| 13 | Request khi mở `/ql` | FE-EX-18..20 | đúng **một** `GET /me/notifications` khi vào app nhân sự; các test cũ mount `StaffLayout` phải trả lời URL này |
| 14 | Mail không đánh dấu đã đọc | Q-P4-18 | test tĩnh: FE không gọi gì khác ngoài 3 route `/me/notifications*` |
| 15 | Đổi tài khoản | FE-P3-03/06 | số chưa đọc của tài khoản cũ không hiện lại (khóa có `authScopeKey`) |
| 16 | Chữ | LOC-01 | tiếng Việt |

### CP-9 · FE-P4-09 ⏸ (kết phần P4-7)

- **File:** `docs/phase-4-money/PROGRESS.md`, `docs/LESSONS.md` (nếu có bài học), `feature_p4-7-frontend-staff.md` (đánh `[x]` và chép câu trả lời Q-P4-51..61).
- **Done when:** dán **output thật** của `npm run lint`, `npm run build` và `npm run test:components` (hai lượt nếu có ca nhạy thời gian — bài học 13/11: 4–5 ca approvals/pricing có thể đỏ dưới tải rồi xanh khi chạy riêng; báo cả hai lượt). Số test trước phần này: **997/997** — báo con số thật của lượt chạy, không chép lại số cũ.
- **Kiểm tay (bắt buộc, vì phần này không chạy reviewer)** trên DB dev, một tài khoản quản lý và một Boss:
  1. `/ql/chi-so` ở 360 px: nhập chỉ số 2 phòng → hóa đơn phát hành → thấy ở `/ql/hoa-don` với nhãn "Chưa thanh toán";
  2. `/ql/hoa-don/:id`: QR hiện, nội dung `TT{id}` copy được; "Ghi thu tay" → "Đã thanh toán";
  3. một hóa đơn quá hạn hiện **đỏ "Quá hạn"** đúng dòng nghiệm thu trong "Issues log" của file task;
  4. `/ql/hop-dong/:id`: `dryRun` → xác nhận → hợp đồng "Đã kết thúc", phòng về "Trống";
  5. Boss vào `/ql/giao-dich`, quản lý gõ URL đó bị đẩy về `/ql`;
  6. chuông: chấm đỏ, mở popup, bấm một thư.
- Nêu lại ở báo cáo: câu trả lời Q-P4-51..61, các `[ASSUMPTION]` §3, và **quyết định chuyển FE-P4-08 sang P4-8** (§1).
- Thông điệp commit đề xuất: `feat(frontend): staff money pages – readings, invoices, dashboard money cards, settlement, bank transactions and the staff inbox bell (FE-P4-01..09, MTR-09..12, BIL-08..21, BANK-05, NOTI-06, NOTI-11, UI-01..09, LOC-01, D-40, D-42, Q-P4-51..61)`.

---

## 5. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| **FE tự tính tiền** (tổng dòng, "còn thiếu", `net`, số ngày quá hạn) | Mọi số tiền đến từ API; `dryRun` là nguồn duy nhất của bản xem trước; mỗi CP có một test tĩnh "không có phép tính tiền trong file"; cờ `overdue` lấy từ BE, FE không so ngày (UI-06, D-40) |
| **Test mảng cố định vỡ** (menu, routes, số item) | §2.7 liệt kê đủ 4 file + grep bắt buộc trước lần chạy đầu (bài học FE-EX-03, FE-P3-01) |
| **Chuông làm đỏ mọi test mount `StaffLayout`** | Fake `fetch` của `auth-login-flow` trả 404 cho URL lạ → phải trả lời `/me/notifications` ở đó và ở mọi fake cục bộ; lỗi của chuông **chỉ** hiện trong popup, không bao giờ làm trắng trang (bài học FE-EX-18..20) |
| **Loader kit thủ công thiếu component** | `auth-login-flow.test.mjs` và `fe01-skeleton.test.mjs` liệt kê kit bằng tay → thêm mọi component mới mà `StaffLayout`/chuông dùng (bài học FE-EX-09) |
| **Bấm hai lần → thu tiền hai lần** | `useContractAction` (`busy.current`) + `Idempotency-Key` một key cho mỗi hộp xác nhận (API-05) + BE khóa hàng; test "bấm hai lần nhanh = một request" |
| **`dryRun` âm thầm ghi** | FE **luôn** gửi `?dryRun=true` tường minh ở lượt xem trước và `?dryRun=false` ở lượt ghi; không `Idempotency-Key` ở lượt xem trước; nút xác nhận chỉ bật sau khi có bản xem trước của **đúng** dữ liệu đang nhập (CP-6 ca 6) |
| **Mất dấu tiền cọc phải trả lại** khi tải lại trang | Q-P4-54; nếu chủ dự án chọn B thì ghi `shortcut:` trong `SettlementCard.tsx` và nêu ở CP-9 rằng Phase 4 không có nhắc tự động cho việc này |
| **Nhập 60 phòng rồi mất dữ liệu vì một dòng lỗi** | Q-P4-55 phương án A: dòng lỗi giữ số đã nhập, chỉ dòng thành công rời danh sách; không bao giờ reset form sau một lượt lưu có lỗi |
| **Cache lẫn giữa hai tài khoản / hai tòa** | Mọi khóa query có `authScopeKey(user)` + `selectedBuildingId`; trang chi tiết remount theo `key={scope:id}` như `ContractDetailPage` đang làm (bài học FE-P3-03/06) |
| **Danh sách không phân trang quá dài** (`/meter-readings/due`, `missedPeriods`) | Giữ nguyên hành vi BE, hiện hết; nêu `[ASSUMPTION]` ở CP-2/CP-5 để Phase 5 quyết (shortcut đã ghi trong `dashboard.service.ts`) |
| **Lỗi không gắn được vào ô** (`METER_VALUE_DECREASED` trả mã chứ không trả `fields`) | Map theo `index` của kết quả lô + `kind` của chính request đã gửi, không đoán theo thứ tự hiển thị; test ca 8 của CP-2 |
| **Ca nhạy thời gian trong lượt chạy đầy** | Chạy lại file đỏ riêng rồi cả bộ một lượt trước khi coi là hồi quy; báo cả hai lượt (bài học 13/11, P2-QA-02) |
| **Thêm dependency hoặc component kit mới "cho nhanh"** | Không: KIT-01/KIT-07; thiếu gì thì dựng từ `ElevatedCard` + token `rooms.css` trong `features/`; nếu thật cần một component dùng chung thì **hỏi** trước (phải có sample trong `/components.html` + test) |
| **Thay đổi BE lọt vào phần FE** | Chỉ xảy ra nếu chủ dự án chọn Q-P4-54 A / Q-P4-57 C / Q-P4-58 B; khi đó sửa luôn test BE tương ứng trong **cùng** thay đổi và chạy `npm run test` của backend (bài học BE-EX-34) |

---

## 6. Ma trận luật → checkpoint

| Luật | CP |
|---|---|
| 30-frontend (route `/ql/*`), AUTH-05/06, §8 quyền, LOC-01 (menu) | CP-1 |
| MTR-09, MTR-10, MTR-11, MTR-12, MTR-06, MTR-08/A-04, D-42, UI-03, UI-05, UI-07, UI-08 | CP-2 |
| 16-billing bảng trạng thái, UI-02, API-02/API-08, UI-01/LOC-05 | CP-3 |
| BIL-07, BIL-08, BIL-09, BIL-10, BIL-11, BIL-12, BIL-12a, 12-pricing, MTR-02/MTR-05, D-38, UI-04, UI-06, API-05 | CP-4 |
| NOTI-06, BIL-05, BIL-06, BIL-21, CON-20, CON-21, SCOPE-04 | CP-5 |
| BIL-13..BIL-20, Q-P3-3, Q-P4-8/10/12/44/45/50, A-10, UI-04, UI-06, SCOPE-02 | CP-6 |
| BANK-04, BANK-05, BANK-07, Q-P4-34, §8 (Boss only), API-05 | CP-7 |
| NOTI-11, Q-P4-18, Q-P4-20, UI-05, UI-07, UI-09, KIT-07 | CP-8 |
| lint/build/test:components, kiểm tay, PROGRESS/LESSONS | CP-9 |
| `/thue` khối hóa đơn + ngày thu kế tiếp, `/thue/hoa-don(/:id)`, song ngữ, "Báo lỗi thanh toán" | **ngoài P4-7**: P4-8 (FE-P4-08 đã chuyển, §1) |
| `/ql/thong-bao`, NOTI-01..03, báo cáo, nhật ký, Cài đặt, BANK-06/REQ-07 | **Phase 5** |
