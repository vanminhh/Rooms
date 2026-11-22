# P4-3 · Mail 08:00 và hộp thư nhân sự (BE-P4-14, BE-P4-14a, BE-P4-14b, BE-P4-15..17 + FE-P4-08a)

Bản vẽ cho phiên chính. Không có mã nguồn trong file này. Đọc trước: `CLAUDE.md` (gốc), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`, `docs/phase-4-money/README.md` (Q-P4-1..19 / D-44), `docs/spec/19-notifications.md` (NOTI-01, NOTI-04..07, **NOTI-10, NOTI-11**), `docs/spec/01-architecture.md` (bảng cron, LOC-06, API conventions), `docs/spec/00-overview.md` (D-42, D-44, SCOPE-04), `plans/PHASE/PLAN.md` §2, §3, §7, §8.

---

## 1. Mục tiêu và phạm vi

**Mục tiêu:** sau phần này, hệ thống tự nhắc đúng ngày mà không cần ai bấm gì, và nhân sự thấy việc của mình ngay khi đăng nhập.

### Trong phạm vi

| Nhóm | Nội dung | Mã |
|---|---|---|
| Job 08:00 (1) | Mail Boss "còn phòng thiếu chỉ số", chỉ mùng 2 → mùng 10, tối đa một mail/ngày, bù một lần lúc khởi động | NOTI-10, D-42, NOTI-07, LOC-06 |
| Job 08:00 (2) | Nhắc hóa đơn đến hạn ngày mai (chỉ email), quá hạn ngày 1, 4, 7…, hợp đồng hết hạn 30 và 7 ngày (người thuê **và** nhân sự) | NOTI-05, NOTI-04, Q-P4-17, Q-P4-19 |
| Chống chạy trùng | Một dòng `settings` khóa `job_state`, một lượt/job/ngày Hà Nội, an toàn khi cron và lượt khởi động đua nhau | Q-P4-16, Q-P4-4, Q-06 |
| Helper thông báo | Hàm dùng chung ghi `notifications` (người thuê và nhân sự) + chọn người phụ trách tòa (quản lý đang hoạt động, Boss nếu tòa không có) | NOTI-11, SCOPE-04 |
| Hộp thư nhân sự (BE) | `GET /me/notifications`, `POST /me/notifications/:id/read`, `POST /me/notifications/read-all` cho BOSS/MANAGER (và dùng lại được cho TENANT ở Phase 5) | NOTI-11, NOTI-01, API-02, API-07 |
| Mẫu mail | Các `kind` mới trong `emailTemplate` + danh sách placeholder bắt buộc + lùi về mẫu mặc định | NOTI-07, BE-P4-16 |
| FE (thuộc P4-7) | Chuông hộp thư trong `StaffLayout`: chấm đỏ + số chưa đọc, danh sách thả xuống, đã đọc thì mờ nhưng vẫn mở được | NOTI-11, UI-07, KIT-07 |

### Ngoài phạm vi

| Việc | Ở đâu |
|---|---|
| Trang hộp thư người thuê `/thue/thong-bao`, trang `/ql/thong-bao`, `announcements` (NOTI-01..03) | Phase 5 (các route `/me/notifications` của phần này dùng lại được, không phải viết lại) |
| Dòng `PAYMENT_RECEIVED` cho nhân sự | P4-4 (ghi thu tay) và P4-5 (webhook) **gọi helper của phần này**; phần này chỉ làm helper + test helper |
| `POST /invoices/:id/remind` (nhắc tay, Q-P4-7) | P4-4 — dùng lại cùng mẫu mail và cùng helper `oncePerDay` |
| Push / Zalo / SMS | Không làm (NOTI-11 "không push", D-20, D-25) |
| Thêm nhóm mới vào `GET /dashboard` | Đã xong ở P4-2 (`awaitingReadings.late`, `overdueInvoices`, `expiringContracts`) — **không sửa lại** để không phải cập nhật 5 fake của dashboard (bài học BE-P4-12) |

---

## 2. Kiến trúc

### 2.1 Sơ đồ

```
 cron Asia/Ho_Chi_Minh (ScheduleModule chỉ bật ngoài NODE_ENV=test)          onApplicationBootstrap (bù một lần, D-44/Q-P4-4)
 ───────────────────────────────────────────────────────────────            ──────────────────────────────────────────────
 08:00  LateReadingsJob      ─┐                                             LateReadingsJob.runSafely()   ─┐
 08:00  InvoiceReminderJob   ─┤                                             InvoiceReminderJob.runSafely()─┤
                              │                                                                            │
                              └────────────────► claimDailyRun(db, job, todayHanoi()) ◄───────────────────┘
                                                 src/jobs/job-state.ts
                                                 1 câu UPSERT nguyên tử trên settings['job_state']
                                                 true = hôm nay mình là lượt duy nhất · false = đã chạy

 LateReadingsJob (NOTI-10, chỉ ngày 2..10)            InvoiceReminderJob (NOTI-05, mọi ngày)
 ─────────────────────────────────────────            ───────────────────────────────────────────────────────────
 invoices DRAFT MONTHLY, billingDate < hôm nay        1) UNPAID, dueDate = hôm nay + 1   → chỉ email (Q-P4-17)
 gom theo building + manager                          2) UNPAID, quá hạn n = 1,4,7…      → email + notifications
 phòng · người thuê · thiếu ELECTRIC/WATER            3) contracts ACTIVE, endDate = +30 hoặc +7,
            │                                            nextContract null, settlement null (Q-P4-19, CON-20)
            │                                            → người thuê: email + row · nhân sự: email + row
            ▼                                                        │
 1 mail tiếng Việt cho Boss (LOC-06)                                 ▼
                                   notify() / notifyBuildingStaff()  ─────────────►  notifications
                                   src/modules/notifications/notify.ts                (userId, kind, title,
                                   · oncePerDay: đã có row cùng (userId, kind, link)    body, link, readAt)
                                     tạo trong ngày Hà Nội → bỏ qua
                                   · responsibleStaff(): manager đang hoạt động,
                                     Boss nếu tòa không có (SCOPE-04)
                                                     ▲
                                                     │ P4-4 (ghi thu tay) và P4-5 (webhook) gọi lại
                                                     │ cho PAYMENT_RECEIVED — không viết lại logic

 Hộp thư (NOTI-11)                   NotificationsModule (đã có DashboardController)
 ─────────────────                   ───────────────────────────────────────────────
 FE chuông ──► GET  /me/notifications?unread&page&limit  ──► MyNotificationsService ──► notifications
          ──► POST /me/notifications/:id/read                 (where userId = user.id, SCOPE-03)
          ──► POST /me/notifications/read-all
