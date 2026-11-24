# Phase 5 · Operations — kế hoạch phase

Tài liệu này là bản vẽ để phiên chính viết `docs/phase-5-operations/README.md`, `PROGRESS.md` và một file `feature_p5-*.md` cho mỗi phần, theo đúng khuôn của Phase 3 và Phase 4. Không có mã nguồn trong đây.

Nguồn: roadmap dòng "5 · Operations" (`docs/spec/01-architecture.md#roadmap`), `docs/spec/18-requests.md`, `19-notifications.md`, `20-reports-audit-settings.md`, `14-contracts.md` (CON-17..21), `16-billing.md` (BIL-06, settlement), `17-bank.md` (BANK-05, BANK-06), `02-database.md` (dòng Phase 5, DB-07), `30-frontend.md`, mục "Ngoài Phase 4" của `docs/phase-4-money/README.md` §4, các quyết định D-13, D-14, D-15, D-20, D-33, D-34, D-44 và `[ASSUMPTION]` A-17.

---

## 1. Mục tiêu và phạm vi

**Mục tiêu (roadmap):** Boss so sánh các tòa trong báo cáo. Nói đủ hơn: một vòng vận hành sau khi tiền đã chạy — người thuê gửi yêu cầu (sự cố, trả phòng, gia hạn, báo lỗi thanh toán) → nhân sự xử lý trên bảng `/ql/yeu-cau` → sự cố xong thì người thuê đánh giá sửa chữa → hợp đồng sắp hết hạn được gia hạn và cron BIL-06 chuyển ca → Boss đọc báo cáo, nhật ký và sửa cài đặt; thông báo chung tới hộp thư người thuê.

### Trong phạm vi

| Nhóm | Nội dung | Mã luật |
|---|---|---|
| Thông báo chung | `POST/GET /announcements` theo phạm vi phòng/tòa/mọi tòa, ghi một dòng `notifications` cho mỗi người thuê ACTIVE, đếm "đã đọc / tổng"; hộp thư người thuê (API đã có, chỉ thêm trang) | NOTI-01, NOTI-02, NOTI-03, D-34 |
| Gia hạn | tạo hợp đồng gia hạn từ hợp đồng ACTIVE, ký như CON-06 (không cọc, không tài khoản mới), hủy một gia hạn chưa chuyển ca; chuyển ca BIL-06/CON-18/CON-19 đã có, chỉ sửa ràng buộc DB chặn | CON-17, CON-18, CON-19, DB-B1, DB-B7, BIL-06 |
| Yêu cầu | 6 loại của 18-requests: tạo/rút của người thuê, bảng xử lý của nhân sự, duyệt/từ chối/leo thang, ghi chi phí sự cố, áp dụng payload người ở/xe, cron đóng sau 3 ngày, ảnh kèm | REQ-01..REQ-08, BANK-06, D-14, D-15, CON-13, CON-14 |
| Đánh giá sửa chữa | người thuê cho 1–5 sao + nhận xét sau khi sự cố CLOSED, sửa trong 7 ngày; nhân sự ẩn nhận xét kèm lý do, có audit | REQ-09, D-33, A-17 |
| Báo cáo | doanh thu/chi phí/lợi nhuận theo tháng, công nợ và quá hạn, tỉ lệ lấp phòng, cọc đang giữ, so sánh theo tòa cho Boss, ba hành động của Boss trên hóa đơn quá hạn (Sửa / Xóa / Cất) | RPT-01..RPT-06, 20-reports §16-26 |
| Nhật ký và cài đặt | `GET /audit-logs` cho Boss; `GET/PATCH /settings` cho Boss | AUD-01..AUD-04, mục Settings của 20 |
| Việc hôm nay | thêm nhóm yêu cầu PENDING và báo lỗi thanh toán đã leo thang (Boss) | NOTI-06 |
| FE nhân sự | `/ql/yeu-cau`, `/ql/thong-bao`, `/ql/bao-cao`, `/ql/nhat-ky`, `/ql/cai-dat`, nút "Gia hạn" trong `/ql/hop-dong/:id`, nhóm yêu cầu + vòng lấp phòng + thanh thu/nợ ở `/ql` | 30-frontend các dòng tương ứng, UI-01..09, RPT |
| FE người thuê | `/thue/thong-bao`, `/thue/yeu-cau(/:id)` kèm đánh giá, 4 nút ở `/thue/hop-dong`, nút "Báo lỗi thanh toán" ở `/thue/hoa-don/:id`, phần bổ sung của `/thue` (chưa đọc, yêu cầu đang mở, biểu đồ điện/nước 6 kỳ) — song ngữ | 30-frontend, LOC-01, LOC-05, UI-07, UI-12 |

### Ngoài phạm vi (hoãn hoặc phase sau)

| Việc | Ở đâu |
|---|---|
| Job đối chiếu giao dịch bỏ sót (BANK-08) | hoãn (D-44, Q-04) |
| Zalo/SMS, chữ ký điện tử | hoãn (D-20) |
| Adapter webhook thật của nhà cung cấp (SePay/Casso) | go-live, Q-03 (Phase 4 chỉ có khung + adapter giả) |
| Đánh giá bất cứ thứ gì khác ngoài sửa chữa (lịch hẹn, phòng, tòa, nhân sự) | không làm — REQ-09 nói rõ |
| Giảm trừ tiền phòng khi phòng được cho thuê lại sau khi khách đi sớm (Q-01) | chờ chủ dự án; BIL-15 vẫn thu đủ |
| Xuất Excel/PDF báo cáo | không làm |

---

## 2. Đã có sẵn và phải sửa

### Dùng lại được (Phase 1–4 đã làm) — **đã kiểm tra là có thật**

| Thứ đã có | Đường dẫn | Phase 5 dùng để |
|---|---|---|
| `switchRenewal` / `switchDueRenewals` (BIL-06, CON-18, CON-19: khóa hai hợp đồng, copy người ở + xe, mốc chỉ số mở đầu, audit `contract.renew`) | `src/modules/billing/renewal-switch.ts`, gọi từ `src/jobs/monthly-invoice.job.ts` | **không viết lại**; P5-2 chỉ tạo/ký hợp đồng gia hạn để nó có hàng mà chuyển |
| `claimDailyRun(db, job, today)` + `type DailyJob` (một lượt/ngày theo ngày Hà Nội, bù lúc khởi động) | `src/jobs/job-state.ts` | cron đóng sự cố sau 3 ngày (REQ-06): thêm một giá trị vào `DailyJob` |
| Khuôn job 08:00 + chạy lúc khởi động, log một dòng tổng kết | `src/jobs/invoice-reminder.job.ts`, `late-readings.job.ts` | khuôn cho job đóng sự cố |
| `expiringNoticeDays` (CON-20: đúng 30 và 7 ngày) | `src/jobs/reminder-rules.ts` | CON-20 đã xong, P5-2 chỉ kiểm lại khi có gia hạn |
| Nhóm `expiringContracts`, `expiredContracts`, `renewalsWaiting`, `overdueInvoices`… của "Việc hôm nay" | `src/modules/notifications/dashboard.service.ts` (+ `dto/dashboard.dto.ts`) | **CON-20/CON-21 đã có**: chỉ thêm nhóm yêu cầu (NOTI-06) |
| `GET /me/notifications`, `/:id/read`, `/read-all` đã mở cho `TENANT` (Roles `BOSS, MANAGER, TENANT`), `Paginated` có `meta.unreadCount` | `src/modules/notifications/my-notifications.controller.ts` + `.service.ts` | `/thue/thong-bao` **không cần API mới** |
| `notifyBuildingStaff`, `responsibleStaffIds` (SCOPE-04) | `src/modules/notifications/notify.ts` | REQ-08 `REQUEST_UPDATED`, thông báo nhân sự khi có yêu cầu mới |
| `AuditService.log(actorId, action, entity, entityId, before, after, ip, db)` | `src/modules/audit/audit.service.ts` (module `audit` đã có, **chưa có controller**) | AUD-04 chỉ cần thêm controller + service đọc |
| Module `settings` (`settings.service.ts`, `settings.controller.ts` hiện **chỉ** có `GET /public/contact`) | `src/modules/settings/` | thêm `GET/PATCH /settings` cho Boss vào chính module này |
| `runIdempotent` + `hashRequest` (API-05) | `src/modules/pricing/pricing-idempotency.ts` | mọi POST duyệt/leo thang/đánh giá nếu cần chống bấm hai lần |
| `signRoomImageUpload` / `signContractUpload` + DTO có `purpose` (`ROOM_IMAGE`, `METER_PHOTO`, `CONTRACT_SCAN`, `ID_PHOTO`) | `src/modules/files/files.controller.ts`, `dto/sign.dto.ts` | thêm `REQUEST_PHOTO` theo cùng khuôn (Q-P5-3) |
| `scopeWhere`, `assertViewingScope`, guard vai trò, lọc `buildingId` (API-08) | `src/common/scope/scope.ts`, `src/common/guards/*` | mọi route nhân sự của P5-3, P5-5 |
| `settlement.service.ts` (quyết toán BIL-13..20), `billing.service.ts` (`recordPayment`), `invoice-queries.service.ts` | `src/modules/billing/` | REQ-03 MOVE_OUT nối vào quyết toán; REQ-07 nhân sự giải quyết bằng ghi thu tay; RPT đọc `payments`/`settlements` |
| `period.ts`, `today.ts` (`todayHanoi`, `toDateOnly`, `addDays`, `formatDateOnly`), `contractPeriods`, `contractEndDate` | `src/common/date/` | mọi mốc tháng của báo cáo, hạn 3 ngày, 7 ngày sửa đánh giá |
| FE: kit An Lâm, `StaffLayout`/`TenantLayout`, chuông NOTI-11 + `features/notifications/api.ts` (`listMyNotifications`, `readNotification`, `readAllNotifications`), `formatMoney`/ngày, bản đồ nhãn trạng thái, `shared/api` (`apiRequest`, `apiRequestPage`, `listPath`) | `Source/frontend/src/{components,layouts,shared,features/notifications}` | trang `/thue/thong-bao` dùng lại nguyên API; mọi trang mới dựng từ kit |
| DB đã có **đủ** bảng/ràng buộc cho yêu cầu và thông báo | `prisma/schema.prisma` (`requests`, `announcements`, `notifications`, `audit_logs`, `settings`), `prisma/constraints.sql:154..163` (`requests_status_by_type`, `requests_cost`, `requests_one_pending_moveout_renew`, `announcements_room_needs_building`, `notifications_once_per_announcement`) | REQ-02 và REQ-06 có lưới an toàn; BE vẫn kiểm trước |

