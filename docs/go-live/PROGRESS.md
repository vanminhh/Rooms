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
| GL-B Vá code | agent | xong | GL-05 | ae84fa6 | GL-06 chờ Q-GL-3 | Backend 2914/2914, frontend 1052/1052. |
| GL-C Webhook thật | agent | xong | GL-08 | c3c6fde | GL-09 dùng Vercel và Render | Backend và hai file bank e2e pass trên máy dev. |
| GL-D File deploy | agent | chờ commit | GL-12 | GL-11: 2fcd723 | GL-13: kiểm kê hạ tầng | Đã tổng kết bản demo. DEP-02 và diễn tập khôi phục còn mở. |
| GL-E Hạ tầng | chủ dự án + agent | đang làm | GL-13 | - | Kiểm tra gửi lại webhook trong Test mode | Đã đối soát TT11 trên bản demo. |
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
| 26/11/2026 | GL-C | GL-06 | Đã ghi nhận SePay và MB Bank, xác minh Q-04, cập nhật BANK-08. Chờ duyệt đặc tả và HMAC-SHA256. |
| 26/11/2026 | GL-C | Duyệt GL-06, triển khai GL-07 | Chủ dự án duyệt SePay HMAC-SHA256 cho MB Bank. Đã thêm adapter, lưu raw body để xác thực và dùng chung xử lý hóa đơn. |
| 26/11/2026 | GL-C | Nghiệm thu GL-07/08 | Chủ dự án xác nhận bộ backend và hai file bank e2e đã pass trên máy dev. Chờ commit. |

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

### GL-07 và GL-08 · SePay MB Bank

Giữ adapter giả cho NODE_ENV=test, dùng SePay trong development và production. Không thay schema, cài dependency hoặc cấu hình tài khoản thật. Dùng giao dịch DB và khóa chống trùng hiện có, trả JSON cấp cao nhất sau khi ghi nhận. Chưa kích hoạt đối soát qua API v2.

Build pass. Lint 0 lỗi, 4 cảnh báo cũ. Bộ bank 19/20, test HTTP dừng trước handler do EACCES. Kiểm tra qua Nest trong tiến trình với body thật đọc từ stream cho 200 đúng JSON và 401 khi sai chữ ký. Bộ backend toàn phần trong workspace đạt 1530/2924 (1394 fail, 9 lỗi runtime). Hai file bank e2e chưa pass; truy vấn kiểm tra DB gặp lỗi kết nối. Chờ chạy trên máy dev.

**Báo cáo reviewer GL-06/07.** Reviewer Sonnet theo cấu hình gặp ENOTFOUND. Reviewer độc lập thay thế đưa ra báo cáo sau khi kiểm tra bản sửa.

**KẾT LUẬN: DUYỆT** bản sửa GL-06/07. Phạm vi rà soát gồm 15 tệp chưa commit, +285/−32 dòng tại thời điểm kiểm tra.

**Lỗi chặn:** Đã khắc phục phát hiện duy nhất. docs/spec/17-bank.md:35 ghi đúng điều kiện SePay gửi lại sau HTTP 500/503. docs/go-live/feature_go-live.md:81 yêu cầu bật tùy chọn và thử gửi lại sau 503 trong môi trường test của SePay.

**Nên sửa:** Không có đề xuất bổ sung.

**Đã kiểm:** Đối chiếu BANK-01..04, BANK-07/07a/08 với cấu hình Nest, controller, hai adapter, xử lý giao dịch và ba tệp kiểm thử mới. Đã rà soát xác thực chữ ký trên byte gốc, cửa sổ năm phút, điều kiện khớp hóa đơn, khóa chống ghi tiền hai lần và phản hồi khi ghi DB thất bại.

**Ghi chú:** Đây là kết quả rà soát mã nguồn. GL-08 còn chờ kết quả toàn bộ test backend và hai tệp e2e ngân hàng trên máy dev.

