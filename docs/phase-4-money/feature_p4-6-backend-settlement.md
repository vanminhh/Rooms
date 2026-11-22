# Phase 4 · Part 6 – Backend: move-out settlement and refund (BE-P4-29..33)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P4-4 committed (not in parallel with P4-5: both touch payments) |
| Unblocks | FE-P4-06 |
| How | planner writes `plans/P4-6/PLAN.md` → main session builds → reviewer before the stop (money) |
| Part done when | BE-P4-33 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md` or `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P4-1..12) and `docs/spec/00-overview.md` – D-05, D-09..D-14, D-21, D-35, D-38, D-40, D-41, D-42, **D-44**, A-01, A-04, A-06, A-09, A-10, A-21
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (what exists, schema), §3 (architecture), §7 (risks and test strategy), §8 (rights)
4. `docs/spec/16-billing.md` – BIL-13..20; `docs/spec/14-contracts.md` – CON-12 (cancel settlement already built); `docs/spec/00-overview.md` – A-01, A-06, A-10, D-14, D-44
5. Code: `src/modules/contracts/contract-cancel.service.ts`, `prisma/constraints.sql` (`settlements_*` CHECKs)

## Scope

In: dry-run and real settlement, FINAL invoice due today + 7 days (D-44), settled invoices, refund-paid `{ method, paidAt?, note? }` once (D-44), `moveOutDate` from start date to today (D-44).
Out: renewals and early-leave discounts (Phase 5, Q-01).

## Tasks

- [ ] **BE-P4-29** `settlement-calc.ts` (hàm thuần, BIL-13..18): j = kỳ chứa `moveOutDate` (j = N nếu ≥ `end_date`); `last_period_amount` theo BIL-14 (kỳ j chưa phát hành → tiền phòng đủ + dịch vụ/xe đủ theo A-01; điện nước từ mốc chốt cuối đã phát hành tới mốc cuối; DRAFT bị gộp); `remaining_rent` theo BIL-15 (kỳ cuối lẻ prorate theo D-41); `previous_debt` theo BIL-16; `net` theo BIL-17.
  Done when: ca nghiệm thu "dọn sớm 25/11/2026 hợp đồng BIL-01, cọc 2.500.000: j = 3, `remaining_rent` = 3 × 2.500.000, net âm → tổng hóa đơn FINAL = −net"; ca "hợp đồng đã phát hành kỳ N, quyết toán sau 10 ngày → chỉ điện nước 10 ngày đó".
- [ ] **BE-P4-30** `POST /contracts/:id/settlement?dryRun=true` (BIL-13, UI-06): trả đúng cùng số liệu như lượt ghi thật, không ghi gì, `no-store`; từ chối khi còn kỳ chưa có hóa đơn (A-10) với thông báo "Còn kỳ chưa có hóa đơn, hãy tạo hóa đơn kỳ đó trước"; chỉ hợp đồng ACTIVE (HOLD dùng CON-12); `moveOutDate` theo Q-P4-10.
  Done when: ca A-10 (`CONFLICT_STATE`, sau khi bấm "Tạo hóa đơn kỳ này" thì quyết toán chạy được); `dryRun` không tạo dòng nào trong `settlements`/`invoices`.
- [ ] **BE-P4-31** Ghi thật trong **một** transaction (BIL-18, BIL-19): mốc chỉ số cuối, dòng `settlements`, hóa đơn FINAL khi `net < 0` (các dòng period-j, `REMAINING_RENT` mỗi kỳ còn lại, `PREVIOUS_DEBT` mỗi hóa đơn gộp, `DAMAGE`, `DEPOSIT_FORFEIT`, `DEPOSIT_OFFSET` âm; tổng = −net), hạn trả theo Q-P4-12; hóa đơn UNPAID cũ → `SETTLED` + `settlement_id`; DRAFT bị hủy với lý do "Gộp vào thanh lý"; hợp đồng `ENDED` + `ended_at`; người ở có `move_out_date`; xe `is_active = false`; phòng về "Trống"; tài khoản người thuê bị vô hiệu nếu không còn hợp đồng HOLD/ACTIVE (thu hồi session); audit; thông báo người thuê.
  Done when: CHECK `settlements_net` và `settlements_final_invoice` không bao giờ bị DB chặn (BE tính trước); `net ≥ 0` → không có hóa đơn FINAL; quyết toán hai lần → `CONFLICT_STATE` (UK `settlements.contract_id`); A-06/BIL-20: ngày ở quá hạn chỉ vào được qua `damages` kèm ghi chú.
- [ ] **BE-P4-32** `POST /settlements/:id/refund-paid` (Q-P3-3) theo Q-P4-8: đặt `refund_paid_at` một lần, audit; lưu ý CHECK của DB chỉ cho ghi khi `net > 0`.
  Done when: `net ≤ 0` → `CONFLICT_STATE`; gọi lần hai → `CONFLICT_STATE` (hoặc trả lại kết quả cũ nếu có `Idempotency-Key`).
- [ ] **BE-P4-33** ⏸ lint + test + build + e2e (quyết toán dry-run → ghi thật → FINAL → ghi thu); reviewer.

## Questions for the owner

<!-- Q-P4-1..12 were answered on 22/11/2026 (README.md, D-44). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
