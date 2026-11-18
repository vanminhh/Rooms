# Phase 3 · Hợp đồng — tiến trình

File này để người hoặc agent mới vào biết ngay đang ở đâu. Trạng thái từng task nằm trong file task của phần (`[ ]` / `[~]` / `[x]` / `[!]`); ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Agent sửa file này ở mỗi điểm dừng ⏸, trước khi báo cáo: đổi dòng của phần mình trong bảng và thêm một dòng vào nhật ký. Cột "Commit" do chủ dự án báo lại sau khi commit; agent điền ở lượt làm tiếp theo. Không ghi lại nội dung đã có trong file task.

Trạng thái: `chưa làm` · `đang làm` · `chờ commit` (đã dừng ở ⏸, chờ chủ dự án kiểm chứng) · `xong` · `kẹt` (ghi lý do).

## Bảng tổng

| Phần | Trạng thái | Điểm dừng gần nhất đã xong | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|
| P3-0 Chủ dự án chuẩn bị | đang làm | – | – | Giữ bản sao an toàn của `CCCD_KEY`; mẫu hợp đồng (Q-15) sau | Đã tạo khóa mới trong `.env` local theo yêu cầu chủ dự án, không dùng khóa đã gửi vào chat; cấu hình `NODE_ENV=development` |
| P3-1 BE nền | xong | BE-P3-04..06 | `eb8cf64` | P3-2 | Chủ dự án xác nhận unit suite và e2e `POST /files/sign` đều pass |
| P3-2 BE tạo hợp đồng | chờ commit | BE-P3-11 · API “Đã gọi” và nhóm “Việc hôm nay” | `56fabd0` (migration BE-P3-11) | Commit API/dashboard, sau đó BE-P3-12 | [Checkpoint BE-P3-11](plans/P3-2/CHECKPOINT-BE-P3-11.md) · reviewer DUYỆT |
| P3-3 BE ký + cọc | chưa làm | – | – | BE-P3-13 | cần P3-2 |
| P3-4 BE dọn vào + hủy | chưa làm | – | – | BE-P3-20 | cần P3-3 |
| P3-5 BE người ở + xe | chưa làm | – | – | BE-P3-23 | cần P3-4 (cùng module) |
| P3-6 FE nhân sự | chưa làm | – | – | FE-P3-01 | cần P3-3 |
| P3-7 FE người thuê | chưa làm | – | – | FE-P3-10 | cần P3-3 và FE-P3-01 |
| P3-8 QA | chưa làm | – | – | QA-P3-01 | cần tất cả |

## Nhật ký điểm dừng

Mới nhất ở trên. Mỗi dòng: `ngày · phần · task vừa xong · kết quả kiểm tra (số thật) · việc còn treo`.

