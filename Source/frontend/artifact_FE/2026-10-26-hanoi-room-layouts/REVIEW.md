# Sáu ảnh phòng studio Hà Nội với bố cục khác nhau

Trạng thái: CHỜ DUYỆT
Task / spec: Ảnh gallery minh họa · KIT-04

## Làm gì, vì sao

Tạo sáu ảnh phòng studio mới bằng imagegen tích hợp. Giữ loại phòng cho thuê 23–28 m² và phong cách Hà Nội thực tế; thay đổi vừa phải vị trí giường, bếp, bàn, cửa sổ, góc chụp và màu nhấn. Đây là ảnh minh họa, không phải ảnh phòng đang cho thuê.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `public/images/mini-hanoi-room-layout-01.png` | `Source/frontend/public/images/mini-hanoi-room-layout-01.png` | Thêm |
| `public/images/mini-hanoi-room-layout-02.png` | `Source/frontend/public/images/mini-hanoi-room-layout-02.png` | Thêm |
| `public/images/mini-hanoi-room-layout-03.png` | `Source/frontend/public/images/mini-hanoi-room-layout-03.png` | Thêm |
| `public/images/mini-hanoi-room-layout-04.png` | `Source/frontend/public/images/mini-hanoi-room-layout-04.png` | Thêm |
| `public/images/mini-hanoi-room-layout-05.png` | `Source/frontend/public/images/mini-hanoi-room-layout-05.png` | Thêm |
| `public/images/mini-hanoi-room-layout-06.png` | `Source/frontend/public/images/mini-hanoi-room-layout-06.png` | Thêm |

## Cách xem và kiểm tra

Mở các PNG trong `public/images/` của thư mục nháp và so sánh vị trí giường, bếp, cửa sổ và góc chụp. Chỉ duyệt những ảnh muốn sử dụng làm ảnh minh họa. Nếu về sau gắn vào trang, tạo WebP nhẹ và cập nhật caller trong một bản nháp riêng.

## Đã kiểm tra

- Đã xem trực tiếp sáu ảnh sau khi tạo; mỗi ảnh có bố cục khác nhau và không có người hay chữ đọc được.
- Cả sáu PNG đã được lưu trong thư mục nháp, đều 1536 × 1024 px.
- Chưa sửa code, caller, test, fixture hoặc cấu hình của website.

## Prompt đã dùng

Mỗi ảnh dùng prompt nền dưới đây cộng một biến thể bố cục riêng; tạo bằng một lượt imagegen riêng cho mỗi ảnh, nền opaque.

```text
Use case: photorealistic-natural
Asset type: illustrative rental studio photo for a Hanoi mini-apartment website
Style/medium: photorealistic real-estate interior photography, modest contemporary Vietnamese rental finish
Scale: believable 23–28 square meter studio, compact double bed, practical kitchenette, wardrobe, natural window light, clear walking paths; warm off-white walls, light wood and restrained muted accents
Output: landscape 3:2, straight architectural lines, no people, no readable text, no watermark, no logo, no luxury hotel staging.
```

