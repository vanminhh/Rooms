# EX-6 CP-1 — revised BE-EX-17 offline verification

15/11/2026. This report replaces the earlier 76-case review. It covers the owner's three decisions dated 14/11/2026 and follow-up answers: one stored phone across WEB/MANUAL; overdue NEW may become DONE directly. The migration has not been applied. The previous permission to apply the abandoned version is withdrawn; ask again before dev application. No seed was run.

## Changes

- Schema/migration: retain only nullable user_id/visit_at, DONE, nullable legacy time, CHECK, owner FK RESTRICT, two indexes and partial unique account/room. Remove the proposed NO_SHOW and all confirmation/cancellation metadata before first application. No legacy row update or backfill.
- Spec/plan/tasks: 3 distinct phones per building/hour, same-phone multi-room grouping across WEB/MANUAL, cross-building exclusion for guest and responsible person, direct overdue NEW → DONE, guest cancellation clears handler, late confirmation without method/time. Capacity rules are planned BE logic, not a new DB constraint or implemented runtime in this checkpoint.
- Availability design: anonymous cached hours plus a signed-in no-store route that resolves phone server-side. This covers an existing MANUAL-only place at full capacity without exposing or claiming its row. Public cache stays anonymous.
- Synchronized error/dashboard references in spec 01/19 and the Phase Extra README as well as the requested spec 00/02/13/30, plan and feature_ex-6/7.
- Existing EX-4 frontend changes remain outside this checkpoint.

## Fresh evidence

```text
prisma validate: exit 0, schema valid
prisma migrate diff (committed schema -> revised schema): DONE + 2 columns,
  legacy nullable + 2 indexes + owner FK; no new enum types or row mutations
check-constraints.mjs: 82/82 tình huống đúng như mong đợi
  16 viewing cases, +6 over the superseded 76-case checker
check-viewing-hours-migration.mjs: exit 0
  PASS VIEW-08: all 5 legacy statuses load unchanged; new columns are null.
  PASS DB-07: upgraded and fresh viewing columns, constraints, indexes and enums match.
  PASS VIEW-04/15/18: DONE is the only added status; no confirmation/cancellation metadata columns or enums.
npm run lint: exit 0, 7 warnings and 0 errors (existing warnings)
npm run build: exit 0 (installed Prisma client, not regenerated)
npm run test: exit 1
  Test Files  31 failed | 50 passed (81)
       Tests  740 failed | 915 passed (1655)
    Duration  58.51s
  All 740 FAIL groups: Error: connect EACCES 127.0.0.1:<port>
git diff --check: exit 0; LF/CRLF warnings only
```

The offline diff baseline was also checked against HEAD's committed schema and matched. Fresh schema.sql was generated offline before both PGlite checks. The two custom constraints are in both constraints.sql and the migration. None of these commands applied a migration to the project DB. No environment edits, dependency installation, active-client regeneration, real email or seed.

Full unit log: Source/backend/node_modules/.cache/ex6-revised-unit.log (ignored local output). Do not report full unit pass. Build/test use the existing generated client; they do not certify new runtime types. Regenerate/adapt the client in BE-EX-18..20 and verify the actual capacity/authorization/concurrency code there. E2E was not run: existing full e2e can seed accounts, which the owner prohibited.

## Owner verification and next step

1. Read the revised migration: only additive DONE, 2 columns, nullable legacy fields, FK/indexes/CHECK/unique; no UPDATE/DELETE/backfill.
2. Re-run `npm run test` from Source/backend in the owner's terminal to verify HTTP tests outside the sandbox; this is the unit command, not test:e2e and not seed.
3. Approve or decline applying this exact revised viewing_hours migration to the configured dev DB. After fresh approval, preflight pending migrations and compare original viewing data before/after; do not seed. The previous P1001 connectivity issue has not been retested in this revision.

BE-EX-17 remains [~] until authorized live application/legacy verification. BE-EX-18..24 and EX-7 runtime are not implemented by this revision. No new business assumptions: phone grouping and direct DONE were answered by the owner; retained A-03/A-12/A-13/A-14 and legacy-slot timing are listed in PLAN.md.

Suggested commit: `revise viewing schema and capacity spec (BE-EX-17, VIEW-04, VIEW-16, VIEW-18, DB-07)`.

## Full independent reviewer report

Inherited available model used because the repository-pinned Sonnet model is unavailable. Reviewer read-only; no DB execution or file edits.

KẾT LUẬN: **DUYỆT**

Phạm vi: thay đổi chưa commit của EX-6 — **14 file, +187/-45 dòng**, gồm schema, migration chưa áp dụng, hai checker và các spec/task liên quan. Không bao gồm EX-4, `PLAN.md`, nhật ký tiến độ hoặc báo cáo checkpoint.

### Lỗi chặn

Không còn lỗi chặn trong bản cuối đã đọc.

Các điểm không nhất quán phát hiện trong vòng review đã được sửa:

- `docs/spec/13-viewings.md:49`: availability riêng theo tài khoản xử lý được khách chỉ có lịch MANUAL cùng SĐT khi tòa đã đủ 3 khách. Route dùng SĐT từ tài khoản, `no-store`, chỉ trả ngày/giờ; không cấp quyền đọc lịch MANUAL. Acceptance tại dòng 85 bao phủ trường hợp này.
- `docs/phase-extra-home101/feature_ex-6-backend-viewings.md:40`: tiêu chí manual/reschedule đã bỏ quy tắc cũ “giờ có người là bị từ chối”, thay bằng kiểm tra sức chứa và xung đột hai tòa.
- `docs/spec/01-architecture.md:81` và `docs/spec/19-notifications.md:24`: mô tả lỗi và dấu “Trùng giờ” đã thống nhất với VIEW-16/22.

