# P3-2 · Điểm dừng migration BE-P3-11

Ngày 18/11/2026. Chủ dự án đã commit BE-P3-10 ở `ef40af3` và yêu cầu tiếp tục với BE-P3-11.

## Thay đổi

- `prisma/migrations/20261118000000_viewing_deposit_calls/migration.sql` thêm ba cột tùy chọn vào `viewings`. `deposit_cancelled_by_contract_id` liên kết hợp đồng đã hủy lịch. `called_by_id` và `called_at` ghi người gọi và thời điểm gọi.
- SQL điền liên kết cho lịch `CANCELLED` cùng phòng có đúng một hợp đồng được xác định qua `contract.create` và `cancelledViewingIds`. Nếu audit không đủ căn cứ, liên kết để trống. Ghi chú và `updated_at` của lịch được giữ nguyên. Hai trường gọi cùng để trống khi khôi phục lịch sử.
- `prisma/schema.prisma` khai báo hai quan hệ mới với `ON DELETE RESTRICT`. `prisma/constraints.sql` giữ ba CHECK của migration. `prisma/check-constraints.mjs` bổ sung chín ca kiểm tra VIEW-06.
- `contracts.service.ts` ghi liên kết khi tạo HOLD, trong cùng giao dịch hủy lịch. `contracts.service.spec.ts` kiểm tra chỉ lịch bị hủy do hợp đồng được gắn liên kết. BE-P3-11 còn `POST /viewings/:id/called` và nhóm “Việc hôm nay”.

## Kiểm tra

| Phép kiểm | Kết quả |
|---|---|
| Prisma validate và generate | Schema hợp lệ. Prisma Client 6.19.3 sinh thành công. Diff từ `ef40af3` chỉ có ba cột và hai FK mới. |
| Bộ kiểm DB | `97/97 tình huống đúng như mong đợi`, gồm chín ca mới. |
| Migration trên PostgreSQL nhúng | Chạy tám migration trước đó rồi migration mới. Kiểm 10 bản ghi lịch sử, gồm audit khớp, lịch hủy thường có cùng ghi chú, phòng hoặc trạng thái khác, audit mâu thuẫn và payload sai. Bốn ca runtime xác nhận trạng thái, cặp người/giờ gọi và FK. |
| Luồng HOLD qua Prisma và PostgreSQL nhúng | Lịch bị hủy nhận đúng ID hợp đồng, lịch WON giữ liên kết hủy trống. Khi ghi audit lỗi, giao dịch hoàn tác cả liên kết hủy. |
| Backend | Build exit 0, lint `Found 4 warnings and 0 errors.` Bốn cảnh báo đều có từ trước. |
| Test backend qua HTTP trong bộ nhớ | Trên bản cuối, với `--hookTimeout=60000`, đạt `Test Files 97 passed (97)` và `Tests 1927 passed (1927)`, exit 0. Lượt trước đạt 1.916 ca, 11 ca quá thời gian `beforeAll`, rồi đạt 11/11 khi chạy riêng. |
| Test TCP chuẩn | Cùng 11 ca TCP trong phiên kiểm thử báo `connect EACCES 127.0.0.1`. |
| Áp dụng trên DB dev | PowerShell trên máy dự án xác nhận `20261118000000_viewing_deposit_calls` đã áp dụng thành công. Prisma tìm thấy 9 migration, báo `Database schema is up to date!` và sinh Prisma Client 6.19.3. |

Không có `[ASSUMPTION]` mới. Khi audit chỉ ra nhiều hợp đồng cho cùng một lịch, migration để liên kết trống vì không xác định được nguồn hủy.

## Kiểm tra tay

