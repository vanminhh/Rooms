# 19 · Notifications and reminders

Modules: `notifications`, `mailer`. Tables: `announcements`, `notifications`.

## In-app inbox

- **NOTI-01** Every tenant has one inbox (`notifications`) that holds both staff announcements and system events. FE shows unread count; tapping opens `link`. The link's page checks the reader's rights itself. Guests have no inbox (owner 12/11/2026, D-34).
- **NOTI-02** Announcement scope: one room (`room_id` + its `building_id`), one building, or all buildings (`building_id` null, Boss only). Managers only within scope.
- **NOTI-03** Sending an announcement inserts one `notifications` row per tenant with an ACTIVE contract in scope (unique per announcement and user). Staff see "đã đọc / tổng".

| Event | `kind` | Text (Vietnamese) | Link |
|---|---|---|---|
| Invoice issued | `INVOICE_ISSUED` | "Hóa đơn {kỳ} phòng {room}: {total}" | `/thue/hoa-don/{id}` |
| Payment received | `PAYMENT_RECEIVED` | "Đã nhận {total} cho hóa đơn TT{id}" | `/thue/hoa-don/{id}` |
| Invoice overdue | `INVOICE_OVERDUE` | "Hóa đơn TT{id} đã quá hạn {n} ngày" | `/thue/hoa-don/{id}` |
| Contract expiring | `CONTRACT_EXPIRING` | "Hợp đồng {code} hết hạn ngày {end_date}" | `/thue/hop-dong/{id}` |
| Request updated | `REQUEST_UPDATED` | "Yêu cầu “{title}”: {status}" | `/thue/yeu-cau/{id}` |
| Announcement | `ANNOUNCEMENT` | announcement title | `/thue/thong-bao` |

## Email

- **NOTI-04** Emails are sent only to users with `email`. In-app always.
- **NOTI-05** 08:00 cron: invoices due tomorrow; overdue invoices on day 1, 4, 7, … after `due_date` (every 3 days); contracts with `end_date` in 30 or 7 days (tenant and manager). These rules match one exact day, so a day the 08:00 run is missed skips that day's reminders; whether to catch them up is [OPEN] Q-06.
- **NOTI-06** Staff tasks ("Việc hôm nay") are queries, not notifications: drafts waiting for readings (red from the 2nd of the month, D-40, NOTI-10), billing periods more than 7 days past their billing date with no invoice (BIL-05, red, with the button "Tạo hóa đơn kỳ này", BIL-21), unpaid deposits, NEW viewings (VIEW-07), with overdue NEW marked (VIEW-17) and open NEW/CONFIRMED capacity or cross-building conflicts marked (VIEW-22); up to 3 distinct guests in the same building/hour are valid, PENDING requests, escalated payment issues (Boss), contracts expiring in 30 days, expired unresolved contracts (red), pending price approvals (Boss).
  Phase 2 implements only two groups (owner 01/11/2026): "Lịch hẹn mới" (VIEW-07) for everyone and "Giá chờ duyệt" (PRC-11) for Boss. The other groups are added to the same `GET /dashboard` in later phases. The endpoint lives in the `notifications` module (`dashboard.controller.ts`).

  Phase 3 adds `depositCancelledViewings` for viewings cancelled by a HOLD and awaiting a call (VIEW-06, D-39). The group counts all unresolved calls of the building's current active manager, or of Boss for buildings without one (SCOPE-04). `buildingId` narrows the group within scope. `items` shows up to five viewings.

  Phase 3 also adds `unpaidDeposits: { count, items }` for every `DEPOSIT` invoice whose status is `UNPAID`, including deposits due in the future. Responsibility follows the building's current active manager; Boss receives buildings without an active manager (SCOPE-04). `buildingId` narrows this group within the request's scope. `count` includes every matching invoice; `items` contains at most five, ordered by `dueDate` ascending then invoice id ascending. A paid, cancelled, draft or settled invoice no longer appears; no contract-status or overdue-only filter is applied.

  Each unpaid-deposit item is `{ id, code: "TT" + id, total, dueDate, contract: { id, code, room: { id, code }, building: { id, code, name }, tenant: { id, fullName, phone } } }`. `dueDate` uses `YYYY-MM-DD` (or null for an unavailable date); money stays integer đồng. The query selects only these display fields, never CCCD, scan identifiers, password hashes or temporary passwords. Count and first-five items are read in the same repeatable-read transaction.
- **NOTI-07** Email templates live in `settings.email_templates`; failures are logged and retried once, never block the main action.
- **NOTI-08** Viewing emails (owner 12/11/2026, D-34; Phase Extra EX-6 and EX-8). There are exactly two: the new-booking email to the person responsible ([13-viewings.md](13-viewings.md) VIEW-19) and the confirmation email a staff member sends to the guest with a button (VIEW-15). Both follow NOTI-07, except that a failed confirmation email is shown to the staff member and leaves the viewing unconfirmed. Guests get no inbox notification and no reminder.
- **NOTI-10** Late readings (owner 16/11/2026, D-42; Phase 4): every day at **08:00** from the 2nd to the 10th of the month, every MONTHLY `DRAFT` whose billing date has passed by at least one full day and that is still not issued (including drafts left from earlier months) is listed in one email to Boss, grouped by building with its manager: room, tenant, which readings are missing. No email when the list is empty or Boss has no email (logged); at most one email per day. If the 08:00 run was missed because the server was down, the app sends that day's email when it starts again, still only up to the 10th. **After the 10th no more emails are sent** for that month; the rooms stay red in "Việc hôm nay" (NOTI-06) until the manager enters the readings and the invoice is issued. Tenants see nothing until the invoice is issued (DRAFT is hidden from tenants). A send failure is logged and retried once (NOTI-07). Vietnamese only (LOC-06).

Deferred: Zalo messages (D-20).

## API

| Method | Path | Who |
|---|---|---|
| GET | `/me/notifications?unread` | tenant |
| POST | `/me/notifications/:id/read` · `/read-all` | tenant |
| GET/POST | `/announcements` | staff in scope |
| GET | `/dashboard?buildingId` | staff – "Việc hôm nay" counts + lists |
