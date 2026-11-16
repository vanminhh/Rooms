# Phase 3 · Hợp đồng — tiến trình

File này để người hoặc agent mới vào biết ngay đang ở đâu. Trạng thái từng task nằm trong file task của phần (`[ ]` / `[~]` / `[x]` / `[!]`); ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Agent sửa file này ở mỗi điểm dừng ⏸, trước khi báo cáo: đổi dòng của phần mình trong bảng và thêm một dòng vào nhật ký. Cột "Commit" do chủ dự án báo lại sau khi commit; agent điền ở lượt làm tiếp theo. Không ghi lại nội dung đã có trong file task.

Trạng thái: `chưa làm` · `đang làm` · `chờ commit` (đã dừng ở ⏸, chờ chủ dự án kiểm chứng) · `xong` · `kẹt` (ghi lý do).

## Bảng tổng

| Phần | Trạng thái | Điểm dừng gần nhất đã xong | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|
| P3-0 Chủ dự án chuẩn bị | chưa làm | – | – | `CCCD_KEY` vào `.env`; mẫu hợp đồng (Q-15) | Q-P3-1..4 đã trả lời 16/11/2026; `CCCD_KEY` chặn P3-1 |
| P3-1 BE nền | chưa làm | – | – | BE-P3-01 | cần `CCCD_KEY` |
| P3-2 BE tạo hợp đồng | chưa làm | – | – | BE-P3-07 | cần P3-1 |
| P3-3 BE ký + cọc | chưa làm | – | – | BE-P3-13 | cần P3-2 |
| P3-4 BE dọn vào + hủy | chưa làm | – | – | BE-P3-20 | cần P3-3 |
| P3-5 BE người ở + xe | chưa làm | – | – | BE-P3-23 | cần P3-4 (cùng module) |
| P3-6 FE nhân sự | chưa làm | – | – | FE-P3-01 | cần P3-3 |
| P3-7 FE người thuê | chưa làm | – | – | FE-P3-10 | cần P3-3 và FE-P3-01 |
| P3-8 QA | chưa làm | – | – | QA-P3-01 | cần tất cả |

## Nhật ký điểm dừng

Mới nhất ở trên. Mỗi dòng: `ngày · phần · task vừa xong · kết quả kiểm tra (số thật) · việc còn treo`.

- 16/11/2026 · kế hoạch · rà lần cuối spec và file task theo D-35..D-42 trước khi làm Phase 3: ảnh đồng hồ thành tùy chọn ở chốt chỉ số và quyết toán (MTR-11, 30-frontend, settlement); danh sách chốt chỉ số có từ 00:05 mùng 1 (MTR-09); "Việc hôm nay" báo đỏ từ mùng 2 (NOTI-06); dòng Phase 4 của roadmap ghi kỳ theo tháng, hạn mùng 9, mail báo Boss; CLAUDE.md, AGENTS.md, spec README trỏ D-35..D-42; P3-2 bỏ `billing_day`, P3-6 hiện ngày kết thúc trên form · chỉ tài liệu · sẵn sàng giao P3-1 khi có `CCCD_KEY`

- 16/11/2026 · P3-0 · chủ dự án thêm: hết ngày mùng 1 mà quản lý chưa nhập đủ chỉ số để phát hành hóa đơn thì hệ thống gửi mail cho Boss (D-42, NOTI-10; chủ dự án chốt: 8h sáng mỗi ngày từ mùng 2 tới mùng 10, kể cả gửi bù khi server sập trong khoảng đó; sau mùng 10 dừng hẳn mail, phòng vẫn báo đỏ ở "Việc hôm nay"; khách thuê không thấy gì); việc của Phase 4 · spec 00, 01, 19, 20 và README Phase 3 đã sửa · chỉ tài liệu

- 16/11/2026 · P3-0 · chủ dự án chốt kỳ thu tiền theo tháng dương lịch cho cả chuỗi: hóa đơn phát hành mùng 1, hạn mùng 9, quá hạn từ mùng 10, không có ô sửa ngày (D-40); hợp đồng hết đúng N tháng, tháng vào và tháng dọn đi tính lẻ theo số ngày thực của tháng, dịch vụ cố định chia như tiền phòng (D-41); Q-16 đóng; bỏ ô "ngày chốt theo tòa", hai task thêm cho nó và cột `buildings.billing_day` của lượt trước · spec 00, 02, 11, 14, 15, 16, 30 và file task P3-1, P3-6 đã sửa · chỉ tài liệu

- 16/11/2026 · P3-0 · chủ dự án trả lời Q-P3-1 (giữ việc "gọi khách" tới khi bấm "Đã gọi", D-39), Q-P3-2 (không cần ảnh đồng hồ, D-38), Q-P3-3 (ghi đã trả lại cọc ở Phase 4), Q-P3-4 (thiếu `CCCD_KEY` thì không khởi động); spec 00, 02, 13, 14, 15 và file task P3-1, P3-2, P3-4, P3-6 đã cập nhật; mở Q-16 cho Phase 4 · chỉ tài liệu · còn: `CCCD_KEY`, mẫu hợp đồng

- 16/11/2026 · kế hoạch · chủ dự án chốt D-35..D-37 (đủ vòng cọc, trang in thay PDF, scan riêng tư) và Q-15 mở; spec 00, 01, 02, 14, 16, 20, 30 đã sửa; chia 8 file task (47 task) · chưa có code · chờ chủ dự án commit, tạo `CCCD_KEY`, trả lời Q-P3-1..4
