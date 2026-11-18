# P3-2 · BE-P3-11 · Gọi khách có lịch bị hủy do đặt cọc

Ngày 18/11/2026. Migration trên DB dev đã xác nhận và commit ở `56fabd0`. [Checkpoint migration](CHECKPOINT-BE-P3-11-MIGRATION.md)

## Thay đổi

- `viewings.controller.ts`, `viewings.service.ts` và `viewings.types.ts` thêm `POST /api/v1/viewings/:id/called` cho Boss và quản lý đúng phạm vi. Phản hồi dùng `200 { data }`. Hệ thống kiểm dấu hủy do HOLD và lưu người gọi cùng thời điểm trong giao dịch hiện có. Lần gọi lặp giữ metadata lần đầu. `calledById` và `calledAt` nằm trong dữ liệu staff.
- `dashboard.service.ts` thêm `depositCancelledViewings` vào `GET /api/v1/dashboard`. Manager nhận việc của tòa đang quản lý. Boss nhận việc của tòa thiếu quản lý hoạt động. Nhóm đếm đủ lịch chờ, trả tối đa năm lịch theo thời điểm đặt rồi ID, và hỗ trợ lọc theo `buildingId`. Hai truy vấn của nhóm đọc cùng snapshot.
- Test dashboard và viewings kiểm tra quyền truy cập, lịch hủy thông thường, chuyển người phụ trách, gọi lặp, dữ liệu phía khách và việc biến mất khỏi dashboard.
- Đã cập nhật bảng API và yêu cầu nghiệm thu trong `docs/spec/13-viewings.md`, cùng mô tả `GET /dashboard` trong `docs/spec/19-notifications.md`.

Không có `[ASSUMPTION]` mới về nghiệp vụ. Danh sách mẫu dùng thứ tự đặt lịch từ cũ tới mới, theo ID khi trùng thời điểm.

## Kiểm tra

| Phép kiểm | Kết quả |
|---|---|
| Backend build và lint | Build exit 0. Lint `Found 4 warnings and 0 errors.` Cả bốn cảnh báo đã có từ trước. |
| Test tập trung với HTTP qua bộ nhớ | `Test Files 14 passed (14)`, `Tests 230 passed (230)`, exit 0. |
| Toàn bộ test backend với HTTP qua bộ nhớ | `95 passed (97)` tệp, `1929 passed (1935)` ca, sáu ca quá giới hạn 5 giây trong `password.spec.ts` và `prisma.service.spec.ts`. Hai tệp chạy riêng qua runner chuẩn với `--maxWorkers=1 --testTimeout=60000` đạt `18 passed (18)` ca, exit 0. |
| Ca HTTP qua TCP chuẩn | Ca ghi nhận cuộc gọi gặp `connect EACCES 127.0.0.1` trong phiên này. Cùng ca đó đạt với HTTP qua bộ nhớ. |
| DB checker từ schema hiện tại | `97/97 tình huống đúng như mong đợi`, exit 0. |
| Prisma và PostgreSQL nhúng | Tạo HOLD và xác nhận đúng lịch xuất hiện cho quản lý. Sau khi gỡ phân công, Boss nhận việc và quản lý cũ nhận `OUT_OF_SCOPE`. Hai lần bấm giữ một người gọi và thời điểm, lịch giữ trạng thái `CANCELLED` và ra khỏi nhóm. PostgreSQL nhúng dùng một phiên. |

## Kiểm tra tay

1. Dùng tài khoản staff tạo HOLD cho phòng còn một lịch xem `NEW` hoặc `CONFIRMED`. Gọi `GET /api/v1/dashboard` bằng tài khoản chịu trách nhiệm và lấy `id` từ `data.depositCancelledViewings.items`.
2. Gọi `POST /api/v1/viewings/:id/called` không cần body. Kiểm tra HTTP 200, `calledById`, `calledAt`, và `status: CANCELLED`. Gọi lại để đối chiếu hai trường cuộc gọi. Tải lại dashboard để kiểm tra số việc đã giảm một.
3. Thử cùng ID bằng quản lý ngoài phạm vi. Kết quả là `403 OUT_OF_SCOPE`. Thử đánh dấu một lịch hủy thông thường. Kết quả là `409 CONFLICT_STATE`.

Commit gợi ý `feat(viewings): expose deposit cancellation call tasks (BE-P3-11, VIEW-06, D-39, NOTI-06)`

## Rà soát độc lập

Reviewer Codex thực hiện lượt rà soát do reviewer Sonnet báo `ENOTFOUND` khi kết nối dịch vụ.

**KẾT LUẬN — DUYỆT**

Phạm vi BE-P3-11 so với `56fabd0` gồm 12 tệp, +190/-6 dòng. Không có lỗi chặn. `git diff --check HEAD` thoát mã 0.

- `viewings.service.ts:166`, `:289`, `:298` khóa phân công trước khi khóa lịch và đọc lại trạng thái. Lần gọi đầu tiên giữ nguyên người và thời điểm ghi nhận qua các lần gọi lại. Quyền quản lý phải hợp lệ cả lúc xác thực lẫn lúc ghi.
- `dashboard.service.ts:85` chỉ lấy các lịch hủy do HOLD còn chờ gọi, theo người phụ trách hiện tại. Tổng số và danh sách dùng cùng một snapshot.
- `viewings.service.ts:304` giữ dữ liệu cuộc gọi ngoài phản hồi `/me`. Các trường thêm vào phản hồi staff và dashboard tương thích với frontend hiện tại.

Đã đối chiếu VIEW-06, D-39, NOTI-06, SCOPE-02..05 và các luồng tạo HOLD, đổi phân công, vô hiệu hóa quản lý. Kiểm thử HTTP tại `viewings.http.spec.ts:86` xác nhận việc biến mất khỏi dashboard và giữ nguyên bản ghi khi gọi lại tuần tự. Lượt PostgreSQL nhúng dùng một phiên. Ca hai kết nối tranh chấp cùng lịch còn ở BE-P3-12.
