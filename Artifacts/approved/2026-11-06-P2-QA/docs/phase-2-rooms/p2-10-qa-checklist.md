# Phase 2 · QA thủ công và ghi chú cho môi trường thật (P2-QA-01, P2-QA-04)

Cách làm: chạy backend (`npm run start:dev` trong `Source/backend`) và frontend (`npm run dev` trong `Source/frontend`), dùng tài khoản trong dữ liệu mẫu (`Source/backend/prisma/seed.ts`). Mỗi bước ghi **đạt / không đạt** và ghi chú nếu không đạt. Kiểm cả ở **màn hình 360 px** (DevTools → thiết bị di động) và **chỉ bằng bàn phím** (Tab, Shift+Tab, Enter, Space, Esc: thấy rõ ô đang chọn, hộp thoại đóng bằng Esc và trả focus về nút mở).

Đạt phần 1 là Phase 2 xong về chức năng; ghi kết quả vào cột "Kết quả" (đạt / không đạt, kèm ngày).

## A. Khách tìm phòng và đặt lịch xem (cửa thoát 1)

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| A1 | Mở `/` (chưa đăng nhập) | Có phòng nổi bật, danh sách khu vực kèm "{n} phòng trống", ô tìm theo ngân sách | |
| A2 | Mở `/phong`, lọc quận → phường → giá (2/3/4/5 triệu, trên 5 triệu), đổi sắp xếp | Kết quả đổi theo bộ lọc; địa chỉ trang giữ bộ lọc; tải lại trang vẫn giữ; "Xóa bộ lọc" đưa về mặc định | |
| A3 | Phòng đang khóa hoặc chưa có giá (seed: CG01/203, CG01/301) | **Không** xuất hiện ở danh sách và tìm kiếm; mở thẳng `/phong/<id>` báo không tìm thấy | |
| A4 | Mở một phòng `/phong/:id` | Ảnh (hoặc "Chưa có ảnh"), giá, nội thất, đơn giá điện/nước/dịch vụ, ước tính chi phí hàng tháng do hệ thống tính, tiền cọc, liên hệ | |
| A5 | Mở `/toa/:id` | Thông tin tòa, đơn giá, danh sách "Còn trống tại tòa", liên hệ; nút "Xem phòng trống của tòa này" lọc đúng tòa | |
| A6 | Đặt lịch xem: chọn ngày (hôm nay đến +30 ngày) và 1 trong 3 khung giờ, nhập tên và số điện thoại | Màn hình "Đã nhận yêu cầu xem phòng..." ; khung giờ hôm nay đã qua bị khóa "Đã bắt đầu" | |
| A7 | Đặt lại 4 lần cùng số điện thoại trong ngày | Lần thứ 4 báo giới hạn (429), không tạo thêm lịch | |
| A8 | Đăng nhập quản lý của tòa đó → `/ql` | "Việc hôm nay" có thẻ "Lịch hẹn mới" đếm lịch vừa đặt | |
| A9 | `/ql/lich-hen`: xác nhận lịch (CONFIRMED), thử đổi ngày khi còn NEW/CONFIRMED, nút Gọi và Zalo | Đổi trạng thái đúng; NEW → LOST bị chặn; WON bị từ chối; LOST bắt buộc ghi chú | |
| A10 | Đăng nhập Boss với tòa **không có** quản lý đang hoạt động | Boss thấy lịch của tòa đó trong "Việc hôm nay" | |
| A11 | Thêm lịch thủ công `/ql/lich-hen` cho phòng đang hoạt động nhưng không công khai | Tạo được; tòa khóa thì chỉ Boss tạo được | |

## B. Giá chỉ đổi khi Boss duyệt (cửa thoát 2)

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| B1 | Quản lý mở `/ql/phong`, chọn một phòng → "Đề xuất giá" (giá mới, ngày hiệu lực từ hôm nay) | Đề xuất ở trạng thái chờ; **giá công khai của phòng chưa đổi** (xem `/phong/:id` ở cửa sổ ẩn danh) | |
| B2 | Quản lý đề xuất lần hai cho cùng phòng | Đề xuất cũ bị thay thế; chỉ còn 1 đề xuất chờ | |
| B3 | Quản lý thử mở `/ql/duyet-gia` và `/ql/nhan-su` | Bị chuyển đi (không có quyền); menu không có hai mục này | |
| B4 | Boss mở `/ql/duyet-gia` | Thấy đề xuất với giá cũ → giá mới và % (làm tròn 1 chữ số); "Giá mới" khi chưa có giá cũ; đề xuất quá hạn nằm riêng | |
| B5 | Boss duyệt (hộp xác nhận nêu số tiền và câu "Duyệt có thể thay thế giá đã duyệt chưa có hiệu lực.") | Giá công khai đổi ngay nếu ngày hiệu lực là hôm nay; Boss từ chối thì bắt buộc nhập lý do | |
| B6 | Đề xuất giá có ngày hiệu lực ngày mai, Boss duyệt | Giá công khai **chưa** đổi hôm nay; đến 01:00 (hoặc lần khởi động backend kế tiếp) giá mới áp dụng | |
| B7 | `/ql/don-gia`: quản lý đề xuất biểu giá điện nhiều bậc rồi Boss duyệt | Bảng bậc điện cũ → mới; bậc sai (không tăng dần, bậc cuối không để trống) báo lỗi ngay | |
| B8 | Boss tự đề xuất giá | Có hiệu lực ngay, không cần duyệt thêm | |

