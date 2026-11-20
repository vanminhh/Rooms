# Phase 3 · Part 5 – Backend: occupants, CCCD photos, vehicles, services (BE-P3-23..27)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-4 committed (same module) |
| Unblocks | the occupant and vehicle screens of P3-6, the tenant contract detail of P3-7 |
| How | main session builds → reviewer before the stop (personal data) |
| Part done when | BE-P3-27 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/00-overview.md` – D-07, D-17, D-37
3. `docs/spec/14-contracts.md` – CON-13..16, API table
4. `docs/spec/02-database.md` – DB-B5, DB-B6, DB-B9, the occupant and vehicle rules; `docs/spec/20-reports-audit-settings.md` – AUD-01, AUD-02
5. Code: the contracts service, the P3-1 CCCD and private-upload helpers, `src/modules/rooms/rooms.service.ts` (how active occupants are counted for `max_occupants`), `src/modules/buildings/services.service.ts`

## Scope

In: occupant add/edit/move-out, direct tenant roommate additions to their own contract (owner 20/11/2026, CON-13/15), optional roommate CCCD/photos and their signed staff view, vehicles and the plate lookup, editing the services of a contract.
Out: other tenant change-request operations `OCCUPANT_CHANGE` / `VEHICLE_CHANGE` (Phase 5, revised CON-15); monthly fee calculations for occupants/services/vehicles (Phase 4, Q-P3-18).

## Tasks

- [x] **BE-P3-23** Occupants (CON-13, DB-B6, CON-04): `GET/POST/PATCH /contracts/:id/occupants` for staff in scope; active occupants ≤ `max_occupants` with the counting rule of DB-B6; exactly one signer; CCCD encrypted with `last4`; photos are verified private `ID_PHOTO` assets of this contract; moving out sets `move_out_date`, never deletes.
  Owner revision 20/11/2026: add `POST /me/contracts/:id/occupants` for the owning TENANT, no approval request; roommate CCCD/photos are optional. Keep account/signer ownership and privacy protections. Do not infer a vehicle from an occupant, multiply room rent/electricity, or implement monthly billing in BE-P3-23. Store the move-in date so Phase 4 can count additional PERSON fees in that same month.
  20/11/2026: owner confirmed commit, verified `ab5ebac` before starting BE-P3-24. BE-P3-23 results: full backend 110 files/2405 tests pass (120.51s), HTTP 79/79, capacity 24/24, room/move-in regressions 117/117, real service/Prisma/PostgreSQL embedded smoke 7/7; build/lint/noEmit pass, 4 old lint warnings. Reviewer approves code. A-25/26 remain recorded implementation defaults without a separate policy answer: HOLD/ACTIVE writes and inclusive interval capacity including HOLD, coordinated with room-limit/move-in guards. No schema/dependency/env or dev DB changes; monthly billing remains Phase 4. Full report and manual checks in [checkpoint BE-P3-23](plans/P3-5/CHECKPOINT-BE-P3-23.md).
  Done when: tests `CON-13: …` including the limit on the day someone moves out (counted through that day) and a second signer refused.
- [x] **BE-P3-24** CCCD photo view (CON-16, DB-B9): `GET /contracts/:id/occupants/:oid/id-photos` returns signed URLs valid ≤ 5 minutes and writes `occupant.view_id`; staff in scope only; the tenant routes never expose photos or the full number.
  20/11/2026: implemented and verified, awaiting owner review/commit. Final HTTP 139/139 in 2 files (113 occupant tests including 34 new photo-view cases, 26 document regressions; 4.47s), isolated real service/Prisma/PostgreSQL smoke 7/7; build/lint/scoped noEmit pass, 4 old lint warnings; independent reviewer DUYỆT. Full-backend attempt was blocked by automatic approval review over potential telemetry to `dc.services.visualstudio.com`; no full-suite result is claimed. No schema/dependency/env/dev DB changes or new business assumptions. Details and full review in [checkpoint BE-P3-24](plans/P3-5/CHECKPOINT-BE-P3-24.md).
  Done when: tests: each call writes one audit row; another building → `OUT_OF_SCOPE`; a tenant token → `FORBIDDEN`.
- [ ] **BE-P3-25** ⏸ Vehicles (CON-14, DB-B5, D-07): `GET/POST/PATCH /contracts/:id/vehicles`; plate normalized (uppercase, no spaces); `service_id` must be a VEHICLE service of the building; removing sets `is_active = false` and `removed_at`; an active plate elsewhere → the friendly error mapped from the DB rule; `GET /vehicles?plate=` for "Tra cứu xe" in scope.
  Done when: tests `CON-14: …`: duplicate active plate refused, a removed plate can be registered again, lookup finds by partial plate within scope only. Stop and report BE-P3-23..25.
- [ ] **BE-P3-26** Contract services (D-07, DB-B5): `GET/PATCH /contracts/:id/services` for HOLD and ACTIVE contracts; only ROOM/PERSON services of the same building; audit the change.
  Done when: tests for a service of another building and a VEHICLE service, both refused.
- [ ] **BE-P3-27** ⏸ `npm run lint`, `npm run test`, `npm run build`, e2e (occupants and vehicles on the dev DB). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; no response or log contains a full CCCD number; list the `[ASSUMPTION]`s used.

## Questions for the owner

- **Q-P3-16 — writable contract statuses:** implemented the presented HOLD/ACTIVE-only mutation default as A-25 after the continuation request; ENDED/CANCELLED are readable history. The alternative is allowing staff to correct ended/cancelled history. Owner committed BE-P3-23 (`ab5ebac`); no separate answer to this policy is recorded. Keep the assumption history; BE-P3-24 is a history read and does not change this default.
- **Q-P3-17 — capacity for scheduled/backdated occupants:** implemented the presented inclusive overlapping-stay default as A-26, including planned HOLD. Room-limit decrease retains the existing current-day guard and adds future peak checking from today; move-in uses the same guard. The alternative is only today's active count. Owner committed BE-P3-23 (`ab5ebac`); no separate answer to this policy is recorded. Departure today still counts through today, an already confirmed rule. BE-P3-24 does not change capacity.
- **Q-P3-18 — answered 20/11/2026 (Phase 4):** owner said “cứ công 1 ng bất kkif vào thời gian nào”: count one additional person in the entry month regardless of entry day, without person-specific day-proration. For a full November contract and a 30.000 đ PERSON fee, entry on 16/11 or 29/11 adds 30.000 đ. Keep D-41 for the contract's own partial months; do not infer a vehicle or settle its mid-month proration from this answer.

## Issues log

- 20/11/2026 · BE-P3-24 checkpoint · HTTP cuối 139/139 (113 occupant, gồm 34 ca mới; 26 document; 4,47s), SQL nhúng 7/7, build/lint/noEmit đạt, reviewer DUYỆT; 4 warning lint cũ. Signed URL 300 giây, một audit/request, scope hiện tại và oid thuộc contract, không trả link khi audit lỗi. Full suite bị auto-review chặn vì cảnh báo telemetry ngoài chưa xác minh; không coi 2405 của BE-P3-23 là kết quả lượt này. Chờ owner kiểm/commit BE-P3-24, rồi BE-P3-25.
- 20/11/2026 · BE-P3-24 bắt đầu · Owner báo đã commit BE-P3-23, Git xác minh `ab5ebac`, workspace sạch. Tiếp tục riêng API ảnh CCCD theo CON-16/DB-B9; chưa mở BE-P3-25. Giữ A-25/26 của commit trước là mặc định triển khai, không suy ra owner đã trả lời riêng từng policy.
- 20/11/2026 · BE-P3-23 checkpoint · API staff và tenant self-add đã triển khai, full 2405/2405 đạt (110 file, 120,51s), reviewer DUYỆT; HTTP79/capacity24/room-movein117/SQL7 đạt. Sửa audit chỉ ghi field được gửi, thêm VI/EN và mở coverage catalog cho API mới. Build/lint/noEmit đạt, 4 warning cũ. Chờ owner kiểm A-25/26 và commit trước BE-P3-24; không coi hai policy là câu trả lời rõ của owner. Full report trong checkpoint, không đổi schema/env/dependency/DB dev hoặc tính hóa đơn tháng.
- 20/11/2026 · BE-P3-23 tiếp tục · Workspace đã nối lại; đã lưu Q-P3-18 +1 người bất kể ngày vào trong tháng. Theo yêu cầu “tiếp tục”, xây bản triển khai/review với hai mặc định đã trình, đánh dấu A-25/26 chưa xác nhận từng policy; không ghi owner đã chốt Q-P3-16/17. Thêm staff APIs và tenant self-add, mã hóa/ảnh optional, room-locked capacity xuyên ngày, guard phòng/move-in. Đang test/review, không schema/dependency/env/DB dev changes hoặc bộ tính hóa đơn Phase 4.
- 20/11/2026 · Owner sửa luồng người ở · Quản lý hoặc tenant tự thêm người ở cùng, không yêu cầu request duyệt cho thao tác thêm; CCCD người ở cùng tùy chọn. Tiền phòng/điện theo phòng, phí PERSON tính từ tháng vào ở lúc chốt tháng; xe theo đăng ký thực tế. Cập nhật spec/task/plan, thêm Q-P3-18 full tháng hay theo ngày cho người/xe thêm giữa tháng; không tự chọn cách thu, không bỏ maxOccupants hoặc coi Q-P3-16/17 đã được duyệt. Chưa đổi source/schema/env/DB hoặc claim feature đã triển khai.
- 20/11/2026 · BE-P3-23 · Owner confirmed BE-P3-22 commit; Git `af383a0`, clean. Read Before you start and inspected schema, private upload, crypto, safe contract reads and room locking. No source changed: collect Q-P3-16/17 before inventing status/capacity policy. Snapshot edits will not reassign the tenant account or signer role; no hard delete, CCCD disclosure or BE-P3-24 photo viewing in this task. Plan prepared; wait for the two business decisions.
<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
