# 19 · Notifications and reminders

Modules: `notifications`, `mailer`. Tables: `announcements`, `notifications`.

## In-app inbox

- **NOTI-01** Every tenant has one inbox (`notifications`) that holds both staff announcements and system events. FE shows unread count; tapping opens `link`.
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
- **NOTI-05** 08:00 cron: invoices due tomorrow; overdue invoices on day 1, 4, 7, … after `due_date` (every 3 days); contracts with `end_date` in 30 or 7 days (tenant and manager).
- **NOTI-06** Staff tasks ("Việc hôm nay") are queries, not notifications: drafts waiting for readings (drafts older than 2 days highlighted), unpaid deposits, NEW viewings, PENDING requests, escalated payment issues (Boss), contracts expiring in 30 days, expired unresolved contracts (red), pending price approvals (Boss).
- **NOTI-07** Email templates live in `settings.email_templates`; failures are logged and retried once, never block the main action.

Deferred: Zalo messages (D-20).

## API

| Method | Path | Who |
|---|---|---|
| GET | `/me/notifications?unread` | tenant |
| POST | `/me/notifications/:id/read` · `/read-all` | tenant |
| GET/POST | `/announcements` | staff in scope |
| GET | `/dashboard?buildingId` | staff – "Việc hôm nay" counts + lists |