### Mã lỗi: **không cần thêm mã mới**

`src/common/errors/error-code.ts` đã có `PENDING_REQUEST_EXISTS`, `CONFLICT_STATE`, `VALIDATION_FAILED`, `OUT_OF_SCOPE`, `FORBIDDEN`, `NOT_FOUND`, `ROOM_NOT_AVAILABLE`, `INVOICE_NOT_UNPAID`, `TOO_MANY_REQUESTS`, `UPLOAD_NOT_CONFIGURED`. Giữ nguyên để không phải sửa test đếm mã trong `src/app.setup.spec.ts` và `messages.ts` (bài học BE-P2-02).

### Thay đổi schema / migration — **ba cái (M3 thêm theo Q-P5-7 = B), cả ba phải xin duyệt trước khi tạo và trước khi áp**

| # | Phần | Nội dung | Vì |
|---|---|---|---|
| M1 | P5-2 | Nới `contracts_one_open_per_room` (`prisma/constraints.sql:70`, hiện `WHERE status IN ('HOLD','ACTIVE')`) để một hợp đồng gia hạn HOLD được tồn tại cạnh hợp đồng ACTIVE của cùng phòng. Đề xuất: `WHERE status = 'ACTIVE' OR (status = 'HOLD' AND previous_contract_id IS NULL)` | nếu không nới thì CON-17 không tạo được hợp đồng nào: `INSERT` HOLD cho phòng đang ACTIVE vỡ index (xem Q-P5-1) |
| M3 | P5-5 | `invoices.archived_at timestamptz` + `archived_by_id int` (FK `users`, ON DELETE SET NULL) + CHECK cặp `(archived_at IS NULL) = (archived_by_id IS NULL)` cho hành động "Cất" của Boss | Q-P5-7 = B (D-45 (7)) |
| M2 | P5-4 | Cột đánh giá sửa chữa trên `requests` (`02-database.md:62`): `review_rating smallint`, `review_comment text`, `review_at timestamptz`, `review_updated_at timestamptz`, `review_hidden_reason text`, `review_hidden_at timestamptz`, `review_hidden_by_id int` (FK `users`, ON DELETE SET NULL) + CHECK `review_rating IS NULL OR (review_rating BETWEEN 1 AND 5 AND type = 'INCIDENT')`, CHECK cặp `(review_hidden_reason IS NULL) = (review_hidden_at IS NULL)`, CHECK ẩn chỉ khi đã có đánh giá | REQ-09 (xem Q-P5-2 để chốt đúng bộ cột) |

Quy tắc khi làm migration (bài học BE-EX-01, BE-EX-33, QA-P3-02/DB-07):

- Kiểm offline bằng `prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel <new>`, **không** dùng DB dev làm shadow; thử áp migration viết tay trên schema trước đó bằng PGlite.
- `constraints.sql` phải giữ nguyên toàn bộ index riêng phần, CHECK và trigger hiện có (DB-07); `prisma/check-constraints.mjs` phải **thêm** kịch bản cho luật mới và **sửa** kịch bản "Hợp đồng thứ hai cho phòng đang giữ chỗ" (`check-constraints.mjs:118`) nếu ý nghĩa index đổi; báo **số thật** bộ kiểm in ra (gần nhất 107/107).
- Sinh SQL ràng buộc từ model hiện tại, không từ ảnh chụp cũ (bài học QA-P3-02).

### Việc phải sửa trên mã đang có

| File | Sửa gì | Vì |
|---|---|---|
| `src/app.module.ts` + `src/common/prisma/prisma.service.spec.ts` | thêm module `requests`, `reports` (và job mới) → **sửa danh sách module trong spec cùng lúc** | bài học BE-P2-10 |
| `src/modules/notifications/dashboard.service.ts` + `dto/dashboard.dto.ts` + 5 spec có fake dashboard | thêm `pendingRequests` và `escalatedPaymentIssues` (chỉ Boss); mỗi fake phải biết bảng `request` | NOTI-06; bài học BE-P4-12 |
| `src/jobs/job-state.ts` (`type DailyJob`) + `job-state.spec.ts` | thêm `'close_incidents'` | REQ-06 cron 3 ngày |
| `src/modules/files/dto/sign.dto.ts` + `files.controller.ts` + `sign.validation.spec.ts`, `sign.dto.spec.ts` | thêm `REQUEST_PHOTO` (ảnh sự cố/biên lai của người thuê) với thư mục và tiền tố riêng, chỉ cho `TENANT` trên hợp đồng của mình | REQ-06, REQ-07, Q-P5-3 |
| `src/modules/settings/settings.controller.ts` + `.service.ts` + `settings.spec.ts` | thêm `GET/PATCH /settings` (Boss), danh sách khóa cho phép, audit `settings.change` | mục Settings của 20 |
| `src/modules/billing/settlement.service.ts` | khi quyết toán một hợp đồng **có** gia hạn đã ký thì xử lý ra sao (hiện chưa xét) | Q-P5-9 |
| `src/modules/contracts/contracts.service.ts` | dùng lại `publicRoomWhere`/eligibility cho hợp đồng mới, **không** áp đường đó cho gia hạn (gia hạn giữ nguyên phòng đang ACTIVE); map `P2002` của index mới vẫn ra `ROOM_NOT_AVAILABLE` | CON-17, Q-P5-1 |
| `prisma/seed.ts` (+ `seed.spec.ts`, `EXPECTED_COUNTS`) | chỉ nếu QA cần sẵn một sự cố CLOSED để thử đánh giá, hoặc một khóa `settings` mới | bài học BE-P3-18 |
| FE `src/app/routes.tsx` + `tests/**` | route mới `/ql/yeu-cau`, `/ql/thong-bao`, `/ql/bao-cao`, `/ql/nhat-ky` (Boss), `/ql/cai-dat` (Boss), `/thue/thong-bao`, `/thue/yeu-cau`, `/thue/yeu-cau/:id`; test đọc `routes[0..2]`, cần stub từng trang và đếm lại menu (và mọi assert menu, kể cả `auth-login-flow`) | bài học FE-EX-03, FE-P3-01 |

---

## 3. Kiến trúc

```
                 ┌──── cron Asia/Ho_Chi_Minh, idempotent + chạy lúc khởi động (claimDailyRun) ────┐
 00:05 monthly-invoice.job ──► BIL-05 DRAFT ──► BIL-06 switchRenewal (ĐÃ CÓ, P5-2 chỉ cấp "hàng")
 08:00 invoice-reminder.job ─► NOTI-05 + CON-20 (ĐÃ CÓ)
 08:00 close-incidents.job ──► REQ-06 sự cố RESOLVED ≥ 3 ngày → CLOSED (+ REQUEST_UPDATED)
                 └──────────────────────────────────────────────────────────────────────────────┘

 THUÊ (TENANT)                         BE modules                               DB
 ─────────────                         ─────────────────────────────────────     ───────────────
 /thue/thong-bao  ──► GET /me/notifications (ĐÃ CÓ) ─┐                           notifications
 /thue/yeu-cau    ──► GET/POST /me/requests          │                           announcements
       (/:id)     ──► POST /me/requests/:id/confirm  ├─ requests ─┐              requests
                      · /reopen · /cancel            │            │              contracts
                  ──► PUT  /me/requests/:id/review ──┘            ├─► contracts  occupants
 /thue/hop-dong   ──► POST /me/requests (MOVE_OUT, RENEW, …)      ├─► billing    vehicles
 /thue/hoa-don/:id──► POST /me/requests (PAYMENT_ISSUE + ảnh)     │   (REQ-07)   invoices
 /thue            ──► GET /me/consumption?periods=6 ─ reports ────┘              payments
                                                                                 settlements
 QL (MANAGER/BOSS)                                                               audit_logs
 /ql/yeu-cau      ──► GET /requests?buildingId&type&status                        settings
                  ──► PATCH /requests/:id · POST /:id/approve · /reject
                  ──► POST /requests/:id/escalate · /review/hide
 /ql/hop-dong/:id ──► POST /contracts/:id/renew (CON-17) · ký như CON-06
 /ql/thong-bao    ──► GET/POST /announcements ─ notifications
 /ql              ──► GET /dashboard (thêm nhóm yêu cầu) + GET /reports/occupancy
 /ql/bao-cao      ──► GET /reports/revenue?buildingId&from&to · /reports/occupancy ─ reports
 /ql/nhat-ky      ──► GET /audit-logs?entity&entityId&actorId&from&to ─ audit (BOSS)
 /ql/cai-dat      ──► GET/PATCH /settings ─ settings (BOSS)
```

Quy ước bắt buộc (nhắc lại từ `CLAUDE.md`): toán tiền là số nguyên đồng và **chỉ** ở BE (báo cáo cũng vậy, FE chỉ vẽ số nhận được — UI-06); mỗi luồng nhiều bước trong **một** `prisma.$transaction`; đổi trạng thái bằng update có điều kiện (`where: { id, status: 'PENDING' }`), 0 dòng = `CONFLICT_STATE`; mọi ngày đi qua `today.ts`/`period.ts`; không hard-delete; audit theo AUD-01.

### File dự kiến thêm (tên có thể đổi trong PLAN của từng phần)

