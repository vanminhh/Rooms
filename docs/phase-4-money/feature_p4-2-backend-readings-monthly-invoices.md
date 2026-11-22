# Phase 4 · Part 2 – Backend: readings and monthly invoices (BE-P4-06..13)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P4-1 committed |
| Unblocks | P4-3, P4-4 |
| How | planner writes `plans/P4-2/PLAN.md` → main session builds → reviewer before the last stop (money + jobs) |
| Part done when | BE-P4-13 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md` or `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P4-1..12) and `docs/spec/00-overview.md` – D-05, D-09..D-14, D-21, D-35, D-38, D-40, D-41, D-42, **D-44**, A-01, A-04, A-06, A-09, A-10, A-21
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (what exists, schema), §3 (architecture), §7 (risks and test strategy), §8 (rights)
4. `docs/spec/15-meters.md` – all; `docs/spec/16-billing.md` – BIL-05..08, BIL-21; `docs/spec/14-contracts.md` – CON-18..21; `docs/spec/19-notifications.md` – NOTI-06
5. Code: `src/jobs/room-price-sync.job.ts` (job pattern), `src/modules/billing/`, `src/modules/notifications/dashboard.service.ts`, `src/modules/contracts/contract-move-in.service.ts`

## Scope

In: `/meter-readings/due`, batch readings, auto-issue, `POST /invoices/:id/issue`, the 00:05 job with catch-up and the renewal hand-over, "Tạo hóa đơn kỳ này", the money groups of "Việc hôm nay".
Out: creating renewals (Phase 5), mails (P4-3), payments (P4-4).

## Tasks

- [x] **BE-P4-06** Module `meters` + `GET /meter-readings/due` (MTR-09): mọi DRAFT MONTHLY trong phạm vi tòa, kèm phòng, người thuê, mốc trước, ngày thu, cờ quá hạn; draft quá hạn lên đầu; `?buildingId=` theo API-08.
  Done when: manager chỉ thấy tòa của mình, `buildingId` ngoài phạm vi → `OUT_OF_SCOPE`; draft của tháng trước xếp trước draft tháng này.
- [x] **BE-P4-07** `POST /meter-readings` theo lô (MTR-11): mỗi phần tử kiểm riêng, trả thành công/lỗi theo từng phần tử; `value` < mốc trước và không phải thay đồng hồ → `METER_VALUE_DECREASED` (MTR-03, MTR-04); `read_on ≥ p(k) − 2 ngày` (MTR-10); không cần ảnh (D-38); nước vẫn ghi cả khi `PER_PERSON` (MTR-06).
  Done when: ca nghiệm thu MTR "nhập điện cho tòa PER_PERSON thì phát hành luôn, tòa PER_M3 chờ nước"; hai nhân sự nhập cùng phòng/ngày song song → một bên lỗi, không có hai dòng.
- [x] **BE-P4-08** Tự tính và phát hành khi đủ chỉ số (BIL-07, BIL-08): `UNPAID`, `issue_date` = hôm nay, `due_date` = ngày cuối của tháng thu, `meta` ghi id/giá trị/ngày của mốc đầu và cuối; MTR-08 thì giữ DRAFT chờ bấm "Phát hành"; thông báo người thuê theo Q-P4-1.
  Done when: hóa đơn kỳ 01/09–30/09 phát hành 01/10 hạn 31/10 (BIL-01); `total` = tổng dòng (DB-B4); tiêu thụ gấp hơn 2 lần trung bình 3 kỳ trước → vẫn DRAFT kèm cờ.
- [x] **BE-P4-09** `POST /invoices/:id/issue`: chỉ DRAFT, tính lại tại thời điểm bấm, nhân sự trong phạm vi, audit `invoice.issue`.
  Done when: DRAFT thiếu chỉ số → `CONFLICT_STATE`; hóa đơn đã UNPAID → `CONFLICT_STATE`; manager tòa khác → `OUT_OF_SCOPE`.
