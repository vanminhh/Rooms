# ROOMS · Công cụ chỉnh màu

Công cụ độc lập, lấy bản sao trang chủ từ component và CSS hiện tại của Rooms. Chỉ chỉnh bản xem trước và xuất màu đã chọn; không tự sửa ứng dụng hay kết nối API.

## Mở và sử dụng

1. Bấm đúp `OPEN.cmd` trong thư mục này. Giữ cửa sổ vừa mở trong khi dùng. Máy cần Node.js đã có sẵn để chạy Rooms.
2. Trang mở tại **http://127.0.0.1:4783**. Nếu công cụ đang chạy sẵn, mở địa chỉ này. Đóng cửa sổ hoặc nhấn Ctrl+C để dừng.
3. Bấm vào phần muốn chỉnh trong trang bên trái, hoặc chọn **Thành phần** bên phải.
4. Chọn màu nền/chữ/viền/nút; nhập HEX, bấm ô màu hoặc kéo sắc màu, độ bão hòa, độ sáng, độ trong suốt. Kết quả đổi ngay.
5. Cuộn phần điều khiển bên phải xuống **Mã tự cập nhật**. Chọn **CSS** hoặc **Lệnh cho AI / dev**, rồi sao chép hoặc tải file.

Ví dụ: chọn **Banner · Đầu trang → Nền banner → #ababab**, rồi **Footer · Chân trang → Nền footer → #110011**. Mã xuất chứa cả hai thay đổi, đúng selector và file nguồn.

**Bảng màu chung** chỉnh các biến `--rooms-*`, có thể dùng lại cho những layout dùng cùng biến. Màu đặt riêng ở một phần được ưu tiên hơn. Các phần có màu cố định trong CSS cần chỉnh riêng.

**Máy tính / Điện thoại** đổi chiều rộng bản xem trước (1280 / 390 px). **Xem màu gốc** so sánh tạm thời. **Đặt lại** bỏ riêng màu đang chọn; **Khôi phục gốc** bỏ toàn bộ sau khi xác nhận.

## Giữ bảng màu để dùng tiếp

- Công cụ tự lưu màu trong trình duyệt ở địa chỉ đang mở. Dùng lại đúng trình duyệt/địa chỉ để tiếp tục.
- **Lưu bảng màu** tải `rooms-palette.json`; **Nạp bảng màu** mở lại file này, kể cả trên máy khác. File nạp thay thế bảng màu đang chỉnh.
- **Tải file CSS** xuất `rooms-colors.css`. Đưa CSS sau stylesheet gốc khi chủ dự án quyết định áp dụng, hoặc dùng tab lệnh để sửa tại file nguồn. Các quy tắc xuất có `!important` nhằm giữ kết quả giống bản xem trước.
- Xem mục **Đang chỉnh ở đâu trong code?** để biết file, selector và thuộc tính tương ứng.

## Bản sao trang chủ

`snapshot.js` được dựng từ `PublicHomePage`, `PublicLayout` và bộ component hiện tại. Ảnh được chép vào `assets/`. Phòng, số lượng và liên hệ là dữ liệu mẫu để thử màu. Liên kết trong bản sao không chuyển trang; menu điện thoại vẫn mở được. Công cụ thử màu nền, chữ, viền và nút; không nhuộm lại màu trong ảnh/logo.

Đây là bản sao tại thời điểm tạo. Khi UI chính thay đổi, chạy từ `D:\Rooms`:

```powershell
node Artifacts/ui-color-tool/refresh-snapshot.mjs
```

Sau đó tải lại công cụ. Lệnh dùng các thư viện đã cài của frontend; không gọi API, không cài thêm thư viện. Nếu tên class trong ứng dụng đổi, cần cập nhật `catalog.js` và kiểm tra lại các màu. Nạp bảng màu từ bản sao cũ sẽ có thông báo nhắc kiểm tra.

Ảnh và CSS nằm tại máy. Font Manrope/Taviraj lấy từ Google Fonts giống UI gốc; khi mất mạng và chưa có cache, trình duyệt dùng font dự phòng. Có thể thử mở trực tiếp `index.html`, nhưng cách được kiểm tra trong phiên này là qua địa chỉ localhost bên trên.

## Kiểm tra

```powershell
node --test Artifacts/ui-color-tool/tests.test.cjs
node --check Artifacts/ui-color-tool/editor.js
```

Kết quả và phạm vi kiểm tra được ghi trong `PROGRESS.md`. Toàn bộ file thuộc công cụ nằm trong thư mục này; chủ dự án xem và tự commit.
