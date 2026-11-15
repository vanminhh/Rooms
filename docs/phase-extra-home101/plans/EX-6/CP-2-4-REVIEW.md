# EX-6 runtime checkpoint — BE-EX-18..24

15/11/2026. Implemented in main files; owner commits. EX-6 and EX-7 deploy together. No seed, dependency install, file deletion or further schema/migration application in this checkpoint.

## Implementation

- Account-owned WEB booking, shared exact-hour validation, daily quota and open account/room uniqueness.
- Building capacity counts distinct stored phones across WEB/MANUAL. Phone and responsible person cannot occupy different buildings at the same hour. Manual creation and rescheduling use the same transaction locks.
- Shared mapping lock coordinates with building reassignment/lock and manager activation changes; current mutation scope is rechecked transactionally. Quota timestamp is explicitly shared by count window and insert to cover a Hanoi-midnight lock wait.
- Anonymous availability caches for 60 seconds; authenticated availability reads account phone server-side and uses no-store. Manual-only matching phone can reuse its place without gaining ownership.
- Guest list/detail/cancel, staff PHONE/EMAIL confirmation, late confirmation, DONE after start, cancellation note and DONE-to-LOST outcome note. No confirmation/cancellation metadata.
- Notification after commit, one retry; confirmation failure retains NEW. Provider is still the existing development logger/production unavailable adapter until EX-8.
- Dashboard reports actual conflicts, including CONFIRMED rows, before scope/page filtering. Legacy labels remain; staff can convert a legacy row to visitAt.

## Verification evidence

- Time/capacity/projection/service initial run: 103/103 passed (5 files).
- Service/dashboard/overlap/DB-map run: 100/100 passed (6 files).
- DTO/real role guard/midnight boundary run: 46/46 passed (3 files).
- Full-unit snapshot before final additions: 974 passed, 757 failed, 1731 total, 86 files. Every failure message matched `connect EACCES` on loopback. File: `Source/backend/node_modules/.cache/ex6-runtime-unit.json`. These figures overlap the targeted runs; do not add them together.
- Backend build exit 0; lint exit 0, 0 errors / 4 existing warnings.
- Real non-seeding suite rewritten with 11 scenarios in `test/viewings.e2e-spec.ts`: capacity race, account quota race, duplicate room race, mixed source race, same-phone extra rooms, cross-building phone/responsible races, last-room cancellation, reschedule race, legacy behavior, maintenance/lock preservation. First run exited 1 before test assertions; 11 pending, 0 executed. Diagnostic follow-up recorded below.
- Previous schema checkpoint: 82/82 constraints, migration replay 3 PASS; owner applied migration and verified 78/78 original rows unchanged. Owner screenshot confirms Prisma Client v6.19.3 generated successfully.

BE-EX-18 is complete; BE-EX-19..24 remain `[~]` until required HTTP/Postgres verification is available. The current strict VIEW-01 email requirement for TENANT is being checked against AUTH-12 before EX-7 implementation.

## Retained assumptions

- A-03: three WEB creations/account/Hanoi-day, including later cancellations.
- A-12: names/notes remain as entered; translating UI/mail labels does not translate those values.
- A-13: overdue NEW remains NEW until an explicit action.
- A-14: responsibility changes preserve rows and mark actual conflicts.
- Legacy start uses the established 08:00/14:00/18:00 slot boundaries for overdue/outcome checks, never invents visitAt or reserves an exact hour.

## Independent review — full report

KẾT LUẬN: DUYỆT

Phạm vi: thay đổi chưa commit EX-6 backend · 42 file · +1684/-1783 dòng tại lúc thống kê. Trọng tâm: runtime, phân quyền, capacity, khóa giao dịch, schema và spec liên quan. Không review EX-4 frontend.

### Lỗi chặn

Không phát hiện lỗi chặn trong phần đã kiểm tra.

### Nên sửa

1. `Source/backend/src/modules/viewings/viewings.service.ts:301` — Timeout bằng `Promise.race` không hủy `mailer.send` đang chạy. Khi có provider mạng, lần đầu hoàn tất sau 5 giây vẫn có thể gửi email trong lúc lần retry cũng gửi; nếu cả hai vượt timeout, khách vẫn có thể nhận email xác nhận dù trạng thái còn NEW. Khi tích hợp provider thật, cần xử lý timeout/idempotency tại adapter và bổ sung test gửi hoàn tất muộn. Hiện adapter chỉ console hoặc unavailable nên chưa phải lỗi chặn runtime hiện tại.

### Ghi chú

