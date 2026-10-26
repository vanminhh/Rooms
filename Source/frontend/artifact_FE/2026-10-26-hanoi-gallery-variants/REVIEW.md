# Hai ảnh minh họa Hà Nội mới

Trạng thái: CHỜ DUYỆT
Task / spec: Ảnh gallery minh họa · KIT-04, KIT-08

## Làm gì, vì sao

Tạo thêm một ảnh mặt tiền và một ảnh phòng studio chung cư mini Hà Nội bằng imagegen tích hợp. Cả hai giữ tính thực tế của ảnh cho thuê, nhưng đổi từ tông kem/đất nung của bộ cũ sang tông xám ấm/xanh sage, đồng thời đổi góc chụp và bố cục. Đây là ảnh minh họa, không đại diện cho tòa nhà hoặc phòng có thật.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `public/images/mini-hanoi-exterior-sage.png` | `Source/frontend/public/images/mini-hanoi-exterior-sage.png` | Thêm |
| `public/images/mini-hanoi-room-sage.png` | `Source/frontend/public/images/mini-hanoi-room-sage.png` | Thêm |

## Cách xem và kiểm tra

Mở hai PNG trong `public/images/` của thư mục nháp. So với `Source/frontend/public/images/mini-hanoi-exterior.png` và `mini-hanoi-room.png` để xem mức khác biệt. Nếu sau này đưa lên trang, tạo bản WebP nhẹ và cập nhật caller trong một bản nháp riêng.

## Đã kiểm tra

- Hai PNG tồn tại trong thư mục nháp, đều 1536 × 1024 px.
- Đã xem trực tiếp kết quả tạo ảnh: ảnh ngoài nhà có mặt tiền 5 tầng, dải gạch xanh và đường ngõ sau mưa; ảnh phòng có bếp bên trái, giường bên phải và tường xanh nhạt.
- Chưa gắn vào giao diện, nên không có caller, cấu hình, fixture hoặc test cần đổi.

## Prompt đã dùng

### Mặt tiền

```text
Use case: photorealistic-natural
Asset type: alternative illustrative photo for a Hanoi mini-apartment rental website
Scene/backdrop: an ordinary narrow residential lane in Hanoi, Vietnam, with closely spaced tube houses, a few street trees and subtle overhead utility lines
Subject: a believable five-storey mini apartment building on a narrow urban lot; an accessible ground-floor entrance with practical motorbike parking, four compact residential floors and a modest recessed roof terrace
Style/medium: photorealistic architectural editorial photography, affordable contemporary Vietnamese construction
Composition/framing: eye-level three-quarter street view from the opposite sidewalk, whole building visible, landscape 3:2
Lighting/mood: clear soft late-morning light after rain, natural reflections on the pavement
Color palette/materials: pale warm-grey stucco, restrained sage-green ceramic tile accents, dark bronze metal balcony rails; modest potted greenery
Constraints: visually distinct from the prior cream-and-terracotta six-storey Hanoi image while remaining the same realistic mini-apartment category; natural room and floor proportions; no people, no readable signs, no text, no watermark, no logo; no luxury-hotel styling.
```

### Phòng studio

```text
Use case: photorealistic-natural
Asset type: alternative illustrative room photo for a Hanoi mini-apartment rental website
Scene/backdrop: a real compact 25-square-meter rental studio in a Hanoi mini apartment
Subject: a compact double bed, built-in light birch-look wardrobe, narrow dining/work ledge at a real window, practical one-wall kitchenette, concealed storage and clear walking path; realistic affordable finishes
Style/medium: photorealistic interior real-estate photography
Composition/framing: wide-angle view from the entry corner, with the kitchenette on the left and bed by the right wall, straight architectural lines, landscape 3:2
Lighting/mood: diffused late-morning daylight, tidy and comfortable without staged luxury
Color palette/materials: warm off-white walls, one muted sage-green wall panel, light birch-look cabinetry, neutral grey ceramic floor tiles, restrained dark bronze hardware
Constraints: visibly different from the prior terracotta-and-oak Hanoi studio, while keeping plausible small-room proportions; no people, no readable text, no watermark, no logo.
```

## Giả định hoặc câu hỏi cho chủ dự án

- Hiểu “thêm ảnh phòng và nhà” là thêm một ảnh của mỗi loại, dành cho Hà Nội vì sản phẩm chỉ phục vụ Hà Nội.
- Chưa có yêu cầu gắn ảnh vào trang nào; chỉ chuẩn bị asset để chủ dự án duyệt.
