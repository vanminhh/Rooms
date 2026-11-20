# Phase 3 · Part 2 – Backend: create a contract, tenant account, "Chốt" from a viewing (BE-P3-07..12)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-1 committed |
| Unblocks | P3-3 |
| How | planner writes `plans/P3-2/PLAN.md` → main session builds → reviewer before the last stop (accounts + authorization + schema) |
| Part done when | BE-P3-12 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/00-overview.md` – D-01, D-03, D-07, D-08, D-26, D-35, D-39, D-41, A-18
3. `docs/spec/14-contracts.md` – CON-01..05, CON-07 (the "create" part), API table, Acceptance
4. `docs/spec/13-viewings.md` – VIEW-04, VIEW-05, VIEW-06, VIEW-16; `docs/spec/11-buildings-rooms.md` – ROOM-05, room status; `docs/spec/10-auth.md` – AUTH-02, AUTH-11, SCOPE-02..05
5. `docs/spec/02-database.md` – the contract rules and the trigger "tenant is TENANT" (row Phase 3 of "Planned changes"); `docs/spec/19-notifications.md` – NOTI-06; `docs/spec/20-reports-audit-settings.md` – AUD-01
6. Code: `src/modules/auth/managers.service.ts` (temporary password + audit in one transaction), `src/modules/auth/auth.service.ts` (`register`, `isReplaceable`), `src/modules/audit/audit.service.ts`, `src/common/rooms/public-room.ts`, `src/common/rates/rates-at.ts`, `src/modules/viewings/viewings.service.ts` (`lockedViewing`, `change`), `src/common/viewings/viewing-lock.ts`, `src/modules/notifications/dashboard.service.ts`, `src/modules/buildings/services.service.ts`, the P3-1 helpers

## Scope

In: `POST /contracts`, `GET /contracts`, `GET /contracts/:id`, the account lookup at creation, the signer as first occupant, VIEW-05 and VIEW-06, the "call the guests" task.
Out: signing, the deposit invoice and the temporary password (P3-3), move-in and cancel (P3-4), editing occupants, vehicles and services after creation (P3-5).

## Tasks

- [x] **BE-P3-07** `POST /contracts` (CON-01..03): validation of every input of CON-01; the room must be public-eligible except the "no open contract" check, which is left to the DB index (`ROOM_NOT_AVAILABLE`); `rooms.price` null → `PRICE_NOT_APPROVED`; `rent` = current room price (D-08); `end_date` with the P3-1 helper (D-41; no billing day of its own, D-40); `deposit` defaults to the room price; services must be active ROOM or PERSON services of the same building with an approved rate on the move-in date (D-07, DB-B5); `code` = `HD` + id padded to 6, set in the same transaction; manager scope (SCOPE-02).
  Done when: tests `CON-01..03: …` including a 2-month term (`CONTRACT_TERM_TOO_SHORT`), a service of another building, a room with a HOLD contract, a manager of another building (`OUT_OF_SCOPE`), and two parallel creations for one room where exactly one succeeds.
- [x] **BE-P3-08** Tenant account at creation (CON-07 "create", D-26, A-18): look up by the signer's phone; none → TENANT inactive with an unusable password; TENANT → reuse; GUEST with a verified email → only when the request carries the staff confirmation of A-18, then role becomes `TENANT` in the same transaction before the contract insert (DB trigger); without the confirmation → `PHONE_TAKEN` and the response shows the account's name and email for the form; GUEST never verified → treated as none (name, email replaced, unusable password); MANAGER/BOSS → `PHONE_TAKEN`; an account locked by staff → refused with "Tài khoản của số này đang bị khóa".
  Done when: one test per branch named `CON-07: …`; the reused guest keeps its password hash, viewings and `locale`; audit `user.role_change` written (AUD-01).
- [x] **BE-P3-09** ⏸ Signer and side effects (CON-04, CON-05, VIEW-05, VIEW-06): the signer is the first occupant (`is_signer`, `move_in_date = startDate`, CCCD encrypted with `last4`); with `viewingId`, the viewing must be CONFIRMED or DONE for the same room and becomes `WON` with `contract_id`; every other NEW/CONFIRMED viewing of the room becomes `CANCELLED` with note "Phòng đã có người đặt cọc"; audit `contract.create`; all in one transaction.
  Done when: acceptance-style tests: creating from viewing A sets A `WON` and cancels B of the same room, and leaves a viewing of another room untouched; a NEW viewing as `viewingId` is refused; a failure in any step leaves no contract, no account change and no viewing change. Stop and report BE-P3-07..09.
  Verified in the focused tests, real Node HTTP parser cases and Prisma/PGlite. Full results and review are in [checkpoint 1](plans/P3-2/CHECKPOINT-1.md).
- [x] **BE-P3-10** `GET /contracts?buildingId&status&q&page` (also the tenant list; `q` matches name, phone, room code) and `GET /contracts/:id` (contract, room, building, tenant, occupants with CCCD last 4 only, vehicles, services, deposit invoice summary when it exists). Staff in scope only.
  Done when: tests for scope, search, paging (`meta`), and that no response carries an encrypted CCCD value or a password field.
  Verified via the HTTP suite and real Prisma queries on embedded PostgreSQL. See [checkpoint BE-P3-10](plans/P3-2/CHECKPOINT-BE-P3-10.md) for the test counts and reviewer report.
- [x] **BE-P3-11** ⏸ "Việc hôm nay" (NOTI-06, VIEW-06, D-39): a group of viewings cancelled by a deposit, for the person responsible, listed until staff press "Đã gọi". Migration: who pressed and when on `viewings` (ask the owner before creating and before applying; add DB-check scenarios). `POST /viewings/:id/called` for staff in scope, only on a viewing cancelled by a deposit, pressing twice changes nothing.
  Done when: `dashboard.service.spec.ts` covers the group for a manager and for Boss (buildings without an active manager); a called viewing leaves the list; another building → `OUT_OF_SCOPE`; DB check passes every scenario (report the count).
  Dev migration confirmed on 18/11/2026 and committed in `56fabd0`. The API and dashboard acceptance checks passed, including 97/97 DB cases. See [implementation checkpoint](plans/P3-2/CHECKPOINT-BE-P3-11.md) and [migration checkpoint](plans/P3-2/CHECKPOINT-BE-P3-11-MIGRATION.md).
- [x] **BE-P3-12** ⏸ `npm run lint`, `npm run test`, `npm run build`, e2e (add a contracts e2e file for create + VIEW-05/06 on the dev DB with the existing e2e runner and cleanup). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Dev E2E confirmed by the owner's 20/11/2026 screenshot: 4/4 tests and `20261120T0659-VCIC CLEANED` (combined contracts run: 2 files / 5 tests passed, 164.71s). The owner also supplied cleanup list output: no pending run logs and no rows from this run; only unlogged legacy fixtures dated 03–06/11 are reported separately. Together with the recorded local checks and reviewer approval, this closes BE-P3-12. See [checkpoint BE-P3-12](plans/P3-2/CHECKPOINT-BE-P3-12.md). No rerun is needed.
  Done when: all pass with real output quoted; `cleanup.mjs` in list mode shows no row left by this run; list the `[ASSUMPTION]`s used (A-18).

## Questions for the owner

- BE-P3-12 đã khép ngày 20/11: chủ dự án cung cấp E2E dev, `CLEANED` và cleanup list không còn run `20261120T0659-VCIC`. Các mục unlogged từ 03–06/11 được báo riêng, không thuộc lượt nghiệm thu này.
- BE-P3-11 (D-39, VIEW-06): chủ dự án đã duyệt tạo và áp dụng `20261118000000_viewing_deposit_calls` lên DB dev (18/11/2026).

Đã trả lời 17/11/2026

- **Q-P3-8 (1A)** Tạo hợp đồng trước, bổ sung ảnh CCCD riêng tư trong P3-5.
- **Q-P3-9 (2C)** Chỉ lựa chọn dịch vụ đang hoạt động, cùng tòa, theo phòng hoặc theo người và có giá hiệu lực tại ngày vào ở.
- **Q-P3-10 (3B)** Cho phép “Chốt” khi nhân sự xác nhận người ký khác chủ lịch online. Hợp đồng thuộc người ký và lịch giữ tài khoản đặt lịch ban đầu.
- **Q-P3-11 (4A)** Phạm vi hiện tại là khách Việt, trường số giấy tờ tùy chọn chỉ nhận CCCD 12 chữ số.

Đã trả lời 16/11/2026:

- Q-P3-1 (BE-P3-11): việc "gọi khách bị hủy lịch" ở lại "Việc hôm nay" tới khi nhân sự bấm "Đã gọi" (D-39).

## Issues log

- 20/11/2026 · BE-P3-12 · Đã nhận cleanup list từ chủ dự án: không có nhật ký chờ dọn, không còn run `20261120T0659-VCIC`; chỉ báo bản ghi unlogged 03–06/11. Khép phần chờ list và đánh dấu `[x]`. Danh sách cũ là báo cáo dữ liệu thử thiếu nhật ký, không phải lỗi E2E của lượt mới; không có thao tác dọn dữ liệu cũ trong lượt này.
- 20/11/2026 · BE-P3-12 · Ảnh chủ dự án xác nhận E2E dev 4/4 và `CLEANED`, trong lượt hai file đạt 5/5 test. Khép lỗi kết nối đối với E2E; lệnh cleanup list read-only từ Codex vẫn không kết nối được DB. Giữ `[!]` chỉ vì chưa có đầu ra list theo tiêu chí nghiệm thu; không yêu cầu chạy lại E2E đã pass.
- 18/11/2026 · BE-P3-12 · DB dev trả `P1001`, cả E2E và cleanup list dừng ở truy vấn đầu. Bộ test E2E nhúng và kiểm tra dọn dữ liệu đã qua. Cần chạy E2E và cleanup list trên máy dự án để nghiệm thu hai kết nối PostgreSQL.
- 17/11/2026 · BE-P3-10 · Đã chặn NUL trong từ khóa trước Prisma và kiểm rõ danh sách trường API được phép đọc. 11 ca HTTP GET qua TCP gặp lỗi loopback trong phiên này. Cả bộ backend đạt 1927/1927 qua HTTP trong bộ nhớ, truy vấn Prisma/PGlite đạt và reviewer DUYỆT.

- 17/11/2026 · BE-P3-07..09 · Đã đóng Q-P3-8..11. Reviewer DUYỆT phần mã sau khi sửa đăng nhập tài khoản chờ ký và kiểm quyền tòa. TCP chuẩn vướng 760 lỗi loopback, cả bộ đạt 1916/1916 với HTTP trong bộ nhớ. Prisma/PGlite kiểm chỉ mục HOLD và rollback trong một phiên. Kiểm đa kết nối tại BE-P3-12.

- 17/11/2026 · BE-P3-07..09 · CON-01 liệt kê ảnh khi tạo nhưng FILE-01 cần hợp đồng có sẵn. Quy tắc chọn dịch vụ, định dạng giấy tờ và “Chốt” cho người ký khác chủ lịch cần quyết định ở Q-P3-8..11. Đã lập [kế hoạch](plans/P3-2/PLAN.md) và kiểm baseline DB offline 88/88 sau khi tạo lại bản SQL từ Prisma hiện tại.

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
