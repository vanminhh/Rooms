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

## 5. Kiểm tra bộ nhớ đệm API trên Vercel (GL-10, DEP-06, PUB-05)

1. Triển khai bản backend có GL-10 lên Render và chờ trạng thái **Live**. Trong Vercel, dùng project Rooms đang chuyển tiếp `/api/*` đến Render. Project demo tạo tháng 11/2026 dùng cơ chế mặc định của Vercel cho project mới: CDN đọc chỉ thị cache từ backend. [Tài liệu Vercel về cache của external rewrites](https://vercel.com/changelog/vercels-cdn-now-respects-cache-control-headers-from-external-origins-by-default)
2. Mở PowerShell và chạy các lệnh dưới đây. Dùng GET để kiểm tra đúng phương thức. Lệnh chỉ in header và mã HTTP.

   ```powershell
   $site = 'https://rooms-sigma-ten.vercel.app'
   function Show-RoomsHeaders($url) {
     curl.exe -sS -D - -o NUL $url | Select-String '^(HTTP/|cache-control:|x-vercel-cache:|age:|vary:)'
   }
   Show-RoomsHeaders 'https://rooms-demo-api.onrender.com/api/v1/public/filters'
   1..3 | ForEach-Object { Show-RoomsHeaders "$site/api/v1/public/filters" }
   Show-RoomsHeaders "$site/api/v1/public/unknown-route"
   1..2 | ForEach-Object { Show-RoomsHeaders "$site/api/v1/health" }
   1..2 | ForEach-Object { Show-RoomsHeaders "$site/api/v1/me/viewings" }
   ```

3. Đối chiếu kết quả:

   | Yêu cầu | Kết quả đạt |
   |---|---|
   | GET filters trực tiếp trên Render | HTTP 200 và `Cache-Control: public, max-age=0, s-maxage=60`. Trình duyệt hỏi lại mỗi lần. CDN được giữ kết quả 60 giây. |
   | GET filters qua Vercel | HTTP 200. Gọi lặp cùng URL từ cùng máy trong 60 giây phải thấy `x-vercel-cache: HIT` khi cache đã có dữ liệu. Lần đầu có thể là MISS hoặc HIT. Vercel có thể bỏ `s-maxage` khỏi header trả về trình duyệt. |
   | GET public trả lỗi | HTTP 404 và `no-store`. |
   | GET health và GET me/viewings khi chưa đăng nhập | Lần lượt HTTP 200 và 401, cả hai trả `no-store`. Gọi lại vẫn không có HIT. |

   Nếu public luôn MISS, đối chiếu header trực tiếp trên Render trước. Sau đó kiểm tra cấu hình cache cho external rewrites của project Vercel và các rule tùy chỉnh đang ghi đè header. Khi thử endpoint có phân trang, bộ lọc hoặc ngôn ngữ, giữ nguyên query string và `Accept-Language` giữa hai lần thử HIT. Các phương thức ghi và các API ngoài nhóm public dùng `no-store`.

## 6. Sao lưu Supabase hằng ngày và thử khôi phục (GL-11, Q-GL-7B)

Rooms dùng PostgreSQL của Supabase. Script `deploy/backup-rooms.ps1` xuất schema `public` (cấu trúc, dữ liệu, sequence, ràng buộc, trigger và lịch sử migration của ứng dụng) thành một file custom-format. File ảnh và bản quét trên Cloudinary, cấu hình nền tảng Supabase và biến môi trường trên Render nằm ngoài bản dump. Lưu riêng khóa `CCCD_KEY` tương ứng trong kho mật khẩu để đọc lại trường CCCD sau khi khôi phục.

### Chuẩn bị trên Windows

1. Chọn một máy Windows có thể chạy hằng ngày. Chuẩn bị một thư mục riêng ngoài repo và ngoài Supabase, ví dụ thư mục đồng bộ riêng tư trên ổ đã mã hóa. Chỉ cấp quyền cho tài khoản làm backup và người phụ trách phục hồi. File dump có dữ liệu cá nhân. Kiểm tra dung lượng và trạng thái đồng bộ tới nơi lưu thứ hai.
2. Mở Supabase SQL Editor, chạy `SHOW server_version;`. Chuẩn bị bộ công cụ PostgreSQL cùng phiên bản chính, đưa thư mục `bin` vào PATH của tài khoản sẽ chạy lịch. Kiểm tra bằng `pg_dump --version`, `pg_restore --version`, `psql --version`. Khi diễn tập trên máy riêng, cần thêm PostgreSQL server local và `createdb`.
3. Trong Supabase **Connect**, lấy host, username, database và port của **Session pooler** (thường là 5432). Tạo file riêng ngoài repo, ví dụ `%APPDATA%\postgresql\rooms-service.conf`. Điền thông tin thực tế:

   ```ini
   [rooms_backup]
   host=HOST_SESSION_POOLER
   port=5432
   dbname=postgres
   user=USER_SESSION_POOLER
   sslmode=require
   ```

4. Trong PowerShell, đăng ký đường dẫn cho tài khoản chạy lịch và cho cửa sổ hiện tại:

   ```powershell
   $env:PGSERVICEFILE = Join-Path $env:APPDATA 'postgresql\rooms-service.conf'
   [Environment]::SetEnvironmentVariable('PGSERVICEFILE', $env:PGSERVICEFILE, 'User')
   ```

   Trong `%APPDATA%\postgresql\pgpass.conf` của cùng tài khoản, thêm một dòng theo thứ tự `host:port:database:user:password`. Bốn trường đầu phải khớp file service. Dùng mật khẩu DB gốc; trong định dạng này dấu hai chấm và gạch ngược trong mật khẩu được viết thành `\:` và `\\`. Giới hạn quyền đọc file qua **Properties → Security**. [Kết nối Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres) · [Định dạng pgpass](https://www.postgresql.org/docs/current/libpq-pgpass.html)

### Chạy thử rồi đặt lịch mỗi ngày

1. Tạo thư mục đích đã chọn, thay đường dẫn ví dụ bên dưới rồi chạy:

   ```powershell
   psql --dbname=service=rooms_backup --no-password -X -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.rooms'
   & 'D:\Rooms\deploy\backup-rooms.ps1' -BackupDirectory 'E:\RoomsBackups'
   ```

   Khi thấy `Backup ready`, kiểm tra file `.dump` đã đến nơi lưu riêng. Script ghi file tạm `.partial`, đọc thử mục lục và toàn bộ archive rồi mới đổi sang `.dump`. Nếu lỗi, giữ bản thành công trước đó, sửa lỗi và chạy lại. Việc đọc được archive chỉ là kiểm tra ban đầu.
2. Trong **Task Scheduler → Create Task**, chọn đúng tài khoản đã cấu hình ở trên. Thêm trigger **Daily**, ví dụ 02:30 giờ Việt Nam. Chọn **Run task as soon as possible after a scheduled start is missed** và **Do not start a new instance**. Nếu dùng ổ mạng, dùng đường dẫn UNC mà tài khoản chạy lịch truy cập được.
3. Action **Start a program**: Program `powershell.exe`, Arguments `-NoProfile -NonInteractive -File "D:\Rooms\deploy\backup-rooms.ps1" -BackupDirectory "E:\RoomsBackups"`. Thay bằng đường dẫn thật. Bấm **Run**, kiểm tra **Last Run Result = 0x0**, ngày giờ của file mới và bản đã đồng bộ. Nếu máy thường xuyên tắt, đặt lịch trên máy có thể hoạt động mỗi ngày. Kiểm tra lại khi quá một ngày chưa có bản mới.

### Diễn tập khôi phục vào database riêng (GL-24)

Chọn một bản dump đã đồng bộ ở nơi lưu riêng. Để có số liệu đối chiếu chính xác, chọn lúc ít sử dụng, ghi số lượng phòng, hợp đồng và hóa đơn trên nguồn ngay khi tạo bản diễn tập và tránh thay đổi các bảng đó trong lúc dump. Dùng cùng câu SELECT bên dưới với `psql --dbname=service=rooms_backup`. Nếu dữ liệu nguồn đã thay đổi sau backup, so với số đã ghi tại thời điểm backup.

Mở PowerShell trên máy có PostgreSQL local riêng tư cùng phiên bản chính. Điền đường dẫn archive. Khối lệnh chỉ kết nối tới `127.0.0.1` và tạo database mới cho mỗi lần thử. Nếu bước tạo thất bại, dừng ngay để tránh ghi vào database đã có.

```powershell
$archive = (Get-Item -LiteralPath 'E:\RoomsBackups\TEN_BAN_SAO.dump' -ErrorAction Stop).FullName
$restoreDb = 'rooms_restore_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
$localPg = @('--host=127.0.0.1', '--port=5432', '--username=postgres')
createdb @localPg --maintenance-db=postgres --template=template0 $restoreDb
if ($LASTEXITCODE -ne 0) { throw 'Chưa tạo được database thử mới.' }
pg_restore @localPg --dbname=$restoreDb --single-transaction --exit-on-error --no-owner --no-privileges --clean --if-exists $archive
if ($LASTEXITCODE -ne 0) { throw 'Restore thất bại. Xem lỗi PostgreSQL trước khi nghiệm thu.' }
$sql = 'SELECT (SELECT count(*) FROM public.rooms) AS rooms, (SELECT count(*) FROM public.contracts) AS contracts, (SELECT count(*) FROM public.invoices) AS invoices;'
psql @localPg --dbname=$restoreDb -X -v ON_ERROR_STOP=1 -c $sql
if ($LASTEXITCODE -ne 0) { throw 'Không đọc được các bảng vừa khôi phục.' }
```

Đạt khi restore hoàn tất và ba số đếm khớp mốc đã ghi, kể cả bảng có 0 dòng. Ghi thời điểm, tên archive, tên database thử và kết quả vào nhật ký GL-24. Giữ backend và các tác vụ gửi mail, lập hóa đơn trỏ về môi trường của chúng trong suốt buổi thử. [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) · [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)
