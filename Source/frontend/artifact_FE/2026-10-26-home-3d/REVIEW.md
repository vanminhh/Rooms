# Mockup trang chủ `/` · thiết kế theo ảnh mẫu + mô hình 3D chọn phòng

Trạng thái: CHỜ DUYỆT
Task / spec: Mockup thiết kế (chưa có task) · 30-frontend "Trang chủ", ROOM-05, BLD-04, VIEW-01 · KIT-01..08

## Làm gì, vì sao

Chủ dự án (26/10/2026) gửi ảnh thiết kế trang chủ ROOMS (lần 1: hero và "Vì sao chọn ROOMS?"; lần 2: cả trang dài `Artifacts/layout_rooms/2026-10-26-stitch-mockups/public-home_full.png`, kèm bộ ảnh `image_mockup/`) và yêu cầu dựng tiếp vào mockup này, kết hợp với mô hình 3D của `../2026-10-26-building-3d/`. Vẫn dùng bộ kit An Lâm.

Trang hiện có, từ trên xuống (phần 1 và 2 giữ nguyên từ lần 1):

1. **Hero** theo ảnh lần 1: logo, menu, nút "Đăng nhập", tiêu đề "Một nơi ở vừa vặn giữa phố.", 2 nút, ảnh tòa nhà mờ dần vào nền.
2. **"Vì sao chọn ROOMS?"**: 4 cột có biểu tượng.
3. **Mô hình 3D chọn tòa và phòng** (từ bản building-3d: đường phố, 4 mặt tòa, tầng hầm, nhà bên cạnh, bảng thông tin chuyển động An Lâm).
4. **Danh sách phòng trống hôm nay** (mới): các thẻ lọc theo quận (đếm theo dữ liệu), 3 thẻ phòng có ảnh, nhãn "Phòng trống • P.302", giá/tháng, 3 thông số, 3 tiện nghi, nút "Đặt hẹn xem phòng". Nút này cuộn lên mô hình 3D, mở đúng tòa và phòng đó.
5. **Khu vực tòa nhà tiêu biểu** (mới): 3 thẻ khu phố có ảnh, quận, mô tả, quy mô và giá từ (tính từ dữ liệu). Bấm thẻ thì mô hình 3D bay tới tòa đó.
6. **Quy trình thuê phòng 3 bước** (mới), nền kem.
7. **Trải nghiệm sống an tĩnh giữa phố** (mới): 3 nhận xét cư dân.
8. **Khối liên hệ và chân trang trên nền xanh** (mới): tiêu đề "Bạn đã sẵn sàng tìm tổ ấm mới?", biểu mẫu "Đăng ký xem phòng nhanh" (kiểm tra họ tên và số điện thoại 10 số bắt đầu 0, có nhãn cho từng ô), chân trang 4 cột và dòng bản quyền 2026. Thay cho `RoomsFooter` của kit vì ảnh có 4 cột.

Dữ liệu mẫu nay nằm chung ở `ref/sample-data.ts`: 3 tòa (Rooms Láng Hạ DD01 · Đống Đa, Rooms Đội Cấn BD02 · Ba Đình, Rooms Duy Tân CG03 · Cầu Giấy), mỗi tòa 5 tầng; số phòng trống, giá, tên tòa ở mô hình 3D, danh sách phòng và thẻ khu vực luôn khớp nhau. Ba phòng ở mục 4 lấy đúng chữ và giá của ảnh thiết kế (P.302 5.800.000 đ, P.201 7.200.000 đ, P.502 6.500.000 đ); các phòng còn lại sinh theo công thức.

Ảnh dùng: 03, 04, 05 (ba phòng), 06, 07, 08 (ba khu phố) trong `../2026-10-26-hanoi-room-layouts/image_mockup/`, tham chiếu trực tiếp (không chép). Ảnh 01 (mặt tiền) và 02 (isometric) chưa dùng: hero giữ ảnh `rooms-hanoi-exterior.webp` của kit như ảnh lần 1, còn mô hình 3D thật thay cho ảnh isometric.

