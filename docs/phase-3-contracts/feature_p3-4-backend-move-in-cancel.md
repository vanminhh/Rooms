# Phase 3 · Part 4 – Backend: move-in and cancel (BE-P3-20..22)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-3 committed. Not at the same time as P3-5 (same module) |
| Unblocks | P3-5, the move-in and cancel screens of P3-6 |
| How | main session builds (two routes in one module) → reviewer before the stop (money) |
| Part done when | BE-P3-22 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/00-overview.md` – D-14, D-26, D-35, D-38, A-02, A-16
3. `docs/spec/14-contracts.md` – CON-10, CON-11, CON-12, Acceptance
4. `docs/spec/15-meters.md` – MTR-02, MTR-03, MTR-04, MTR-06, MTR-07; `docs/spec/16-billing.md` – "Settlement" (the parts of a settlement row), BIL-17
5. `docs/spec/02-database.md` – the rules on contracts (ACTIVE needs `signed_at` and `moved_in_at`), meter readings, settlements
6. Code: the contracts service of P3-2/P3-3, `prisma/schema.prisma` (`MeterReading`, `Settlement`), `prisma/constraints.sql`

## Scope

In: `POST /contracts/:id/move-in`, `POST /contracts/:id/cancel`.
Out: meter photos (not needed, D-38), the "Chốt chỉ số" list (Phase 4), marking a refund as paid (Phase 4, Q-P3-3), the move-out settlement of an ACTIVE contract (Phase 4).

## Tasks

- [x] **BE-P3-20** Move-in (CON-10, CON-11, MTR-02, MTR-03, MTR-06): signed, deposit invoice `PAID` or deposit 0, else `DEPOSIT_NOT_PAID`; electric and water readings are both required (water also for `PER_PERSON`); a reading lower than the previous one of the room → `METER_VALUE_DECREASED` unless it is a meter replacement (MTR-04); record this contract's current move-in baselines separately from the previous tenant's closing readings, even on the same day (owner 20/11/2026, revised MTR-02); `readOn` more than 3 days from `start_date` needs a note; no meter photo (D-38); `moved_in_at` set, status `ACTIVE`; audit `contract.move_in`.
  Accepted by the owner on 20/11/2026: “mình kiểm tra thấy o rồi k lỗi gì chốt BEP320 đi”. This closes BE-P3-20 based on the owner's verification and the recorded native HTTP/mapping 111/111, contract regressions 102/102, offline DB checker 107/107, real service/SQL smoke 8/8, build/lint/typecheck and reviewer approval. No new unit count, migration CLI output or independent dev DB verification was supplied; do not invent those results or reopen the accepted task solely because Codex previously had P1001. A-24 remains an implementation limitation. The owner's commit is verified as `40747f6`, workspace clean before BE-P3-21. See [checkpoint BE-P3-20](plans/P3-4/CHECKPOINT-BE-P3-20.md).
  Done when: tests `CON-10`, `CON-11`, `MTR-03: …`; acceptance "Move-in before deposit paid → `DEPOSIT_NOT_PAID`"; a deposit-0 contract moves in without payment.
- [x] **BE-P3-21** Cancel (CON-12, D-35, A-16): HOLD only; deposit invoice `UNPAID` → `CANCELLED` with the reason; `PAID` → one settlement row with `deposit` = paid amount, `deposit_forfeit` = `depositKept` (0..deposit), other parts 0, `net` = refund (DB CHECK); status `CANCELLED`; the room is free again; the account is deactivated only if it was created for this contract and never activated; audit `contract.cancel`. Recording that the refund was paid is Phase 4 (Q-P3-3).
  Implemented and locally verified: native cancellation HTTP 79/79, contract/billing/idempotency/public regressions 240/240 (9 files), real service/Prisma/PostgreSQL smoke 11/11 including both payment/cancel orderings and audit rollback. Build/lint/typecheck pass, 4 old lint warnings; reviewer approved, full report in [checkpoint BE-P3-21](plans/P3-4/CHECKPOINT-BE-P3-21.md). No schema/dependency/dev DB changes. Await owner verification and commit before BE-P3-22; no full-backend or dev E2E result is claimed for this revision.
  Done when: acceptance test "Cancel after deposit paid with 1.000.000 kept from 2.500.000 → settlement net 1.500.000, room public again"; `depositKept` above the deposit → `VALIDATION_FAILED`; a reused guest account stays active with its viewings; an ACTIVE contract → `CONFLICT_STATE`.
- [ ] **BE-P3-22** ⏸ `npm run lint`, `npm run test`, `npm run build`, e2e (sign → pay → move-in, and sign → pay → cancel on the dev DB). Run the reviewer on the uncommitted changes and put its full report in the checkpoint report.
  Done when: all pass with real output quoted; `cleanup.mjs` list mode clean for this run; list the `[ASSUMPTION]`s used.

## Questions for the owner

- **Q-P3-15 (BE-P3-20) đã duyệt 20/11/2026:** owner trả lời “ok duyệt” cho apply migration `20261120000000_contract_meter_openings` lên DB dev sau review; sau đó báo đã kiểm tra không lỗi và yêu cầu chốt BE-P3-20. SHA-256 migration khớp `105076495B442D32EF79916B1798021A1D9CAADC602BD9C624373193C7A40BDE`. Ghi nhận nghiệm thu owner, không tự bổ sung log deploy/status chưa được cung cấp; không cần xin duyệt hoặc yêu cầu kiểm lại cùng bước đã nghiệm thu.

Đã trả lời Q-P3-14 ngày 20/11/2026: owner trả lời “ok” cho yêu cầu sửa schema và tạo migration đã trình. Đã triển khai đúng SQL đề xuất; không diễn giải thành duyệt áp dụng DB dev.

Đã chốt nghiệp vụ 20/11/2026 (thay cho lựa chọn A/B của Q-P3-12/13):

- Khách cũ ghi chỉ số lúc kết thúc thuê để chốt hóa đơn; khách mới vào lúc nào thì quản lý nhập điện và nước hiện tại lúc đó làm mốc riêng. Cuối tháng tính từ mốc khách mới, không lấy số khách cũ làm đầu kỳ tự động, không ghi đè số khách cũ. Đã cập nhật CON-10, MTR-02/10, BIL-07. Owner không chọn mã 1A/2A; không ghi nhận như đã duyệt các lựa chọn cũ. Nghiệp vụ sửa chỉ số hồi tố vẫn thuộc MTR-12/Phase 4, không mở rộng trong BE-P3-20.

Đã trả lời 16/11/2026:

- Q-P3-2 (BE-P3-20): không cần ảnh đồng hồ; đồng hồ lắp bên ngoài, quản lý tự xem (D-38).
- Q-P3-3 (BE-P3-21): Phase 3 chỉ lập quyết toán và hiện số tiền phải trả; ghi "đã trả lại tiền" làm ở Phase 4.

## Issues log

- 20/11/2026 · BE-P3-21 · Hoàn tất POST cancel HOLD với reason, actual paid deposit/forfeit/refund, UNPAID cancellation, idempotency 24h, scope trước replay và audit cùng transaction. Giữ nguyên user/session/viewings và lịch sử PAID; account pending đã inactive, refundPaidAt vẫn null. HTTP 79/79, hồi quy 240/240, PostgreSQL thực qua service 11/11; build/lint/noEmit đạt, 4 warning cũ, reviewer DUYỆT. Chờ owner kiểm/commit, chưa làm BE-P3-22; không đổi schema/dependency/env hoặc ghi DB dev.
- 20/11/2026 · BE-P3-20/21 · Owner báo đã commit; Git xác minh `40747f6`, workspace sạch. Tiếp tục riêng BE-P3-21: cancel HOLD, cọc UNPAID/PAID, settlement số tiền thực nhận, idempotency API-05 và audit cùng transaction. Account pending vốn đã inactive nên giữ nguyên user/session để không ảnh hưởng guest tái dùng hoặc activation từ HOLD khác. Không cần đổi schema/dependency; không mở BE-P3-22 hoặc ghi đã trả tiền hoàn (Phase 4).
- 20/11/2026 · BE-P3-20 · Owner báo đã kiểm tra ổn, không lỗi và yêu cầu chốt BE-P3-20. Đổi `[!]` thành `[x]`, P3-4 chờ commit riêng BE-P3-20; không kết luận toàn bộ P3-4 xong. Đây là nghiệm thu của owner sau hướng dẫn migration/test, không phải log CLI độc lập từ Codex; không suy đoán số lượng unit hoặc schema status. Git HEAD vẫn `b4da02b`, chưa commit BE-P3-20. Không đổi source, không chạy lại test hoặc DB; A-24 giữ nguyên, BE-P3-21..22 chưa làm.
- 20/11/2026 · BE-P3-20/Q-P3-15 · Owner đã duyệt apply DB dev. Kiểm checksum đạt; `migrate status` P1001, đọc lịch sử qua PrismaClient ứng dụng cũng lỗi kết nối. Chưa xác minh được migration pending nên chưa deploy, không có ghi DB. Cần kết quả status/deploy/status/generate từ máy có kết nối và full backend revision mới; quyền duyệt không hết hạn và không hỏi lại.
- 20/11/2026 · BE-P3-20 · Reviewer DUYỆT, không lỗi chặn. Smoke service/Prisma/SQL thực trên PostgreSQL nhúng 8/8, 3,35 giây, chứng minh baseline riêng cùng ngày và rollback sau INSERT audit; một session, không claim dev E2E/concurrency nhiều connection. Scoped test noEmit đạt sau sửa type assertion Supertest chỉ trong test. Dừng ở apply DB dev và full suite theo checkpoint, chưa commit.
- 20/11/2026 · BE-P3-20 · Owner duyệt tạo schema/migration; đã triển khai move-in service/DTO/routes và baseline riêng, replacement, scope/transaction/audit/rollback. Prisma validate/generate đạt, client 6.19.3; HTTP+mapping cuối 111/111, hồi quy hợp đồng 102/102; DB checker 107/107, 10 migration trên PostgreSQL nhúng giữ nguyên 28 bảng/sequences/FK và lịch sử PAID. Build/lint đạt, 4 warning cũ. DB dev preflight P1001, chưa apply; full backend revision mới chưa có kết quả. Dừng Q-P3-15 trước apply theo workflow. A-24 là giới hạn triển khai lịch sử thay đồng hồ cùng ngày, chưa được owner xác nhận như chính sách nghiệp vụ.
- 20/11/2026 · BE-P3-20 · Owner chốt mốc chốt thuê cũ và mốc vào ở mới riêng. DB cũ chặn các mốc khác nhau cùng ngày, kể cả vào ở đúng ngày cuối tháng; cần schema/migration. Đã chuẩn bị SQL và kiểm mô hình index trên PostgreSQL nhúng cô lập 8/8, gồm giữ row cũ, ba mốc cùng ngày và đúng baseline 60 kWh. Đây chưa phải kết quả feature hoặc migration trên schema đầy đủ. Chờ duyệt Q-P3-14 trước thay schema/migration; DB dev chưa được tác động.
- 20/11/2026 · BE-P3-20 · Bắt đầu riêng task từ `b4da02b`, Git sạch; đã đọc Before you start và rà code/schema. Còn hai lựa chọn nghiệp vụ chưa được MTR-02/03/12 chốt: giá trị khác nhau cùng ngày và nhập lùi ngày giữa lịch sử. Đã ghi đề xuất Q-P3-12/13; chưa code để tránh tự chọn cách sửa dữ liệu chỉ số có thể ảnh hưởng hóa đơn. Thay đồng hồ sẽ hỗ trợ bằng trường tùy chọn theo MTR-04, không cần đổi schema. BE-P3-21..22 chưa làm.

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
