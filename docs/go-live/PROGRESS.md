# Go-live — tiến trình

File này giúp người hoặc agent mới vào biết ngay go-live đang ở đâu. Trạng thái từng task nằm trong [feature_go-live.md](feature_go-live.md) (`[ ]` / `[~]` / `[x]` / `[!]`). Ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Ở mỗi điểm dừng ⏸, trước khi báo cáo, agent sửa file này:
- đổi dòng của phần mình trong bảng;
- thêm một dòng vào nhật ký.

Cột "Commit" ghi hash do chủ dự án báo lại sau khi commit. Agent chỉ điền hash sau khi đã kiểm bằng `git log`.

Trạng thái: `chưa làm` · `đang làm` · `chờ commit` (đã dừng ở ⏸, chờ chủ dự án kiểm chứng) · `xong` · `kẹt` (ghi lý do) · `chờ quyết định` (cần câu trả lời Q-GL).

## Bảng tổng

| Phần | Ai làm | Trạng thái | Điểm dừng gần nhất | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|---|
| GL-A Quyết định | chủ dự án | chưa làm | - | - | Trả lời Q-GL-1..10 | README.md §3 |
| GL-B Vá code | agent | chờ commit | GL-05 | - | Chủ dự án commit GL-05 | Backend 2914/2914, frontend 1052/1052. |
| GL-C Webhook thật | agent | chờ quyết định | - | - | Cần Q-GL-3 | |
| GL-D File deploy | agent | chờ quyết định | - | - | Cần Q-GL-1, Q-GL-5 | |
| GL-E Hạ tầng | chủ dự án | chưa làm | - | - | Sau GL-A, GL-D | Tạo tài khoản, điền env |
| GL-F DB production | chủ dự án + agent | chưa làm | - | - | Sau GL-E | Hỏi trước mỗi thao tác trên DB |
| GL-G Chạy thử | agent + chủ dự án | chưa làm | - | - | Sau GL-C, GL-F | Có 1 lần chuyển khoản thật |
| GL-H Go-live, tháng đầu | chủ dự án + agent | chưa làm | - | - | Sau GL-G | |

## Nhật ký

| Ngày | Phần | Việc | Kết quả |
|---|---|---|---|
| 26/11/2026 | - | Lập kế hoạch và file task | README.md, feature_go-live.md, PROGRESS.md |
| 26/11/2026 | GL-B | GL-02 / DEP-04 | Build pass. Lint 0 lỗi, 4 cảnh báo ngoài phần sửa. Env 41/41. Hai test HTTP gặp EACCES trước khi tới API. Chờ kết quả toàn bộ test backend trên máy dev. |
| 26/11/2026 | GL-B | Hoàn tất GL-02 / DEP-04 | Ảnh kết quả từ chủ dự án: 145/145 file, 2911/2911 test pass trong 149,90 giây trên máy dev. |
| 26/11/2026 | GL-B | GL-04 / DEP-10 | Đã thêm health check. Build pass, lint 0 lỗi và 4 cảnh báo cũ. Kiểm tra qua Nest trong tiến trình trả đúng 200 và 503, cả hai có no-store. Supertest qua TCP bị EACCES trước khi tới API. Chờ kết quả chạy đầy đủ trên máy dev. |
| 26/11/2026 | GL-B | Sửa test GL-04 | Máy dev đạt 2912/2913, chỉ file prisma.service.spec.ts lỗi. Đã cập nhật assertion danh sách controller theo DEP-10, chạy lại file đạt 7/7. Chờ lượt toàn bộ sau sửa. |
| 26/11/2026 | GL-B | Hoàn tất GL-04 / DEP-10 | Chủ dự án xác nhận bộ test backend sau sửa đạt 146/146 file, 2913/2913 test trong 123,79 giây. |
| 26/11/2026 | GL-B | GL-05 kiểm tra production | Backend và frontend build thành công, frontend lint exit 0. Bản backend biên dịch thoát 1 khi thiếu JWT_SECRET. Khi đủ biến thử nghiệm, backend lắng nghe và đăng ký 5 cron: close-incidents, invoice-reminders, late-readings, monthly-invoice, room-price-sync. Cookie rt từ controller production với phiên giả lập có Path=/api/v1/auth, HttpOnly, Secure, SameSite=Lax. Kiểm tra khởi động dùng DB giả lập bằng địa chỉ không có dịch vụ, chỉ xác minh đăng ký cron. |