## C. Quản lý tòa, nhân sự, phòng, ảnh (Phase 2 phần quản lý)

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| C1 | Boss: `/ql/toa-nha` tạo tòa, gán quản lý, thêm dịch vụ, khóa và mở khóa tòa | Hộp xác nhận khóa nêu số lịch đang chờ; khóa tòa gỡ quản lý; "Hiện tòa đã khóa" hoạt động | |
| C2 | Boss: `/ql/nhan-su` tạo quản lý (mật khẩu tạm hiện **một lần**), khóa/mở | Đóng hộp thoại rồi mật khẩu không còn hiện lại; quản lý thứ 3 của một tòa hoặc quản lý vượt 2 tòa bị từ chối | |
| C3 | `/ql/phong`: tạo/sửa phòng, bảo trì/khóa phòng | Lưới tầng đúng trạng thái; hộp xác nhận nêu số lịch đang chờ | |
| C4 | Tải ảnh phòng (JPG/PNG/WebP ≤ 5 MB) | Ảnh hiện trong "Ảnh phòng"; file quá 5.000.000 byte bị chặn trước khi tải; thiếu cấu hình Cloudinary báo thông điệp từ hệ thống | |

## D. Chung

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| D1 | Mọi trang ở 360 px | Không tràn ngang, nút bấm dễ chạm, chữ đọc được | |
| D2 | Chỉ bằng bàn phím | Đi hết biểu mẫu và hộp thoại được; focus nhìn thấy; Esc đóng hộp thoại | |
| D3 | Các trạng thái danh sách | Đang tải, rỗng, lỗi (tắt backend), bình thường đều có chữ rõ | |

## Ghi chú cho môi trường thật (P2-QA-04)

Những điều đã chấp nhận ở Phase 2, cần xử lý hoặc cấu hình khi đưa lên môi trường thật:

1. **Giới hạn trong bộ nhớ:** giới hạn đăng nhập sai và giới hạn đặt lịch theo IP (5 lần/giờ) chỉ đúng với **một** instance backend; nhiều instance cần kho chung (Redis hoặc bảng DB).
2. **Gửi thư chỉ ghi ra console:** `mailer` chưa gửi thư thật; cấu hình `MAIL_*` và SMTP khi cần.
3. **Seed không có chốt chặn môi trường thật:** `prisma/seed.ts` có thể tạo tài khoản mẫu; cần chặn chạy trên production.
4. **Phiên bản Node:** `engines` yêu cầu Node ≥ 24.2.
5. **Sau reverse proxy:** bật `trust proxy` để lấy đúng IP khách (giới hạn IP và nhật ký audit).
6. **Ảnh mồ côi trên Cloudinary:** nếu gắn ảnh vào phòng lỗi sau khi đã tải lên Cloudinary, ảnh vẫn còn trên Cloudinary; chưa có tác vụ dọn.
7. **Cơ sở dữ liệu ở xa:** độ trễ mỗi truy vấn cao (~0,8 s trên DB dev) nên giao dịch Prisma đã được nâng giới hạn (`maxWait` 10 s, `timeout` 30 s); đặt DB gần backend khi chạy thật và chuyển hai giá trị này sang biến môi trường nếu cần.
8. **Dữ liệu `[E2E` trên DB dev:** các lần chạy e2e để lại tòa/lịch hẹn mang nhãn `[E2E <runId>]` (tòa bị khóa chứ không xóa); dọn bằng `scripts/e2e/cleanup.mjs` sau khi chủ dự án xem danh sách. Đây là dữ liệu thử, không dùng cho production.
9. **Phân trang đơn giản ở vài màn:** "Duyệt giá" chỉ tải 20 đề xuất mỗi loại và không có nút chuyển trang; thẻ "Việc hôm nay" nạp mọi lịch NEW trong phạm vi rồi lấy 5 dòng đầu; `GET /viewings` sắp khung giờ trong bộ nhớ nên có thể lệch ở mép trang (đều ghi `shortcut:` trong mã).
10. **Bộ kiểm thử frontend dễ timeout khi tải CPU cao:** `npm run test:components` chạy song song đôi khi có 1–7 test hết giờ (DOM giả, thời gian chờ cố định 3 s); chạy tuần tự (`--test-concurrency=1`) thì đạt.