- 18/11/2026 · P3-2 ⏸ BE-P3-11 · Xác nhận commit migration `56fabd0`, hoàn tất API “Đã gọi” và nhóm việc chờ gọi. Reviewer Codex DUYỆT. Backend build exit 0, lint 0 lỗi/4 cảnh báo cũ, 230/230 test tập trung, DB checker 97/97. PostgreSQL nhúng xác nhận luồng tạo HOLD, phân công và việc gọi lặp. Suite qua HTTP trong bộ nhớ đạt 1929/1935, sáu ca cũ quá thời gian 5 giây. Hai tệp đó chạy riêng đạt 18/18. Ca TCP chuẩn gặp `EACCES` · chờ chủ dự án commit, rồi BE-P3-12.
- 18/11/2026 · P3-2 ⏸ migration BE-P3-11 đã áp dụng · Ảnh PowerShell trên máy dự án xác nhận `20261118000000_viewing_deposit_calls` đã áp dụng thành công, Prisma báo `9 migrations found` và `Database schema is up to date!`, sau đó sinh Prisma Client 6.19.3 · chờ chủ dự án commit, rồi làm API “Đã gọi” và nhóm “Việc hôm nay”.
- 18/11/2026 · P3-2 ⏸ áp dụng migration BE-P3-11 · Chủ dự án đã duyệt DB dev. Lượt kiểm lịch sử trả `P1001`, DNS của `DIRECT_URL` và `DATABASE_URL` đều trả `ENOTFOUND`. Bước deploy còn chờ máy kết nối được DB dev. Giữ cùng lượt triển khai migration và backend ghi liên kết hủy lịch.
- 18/11/2026 · P3-2 ⏸ trước khi áp dụng migration BE-P3-11 · Đã tạo migration ghi liên kết hợp đồng và người/thời điểm gọi. Luồng tạo HOLD ghi liên kết trong giao dịch hiện có. Reviewer Codex DUYỆT sau khi cập nhật writer và trình tự triển khai. Prisma validate/generate và build đạt, lint 0 lỗi/4 cảnh báo cũ, DB checker 97/97. PostgreSQL nhúng chạy 8 migration cũ và migration mới, kiểm 10 bản ghi lịch sử, 4 ràng buộc, ghi và rollback liên kết qua Prisma. Backend qua HTTP trong bộ nhớ đạt 1927/1927 (97 file). TCP riêng gặp 11 lỗi loopback `EACCES`. Đọc trạng thái DB dev báo `P1001` · chờ duyệt áp dụng và hoàn tất API/dashboard.
- 17/11/2026 · P3-2 ⏸ BE-P3-10 · Danh sách và chi tiết hợp đồng theo phạm vi tòa. Reviewer DUYỆT, build exit 0, lint 0 lỗi/4 cảnh báo cũ, 57/57 test hợp đồng, 8/8 ca hồi quy HTTP POST. PostgreSQL nhúng kiểm truy vấn thực. Bộ backend qua HTTP trong bộ nhớ đạt 1927/1927 (97 file). 11 ca GET qua TCP chuẩn trong phiên này gặp `connect EACCES 127.0.0.1` · chờ chủ dự án commit và duyệt tạo migration BE-P3-11
- 17/11/2026 · P3-2 ⏸ BE-P3-07..09 · Ảnh kết quả trên máy dự án xác nhận 96/96 file và 1916/1916 test đạt, thời lượng 104,96 giây · chờ chủ dự án commit
- 17/11/2026 · P3-2 ⏸ BE-P3-07..09 · Áp dụng 1A, 2C, 3B, 4A. Tạo HOLD, xử lý người ký, tài khoản và lịch trong một giao dịch. Reviewer DUYỆT sau hai bản sửa auth và quyền tòa. Lint 0 lỗi/4 cảnh báo cũ, build exit 0, 86/86 test tập trung, 8/8 ca HTTP tạo hợp đồng. PostgreSQL nhúng xác nhận chỉ mục chống trùng và rollback. Bộ test chuẩn 1156/1916, 760 lỗi đều `connect EACCES 127.0.0.1`. Chạy cả 96 file qua HTTP trong bộ nhớ đạt 1916/1916 · chờ chủ dự án kiểm chứng và commit
- 17/11/2026 · P3-2 · Xác nhận P3-1 đã commit `eb8cf64`. Lập kế hoạch BE-P3-07..12. DB checker offline 88/88 từ `schema.prisma` hiện tại · chờ chủ dự án chốt Q-P3-8..11 cho mốc BE-P3-07..09
- 17/11/2026 · P3-1 ⏸ BE-P3-04..06 · Chủ dự án xác nhận `npm run test` và e2e `test/files.e2e-spec.ts` đều pass trên máy dự án · chờ chủ dự án commit
- 16/11/2026 · P3-1 ⏸ BE-P3-04..06 · Bắt đầu từ commit `084c019`. Upload riêng tư ký loại tải, thư mục, mục đích và `overwrite=false`. Kiểm theo asset ID, link tối đa 300 giây. Đăng ký `ContractsModule`, đối chiếu bảng 29 mã lỗi với 31 mã đã có. Reviewer DUYỆT sau khi sửa dùng chéo mục đích. Mã cuối lint 0 lỗi/4 cảnh báo cũ, build exit 0, 86/86 test tập trung và 6/6 ca HTTP với transport trong bộ nhớ. Unit suite đạt 1107/1867, 760 lỗi loopback `EACCES` và e2e TCP 0/6 cùng lỗi · chờ unit suite và e2e trên máy chủ dự án

