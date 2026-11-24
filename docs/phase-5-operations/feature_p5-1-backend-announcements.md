# Phase 5 · Part 1 – Backend: announcements (BE-P5-01..04)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | M0 committed |
| Unblocks | P5-3 (REQUEST_UPDATED uses the same inbox), P5-6, P5-8 |
| How | main session builds; reviewer before the stop (authorization) |
| Part done when | BE-P5-04 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, D-34
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2, §3, §4 "P5-1", §7, §8
4. `docs/spec/19-notifications.md` – NOTI-01, NOTI-02, NOTI-03, event table
5. Code: `src/modules/notifications/notify.ts`, `my-notifications.{controller,service}.ts`, `src/common/scope/scope.ts`

## Scope

In: `GET/POST /announcements`, tenant inbox checks (no new tenant API).
Out: email (Q-P5-4: in-app only), editing or deleting a sent announcement (Q-P5-11), FE pages.

## API for the staff page

- Send `{ buildingId, roomId?, title, body }` to `POST /announcements`. Use `buildingId: null` explicitly for all buildings. A room must belong to the selected building. Both text fields must contain text, and the title can have up to 150 characters.
- Both responses include `id`, `title`, `body`, `createdAt`, `author { id, fullName }`, `building { id, name } | null`, `room { id, code } | null`, `readCount` and `recipientCount`. GET wraps the rows with `meta { page, limit, total }`, defaults to newest first, and `buildingId` selects that exact building. Both routes set `Cache-Control: no-store` (PUB-05).
- The two-tenants-in-one-room test uses synthetic data. `contracts_one_open_per_room` currently allows one ACTIVE contract per room.

## Tasks

- [x] **BE-P5-01** `POST /announcements` (NOTI-02, NOTI-03): scope one room, one building, or all buildings (`buildingId = null`, BOSS only); manager only in scope (SCOPE-02). One transaction: create `announcements`, then `createMany` one `notifications` row (`kind = ANNOUNCEMENT`, `link = /thue/thong-bao`, `announcementId`) per tenant with an ACTIVE contract in scope. No email (D-45 (4)).
  Done when: a room without an ACTIVE contract → 0 notification rows but the announcement is saved; manager with `buildingId = null` → `FORBIDDEN`; another building → `OUT_OF_SCOPE`; `roomId` of another building → `VALIDATION_FAILED`; two tenants in one room each get one row.
- [x] **BE-P5-02** `GET /announcements?buildingId` (staff in scope, API-02 paging): sender, scope (building/room name), `createdAt`, "đã đọc / tổng" counted from `notifications.readAt`. No update or delete route (D-45 (11)).
  Done when: an all-buildings announcement is listed only for Boss; a manager sees only their scope; the read count changes after a tenant reads it.
- [x] **BE-P5-03** Check the tenant inbox is complete for `/thue/thong-bao`: `GET /me/notifications?unread`, `POST /me/notifications/:id/read`, `/read-all` already allow TENANT and filter by `userId` (SCOPE-03). Add only the missing tests; fix if something differs.
  Done when: TENANT reads own list with `meta.unreadCount`; another user's row → `NOT_FOUND`; GUEST → `FORBIDDEN`; `Cache-Control: no-store` kept.
- [x] **BE-P5-04** ⏸ `npm run lint`, `npm run test`, `npm run build`; reviewer before the stop.
  Done when: real output pasted into the report; `[ASSUMPTION]`s listed.

## Verification at M1

- `npm run lint` reported `Found 4 warnings and 0 errors.` The warnings are existing numeric sorts in the dashboard and pricing specs.
- `npm run build` and the scoped `tsc --noEmit` for both HTTP specs exited 0.
- `npm run test -- --config node_modules/.cache/rooms-vitest-p32/vitest.virtual.config.mjs --maxWorkers=4 --testTimeout=20000 --hookTimeout=30000` reported `Test Files 138 passed (138)` and `Tests 2852 passed (2852)` on the final code. The two HTTP specs passed 21/21 focused cases. The virtual HTTP runner replaces TCP loopback, which the Windows sandbox refused with `EACCES`. The HTTP specs use fake Prisma data.
- The applicable `[ASSUMPTION] A-12` preserves the original announcement text in both UI languages. M1 adds no business assumption.

## Review độc lập tại M1

**Kết luận trước khi sửa — CHẶN.** Phạm vi rà soát gồm 8 tệp chưa commit, +627/−10 dòng, BE-P5-01..04.

### Lỗi chặn

1. `Source/backend/src/modules/notifications/announcements.controller.ts:11` và `:16` thiếu `Cache-Control: no-store`. PUB-05 (`docs/spec/11-buildings-rooms.md:35`) quy định API của nhân sự không được lưu cache. `configureApp` chưa đặt header mặc định, còn DEP-06 chỉ giới hạn cache ở CDN. Trình duyệt vẫn có thể lưu riêng phản hồi chứa nội dung thông báo nội bộ. Đặt `Cache-Control: no-store` cho cả hai handler và kiểm header trong test HTTP hiện có.

### Ghi chú của reviewer

- Quyền gửi và xem phù hợp với NOTI-02 và SCOPE-02. Boss có phạm vi toàn chuỗi. Quản lý phải có tòa trong phạm vi lúc xác thực và còn được phân công khi thực hiện truy vấn.
- Gửi thông báo và tạo các dòng inbox dùng chung một giao dịch. Truy vấn chọn hợp đồng `ACTIVE` đúng phạm vi, gom theo `tenantId` và lưu thông báo kể cả khi có 0 người nhận. Danh sách đếm số đã đọc từ `notifications.readAt`. Hai route mới cũng phù hợp với quyết định D-45 về gửi trong ứng dụng và giữ nguyên thông báo đã gửi.
- Đã đọc các test về phân quyền, chống trùng người nhận, rollback qua Prisma giả lập, số đã đọc sau khi người thuê thao tác và quyền sở hữu inbox. Đây là kết quả rà mã tĩnh. Reviewer chưa chạy test và chưa xác minh trên PostgreSQL.

### Phạm vi đã kiểm

Controller, service, DTO và HTTP test của announcements, đăng ký `NotificationsModule`, controller/service và HTTP test của inbox, guard xác thực và phân vai, helper phạm vi và khóa phân công, schema và ràng buộc Prisma. Đặc tả đối chiếu gồm D-34, D-45, API-02/03/07/08, PUB-05, DEP-06, SCOPE-01/02/03 và NOTI-01/02/03.

**Đã xử lý** lỗi PUB-05 bằng header ở hai handler. Hai bài HTTP spec kiểm tra bản sửa đều đạt, tổng cộng 21/21 ca.

## Questions for the owner

<!-- Q-P5-1..16 were answered on 24/11/2026 (README.md, D-45). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
