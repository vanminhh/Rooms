# Đưa Rooms lên Vercel và Render để chấm đồ án

Giảng viên dùng một link HTTPS dạng `https://<ten-du-an>.vercel.app`. Vercel phục vụ giao diện React và chuyển tiếp mọi đường dẫn `/api/*` sang backend NestJS trên Render. Trình duyệt giữ nguyên tên miền Vercel khi đăng nhập và làm mới phiên. PostgreSQL lưu dữ liệu, Cloudinary lưu ảnh và bản quét.

## 1. Chuẩn bị

- Dùng repository Git mà cả hai dịch vụ được phép đọc. Cấu hình trong repo phải có trên nhánh triển khai; cấu hình mẫu dùng nhánh `master`. Kiểm tra commit trên remote trước khi tạo deployment.
- Chuẩn bị database PostgreSQL **demo** ở Singapore, có schema Rooms và tài khoản dùng để chấm. Dùng URL pooled cho ứng dụng và URL direct cho Prisma. Endpoint health chỉ thử kết nối DB; bước đăng nhập bên dưới mới kiểm tra được schema và tài khoản. Nếu DB trống, dừng trước khi cho giảng viên dùng và làm bước chuẩn bị DB riêng. Build và start trong hướng dẫn này không chạy migration hay seed.
- Chọn tên project Vercel. Dùng địa chỉ production ổn định mà Vercel thực tế cấp làm `APP_URL`; nếu địa chỉ khác tên dự kiến, sửa biến trên Render rồi triển khai lại. Dùng dữ liệu mẫu và thông tin đăng nhập demo riêng.
- Cấu hình này dành cho đồ án phi thương mại. Render Free ngủ sau khoảng 15 phút không có lưu lượng và thường cần khoảng một phút để thức. Các lịch trong backend chỉ chạy khi tiến trình hoạt động; khi khởi động, từng tác vụ áp dụng quy tắc chạy bù riêng. Nếu cần vận hành thật theo DEP-02, chọn **một** instance luôn hoạt động với ít nhất **1 GB RAM** và kiểm tra lịch trên môi trường đó. [Render Free](https://render.com/docs/free) · [Điều khoản Vercel Hobby](https://vercel.com/legal/terms)

## 2. Tạo backend trên Render

1. Trong Render Dashboard, chọn **New → Blueprint**, kết nối repository, chọn nhánh chứa bản cần deploy và file `render.yaml` ở gốc repo. Kiểm tra màn hình xác nhận hiển thị **Free**, **Singapore**, một web service Node. Blueprint dùng thư mục `Source/backend`, cài cả công cụ build, sinh Prisma Client, build Nest và chạy `node dist/main.js`. Render cấp cổng qua `PORT`. [Render Blueprint](https://render.com/docs/blueprint-spec)
2. Nhập các giá trị được hỏi vào Environment của **backend**:

   | Biến | Giá trị cần điền |
   |---|---|
   | `APP_URL` | Địa chỉ HTTPS của frontend Vercel, không kèm đường dẫn |
   | `DATABASE_URL`, `DIRECT_URL` | Hai chuỗi kết nối của cùng database demo |
   | `JWT_SECRET` | Secret riêng của bản demo, ít nhất 32 ký tự |
   | `CCCD_KEY` | Khóa 32 byte mã hóa base64. Nếu DB demo có dữ liệu đã mã hóa, dùng đúng khóa tương ứng và giữ bản sao an toàn |

3. Trong **Environment**, thêm các tích hợp cần trình bày: `CLOUDINARY_URL` cho ảnh, `MAIL_PROVIDER=resend`, `MAIL_API_KEY`, `MAIL_FROM` cho xác minh email và gửi thông báo thật, `BANK_WEBHOOK_SECRET` cho SePay test mode. Bên SePay, dùng cùng khóa HMAC, bật gửi lại khi server trả lỗi và đặt URL nhận là `https://<host-render>/api/v1/webhooks/bank`. Các biến bí mật chỉ nhập trên Render.
4. Deploy rồi sao chép **đúng hostname** trong dashboard Render. Mở `https://<host-render>/api/v1/health`, chờ khởi động và kiểm tra HTTP 200 với `{"status":"ok"}`. HTTP 503 nghĩa là backend đã trả lời nhưng truy vấn DB thất bại. Xem **Logs** để kiểm tra lúc chạy và **Events** để xem lịch sử deploy/restart. Render quản lý tiến trình và khởi động lại khi gặp sự cố; để chủ động khởi động lại, dùng **Manual Deploy → Restart service**. [Render web services](https://render.com/docs/web-services)

## 3. Nối frontend Vercel với Render

1. Mở `Source/frontend/vercel.json`. Thay **RENDER_APP.onrender.com** bằng hostname thật ở bước 2. Giữ đích là `https://<host-render>/api/:path*` để backend nhận đủ prefix `/api/v1`. Giữ quy tắc API đứng trước quy tắc trả `/index.html` cho đường dẫn React. Đưa thay đổi lên nhánh dùng để deploy. [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
2. Trong Vercel chọn **Add New → Project**, import cùng repository. Chọn **Root Directory** là `Source/frontend`, framework **Vite**, Node **24.x**, install command `npm ci --include=dev`, build command `npm run build`, output `dist`. Kiểm tra Production Branch là nhánh mong muốn. Bấm **Deploy**.
3. Sao chép domain production `.vercel.app`, đối chiếu với `APP_URL` trên Render. Dùng link này cho giảng viên. Với bản demo, hướng dẫn dùng HTTPS và tên miền mặc định của hai nền tảng. Cloudflare và tên miền mua riêng là các lựa chọn sau này.

## 4. Kiểm tra trước khi gửi link

| Thử trên link Vercel | Kết quả mong đợi |
|---|---|
| Mở `/api/v1/health` | Trả JSON như khi gọi Render trực tiếp. Nếu nhận HTML, kiểm tra hostname và thứ tự rewrite rồi deploy lại frontend. |
| Mở trực tiếp `/phong` rồi nhấn F5 | Danh sách phòng tải được, kể cả khi mở link từ tab mới. |
| Đăng nhập bằng tài khoản demo | Trong Network, request đi tới `/api/v1/auth/login` trên tên miền Vercel; cookie `rt` có `HttpOnly`, `Secure` và path `/api/v1/auth`. Sau khi access token hết hạn, request refresh thành công và người dùng vẫn ở đúng vai trò. |
| Mở một ảnh phòng; nếu trình bày upload, tải thử một ảnh demo | Cloudinary trả ảnh và ảnh vẫn còn sau khi restart Render. |
| Restart backend rồi mở lại trang phòng | Kiểm tra health về 200, xem log khởi động và kết quả tác vụ chạy bù. Trước buổi bảo vệ, mở danh sách phòng và đăng nhập thử để backend thức. |

**IP người dùng (DEP-04).** Blueprint bắt đầu với `TRUST_PROXY_HOPS=0`: backend dùng IP kết nối trực tiếp, do đó nhiều người có thể dùng chung hạn mức đăng nhập. Đường đi qua Vercel rồi Render có thêm một proxy so với truy cập thẳng URL Render. Với origin Render còn mở công khai, chưa có một số hop đã xác minh dùng an toàn cho cả hai đường đi. Giữ 0 cho demo; trước production, thống nhất đường truy cập tin cậy, đo chuỗi proxy thực tế, kiểm tra từ hai mạng và kiểm tra đường trực tiếp rồi mới tăng giá trị. Kiểm tra CDN và sao lưu nằm ở GL-10 và GL-11.

Nếu frontend lỗi build, mở **Vercel → Deployments → Build Logs**. Nếu frontend tải được nhưng API lỗi, thử URL health trên Render trước, sau đó thử cùng đường dẫn trên Vercel để phân biệt lỗi backend/DB với lỗi chuyển tiếp.
