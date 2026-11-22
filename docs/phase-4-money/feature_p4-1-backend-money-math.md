# Phase 4 · Part 1 – Backend: money math (BE-P4-01..05)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | Phase 3 done; README answers |
| Unblocks | P4-2 |
| How | main session builds; reviewer before the stop (money) |
| Part done when | BE-P4-05 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md` or `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P4-1..12) and `docs/spec/00-overview.md` – D-05, D-09..D-14, D-21, D-35, D-38, D-40, D-41, D-42, **D-44**, A-01, A-04, A-06, A-09, A-10, A-21
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (what exists, schema), §3 (architecture), §7 (risks and test strategy), §8 (rights)
4. `docs/spec/16-billing.md` – BIL-01..04, BIL-07, BIL-09, BIL-22; `docs/spec/12-pricing.md` – "Electric tier calculation", RATE-04; `docs/spec/15-meters.md` – MTR-02, MTR-05, MTR-08
5. Code: `src/common/date/period.ts`, `src/common/date/today.ts`, `src/common/rates/rates-at.ts`

## Scope

In: pure functions only (period, tiers, consumption, monthly invoice lines), no I/O.
Out: routes, jobs, DB writes (P4-2 onward).

## Tasks

- [x] **BE-P4-01** Mở rộng `period.ts`: kỳ chứa một ngày (cho j của BIL-13), tháng thu của một kỳ, danh sách kỳ có `billingDate ≤ hôm nay`, hạn trả mùng 9 của tháng thu (BIL-01..04, BIL-22, D-40, D-41).
  Done when: test `BIL-01`, `BIL-02` (80.645 / 2.500.000 / 2.416.667), `BIL-22` (967.742 … 1.583.333), `BIL-03`, `BIL-04` và một ca năm nhuận 2028 đúng từng ngày.
- [x] **BE-P4-02** Bậc điện (`12-pricing.md` "Electric tier calculation"): chia theo `up_to` tăng dần, bậc cuối `up_to = null`, nhãn "Điện bậc {n} ({from}–{to} kWh)".
  Done when: 84 kWh → 50 × 3.000 + 34 × 3.500 = 269.000; 0 kWh → đúng một dòng "Điện (0 kWh)" số lượng 0, đơn giá bậc 1, tiền 0.
- [x] **BE-P4-03** Tiêu thụ giữa các mốc (MTR-05): cộng từng cặp liên tiếp, mốc thay đồng hồ dùng `old_meter_final`; đầu kỳ 1 là mốc `is_opening` của **chính hợp đồng** (MTR-02, Q-P3-12/13), đầu kỳ k>1 là mốc chốt kỳ k−1 của chính hợp đồng.
  Done when: ca MTR "thay đồng hồ 20/09 → 16 + 40 = 56 kWh"; ca giao nhận cùng ngày 1.284 / 1.290 / 1.350 → khách mới 60 kWh, 6 kWh khoảng trống không tính cho ai.
- [x] **BE-P4-04** Tính hóa đơn MONTHLY (hàm thuần, BIL-07): dòng RENT, ELECTRIC theo bậc, WATER (PER_M3 theo m³ / PER_PERSON theo số người), SERVICE unit ROOM × 1, SERVICE unit PERSON × số người, PARKING theo xe của dịch vụ; tháng lẻ nhân tỉ lệ ngày cho **mọi dòng cố định** (D-41, A-21, một lần làm tròn nửa lên cho mỗi dòng); đếm người theo Q-P3-18 (người mới +1 đơn vị trong tháng `move_in_date`, kể cả vào và đi trong cùng tháng; người có sẵn tính khi `move_out_date` null hoặc > `period_start`); đếm xe theo Q-P3-20 (giao nhau với tháng thu, kể cả xe đã `is_active = false` cuối tháng); thiếu đơn giá đã duyệt tại `period_start` → `RATE_PLAN_MISSING`; cờ bất thường MTR-08 (A-04).
  Done when: test `BIL-09` ra **3.119.000 đ** với đúng 7 dòng của spec; `total` = tổng `amount`; vào ở 20/03 lấy 12/31 tiền phòng và 12/31 từng dịch vụ cố định; đơn giá đổi hiệu lực 20/10 không áp cho kỳ 01/10–31/10, áp cho tháng 11 (D-09).
- [x] **BE-P4-05** ⏸ `npm run lint`, `npm run test`, `npm run build`; reviewer (tiền) trước khi dừng.
  Done when: output thật được dán vào báo cáo; liệt kê `[ASSUMPTION]` đã dùng (A-21, A-04).

## Questions for the owner

<!-- Q-P4-1..12 were answered on 22/11/2026 (README.md, D-44). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