| Phần | File | Việc |
|---|---|---|
| P5-1 | `src/modules/notifications/{announcements.controller,announcements.service}.ts`, `dto/announcements.dto.ts` (+ `.spec.ts`) | NOTI-02, NOTI-03 |
| P5-2 | `src/modules/contracts/renewal.service.ts`, `dto/renewal.dto.ts` (+ `.spec.ts`); `prisma/migrations/<ts>_renewal_hold_index/` | CON-17, CON-18 (ký), M1 |
| P5-3 | `src/modules/requests/{requests.module,requests.controller,me-requests.controller,requests.service,request-apply.ts,request-notify.ts}.ts`, `dto/` | REQ-01..REQ-08, BANK-06 |
| P5-3 | `src/jobs/close-incidents.job.ts` (+ `.spec.ts`) | REQ-06 |
| P5-4 | `src/modules/requests/{request-review.service}.ts`, `dto/review.dto.ts`; `prisma/migrations/<ts>_request_review/` | REQ-09, M2 |
| P5-5 | `src/modules/reports/{reports.module,reports.controller,reports.service,report-math.ts}.ts`, `dto/reports.dto.ts` | RPT-01..RPT-06, `GET /me/consumption` |
| P5-5 | `src/modules/audit/audit-logs.controller.ts`, `audit-read.service.ts`, `dto/audit-query.dto.ts` | AUD-04 |
| P5-5 | `src/modules/settings/dto/settings.dto.ts` (sửa controller/service hiện có) | Settings |
| P5-6 | `src/pages/staff/{RequestsPage,AnnouncementsPage}.tsx`, `src/features/requests/{api,labels,schemas,RequestBoard,RequestCard,DecisionDialog}.ts(x)`, `src/features/announcements/*` | `/ql/yeu-cau`, `/ql/thong-bao`, nút "Gia hạn" |
| P5-7 | `src/pages/staff/{ReportsPage,AuditLogPage,SettingsPage}.tsx`, `src/features/reports/{api,Charts}.ts(x)`, `src/features/settings/*` | `/ql/bao-cao`, `/ql/nhat-ky`, `/ql/cai-dat`, vòng lấp phòng ở `/ql` |
| P5-8 | `src/pages/tenant/{TenantNotificationsPage,TenantRequestsPage,TenantRequestDetailPage}.tsx`, `src/features/requests/tenant*`, bổ sung `TenantHomePage.tsx` | trang người thuê song ngữ |

---

## 4. Các phần và thứ tự

Mỗi ⏸ là điểm dừng: báo cáo, chủ dự án kiểm và commit, rồi mới tiếp. Phần nào ghi "Reviewer: có" thì chạy reviewer trên thay đổi chưa commit **trước khi dừng** và đưa báo cáo đầy đủ vào checkpoint.

| Phần | Việc | Mã task | Cần trước | Planner | Reviewer |
|---|---|---|---|---|---|
| P5-0 | Chủ dự án: trả lời Q-P5-1..16, duyệt ba migration M1/M2/M3 (tạo và áp), duyệt gói biểu đồ | – | – | – | – |
| P5-1 | BE thông báo chung: `GET/POST /announcements`, kiểm hộp thư người thuê đã đủ | BE-P5-01..04 | Q-P5-4, Q-P5-11 | không | **có** |
| P5-2 | BE gia hạn: migration M1, `POST /contracts/:id/renew`, ký, hủy gia hạn; kiểm lại BIL-06/CON-20/CON-21 và nêu khoảng trống | BE-P5-05..09 | P5-0 duyệt M1; Q-P5-1, Q-P5-9, Q-P5-10 | **có** | **có** |
| P5-3 | BE yêu cầu: 6 loại, bảng nhân sự, duyệt/từ chối/leo thang, chi phí, ảnh, cron 3 ngày, nhóm việc hôm nay | BE-P5-10..18 | P5-1 (thông báo), P5-2 (REQ-04 → CON-17); Q-P5-3, Q-P5-6, Q-P5-12, Q-P5-15 | **có** | **có** |
| P5-4 | BE đánh giá sửa chữa REQ-09: migration M2, đánh giá của người thuê, ẩn nhận xét của nhân sự | BE-P5-19..21 | P5-3; P5-0 duyệt M2; Q-P5-2 | không | **có** |
| P5-5 | BE báo cáo + nhật ký + cài đặt + `GET /me/consumption` | BE-P5-22..27 | P5-3 (RPT-03 đọc `requests.cost`); Q-P5-5, Q-P5-7, Q-P5-13, Q-P5-14, Q-P5-16 | không | **có** |
| P5-6 | FE nhân sự vận hành: `/ql/yeu-cau`, `/ql/thong-bao`, nút "Gia hạn" ở `/ql/hop-dong/:id`, nhóm yêu cầu ở `/ql` | FE-P5-01..05 | P5-1, P5-2, P5-3 đã commit | **có** | không |
| P5-7 | FE nhân sự quản trị: `/ql/bao-cao`, `/ql/nhat-ky`, `/ql/cai-dat`, vòng lấp phòng + thanh thu/nợ ở `/ql` | FE-P5-06..10 | P5-5 đã commit; FE-P5-01 (khung route); Q-P5-7, Q-P5-8 | không | không |
| P5-8 | FE người thuê song ngữ: `/thue/thong-bao`, `/thue/yeu-cau(/:id)` + đánh giá, nút ở `/thue/hop-dong` và `/thue/hoa-don/:id`, bổ sung `/thue` | FE-P5-11..16 | FE-P5-01 (khung route) đã commit; P5-4, P5-5 (`/me/consumption`) | không | không |
| P5-9 | QA và chốt phase | QA-P5-01..06 | tất cả | – | – |

```
P5-0 ─┬─► P5-1 ─┐
      └─► P5-2 ─┴─► P5-3 ─┬─► P5-4 ─┐
                          └─► P5-5 ─┼─► P5-6 ─► P5-7 ─┐
                                    │   (P5-8 sau khung route của P5-6)
                                    └─────────────────┴─► P5-8 ─► P5-9
```

Quy tắc chạy: backend nối tiếp P5-1 → P5-2 → P5-3 → P5-4 → P5-5 (P5-1 và P5-2 **có thể** đổi chỗ, nhưng không chạy song song vì cả hai sửa `contracts`/`notifications`). P5-6 chạy sau khi P5-3 đã commit; P5-7 và P5-8 chỉ sau khi khung route của P5-6 đã commit. Mỗi agent bắt đầu với `git status` sạch.

### P5-1 · BE thông báo chung (BE-P5-01..04) — reviewer: có

- **BE-P5-01** `POST /announcements` (NOTI-02, NOTI-03): phạm vi một phòng (`roomId` + `buildingId` của chính phòng), một tòa, hoặc mọi tòa (`buildingId = null`, **chỉ BOSS**); manager chỉ trong phạm vi (SCOPE-02); trong một transaction: tạo `announcements` rồi tạo một `notifications` (`kind = ANNOUNCEMENT`, `title` = tiêu đề, `link = /thue/thong-bao`, `announcementId`) cho **mỗi người thuê có hợp đồng ACTIVE** trong phạm vi; trùng chặn bởi `notifications_once_per_announcement`; khách (GUEST) không có hộp thư (D-34); email theo Q-P5-4.
  Done when: gửi cho một phòng không có hợp đồng ACTIVE → 0 dòng thông báo, bản tin vẫn được lưu; manager gửi `buildingId = null` → `FORBIDDEN`; manager gửi cho tòa khác → `OUT_OF_SCOPE`; `roomId` của tòa khác → `VALIDATION_FAILED` (và DB `announcements_room_needs_building` là lưới an toàn); hai người thuê cùng phòng đều nhận một dòng.
- **BE-P5-02** `GET /announcements?buildingId` (nhân sự trong phạm vi): phân trang API-02, mỗi dòng có người gửi, phạm vi (tên tòa/phòng), `createdAt` và "đã đọc / tổng" đếm từ `notifications` (`readAt` khác null / tổng).
  Done when: bản tin mọi tòa chỉ hiện với Boss trong danh sách của Boss; manager chỉ thấy bản tin thuộc phạm vi mình; số "đã đọc/tổng" đúng sau khi một người thuê bấm đọc.
- **BE-P5-03** Kiểm hộp thư người thuê đã đủ cho `/thue/thong-bao`: `GET /me/notifications?unread`, `POST /me/notifications/:id/read`, `/read-all` đã mở cho `TENANT` và lọc `userId` (SCOPE-03). **Không thêm API**, chỉ viết test còn thiếu và sửa nếu phát hiện lệch.
  Done when: TENANT đọc được danh sách của mình kèm `meta.unreadCount`; dòng của người khác → `NOT_FOUND`; GUEST → `FORBIDDEN`; `Cache-Control: no-store` còn nguyên.
- **BE-P5-04** ⏸ `npm run lint`, `npm run test`, `npm run build`; reviewer trước khi dừng.
  Done when: output thật dán vào báo cáo; liệt kê `[ASSUMPTION]` đã dùng.

### P5-2 · BE gia hạn (BE-P5-05..09) — planner + reviewer: có

- **BE-P5-05** Migration M1 sau khi chủ dự án duyệt: nới `contracts_one_open_per_room` theo Q-P5-1; cập nhật `prisma/constraints.sql`, thêm/sửa kịch bản trong `prisma/check-constraints.mjs` (gia hạn HOLD cạnh ACTIVE: **cho phép**; hợp đồng mới thứ hai cho phòng đang ACTIVE/HOLD: **chặn**).
  Done when: `node prisma/check-constraints.mjs . prisma` in ra số thật và mọi kịch bản đạt; migration được kiểm offline (PGlite + `migrate diff`) trước khi áp lên DB dev; báo cáo nêu rõ đã áp hay chưa.
