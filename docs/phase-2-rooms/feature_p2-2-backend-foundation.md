# Phase 2 · Part 2 – Backend shared foundation (BE-P2-01..10)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order unless a task says otherwise. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 1 on the main files |
| Unblocks | Parts 3–6 (everything they share lives here, so no later part writes it again) |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-P2-01-10/` |
| How | Pipeline |
| Part done when | BE-P2-10 on the main files; `npm run test:e2e` run twice in a row passes and both run logs end `CLEANED` |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md`, `docs/spec/01-architecture.md` (API-02, error codes, FILE-01/02, cron)
3. `docs/spec/02-database.md` and `prisma/constraints.sql` (constraint names for BE-P2-01)
4. `docs/spec/11-buildings-rooms.md` (ROOM-05, SVC-05), `docs/spec/12-pricing.md` (PRC-06, RATE-04, RATE-06)
5. Existing code: `src/common/errors`, `src/common/response.interceptor.ts`, `prisma/seed.ts`, `test/*.e2e-spec.ts`

## Scope

In: error mapping, list `meta`, date / rate / public-room helpers, `/files/sign`, seed "Gửi xe điện", e2e runner.
Out: any endpoint of buildings, rooms, pricing, viewings (parts 3–6). Do not edit the spec.

## Tasks

- [x] **BE-P2-01** Global filter maps Prisma/Postgres errors by constraint or trigger name to spec codes: `users_phone_key` → `PHONE_TAKEN`; duplicate room code → `VALIDATION_FAILED` + `fields.code` (ROOM-06 text); `room_prices_one_pending`, `rate_plans_one_pending`, `rate_plans_one_per_day` → `CONFLICT_STATE`; trigger `MANAGER_MAX_2_BUILDINGS` → same code; `BUILDING_MANAGER_ROLE` → `VALIDATION_FAILED` + `fields.managerId`; CHECK `buildings_code_format` → `VALIDATION_FAILED` + `fields.code`. Unknown DB errors stay `INTERNAL_ERROR` without DB text.
  Done when: one unit test per mapping; no raw DB message reaches a response.
- [x] **BE-P2-02** Add `PRICE_PROPOSAL_EXPIRED` (409) and `UPLOAD_NOT_CONFIGURED` (503) with the spec messages.
  Done when: unit test for both bodies.
- [x] **BE-P2-03** Response interceptor passes `{ data, meta }` for lists (`meta = { page, limit, total }`, API-02); a small shared pagination DTO (`page` ≥ 1, `limit` 1..100, default 20).
  Done when: unit tests for list and non-list responses; Phase 1 tests still pass.
- [x] **BE-P2-04** `src/common/date/today.ts`: today as a `date` in Asia/Ho_Chi_Minh, date compare/add-days, "has slot started" for VIEW-08.
  Done when: unit tests across midnight Hà Nội vs UTC (e.g. 23:30 UTC = next day in Hà Nội).
- [x] **BE-P2-05** `src/common/rates/rates-at.ts`: `ratesAt(buildingId, date)` (RATE-04, RATE-06) and `currentRoomPrice(roomId, date)` (PRC-06 incl. same-date tie on `reviewed_at`).
  Done when: unit tests incl. acceptance "20/10 vs 15/10" of spec 12 and the tie case.
- [x] **BE-P2-06** `src/common/rooms/public-room.ts`: Prisma `where` for ROOM-05 (incl. ELECTRIC and WATER rate in effect today), reused by every public query and VIEW-01.
  Done when: unit tests on seed shape: CG01/301 (no price) and CG01/203 (ACTIVE contract) are not public.
- [x] **BE-P2-07** `src/modules/files`: `POST /files/sign` (FILE-01, purpose `ROOM_IMAGE` + `roomId`, scope check) and a `verifyRoomImage(roomId, { publicId, version, format })` helper that checks the folder and builds the URL (FILE-02). Signing uses `node:crypto` (no new package). Missing `CLOUDINARY_URL` → `UPLOAD_NOT_CONFIGURED`, the app still starts.
  Done when: signature equals Cloudinary's documented sample vector; manager of another building → `OUT_OF_SCOPE`; wrong folder rejected; missing env → 503.
- [x] **BE-P2-08** Seed: service "Gửi xe điện" (VEHICLE) with an approved rate plan 150.000 đ for each seeded building (SVC-05). Idempotent.
  Done when: seed runs twice without errors or duplicates.
