# P3-2 · Checkpoint BE-P3-07..09

Ngày 17/11/2026. Mốc này bổ sung `POST /api/v1/contracts` cho Boss và quản lý đúng tòa, chọn tài khoản người ký và cập nhật lịch xem trong cùng giao dịch. Các lựa chọn 1A, 2C, 3B và 4A đã được ghi vào [đặc tả hợp đồng](../../../spec/14-contracts.md) và [đặc tả lịch xem](../../../spec/13-viewings.md).

## Tệp thay đổi

| Tệp hoặc nhóm tệp | Thay đổi |
|---|---|
| `Source/backend/src/modules/contracts/` | DTO, controller, dịch vụ tạo HOLD, luồng tài khoản người ký và test. |
| `Source/backend/src/modules/auth/` và `src/common/crypto/password.ts` | Đồng bộ xác minh email với việc chuyển loại tài khoản. Dùng Argon2 giả cho tài khoản chưa kích hoạt. Có test hồi quy. |
| `Source/backend/src/modules/viewings/` | Phạm vi tòa và dữ liệu tên, điện thoại thật của chủ lịch WEB cho form Chốt của nhân sự. |
| `Source/backend/src/common/errors/db-errors.ts` | Nhận diện chỉ mục hoặc cột unique theo ngữ cảnh ghi. |
| `docs/spec/` và `docs/phase-3-contracts/` | Quyết định đã chốt, kế hoạch, checkpoint và tiến độ. |

## Kiểm tra

- Ảnh kết quả chủ dự án gửi ngày 17/11/2026 xác nhận bộ test backend trên máy dự án đạt **96/96 file và 1916/1916 test**, thời lượng 104,96 giây.
- `npm run build` thoát mã 0. `npm run lint` có 0 lỗi và 4 cảnh báo có sẵn ở test dashboard và pricing.
- `npm run test` với TCP chuẩn đạt 1156/1916. JSON kết quả xác nhận cả 760 ca lỗi đều mang `connect EACCES 127.0.0.1`. Chạy lại đủ 96 file với socket nội bộ được thay bằng luồng trong bộ nhớ đạt **1916/1916**, exit 0. Bộ phân tích HTTP, Supertest, Express và Nest hoạt động như bộ test chuẩn.
- 86/86 ca tập trung qua ở 7 file. Tám ca `POST /api/v1/contracts` qua bộ phân tích HTTP thật của Node và ứng dụng Nest với Prisma giả lập. Các ca bao phủ mã lỗi, danh tính, quyền, CCCD, hai xác nhận và phản hồi 201.
- Hai lời gọi vào dịch vụ chạy qua Prisma và PostgreSQL nhúng PGlite. Chỉ mục thật `contracts_one_open_per_room` giữ đúng một HOLD, lời gọi còn lại trả `ROOM_NOT_AVAILABLE`. Ca thứ hai gây lỗi audit và PostgreSQL xác nhận hoàn tác hợp đồng, người ký, thay đổi vai trò và hai lịch xem. PGlite chạy một phiên. BE-P3-12 kiểm thêm chờ khóa qua hai kết nối PostgreSQL độc lập.

## Kiểm tra tay

1. Từ máy dự án, chạy `npm run test` trong `D:\Rooms\Source\backend`.
2. Dùng dữ liệu thử, gọi `POST /api/v1/contracts` với tài khoản quản lý, phòng đủ điều kiện ở tòa được phân công, ngày vào ở từ hôm nay, hạn 3 tháng và `serviceIds` là mảng dịch vụ hợp lệ hoặc mảng rỗng. Kết quả 201 mang mã `HD…`, trạng thái HOLD và số tiền cọc mặc định bằng giá phòng nếu bỏ `deposit`.
3. Thử từ lịch WEB đã xác nhận, dùng người ký khác chủ lịch. Yêu cầu đầu trả `CONFLICT_STATE`. Gửi lại với `confirmDifferentViewingOwner: true` sau khi nhân sự xác nhận. Nếu số người ký là một tài khoản GUEST đã xác minh, API trả `PHONE_TAKEN` kèm thông tin để nhân sự xác nhận A-18, sau đó gửi thêm `confirmedGuestAccountId`. Khi tạo thành công, lịch nguồn chuyển WON và chủ lịch giữ nguyên. Các lịch NEW/CONFIRMED khác cùng phòng được hủy.

[ASSUMPTION A-18] Nhân sự xác nhận với người ký trước khi dùng lại tài khoản khách đã xác minh. Câu tiếng Việt của các lỗi mới là câu chữ triển khai đề xuất. Theo lựa chọn 4A, `idNumber` là trường tùy chọn. Khi có giá trị, DTO kiểm đúng 12 chữ số.