```

### 2.2 File thêm / sửa

| File | Thêm/Sửa | Việc |
|---|---|---|
| `src/jobs/job-state.ts` (+ `.spec.ts`) | thêm | `claimDailyRun` — một câu SQL nguyên tử trên `settings['job_state']` (Q-P4-16) |
| `src/jobs/late-readings.job.ts` (+ `.spec.ts`) | thêm | NOTI-10, D-42 |
| `src/jobs/invoice-reminder.job.ts` (+ `.spec.ts`) | thêm | NOTI-05 |
| `src/jobs/reminder-rules.ts` (+ `.spec.ts`) | thêm | hàm **thuần**: `isOverdueReminderDay`, `expiringNoticeDays`, `missingReadingKinds` — nơi duy nhất chứa số học ngày |
| `src/modules/notifications/notify.ts` (+ `.spec.ts`) | thêm | `notify`, `notifyBuildingStaff`, `responsibleStaffIds` (SCOPE-04) |
| `src/modules/notifications/my-notifications.controller.ts` | thêm | 3 route `/me/notifications` (controller mỏng) |
| `src/modules/notifications/my-notifications.service.ts` (+ `.spec.ts`) | thêm | truy vấn theo `userId`, đếm chưa đọc, đánh dấu đã đọc |
| `src/modules/notifications/dto/my-notifications.dto.ts` | thêm | `MyNotificationsQueryDto` (`unread?`, `page?`, `limit?` theo API-02) |
| `src/modules/notifications/notifications.module.ts` | sửa | thêm controller + service + 2 job vào `providers`, `imports: [PrismaModule, MailerModule]` |
| `src/modules/mailer/email-templates.ts` (+ `email-templates.spec.ts`) | sửa | 5 `kind` mới, `requiredPlaceholders`, danh sách "chỉ tiếng Việt" (LOC-06) |
| `Source/frontend/src/features/notifications/NotificationBell.tsx`, `useMyNotifications.ts`, `notifications.api.ts` | thêm | chuông (FE-P4-08a) |
| `Source/frontend/src/layouts/StaffLayout.tsx` | sửa | đặt chuông vào slot `action` của `RoomsHeader`, cạnh "Đăng xuất" |
| `Source/frontend/tests/p4/fe08a-notification-bell.test.mjs` | thêm | test chuông |

**Không** thêm module vào `AppModule` (`NotificationsModule` đã có) → `prisma.service.spec.ts` không đổi. **Không** thêm mã lỗi mới → `app.setup.spec.ts` không đổi. **Không** thêm khóa seed (`email_templates` không được seed, `emailTemplate` tự lùi về mẫu mặc định) → `EXPECTED_COUNTS` trong `seed.spec.ts` **không** đổi (bài học BE-P3-18).

### 2.3 Chống chạy trùng — `claimDailyRun` (Q-P4-16)

Một dòng `settings`, `key = 'job_state'`, `value` là JSON `{ "<job>": "YYYY-MM-DD" }` (ngày Hà Nội của lượt chạy gần nhất). Dòng được tạo ở lần chạy đầu tiên, không cần migration, không cần seed.

Hợp đồng của hàm:

```
claimDailyRun(db: PrismaService, job: 'late_readings' | 'invoice_reminders', today: Date): Promise<boolean>
```

Thực hiện bằng **đúng một câu lệnh** `$executeRaw`:

```
INSERT INTO settings (key, value, updated_at) VALUES ('job_state', <{job: date}>::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = jsonb_set(settings.value, ARRAY[<job>], <"date">::jsonb, true), updated_at = now()
WHERE settings.value ->> <job> IS DISTINCT FROM <date>
```

Trả `true` khi số dòng ảnh hưởng = 1, `false` khi = 0.

Vì sao an toàn khi cron 08:00 và lượt khởi động chạy cùng lúc: `ON CONFLICT DO UPDATE` lấy khóa hàng của dòng `job_state`; lượt thứ hai **chờ khóa**, sau đó đánh giá lại `WHERE` trên bản mới nhất, thấy ngày đã bằng hôm nay → 0 dòng → `false`. Không có cửa sổ đọc-rồi-ghi.

Thứ tự trong mỗi job (quan trọng):

1. Lấy danh sách việc cần làm (truy vấn đọc).
2. Danh sách rỗng → chỉ log, **không** claim (để lượt sau trong ngày vẫn thử lại khi dữ liệu đã có).
3. Danh sách không rỗng → `claimDailyRun`. `false` → log "đã chạy hôm nay" và dừng.
4. `true` → ghi `notifications` và gửi mail.

`shortcut:` claim trước khi gửi nên nếu mail lỗi cả hai lần thì ngày đó mất mail (chỉ còn log); đúng với "tối đa một mail/ngày" của NOTI-10, nâng cấp khi chủ dự án muốn gửi lại trong ngày.

### 2.4 Hợp đồng của helper thông báo

```
interface NotifyInput { userId: number; kind: NotificationKind; title: string; body?: string; link?: string }

// Ghi một dòng notifications. oncePerDay = ngày Hà Nội: nếu đã có row cùng (userId, kind, link)
// createdAt trong ngày đó thì không ghi và trả false. Không gửi mail (gửi mail là việc của người gọi, sau commit).
notify(tx: Prisma.TransactionClient, input: NotifyInput, oncePerDay?: Date): Promise<boolean>

// SCOPE-04: buildingId → userId phụ trách (manager của tòa nếu is_active, ngược lại Boss).
responsibleStaffIds(tx: Prisma.TransactionClient, buildingIds: number[]): Promise<Map<number, number>>

// Tiện ích cho P4-4/P4-5: ghi một dòng cho người phụ trách tòa.
notifyBuildingStaff(tx: Prisma.TransactionClient, buildingId: number, input: Omit<NotifyInput, 'userId'>,
  oncePerDay?: Date): Promise<boolean>
```

Dùng lại `viewingBossId(tx)` (`src/modules/viewings/viewing-reservations.ts`) để lấy id Boss — không viết hàm thứ hai cho cùng truy vấn.

`notify` **không** gửi mail và **không** mở transaction: người gọi truyền `tx` của mình (một transaction ngắn cho mỗi sự kiện), gửi mail sau khi commit theo đúng cách `MeterBillingService.deliver` đang làm.

### 2.5 Nội dung dòng `notifications` (lấy nguyên văn bảng của NOTI-05/19-notifications)

| Sự kiện | `kind` | Người nhận | `title` | `link` người thuê | `link` nhân sự |
|---|---|---|---|---|---|
| Hóa đơn quá hạn | `INVOICE_OVERDUE` | người thuê + nhân sự phụ trách | `Hóa đơn TT{id} đã quá hạn {n} ngày` | `/thue/hoa-don/{id}` | **Q-P4-20** |
| Hợp đồng sắp hết hạn | `CONTRACT_EXPIRING` | người thuê + nhân sự phụ trách | `Hợp đồng {code} hết hạn ngày {end_date}` | `/thue/hop-dong/{id}` | **Q-P4-20** |
| Đến hạn ngày mai | – | – | **không ghi row**, chỉ email (Q-P4-17) | – | – |
| Thiếu chỉ số mùng 2→10 | **Q-P4-21** | Boss | `Còn {n} phòng chưa có chỉ số` | – | **Q-P4-20/21** |
| Đã nhận tiền (P4-4/P4-5) | `PAYMENT_RECEIVED` | người thuê + nhân sự phụ trách | `Đã nhận {total} cho hóa đơn TT{id}` | `/thue/hoa-don/{id}` | **Q-P4-20** |

`{end_date}` và mọi ngày trong chữ: `dd/mm/yyyy` (LOC-05). Tiền: `2.984.000 đ` (G-01).

### 2.6 Route hộp thư (NOTI-11, NOTI-01)

Dùng **chính** các route `/me/notifications` mà bảng API của `19-notifications.md` đã ghi cho người thuê, mở thêm cho BOSS/MANAGER. Lý do: dòng `notifications` được địa chỉ hóa theo `user_id`, không cần phạm vi tòa; Phase 5 làm trang `/thue/thong-bao` chỉ việc gọi lại, không phải thêm route. GUEST → `FORBIDDEN` (D-34).

| Method | Path | Vai trò | Query / Body | Trả về | Lỗi |
|---|---|---|---|---|---|
| GET | `/me/notifications` | TENANT, MANAGER, BOSS | `unread?: boolean`, `page?: number ≥ 1`, `limit?: number 1..50` (API-02) | `{ items: MyNotification[], total, page, limit, unreadCount }` | `FORBIDDEN` (GUEST), `VALIDATION_FAILED` |
| POST | `/me/notifications/:id/read` | TENANT, MANAGER, BOSS | – | `{ id, readAt }` | `NOT_FOUND` (row của người khác hoặc không tồn tại) |
| POST | `/me/notifications/read-all` | TENANT, MANAGER, BOSS | – | `{ updated: number }` | `FORBIDDEN` |

```
interface MyNotification { id: number; kind: NotificationKind; title: string; body: string | null;
  link: string | null; readAt: string | null; createdAt: string }
```

- `unreadCount` trả ngay trong payload của GET để chuông có chấm đỏ mà **không** cần route thứ tư; `total` và `items` đọc trong cùng một transaction `RepeatableRead` (đúng mẫu `unpaidDeposits`).
- Thứ tự: `createdAt desc, id desc`. Đã đọc vẫn trả về (NOTI-11 "giữ lại, mở được"); `unread=true` lọc `readAt: null`.
- `read` dùng update có điều kiện `where: { id, userId, readAt: null }`; 0 dòng mà row tồn tại = đã đọc trước đó → trả `readAt` hiện có (không `CONFLICT_STATE`: đọc hai lần là vô hại).
- `Cache-Control: no-store` như các route `/me/*` khác (API-07).
- Đọc mail **không** làm row thành đã đọc và ngược lại — hai kênh tách hẳn (Q-P4-18). Không có mã nào nối hai kênh.

### 2.7 Mẫu mail (BE-P4-16)

Thêm vào `Kind` của `src/modules/mailer/email-templates.ts`; `requiredPlaceholders` là `Record<Kind, …>` nên TypeScript bắt buộc khai báo đủ. Sửa dòng `const locale = kind === 'viewingNew' ? 'vi' : lang` thành một tập `STAFF_ONLY` (nhân sự luôn tiếng Việt, LOC-06).

| `kind` | Người nhận | Ngôn ngữ | Placeholder bắt buộc | Placeholder tùy chọn |
|---|---|---|---|---|
| `lateReadings` | Boss | `vi` (STAFF_ONLY) | `count`, `list` | `date` |
| `invoiceDueTomorrow` | người thuê | `users.locale` | `code`, `total`, `dueDate` | `room`, `building` |
| `invoiceOverdue` | người thuê | `users.locale` | `code`, `total`, `days` | `dueDate`, `room` |
| `contractExpiringTenant` | người thuê | `users.locale` | `code`, `endDate`, `days` | `room`, `building` |
| `contractExpiringStaff` | quản lý / Boss | `vi` (STAFF_ONLY) | theo **Q-P4-22**: bản gộp `count`, `list` · bản từng hợp đồng `code`, `room`, `building`, `tenant`, `endDate`, `days` | `date` |

Lưu ý khi viết mẫu:

- `placeholders` hiện là `/\{([a-zA-Z]+)\}/g` → **chỉ chữ cái**, không đặt tên có số hay `_`.
- `{list}` (nhiều dòng) chỉ được dùng trong `text`, không dùng trong `subject` (subject bị thay `\r\n` bằng khoảng trắng).
- `{list}` của `lateReadings` gom theo tòa: `Tòa {name} – quản lý {fullName}` rồi mỗi dòng `Phòng {code} · {tenant} · thiếu: điện/nước`. **Chỉ** các trường này; không bao giờ đưa CCCD, mã scan, số điện thoại người thuê hay hash mật khẩu vào mail (như `UNPAID_DEPOSIT_SELECT` đang làm).
- Giữ đúng dấu câu đã dùng trong dự án: gạch ngang **en dash** `–` trong tiêu đề (bài học BE-EX-11).
- Khóa idempotency gửi mail: `late-readings-{YYYY-MM-DD}`, `invoice-due-tomorrow-{invoiceId}-{YYYY-MM-DD}`, `invoice-overdue-{invoiceId}-{YYYY-MM-DD}`, `contract-expiring-{contractId}-{days}-{YYYY-MM-DD}`, `contract-expiring-staff-{userId}-{YYYY-MM-DD}`.
- Gửi qua `sendWithRetry` (2 lần, NOTI-07); lỗi → `logger.warn`, job vẫn tiếp tục các mail còn lại.

### 2.8 Chuông nhân sự (FE-P4-08a, thuộc P4-7)

- Vị trí: slot `action` của `RoomsHeader` trong `StaffLayout`, trước nút "Đăng xuất": `<><NotificationBell /><RoomsButton …>Đăng xuất</RoomsButton></>`. Không sửa `RoomsHeader` (không đổi API của kit, không đổi test kit).
- Chỗ đặt mã: `src/features/notifications/` — hiện chỉ một nơi dùng, nên theo đúng câu "component chỉ một feature dùng thì để trong feature" của `Source/frontend/CLAUDE.md`. Khi Phase 5 làm hộp thư người thuê thì chuyển sang `src/components/` theo KIT-07.
- Dựng từ kit: `RoomsButton variant="outline"` làm nút chuông, `ElevatedCard` làm hộp thả xuống, token màu của `rooms.css` cho chấm đỏ. Không thêm palette, không thêm thư viện.
- Dữ liệu: TanStack Query `['my-notifications', { unread: false, page: 1, limit: 10 }]`, `refetchOnWindowFocus` (mặc định) — không push, không polling theo giây (NOTI-11 "chỉ thấy khi đăng nhập").
- Hành vi: chấm đỏ + số khi `unreadCount > 0` (hiện `99+` khi > 99); mở danh sách 10 dòng mới nhất; dòng đã đọc có class mờ nhưng vẫn bấm được; bấm một dòng → `POST …/read` → `invalidateQueries` → điều hướng tới `link` (bỏ qua nếu `link` null); nút "Đánh dấu đã đọc tất cả"; `aria-label` nêu số chưa đọc; đóng bằng `Escape` và khi click ra ngoài. Chữ tiếng Việt, app nhân sự không có tiếng Anh (LOC-01).
- 360 px trước (UI-07): hộp thả xuống rộng tối đa viewport, không tràn ngang.

### 2.9 Schema

**Không migration** cho mọi việc ở trên, **trừ** câu hỏi Q-P4-21 (giá trị enum `NotificationKind` cho sự kiện thiếu chỉ số). Nếu chủ dự án chọn phương án migration thì phải xin duyệt trước khi tạo **và** trước khi áp file, rồi chạy lại `node prisma/check-constraints.mjs . prisma` (gần nhất 107/107) và cập nhật `docs/spec/02-database.md`.

---

## 3. Câu hỏi cho chủ dự án

Phiên chính hỏi cả 4 câu **trong một lượt** trước khi viết mã của checkpoint bị chặn, rồi chép vào bảng §2 của `docs/phase-4-money/README.md`.

**Chủ dự án đã trả lời (22/11/2026):** Q-P4-20 bấm chuông mở popup nhỏ thả xuống kiểu Facebook web, hành vi bấm từng thư chốt ở M7, BE lưu link `/ql/...` theo phương án A [ASSUMPTION] · Q-P4-21 **B** dùng lại `ANNOUNCEMENT`, không migration · Q-P4-22 **A** một mail gộp/ngày · Q-P4-23 **A** mọi hóa đơn UNPAID. M3 chỉ có **một** ⏸ ở CP-6 (BE-P4-17), như file task; CP-1..CP-5 là các bước bên trong.

**Khác với bản vẽ khi làm (22/11/2026):** không có `notify(tx, input, oncePerDay)`; `claimDailyRun` đã chống trùng ở mức job/ngày, nên chỉ có `responsibleStaffIds` + `notifyBuildingStaff` (`src/modules/notifications/notify.ts`). **P4-4/P4-5 lưu ý:** nhắc tay `POST /invoices/:id/remind` (Q-P4-7, tối đa 1 lần/hóa đơn/ngày) phải tự thêm phần chống trùng theo ngày. `limit` của `/me/notifications` dùng giới hạn chung 1..100 (API-02), không phải 1..50. Thư Boss thiếu chỉ số ghi "Còn {n} hóa đơn tháng chờ chỉ số" (đếm hóa đơn nháp, không đếm phòng). `claimDailyRun` chạy là lệnh ghi đầu tiên trong transaction của job để lượt lỗi trả lại ngày.

| Mã | Câu hỏi | Lựa chọn | Đề xuất | Chặn |
|---|---|---|---|---|
| **Q-P4-20** | Bấm vào một thư trong chuông nhân sự thì mở trang nào? Bảng NOTI-05 chỉ cho link của người thuê (`/thue/...`). | **A** dòng của nhân sự dùng link của app nhân sự: quá hạn → `/ql/hoa-don/{id}`, sắp hết hạn → `/ql/hop-dong/{id}`, đã nhận tiền → `/ql/hoa-don/{id}`, thiếu chỉ số → `/ql/chi-so` · **B** dùng chung link `/thue/...` (nhân sự bấm vào sẽ bị guard chặn) · **C** dòng của nhân sự không có link, chỉ là chữ | **A** — các trang đó đều do P4-7 làm; nếu bạn chốt A thì FE-P4-08a làm xong là bấm được ngay | CP-3, CP-5, CP-7 |
| **Q-P4-21** | Sự kiện "thiếu chỉ số mùng 2→10" chưa có giá trị trong enum `NotificationKind` (hiện chỉ có ANNOUNCEMENT, INVOICE_ISSUED, PAYMENT_RECEIVED, INVOICE_OVERDUE, CONTRACT_EXPIRING, REQUEST_UPDATED). NOTI-11 lại ghi sự kiện này có trong hộp thư Boss. | **A** thêm giá trị enum `READINGS_LATE` — **cần migration** (`ALTER TYPE … ADD VALUE`, một dòng, không mất dữ liệu) và phải bạn duyệt trước · **B** dùng lại `ANNOUNCEMENT` với `announcement_id` null — không migration nhưng nhãn/biểu tượng ở FE sẽ sai nghĩa · **C** Phase 4 chỉ gửi mail NOTI-10, không ghi dòng in-app; Boss vẫn thấy ô đỏ "Chờ chỉ số" ở `/ql` (NOTI-06, đã làm ở P4-2) | **A** nếu bạn muốn đúng NOTI-11; **C** nếu bạn muốn tránh migration trong Phase 4 (thông tin không mất, chỉ hiển thị ở ô đỏ thay vì chuông) | CP-2, CP-5 |
| **Q-P4-22** | Mail "hợp đồng sắp hết hạn" cho quản lý: một mail gộp mỗi quản lý mỗi ngày, hay một mail cho mỗi hợp đồng? (Dòng in-app vẫn **một dòng mỗi hợp đồng** để bấm mở từng cái — hai kênh tách nhau theo Q-P4-18.) | **A** một mail gộp/quản lý/ngày, liệt kê mọi hợp đồng tới mốc 30 hoặc 7 ngày · **B** một mail cho mỗi hợp đồng · **C** gộp cho quản lý, tách cho Boss | **A** — giống mail NOTI-10 gộp theo tòa, ít thư rác, tốn ít lượt gửi | CP-3 |
| **Q-P4-23** | Nhắc "đến hạn ngày mai" và "quá hạn" áp cho **loại hóa đơn** nào? NOTI-05 chỉ nói "invoices". | **A** mọi hóa đơn UNPAID có `due_date` (DEPOSIT, MONTHLY, FINAL) · **B** chỉ MONTHLY và FINAL (cọc đã có ô riêng "Cọc chưa thu" ở `/ql`, NOTI-06) · **C** chỉ MONTHLY | **A** — một truy vấn, không bỏ sót tiền; nếu bạn thấy nhắc cọc là làm khách mới e dè thì chọn **B** | CP-3 |

Phụ: bảng cron ở `docs/spec/01-architecture.md` ghi lượt 08:00 còn làm "stale drafts > 2 days; expired unresolved contracts", nhưng **không có luật NOTI nào** cho hai việc này. `[ASSUMPTION]` của phần này: **không gửi mail** cho hai việc đó — chúng đã là nhóm truy vấn của "Việc hôm nay" (NOTI-06: `awaitingReadings.late` từ D-42/NOTI-10 và `expiredContracts` từ CON-21, cả hai đã làm ở P4-2). Phiên chính nêu lại `[ASSUMPTION]` này ở checkpoint và đề nghị sửa một chữ trong bảng cron của spec cho khớp.

`[ASSUMPTION]` khác dùng trong phần này: **A-12/LOC-04** (chữ do người nhập giữ nguyên, chỉ nhãn cố định được dịch); đánh dấu đã đọc hai lần là thành công rỗng (không phải `CONFLICT_STATE`); mail gửi sau khi transaction commit, lỗi mail không hoàn tác dòng `notifications` (đúng NOTI-07 "không bao giờ chặn hành động chính").

---

## 4. Checkpoints

Mỗi ⏸ là điểm dừng: báo cáo (file đã sửa, output thật, cách kiểm tay, `[ASSUMPTION]`, thông điệp commit đề xuất), chủ dự án kiểm và commit, rồi mới tiếp. Trước mỗi checkpoint: cập nhật dòng của mình và thêm một dòng log trong `docs/phase-4-money/PROGRESS.md`; thêm vào `docs/LESSONS.md` lỗi nào đã làm mất một lượt làm lại.

Lệnh dùng ở "Done when" (chạy từ `Source/backend`, ngoại trừ CP-7):

```
npx vitest run <đường dẫn spec>      # một file
npm run lint && npm run test && npm run build
```

### CP-1 · BE-P4-14a (phần 1): `job_state` + helper thông báo

- **Task:** BE-P4-14a (mới) — nền dùng chung, chưa có job nào.
- **File:** `src/jobs/job-state.ts` + `.spec.ts`, `src/jobs/reminder-rules.ts` + `.spec.ts`, `src/modules/notifications/notify.ts` + `.spec.ts`.
- **Done when:** `npx vitest run src/jobs/job-state.spec.ts src/jobs/reminder-rules.spec.ts src/modules/notifications/notify.spec.ts` → tất cả pass, không có file nào khác đổi (`git status` chỉ 6 file mới).
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | `claimDailyRun` lần đầu trong ngày (SQL trả 1 dòng) | Q-P4-16 | `true` |
| 2 | Gọi lại cùng ngày (SQL trả 0 dòng) | Q-P4-16 | `false` |
| 3 | Câu SQL sinh ra chứa `ON CONFLICT (key) DO UPDATE`, `IS DISTINCT FROM` và đúng một câu lệnh | Q-P4-16 | khớp — đây là bằng chứng offline cho tính nguyên tử; ca đua thật chạy ở QA-P4-03 trên DB dev |
| 4 | Ngày truyền vào là `todayHanoi()`, định dạng `YYYY-MM-DD` | LOC-05, G-02 | khóa JSON đúng ngày Hà Nội, không phải UTC |
| 5 | `isOverdueReminderDay(dueDate, today)` với n = 1, 4, 7, 10 | NOTI-05 | `true` |
| 6 | n = 0 (đúng hạn), 2, 3, 5, 6 | NOTI-05 | `false` |
| 7 | `due_date` = 31/10, hôm nay 30/10 (đến hạn ngày mai) | NOTI-05 | `n = −1` → không phải ngày quá hạn |
| 8 | `expiringNoticeDays(endDate, today)` với end − today = 30, 7 | NOTI-05 | `30`, `7` |
| 9 | end − today = 29, 8, 6, 0, −1 | NOTI-05 | `null` (chỉ khớp đúng hai mốc) |
| 10 | Năm nhuận: hôm nay 30/01/2028, hạn 29/02/2028 | BIL-22, G-02 | 30 ngày → nhắc đúng mốc 30 |
| 11 | `notify` với `oncePerDay` khi đã có row cùng `(userId, kind, link)` tạo hôm nay | NOTI-05 | `false`, `notification.create` **không** được gọi |
| 12 | Cùng `(userId, kind, link)` nhưng row tạo hôm qua | NOTI-05 | `true`, ghi row mới |
| 13 | `responsibleStaffIds` — tòa có quản lý `is_active = true` | SCOPE-04 | map tới id quản lý |
| 14 | Tòa có quản lý `is_active = false` | SCOPE-04, AUTH | map tới id Boss |
| 15 | Tòa `manager_id` null | SCOPE-04, BLD-04 | map tới id Boss |
| 16 | Nhiều tòa cùng lúc (quản lý A, quản lý khóa, không quản lý) | SCOPE-04 | một truy vấn, map đủ 3 khóa |

### CP-2 · BE-P4-14: job 08:00 mail thiếu chỉ số (NOTI-10)

- **File:** `src/jobs/late-readings.job.ts` + `.spec.ts`; `src/modules/notifications/notifications.module.ts` (sửa); `src/modules/mailer/email-templates.ts` + spec (thêm `lateReadings`).
- **Chặn bởi:** Q-P4-21 (có ghi dòng in-app cho Boss hay không) và Q-P4-20 (link).
- **Done when:** `npx vitest run src/jobs/late-readings.job.spec.ts src/modules/mailer/email-templates.spec.ts` pass; `npm run build` pass. Kiểm tay: đặt `NODE_ENV=development` và gọi `job.run(new Date('2026-11-02T01:00:00Z'))` trong một script tạm ở scratchpad → console mailer in đúng một mail tiếng Việt.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | Hôm nay mùng 2, có 1 draft quá ngày thu | NOTI-10, D-42 | gửi đúng **một** mail cho Boss |
| 2 | Hôm nay mùng 10, vẫn còn draft | NOTI-10 | gửi |
| 3 | Hôm nay mùng 11 | NOTI-10 | **không** gửi, không claim, log một dòng |
| 4 | Hôm nay mùng 1 | D-40, D-42 | **không** gửi (mùng 1 là ngày phát hành, chưa muộn) |
| 5 | Chạy hai lần trong cùng ngày (cron + lượt khởi động) | Q-P4-16, NOTI-10 | **một** mail; lượt hai log "đã chạy hôm nay" |
| 6 | Danh sách rỗng | NOTI-10 | không gửi, chỉ log, **không** claim (lượt sau trong ngày vẫn thử lại) |
| 7 | Boss không có `email` | NOTI-10, NOTI-04 | không gửi, chỉ log; không ném lỗi |
| 8 | Draft còn sót từ tháng trước | NOTI-10 | có trong danh sách |
| 9 | Draft có `billingDate` = hôm nay (chưa quá một ngày trọn) | NOTI-10 | **không** có trong danh sách |
| 10 | Tòa `PER_M3` thiếu nước, đã có điện | MTR-06, NOTI-10 | dòng ghi "thiếu: nước" |
| 11 | Tòa `PER_PERSON` thiếu điện | MTR-06 | dòng ghi "thiếu: điện"; **không** bao giờ đòi nước |
| 12 | Hai tòa, hai quản lý | NOTI-10 | mail gom theo tòa, mỗi tòa nêu tên quản lý |
| 13 | Tòa không có quản lý đang hoạt động | SCOPE-04 | vẫn liệt kê; phần quản lý ghi Boss |
| 14 | Ngôn ngữ | LOC-06 | tiếng Việt kể cả khi `users.locale` của Boss là `en` |
| 15 | Mail lỗi lần 1, thành công lần 2 | NOTI-07 | gửi 2 lần, không ném lỗi ra ngoài |
| 16 | Mail lỗi cả 2 lần | NOTI-07 | `logger.warn`, job trả về bình thường, app không sập |
| 17 | Truy vấn lỗi | D-21 | `runSafely` log `error`, không ném; lượt sau thử lại |
| 18 | Nội dung mail | NOTI-10, G-04 | chỉ có mã phòng, tên người thuê, thiếu gì; **không** có CCCD, số CMND, mã scan |
| 19 | `onApplicationBootstrap` khi `NODE_ENV=test` | bài học BE-P3-02 | không chạy gì |

### CP-3 · BE-P4-15: job 08:00 nhắc hóa đơn và hợp đồng (NOTI-05)

- **File:** `src/jobs/invoice-reminder.job.ts` + `.spec.ts`; `email-templates.ts` + spec (thêm `invoiceDueTomorrow`, `invoiceOverdue`, `contractExpiringTenant`, `contractExpiringStaff`); `notifications.module.ts` (sửa).
- **Chặn bởi:** Q-P4-20, Q-P4-22, Q-P4-23.
- **Done when:** `npx vitest run src/jobs/invoice-reminder.job.spec.ts` pass; `npm run lint` pass.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | Hóa đơn hạn **31/10**, hôm nay **30/10** | NOTI-05 | gửi mail "đến hạn ngày mai" |
| 2 | Cùng hóa đơn, ca 1 | Q-P4-17 | **không** ghi dòng `notifications` (chỉ email) |
| 3 | Hôm nay 29/10 hoặc 31/10 | NOTI-05 | không nhắc "ngày mai" |
| 4 | Quá hạn ngày 1, ngày 4, ngày 7 | NOTI-05 | nhắc, mỗi lần một mail + **một** dòng `INVOICE_OVERDUE` |
| 5 | Quá hạn ngày 2, ngày 3 | NOTI-05 | **không** nhắc |
| 6 | Tiêu đề dòng quá hạn ngày 4 | NOTI-05 (bảng) | `Hóa đơn TT{id} đã quá hạn 4 ngày`, link `/thue/hoa-don/{id}` |
| 7 | Hóa đơn đã `PAID` / `CANCELLED` / `SETTLED` | NOTI-05 | không nhắc |
| 8 | Hóa đơn `DRAFT` | D-42 | không nhắc (người thuê chưa thấy draft) |
| 9 | Hợp đồng `end_date` = hôm nay + 30 và + 7 | NOTI-05, CON-20 | mỗi mốc: mail + một dòng `CONTRACT_EXPIRING` cho người thuê **và** cho nhân sự phụ trách |
| 10 | `end_date` = hôm nay + 29 / + 8 | NOTI-05 | không nhắc |
| 11 | Hợp đồng đã có `nextContract` (gia hạn) | Q-P4-19, CON-20 | **không** nhắc, không mail, không dòng |
| 12 | Hợp đồng đã có `settlement` | Q-P4-19, CON-20 | **không** nhắc |
| 13 | Hợp đồng không `ACTIVE` (HOLD/ENDED/CANCELLED) | CON-20 | không nhắc |
| 14 | Người thuê không có `email` | NOTI-04 | **không** mail; vẫn ghi dòng in-app |
| 15 | Người thuê `locale = 'en'` | LOC-06 | mail tiếng Anh |
| 16 | Quản lý `locale = 'en'` | LOC-06 | mail nhân sự vẫn **tiếng Việt** |
| 17 | Tòa không có quản lý đang hoạt động | SCOPE-04, Q-P4-18 | Boss nhận mail và dòng in-app |
| 18 | Chạy hai lần cùng ngày | Q-P4-16, NOTI-05 | không nhắc trùng: một mail, một dòng mỗi sự kiện |
| 19 | Lượt khởi động khi hôm nay chưa chạy | Q-P4-4, D-44 | chạy một lần |
| 20 | Lượt khởi động khi hôm nay đã chạy | Q-P4-4 | không gửi gì |
| 21 | Hôm qua server tắt cả ngày | Q-P4-4, Q-06 | **không** bù ngày đã mất; chỉ xử lý ngày hôm nay |
| 22 | Hợp đồng/hóa đơn của tòa khác | SCOPE-04 | dòng và mail đi tới đúng người phụ trách tòa đó, không gửi chéo |
| 23 | Một mail lỗi giữa danh sách 3 người | NOTI-07 | hai người còn lại vẫn nhận; lỗi được log |
| 24 | Tháng cuối tháng: hạn 30/11, hôm nay 29/11 | BIL-01, D-40 | nhắc ngày mai đúng, không lệch múi giờ |

### CP-4 · BE-P4-16: mẫu mail và placeholder bắt buộc

- **File:** `src/modules/mailer/email-templates.ts`, `email-templates.spec.ts` (chốt danh sách `kind` và `requiredPlaceholders`).
- **Done when:** `npx vitest run src/modules/mailer/email-templates.spec.ts` pass; `npx vitest run prisma/seed.spec.ts` vẫn pass (chứng minh **không** đổi `EXPECTED_COUNTS` vì không seed khóa mới).
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | Danh sách `kind` và placeholder bắt buộc khớp bảng §2.7 | NOTI-07 | khớp đúng từng khóa (test đọc danh sách, không đọc mã sinh mẫu) |
| 2 | Không có `settings.email_templates` | NOTI-07 | dùng mẫu mặc định, mail vẫn gửi được |
| 3 | Mẫu tùy biến đủ placeholder bắt buộc | NOTI-07 | dùng mẫu tùy biến |
| 4 | Mẫu tùy biến **thiếu** `{total}` của `invoiceOverdue` | NOTI-07, bài học BE-EX-29 | lùi về mẫu mặc định |
| 5 | Mẫu tùy biến có placeholder lạ `{foo}` | NOTI-07 | lùi về mẫu mặc định |
| 6 | `subject` hoặc `text` rỗng/chỉ khoảng trắng | NOTI-07 | lùi về mẫu mặc định |
| 7 | `lateReadings` với `lang = 'en'` | LOC-06 | trả bản `vi` (STAFF_ONLY) |
| 8 | `contractExpiringStaff` với `lang = 'en'` | LOC-06 | trả bản `vi` |
| 9 | `invoiceOverdue` với `lang = 'en'` nhưng chưa có bản `en` | LOC-04 | lùi về bản `vi`, không bao giờ hiện khóa thô |
| 10 | `{list}` nhiều dòng | NOTI-07 | giữ `\n` trong `text`; `subject` không có ký tự xuống dòng |
| 11 | Tiền và ngày trong mẫu mặc định | G-01, LOC-05 | `2.984.000 đ`, `dd/mm/yyyy` |

### CP-5 · BE-P4-14b: route hộp thư (NOTI-11)

- **Task:** BE-P4-14b (mới).
- **File:** `src/modules/notifications/my-notifications.controller.ts`, `my-notifications.service.ts` + `.spec.ts`, `dto/my-notifications.dto.ts`, `notifications.module.ts` (sửa).
- **Chặn bởi:** Q-P4-20 (link) — nhưng chỉ chặn nội dung, không chặn route.
- **Done when:** `npx vitest run src/modules/notifications` pass (gồm cả 5 spec dashboard cũ — nếu fake thiếu bảng `notification` thì bổ sung, bài học BE-P4-12); kiểm tay: đăng nhập Boss, `GET /api/v1/me/notifications` trả `unreadCount` đúng số dòng chưa đọc trong DB dev.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi (nguồn: spec) |
|---|---|---|---|
| 1 | BOSS gọi GET | NOTI-11 | 200, `items` là dòng của chính Boss |
| 2 | MANAGER gọi GET | NOTI-11 | 200, chỉ dòng của chính mình |
| 3 | TENANT gọi GET | NOTI-01 | 200, chỉ dòng của chính mình (Phase 5 dùng lại) |
| 4 | GUEST gọi GET | NOTI-01, D-34 | `FORBIDDEN` |
| 5 | Không đăng nhập | API-07 | 401 |
| 6 | Dòng của người khác lọt vào query? | SCOPE-03 | `findMany` được gọi **với** `userId = user.id` (assert chính lời gọi, bài học BE-EX-08) |
| 7 | `unread=true` | NOTI-11 | chỉ dòng `readAt = null` |
| 8 | Dòng đã đọc | NOTI-11 | **vẫn** trả về khi không lọc, kèm `readAt` (không xóa, không ẩn) |
| 9 | Thứ tự | NOTI-11 | `createdAt` giảm, rồi `id` giảm |
| 10 | `unreadCount` | NOTI-11 | đếm toàn bộ dòng chưa đọc, không bị `limit` cắt |
| 11 | `limit=0`, `limit=51`, `page=0` | API-02 | `VALIDATION_FAILED` |
| 12 | Trang 2 | API-02 | `total` không đổi, `items` khác trang 1 |
| 13 | Không có dòng nào | NOTI-11 | `{ items: [], total: 0, unreadCount: 0 }` |
| 14 | `POST :id/read` dòng của mình chưa đọc | NOTI-11 | `readAt` được đặt, dòng **không** bị xóa |
| 15 | `POST :id/read` lần hai | NOTI-11 | thành công, `readAt` giữ nguyên giá trị lần đầu |
| 16 | `POST :id/read` dòng của người khác | SCOPE-03 | `NOT_FOUND` (không `FORBIDDEN`, không tiết lộ dòng tồn tại) |
| 17 | `POST :id/read` id không tồn tại | API | `NOT_FOUND` |
| 18 | `POST read-all` | NOTI-11 | chỉ dòng của mình thành đã đọc, trả `updated`; gọi lần hai trả `updated: 0` |
| 19 | Đọc mail không làm dòng in-app thành đã đọc | Q-P4-18, NOTI-11 | không có đường nào từ mailer tới `readAt` (test tĩnh: `my-notifications.service.ts` không import mailer) |
| 20 | Header | API-07 | `Cache-Control: no-store` |

### CP-6 · BE-P4-17 ⏸ (kết phần P4-3)

- **Done when:** output thật của `npm run lint`, `npm run test`, `npm run build` (từ `Source/backend`) dán vào báo cáo; reviewer chạy trên thay đổi chưa commit và báo cáo đầy đủ nằm trong checkpoint; `[ASSUMPTION]` của §3 được nêu lại; `PROGRESS.md` và `LESSONS.md` đã cập nhật.
- Không chạy e2e ở phần này; ca đua `claimDailyRun` thật (hai kết nối cùng claim một ngày → đúng một `true`) được thêm vào **QA-P4-03**.
- Thông điệp commit đề xuất: `feat(notifications): 08:00 late-readings and invoice reminder jobs, job_state dedup, staff inbox routes (BE-P4-14, BE-P4-14a, BE-P4-14b, BE-P4-15..17, NOTI-04, NOTI-05, NOTI-07, NOTI-10, NOTI-11, LOC-06, D-42, D-44, Q-P4-16..19)`.

### CP-7 · FE-P4-08a: chuông hộp thư nhân sự (thêm vào `feature_p4-7-frontend-staff.md`)

Task mới, đặt **sau** FE-P4-08 và **trước** checkpoint FE-P4-09, giữ nguyên mọi mã task đang có. Cần: CP-5 đã commit.

- **File:** `src/features/notifications/{NotificationBell.tsx,useMyNotifications.ts,notifications.api.ts}`, `src/layouts/StaffLayout.tsx` (sửa), `tests/p4/fe08a-notification-bell.test.mjs`.
- **Done when:** từ `Source/frontend`: `npm run lint`, `npm run build`, `npm run test:components` đều pass (chạy lại một lượt nếu có ca nhạy thời gian, bài học 13/11); kiểm tay ở 360 px: chấm đỏ có số, mở danh sách, bấm một dòng thì mở đúng trang và chấm giảm.
- **Cần sửa theo bài học:** mọi test đang mount `StaffLayout` phải trả lời URL `/me/notifications` trong fake `fetch` (bài học FE-EX-18..20) và loader kit thủ công của `auth-login-flow.test.mjs` phải nạp component mới nếu nó dùng kit (bài học FE-EX-09). Menu nhân sự **không** đổi → các mảng menu mong đợi giữ nguyên; route **không** đổi → test đọc `routes[0..2]` giữ nguyên.
- **Kịch bản test**

| # | Ca | Mã | Kết quả mong đợi |
|---|---|---|---|
| 1 | `unreadCount = 3` | NOTI-11 | chuông có chấm đỏ và chữ `3`, `aria-label` nêu "3 thông báo chưa đọc" |
| 2 | `unreadCount = 0` | NOTI-11 | **không** chấm đỏ, chuông vẫn bấm được |
| 3 | `unreadCount = 150` | NOTI-11 | hiện `99+` |
| 4 | Mở danh sách | NOTI-11 | 10 dòng mới nhất, dòng `readAt != null` có class mờ nhưng vẫn là nút bấm được |
| 5 | Bấm một dòng chưa đọc | NOTI-11 | gọi `POST /me/notifications/{id}/read` **một** lần, sau đó điều hướng tới `link` |
| 6 | Bấm một dòng đã đọc | NOTI-11 | vẫn điều hướng, không gọi lại `read` |
| 7 | Dòng `link = null` | NOTI-11 | đánh dấu đã đọc, không điều hướng |
| 8 | "Đánh dấu đã đọc tất cả" | NOTI-11 | gọi `read-all` một lần, chấm đỏ mất |
| 9 | API lỗi | UI-05 | hiện `error.message` của API trong hộp thả xuống, không làm trắng trang nhân sự |
| 10 | `Escape` và click ra ngoài | UI-09 | đóng hộp, focus về nút chuông |
| 11 | 360 px | UI-07 | hộp thả xuống không tràn ngang |
| 12 | Chữ | LOC-01 | tiếng Việt, không có khóa thô, không có chuỗi tiếng Anh |
| 13 | Người thuê / khách | NOTI-11 | chuông chỉ có trong `StaffLayout`; `TenantLayout` và `PublicLayout` không đổi |

---

## 5. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| **Claim rồi gửi lỗi → mất mail của ngày đó** | Chỉ claim khi danh sách không rỗng; lỗi gửi được log rõ (`logger.warn` kèm số lượng); chủ dự án vẫn thấy việc ở ô đỏ `/ql` (NOTI-06). Ghi `shortcut:` ngay trên hàm |
| **Cron và lượt khởi động đua nhau** | `claimDailyRun` là một câu `INSERT … ON CONFLICT DO UPDATE … WHERE`, khóa hàng của Postgres quyết định; test SQL offline + ca đua thật ở QA-P4-03 |
| **Spam mail** khi một ngày có nhiều hợp đồng tới mốc | Q-P4-22 (đề xuất gộp theo quản lý); mail người thuê vẫn một hóa đơn/một mail vì đó là tiền của họ |
| **Nhầm múi giờ** làm nhắc sai ngày | Mọi "hôm nay", "ngày mai", "mùng 2", "mùng 10" đi qua `todayHanoi()`/`addDays`; test các mốc cuối tháng (30/10, 29/11), mùng 1, mùng 11 và 2028 nhuận |
| **Rò dữ liệu riêng tư trong mail nhân sự** | Chỉ chọn trường hiển thị (mã phòng, tên, mã hợp đồng, số tiền), theo mẫu `UNPAID_DEPOSIT_SELECT`; test ca 18 của CP-2 |
| **Migration ngoài dự kiến** (Q-P4-21) | Mặc định không migration; nếu chủ dự án chọn A thì xin duyệt trước khi tạo và trước khi áp, rồi chạy lại `check-constraints.mjs` (gần nhất 107/107) và cập nhật `02-database.md` + bảng enum của `docs/spec/02-database.md` |
| **Test danh sách cố định vỡ** | `email-templates.spec.ts` (danh sách `kind`), 5 fake của dashboard (bảng `notification`), fake `fetch` của các test mount `StaffLayout`. Không thêm module vào `AppModule`, không thêm mã lỗi, không thêm khóa seed → `prisma.service.spec.ts`, `app.setup.spec.ts`, `seed.spec.ts` **không** đổi |
| **Spec bảng cron nói nhiều hơn NOTI-05** | `[ASSUMPTION]` ở §3; đề nghị chủ dự án sửa một chữ trong `01-architecture.md` thay vì viết thêm mail không có luật |
| **Job nào ném lỗi làm sập app** | Theo đúng mẫu `MonthlyInvoiceJob.runSafely`: bắt lỗi, log `error`, không ném; test ca 17 của CP-2 |
| **Spec nào boot `AppModule` có thể gửi mail thật** | Ghi đè `MailerService` trong mọi spec mới boot `AppModule`; hai config vitest đã đặt `MAIL_PROVIDER: ''` — giữ nguyên (bài học EX-8) |

---

## 6. Ma trận luật → checkpoint

| Luật | CP |
|---|---|
| Q-P4-16 (`job_state`), SCOPE-04 (helper) | CP-1 |
| NOTI-10, D-42, NOTI-07 (thử lại), LOC-06 (mail nhân sự) | CP-2 |
| NOTI-05, NOTI-04, Q-P4-4/Q-06, Q-P4-17, Q-P4-19, CON-20, LOC-06 (mail người thuê) | CP-3 |
| NOTI-07 (mẫu + placeholder bắt buộc), LOC-04 | CP-4 |
| NOTI-11, NOTI-01, API-02, API-07, SCOPE-03 | CP-5 |
| Toàn bộ phần (lint/test/build + reviewer) | CP-6 |
| NOTI-11 (chuông), UI-05, UI-07, UI-09, LOC-01, KIT-07 | CP-7 (P4-7) |
| `PAYMENT_RECEIVED` cho nhân sự | P4-4 / P4-5 gọi `notifyBuildingStaff` của CP-1 |
| Trang `/thue/thong-bao`, `/ql/thong-bao`, NOTI-02, NOTI-03 | Phase 5 (dùng lại route của CP-5) |
