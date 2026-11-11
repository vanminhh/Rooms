# 19 · Notifications and reminders

Modules: `notifications`, `mailer`. Tables: `announcements`, `notifications`.

## In-app inbox

- **NOTI-01** Every guest and tenant has one inbox (`notifications`) that holds both staff announcements and system events. FE shows unread count; tapping opens `link`. The link's page checks the reader's rights itself; a link never opens another person's data. (Guests added 12/11/2026, D-34. Phase Extra part EX-8 builds the inbox for the viewing events below; the tenant events and announcements stay in Phase 5.)
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
| Viewing confirmed | `VIEWING_CONFIRMED` | "Lịch xem phòng {room} đã được xác nhận: {giờ} ngày {ngày}" | `/toi/lich-hen/{id}` |
| New time proposed by staff | `VIEWING_PROPOSED` | "Quản lý đề xuất giờ khác cho lịch xem phòng {room}: {giờ} ngày {ngày}" | `/toi/lich-hen/{id}` |
| Proposal rejected by staff | `VIEWING_PROPOSAL_REJECTED` | "Giờ bạn đề xuất cho phòng {room} chưa được chấp nhận" | `/toi/lich-hen/{id}` |
| Viewing cancelled by staff or by a deposit on the room | `VIEWING_CANCELLED` | "Lịch xem phòng {room} đã hủy: {lý do}" | `/toi/lich-hen/{id}` |
| Reminder | `VIEWING_REMINDER` | "Nhắc lịch: xem phòng {room} lúc {giờ} ngày {ngày}" | `/toi/lich-hen/{id}` |

## Email

- **NOTI-04** Emails are sent only to users with `email`. In-app always.
- **NOTI-05** 08:00 cron: invoices due tomorrow; overdue invoices on day 1, 4, 7, … after `due_date` (every 3 days); contracts with `end_date` in 30 or 7 days (tenant and manager). These rules match one exact day, so a day the 08:00 run is missed skips that day's reminders; whether to catch them up is [OPEN] Q-06.
- **NOTI-06** Staff tasks ("Việc hôm nay") are queries, not notifications: drafts waiting for readings (drafts older than 2 days highlighted), billing periods more than 7 days past their billing date with no invoice (BIL-05, red, with the button "Tạo hóa đơn kỳ này", BIL-21), unpaid deposits, viewings waiting for staff (NEW, or a pending proposal from the guest, VIEW-07), NEW viewings past their requested time and confirmed viewings that overlap (VIEW-17, VIEW-23), PENDING requests, escalated payment issues (Boss), contracts expiring in 30 days, expired unresolved contracts (red), pending price approvals (Boss).
  Phase 2 implements only two groups (owner 01/11/2026): "Lịch hẹn mới" (VIEW-07) for everyone and "Giá chờ duyệt" (PRC-11) for Boss. The other groups are added to the same `GET /dashboard` in later phases. The endpoint lives in the `notifications` module (`dashboard.controller.ts`).
- **NOTI-07** Email templates live in `settings.email_templates`; failures are logged and retried once, never block the main action.
- **NOTI-08** Viewing events (owner 12/11/2026, D-34; Phase Extra EX-8). The guest who owns the viewing gets the events in the table above, in the account and by email when they have one [ASSUMPTION A-15], in their language (LOC-06). The guest is not notified of their own actions. The person responsible (VIEW-07) sees the guest's actions (new booking, proposal, acceptance, rejection, cancel) as tasks in "Việc hôm nay" (NOTI-06) and gets an email when they have one. A viewing without an owner account (manual, not claimed) notifies no guest. Each event creates at most one notification: repeating the same request does not create a second one.
- **NOTI-09** Reminders (D-34): 24 hours and 2 hours before the time in effect of a CONFIRMED viewing, to the guest (account + email) and to the person responsible (email). A job runs every 10 minutes and at app start. A reminder missed while the server was off is sent late only if the viewing is still in the future; when both are due at once only the 2-hour one is sent. One reminder per viewing, kind and time in effect, so it is never sent twice; a viewing that was cancelled or whose time changed gets no reminder for the old time. An email failure never fails the job.

Deferred: Zalo messages (D-20).

## API

| Method | Path | Who |
|---|---|---|
| GET | `/me/notifications?unread` | guest, tenant |
| POST | `/me/notifications/:id/read` · `/read-all` | guest, tenant |
| GET/POST | `/announcements` | staff in scope |
| GET | `/dashboard?buildingId` | staff – "Việc hôm nay" counts + lists |