- 16/11/2026 · P3-1 ⏸ BE-P3-01..03 · PowerShell của chủ dự án xác nhận `scan=0, front=0, back=0`, áp dụng `20261116000000_private_contract_assets`, rồi Prisma báo `Database schema is up to date!`. Đã sinh lại Prisma Client 6.19.3 và kiểm đủ 3 asset ID mới, bỏ đúng 4 trường cũ. DB checker 88/88, backend tập trung 79/79 (gồm seed 39/39), lint 0 lỗi/4 cảnh báo cũ, build exit 0 · chờ chủ dự án commit trước BE-P3-04

- 16/11/2026 · P3-1 trước khi áp dụng BE-P3-03 · Ảnh PowerShell của chủ dự án cho thấy `npx prisma migrate status` kết nối được DB dev, thấy 8 file migration và chỉ `20261116000000_private_contract_assets` đang chờ. Lượt đếm URL từ terminal agent vẫn lỗi mạng · cần số đếm 0/0/0 và kết quả deploy trên máy chủ dự án

- 16/11/2026 · P3-1 áp dụng BE-P3-03 · Chủ dự án duyệt DB dev. File SQL khớp SHA-256 của bản đã kiểm thử. Thử đọc lịch sử qua `DIRECT_URL` (5432) và `DATABASE_URL` (6543) đều gặp `PrismaClientInitializationError`. DNS trả `ENOTFOUND` cho cả hai endpoint và hai tên miền đối chứng. Chưa đọc được lịch sử hay số lượng URL. DB dev chưa chạy migration từ phiên này · Tiếp tục từ máy kết nối được DB dev. Kiểm chỉ có BE-P3-03 chờ áp dụng và cả ba số đếm URL đều bằng 0

- 16/11/2026 · P3-1 ⏸ trước khi áp dụng BE-P3-03 · Đã tạo migration theo phương án A, cập nhật schema, constraints và seed. Prisma validate qua, diff chỉ có 4 cột bỏ và 3 cột thêm, DB checker 88/88 (82 ca cũ và 6 ca mới), seed 39/39, backend offline 864/864, lint 0 lỗi/4 cảnh báo cũ, build exit 0. PostgreSQL nhúng chạy lại 7 migration cũ rồi migration mới, xác minh rollback riêng cho 3 cột URL và giữ các ràng buộc liên quan. Reviewer DUYỆT · DB dev chưa chạy migration. Lượt đọc DB gặp lỗi kết nối, chờ duyệt Q-P3-6 và xác minh ba cột URL cũ trống

- 16/11/2026 · P3-1 xác minh BE-P3-01..02 · 40/40 test tập trung, 864/864 test không dùng HTTP (61 file), lint 0 lỗi và 4 cảnh báo cũ, build exit 0. Kiểm tra chạy với `.env` dev và thứ tự nạp `NODE_ENV` đều qua. Reviewer độc lập DUYỆT sau sửa thứ tự import `AppModule`. Lượt test đầy đủ trong terminal này trước sửa thứ tự import ghi 1.075/1.836 và gặp `connect EACCES 127.0.0.1` · chờ duyệt BE-P3-03

- 16/11/2026 · P3-1 ⏸ trước BE-P3-03 · BE-P3-01..02 xong: period helper, AES-256-GCM CCCD, startup env; 40/40 test tập trung, `npm run test` 1836/1836 (92 file), lint 0 lỗi/4 cảnh báo cũ, build OK; `.env` local có khóa mới và NODE_ENV, Git bỏ qua; kiểm đọc DB dev trả PrismaClientInitializationError, không đổi dữ liệu; chưa tạo migration/seed/e2e · chờ đồng ý bỏ `billing_day`, thay ba cột URL và tạo migration; xin phép riêng trước khi áp dụng DB