- **BE-P5-06** `POST /contracts/:id/renew` (CON-17): từ hợp đồng ACTIVE trong phạm vi, tạo hợp đồng mới `status = HOLD`, `previousContractId`, cùng phòng, cùng người thuê, `rent` = rent cũ (DB-B1), `startDate` = `endDate` cũ + 1 (DB-B7), `termMonths ≥ 3`, `deposit` = cọc cũ và **không** tạo hóa đơn cọc, dịch vụ copy được sửa; khóa hàng hợp đồng cũ + phòng trong một transaction; một hợp đồng chỉ có một gia hạn (`contracts_previous_contract_id_key`); audit `contract.create`. Bản gia hạn sao điều khoản bổ sung của hợp đồng trước theo mặc định. Nhân sự có thể sửa hoặc xóa phần đó (D-46).
  Done when: tạo lần hai từ cùng hợp đồng → `CONFLICT_STATE`; hợp đồng HOLD/ENDED → `CONFLICT_STATE`; `termMonths = 2` → `CONTRACT_TERM_TOO_SHORT`; manager tòa khác → `OUT_OF_SCOPE`; **không** có hóa đơn `DEPOSIT` nào được tạo; `startDate` = `endDate` cũ + 1 đúng cả khi tháng 2 nhuận.
- **BE-P5-07** Ký hợp đồng gia hạn (CON-18): dùng lại đúng đường ký của CON-06 (bản in CON-22, tải bản scan riêng tư, không tài khoản mới, không hóa đơn cọc, không bước vào ở); sau khi ký, `renewalsWaiting` của dashboard và `switchDueRenewals` tự lo phần chuyển ca.
  Done when: ký xong `signedAt` khác null, `status` vẫn HOLD, không có `DEPOSIT` và không có mật khẩu tạm; chạy `switchDueRenewals` với `today ≥ startDate` và hợp đồng cũ đã có hóa đơn kỳ N + mốc giao nhận → `SWITCHED`, người ở và xe đã copy (CON-19); thiếu hóa đơn kỳ N → `WAITING_FINAL_INVOICE` (không ném lỗi).
- **BE-P5-08** Hủy một gia hạn chưa chuyển ca theo Q-P5-10 + kiểm lại CON-20/CON-21: `expiringContracts` loại hợp đồng đã có gia hạn (`nextContract: null` — đã có), `expiredContracts` đỏ, nhắc 30/7 ngày của `invoice-reminder.job` không gửi khi đã có gia hạn. Báo cáo phải **liệt kê khoảng trống** còn lại của BIL-06/CON-20/CON-21 nếu có.
  Done when: hợp đồng có gia hạn đã ký không còn trong `expiringContracts` và không được nhắc hết hạn; hủy gia hạn → hợp đồng cũ quay lại danh sách sắp hết hạn, phòng không bị khóa sai, audit ghi lại.
- **BE-P5-09** ⏸ lint + test + build + e2e (tạo gia hạn → ký → chạy job chuyển ca); reviewer.
  Done when: output thật; `scripts/e2e/cleanup.mjs` chế độ list sạch cho lượt này.

### P5-3 · BE yêu cầu (BE-P5-10..18) — planner + reviewer: có

- **BE-P5-10** Module `requests` + `POST /me/requests` (REQ-01, REQ-02): chỉ hợp đồng ACTIVE của chính người gọi (SCOPE-03), riêng `PAYMENT_ISSUE` cho phép HOLD trên hóa đơn cọc; DTO theo từng loại đúng bảng `payload` của 18-requests; `INCIDENT` kèm ảnh (`photos`); thứ hai PENDING của `MOVE_OUT`/`RENEW` → `PENDING_REQUEST_EXISTS` (kiểm trong transaction + lưới `requests_one_pending_moveout_renew`); thông báo nhân sự phụ trách qua `notifyBuildingStaff` (SCOPE-04).
  Done when: ca nghiệm thu 18 "MOVE_OUT thứ hai khi còn một cái PENDING → `PENDING_REQUEST_EXISTS`"; hai yêu cầu song song → một dòng; hợp đồng của người khác → `NOT_FOUND`; GUEST → `FORBIDDEN`; `payload` sai hình → `VALIDATION_FAILED` kèm `fields`.
- **BE-P5-11** `GET /me/requests` + `POST /me/requests/:id/cancel` · `/confirm` · `/reopen`: rút chỉ khi PENDING (REQ-01); `confirm` đưa sự cố RESOLVED → CLOSED, `reopen` ("Chưa ổn") đưa RESOLVED → IN_PROGRESS (REQ-06); mỗi lần đổi trạng thái ghi `REQUEST_UPDATED` (REQ-08).
  Done when: rút một yêu cầu APPROVED → `CONFLICT_STATE`; `confirm` trên sự cố PENDING → `CONFLICT_STATE`; người thuê khác → `NOT_FOUND`; mỗi lần đổi có đúng một dòng `notifications`.
- **BE-P5-12** Ảnh của người thuê: thêm `purpose = REQUEST_PHOTO` vào `sign.dto.ts`/`files.controller.ts` theo Q-P5-3 (tối đa 5 ảnh mỗi yêu cầu, chỉ TENANT, buộc theo `contractId` của chính mình, thư mục + tiền tố riêng như D-37).
  Done when: `purpose` lạ → `VALIDATION_FAILED` với `fields.purpose`; ảnh thứ 6 → `VALIDATION_FAILED`; MANAGER gọi với `REQUEST_PHOTO` → `FORBIDDEN`; ký của Cloudinary mang đúng thư mục/tiền tố (test như `files.service.spec.ts` đang làm).
- **BE-P5-13** `GET /requests?buildingId&type&status` + `PATCH /requests/:id` (nhân sự trong phạm vi, SCOPE-02, API-08, phân trang API-02): `PATCH` đổi trạng thái sự cố PENDING → IN_PROGRESS → RESOLVED và ghi `cost` (REQ-06, D-15; DB CHECK `requests_cost` chỉ cho `INCIDENT`); audit.
  Done when: manager tòa khác → `OUT_OF_SCOPE`; `cost` trên yêu cầu không phải sự cố → `VALIDATION_FAILED` (BE chặn trước DB); nhảy PENDING → CLOSED → `CONFLICT_STATE`; `?buildingId=` thật sự vào `where` cùng mảnh scope (bài học BE-P2-17).
- **BE-P5-14** `POST /requests/:id/approve` · `/reject` (REQ-03, REQ-04, REQ-05, REQ-08): `MOVE_OUT` → ghi `contracts.move_out_notice_date` = ngày `created_at` của yêu cầu và `planned_move_out_date`, trả kèm cảnh báo "Dọn trước hạn: vẫn tính tiền phòng đến {end_date}" và số tiền (D-14) — **không** quyết toán ở đây (quyết toán vẫn là BIL-13 của Phase 4); `RENEW` → APPROVED và mở đường tạo hợp đồng gia hạn CON-17, ghi `payload.contractId` theo Q-P5-15; `OCCUPANT_CHANGE`/`VEHICLE_CHANGE` → áp payload **trong cùng transaction** theo CON-13, CON-14 (thêm người kiểm `max_occupants`/DB-B6, thêm xe kiểm biển số đang hoạt động và `serviceId` unit VEHICLE); `reject` buộc có `decision_note`.
  Done when: ca nghiệm thu 18 "duyệt VEHICLE_CHANGE thêm biển số đang hoạt động ở nơi khác → thất bại và yêu cầu **vẫn** PENDING"; duyệt hai lần → `CONFLICT_STATE`; `reject` thiếu `decision_note` → `VALIDATION_FAILED`; MOVE_OUT trước `end_date` trả đúng số tiền còn lại theo D-14; mọi lần đổi trạng thái có `REQUEST_UPDATED`.
- **BE-P5-15** `POST /requests/:id/escalate` + đường giải quyết `PAYMENT_ISSUE` (REQ-07, BANK-06): manager hoặc giải quyết trực tiếp (ghi thu tay BIL-11 bằng `billing.service.ts` rồi RESOLVED) hoặc từ chối có lý do, hoặc leo thang (`escalated_at`, trạng thái ESCALATED); Boss thấy cạnh giao dịch không khớp và giải quyết bằng BANK-05 (`POST /bank-transactions/:id/assign` đã có) rồi đặt RESOLVED.
  Done when: ESCALATED rồi leo thang lần hai → `CONFLICT_STATE`; manager đặt RESOLVED cho yêu cầu ESCALATED → `FORBIDDEN` (chỉ Boss); gán giao dịch xong thì yêu cầu về RESOLVED và hóa đơn PAID trong cùng lượt; DB CHECK `requests_status_by_type` không bao giờ bị chạm.
- **BE-P5-16** Job `close-incidents` 08:00 + chạy lúc khởi động, một lượt/ngày bằng `claimDailyRun` (thêm `'close_incidents'` vào `DailyJob`): sự cố RESOLVED đủ 3 ngày trọn (theo ngày Hà Nội) → CLOSED + `closed_at` + `REQUEST_UPDATED`; log một dòng tổng kết.
  Done when: ca nghiệm thu 18 "sự cố RESOLVED ngày 1 được cron đóng ngày 4"; ngày 3 chưa đóng; chạy hai lần cùng ngày → đóng một lần, không có thông báo trùng; sự cố đã CLOSED không bị chạm.
- **BE-P5-17** Nhóm việc hôm nay (NOTI-06): `pendingRequests` (mọi yêu cầu PENDING trong phạm vi, kèm phòng/người thuê/loại, tối đa 5 dòng) và `escalatedPaymentIssues` (chỉ Boss); trách nhiệm theo SCOPE-04 như các nhóm có sẵn; sửa `dto/dashboard.dto.ts` và **cả 5** fake dashboard (bài học BE-P4-12).
  Done when: manager chỉ thấy yêu cầu tòa mình; `?buildingId` thu hẹp trong phạm vi; MANAGER không nhận `escalatedPaymentIssues`; test đọc `GET /dashboard` bằng unit fake (không e2e rollback — bài học BE-P4-12).
- **BE-P5-18** ⏸ lint + test + build + e2e (tạo sự cố → xử lý → RESOLVED → cron đóng; tạo MOVE_OUT → duyệt); reviewer.

### P5-4 · BE đánh giá sửa chữa REQ-09 (BE-P5-19..21) — reviewer: có

