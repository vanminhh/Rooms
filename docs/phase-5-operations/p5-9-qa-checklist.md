# P5-9 · Nghiệm thu Phase 5

Ngày 25/11/2026, chủ dự án xác nhận nghiệm thu P5-7 (`9400ca6`) và P5-8 (`84b9691`). Ngày 26/11/2026, chủ dự án chốt P5-9 và Phase 5.

## Đối chiếu tiêu chí

| Tiêu chí | Bằng chứng kiểm thử | Kết quả |
|---|---|---|
| REQ-02 · Gửi yêu cầu trả phòng lần hai khi yêu cầu đầu đang chờ | `requests.e2e-spec.ts`, BE-P5-18 kiểm mã `PENDING_REQUEST_EXISTS` cho cả MOVE_OUT và RENEW | Đạt trên DB dev trong lượt chạy riêng 23:10 |
| REQ-05 · Duyệt biển số đang hoạt động ở hợp đồng khác | BE-P5-18 kiểm lỗi tại trường `plate`, yêu cầu còn PENDING, cả xe định gỡ và xe bên hợp đồng kia vẫn hoạt động | Đạt trên DB dev trong lượt chạy riêng 23:10 |
| REQ-06 · Sự cố xử lý ngày 1, tự đóng ngày 4 | BE-P5-18 kiểm ngày 3, ngày 4 và chạy lại lần hai | Đạt trên DB dev trong lượt chạy riêng 23:10 |
| REQ-09 · Từ chối đánh giá trước khi đóng, tạo trùng, sửa ngày thứ 8 và người thuê khác | `requests.e2e-spec.ts`, BE-P5-20 | Đạt trên DB dev trong lượt chạy riêng 23:10 |
| REQ-09 · Một sao giữ CLOSED và chi phí lần sửa cuối | BE-P5-20 kiểm `CLOSED`, `reviewRating: 1` và `cost: 100000` | Đạt trên DB dev trong lượt chạy riêng 23:10 |
| NOTI-01 · Đọc thông báo, giảm số chưa đọc, mở lại liên kết | `tenant-operations.test.mjs`, “tenant inbox marks one, keeps the read row, marks the remainder and follows a read link” | Đạt ở M8 |
| NOTI-02/03 · Phòng, tòa, toàn chuỗi, giới hạn quản lý, mỗi người thuê ACTIVE nhận một lần, đếm người đọc | `announcements.http.spec.ts`, các ca NOTI-02/03 và SCOPE-02 | Đạt HTTP |
| RPT-01..06 · Doanh thu, dư nợ, chi phí, công suất, cọc và phạm vi tòa | `reports.service.spec.ts`, “groups receipts, used deposits and repairs by building and Hanoi month” và “computes chain occupancy from room counts, including an empty building”; `reports.e2e-spec.ts` đối chiếu tổng các tòa | Đạt unit và E2E dev |
| Ví dụ thu 80 triệu, quá hạn 5 triệu · Cất giữ nguyên số nợ, xóa đưa nợ về 0 | `requests.e2e-spec.ts`, BE-P5-24 | Đạt trên DB dev trong lượt chạy riêng 23:10 |
| AUD-01..04 · Nhật ký, phạm vi Boss, ngày Hà Nội, che trường nhạy cảm, tác vụ cron | `audit.http.spec.ts`, “filters by Hanoi days, keeps exact IDs and strips nested sensitive fields”; `renewal-switch.spec.ts`, “the switch writes contract.renew with no actor” | Đạt unit/HTTP |
| Cài đặt và điện nước · Quyền Boss, webhook chỉ đọc, ghi nhật ký, truy vấn tiêu thụ đúng người thuê | `settings/operations.http.spec.ts`, “allows only Boss to manage settings”, “rejects invalid settings before writing” và “scopes consumption to the caller” | Đạt HTTP |
| CON-17..19 · Tạo, ký, chuyển hợp đồng, bàn giao chỉ số và người/xe, giữ tiền cọc | `contracts.renewal.spec.ts`, `renewal-switch.spec.ts`; `contracts-renewal.e2e-spec.ts`, BE-P5-09 | Đạt unit, E2E dev và tranh chấp hai kết nối |
| CON-20/21 · Nhắc hết hạn, hiển thị quá hạn và giới hạn kỳ hóa đơn | `invoice-reminder.job.spec.ts`, `dashboard.money.spec.ts`, các ca CON-20/21; BE-P5-09 | Đạt. `monthly-drafts.spec.ts` kiểm “never a period beyond N; the last one is billed on end_date + 1” (D-13) |

