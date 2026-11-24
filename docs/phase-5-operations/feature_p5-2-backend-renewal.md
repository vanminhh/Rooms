# Phase 5 · Part 2 – Backend: renewal (BE-P5-05..09)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P5-1 committed; owner approves migration M1 (create, then apply) |
| Unblocks | P5-3 (REQ-04 → CON-17), P5-6 |
| How | planner writes `plans/P5-2/PLAN.md` first; reviewer before the stop (schema) |
| Part done when | BE-P5-09 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P5-1..16) and `docs/spec/00-overview.md` – **D-45**, D-13, A-06, A-09
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (migration M1), §4 "P5-2", §7 (index risk)
4. `docs/spec/14-contracts.md` – CON-06, CON-12, CON-17..21; `docs/spec/16-billing.md` – BIL-06, BIL-13; `docs/spec/02-database.md` – DB-B1, DB-B7, DB-07
5. Code: `src/modules/billing/renewal-switch.ts`, `src/jobs/monthly-invoice.job.ts`, `src/modules/contracts/contracts.service.ts`, `src/modules/billing/settlement.service.ts`, `prisma/constraints.sql:70`, `prisma/check-constraints.mjs`

## Scope

In: migration M1, create/sign/cancel a renewal, settlement guard, re-check of BIL-06 and CON-20/21.
Out: the renewal request (P5-3), FE.

## Tasks

- [x] **BE-P5-05** Migration M1 (D-45 (1)), only after the owner approves creating it: `contracts_one_open_per_room` becomes `WHERE status = 'ACTIVE' OR (status = 'HOLD' AND previous_contract_id IS NULL)`; update `constraints.sql`; add/adjust `check-constraints.mjs` scenarios (renewal HOLD beside ACTIVE allowed; a second new contract for an ACTIVE/HOLD room blocked). Check offline (PGlite + `migrate diff`); apply to dev only after the second approval. Owner approved file creation and offline checks on 24/11/2026.
  CP-2 verified on the owner host: M1 applied, 13 migrations up to date, both unique index definitions confirmed.
  Done when: the DB checker prints its real count and every scenario passes; the report says whether M1 is applied on dev.
- [x] **BE-P5-06** `POST /contracts/:id/renew` (CON-17): from an ACTIVE contract in scope create a HOLD contract with `previousContractId`, same room and tenant, same rent (DB-B1) and deposit, `startDate` = old `endDate` + 1 (DB-B7), `termMonths ≥ 3`, services copied and editable, **no** deposit invoice; lock old contract + room in one transaction; audit `contract.create`. Omitted `terms` copies the old clauses, a string replaces them and explicit `null` clears them (D-46). Also block a brand-new contract for a room whose old contract has ended while its renewal is still HOLD (D-45 (1)).
  Done when: second renewal of the same contract → `CONFLICT_STATE`; HOLD/ENDED source → `CONFLICT_STATE`; `termMonths = 2` → `CONTRACT_TERM_TOO_SHORT`; other building → `OUT_OF_SCOPE`; no `DEPOSIT` invoice; `startDate` right across a leap February.
- [x] **BE-P5-07** Sign a renewal (CON-18) through the existing CON-06 path (print page CON-22, private scan, no new account, no deposit, no move-in step).
  Done when: after signing `signedAt` is set and status stays HOLD; `switchDueRenewals` with `today ≥ startDate`, the final invoice of period N and handover readings → `SWITCHED`, occupants and vehicles copied (CON-19); without the final invoice → `WAITING_FINAL_INVOICE`, no throw.
- [x] **BE-P5-08** Cancel a not-yet-switched renewal with the existing `POST /contracts/:id/cancel` (D-45 (10): CANCELLED, no settlement, no refund, audit). Settlement of a contract with a signed renewal → `CONFLICT_STATE` "Hợp đồng đã có gia hạn, hãy hủy gia hạn trước" (D-45 (9), `settlement.service.ts`). Re-check CON-20, CON-21: `expiringContracts`, `expiredContracts` and the 30/7-day reminders skip a contract that has a renewal; list any gap left.
  Done when: a contract with a signed renewal is not in `expiringContracts` and gets no expiry reminder; after cancelling the renewal it is back and the room is not wrongly locked; settlement with a renewal → `CONFLICT_STATE`.
- [!] **BE-P5-09** ⏸ lint + test + build + check-constraints + e2e (create renewal → sign → run the switch job); reviewer.
  Owner reports the host dev E2E and list-only cleanup passed; independent two-session races remain unverified. See CP-5 below.
  Done when: real output; `scripts/e2e/cleanup.mjs` list clean for the run.

## CP-1 kiểm migration offline (24/11/2026)

- Owner approved creating `20261124000000_renewal_open_room` and checking it offline. The checkpoint is ready for separate approval to apply it to dev.
- `node prisma/check-constraints.mjs . prisma` exited 0 with `115/115 tình huống đúng như mong đợi`, up from the 110/110 baseline. Prisma generated the schema offline from the current model.
- The replay applied all 12 earlier migrations in embedded PostgreSQL, created a source contract fixture, confirmed that the old index blocked the renewal and applied the new migration. The source record and other index definitions survived. The renewal could wait and switch, and conflicting occupancy was rejected.
- Baseline tests for signing, cancelling, switching and reminders were 123/123. The final `npm run lint` exited 0 with `Found 4 warnings and 0 errors.` `npm run build` exited 0.