- **BE-P5-19** Migration M2 sau khi chủ dự án duyệt (bộ cột chốt theo Q-P5-2); thêm kịch bản `check-constraints.mjs`: `review_rating = 0`/`6` bị chặn, đánh giá trên yêu cầu không phải `INCIDENT` bị chặn, ẩn nhận xét mà chưa có đánh giá bị chặn.
  Done when: bộ kiểm in ra số thật và tất cả đạt; migration kiểm offline trước khi áp; `02-database.md` dòng Phase 5 được cập nhật khi xong.
- **BE-P5-20** `PUT /me/requests/:id/review { rating, comment? }` (REQ-09, A-17) và `POST /requests/:id/review/hide { reason }` (nhân sự trong phạm vi): chỉ `INCIDENT` ở `CLOSED`, chỉ người thuê đã tạo yêu cầu, một lần, sửa được trong 7 ngày kể từ lần đánh giá đầu (`review_at`, ngày Hà Nội); sự cố do cron đóng cũng đánh giá được; đánh giá **không** mở lại sự cố, **không** đổi `cost`, **không** sinh hoàn tiền; nhân sự ẩn nhận xét kèm lý do, giữ cả đánh giá lẫn lần ẩn, audit `request.review_hide` (AUD-01); không công khai ở đâu.
  Done when: 4 ca nghiệm thu của 18 ("sự cố chưa CLOSED", "đánh giá lần hai", "sửa ở ngày 8", "người thuê khác" đều bị từ chối) + "1 sao vẫn CLOSED và `cost` không đổi"; `rating = 0`/`6` → `VALIDATION_FAILED`; MANAGER gọi `PUT /me/requests/:id/review` → `FORBIDDEN`; manager tòa khác ẩn nhận xét → `OUT_OF_SCOPE`; `reason` trống → `VALIDATION_FAILED`.
- **BE-P5-21** ⏸ lint + test + build (+ DB check vì schema đổi); reviewer. Nêu `[ASSUMPTION]` A-17 và mọi chi tiết Q-P5-2 đã chốt.

### P5-5 · BE báo cáo, nhật ký, cài đặt (BE-P5-22..27) — reviewer: có

- **BE-P5-22** `report-math.ts` (hàm thuần, số nguyên đồng): doanh thu tháng = tổng `payments` của hóa đơn MONTHLY/FINAL theo `paid_at` giờ Hà Nội + phần cọc đã dùng của `settlements` tạo trong tháng (`deposit − max(net, 0)`), hóa đơn DEPOSIT **không** là doanh thu (RPT-01); công nợ = tổng UNPAID của MONTHLY/FINAL, quá hạn tách riêng (RPT-02); chi phí = tổng `requests.cost` của sự cố RESOLVED trong tháng, lợi nhuận = doanh thu − chi phí (RPT-03); cọc đang giữ = tổng cọc đã trả của hợp đồng HOLD/ACTIVE (RPT-05).
  Done when: unit test theo ví dụ của 20-reports (80 triệu đã thu + một hóa đơn quá hạn 5 triệu: "Cất" → 80 triệu thu / 5 triệu quá hạn; "Xóa" có lý do → 80 triệu thu / 0 quá hạn); một hóa đơn DEPOSIT đã trả không vào doanh thu; `net ≥ 0` thì phần cọc đã dùng = `deposit − net`.
- **BE-P5-23** `GET /reports/revenue?buildingId&from&to` (chuỗi theo tháng) + `GET /reports/occupancy?buildingId` (RPT-04: phòng "Đang thuê" / phòng đang hoạt động, theo tòa và tổng; dùng lại `deriveRoomStatus` ở `src/modules/rooms/room-status.ts`): manager chỉ thấy tòa mình, Boss thấy tất cả **và** phần so sánh theo tòa (RPT-06); giới hạn khoảng thời gian theo Q-P5-13; `no-store`.
  Done when: **mục tiêu roadmap** — Boss nhận mảng so sánh nhiều tòa trong một lượt gọi; manager nhận đúng một (hoặc hai) tòa và không có khối so sánh; `buildingId` ngoài phạm vi → `OUT_OF_SCOPE`; khoảng quá dài → `VALIDATION_FAILED`.
- **BE-P5-24** Ba hành động của Boss trên hóa đơn quá hạn (20-reports §16-26): "Sửa" = BIL-12 `reissue` (đã có), "Xóa" = hủy kèm lý do (đã có) và biến mất khỏi công nợ, "Cất" = ẩn khỏi danh sách chính của Boss **nhưng vẫn tính vào công nợ/quá hạn**, người thuê và quản lý phụ trách vẫn thấy cảnh báo đỏ — cách lưu "Cất" theo Q-P5-7; audit.
  Done when: sau "Cất", `GET /reports/revenue` giữ nguyên tổng quá hạn, danh sách chính của Boss không còn dòng đó, `GET /me/invoices` của người thuê và `GET /dashboard` của quản lý vẫn còn; sau "Xóa" có lý do thì tổng quá hạn giảm.
- **BE-P5-25** `GET /audit-logs?entity&entityId&actorId&from&to` (**chỉ BOSS**, AUD-04): phân trang API-02, sắp xếp mới nhất trước, trả `actor` (tên, vai trò), `action`, `entity`, `entityId`, `before`/`after`, `ip`, `createdAt`; `id` là `BigInt` nên phải chuyển sang chuỗi/số an toàn khi trả ra; hiển thị `before`/`after` theo Q-P5-16; không bao giờ trả CCCD rõ, mật khẩu hay mật khẩu tạm.
  Done when: MANAGER → `FORBIDDEN`; lọc theo `entity` + `entityId` ra đúng dòng; `from`/`to` theo ngày Hà Nội; một bản ghi `occupant.view_id` không làm lộ số CCCD.
- **BE-P5-26** `GET/PATCH /settings` (**chỉ BOSS**) + `GET /me/consumption?periods=6`: `settings` chỉ cho sửa các khóa của 20-reports (`bank_account`, `webhook`, `contract_template`, `email_templates`, `default_contact`) theo Q-P5-14, mỗi khóa có schema riêng, mẫu email kiểm placeholder bắt buộc như `emailTemplate` đang làm, audit `settings.change` với before/after, **không** bao giờ đọc/ghi secret (env); `GET /me/consumption` trả điện/nước của tối đa 6 kỳ gần nhất của hợp đồng người gọi (số đã tính ở BE, FE chỉ vẽ — UI-06, SCOPE-03, `no-store`) cho biểu đồ của `/thue`.
  Done when: khóa lạ → `VALIDATION_FAILED`; MANAGER → `FORBIDDEN`; `bank_account` thiếu `accountNo` → `VALIDATION_FAILED` và VietQR cũ không bị hỏng; mẫu email thiếu placeholder bắt buộc → `VALIDATION_FAILED`; `GET /me/consumption` của hợp đồng người khác → `NOT_FOUND`; hợp đồng mới chỉ có 2 kỳ → trả 2 phần tử, không lỗi.
- **BE-P5-27** ⏸ lint + test + build + e2e (báo cáo một tháng thật trên DB dev); reviewer.

### P5-6 · FE nhân sự vận hành (FE-P5-01..05) — planner: có

- **FE-P5-01** Khung route và menu của cả phase: `/ql/yeu-cau`, `/ql/thong-bao`, `/ql/bao-cao`, `/ql/nhat-ky` (Boss), `/ql/cai-dat` (Boss), `/thue/thong-bao`, `/thue/yeu-cau`, `/thue/yeu-cau/:id`; stub mọi trang mới và cập nhật **mọi** test đọc `routes[0..2]` và mọi mảng menu mong đợi, kể cả `auth-login-flow` (bài học FE-EX-03, FE-P3-01).
  Done when: `npm run test:components` và `npm run build` đạt; manager mở `/ql/cai-dat` bị guard chặn (không chỉ ẩn menu).
- **FE-P5-02** `/ql/yeu-cau`: bảng 3 cột "Chờ xử lý / Đang xử lý / Hoàn thành" (UI-02 dùng bản đồ nhãn chung cho 8 trạng thái của 18-requests), lọc theo tòa/loại/trạng thái, mở chi tiết; duyệt/từ chối (hộp xác nhận, `decision_note` bắt buộc khi từ chối), ghi `cost` cho sự cố, leo thang; cảnh báo D-14 của MOVE_OUT hiện nguyên văn số tiền do BE trả (UI-06).
  Done when: 4 trạng thái UI-03 (đang tải / trống / lỗi / có dữ liệu); lỗi `PENDING_REQUEST_EXISTS` và `CONFLICT_STATE` hiện `error.message` của API; không có phép tính tiền nào ở FE.
- **FE-P5-03** `/ql/thong-bao`: gửi cho một phòng / một tòa / mọi tòa (Boss), hộp xác nhận nêu số người sẽ nhận, danh sách bản tin đã gửi kèm "đã đọc / tổng".
  Done when: manager không có lựa chọn "mọi tòa"; sau khi gửi, danh sách tự làm mới (invalidate query).
- **FE-P5-04** Nút "Gia hạn" trong `/ql/hop-dong/:id`: form kỳ hạn (≥ 3 tháng) + dịch vụ copy sửa được, xem trước ngày bắt đầu và cọc do BE trả, hộp xác nhận; sau khi tạo thì mở đường ký như CON-06; nút "Hủy gia hạn" theo Q-P5-10.
  Done when: hợp đồng không ACTIVE hoặc đã có gia hạn thì nút bị khóa kèm lý do; màn hình nói rõ "không thu thêm cọc".
- **FE-P5-05** ⏸ `npm run lint`, `npm run build`, `npm run test:components` (chạy lại một lượt nếu có ca nhạy thời gian, bài học 13/11).

### P5-7 · FE nhân sự quản trị (FE-P5-06..10)