## Nhật ký chạy

| Hạng mục | Kết quả |
|---|---|
| Toàn bộ unit/HTTP backend | 144/144 bộ, 2.895/2.895 test, exit 0 |
| QA-P5-02 · `node prisma/check-constraints.mjs . prisma` | PostgreSQL nhúng, 128/128, exit 0. Gồm ràng buộc gia hạn M1, đánh giá M2 và lưu trữ hóa đơn M3 |
| Hồi quy frontend trên bản P5-8 đã nghiệm thu | 1.052/1.052 ở M8; chạy lại 172/172 ca giao diện đăng nhập, phân quyền và P5 trong M9 |
| QA-P5-03 · E2E dev | Lượt 17:19: requests exit=1; settlement, contracts-renewal và reports exit=0. Lượt này chỉ lưu mã thoát. Chạy riêng requests lúc 23:10:02 đạt 3/3 trong 356,20 giây (rooms-p5-requests.txt). |
| QA-P5-04 · Hai giao dịch độc lập | operations-races exit=0 trên dev. Hai giao dịch duyệt chỉ thêm một xe; hai giao dịch chuyển gia hạn chỉ sao chép người và xe một lần. Kiểm riêng fixture đã dọn thành công. |
| QA-P5-05/06 · Hồi quy dev, dữ liệu thử và đóng phase | Hồi quy login, cọc, tiền thuê, lọc phòng và lịch xem đạt. Cleanup exit=1 ở cả hai lượt. Lượt 22:58 ghi 141 bản ghi E2E ngoài nhật ký (60 tòa, 11 dịch vụ, 28 người dùng, 42 lịch xem); không có nhật ký đang chờ dọn. Mã lượt chạy trong tên của cả 141 bản ghi mang ngày 03–06/11/2026. |

Kết quả đối chiếu ngày 25/11/2026: lượt đầy đủ `rooms-p5-9-Lj3hZR/results.txt` có 10/12 bước đạt. Lượt kiểm ghi log `rooms-p5-9-aXSkQ9/results.txt` có AUTH-16 (25/25), public-filters (3/3), cleanup (exit 1). Lượt kiểm ghi log chỉ chạy ba bước.

### Đối soát dữ liệu thử cũ

Báo cáo cleanup lúc 22:58 ngày 25/11 có 141 cặp bảng/ID riêng biệt. Tên bản ghi chứa 28 mã lượt chạy. Bảng dưới tổng hợp theo ngày trong mã lượt chạy.

| Ngày | Tòa | Dịch vụ | Người dùng | Lịch xem | Tổng |
|---|---:|---:|---:|---:|---:|
| 03/11 | 9 | 2 | 3 | 0 | 14 |
| 04/11 | 10 | 3 | 4 | 0 | 17 |
| 05/11 | 29 | 4 | 15 | 30 | 78 |
| 06/11 | 12 | 2 | 6 | 12 | 32 |
| Tổng | 60 | 11 | 28 | 42 | 141 |

Các mã này có trước Phase 5. Lệnh kiểm trên toàn DB vẫn trả mã 1. Ngày 26/11/2026, chủ dự án chấp nhận ngoại lệ cho QA-P5-05 và theo dõi riêng 141 bản ghi này sau khi đóng Phase 5.

### Chạy lại toàn bộ trên máy có kết nối DB dev

Lệnh dưới chạy từng file riêng, lưu mã thoát trong `results.txt` và in đường dẫn ra terminal. Runner kiểm kết nối trước khi tạo dữ liệu, sau cùng chạy `cleanup.mjs --check` ở chế độ liệt kê. Danh sách còn tồn sẽ trả mã 1. Trong `settlement.e2e-spec.ts`, người thuê gửi MOVE_OUT, quản lý duyệt và quyết toán cùng hợp đồng. Test so tiền thuê còn lại lúc duyệt với tiền thuê còn lại lúc lập quyết toán.

```powershell
cd D:\Rooms\Source\backend
node --env-file=.env scripts/e2e/p5-9.mjs
```
