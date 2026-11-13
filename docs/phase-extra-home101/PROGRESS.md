# Phase Extra – tiến trình

File này để người hoặc agent mới vào biết ngay đang ở đâu. Trạng thái từng task vẫn nằm trong file task của phần (`[ ]` / `[~]` / `[x]` / `[!]`); ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Agent sửa file này ở mỗi điểm dừng ⏸, trước khi báo cáo: đổi dòng của phần mình trong bảng và thêm một dòng vào nhật ký. Cột "Commit" do chủ dự án báo lại sau khi commit; agent điền ở lượt làm tiếp theo. Không ghi lại nội dung đã có trong file task.

Trạng thái: `chưa làm` · `đang làm` · `chờ commit` (đã dừng ở ⏸, chờ chủ dự án kiểm chứng) · `xong` · `kẹt` (ghi lý do).

## Bảng tổng

| Phần | Trạng thái | Điểm dừng gần nhất đã xong | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|
| EX-0 Chủ dự án chuẩn bị | đang làm | Q-09..Q-12 đã trả lời; quyết định cuối 12/11/2026 (email thay SMS) | – | tạo tài khoản Resend + xác thực tên miền (Q-14 đã chọn Resend), Q-08 video, Q-13, Q-EX4-1, Q-EX6-1, Q-EX6-2, Q-EX8-2 | không chặn EX-1 |
| EX-1 Tài khoản khách (BE) | chờ duyệt | ⏸ BE-EX-09 (kiểm tra cuối) | BE-EX-07 đã commit; BE-EX-08 chờ commit | – | seed khách `0900000006` đã chạy trên DB dev qua e2e cũ; plan: `plans/EX-1/PLAN.md` |
| EX-2 Tài khoản khách (FE) | chờ duyệt | ⏸ FE-EX-07 (đăng nhập, GuestLayout, /toi, /toi/tai-khoan) | FE-EX-04 đã commit | – | xem tay luồng đăng ký → /toi với backend thật còn chờ chủ dự án; plan: không có (không cần planner) |
| EX-3 Việt + Anh | chờ commit | ⏸ FE-EX-08 (lõi từ điển Việt/Anh) | – | FE-EX-09 sau khi chủ dự án kiểm chứng và commit | plan: `plans/EX-3/PLAN.md`; OQ-1..3 đã trả lời 13/11/2026 |
| EX-4 Màn chào | chưa làm | – | – | FE-EX-14 | cần EX-3 |
| EX-5 Bộ lọc phòng | chờ duyệt | ⏸ FE-EX-21 (cả part) | BE-EX-15 đã commit | – | plan: `plans/EX-5/PLAN.md` |
| EX-6 Lịch xem (BE) | chưa làm | – | – | BE-EX-17 | cần EX-1 |
| EX-7 Lịch xem (FE) | chưa làm | – | – | FE-EX-22 | cần EX-2, EX-6; lên production cùng EX-6 |
| EX-8 Gửi email thật | chưa làm | – | – | BE-EX-28 | cần EX-6; BE-EX-30 cần khóa Resend của chủ dự án |
| EX-9 QA | chưa làm | – | – | QA-EX-01 | cần tất cả |

## Nhật ký điểm dừng

Mới nhất ở trên. Mỗi dòng: `ngày · phần · task vừa xong · kết quả kiểm tra (số thật) · việc còn treo`.

- 13/11/2026 · EX-3 · FE-EX-08 (từ điển `vi`/`en`, provider, lưu lựa chọn, fallback và số nhiều) · FE lint 0 lỗi, build thành công, test:components 799/799 (11 test mới); kiểm thử biên dịch giả lập thiếu một khóa `en` trả lỗi TypeScript đúng khóa · chờ chủ dự án kiểm chứng và commit; tiếp FE-EX-09

- 13/11/2026 · EX-5 · BE-EX-16 (seed mẫu thuộc tính phòng và mã tiện ích, ghi đè khi chạy lại) + FE-EX-18..21 (form phòng 4 trường Có/Không/Chưa nhập, checklist tiện ích + "Tiện ích cũ" + nút xóa, 9 bộ lọc `/phong` trong URL, thuộc tính ở `/phong/:id`, nhãn tiện ích ở `/toa/:id`) · unit BE 1631/1631, lint 0 lỗi, build OK, e2e BE 53/53; FE lint 0 lỗi, build OK, test:components 788/788 (19 test mới `tests/ex/ex5-room-filters.test.mjs`); reviewer DUYỆT, không có lỗi chặn; xem tay `/phong?balcony=true&amenities=ELEVATOR` và `/phong/7` trên dữ liệu seed thật · seed đã áp vào DB dev qua e2e `auth.e2e-spec.ts` · chờ chủ dự án duyệt

- 13/11/2026 · EX-5 · BE-EX-13..15 (`common/catalog`, `GET /public/filters`, 4 trường phòng + mã tiện ích + `legacyAmenities` ở form nhân sự, 9 bộ lọc `/public/rooms`) · unit 1628/1628 (80 file), lint 0 lỗi, build OK, e2e 53/53 (7 file, có `public-filters.e2e-spec.ts` đọc-only trên DB dev); bỏ điều kiện lọc ban công / tiện ích / giữ chữ cũ thì test đỏ · tiếp: BE-EX-16 (seed) rồi FE-EX-18..21