- **FE-P5-06** `/ql/bao-cao`: cột doanh thu theo tháng + đường lợi nhuận, công nợ (quá hạn tách riêng), tỉ lệ lấp phòng, cọc đang giữ; Boss có khối so sánh theo tòa và danh sách hóa đơn quá hạn màu đỏ với ba hành động "Sửa / Xóa / Cất" (hộp xác nhận, "Xóa" bắt buộc lý do).
  Done when: manager chỉ thấy tòa mình và không thấy khối so sánh; mọi số tiền từ API, FE không cộng trừ gì (UI-06).
- **FE-P5-07** Biểu đồ bằng **thư viện biểu đồ** theo Q-P5-8 = B (D-45 (8)): cột, đường, vòng tròn lấp phòng, bọc trong một component của feature `reports` để `/thue` dùng lại; màu và chữ lấy từ token của kit. **Hỏi chủ dự án tên gói + phiên bản và chờ duyệt trước khi cài** (đề xuất `recharts`).
  Done when: gói đã được duyệt rồi mới vào `package.json`; `npm run build` đạt; biểu đồ đọc được ở 360 px (UI-07) và có nhãn chữ cho người đọc bằng bàn phím/đọc màn hình.
- **FE-P5-08** `/ql/nhat-ky` (Boss): lọc theo `entity`, `entityId`, `actorId`, khoảng ngày; phân trang; `before`/`after` hiện theo Q-P5-16.
  Done when: 4 trạng thái UI-03; manager vào URL → bị guard chặn.
- **FE-P5-09** `/ql/cai-dat` (Boss): tài khoản ngân hàng, webhook (theo Q-P5-5), mẫu hợp đồng, mẫu email, liên hệ mặc định; mỗi khối lưu riêng với hộp xác nhận; lỗi `error.fields` map vào input (UI-05). Thêm vòng lấp phòng + thanh "đã thu / còn nợ" ở `/ql` (dòng `/ql` của 30-frontend).
  Done when: lưu `bank_account` sai định dạng hiện lỗi đúng ô; mẫu hợp đồng nháp hiện rõ cờ "BẢN NHÁP – chưa dùng để ký".
- **FE-P5-10** ⏸ lint + build + test:components; kiểm tay ở 360 px.

### P5-8 · FE người thuê song ngữ (FE-P5-11..16)

- **FE-P5-11** `/thue/thong-bao`: hộp thư, dấu chưa đọc, "Đánh dấu đã đọc hết", bấm mở `link`; **dùng lại** `src/features/notifications/api.ts` (`listMyNotifications`, `readNotification`, `readAllNotifications`), không viết API mới.
  Done when: đọc một dòng thì dấu chưa đọc giảm ngay; dòng đã đọc vẫn còn trong danh sách (mờ) và vẫn mở được.
- **FE-P5-12** `/thue/yeu-cau`: danh sách theo loại, tạo sự cố kèm ảnh (tối đa 5, `REQUEST_PHOTO`), rút yêu cầu PENDING.
  Done when: 4 trạng thái UI-03; ảnh thứ 6 bị chặn ngay ở FE kèm chữ tiếng Việt/English.
- **FE-P5-13** `/thue/yeu-cau/:id`: dòng thời gian trạng thái, "Đã sửa xong" / "Chưa ổn" (REQ-06), ô đánh giá 1–5 sao + nhận xét sau khi CLOSED, sửa được trong 7 ngày, nhận xét bị ẩn hiện đúng trạng thái "đã ẩn".
  Done when: sự cố chưa CLOSED không hiện ô đánh giá; sau 7 ngày ô chuyển chỉ-đọc; lỗi từ BE hiện `error.message`.
- **FE-P5-14** Bốn nút ở `/thue/hop-dong(/:id)` ("Báo trả phòng", "Xin gia hạn", "Cập nhật người ở", "Cập nhật xe") và "Báo lỗi thanh toán" ở `/thue/hoa-don/:id` (REQ-07, thay chỗ trống của FE-P4-13); cảnh báo D-14 khi dọn trước hạn hiện nguyên văn của BE.
  Done when: đã có một yêu cầu PENDING cùng loại thì nút khóa kèm lý do; `PENDING_REQUEST_EXISTS` của BE vẫn được hiện nếu người dùng bấm kịp.
- **FE-P5-15** Bổ sung `/thue` (dòng Phase 5 của 30-frontend): số thông báo chưa đọc, yêu cầu đang mở, biểu đồ cột điện/nước 6 kỳ từ `GET /me/consumption` (BE-P5-26) — biểu đồ dùng component SVG của FE-P5-07. Song ngữ toàn bộ chữ mới (LOC-01, UI-12), tiền `2.984.000 đ` và ngày `dd/mm/yyyy` ở cả hai (LOC-05).
  Done when: hợp đồng mới chỉ có 2 kỳ vẫn vẽ được; mọi chữ mới có bản vi và en; không có phép tính nào ở FE.
- **FE-P5-16** ⏸ lint + build + test:components; kiểm tay ở 360 px bằng cả hai ngôn ngữ.

### P5-9 · QA và chốt phase (QA-P5-01..06)

- **QA-P5-01** Chạy hết mục "Acceptance" của `18-requests.md` (5 dòng), các dòng NOTI-01..03 của `19-notifications.md`, mục Reports/Audit/Settings của `20-reports-audit-settings.md` (gồm ví dụ 80 triệu / 5 triệu) và CON-17..21 của `14-contracts.md`; đánh dấu từng dòng kèm tên test.
- **QA-P5-02** `node prisma/check-constraints.mjs . prisma` — báo **số thật** bộ kiểm in ra (gần nhất 107/107) kèm các kịch bản mới của M1 và M2.
- **QA-P5-03** e2e trên DB dev theo lệnh trong `docs/LESSONS.md` (`.env` ở `Source/backend`, chạy **từng file một**): sự cố → đánh giá; MOVE_OUT → duyệt → quyết toán; gia hạn → ký → chuyển ca; báo cáo một tháng. Ca nghi ngờ chạy riêng trước khi kết luận lỗi logic (bài học QA-P3-02 về khóa advisory và timeout 30 s); lưu tên file + mã thoát theo lượt (bài học QA-P4-03/04).
- **QA-P5-04** Hai ca đua trên hai kết nối: duyệt cùng một yêu cầu hai lần (một bên `CONFLICT_STATE`, payload chỉ áp một lần) và chuyển ca gia hạn chạy song song hai lượt job (một `SWITCHED`, không copy người ở/xe hai lần).
- **QA-P5-05** Hồi quy: đăng nhập 4 vai trò + lối vào (D-43), vòng tiền Phase 4 (chốt chỉ số → phát hành → webhook khớp → quyết toán), vòng cọc Phase 3, trang công khai và lịch hẹn; `scripts/e2e/cleanup.mjs` chế độ list (chỉ `--apply` khi chủ dự án đồng ý).
- **QA-P5-06** ⏸ Cập nhật `PROGRESS.md`, mục Status của `docs/spec/README.md` và `CLAUDE.md`, `02-database.md` (M1, M2), `LESSONS.md`; viết `p5-9-qa-checklist.md`; đề nghị thông điệp commit kèm mã task và mã spec.

---

## 5. Ma trận yêu cầu

| Luật spec | Phần |
|---|---|
| NOTI-01, NOTI-02, NOTI-03, D-34 (khách không có hộp thư) | P5-1 |
| CON-17, CON-18, CON-19, CON-20, CON-21, BIL-06 (kiểm lại), DB-B1, DB-B7, D-13, migration M1 | P5-2 |
| REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, REQ-06, REQ-07, REQ-08, BANK-06, D-14, D-15, CON-13, CON-14, DB-B6, NOTI-06 (nhóm yêu cầu), FILE-01 (`REQUEST_PHOTO`) | P5-3 |
| REQ-09, D-33, A-17, AUD-01 (`request.review_hide`), migration M2 | P5-4 |
| RPT-01, RPT-02, RPT-03, RPT-04, RPT-05, RPT-06, 20-reports §16-26 (Sửa/Xóa/Cất), AUD-02, AUD-03, AUD-04, mục Settings của 20, CON-22 (mẫu hợp đồng trong Cài đặt), SCOPE-02, SCOPE-03, API-02, API-07, API-08 | P5-5 |
| 30-frontend: `/ql/yeu-cau`, `/ql/thong-bao`, phần "Gia hạn" của `/ql/hop-dong/:id`, nhóm yêu cầu ở `/ql`; UI-01..UI-06 | P5-6 |
| 30-frontend: `/ql/bao-cao`, `/ql/nhat-ky`, `/ql/cai-dat`, vòng lấp phòng + thanh thu/nợ của `/ql`; UI-07, UI-08 | P5-7 |
| 30-frontend: `/thue/thong-bao`, `/thue/yeu-cau`, `/thue/yeu-cau/:id`, phần Phase 5 của `/thue`, các nút của `/thue/hop-dong` và `/thue/hoa-don/:id`; LOC-01, LOC-05, UI-12 | P5-8 |
| Mục Acceptance của 18, 19, 20 và CON-17..21 của 14; DB check; e2e; ca đua | P5-9 |
| BANK-08, Zalo/SMS (D-20), chữ ký điện tử, adapter webhook thật (Q-03), giảm trừ khi cho thuê lại (Q-01) | **không thuộc Phase 5** (xem §1) |

---

## 6. Câu hỏi cho chủ dự án (chỉ những chỗ spec không trả lời hoặc ghi `[OPEN]`)

> **Đã trả lời 24/11/2026** (ghi vào spec thành **D-45**, bảng ở `README.md` §1): mọi câu theo đề xuất; chỗ đề xuất có hai nhánh thì chủ dự án chọn **Q-P5-7 = B** (migration M3) và **Q-P5-14 = A** (mẫu hợp đồng vẫn nháp). **Khác đề xuất: Q-P5-8 = B** (thư viện biểu đồ, duyệt gói trước khi cài). Bảng dưới giữ nguyên làm lịch sử.

