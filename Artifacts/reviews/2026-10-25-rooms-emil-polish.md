# Rooms · Component collection 02

Tinh chỉnh ngày 25/10/2026 theo skill `emil-design-eng`, sau yêu cầu của chủ dự án. Phạm vi là bộ 15 component và gallery `components.html`; giữ palette, font, ảnh Rooms và hiệu ứng chiều sâu An Lâm. Không thay cấu trúc trang chủ hoặc thêm nghiệp vụ/API.

## Before / After

| Before | After | Why |
|---|---|---|
| Nút chưa phản hồi nhấn; hiệu ứng hút chuột ghi hai CSS variable mỗi lần di chuyển | Nhấn thu nhẹ còn 97% trong 120ms; hút chuột giảm nửa biên độ và cập nhật `transform` trực tiếp | Xác nhận thao tác nhanh, giảm chuyển động trang trí trên điều khiển dùng thường xuyên; không làm CSS variable kế thừa xuống các phần tử con mỗi lần di chuyển. |
| Hover CSS hoạt động cả trên thiết bị không có hover; tiện ích và mặt bằng dùng `onMouseEnter` | Hover màu chỉ dành cho chuột fine; dùng `PointerEvent`, bỏ qua `pointerType=touch` khi hover | Chạm/vuốt không bị hiểu thành rê chuột; chạm để chọn vẫn hoạt động. |
| Thẻ phòng chuyển `flex` 700ms, ảnh zoom 1.000ms; Tab cũng chạy hiệu ứng | Chuột dùng 240ms; bàn phím và con trỏ coarse đổi ngay | Giữ thẻ mở rộng An Lâm nhưng rút thời gian phản hồi. Không bắt người dùng bàn phím chờ ảnh/bố cục chuyển. |
| Carousel dùng `AnimatePresence mode="wait"`, 300ms thoát rồi 300ms vào | Nội dung mới thay ngay; CSS vào 180ms cho chuột/chạm, không chờ nội dung cũ; bàn phím không chạy hiệu ứng | Đã tái hiện dấu chọn ở câu 2 nhưng chữ còn là câu 1 khi nhấn Enter. Bản mới đồng bộ chữ và lựa chọn, không xếp hàng các lần bấm. |
| Carousel cập nhật chỉ số dựa trên giá trị của lần render trước | Dùng cập nhật state dạng hàm cho trước/sau | Không mất thao tác khi nhiều lần bấm được xử lý trước một lần render. |
| Nút chấm carousel rộng 30px | Tất cả nút 44 × 44px; giảm khoảng cách, cho nhóm chấm xuống dòng nếu cần | Dễ chạm hơn và vẫn vừa màn hình 360px. |
| Preloader quét toàn màn hình bằng clip-path 800ms sau khi tải xong | Thoát bằng opacity 180ms; mở từ bàn phím thì thoát ngay; giảm chuyển động dùng fade 120ms | Rút thời gian chờ thêm, giảm chuyển động toàn màn hình; giữ modal và phục hồi focus. |
| Reveal đi 36px trong 900ms bằng shorthand `y` | Đi 16px trong 450ms bằng chuỗi `transform`; có focus thì hiện ngay | Chuyển động mở đầu nhẹ hơn. Đây là phần giới thiệu ít lặp lại, có thể chậm hơn thao tác nghiệp vụ. |
| Liên kết mục trong trang bị Lenis cuộn có độ trễ | `anchors: { immediate: true }`; cuộn bánh xe vẫn mượt | Điều hướng lặp lại cần đến đích ngay, nhất là khi dùng bàn phím. |
| Giảm chuyển động tắt mọi transition của carousel | Giữ fade opacity 120ms, bỏ dịch chuyển; bàn phím vẫn tức thì | Giữ dấu hiệu đổi nội dung mà không thêm chuyển động vị trí. |

Nút vẫn gọi callback do trang cha truyền vào; style `transform` của bên gọi được ưu tiên và phục hồi khi kết thúc thao tác chuột. Không thêm prop công khai hoặc dependency. Gallery đổi nhãn phiên bản thành 02, mô tả rõ chuột/cảm ứng/bàn phím.