### Review độc lập

**Kết luận DUYỆT** checkpoint tạo migration M1 và kiểm tra offline. Phạm vi gồm thay đổi chưa commit của BE-P5-05 và quyết định D-46, tổng cộng 9 file, +47/−18 dòng tại lúc rà. Hai file kế hoạch nằm ngoài phạm vi review độc lập.

**Lỗi chặn.** Không có.

**Nên sửa ở BE-P5-06.** `Source/backend/src/modules/contracts/contracts.service.ts:195–217` hiện loại điều kiện hợp đồng mở khỏi truy vấn rồi dựa vào index. Đặt kiểm tra mới trong giao dịch sau khi khóa phòng, và kiểm qua `POST /contracts` với hợp đồng nguồn `ENDED` cùng gia hạn `HOLD` (D-45 (1)).

**Ghi chú**

- `Source/backend/prisma/migrations/20261124000000_renewal_open_room/migration.sql:1–8` thay index trong cùng một giao dịch. Nếu tạo index thất bại, giao dịch hoàn tác cả lệnh xóa index cũ. Predicate mới thu hẹp tập dòng tham gia nên dữ liệu hợp lệ theo index cũ thỏa index mới. Migration giữ dữ liệu và khóa duy nhất `previous_contract_id` tại `Source/backend/prisma/migrations/20261029000000_init/migration.sql:561`.
- `Source/backend/prisma/check-constraints.mjs:123–140` kiểm gia hạn HOLD cạnh ACTIVE, hợp đồng mới khi phòng có HOLD hoặc ACTIVE, hai ACTIVE cùng phòng, chuyển sau khi nguồn kết thúc và duy nhất lần gia hạn kể cả sau hủy. Các ca lỗi kiểm đúng tên index.
- `docs/spec/14-contracts.md:70–71,94` nhất quán với quyết định tại `docs/phase-5-operations/README.md:53`. Bỏ `terms` thì sao chép, chuỗi thì thay thế và `null` thì xóa. Trang in lấy điều khoản đã lưu của bản gia hạn.

**Đã kiểm** migration, `constraints.sql`, các ca DB-07, schema và index gốc, luồng tạo hợp đồng cùng D-45 (1), D-46, CON-17, CON-18 và CON-22. `git diff --check` trả mã 0. Reviewer rà chỉ đọc, không chạy migration hoặc kết nối DB dev.

## Questions for the owner

<!-- Q-P5-1..17 were answered on 24/11/2026 (README.md, D-45 and D-46). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

- 24/11/2026 · BE-P5-05 · The dev read-only status check returned `P1001` and both configured hosts returned `ENOTFOUND`. CP-2 needs a reachable dev connection and the owner's separate approval to apply M1.
- 24/11/2026 — CP-2: owner approved applying M1 to dev. Pending host-side HOLD renewal preflight, deployment and catalog verification.
- BE-P5-06: POST /contracts/:id/renew implemented. Focused renewal suite: 11/11. New room bookings now check all HOLD and ACTIVE contracts while the room is locked. Real dev HTTP e2e is deferred to BE-P5-09.

## CP-3..5 — 24/11/2026

BE-P5-07 and BE-P5-08 implemented. The waiting renewal prints the source signer after checking the tenancy, signs with the existing tenant account and stays HOLD. Settlement checks the signed successor while holding the room lock. Cancelling the successor restores the source to the expiry dashboard and reminders. The switch and staff operations lock the room before contract rows.

- Full backend suite: 139 files, 2871/2871 passed. Build passed. Lint: 0 errors, 4 existing warnings. DB checker: 115/115 offline.
- Dedicated HTTP + Prisma E2E: 1/1 passed on embedded PostgreSQL, single connection, with a mocked private scan provider. The test created only its own fixture in an outer rollback, handled missing period-N invoice, switched once when readings were present and verified fixture removal.
- Dev E2E and list-only cleanup could not connect to Supabase from this session. M1 applied on dev was verified separately in CP-2. Independent two-connection switch/switch and sign/settle races remain open. A serial retry test does not establish transaction isolation across connections.
- Host verification from Source/backend: node --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.config.e2e.ts test/contracts-renewal.e2e-spec.ts, followed by node --env-file=.env scripts/e2e/cleanup.mjs (list only).

### Independent reviewer, final report

**DUYỆT phần code P5-2.** Hai lỗi chặn đã được sửa và có ca hồi quy. Bản gia hạn giữ thông tin người ký cùng ngày ra thực tế. Xe đăng ký trong lúc chờ chuyển giữ đúng ngày đăng ký, cả trên bản ghi nguồn lẫn bản ghi mới.

Fixture E2E riêng chỉ tác động đến hợp đồng thử. Nó kiểm tra từ tạo, in, ký đến chuyển hợp đồng, xác nhận đủ hai chỉ số mở đầu, đúng một người ký và không phát sinh hóa đơn cọc. Sau rollback, fixture kiểm lại số phòng và hợp đồng thử còn lại bằng 0. Git diff --check đạt.

**Nghiệm thu DB dev còn mở.** Kết quả do phiên chính ghi nhận gồm 2.871/2.871 test backend, 115/115 ca ràng buộc và E2E 1/1 trên PostgreSQL nhúng qua một kết nối Prisma. Còn phải xác minh E2E trên DB dev và các ca tranh chấp qua hai kết nối độc lập.