| # | Câu hỏi | Lựa chọn | Đề xuất | Chặn |
|---|---|---|---|---|
| **Q-P5-1** | Index `contracts_one_open_per_room` (`constraints.sql:70`) chặn hợp đồng gia hạn HOLD nằm cạnh hợp đồng ACTIVE của cùng phòng, nên CON-17 không tạo được. Nới thế nào? | **A** `WHERE status = 'ACTIVE' OR (status = 'HOLD' AND previous_contract_id IS NULL)` · **B** giữ index, chỉ tạo hợp đồng gia hạn đúng ngày chuyển ca (mất bước ký trước) · **C** thay bằng kiểm tra trong BE, bỏ index (mất lưới an toàn) | **A**. Đã soát ba chỗ dựa vào index: (1) `contracts.service.ts:247` map `P2002` → `ROOM_NOT_AVAILABLE` vẫn đúng vì hợp đồng mới luôn có `previous_contract_id = null` và vẫn chạm dòng ACTIVE; (2) `deriveRoomStatus` (`room-status.ts`) ưu tiên ACTIVE nên phòng vẫn là "Đang thuê"; (3) `publicRoomWhere` lọc `contracts: { none: { status: { in: ['HOLD','ACTIVE'] } } }` nên phòng vẫn không lên trang công khai. **Rủi ro còn lại cần bạn biết**: nếu hợp đồng cũ bị hủy/quyết toán mà gia hạn HOLD vẫn còn, index không còn chặn một hợp đồng mới cho phòng đó → P5-2 phải kiểm trong BE và có test | P5-2, và M1 phải được bạn duyệt trước |
| **Q-P5-2** | Q-13 còn `[OPEN]`: xác nhận `[ASSUMPTION] A-17` (1–5 sao, nhận xét tùy chọn, một lần, sửa 7 ngày) và bộ cột đánh giá của M2 | **A** đúng A-17 với bộ cột `review_rating, review_comment, review_at, review_updated_at, review_hidden_reason, review_hidden_at, review_hidden_by_id` · **B** bỏ nhận xét, chỉ số sao (ít cột, không cần cơ chế ẩn) · **C** thêm "chủ đề" (thái độ / thời gian / chất lượng) | **A**: khớp REQ-09 từng chữ, đủ dấu vết cho việc ẩn | P5-4 (migration M2) |
| **Q-P5-3** | Ảnh người thuê gửi kèm yêu cầu: thêm `purpose = REQUEST_PHOTO`, tối đa 5 ảnh? | **A** `REQUEST_PHOTO`, tối đa 5, công khai-có-chữ-ký như ảnh phòng · **B** riêng tư như CCCD (ký từng lần xem, nặng hơn) · **C** không cho ảnh, chỉ chữ | **A**: biên lai và ảnh sự cố không phải giấy tờ cá nhân; nếu bạn muốn chắc hơn thì **B** | P5-3 |
| **Q-P5-4** | NOTI-03 chỉ nói ghi `notifications`. Thông báo chung và `REQUEST_UPDATED` có gửi email không? | **A** chỉ trong ứng dụng (không email) · **B** thông báo chung có email, `REQUEST_UPDATED` chỉ trong ứng dụng · **C** cả hai đều gửi email | **A**: NOTI-04 nói "trong ứng dụng luôn luôn", email là kênh riêng; thêm email dễ thành spam khi một bản tin có 30 người nhận | P5-1, P5-3 |
| **Q-P5-5** | `/ql/cai-dat` của 30-frontend có "webhook toggle"; Phase 4 đã chốt Q-P4-11 là **không** có công tắc. Trang Cài đặt hiện gì? | **A** hiện khóa `settings.webhook` chỉ-đọc (nhà cung cấp) + hướng dẫn tắt bằng cách đổi secret · **B** làm công tắc `enabled` thật, webhook kiểm khóa này trước khi ghi · **C** ẩn hẳn khối webhook | **A**: giữ đúng quyết định Phase 4, vẫn thấy được cấu hình | P5-5, P5-7 |
| **Q-P5-6** | REQ-05 nói rõ cách đếm **người** thêm giữa tháng (Q-P3-18) nhưng chưa chốt cho **xe**. Xe đăng ký giữa tháng tính tiền thế nào? | **A** như người: thu đủ một đơn vị cho tháng đăng ký, không chia theo ngày · **B** chia theo ngày trong tháng đăng ký · **C** chỉ thu từ tháng sau | **A**: khớp cách đã chốt cho người và khớp Q-P3-20 (xe giao nhau với tháng thu thì tính) | P5-3 (và mọi hóa đơn sau đó) |
| **Q-P5-7** | Hành động "Cất" của Boss (20-reports §16-26) lưu ở đâu? Hiện `invoices` không có cột nào cho việc này | **A** một khóa `settings` chứa danh sách id đã cất (không migration, đủ cho vài hóa đơn) · **B** migration thêm `invoices.archived_at` + `archived_by_id` (sạch hơn, cần bạn duyệt và một bộ kiểm mới) · **C** không làm "Cất" ở Phase 5, chỉ Sửa/Xóa | **B** nếu bạn định dùng thường xuyên; **A** nếu chỉ là mẹo dọn danh sách. Nói rõ giúp mình vì đây là migration thứ ba của phase | P5-5, P5-7 |
| **Q-P5-8** | Biểu đồ của `/ql/bao-cao` và `/thue` | **A** SVG vẽ tay trong kit, không dependency mới · **B** thêm một thư viện biểu đồ (recharts…) — cần bạn duyệt cài gói · **C** chỉ bảng số, không biểu đồ | **A**: cột/đường/vòng tròn đơn giản, giữ đúng kit An Lâm và không thêm gói | P5-7, P5-8 |
| **Q-P5-9** | Quyết toán trả phòng (BIL-13) cho một hợp đồng **đã có gia hạn đã ký**: xử lý sao? | **A** chặn (`CONFLICT_STATE` "Hợp đồng đã có gia hạn, hãy hủy gia hạn trước") · **B** tự hủy gia hạn rồi quyết toán · **C** cho quyết toán và để gia hạn tự chuyển ca (phòng bị khóa sai) | **A**: hai việc này đối nghịch nhau, để người làm chọn rõ ràng | P5-2, và một sửa nhỏ ở `settlement.service.ts` |
| **Q-P5-10** | Hủy một gia hạn **chưa** chuyển ca (ký rồi nhưng đổi ý) | **A** `POST /contracts/:id/cancel` hiện có, mở cho gia hạn: `status = CANCELLED`, không quyết toán, không hoàn cọc (cọc vẫn thuộc hợp đồng cũ), audit · **B** route riêng `POST /contracts/:id/renewal/cancel` · **C** chưa làm, sửa tay trong DB | **A**: ít mã nhất; CON-12 chỉ hoàn cọc khi có hóa đơn cọc, gia hạn thì không có | P5-2 |
| **Q-P5-11** | Bản tin đã gửi có sửa/xóa được không? Spec im lặng | **A** không sửa, không xóa (lịch sử giữ nguyên, muốn đính chính thì gửi bản tin mới) · **B** cho Boss ẩn một bản tin (thêm cột, migration) · **C** cho sửa nội dung trong 15 phút | **A**: không hard-delete, không thêm schema | P5-1 |
| **Q-P5-12** | Ai tạo được `INCIDENT`? REQ-01 chỉ nói người thuê, nhưng bảng `/ql/yeu-cau` có ghi chi phí nên nhân sự có thể cần tự mở phiếu | **A** chỉ người thuê (nhân sự chỉ xử lý) · **B** nhân sự cũng tạo được trên hợp đồng ACTIVE trong phạm vi (`created_by_id` là nhân sự; người thuê **không** đánh giá phiếu đó vì REQ-09 chỉ cho người tạo) · **C** nhân sự tạo được cho mọi hợp đồng | **A** cho Phase 5 (đúng spec, ít mã); chọn **B** nếu thực tế bạn tự ghi sự cố hộ khách | P5-3 |
| **Q-P5-13** | `GET /reports/revenue?from&to` không có giới hạn khoảng. Cho tối đa bao nhiêu tháng? | **A** tối đa 24 tháng, mặc định 12 tháng gần nhất · **B** tối đa 12 tháng · **C** không giới hạn | **A**: đủ để so sánh năm nay với năm trước mà không làm DB dev treo | P5-5 |
| **Q-P5-14** | `PATCH /settings` cho sửa những khóa nào, và `contract_template` được đánh dấu "đã duyệt" (`isDraft: false`, Q-15) từ trang này chưa? | **A** sửa đủ 5 khóa của 20-reports, `contract_template` chỉ lưu dạng nháp cho tới khi bạn gửi bản chính thức · **B** như A nhưng có thêm hộp "Tôi xác nhận mẫu này dùng để ký" đặt `isDraft: false` · **C** chỉ `bank_account` + `default_contact` ở Phase 5 | **B** nếu bạn đã có mẫu hợp đồng thật; nếu chưa thì **A** (Q-15 vẫn mở) | P5-5, P5-7 |
| **Q-P5-15** | REQ-04: duyệt `RENEW` thì hợp đồng gia hạn được tạo ngay hay chỉ mở form? Và nếu duyệt rồi mà không ai tạo hợp đồng? | **A** duyệt chỉ đặt APPROVED và mở form prefilled; khi hợp đồng gia hạn được tạo thì ghi `payload.contractId`; yêu cầu APPROVED mà chưa có `contractId` nằm trong nhóm việc hôm nay · **B** duyệt tạo luôn hợp đồng gia hạn với `termMonths` của `payload` · **C** duyệt và tạo luôn, nhân sự sửa sau | **A**: đúng chữ "staff then creates the renewal contract prefilled" của REQ-04 và vẫn không bỏ sót | P5-3 |
| **Q-P5-16** | `/ql/nhat-ky` hiện `before`/`after` thế nào? Một số bản ghi chứa ảnh chụp dữ liệu nhạy cảm (tên, 4 số cuối CCCD) | **A** hiện JSON thô cho Boss, lọc sẵn ở BE các khóa nhạy cảm (hash, mật khẩu tạm, CCCD đầy đủ) · **B** chỉ hiện danh sách tên trường đã đổi, bấm mới xem giá trị · **C** không hiện before/after, chỉ hành động và thời điểm | **A**: Boss là người có quyền cao nhất, và BE đã không bao giờ ghi mật khẩu/CCCD rõ vào audit | P5-5, P5-7 |
| (nhắc) | **Q-15** mẫu hợp đồng chính thức · **Q-03** nhà cung cấp webhook · **Q-04** BANK-08 · **Q-01** giảm trừ khi cho thuê lại | vẫn mở, không chặn Phase 5 | – | – |