Không dùng pipeline: mockup, chưa có logic nghiệp vụ để tester viết test theo spec. Không thêm dependency.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `preview.html`, `ref/*` | không có | Không chép |

Không chạy `apply-draft.mjs`. `ref/building-scene.ts`, `ref/building-3d.css` là bản chép từ `../2026-10-26-building-3d/` ngày 26/10/2026; `ref/BuildingPicker.tsx` là bản chép của `Building3D.tsx` đã bỏ header, tách dữ liệu và thêm lời yêu cầu mở tòa/phòng từ mục khác. Sau này cần gộp hai thư mục.

## Cách xem và kiểm tra

Trong `Source/frontend`: `npm run dev`, mở `http://localhost:5173/artifact_FE/2026-10-26-home-3d/preview.html`. Thử: thẻ quận ở danh sách phòng, "Đặt hẹn xem phòng", bấm thẻ khu vực, biểu mẫu (để trống, nhập sai số, nhập đúng), cuộn trên điện thoại.

## Đã kiểm tra

26/10/2026, Chrome headless (WebGL phần mềm), chuột thật qua CDP; chạy lại bằng `ref/test-home.mjs`.

- `tsc` (tsconfig tạm kế thừa `tsconfig.app.json`, đã xóa) và `eslint artifact_FE/2026-10-26-home-3d`: 0 lỗi; không có lỗi console.
- 1586 px: các mục mới đúng bố cục ảnh thiết kế; 6 ảnh tải được; thẻ quận cho "Tất cả (20), Đống Đa (7), Cầu Giấy (8), Ba Đình (5)"; chọn Ba Đình thì chỉ còn phòng của Ba Đình.
- "Đặt hẹn xem phòng" ở thẻ đầu: cuộn tới mô hình 3D và bảng thông tin hiện "Phòng 302, 35 m²" của tòa DD01. Bấm thẻ khu vực thứ hai: mở tòa BD02.
- Biểu mẫu: để trống hiện 2 lỗi; số "12345" hiện lỗi số điện thoại; nhập đúng thì hiện "Bản mockup: thông tin hợp lệ, chưa gửi đi đâu."; cả 3 ô đều có nhãn.
- 360 px: không tràn ngang (thẻ quận cuộn ngang trong dải riêng); mọi lưới xuống một cột; biểu mẫu vừa khung.
- Đã sửa trong lúc kiểm tra: tiêu đề mục rớt dòng, khoảng cách ở chân trang bị kit ghi đè, ô biểu mẫu trên điện thoại.
- Chưa kiểm tra: điện thoại thật, Safari, trình đọc màn hình, hiệu năng 3D trên máy yếu; ảnh PNG 2,4–3,5 MB mỗi ảnh nên trang xem thử tải chậm.

## Khác ảnh thiết kế

- Hero và "Vì sao chọn ROOMS?" giữ theo ảnh lần 1, khác ảnh lần 2 (thẻ ảnh bo góc "Tòa Láng Hạ DD01 · Còn 03 studio…", 3 số liệu, thanh lọc 4 ô, nút "Trải nghiệm mô hình 3D", header có "Lên lịch xem" và avatar tài khoản, "Vì sao" dạng 4 thẻ màu).
- Không có nút lưu phòng (bookmark) trên thẻ phòng.
- Số hotline, email, địa chỉ văn phòng, tên Zalo là giá trị mẫu (0900 000 000, lienhe@rooms.example); bản quyền ghi 2026.
- Thẻ quận lấy theo dữ liệu nên không có "Tây Hồ"; số phòng, "Quy mô" và "Từ … / tháng" tính từ dữ liệu mẫu nên khác số trong ảnh.
- Giá hiển thị bằng `formatMoney` ("5.430.000 đ / tháng"), không viết tắt "5.5 tr/th" như ảnh (UI-01).

## Khác với bộ kit (để quyết khi làm thật, theo KIT-07)