- 16/11/2026 · P3-1 tiền kiểm · git sạch lúc bắt đầu; đọc mục Before you start, viết `plans/P3-1/PLAN.md`; kiểm tra `Source/backend/.env` chưa có `CCCD_KEY` nên chưa bắt đầu BE-P3-01; không chạy test/migration/seed · chờ chủ dự án điền khóa và đồng ý lựa chọn schema trước bước BE-P3-03

- 16/11/2026 · kế hoạch · rà lần cuối spec và file task theo D-35..D-42 trước khi làm Phase 3: ảnh đồng hồ thành tùy chọn ở chốt chỉ số và quyết toán (MTR-11, 30-frontend, settlement); danh sách chốt chỉ số có từ 00:05 mùng 1 (MTR-09); "Việc hôm nay" báo đỏ từ mùng 2 (NOTI-06); dòng Phase 4 của roadmap ghi kỳ theo tháng, hạn mùng 9, mail báo Boss; CLAUDE.md, AGENTS.md, spec README trỏ D-35..D-42; P3-2 bỏ `billing_day`, P3-6 hiện ngày kết thúc trên form · chỉ tài liệu · sẵn sàng giao P3-1 khi có `CCCD_KEY`

- 16/11/2026 · P3-0 · chủ dự án thêm: hết ngày mùng 1 mà quản lý chưa nhập đủ chỉ số để phát hành hóa đơn thì hệ thống gửi mail cho Boss (D-42, NOTI-10; chủ dự án chốt: 8h sáng mỗi ngày từ mùng 2 tới mùng 10, kể cả gửi bù khi server sập trong khoảng đó; sau mùng 10 dừng hẳn mail, phòng vẫn báo đỏ ở "Việc hôm nay"; khách thuê không thấy gì); việc của Phase 4 · spec 00, 01, 19, 20 và README Phase 3 đã sửa · chỉ tài liệu

- 16/11/2026 · P3-0 · chủ dự án chốt kỳ thu tiền theo tháng dương lịch cho cả chuỗi: hóa đơn phát hành mùng 1, hạn mùng 9, quá hạn từ mùng 10, không có ô sửa ngày (D-40); hợp đồng hết đúng N tháng, tháng vào và tháng dọn đi tính lẻ theo số ngày thực của tháng, dịch vụ cố định chia như tiền phòng (D-41); Q-16 đóng; bỏ ô "ngày chốt theo tòa", hai task thêm cho nó và cột `buildings.billing_day` của lượt trước · spec 00, 02, 11, 14, 15, 16, 30 và file task P3-1, P3-6 đã sửa · chỉ tài liệu

- 16/11/2026 · P3-0 · chủ dự án trả lời Q-P3-1 (giữ việc "gọi khách" tới khi bấm "Đã gọi", D-39), Q-P3-2 (không cần ảnh đồng hồ, D-38), Q-P3-3 (ghi đã trả lại cọc ở Phase 4), Q-P3-4 (thiếu `CCCD_KEY` thì không khởi động); spec 00, 02, 13, 14, 15 và file task P3-1, P3-2, P3-4, P3-6 đã cập nhật; mở Q-16 cho Phase 4 · chỉ tài liệu · còn: `CCCD_KEY`, mẫu hợp đồng

- 16/11/2026 · kế hoạch · chủ dự án chốt D-35..D-37 (đủ vòng cọc, trang in thay PDF, scan riêng tư) và Q-15 mở; spec 00, 01, 02, 14, 16, 20, 30 đã sửa; chia 8 file task (47 task) · chưa có code · chờ chủ dự án commit, tạo `CCCD_KEY`, trả lời Q-P3-1..4