## Quyết định chuyển động

- **Thao tác thường xuyên:** menu, tìm phòng, lựa chọn bằng bàn phím và liên kết mục phản hồi ngay. Không thêm hiệu ứng cho mở menu hay chuyển mặt bằng bằng phím.
- **Phản hồi nhấn:** scale 0,97, 120ms với `cubic-bezier(.23, 1, .32, 1)`; không áp dụng cho nút disabled hoặc bàn phím. Khi giảm chuyển động thì không scale.
- **Chuyển trạng thái bằng con trỏ:** carousel 180ms, thẻ phòng 240ms; không dùng ease-in hoặc `transition: all`.
- **Trang trí ít lặp:** Reveal 450ms, một lần khi vào màn hình; ảnh tiện ích vẫn dùng spring vì đây là chuyển động theo con trỏ liên tục. ImageJourney giữ shader và cơ chế tải trễ/dừng render đã sửa ở đợt trước.
- **Đánh đổi có chủ đích:** vẫn chuyển `flex` cho thẻ mở rộng, vì đây là đặc trưng An Lâm đã được yêu cầu giữ. Đây là chuyển động có tính lại bố cục, không phải toàn bộ chạy ở compositor. Code ghi `shortcut` yêu cầu đo trên thiết bị trước khi cân nhắc FLIP; không thêm hệ thống animation mới khi chưa có số đo giật.

## Kiểm tra

- Hai kiểm tra tương tác mới thất bại trước sửa, sau sửa tổng **14/14 test qua**. Bao gồm bảo toàn callback/style, từ chối hiệu ứng chuột trên con trỏ coarse/touch, reduced motion và xử lý bấm nhanh carousel.
- **Build và lint qua.** Các test GPU, tiền và lifecycle từ bản trước vẫn qua. Không thay dependency.
- Trước sửa, trình duyệt ghi nhận khi nhấn Enter: `Chia sẻ 2` được chọn nhưng còn chữ của câu 1 và opacity khoảng 0,62. Sau sửa: chữ câu 2 đúng ngay, opacity 1, transition 0s.
- Với sự kiện click con trỏ, trình duyệt ghi nhận hai CSS transition của carousel: opacity và transform, đều **180ms**. Với reduced motion chỉ còn opacity **120ms**, transform `none`.
- Gửi sự kiện nhấn chuột thật: nút ở trạng thái `:active`, scale **0,97**. Preloader thoát bằng animation **180ms**, đóng xong trả focus đúng nút gọi.
- Bàn phím: thẻ phòng có transition **0s**, ảnh không zoom; menu đóng bằng Escape; preloader giữ và trả focus. CSS đảm bảo nội dung Reveal có focus không bị ẩn.
- Viewport đo được **360px**: nội dung trang rộng **341px** cùng scrollbar; vùng carousel `clientWidth=scrollWidth=249px`; cả 5 nút đều **44 × 44px**. Không có tràn ngang trong dữ liệu gallery.
- Với media coarse/no-hover giả lập, sự kiện `pointerType=touch` đi qua tiện ích không đổi lựa chọn; click sau đó chọn đúng mục. Đây là kiểm tra media và event tổng hợp, không phải cử chỉ vuốt trên điện thoại thật.

## Giới hạn

- Chưa kiểm tra cử chỉ vuốt, FPS, pin hoặc GPU trên điện thoại thật. Trình duyệt tích hợp không hỗ trợ gửi cử chỉ touch qua API đang dùng; không coi kiểm tra viewport/event là thay thế thiết bị.
- Trình duyệt thiếu `@starting-style` sẽ đổi câu ngay, không có hiệu ứng vào; điều khiển và nội dung vẫn hoạt động.
- Chunk Three.js vẫn **529,78 kB** trước gzip (**132,66 kB** gzip) và có cảnh báo của Vite; tải trễ vẫn được giữ. Không thay shader hoặc tăng ngưỡng để ẩn cảnh báo.
- Đây là bản tinh chỉnh tương tác của component, chưa phải các trang nghiệp vụ theo sitemap và chưa nối backend. Giá, sơ đồ và nội dung gallery vẫn là ví dụ.