- 13/11/2026 · EX-5 · BE-EX-12 (file migration `20261113000000_room_attributes`, schema `RoomType` + 4 cột null, 3 kịch bản mới) · `migrate diff` cũ→mới chỉ có 1 CREATE TYPE + 4 cột; DB check 66/66 (PGlite); unit 1576/1576, lint 0 lỗi, build OK · migration ĐÃ áp vào DB dev (13/11/2026): 73 phòng, cả 4 cột null; migrate status up to date; seed.spec 36/36

- 13/11/2026 · EX-2 · FE-EX-05..07 (`/dang-nhap`: "Chưa có tài khoản? Đăng ký" + EMAIL_NOT_VERIFIED → `/xac-minh-email`; `GuestLayout`, `/toi`, `/toi/tai-khoan`; link "Lịch hẹn xem phòng" ở TenantLayout) · lint 0 lỗi, build OK, test:components 769/769 (31 test mới trong `tests/ex/`) · chưa xem tay `/toi` với backend thật (cần đăng nhập) · chờ chủ dự án duyệt

- 13/11/2026 · EX-2 · FE-EX-01..04 (4 vai trò trong guard, `/dang-ky`, `/xac-minh-email`, api + schema, `acceptSession`, route `/toi` tạm) · lint 0 lỗi, build OK, test:components 762/762 (24 test mới trong `tests/ex/`); xem tay `/dang-ky` và `/xac-minh-email` trên Vite ở 375 px không tràn ngang · chưa thử luồng thật với BE (cần ghi user vào DB dev) · tiếp: FE-EX-05..07

- 13/11/2026 · EX-1 · BE-EX-09 (e2e mới `test/guest-signup.e2e-spec.ts`: đăng ký → mã email → login → quên mật khẩu bằng link, 2 đăng ký song song cùng email) · unit 1576/1576, lint 0 lỗi, build OK, e2e 50/50 (6 file) trên DB dev · reviewer chạy, báo cáo trong checkpoint · chờ chủ dự án duyệt

- 13/11/2026 · EX-1 · BE-EX-08 (`MeRoles`/`TenantMeRoles`, scope `[]` cho mọi vai trò khác MANAGER, `PATCH /auth/me { locale }`, seed khách `0900000006`, DEP-08) · unit 1576/1576 (79 file), lint 0 lỗi, build OK; đổi scope về cũ thì test đỏ · seed khách CHƯA chạy trên DB dev (cần chủ dự án)

- 13/11/2026 · EX-1 · BE-EX-07 (`forgotPassword`: GUEST chưa xác minh email không nhận link; tài khoản nhân sự tạo giữ link) · unit 1552/1552 (79 file), lint 0 lỗi, build OK; bỏ guard thì 2 test đỏ · e2e đăng ký + quên mật khẩu ở BE-EX-09

- 12/11/2026 · EX-1 · BE-EX-34, BE-EX-35 (OtpService gửi qua MailerService; production chưa có nhà gửi thư thì `MAIL_UNAVAILABLE`; `register` có email, `verify-email`, `resend-code {phone}`, bỏ `/auth/phone/*`, xóa module `sms`; mã lỗi 28 → 29) · unit 1548/1548 (79 file), lint 0 lỗi, build OK · migration `email_verification` đã áp vào DB dev, e2e hiện có 43/43; e2e đăng ký + mã email viết ở BE-EX-09

- 12/11/2026 · EX-1 · BE-EX-33 (spec đổi sang mã email; schema.prisma, migration `20261112010000_email_verification`, constraints.sql, check-constraints.mjs) · DB check 63/63, seed.spec 35/35, migration áp được lên DB đã có `guest_accounts` (PGlite) và cho ra cấu trúc giống hệt DB tạo mới · chưa áp vào DB dev; code còn dùng `phoneOtp` nên chưa biên dịch được với Prisma client mới

- 12/11/2026 · kế hoạch · chủ dự án đổi quyết định cuối: tài khoản xác minh bằng email (bỏ SMS), đặt theo từng giờ và giữ chỗ theo quản lý, quản lý xác nhận bằng gọi điện hoặc email, bỏ đề xuất giờ / hộp thư / nhắc lịch · spec và file task EX-1, 2, 6, 7, 8 đã sửa; chỉ sửa tài liệu, không sửa code · EX-1 thêm BE-EX-33..35; mã BE-EX-25..27, 31..32 và FE-EX-28..30 không còn dùng
- 12/11/2026 · EX-1 · BE-EX-02..06 (module sms, OtpService, register, verify-phone, resend-code, phone/send-code, phone/verify, chặn đăng nhập GUEST chưa xác minh) · unit 1546/1546 (79 file), lint 0 lỗi, build OK · migration `guest_accounts` đã chạy vào DB dev (chủ dự án đồng ý 12/11/2026), e2e 43/43 (5 file)
- 12/11/2026 · EX-1 · BE-EX-01 (schema + migration `20261112000000_guest_accounts`, constraints.sql, 8 kịch bản mới) · DB check 62/62, migration chạy được trên DB cũ (PGlite), seed.spec 35/35, unit 1502/1502, lint 0 lỗi, build OK · chờ commit; chạy migration vào DB dev cần chủ dự án đồng ý
- 12/11/2026 · kế hoạch · spec sửa theo D-23..D-34, chia 9 file task (68 task) · chưa có code · chờ chủ dự án commit và trả lời Q-07, Q-08, Q-13, Q-EX1-1, Q-EX4-1, Q-EX6-1, Q-EX8-1
