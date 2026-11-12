# Phase Extra – tiến trình

File này để người hoặc agent mới vào biết ngay đang ở đâu. Trạng thái từng task vẫn nằm trong file task của phần (`[ ]` / `[~]` / `[x]` / `[!]`); ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Agent sửa file này ở mỗi điểm dừng ⏸, trước khi báo cáo: đổi dòng của phần mình trong bảng và thêm một dòng vào nhật ký. Cột "Commit" do chủ dự án báo lại sau khi commit; agent điền ở lượt làm tiếp theo. Không ghi lại nội dung đã có trong file task.

Trạng thái: `chưa làm` · `đang làm` · `chờ commit` (đã dừng ở ⏸, chờ chủ dự án kiểm chứng) · `xong` · `kẹt` (ghi lý do).

## Bảng tổng

| Phần | Trạng thái | Điểm dừng gần nhất đã xong | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|
| EX-0 Chủ dự án chuẩn bị | đang làm | Q-09..Q-12 đã trả lời (12/11/2026) | – | Q-07 nhà gửi SMS, Q-08 video, Q-13, bốn câu Q-EX | không chặn EX-1 |
| EX-1 Tài khoản khách (BE) | chờ commit | ⏸ BE-EX-01 (migration `guest_accounts`, chưa chạy vào DB) | – | BE-EX-02 | plan: `plans/EX-1/PLAN.md` |
| EX-2 Tài khoản khách (FE) | chưa làm | – | – | FE-EX-01 | cần EX-1 |
| EX-3 Việt + Anh | chưa làm | – | – | FE-EX-08 | cần EX-2 |
| EX-4 Màn chào | chưa làm | – | – | FE-EX-14 | cần EX-3 |
| EX-5 Bộ lọc phòng | chưa làm | – | – | BE-EX-12 | độc lập |
| EX-6 Lịch xem (BE) | chưa làm | – | – | BE-EX-17 | cần EX-1 |
| EX-7 Lịch xem (FE) | chưa làm | – | – | FE-EX-22 | cần EX-2, EX-6 |
| EX-8 Thông báo lịch xem | chưa làm | – | – | BE-EX-28 | cần EX-6, EX-7 |
| EX-9 QA | chưa làm | – | – | QA-EX-01 | cần tất cả |

## Nhật ký điểm dừng

Mới nhất ở trên. Mỗi dòng: `ngày · phần · task vừa xong · kết quả kiểm tra (số thật) · việc còn treo`.

- 12/11/2026 · EX-1 · BE-EX-01 (schema + migration `20261112000000_guest_accounts`, constraints.sql, 8 kịch bản mới) · DB check 62/62, migration chạy được trên DB cũ (PGlite), seed.spec 35/35, unit 1502/1502, lint 0 lỗi, build OK · chờ commit; chạy migration vào DB dev cần chủ dự án đồng ý
- 12/11/2026 · kế hoạch · spec sửa theo D-23..D-34, chia 9 file task (68 task) · chưa có code · chờ chủ dự án commit và trả lời Q-07, Q-08, Q-13, Q-EX1-1, Q-EX4-1, Q-EX6-1, Q-EX8-1
