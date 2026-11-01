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

- [ ] **BE-P2-01** Global filter maps Prisma/Postgres errors by constraint or trigger name to spec codes: `users_phone_key` → `PHONE_TAKEN`; duplicate room code → `VALIDATION_FAILED` + `fields.code` (ROOM-06 text); `room_prices_one_pending`, `rate_plans_one_pending`, `rate_plans_one_per_day` → `CONFLICT_STATE`; trigger `MANAGER_MAX_2_BUILDINGS` → same code; `BUILDING_MANAGER_ROLE` → `VALIDATION_FAILED` + `fields.managerId`; CHECK `buildings_code_format` → `VALIDATION_FAILED` + `fields.code`. Unknown DB errors stay `INTERNAL_ERROR` without DB text.
  Done when: one unit test per mapping; no raw DB message reaches a response.
- [ ] **BE-P2-02** Add `PRICE_PROPOSAL_EXPIRED` (409) and `UPLOAD_NOT_CONFIGURED` (503) with the spec messages.
  Done when: unit test for both bodies.
- [ ] **BE-P2-03** Response interceptor passes `{ data, meta }` for lists (`meta = { page, limit, total }`, API-02); a small shared pagination DTO (`page` ≥ 1, `limit` 1..100, default 20).
  Done when: unit tests for list and non-list responses; Phase 1 tests still pass.
- [ ] **BE-P2-04** `src/common/date/today.ts`: today as a `date` in Asia/Ho_Chi_Minh, date compare/add-days, "has slot started" for VIEW-08.
  Done when: unit tests across midnight Hà Nội vs UTC (e.g. 23:30 UTC = next day in Hà Nội).
- [ ] **BE-P2-05** `src/common/rates/rates-at.ts`: `ratesAt(buildingId, date)` (RATE-04, RATE-06) and `currentRoomPrice(roomId, date)` (PRC-06 incl. same-date tie on `reviewed_at`).
  Done when: unit tests incl. acceptance "20/10 vs 15/10" of spec 12 and the tie case.
- [ ] **BE-P2-06** `src/common/rooms/public-room.ts`: Prisma `where` for ROOM-05 (incl. ELECTRIC and WATER rate in effect today), reused by every public query and VIEW-01.
  Done when: unit tests on seed shape: CG01/301 (no price) and CG01/203 (ACTIVE contract) are not public.
- [ ] **BE-P2-07** `src/modules/files`: `POST /files/sign` (FILE-01, purpose `ROOM_IMAGE` + `roomId`, scope check) and a `verifyRoomImage(roomId, { publicId, version, format })` helper that checks the folder and builds the URL (FILE-02). Signing uses `node:crypto` (no new package). Missing `CLOUDINARY_URL` → `UPLOAD_NOT_CONFIGURED`, the app still starts.
  Done when: signature equals Cloudinary's documented sample vector; manager of another building → `OUT_OF_SCOPE`; wrong folder rejected; missing env → 503.
- [ ] **BE-P2-08** Seed: service "Gửi xe điện" (VEHICLE) with an approved rate plan 150.000 đ for each seeded building (SVC-05). Idempotent.
  Done when: seed runs twice without errors or duplicates.
- [ ] **BE-P2-09** e2e runner `test/e2e-run.ts` + `test/e2e-cleanup.mjs` (owner D2-14, 01/11/2026):
  - one `runId` (timestamp + 4 random chars) and one log `test/e2e-runs/<runId>.json` per e2e file; `test/e2e-runs/` in `.gitignore`;
  - names start with `[E2E <runId>]` (services: `[E2E] …`, 50-char limit); building code `E2` + 4 random `A-Z0-9`, checked in the DB and regenerated on a clash; test phones `09` + 8 random digits, same check; test-manager passwords random, kept in memory only;
  - Boss = existing seed account; managers are created by the test through `/managers`, never Quản lý 1/2; dev buildings, rooms and rates are read only;
  - the log records `runId`, start/end, status `RUNNING` → `CLEANED` | `FAILED_CLEANUP`, and ids per table (`buildings`, `rooms`, `services`, `users`, `room_prices`, `rate_plans`, `viewings`, `room_images`), written **right after each create**; never passwords, tokens, cookies or connection strings;
  - `afterAll` touches only logged ids: NEW/CONFIRMED viewings → `CANCELLED` (note "[E2E] dọn dữ liệu thử"); PENDING prices/plans → `REJECTED` (same note); rooms, services, buildings → `is_active = false`; test managers → inactive + sessions revoked; approved rows and images stay; nothing is hard-deleted;
  - helpers for tests: reset the in-memory IP limiter, run the price job with `roomIds`;
  - `e2e-cleanup.mjs` by default only **lists**: every log not `CLEANED`, each id checked against the DB (still active? linked contract/invoice?), plus rows named `[E2E` found in no log (report only, never touched). `--apply <runId>` deactivates that log's ids; only the main session runs it, after the owner has seen the list.
  Done when: unit tests for code/phone generation with a clash, log never contains secrets, `afterAll` touches only logged ids, list mode writes nothing; Phase 1 e2e still 17/17; two full e2e runs pass and both logs are `CLEANED`.
- [ ] **BE-P2-10** `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` pass; list every `[ASSUMPTION]` used.

## Questions for the owner

None yet.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
