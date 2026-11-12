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
- **NOTI-06** Staff tasks ("Việc hôm nay") are queries, not notifications: drafts waiting for readings (drafts older than 2 days highlighted), billing periods more than 7 days past their billing date with no invoice (BIL-05, red, with the button "Tạo hóa đơn kỳ này", BIL-21), unpaid deposits, NEW viewings (VIEW-07), with those past their start time and those sharing an hour marked (VIEW-17, VIEW-22), PENDING requests, escalated payment issues (Boss), contracts expiring in 30 days, expired unresolved contracts (red), pending price approvals (Boss).
  Phase 2 implements only two groups (owner 01/11/2026): "Lịch hẹn mới" (VIEW-07) for everyone and "Giá chờ duyệt" (PRC-11) for Boss. The other groups are added to the same `GET /dashboard` in later phases. The endpoint lives in the `notifications` module (`dashboard.controller.ts`).
- **NOTI-07** Email templates live in `settings.email_templates`; failures are logged and retried once, never block the main action.
- **NOTI-08** Viewing emails (owner 12/11/2026, D-34; Phase Extra EX-6 and EX-8). There are exactly two: the new-booking email to the person responsible ([13-viewings.md](13-viewings.md) VIEW-19) and the confirmation email a staff member sends to the guest with a button (VIEW-15). Both follow NOTI-07, except that a failed confirmation email is shown to the staff member and leaves the viewing unconfirmed. Guests get no inbox notification and no reminder.

Deferred: Zalo messages (D-20).

## API

| Method | Path | Who |
|---|---|---|
| GET | `/me/notifications?unread` | tenant |
| POST | `/me/notifications/:id/read` · `/read-all` | tenant |
| GET/POST | `/announcements` | staff in scope |
| GET | `/dashboard?buildingId` | staff – "Việc hôm nay" counts + lists |