- Luồng ghi khóa mapping trước khi đọc người phụ trách; thay đổi manager/building lấy khóa exclusive tương ứng. Các thao tác đặt, tạo thủ công, đổi giờ và hủy dùng cùng khóa phone/responsible/building.
- Capacity đếm distinct phone xuyên WEB/MANUAL; ownership vẫn theo `userId`. Legacy không chiếm giờ chính xác. Phân quyền staff cho thao tác ghi được kiểm tra lại theo mapping hiện hành.
- Migration giữ nguyên dữ liệu legacy, chỉ thêm DONE và hai cột; có unique index bảo vệ account/room đang mở.
- Không chạy test hoặc thay đổi file trong lượt review này. Báo cáo có sẵn `ex6-runtime-unit.json` ghi **974 passed, 757 failed, tổng 1731**; không thể nói toàn bộ suite xanh. Các suite capacity/time/overlap/projection/service/dashboard EX-6 trong báo cáo đều passed; hai suite HTTP viewing failed với `connect EACCES 127.0.0.1`. Chưa xác nhận e2e PostgreSQL chạy thành công.
- Môi trường không cung cấp Sonnet 5; review dùng model kế thừa đang có. Không đọc `PLAN.md`.
- DUYỆT là khuyến nghị về code đã đọc, không thay thế checkpoint lint/test và xác minh của chủ dự án.

### Đã kiểm

- `viewings.service.ts`, DTO, controllers public/staff/me, module và response types.
- Toàn bộ helper mới: `viewing-reservations.ts`, `viewing-capacity.ts`, `viewing-time.ts`, `viewing-validation.ts`, `viewing-lock.ts`.
- Caller liên quan: `managers.service.ts`, `buildings.service.ts`, `rooms.service.ts`, `building-contact.service.ts`, mailer, JWT guard và scope helper.
- Dashboard, các test service/capacity/overlap/projection, fixture Prisma và e2e viewing.
- `schema.prisma`, `constraints.sql`, migration `20261114000000_viewing_hours`, checker migration, DB error mapping.
- `docs/spec/README.md`, `00-overview.md`, `13-viewings.md`; thay đổi liên quan trong `01-architecture.md`, `02-database.md`, `19-notifications.md`; `docs/LESSONS.md`.
- Yêu cầu đối chiếu chính: VIEW-01..04, VIEW-07..09, VIEW-13..22, SCOPE-02/03/04, ROOM-05, NOTI-07/08.

## Reviewer follow-up

Carry the timeout/idempotency item into EX-8 before enabling a network provider. No exactly-once delivery guarantee is claimed; successful external email cannot be rolled back if the database commit fails, and that failure is logged without message contents.

## E2E diagnostic follow-up

The default-reporter rerun exited 1 in 2.92 s: `PrismaClientInitializationError` at the first `prisma.user.findFirstOrThrow` preflight; cannot reach the configured PostgreSQL server. All 11 cases were skipped by the failed beforeAll hook (no `.skip` in source); none executed. The cleanup log and fixtures are created only after this preflight, so no test rows or seed were written. Log: `Source/backend/node_modules/.cache/ex6-runtime-e2e-readable.log`.

## Owner verification

From `D:\Rooms\Source\backend` outside the managed sandbox:

```powershell
npm run test
node --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.config.e2e.ts test/viewings.e2e-spec.ts
```

The second command runs only the 11 non-seeding viewing cases. It creates uniquely named test users/buildings/rooms, records their IDs, and soft-closes only those test records afterward. Existing account passwords are unchanged. Do not run the full e2e suite under the current no-seed instruction.

Manual flow after EX-7 is connected: sign in as a guest; book a future whole hour; add another room in the same building; verify a different building at that hour is refused. With other accounts fill distinct places 2 and 3, then refuse place 4. Confirm by PHONE and EMAIL from staff; test mail failure keeps NEW. Cancel one of the guest rooms and verify the place remains until its last open room closes. Test overdue NEW→DONE and staff cancellation with a note. Verify VI/EN and legacy labels.

Suggested commit when verified: `feat(viewings): implement hourly account bookings (BE-EX-18..24, VIEW-01..22)`

## Final verification and open decision

Final full-unit run: **998 passed / 757 failed / 1755 total, 87 files**. Every one of the 757 failures contains `connect EACCES`; no other assertion failure was found in the JSON report. Lint exit0, 0 errors / 4 pre-existing warnings; build exit0; git diff --check exit0 (line-ending notices only). Evidence: `node_modules/.cache/ex6-runtime-final-unit.json`. The e2e diagnostic remains 11 not executed due database connectivity; no fixtures were created.

Q-EX6-4 / Q-EX7-01 blocks BE-EX-19 closure: choose tenant booking eligibility (optional email/no verification; required email/no verification; or add tenant verification). This is a real AUTH-12/VIEW-01 conflict discovered while planning EX-7, not a new assumed business rule. The strict VIEW-01 check remains in place pending the answer. Other runtime tasks stay [~] for outside-sandbox HTTP/Postgres verification.

Frontend plan is prepared at `../EX-7/PLAN.md`; no EX-7 code has been changed. It also records ordering upcoming own viewings before server pagination as a small API alignment, to implement with the FE checkpoint.