| Ảnh | Biến thể bố cục thêm vào prompt nền |
|---|---|
| 01 | View from the entrance toward a rear window. Compact double bed runs along the left wall; a straight kitchenette and fridge run along the right wall near the door; a narrow desk sits beneath the back window. Muted sage cushion, pale grey floor tiles. Soft morning light. |
| 02 | View diagonally from the kitchenette corner. Double bed centered against the far wall; kitchenette occupies the left side wall; a small round dining table with two chairs is beside a shaded window on the right. Light birch cabinetry, a muted clay-colored bed throw, pale tile floor. Overcast daylight. |
| 03 | View from the window side toward the entry, showing a compact studio in one coherent space. Double bed runs along the right wall; wardrobe is beside the entry at the back; an L-shaped kitchenette wraps the rear left corner; a small work desk fits on the left by the window. Warm white walls, neutral wood and a soft olive accent. Late-afternoon daylight. |
| 04 | View from the entrance slightly to the left, with a glazed balcony door at the rear left. A double bed runs lengthwise along the right wall; a slim kitchenette occupies the back right wall; a fold-down dining ledge and two stools sit beside the balcony. Pale sand tiles, light oak-look cabinets and a restrained moss-green cushion. Soft morning light. |
| 05 | View from a rear corner of a square studio. Double bed sits against the left rear wall with space to walk on both sides; the kitchenette is a straight line beside the entry on the right; a short wardrobe and compact desk fill the wall beneath a wide side window. Warm white walls, light grey floor tile, muted teal desk chair. Bright diffused daylight. |
| 06 | View from near the kitchenette toward a large shaded window. Double bed stands at the back left, partly screened from the cooking area by a low open timber shelf rather than a full wall; a practical wardrobe is along the right wall and a tiny two-person dining counter sits by the window. Natural birch-look wood, chalky off-white walls, a muted beige throw and one small plant. Late morning light. |

## Giả định hoặc câu hỏi cho chủ dự án

- Hiểu “6 ảnh phòng” là sáu ảnh studio mới cho Hà Nội, vì sản phẩm chỉ phục vụ Hà Nội.
- Các ảnh là lựa chọn minh họa; chưa gắn vào giao diện hoặc dữ liệu phòng thật.

## Ảnh tham khảo cho Stitch `Rooms / mockup_web` (26/10/2026)

Theo yêu cầu của chủ dự án, thêm tám ảnh PNG do imagegen tích hợp tạo vào `image_mockup/` trong bản nháp này:

| File | Vị trí tương ứng trong mockup |
|---|---|
| `image_mockup/01-hero-exterior.png` | Ảnh mặt tiền ở đầu trang |
| `image_mockup/02-building-isometric.png` | Mô hình tòa nhà 3D |
| `image_mockup/03-studio-lang-ha.png` | Thẻ phòng Studio |
| `image_mockup/04-one-bedroom-indochine.png` | Thẻ căn hộ một phòng ngủ |
| `image_mockup/05-duplex-loft.png` | Thẻ phòng Duplex |
| `image_mockup/06-lang-ha-neighborhood.png` | Thẻ khu vực Láng Hạ |
| `image_mockup/07-ba-dinh-neighborhood.png` | Thẻ khu vực Ba Đình |
| `image_mockup/08-cau-giay-neighborhood.png` | Thẻ khu vực Cầu Giấy |

Prompt theo từng vị trí của HTML Stitch: mặt tiền tòa boutique Modern Indochine ở Hà Nội; mô hình isometric tham chiếu ảnh mặt tiền; Studio 25–30 m²; căn hộ một phòng ngủ 35–40 m²; Duplex có gác lửng; ba ảnh đường phố mang không khí Láng Hạ, Ba Đình, Cầu Giấy. Cả bộ dùng ánh sáng tự nhiên, bảng màu cát và xanh rừng, không có chữ hay logo.

Đã xem trực tiếp cả tám ảnh và kiểm tra chúng mở được: hero 1672 × 941 px, mô hình 1374 × 1145 px, sáu ảnh còn lại 1536 × 1024 px.

Đây là **ảnh minh họa do AI tạo**, không phải ảnh phòng, tòa nhà hay con phố thực tế. Chưa gắn ảnh vào Stitch, giao diện hoặc dữ liệu phòng. Logo và avatar trong HTML Stitch không tạo lại vì logo Rooms đã có sẵn, còn avatar là ảnh UI mẫu.

**Lưu ý khi duyệt:** `apply-draft.mjs` sẽ chép cả `image_mockup/` vào `Source/frontend/image_mockup/` nếu duyệt bản nháp này nguyên trạng. Cần chọn đích sử dụng hoặc chuyển bộ ảnh này vào `ref/` trước khi áp dụng.