1. Nút bo tròn, thẻ bo 14 px, tiêu đề Taviraj đậm 500, menu to hơn: theo ảnh thiết kế; kit là góc vuông 2 px, tiêu đề 300. Đã thêm trọng số 500 vào link font của `preview.html` (KIT-02 chỉ nạp 200, 300, 400).
2. `.rooms-theme a { color: inherit }` làm nhãn nút dạng liên kết thành chữ tối trên nền tối; mockup vá bằng CSS riêng. Kit nên có biến thể nút liên kết.
3. Thành phần mới chưa có trong kit: thẻ lọc dạng viên thuốc, thẻ phòng, thẻ khu vực, thẻ bước, thẻ nhận xét, biểu mẫu liên hệ, chân trang 4 cột.

## Câu hỏi cho chủ dự án

**Giao diện**
1. Ảnh thiết kế lần 2 có hero khác bản hiện tại (xem "Khác ảnh thiết kế"). Có muốn đổi hero và "Vì sao chọn ROOMS?" theo ảnh lần 2 không? Nếu đổi, hero dùng ảnh `01-hero-exterior.png`.
2. Nút bo tròn, thẻ bo góc, tiêu đề đậm áp dụng cho cả 3 app hay chỉ trang công khai?

**Dữ liệu chưa có trong spec hoặc DB**
3. Thẻ phòng cần "Loại phòng" (Studio, 1PN1K, Duplex), "Hướng đón nắng", "Trần cao", "Gác lửng" và bộ lọc "Loại phòng", "Tình trạng" (chuyển vào ở ngay hôm nay). Bảng `rooms` chỉ có tầng, diện tích, giá, số người tối đa, nội thất, mô tả; spec chỉ lọc theo quận, phường, tòa, khoảng giá (ROOM-05). Có thêm các thuộc tính này không?
4. Ba thẻ khu vực cần ảnh đại diện từng tòa; DB chỉ có ảnh phòng. Ảnh tòa lưu ở đâu và ai tải lên? "Cụm tòa" (2 tòa, 48 phòng) cần khái niệm nhóm tòa; spec chỉ có từng tòa.
5. Liên kết "Xem tất cả tòa nhà trên bản đồ" cần chức năng bản đồ; spec chưa có. Bỏ hay giữ? Nút lưu phòng (bookmark) cần danh sách yêu thích; spec chưa có (mockup đã bỏ).
6. Hotline, email, địa chỉ văn phòng: spec chỉ có số liên hệ mặc định (điện thoại, Zalo, Facebook trong cài đặt). Có thêm các trường này không?

**Biểu mẫu và cam kết**
7. "Đăng ký xem phòng nhanh" chỉ có họ tên, số điện thoại, tòa quan tâm và hứa "tư vấn trong 15 phút". Spec VIEW-01 đặt lịch xem cần phòng, ngày, khung giờ, ghi chú và có chống spam. Đây là yêu cầu gọi lại (cần API và bảng mới) hay là form VIEW-01 (thêm ngày, giờ, phòng)?
8. Các câu cam kết trong ảnh phải đúng thực tế vận hành trước khi dùng thật: "100% không phụ phí ẩn", hỗ trợ 24/7, tư vấn trong 15 phút, đặt lịch 30 giây, nhận phòng trong 24 giờ làm việc, video tour, hợp đồng điện tử, khóa vân tay và camera, "giữ lịch miễn phí". Câu nào giữ, câu nào sửa?
9. Ba nhận xét cư dân (tên, nghề, thời gian thuê) là nội dung mẫu. Có dùng nhận xét thật không? Nếu có cần nguồn và sự đồng ý của người nhận xét; spec chưa có dữ liệu đánh giá.

**Ảnh**
10. Bộ ảnh là ảnh AI minh họa, PNG nặng 2,4–3,5 MB mỗi ảnh. Khi dùng thật cần WebP nhẹ và đặt vào `public/images/`; nếu duyệt thư mục `hanoi-room-layouts` nguyên trạng, `apply-draft` sẽ chép `image_mockup/` sang `Source/frontend/image_mockup/` (sai chỗ). Chốt bộ ảnh nào dùng và chuyển sang thư mục nào?

Các câu hỏi về dữ liệu 3D (vị trí phòng trong DB, API trạng thái mọi phòng, khối đơn giản hay mô hình thật) vẫn như ở `../2026-10-26-building-3d/REVIEW.md`.