- [x] **BE-P2-09** e2e runner `test/e2e-run.ts` + `test/e2e-cleanup.mjs` (owner D2-14, 01/11/2026):
  P2-3 đã áp dụng và có e2e spec, nhưng lượt e2e ngày 03/11/2026 chưa khởi tạo Prisma vì thiếu DATABASE_URL/.env trên máy này; log FAILED_CLEANUP có mọi ID rỗng. Chờ cấu hình DB dev để chạy hai lượt và xác nhận hai log CLEANED.
  - one `runId` (timestamp + 4 random chars) and one log `test/e2e-runs/<runId>.json` per e2e file; `test/e2e-runs/` in `.gitignore`;
  - names start with `[E2E <runId>]` (services: `[E2E] …`, 50-char limit); building code `E2` + 4 random `A-Z0-9`, checked in the DB and regenerated on a clash; test phones `09` + 8 random digits, same check; test-manager passwords random, kept in memory only;
  - Boss = existing seed account; managers are created by the test through `/managers`, never Quản lý 1/2; dev buildings, rooms and rates are read only;
  - the log records `runId`, start/end, status `RUNNING` → `CLEANED` | `FAILED_CLEANUP`, and ids per table (`buildings`, `rooms`, `services`, `users`, `room_prices`, `rate_plans`, `viewings`, `room_images`), written **right after each create**; never passwords, tokens, cookies or connection strings;
  - `afterAll` touches only logged ids: NEW/CONFIRMED viewings → `CANCELLED` (note "[E2E] dọn dữ liệu thử"); PENDING prices/plans → `REJECTED` (same note); rooms, services, buildings → `is_active = false`; test managers → inactive + sessions revoked; approved rows and images stay; nothing is hard-deleted;
  - helpers for tests: reset the in-memory IP limiter, run the price job with `roomIds`;
  - `e2e-cleanup.mjs` by default only **lists**: every log not `CLEANED`, each id checked against the DB (still active? linked contract/invoice?), plus rows named `[E2E` found in no log (report only, never touched). `--apply <runId>` deactivates that log's ids; only the main session runs it, after the owner has seen the list.
  Done when: unit tests for code/phone generation with a clash, log never contains secrets, `afterAll` touches only logged ids, list mode writes nothing; Phase 1 e2e still 17/17; two full e2e runs pass and both logs are `CLEANED`.
- [x] **BE-P2-10** `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` pass; list every `[ASSUMPTION]` used.

## Questions for the owner

- 03/11/2026 · BE-P2-09 · Máy hiện thiếu `Source/backend/.env` và biến `DATABASE_URL`/`DIRECT_URL`. Chủ dự án có thể chỉ dẫn nơi đặt cấu hình DB dev qua kênh bí mật để chạy hai lượt e2e thật và kiểm CLEANED không? Không gửi bí mật vào chat.

- 01/11/2026 · BE-P2-02 · `src/app.setup.spec.ts` (lines ~757, 784–788) expects exactly 23 `ErrorCode` members; spec 01 now has 25. A) draft a copy of that test with the 2 new rows and 23 → 25, applied with this part (recommended); B) drop the 2 new codes (against spec 01); C) other.
  Answered 01/11/2026 (owner): A.
- 01/11/2026 · BE-P2-02 · the draft test needs `src/app.setup.ts` and its imports inside the draft. (a) move the check to a later checkpoint (still blocked at CP-2); (b) add byte-identical copies of `src/app.setup.ts`, `src/common/response.interceptor.ts`, `src/common/errors/validation.ts` (and what they import) to the draft, as done in Phase 1 BE-LOGIN-09-25 (recommended); (c) relax the self-contained-draft rule.
  Answered 01/11/2026 (owner): (b).
- 01/11/2026 · BE-P2-09 · coder cannot write `test/e2e-run.ts` (agent guard: every `test/` path is a test file). (1) put the runner in `scripts/e2e/run.ts` and `scripts/e2e/cleanup.mjs` (log stays `test/e2e-runs/`), no hook change, coder writes, tester tests independently (recommended); (2) change the hook so coders may write non-spec files under `test/`; (3) tester writes the runner (it would test its own code).
  Answered 01/11/2026 (owner): (1) `scripts/e2e/`. The task text above still says `test/`; it is corrected when this part is applied.