- [x] **BE-P4-10** Job `monthly-invoice` 00:05 + lúc khởi động (BIL-05, D-21): mọi hợp đồng ACTIVE có k với `hôm nay − 7 ngày ≤ p(k) ≤ hôm nay` và chưa có hóa đơn MONTHLY chưa hủy → tạo DRAFT đúng ngày kỳ k; vi phạm UK = "đã có", không phải lỗi; đếm riêng kỳ quá 7 ngày trong dòng tổng kết.
  Done when: cả 3 ca nghiệm thu bù của BIL-05 (tắt 23:50 30/09 → 01:00 01/10; không chạy 01/10 và 02/10 → chạy 03/10 tạo một lần; ngày thu cách 8 ngày → không tạo, có đếm); chạy hai lần cùng ngày vẫn một DRAFT.
- [x] **BE-P4-11** Cùng job: chuyển ca gia hạn (BIL-06, A-09) — hợp đồng gia hạn đã ký có `start_date ≤ hôm nay` và hợp đồng trước còn ACTIVE → cũ `ENDED` + `ended_at`, mới `ACTIVE` + `moved_in_at`, copy người ở và xe đang hoạt động (CON-18, CON-19); BIL-05 chạy trước nên DRAFT kỳ N của hợp đồng cũ đã có. Tạo hợp đồng gia hạn vẫn là Phase 5: test dựng sẵn hàng gia hạn.
  Done when: ca nghiệm thu "BIL-06 bù: ngày chuyển bị bỏ được chuyển ở lần chạy sau, sau khi DRAFT kỳ N của hợp đồng cũ đã được tạo".
- [x] **BE-P4-12** `POST /contracts/:id/monthly-invoices { periodNo }` (BIL-21) + nhóm việc hôm nay (NOTI-06): draft chờ chỉ số (đỏ từ mùng 2, D-42), kỳ chưa có hóa đơn quá 7 ngày, hóa đơn quá hạn, hợp đồng sắp hết hạn 30 ngày và hợp đồng quá hạn chưa xử lý (CON-20, CON-21).
  Done when: ca nghiệm thu BIL-21 (tắt 30/09→11/10: không tự tạo, nút tạo được kỳ 01/09–30/09, bấm lần hai → `CONFLICT_STATE`); `periodNo` ngoài 1..N → `VALIDATION_FAILED`; ngày thu ở tương lai → `CONFLICT_STATE`; manager tòa khác → `OUT_OF_SCOPE`; audit `invoice.create_missed`.
- [x] **BE-P4-13** ⏸ lint + test + build + e2e (chốt chỉ số → phát hành trên DB dev); reviewer.
  Done when: output thật; `cleanup.mjs` ở chế độ list sạch cho lượt này.

## Questions for the owner

<!-- Q-P4-1..12 were answered on 22/11/2026 (README.md, D-44). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

- 22/11/2026 — Hạn hóa đơn tháng là cuối tháng thu. Kỳ tháng 9 phát hành 11/10 có hạn 31/10. Đã duyệt phát hành sau cuối tháng thu. Hóa đơn tháng 9 phát hành ngày 02/11 giữ hạn 31/10 và quá hạn ngay khi phát hành.
- 22/11/2026 · BE-P4-11 · Index `contracts_one_open_per_room` (HOLD hoặc ACTIVE, một hợp đồng mỗi phòng) không cho hợp đồng gia hạn HOLD tồn tại cạnh hợp đồng cũ ACTIVE. Bước chuyển ca chỉ test được bằng unit test với hàng dựng sẵn. Phase 5 (tạo gia hạn, CON-17) cần chủ dự án quyết cách sửa index; chưa có migration nào.
- 22/11/2026 · BE-P4-11 · Chủ trọ quyết: mọi tòa cần cả chỉ số điện (kWh) và nước (m³) bàn giao trên hóa đơn kỳ N mới chuyển ca; tòa PER_PERSON ghi số nước để lưu lịch sử, không tính tiền (MTR-06). Thay cho [ASSUMPTION] cũ "PER_PERSON chỉ cần số điện".
