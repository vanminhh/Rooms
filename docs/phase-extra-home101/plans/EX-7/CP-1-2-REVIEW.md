# EX-7 review — 15/11/2026

**DUYỆT mã nguồn EX-7 sau sửa.** Không còn lỗi chặn trong phạm vi đã review. Kiểm tay trình duyệt desktop và mobile 360 px vẫn chưa được xác nhận.

Review chỉ đọc phần đặt lịch công khai, lịch của tài khoản, màn quản lý lịch, API/cache, VI/EN, quyết định TENANT có email nhưng không cần xác minh, và phân trang `listMine`. Đã đối chiếu spec, EX-7 PLAN và LESSONS; không review lại toàn bộ migration EX-6.

Các lỗi phát hiện đã được sửa:

| Mức | Vị trí | Lỗi và kết quả kiểm lại |
|---|---|---|
| P1 | `Source/frontend/src/shared/api.ts` | Request của tài khoản A đang chờ có thể retry bằng token B sau khi đổi tài khoản. Đã tái hiện bằng fetch giả trước sửa. `sessionRevision` hiện chặn retry khác phiên, bỏ dữ liệu trả muộn và ngăn refresh cũ ghi đè token mới. Bốn regression tương ứng đều pass. |
| P2 | `Source/frontend/src/app/AuthProvider.tsx` | Refresh khởi động trả muộn có thể xóa tài khoản vừa đăng nhập. Đã đọc lại guard bỏ qua `SESSION_CHANGED`; regression dựng AuthProvider thật với refresh trì hoãn giữ đúng `ready:42`, pass. |
| P2 | `Source/backend/src/modules/viewings/viewings.service.ts` | `count` và các truy vấn nhóm chạy riêng có thể trả trùng lịch khi nhân sự chuyển NEW → CONFIRMED giữa các truy vấn. Hiện tất cả chạy trong transaction `RepeatableRead`; lấy thông tin liên hệ sau transaction. Đã đọc test ràng buộc transaction và isolation level. |

Hai khoảng trống kiểm thử đã được bổ sung:

- `VIEWING_TIME_TAKEN`: giờ vừa mất bị bỏ chọn; giữ ghi chú; không gửi thêm POST cho đến khi người dùng chọn giờ khác.
- Khách hủy lịch: xác nhận mới gửi POST; cache giờ trống bị invalidated để lấy lại từ server.

Reviewer tự chạy **61 kịch bản khác nhau, đều pass**:

- `tests/auth-api.test.mjs`: **40/40**.
- `tests/p2/fe-p2-17-viewing-form.test.mjs`: **12/12**.
- `tests/ex/ex7-guest.test.mjs`: **9/9**, gồm regression AuthProvider vừa sửa.

Phần TENANT phù hợp quyết định B: backend bắt buộc email, không yêu cầu `emailVerifiedAt`; frontend hướng tài khoản thiếu email đến trang tài khoản. GUEST vẫn giữ yêu cầu xác minh. Không thấy lỗi chặn mới về quyền sở hữu lịch, đổi tài khoản/cache, mốc giờ hủy, chuyển trạng thái nhân sự hoặc giữ nội dung khi đổi VI/EN.

Chứng cứ trên là kiểm mã và test với HTTP giả. Reviewer không xác nhận giao diện trình duyệt, đồng thời trên PostgreSQL thật hay việc gửi thư thực tế; không chạy seed, gọi DB/email, sửa file hoặc commit. Kết quả full test/lint/build do phiên chính tổng hợp riêng.

Reviewer dùng model kế thừa vì Sonnet 5 theo cấu hình repo không có trong công cụ hiện tại; không thay đổi cấu hình agent.