- 02/11/2026 · BE-P2-09 · `cleanup.mjs --apply` on a logged row that has a linked contract or invoice: (A) skip it and list it apart (recommended); (B) deactivate it like the others, the owner reviews the list first.
  Answered 02/11/2026 (owner): (A).
  Follow-ups decided by the main session from that answer (02/11/2026): a viewing whose contract is outside the logged rooms/buildings/tenants is also "linked" (one more branch in the same contract query); a test manager who created a contract is also skipped; reasons name the contract by its code (e.g. HD000001).

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 02/11/2026 · BE-P2-01..10 · approved and applied (35 files). On the main files: lint 0, build and `tsc -p tsconfig.build.json` clean, `npm run test` 786/787 – Phase 1 test BE-LOGIN-19 (`prisma.service.spec.ts`) expects AppModule without `FilesModule` · fix drafted in `Source/backend/artifact_BE/2026-11-02-BE-P2-appmodule-test/`, waiting for owner approval
- 02/11/2026 · BE-P2-10 · test fix approved and applied; on the main files `npm run test` 30 files / 787 tests pass, `npm run lint` 0, build and e2e pass (see above) · pass
- 02/11/2026 · BE-P2-08 · seed run 3 times on dev: "Seed xong: 5 tài khoản, 3 tòa, 7 phòng, 1 hợp đồng", exactly 3 "Gửi xe điện" services and 3 approved plans 150.000 đ · pass
- 02/11/2026 · BE-P2-09 · `npm run test:e2e` twice: 2 files / 17 tests pass both times; `node scripts/e2e/cleanup.mjs`: no open log, no unlogged [E2E rows · pass
- 03/11/2026 · BE-P2-09 · Sau apply P2-3, `npm run test:e2e` thất bại trước kết nối Prisma: thiếu DATABASE_URL. Log `20261103T1003-8Y2Y.json` là FAILED_CLEANUP, mọi ID rỗng; không có dữ liệu thử được tạo. Chưa đạt gate Phase 2 (hai lượt P2-3 CLEANED). Cần DB dev hợp lệ rồi chạy lại.
- 03/11/2026 · BE-P2-09 · Chủ dự án xác nhận `Source/.env` là DB dev; hotfix P2-3 và draft env đã duyệt/áp dụng. Hai lượt e2e đầy đủ 23/23 PASS, log `20261103T1542-N0N9` và `20261103T1555-CZIT` đều CLEANED. `node --env-file=../.env scripts/e2e/cleanup.mjs` chế độ chỉ liệt kê, không ghi DB, báo duy nhất log cũ `20261103T1003-8Y2Y` FAILED_CLEANUP với mọi ID rỗng. Runner thực tế nằm trong `scripts/e2e/` theo quyết định pipeline P2-2; unit runner và 17 bài e2e Phase 1 nằm trong bộ test đã PASS. Gate hai lượt PASS/CLEANED đạt.
- 03/11/2026 · BE-P2-09 / P2-QA-03 · Chủ dự án xem danh sách và đồng ý `--apply 20261103T1003-8Y2Y` (mọi ID rỗng). Lệnh trả “Đã dọn nhật ký”, status file là CLEANED; list mode sau đó báo không có nhật ký chưa dọn và không có bản ghi `[E2E` lạ.
- 01/11/2026 · BE-P2-02 · coder stopped after checkpoint 1: adding the 2 spec error codes breaks the Phase 1 count test in `src/app.setup.spec.ts` · owner chooses A/B/C (answered A)
- 01/11/2026 · BE-P2-02 · tester FAIL round 1: draft `app.setup.spec.ts` cannot import `./app.setup.js`; 31 other CP-1 tests pass · owner chooses (a)/(b)/(c) (answered (b))
- 01/11/2026 · BE-P2-07 · coder stopped before CP-5: the Cloudinary test vector in PLAN.md was wrong (string without `eager`, hash partly invented) · main session checked https://cloudinary.com/documentation/authentication_signatures: `timestamp=1315060510` + `abcd` → `a21ad0f63beb4de2e5575204b79ab90bffb02c10`; `eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510` + `abcd` → `bfd09f95f331f558cbd1320e67aa8d488770583e` (both recomputed with node:crypto); resumed
- 01/11/2026 · BE-P2-09 · CP-1..CP-6 PASS; CP-7 stopped: agent guard blocks the coder under `test/`; `CleanupFacts` type missing in PLAN (main session: use the coder's proposal) · owner chooses (1)/(2)/(3) (answered (1))
- 02/11/2026 · BE-P2-09 · coder wrote a temp file `D:/Rooms/tsc-cp7.txt` with a shell redirect outside the draft and deleted it at once (not tracked, `main-files.mjs check` clean, file gone); the guard did not catch shell redirects · reported to the owner
- 02/11/2026 · BE-P2-09 · CP-7 code drafted, not tested; owner question on linked rows; main session accepts 6 small PLAN deviations (readAllLogs, E2eRun reopens a log, export E2E_TABLES, unlogged rows printed once, room_images "giữ nguyên", name length by code point)