`[ASSUMPTION]` sẽ dùng và phải nêu lại ở mỗi checkpoint: **A-17** (đánh giá 1–5 sao, một lần, sửa 7 ngày), **D-15** (chủ trả chi phí sửa), **A-P5-1** (job đóng sự cố chạy 08:00 như hai job sẵn có — spec chỉ nói "3 ngày", không nói giờ), **A-P5-2** ("3 ngày trọn" đếm theo ngày nghiệp vụ `Asia/Ho_Chi_Minh`, RESOLVED ngày 1 → CLOSED ngày 4 đúng ca nghiệm thu), **A-P5-3** (yêu cầu chỉ của hợp đồng ACTIVE, trừ `PAYMENT_ISSUE` trên hóa đơn cọc của hợp đồng HOLD — theo REQ-01).

---

## 7. Rủi ro và cách kiểm thử

### Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| **Nới index phòng (M1)** làm hở đường tạo hai hợp đồng cho một phòng | BE kiểm trong transaction có khóa phòng + hợp đồng (như `contracts.service.ts` đang làm) **trước** khi dựa vào index; thêm kịch bản `check-constraints.mjs` cho cả ca được phép và ca bị chặn; test ca "hợp đồng cũ bị hủy mà gia hạn HOLD còn" (xem Q-P5-1) |
| **Duyệt yêu cầu áp payload hai lần** (thêm người/xe trùng) | `updateMany({ where: { id, status: 'PENDING' } })` rồi mới áp payload, cùng một transaction; 0 dòng = `CONFLICT_STATE`; test hai lượt duyệt song song trên hai kết nối (QA-P5-04) |
| **Duyệt `VEHICLE_CHANGE` vỡ ở giữa** (biển số đã hoạt động nơi khác) | cả transaction rollback, yêu cầu **vẫn** PENDING (đúng ca nghiệm thu của 18); map `P2002` biển số sang mã thân thiện, không để thành 500 (bài học BE-P2-11) |
| **Cron đóng sự cố chạy hai lần / bị bỏ** | `claimDailyRun` trong chính transaction ghi, bù một lượt lúc khởi động, log một dòng tổng kết; test "chạy hai lần cùng ngày đóng một lần, không thông báo trùng" |
| **Chuyển ca gia hạn (BIL-06) đã có nhưng chưa từng chạy với hàng thật** | P5-2 dựng hàng thật rồi chạy job; không sửa `renewal-switch.ts` trừ khi test chỉ ra lỗi, và nếu sửa thì nêu rõ ở checkpoint |
| **Báo cáo đọc tiền ở FE** | mọi tổng, trung bình, phần trăm tính ở BE, FE chỉ vẽ (UI-06); `report-math.ts` là hàm thuần có unit test với số lấy từ ví dụ của 20-reports |
| **Múi giờ `Asia/Ho_Chi_Minh`** | "tháng này", "3 ngày", "7 ngày", `paid_at` của RPT-01 đều qua `today.ts`/`period.ts`; test mốc 23:30 ngày cuối tháng, ngày 1 đầu tháng, tháng 28/29/30/31 ngày |
| **Thông báo chung cho tòa lớn** | một transaction tạo `announcements` + `createMany` thông báo; đo và nêu số dòng; DB dev chậm (0,3–0,8 s/truy vấn) nên tránh N truy vấn cho N người thuê |
| **Test danh sách cố định bị vỡ** | thêm module → sửa `prisma.service.spec.ts`; thêm nhóm dashboard → sửa **5** fake (bài học BE-P4-12); thêm `purpose` → sửa `sign.dto.spec.ts`/`sign.validation.spec.ts`; route FE mới → sửa mọi test đọc `routes[0..2]` và mọi mảng menu, kể cả `auth-login-flow` (FE-P3-01); thêm khóa seed → sửa `EXPECTED_COUNTS`; không thêm mã lỗi nên test đếm mã không đổi |
| **File test FE dùng CRLF** | chuẩn hóa dấu dòng trước khi sửa chuỗi chính xác; trong script sửa file luôn dùng `replace(a, () => b)` (bài học 23/11) |
| **DB dev chậm / e2e timeout** | e2e chạy **từng file một**, giữ transaction ngắn, ca nghi ngờ chạy riêng trước khi kết luận lỗi logic (bài học QA-P3-02); lưu tên file + mã thoát theo lượt (QA-P4-03/04) |

### Chiến lược test

- Giá trị mong đợi **lấy từ spec**: 5 dòng Acceptance của 18-requests (MOVE_OUT thứ hai → `PENDING_REQUEST_EXISTS`; VEHICLE_CHANGE trùng biển số thất bại và yêu cầu vẫn PENDING; RESOLVED ngày 1 → CLOSED ngày 4; bốn ca đánh giá bị từ chối; 1 sao không đổi `cost`), ví dụ 80 triệu / 5 triệu của 20-reports cho ba hành động Sửa/Xóa/Cất, CON-17 (`start_date` = `end_date` + 1, `rent` và `deposit` giữ nguyên, không hóa đơn cọc), CON-20 (đúng 30 và 7 ngày). Mỗi test mang mã luật trong tên: `it('REQ-02: yêu cầu trả phòng thứ hai → PENDING_REQUEST_EXISTS', …)`.
- Unit test bắt buộc theo `Source/backend/CLAUDE.md`: `report-math.ts`, luật chuyển trạng thái yêu cầu theo loại, hạn 3 ngày và 7 ngày, scope guard của mọi route mới.
- Ca đồng thời bắt buộc: hai lượt duyệt cùng một yêu cầu; hai lượt job chuyển ca; hai yêu cầu MOVE_OUT song song; hai lượt đánh giá song song.
- Phạm vi và vai trò cho từng route (xem §8); mỗi route mới có ít nhất một ca `OUT_OF_SCOPE` và một ca `FORBIDDEN`.
- Không `.skip`/`.only`, không mock thứ đang kiểm; mỗi spec chạy riêng được; spec nào boot `AppModule` phải ghi đè `MailerService` (bài học EX-8) và cấp `building.findMany` cho token MANAGER (bài học BE-P4-14b).

---

## 8. Quyền theo đối tượng

| Việc | GUEST | TENANT | MANAGER (tòa của mình) | BOSS |
|---|---|---|---|---|
| Tạo / rút / xác nhận / mở lại yêu cầu của mình | `FORBIDDEN` | ✔ hợp đồng của mình | ✘ (xem Q-P5-12) | ✘ |
| Đánh giá sửa chữa (REQ-09) | `FORBIDDEN` | ✔ chỉ sự cố mình tạo, đã CLOSED | ✘ | ✘ |
| Xem / xử lý / duyệt / từ chối yêu cầu, ghi chi phí | ✘ | ✘ | ✔ trong phạm vi | ✔ mọi tòa |
| Leo thang `PAYMENT_ISSUE` → giải quyết sau leo thang | ✘ | ✘ | ✔ leo thang; ✘ giải quyết sau ESCALATED | ✔ (BANK-05) |
| Ẩn nhận xét kèm lý do | ✘ | ✘ | ✔ trong phạm vi | ✔ |
| Gửi thông báo chung cho phòng/tòa | ✘ | ✘ | ✔ trong phạm vi | ✔ |
| Gửi thông báo chung "mọi tòa" | ✘ | ✘ | `FORBIDDEN` | ✔ |
| Hộp thư `/me/notifications` | `FORBIDDEN` (D-34) | ✔ của mình | ✔ của mình (NOTI-11) | ✔ của mình |
| Tạo / ký / hủy hợp đồng gia hạn | ✘ | ✘ | ✔ trong phạm vi | ✔ |
| Báo cáo | ✘ | ✘ | ✔ tòa của mình, **không** có khối so sánh | ✔ tất cả + so sánh theo tòa (RPT-06) |
| Ba hành động trên hóa đơn quá hạn (Sửa/Xóa/Cất) | ✘ | ✘ | ✘ | ✔ |
| `GET /audit-logs`, `GET/PATCH /settings` | ✘ | ✘ | `FORBIDDEN` | ✔ |
| `GET /me/consumption` | `FORBIDDEN` | ✔ của mình | ✘ | ✘ |
| Dữ liệu ngoài phạm vi | `FORBIDDEN` | 404 | `OUT_OF_SCOPE` | ✔ |

## 9. Việc của chủ dự án trước/trong Phase 5

1. Trả lời **Q-P5-1..16** (một lượt). Q-P5-1 và Q-P5-2 chặn ngay P5-2 và P5-4; Q-P5-7 có thể thêm migration thứ ba.
2. **Duyệt hai lần cho mỗi migration**: duyệt tạo file, rồi duyệt áp lên DB dev — M1 (nới index phòng, P5-2), M2 (cột đánh giá, P5-4), M3 (cột "Cất" trên `invoices`, P5-5). Không có duyệt thì phần đó dừng.
3. Duyệt gói thư viện biểu đồ trước khi cài (P5-7, Q-P5-8).
4. Gửi mẫu hợp đồng chính thức nếu muốn `/ql/cai-dat` đánh dấu `isDraft: false` (Q-15, Q-P5-14), và nội dung mẫu email nếu muốn đổi.
5. Kiểm và commit ở từng ⏸; không agent nào tự `git commit`. Push chỉ khi bạn đồng ý trong chat.
6. Duyệt trước nếu một phần cần xóa file hay cài gói mới (đã biết: thư viện biểu đồ ở P5-7).