1. Từ `Source/backend`, chạy `npx prisma validate`. Chạy bộ kiểm DB với SQL sinh từ schema và `constraints.sql` theo hướng dẫn tại [02-database.md](../../../spec/02-database.md#run-the-db-check). Kết quả tại mốc này là `97/97`.
2. Trên máy kết nối được DB dev, chạy `npx prisma migrate status`. Nếu danh sách chỉ có `20261118000000_viewing_deposit_calls` đang chờ, tạm dừng backend dev cũ trước khi chạy `npx prisma migrate deploy`.
3. Chạy lại `npx prisma migrate status` và xác nhận `Database schema is up to date!`. Chạy `npx prisma generate`, rồi khởi động backend dev từ bản có thay đổi `contracts.service.ts`. Cùng một lượt triển khai bảo đảm mọi lịch bị hủy đều được ghi liên kết, qua audit trước migration hoặc qua code mới sau migration.

Chủ dự án đã duyệt áp dụng lên DB dev ngày 18/11/2026. Phiên Codex gặp `P1001` và phân giải tên miền trả `ENOTFOUND`. Chủ dự án áp dụng từ PowerShell trên máy dự án và gửi ảnh xác nhận thành công. Ảnh kết thúc sau bước sinh Prisma Client, nên việc khởi động lại backend còn cần kiểm tra.

Commit gợi ý `feat(viewings): persist deposit cancellation calls (BE-P3-11, VIEW-06, D-39, DB-07)`

## Rà soát độc lập

Reviewer Codex đọc thay đổi vì reviewer Sonnet báo `ENOTFOUND` khi gọi dịch vụ.

### Báo cáo lần đầu

**KẾT LUẬN — CHẶN**

Phạm vi rà soát BE-P3-11 gồm 5 tệp chưa commit, +71/-4 dòng. Kết luận áp dụng cho bước triển khai migration khi BE cũ còn có thể tạo hợp đồng.

**Lỗi chặn**

1. `migration.sql:37` — Backfill chỉ chạy một lần. Sau khi migration commit, luồng tạo hợp đồng hiện tại vẫn hủy lịch và ghi `cancelledViewingIds` vào audit mà chưa ghi `deposit_cancelled_by_contract_id`. Các lịch bị hủy trong khoảng này sẽ thiếu dấu nhận diện để hiện việc gọi khách theo VIEW-06 và D-39. Cần dừng luồng tạo hợp đồng từ trước khi áp migration đến khi BE mới nhận yêu cầu, hoặc chạy bù từ audit sau khi BE cũ ngừng ghi. `contracts.service.ts:213`.

**Nên sửa**

1. `migration.sql:10` — FK hiện chấp nhận hợp đồng thuộc phòng khác. Backfill và BE hiện tại đã lọc cùng phòng. Nếu muốn DB cũng bảo vệ điều kiện cùng phòng của VIEW-06, dùng FK ghép với `room_id` và thêm một ca kiểm tra liên kết khác phòng. `schema.prisma:466`.
2. `check-constraints.mjs:12` — Bộ kiểm tra tạo schema mới nên chín ca VIEW-06 chỉ kiểm FK và CHECK. Nên lưu một ca chạy chính migration trên schema trước thay đổi, với dữ liệu audit có một lượt hủy hợp lệ, một lịch hủy thường và một liên kết mơ hồ, rồi kiểm chính xác các marker sau migration. `migration.sql:19`.

**Ghi chú**

Backfill dùng ID từ audit do chính thao tác tạo HOLD ghi trong cùng giao dịch. Nó yêu cầu lịch đang `CANCELLED`, khớp phòng và chỉ có một hợp đồng phân biệt. Nó giữ nguyên thông tin người gọi và thời điểm gọi. Hai FK mới dùng `RESTRICT` theo DB-03. Ba CHECK khớp giữa migration và `constraints.sql`, đáp ứng DB-07. Rà soát chỉ đọc mã nguồn và diff.

**Đã kiểm**

Toàn bộ migration mới, diff của Prisma schema, constraints, checker và trạng thái BE-P3-11. Đã đối chiếu luồng tạo hợp đồng, `AuditService`, luồng hủy lịch và các mục VIEW-05, VIEW-06, VIEW-07, D-39, CON-05, DB-03, DB-07, NOTI-06.

### Xác minh sau sửa

**DUYỆT bước chuẩn bị migration BE-P3-11.** Lỗi chặn trước đó đã được xử lý trong mã và trình tự triển khai.

- Luồng tạo hợp đồng HOLD ghi `depositCancelledByContractId` cùng lúc với trạng thái `CANCELLED`, trong giao dịch hiện có, cho các lịch NEW hoặc CONFIRMED cùng phòng. `contracts.service.ts:213`.
- Kiểm thử xác nhận lịch bị hủy nhận đúng ID hợp đồng. Lịch WON, lịch khác phòng và lịch LOST đều không nhận liên kết. `contracts.service.spec.ts:303`.
- Quy trình yêu cầu dừng BE cũ trước migration và khởi động bản có thay đổi trong cùng lượt triển khai. Trình tự này loại bỏ khoảng thời gian BE cũ có thể tạo hợp đồng sau backfill. Tôi xác minh quy trình trên tài liệu. DB dev vẫn chờ áp dụng. `CHECKPOINT-BE-P3-11-MIGRATION.md:29`.