**26/11/2026 · GL-09** — Đã viết hướng dẫn demo, cấu hình Render và đường chuyển tiếp API trên Vercel. Chờ chủ dự án xác nhận có thể làm theo từng bước. Kiểm tra HTTPS, cookie và webhook trên host thật thuộc bước triển khai.

**GL-10 · 26/11/2026** — Đã bổ sung quy tắc cache API tại backend và hướng dẫn kiểm tra qua Vercel ở mục 5 của deploy/README.md. Kiểm tra HIT của bản GL-10 trên domain thật sau khi triển khai. GL-11 tiếp theo.
Kiểm tra backend: 148/148 file, 2925/2925 test pass (2 workers, timeout 20 giây), build pass, lint 0 lỗi và 4 cảnh báo. Trước deploy, hai GET filters qua Vercel đều trả MISS.

**26/11/2026 · GL-11** — Chủ dự án chọn Q-GL-7B. Bổ sung script pg_dump và hướng dẫn đặt lịch Windows, lưu bản riêng và thử khôi phục vào PostgreSQL local mới. Đã kiểm tra cú pháp và ba tình huống mô phỏng (thành công, lỗi dump, lỗi đọc archive). Chưa đặt lịch hay sao lưu dữ liệu thật. Kiểm tra GL-10 sau deploy: public/filters trả MISS rồi HIT; me/viewings trả 401, no-store, MISS.

**26/11/2026 · GL-12 — Tổng kết triển khai demo.** Giao diện Vercel gọi backend Render cùng origin qua rewrite; health trả HTTP 200 và chủ dự án đã đăng nhập thành công. GL-10 đã kiểm tra trên domain Vercel: public/filters trả MISS rồi HIT, me/viewings khi chưa đăng nhập trả 401 và no-store. GL-11 có script pg_dump và hướng dẫn Windows trong commit 2fcd723; ba tình huống mô phỏng đã qua. Lịch backup và bản sao dữ liệu thật chưa được xác nhận; diễn tập restore vào DB riêng ở GL-24. Render Free còn giới hạn ngủ, nên DEP-02 cho production vẫn mở. Tiếp theo GL-13 kiểm kê hạ tầng và các dịch vụ tích hợp.
### Kiểm kê GL-13

Ngày 27/11/2026. Phạm vi hiện tại là bản demo đồ án.

| Hạng mục | Đã xác nhận | Còn cần kiểm tra |
|---|---|---|
| Frontend, tên miền và CDN | Rooms dùng HTTPS trên `rooms-sigma-ten.vercel.app`. GL-10 đã ghi nhận CDN trả HIT cho bộ lọc công khai. | Bản demo dùng tên miền Vercel. Tên miền và DNS riêng cho production chưa được xác nhận. |
| Backend | Người dùng đã đăng nhập qua Vercel vào API trên Render. | DEP-02 còn mở vì Render Free có thể ngủ. |
| PostgreSQL | Health, đăng nhập và đối soát hóa đơn đã chạy trên DB demo. | Đối chiếu vùng Singapore trên dashboard của nhà cung cấp và xác nhận DB dành cho production. |
| Email | Backend có cấu hình cho Resend. | Xác nhận domain gửi đã Verified và email thử đến hộp thư. |
| Ảnh | Backend dùng Cloudinary qua `CLOUDINARY_URL`. | Tải một ảnh phòng mẫu trên bản triển khai và mở lại. Tài khoản Cloudinary production chưa được xác nhận. |
| Ngân hàng | Chủ dự án xác nhận đã cấu hình HMAC và Rooms ghi nhận giao dịch SePay Test mode 5.000 đ cho hóa đơn TT11 qua MB Bank. | Kiểm tra tùy chọn tự gửi lại và lịch sử một lần nhận 503 rồi nhận 2xx trên môi trường thử riêng. Tích hợp Live chưa được kiểm chứng. |