Commit gợi ý `feat(contracts): create HOLD contracts and close viewings (BE-P3-07..09, CON-01..05, CON-07, VIEW-05/06)`

## Rà soát độc lập lần đầu

**Kết luận CHẶN.** Phạm vi so với `eb8cf64` gồm 19 file, +816/-12 dòng. Thống kê gồm 12 file Git đã theo dõi và 7 file backend mới. Reviewer đọc diff, các file backend mới, guard, helper phạm vi, validation và lỗi, audit, luồng lịch, cập nhật tòa và quản lý, giá, crypto, ngày Hà Nội, Prisma schema/client, migration và ràng buộc. Đối chiếu các spec 00, 01, 02, 10, 11, 12, 13, 14, NOTI-06 và AUD-01. `PLAN.md` nằm ngoài phạm vi review.

1. **Đăng nhập làm lộ sự tồn tại của tài khoản chờ ký.** `contract-tenant.ts:10` lưu một chuỗi sai định dạng Argon2. `auth.service.ts:104` chỉ dùng hash giả khi không tìm thấy tài khoản. `password.ts:12` xử lý lỗi định dạng ngay, khiến lần thử với tài khoản chờ ký kết thúc sớm. AUTH-01/04 yêu cầu cả hai nhánh có một lượt kiểm Argon2. Giữ marker nhận diện nếu cần, thực hiện lượng công việc Argon2 tương đương và luôn từ chối mật khẩu chờ ký.
2. **Tạo hợp đồng bỏ qua phạm vi tòa mà guard cấp cho yêu cầu.** `contracts.service.ts:49` khóa và đọc phòng theo ID, rồi dòng 57 kiểm tra phân công hiện tại. Quản lý có `buildingIds: []` vẫn tạo được nếu tòa vừa được giao sau lúc guard đọc quyền. SCOPE-02 yêu cầu lọc `allowedBuildingIds` thông qua `scopeWhere`, kiểm tra phân công hiện tại và trả `OUT_OF_SCOPE` khi một trong hai điều kiện không đạt.
3. **Ca kiểm đồng thời chưa chạy hai giao dịch cạnh tranh.** `contracts.service.spec.ts:201` gọi hai yêu cầu nhưng hàng đợi ở dòng 96 tuần tự hóa giao dịch. `$queryRaw` ở dòng 34 là no-op và dòng 58 mô phỏng lỗi `P2002`. Ca này chưa kiểm đúng khóa PostgreSQL hoặc metadata Prisma thật. Reviewer đề nghị kiểm hai yêu cầu tạo cùng phòng qua Prisma/PostgreSQL.

Reviewer cũng đề nghị kiểm rollback trên DB thật thay cho mô phỏng ở `contracts.service.spec.ts:330` và kiểm OTP cùng luồng chuyển tài khoản ở cả hai thứ tự giao dịch. Bí mật CCCD và mật khẩu được loại khỏi phản hồi/audit bằng projection tường minh. Phần việc gọi lại khách thuộc BE-P3-11. `git diff --check` thoát mã 0. Rà soát lần đầu dựa trên mã và schema.

## Rà soát sau sửa

**Kết luận DUYỆT phần mã BE-P3-07..09.** Hai lỗi chặn trong lần review trước đã được sửa.

- `auth.service.ts:103` dùng cùng hash Argon2 giả cho tài khoản chờ ký và số chưa đăng ký, đồng thời luôn từ chối đăng nhập ở cả hai trường hợp. Ca hồi quy tại `auth.verify-email-race.spec.ts:39` kiểm tra cùng hash được truyền vào Argon2 và không tạo phiên.
- `contracts.service.ts:51` áp dụng `scopeWhere(actor)` và kiểm tra lại phân công hiện tại trong giao dịch. Ca hồi quy tại `contracts.service.spec.ts:204` kiểm tra manager bị từ chối khi phạm vi của yêu cầu thiếu tòa. `git diff --check` thoát mã 0.

Ca Prisma/PGlite được báo cáo đã xác minh chỉ mục thật cho đúng một HOLD, lỗi `ROOM_NOT_AVAILABLE` cho yêu cầu còn lại và rollback khi ghi audit thất bại. Ca này dùng một phiên. Cơ chế chờ khóa giữa hai kết nối PostgreSQL độc lập và bộ e2e qua TCP vẫn cần xác minh ở BE-P3-12.
