# ROOMS · Công cụ chỉnh màu và chữ

Công cụ độc lập, lấy bản sao trang chủ từ component và CSS hiện tại của Rooms. Chỉnh màu, cỡ chữ và phông trên bản xem trước rồi xuất CSS/lệnh; không tự sửa ứng dụng hay kết nối API.

## Mở và sử dụng

1. Bấm đúp `OPEN.cmd` trong thư mục này. Giữ cửa sổ vừa mở trong khi dùng. Máy cần Node.js đã có sẵn để chạy Rooms.
2. Trang mở tại **http://127.0.0.1:4783**. Nếu công cụ đang chạy sẵn, mở địa chỉ này. Đóng cửa sổ hoặc nhấn Ctrl+C để dừng.
3. Bấm vào phần muốn chỉnh trong trang bên trái, hoặc chọn **Thành phần** bên phải.
4. Tab **Màu sắc**: chọn nền/chữ/viền/nút, nhập HEX hoặc kéo màu. Tab **Cỡ chữ & phông**: chọn phần chữ, chọn phông và nhập/kéo cỡ chữ. Kết quả đổi ngay.
5. Cuộn phần điều khiển bên phải xuống **Mã tự cập nhật**. Chọn **CSS** hoặc **Lệnh cho AI / dev**, rồi sao chép hoặc tải file.

Hai cách chọn luôn dùng song song:

- **Trên bản xem trước:** rê chuột để thấy viền nét đứt và tên mục ở thanh hướng dẫn; bấm để chọn. Viền xanh liền đánh dấu mục đang chỉnh. Bấm đúng chữ nhấn sẽ chọn chữ nhấn, không gộp với cả tiêu đề.
- **Trong bảng điều khiển:** chọn thành phần và mục màu/chữ như bình thường. Trang tự cuộn đến phần tử và đánh dấu tương ứng.
- Khi đang ở tab chữ, bấm vào nền sẽ chuyển sang tab màu để chỉnh nền đó. Bấm vào chữ giữ tab chữ. Viền và nhãn chọn chỉ phục vụ công cụ, không nằm trong CSS xuất.

Ví dụ: chọn **Banner · Đầu trang → Nền banner → #ababab**, rồi **Footer · Chân trang → Nền footer → #110011**. Mã xuất chứa cả hai thay đổi, đúng selector và file nguồn.

**Bảng màu chung** chỉnh các biến `--rooms-*`, có thể dùng lại cho những layout dùng cùng biến. Màu đặt riêng ở một phần được ưu tiên hơn. Các phần có màu cố định trong CSS cần chỉnh riêng.

**Máy tính / Điện thoại** đổi chiều rộng bản xem trước (1280 / 390 px). **Xem bản gốc** so sánh tạm thời. **Đặt lại** bỏ riêng màu đang chọn; **Khôi phục gốc** bỏ toàn bộ màu và chữ sau khi xác nhận.

## Chỉnh cỡ chữ và phông

- Chọn một phần, mở **Cỡ chữ & phông**, rồi chọn tiêu đề, mô tả, chữ nút… Có thể bấm trực tiếp lên chữ trong trang khi đang ở tab này.
- **Cỡ chữ (px)**: nhập số hoặc kéo từ 8 đến 160 px, có thể nhập số lẻ. Cỡ đã đặt áp dụng ở cả máy tính và điện thoại; hãy kiểm tra cả hai chế độ.
- **Phông chữ**: Manrope, Taviraj, Arial, Segoe UI, Georgia, Times New Roman hoặc phông hệ thống. Hai phông Rooms đã được tải trong bản sao; các phông khác dùng trên máy với phông dự phòng nếu không có.
- **Cỡ gốc** chỉ bỏ cỡ riêng, giữ phông và màu. **Theo phông gốc / thiết lập chung** chỉ bỏ phông riêng. **Đặt lại chữ đang chọn** bỏ cả cỡ và phông của mục đó, giữ màu.
- Trong **Bảng màu chung → Cỡ chữ & phông**, chỉnh chung tiêu đề H1/H2/H3 hoặc các đoạn văn. Kiểu chữ riêng của từng phần ưu tiên hơn thiết lập chung.
- CSS và tab lệnh xuất đồng thời màu, `font-size` và `font-family`, kèm file và selector. Ví dụ **Banner → Tiêu đề → 48 px → Arial**.

## Giữ bảng màu để dùng tiếp

- Công cụ tự lưu cả màu và chữ trong trình duyệt ở địa chỉ đang mở. Dùng lại đúng trình duyệt/địa chỉ để tiếp tục.
- **Lưu bộ chỉnh** tải `rooms-palette.json` phiên bản 2; **Nạp bộ chỉnh** mở lại file này, kể cả trên máy khác. Vẫn nạp được bảng màu phiên bản 1 cũ. File nạp thay thế toàn bộ màu và chữ đang chỉnh.
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