### Nên sửa

Không có đề xuất bổ sung cần làm trước checkpoint offline này.

### Ghi chú

- `Source/backend/prisma/migrations/20261114000000_viewing_hours/migration.sql:2`: chỉ thêm `DONE`; không thêm `NO_SHOW` hoặc enum metadata.
- Migration tại dòng 5, 11, 14, 17, 21 và 26 giữ đúng phạm vi: hai cột nullable, legacy date/slot nullable, hai index, FK owner `RESTRICT`, CHECK thời gian và partial unique account/room. Không có lệnh sửa hoặc xóa dữ liệu legacy.
- `Source/backend/prisma/check-viewing-hours-migration.mjs:20`: fixture có đủ năm trạng thái cũ. Dòng 27–31 so sánh số bản ghi, từng cột cũ và hai cột mới phải null. Dòng 37–46 đối chiếu cấu trúc upgrade/fresh và kiểm tra danh sách enum kỳ vọng. Các assertion này thực chất, không phải test luôn xanh.
- `Source/backend/prisma/check-constraints.mjs:51`: các ca mới kiểm tra cả chấp nhận và từ chối; mỗi ca chạy trong transaction rồi rollback tại dòng 140–143. Không mock đối tượng đang kiểm tra.
- Spec cuối giữ đúng quota 3 WEB/account/ngày, đếm SĐT chung WEB/MANUAL, nhiều phòng cùng tòa/giờ, chặn khách/người phụ trách ở hai tòa, NEW quá giờ → DONE trực tiếp, DONE → LOST, hủy bởi khách xóa `handled_by_id`, xác nhận muộn không lưu metadata.
- Reviewer tự chạy `git diff --check`: **exit 0**, chỉ có cảnh báo LF/CRLF.
- Reviewer đọc trực tiếp `Source/backend/node_modules/.cache/ex6-revised-unit.log` và phân loại đủ **740 khối FAIL**: tất cả đều `Error: connect EACCES 127.0.0.1:<port>`. Log kết thúc:
  ```text
  Test Files  31 failed | 50 passed (81)
       Tests  740 failed | 915 passed (1655)
    Duration  58.51s
  ```
  Vì vậy không được báo toàn bộ unit suite đã xanh.
- Kết quả **main session cung cấp**, reviewer không tự chạy lại: DB checker **82/82**; migration replay **3 PASS**; Prisma validate/diff đạt; lint **0 lỗi, 7 cảnh báo cũ**; build **exit 0 với Prisma Client cũ**.
- Đây là duyệt **bản sửa offline**, chưa xác nhận runtime EX-6 hoặc khả năng build sau khi generate client mới. Không áp dụng migration, không seed, không truy cập DB trong review. Quyền áp dụng cũ đã bị thu hồi rõ tại `feature_ex-6-backend-viewings.md:73`; kết luận này không thay thế quyết định của chủ dự án.

### Đã kiểm

- `schema.prisma`, `constraints.sql`, `check-constraints.mjs`, `check-viewing-hours-migration.mjs`, migration `viewing_hours`.
- Spec `00-overview`, `01-architecture`, `02-database`, toàn bộ `13-viewings`, các phần liên quan trong `19-notifications`, `30-frontend`.
- `feature_ex-6-backend-viewings.md`, `feature_ex-7-frontend-viewings.md`, Phase Extra `README.md`.
- Quy tắc liên quan trong auth, buildings/rooms, contracts; service/controller/type/helper viewings hiện tại để xác nhận ranh giới runtime cũ.
- `.codex/agents/reviewer.toml`, backend `CLAUDE.md`, `docs/LESSONS.md`. Không mở `PLAN.md`, không chỉnh file.

## Application attempt — 15/11/2026, after owner approval

The owner approved applying the revised migration. Read-only prisma migrate status exited 1 with P1001. A separate TCP probe using the configured DB target returned ENOTFOUND; no credentials were printed. No migrate deploy or seed was executed; live legacy data remains unverified. The offline evidence above is unchanged. BE-EX-17 is blocked by connectivity, not awaiting renewed permission for this version.

## Owner terminal preflight — 15/11/2026

Owner screenshot confirms DB reachable from their terminal: 7 migration folders and only 20261114000000_viewing_hours pending. Prepared ignored local helper Source/backend/node_modules/.cache/apply-viewing-hours.cjs for owner execution; syntax check and 5 preflight guard assertions pass without DB access. It pins the approved SQL checksum, refuses unexpected pending/unfinished migrations, records hashes of all original viewing fields, runs migrate deploy, and compares old rows/new-null columns afterwards. It does not seed. Awaiting actual execution output; migration is not marked applied.

## Applied successfully — owner terminal evidence, 15/11/2026

Screenshot of the approved helper shows: BEFORE 78 viewings; migration 20261114000000_viewing_hours successfully applied; PASS 78/78 original viewings unchanged, new columns null; AFTER 78 viewings. No seed ran. Evidence is from the owner's terminal because the agent sandbox cannot reach the DB. BE-EX-17 is complete; runtime proceeds with BE-EX-18.
