# P3-2 · Checkpoint BE-P3-10

Ngày 17/11/2026. Chủ dự án đã chốt BE-P3-07..09 trong commit `2f188e0` sau khi bộ test backend trên máy dự án đạt 1916/1916.

## Thay đổi

- `contracts.controller.ts` đăng ký `GET /api/v1/contracts` và `GET /api/v1/contracts/:id` cho Boss và quản lý.
- `contracts-query.dto.ts` kiểm tra mã tòa, trạng thái, từ khóa, thứ tự và mã hợp đồng. Phân trang dùng helper API-02 hiện có.
- `contracts.service.ts` áp dụng phạm vi tòa trước khi đọc, tìm theo tên hoặc số điện thoại người thuê và mã phòng. Thứ tự mặc định theo thời gian tạo mới nhất rồi ID. Chi tiết gồm người ở, xe, dịch vụ và tóm tắt hóa đơn cọc gần nhất theo ID nếu có. Chỉ chọn bốn số cuối CCCD cho dữ liệu giấy tờ lưu hồ sơ. Định dạng ngày của phản hồi được dùng chung với POST.
- `contracts.read.http.spec.ts` kiểm tra hai route qua Nest, gồm bộ lọc, phân trang, phân quyền, ranh giới dữ liệu và đầu vào lỗi.

[ASSUMPTION A2-3] Câu chữ kiểm tra đầu vào dùng tiếng Việt theo thông lệ của dự án.

## Kiểm tra

- `npm run build` thoát mã 0. `npm run lint` có 0 lỗi và 4 cảnh báo sẵn có ở test dashboard và pricing.
- Bộ backend với HTTP trong bộ nhớ kết thúc với `Test Files 97 passed (97)` và `Tests 1927 passed (1927)`, exit 0. Nhóm test hợp đồng đạt 57/57. Bộ hồi quy POST qua bộ phân tích HTTP thật của Node đạt 8/8.
- Chạy riêng 11 ca HTTP GET bằng TCP trong phiên này cho 11 lỗi `connect EACCES 127.0.0.1`. Cùng 11 ca đó đạt qua HTTP trong bộ nhớ.
- Chạy Prisma trên PostgreSQL nhúng đạt các ca tìm theo tên, số điện thoại, mã phòng và ký tự %, phạm vi tòa, phân trang, chi tiết có CCCD mã hóa và ảnh riêng tư trong dữ liệu thử, hóa đơn cọc trống hoặc có dữ liệu và lọc đúng khi tồn tại hóa đơn tháng.

## Kiểm tra tay

1. Dùng tài khoản quản lý trong phạm vi tòa để gọi `GET /api/v1/contracts?buildingId=<id>&status=HOLD&q=<mã-phòng>&page=1&limit=20`. Kiểm tra `data` và `meta`.
2. Gọi `GET /api/v1/contracts/<id>`. Kiểm tra người ở, xe, dịch vụ, bốn số cuối CCCD và `depositInvoice`. Thử một mã hợp đồng của tòa khác để kiểm tra `403 OUT_OF_SCOPE`.
3. Chạy `npm run test` trên máy dự án từ thư mục `D:\Rooms\Source\backend`.

Commit gợi ý `feat(contracts): add scoped reads (BE-P3-10, API-02/08, SCOPE-02/05, CON-16)`

## Rà soát độc lập

**Kết luận DUYỆT**

Phạm vi BE-P3-10 so với `2f188e0` gồm 6 tệp, +350/−7 dòng, tính cả 2 tệp mới. Số liệu ở thời điểm kiểm mã, trước khi ghi kết quả checkpoint.

### Lỗi chặn

Hai phát hiện trong lượt rà soát đã được sửa.

1. `Source/backend/src/modules/contracts/dto/contracts-query.dto.ts:23` chặn ký tự NUL trong `q`. PostgreSQL nhúng từ chối chuỗi chứa ký tự này với SQLSTATE `22021`. Test tại `Source/backend/src/modules/contracts/contracts.read.http.spec.ts:140` xác nhận đầu vào nhận HTTP 400 `VALIDATION_FAILED` trước khi gọi Prisma, theo API-04.
2. `Source/backend/src/modules/contracts/contracts.read.http.spec.ts:82` kiểm tra toàn bộ danh sách trường Prisma được phép lấy cho route danh sách. Test sẽ phát hiện khi mất `select` hoặc khi có thêm trường ngoài danh sách cho phép.

### Nên sửa

Reviewer đã duyệt phần mã sau khi xác minh hai sửa đổi.

### Ghi chú

- `Source/backend/src/modules/contracts/contracts.service.ts:74` áp dụng cùng bộ lọc cho truy vấn đếm và lấy trang, kiểm tra `buildingId` theo phạm vi quản lý và dùng ID để ổn định thứ tự khi trùng `createdAt`. Reviewer đã thử `ILIKE` chỉ đọc trên PostgreSQL nhúng và xác nhận `%`, `_`, `\` được tìm theo nghĩa ký tự.
- `Source/backend/src/modules/contracts/contracts.service.ts:101` giới hạn truy vấn chi tiết theo tòa. Lượt dò tồn tại khi thiếu kết quả chỉ đọc ID để phân biệt 403 với 404, theo tiền lệ của luồng staff FILE-01. Phần dữ liệu chi tiết chỉ chọn bốn số cuối CCCD và bản tóm tắt hóa đơn cọc. Mật khẩu, CCCD mã hóa và mã định danh tài sản riêng tư đều nằm ngoài phần chiếu.
- `git diff --check HEAD` thoát mã 0. Reviewer kiểm PostgreSQL nhúng bằng SELECT. Kết quả chạy suite và kiểm tra Prisma được ghi riêng ở phần kiểm tra checkpoint.

### Đã kiểm

Controller, service, DTO, test HTTP, hai tệp theo dõi tiến độ, schema Prisma, guard xác thực và phân quyền, helper phạm vi và phân trang, định dạng ngày, cấu trúc phản hồi, thay đổi định dạng phản hồi của `POST /contracts`, cùng các yêu cầu API-01/02/04/06/07/08, SCOPE-01/02/05, CON-13/14/16 và D-37.

## Đề xuất BE-P3-11 cần chủ dự án duyệt

Thêm vào `viewings` ba trường tùy chọn theo D-39 và VIEW-06. `called_by_id` liên kết nhân sự đã bấm Đã gọi, `called_at` ghi thời điểm và `deposit_cancelled_by_contract_id` liên kết hợp đồng khiến lịch bị hủy. Hai trường Đã gọi cùng có hoặc cùng trống. Dấu gọi thuộc lịch CANCELLED có liên kết hợp đồng. Với các lịch đã bị hủy ở checkpoint trước, điền liên kết theo danh sách `cancelledViewingIds` trong audit `contract.create`, đối chiếu trạng thái và phòng. Chủ dự án duyệt bước tạo migration trước. Sau khi kiểm migration offline, chủ dự án duyệt riêng bước áp dụng lên database.
