# Phase 4 · Tiền — tiến trình

File này để người hoặc agent mới vào biết ngay đang ở đâu. Trạng thái từng task nằm trong file task của phần (`[ ]` / `[~]` / `[x]` / `[!]`); ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Agent sửa file này ở mỗi điểm dừng ⏸, trước khi báo cáo: đổi dòng của phần mình trong bảng và thêm một dòng vào nhật ký. Cột "Commit" do chủ dự án báo lại sau khi commit; agent điền hash sau khi kiểm `git log`.

Trạng thái: `chưa làm` · `đang làm` · `chờ commit` (đã dừng ở ⏸, chờ chủ dự án kiểm chứng) · `xong` · `kẹt` (ghi lý do).

## Bảng tổng

| Phần | Trạng thái | Điểm dừng gần nhất đã xong | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|
| P4-0 Chủ dự án chuẩn bị | đang làm | – | – | Q-03 (nhà cung cấp webhook), `BANK_WEBHOOK_SECRET`, `settings.bank_account` thật, bậc điện thật (Q-02) | Không chặn code |
| P4-1 Toán tiền | chờ commit | BE-P4-05 ⏸ | – | chủ dự án kiểm và commit; rồi P4-2 | Q-P4-13: nước PER_PERSON tháng lẻ không nhân tỉ lệ (D-44 (13)) |
| P4-2 Chỉ số + hóa đơn tháng | chưa làm | – | – | planner `plans/P4-2/PLAN.md` | |
| P4-3 Mail | chưa làm | – | – | – | |
| P4-4 API hóa đơn + thu tiền | chưa làm | – | – | – | |
| P4-5 Ngân hàng | chưa làm | – | – | planner `plans/P4-5/PLAN.md` | |
| P4-6 Quyết toán | chưa làm | – | – | planner `plans/P4-6/PLAN.md` | |
| P4-7 FE nhân sự | chưa làm | – | – | planner `plans/P4-7/PLAN.md` | |
| P4-8 FE người thuê | chưa làm | – | – | – | |
| P4-9 QA | chưa làm | – | – | – | |

## Nhật ký điểm dừng

- 22/11/2026 · Soạn Phase 4 · planner viết `plans/PHASE/PLAN.md`; chủ dự án trả lời Q-P4-1..12 (tất cả theo đề xuất), ghi vào spec thành D-44 (sửa thêm BIL-12, BIL-18, MTR-08, MTR-12, Q-04, Q-06); tạo README, PROGRESS và 9 file task (53 task) · chưa có code
- 22/11/2026 · P4-1 ⏸ BE-P4-05 · hàm thuần: period (tháng thu, hạn mùng 9, kỳ chứa ngày, kỳ đến hạn), bậc điện, tiêu thụ MTR-05, dòng hóa đơn tháng (BIL-09 = 3.119.000), test D-09 chọn đơn giá theo period_start · unit 2697/2697, lint 0 lỗi (4 cảnh báo cũ), build pass; reviewer DUYỆT, đã sửa 2 điểm nên sửa (test ranh giới bậc / bậc cuối đóng, chặn waterM3 âm/lẻ)
- 22/11/2026 · P4-1 · chủ dự án trả lời Q-P4-13: nước PER_PERSON tháng lẻ không nhân tỉ lệ; ghi vào D-44 (13), BIL-07 (16-billing), README; thêm test