| 26/11/2026 | GL-B | GL-05 đạt kiểm thử sau sửa | Ảnh máy dev: 146/146 file, 2914/2914 test backend pass trong 133,72 giây. Frontend 1052/1052. Chờ commit. |

### GL-05 · Báo cáo reviewer độc lập, 26/11/2026

Reviewer Sonnet được cấu hình cho dự án gặp lỗi DNS (ENOTFOUND). Một reviewer độc lập khác đã đọc dải commit. Báo cáo tại thời điểm trước bản sửa:

**KẾT LUẬN: CHẶN**

Phạm vi: `4a577ea..bd50b51` · 17 tệp · +233/−21 dòng.

**Lỗi chặn**

1. `Source/backend/src/health.controller.ts:20` — Khi SELECT 1 thành công, một yêu cầu GET có If-None-Match khớp với ETag của phản hồi nhận 304 và thân rỗng. DEP-10 yêu cầu 200 và {"status":"ok"} (docs/spec/01-architecture.md:144). Express bật ETag mặc định (Source/backend/node_modules/express/lib/application.js:95), json() gọi send() (Source/backend/node_modules/express/lib/response.js:252) và send() đổi mã thành 304 khi req.fresh (:199). Nên ghi trực tiếp JSON bằng type('application/json').end(...) riêng cho route này và bổ sung test HTTP có If-None-Match để kiểm tra mã, thân phản hồi và số lần truy vấn DB.

**Nên sửa**

Source/backend/src/modules/auth/auth.service.ts:120 — Khi tra cứu người dùng gặp lỗi DB, mã hoàn lại lượt theo IP nhưng vẫn giữ lượt theo số điện thoại đã ghi ở dòng 105. Năm lần lỗi DB có thể khiến người dùng tiếp tục nhận 429 sau khi DB phục hồi. Hành vi theo số điện thoại đã tồn tại trước dải commit. Nên hoàn lại lượt của cả hai bộ đếm khi xác thực chưa đưa ra kết quả và bổ sung test cho tình huống DB phục hồi.

**Ghi chú**

Đây là lượt rà soát độc lập thay thế do dịch vụ reviewer Sonnet được chỉ định gặp lỗi DNS. Reviewer chỉ đọc mã và đặc tả, không chạy lại bộ test. Khuyến nghị chặn áp dụng cho GL-04. Chủ dự án quyết định nghiệm thu.

**Đã kiểm**

- GL-02 — main.ts, app.setup.ts, common/env.ts, các test cấu hình, auth.controller.ts, auth.service.ts, rate-limiter.ts và auth.login-proxy.spec.ts. Đối chiếu DEP-02, DEP-04, AUTH-04, AUTH-16 và A-08.
- GL-03 — Đối chiếu các biến môi trường mà mã chạy trong Source/backend/src/ đọc với Source/backend/.env.example cùng giá trị mặc định trong common/prisma/tx-timeout.ts.
- GL-04 — app.module.ts, health.controller.ts, health.controller.spec.ts, common/prisma/prisma.service.spec.ts, đường trả JSON trong Express, quyết định D-47 và đặc tả DEP-10. Hai test tại thời điểm review kiểm tra GET thông thường trên cả nhánh 200 và 503 (Source/backend/src/health.controller.spec.ts:27, :34).

**Xử lý sau review.** Đã sửa lỗi chặn của health check và bổ sung test request có If-None-Match. Hành vi bộ đếm số điện thoại khi DB lỗi là tồn tại cũ, ghi nhận để xử lý riêng.

**Kiểm tra sau sửa.** Bản build backend và lint pass (4 cảnh báo cũ). Qua router Nest trong tiến trình, ba request dùng ba lần SELECT 1 và lần lượt nhận 200, 200 với If-None-Match: *, 503 khi DB lỗi, tất cả no-store. Supertest qua TCP gặp EACCES ở cả ba request trước khi tới API. Bộ backend 2913/2913 thuộc bản trước khi thêm test mới.

**Frontend.** Hai lượt toàn bộ đầu đạt 1050/1052 rồi 1051/1052. Khi danh mục bộ lọc đến muộn, giá đang nhập có thể bị reset. Đã giữ dữ liệu form khi URL không sử dụng danh mục, thêm tình huống danh mục tải muộn vào test FE-P2-15 và cho test UI-03 chờ render trang 2.

Lượt frontend cuối sau sửa đạt 1052/1052 trong 291,40 giây, không skip, lint và build exit 0. Vite báo có chunk trên 500 kB.
