# Phase Extra – tiến trình

File này để người hoặc agent mới vào biết ngay đang ở đâu. Trạng thái từng task vẫn nằm trong file task của phần (`[ ]` / `[~]` / `[x]` / `[!]`); ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Agent sửa file này ở mỗi điểm dừng ⏸, trước khi báo cáo: đổi dòng của phần mình trong bảng và thêm một dòng vào nhật ký. Cột "Commit" do chủ dự án báo lại sau khi commit; agent điền ở lượt làm tiếp theo. Không ghi lại nội dung đã có trong file task.

Trạng thái: `chưa làm` · `đang làm` · `chờ commit` (đã dừng ở ⏸, chờ chủ dự án kiểm chứng) · `xong` · `kẹt` (ghi lý do).

## Bảng tổng

| Phần | Trạng thái | Điểm dừng gần nhất đã xong | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|
| EX-0 Chủ dự án chuẩn bị | đang làm | Q-09..Q-12 đã trả lời; quyết định cuối 12/11/2026 (email thay SMS) | – | Q-14 dịch vụ gửi email, Q-08 video, Q-13, Q-EX4-1, Q-EX6-1, Q-EX6-2, Q-EX8-2 | không chặn EX-1 |
| EX-1 Tài khoản khách (BE) | chờ commit | ⏸ BE-EX-06 (sms, mã SMS, đăng ký, xác minh) | BE-EX-01: 1040f7d | BE-EX-33 (chuyển mã SMS sang mã email), rồi BE-EX-34, 35, 07 | spec đổi sau ⏸ BE-EX-06: đọc lại `10-auth.md` và cập nhật plan trước khi làm tiếp; migration đã chạy vào DB dev; plan: `plans/EX-1/PLAN.md` |
| EX-2 Tài khoản khách (FE) | chưa làm | – | – | FE-EX-01 | cần EX-1 |
| EX-3 Việt + Anh | chưa làm | – | – | FE-EX-08 | cần EX-2 |
| EX-4 Màn chào | chưa làm | – | – | FE-EX-14 | cần EX-3 |
| EX-5 Bộ lọc phòng | chưa làm | – | – | BE-EX-12 | độc lập |
| EX-6 Lịch xem (BE) | chưa làm | – | – | BE-EX-17 | cần EX-1 |
| EX-7 Lịch xem (FE) | chưa làm | – | – | FE-EX-22 | cần EX-2, EX-6; lên production cùng EX-6 |
| EX-8 Gửi email thật | chưa làm | – | – | BE-EX-28 | cần EX-6 và Q-14 |
| EX-9 QA | chưa làm | – | – | QA-EX-01 | cần tất cả |

## Nhật ký điểm dừng

Mới nhất ở trên. Mỗi dòng: `ngày · phần · task vừa xong · kết quả kiểm tra (số thật) · việc còn treo`.

- 12/11/2026 · kế hoạch · chủ dự án đổi quyết định cuối: tài khoản xác minh bằng email (bỏ SMS), đặt theo từng giờ và giữ chỗ theo quản lý, quản lý xác nhận bằng gọi điện hoặc email, bỏ đề xuất giờ / hộp thư / nhắc lịch · spec và file task EX-1, 2, 6, 7, 8 đã sửa; chỉ sửa tài liệu, không sửa code · EX-1 thêm BE-EX-33..35; mã BE-EX-25..27, 31..32 và FE-EX-28..30 không còn dùng
- 12/11/2026 · EX-1 · BE-EX-02..06 (module sms, OtpService, register, verify-phone, resend-code, phone/send-code, phone/verify, chặn đăng nhập GUEST chưa xác minh) · unit 1546/1546 (79 file), lint 0 lỗi, build OK · migration `guest_accounts` đã chạy vào DB dev (chủ dự án đồng ý 12/11/2026), e2e 43/43 (5 file)
- 12/11/2026 · EX-1 · BE-EX-01 (schema + migration `20261112000000_guest_accounts`, constraints.sql, 8 kịch bản mới) · DB check 62/62, migration chạy được trên DB cũ (PGlite), seed.spec 35/35, unit 1502/1502, lint 0 lỗi, build OK · chờ commit; chạy migration vào DB dev cần chủ dự án đồng ý
- 12/11/2026 · kế hoạch · spec sửa theo D-23..D-34, chia 9 file task (68 task) · chưa có code · chờ chủ dự án commit và trả lời Q-07, Q-08, Q-13, Q-EX1-1, Q-EX4-1, Q-EX6-1, Q-EX8-1
