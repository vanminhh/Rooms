# Phase 4 · Part 7 – Frontend: staff money pages (FE-P4-01..09)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P4-4 committed (settlement UI needs P4-6, transactions page needs P4-5) |
| Unblocks | P4-8 |
| How | planner writes `plans/P4-7/PLAN.md` → main session builds |
| Part done when | FE-P4-09 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/backend/CLAUDE.md` or `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. [README.md](README.md) of this phase (owner answers Q-P4-1..12) and `docs/spec/00-overview.md` – D-05, D-09..D-14, D-21, D-35, D-38, D-40, D-41, D-42, **D-44**, A-01, A-04, A-06, A-09, A-10, A-21
3. [plans/PHASE/PLAN.md](plans/PHASE/PLAN.md) – §2 (what exists, schema), §3 (architecture), §7 (risks and test strategy), §8 (rights)
4. `docs/spec/30-frontend.md` – rows `/ql`, `/ql/chi-so`, `/ql/hoa-don`, `/ql/hoa-don/:id`, `/ql/giao-dich`, `/ql/hop-dong/:id` (settlement); UI-01..09; `docs/spec/31-ui-kit.md`
5. Code: `src/app/routes.tsx`, `src/layouts/StaffLayout.tsx`, `src/features/contracts/` (`DepositCard`), `src/shared/`

## Scope

In: the staff pages of Phase 4, built from the kit only.
Out: tenant pages (P4-8), English (the staff app is Vietnamese only, LOC-01).

## Tasks

- [ ] **FE-P4-01** Khung route và menu của cả phase: `/ql/chi-so`, `/ql/hoa-don`, `/ql/hoa-don/:id`, `/ql/giao-dich` (Boss); cập nhật mọi test đọc `routes[0..2]`, stub trang mới và mảng menu mong đợi (bài học FE-EX-03, FE-P3-01). Done when: `npm run test:components` và `npm run build` đạt, guard theo vai trò đúng.
- [ ] **FE-P4-02** `/ql/chi-so` (MTR-09, MTR-11, UI-07 — 360 px trước): danh sách draft đến hạn, ô số điện/nước, ảnh tùy chọn, cờ bất thường, phòng còn thiếu sau mùng 1 hiện đỏ (D-42), lưu theo lô và hiện kết quả từng dòng. Done when: 4 trạng thái UI-03; lỗi `METER_VALUE_DECREASED` hiện đúng ô.
- [ ] **FE-P4-03** `/ql/hoa-don`: lọc theo tòa/trạng thái/loại/quá hạn/kỳ, nhãn trạng thái từ bản đồ chung (UI-02). Done when: nhãn "Nháp/Chưa thanh toán/Đã thanh toán/Đã quyết toán/Đã hủy/Quá hạn" đúng 16-billing.
- [ ] **FE-P4-04** `/ql/hoa-don/:id`: dòng hóa đơn, dòng bậc điện, mốc chỉ số, VietQR; "Phát hành", "Ghi thu tay" (chọn phương thức + hộp xác nhận nêu số tiền, UI-04), "Lập lại", "Nhắc". Done when: mọi hành động tiền đều có hộp xác nhận nêu số tiền; không có phép tính nào ở FE (UI-06).
- [ ] **FE-P4-05** Thẻ tiền ở `/ql` (NOTI-06): "Chờ chỉ số", thẻ đỏ "Kỳ chưa có hóa đơn" liệt kê từng kỳ thiếu kèm nút "Tạo hóa đơn kỳ này" (xác nhận rồi mở "Chốt chỉ số"), "Hóa đơn quá hạn", "Hợp đồng quá hạn".
- [ ] **FE-P4-06** Quyết toán trong `/ql/hop-dong/:id`: form ngày trả phòng, chỉ số cuối, hư hỏng, cọc giữ lại; xem trước bằng `dryRun` rồi xác nhận; nút "Đã trả lại tiền" khi `net > 0`.
- [ ] **FE-P4-07** `/ql/giao-dich` (Boss): không khớp lên đầu, gán vào hóa đơn, đánh dấu đã hoàn (chỗ của "báo lỗi thanh toán" để trống tới Phase 5).
- [ ] **FE-P4-08** `/thue` phần "hóa đơn cần trả" + ngày thu kế tiếp (dòng Phase 4 của 30-frontend) — làm cùng FE-P4-01 nếu tiện, nếu không thì thuộc P4-8.
- [ ] **FE-P4-09** ⏸ `npm run lint`, `npm run build`, `npm run test:components` (chạy lại một lượt khi có ca nhạy thời gian, bài học 13/11).

## Questions for the owner

<!-- Q-P4-1..12 were answered on 22/11/2026 (README.md, D-44). New questions go here and in the README table. -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- Nghiệm thu hạn cuối tháng (22/11/2026): quản lý thấy hóa đơn tháng chưa trả trong phạm vi tòa hiển thị đỏ với nhãn “Quá hạn” từ ngày đầu tháng tiếp theo theo giờ Việt Nam.
