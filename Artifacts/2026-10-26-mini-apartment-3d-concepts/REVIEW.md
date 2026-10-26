# Ba phương án chung cư mini cho dựng 3D

Trạng thái: CHỜ DUYỆT
Task / spec: Ảnh tham chiếu thiết kế · KIT-09, KIT-10

## Làm gì, vì sao

Ba ảnh ý tưởng của **một tòa chung cư mini trong mỗi ảnh** để chủ dự án chọn kiểu kiến trúc trước khi giao agent dựng 3D. Ảnh dùng các màu cát, xanh trầm, vàng tiết chế của bộ kit Rooms. Mỗi ảnh cho thấy toàn bộ tòa, mặt tiền và một mặt bên; không phải ảnh giao diện web.

| Ảnh | Hướng thiết kế |
|---|---|
| `ref/01-warm-brick.png` | Trụ gạch đỏ ấm, ban công xanh trầm |
| `ref/02-deep-teal.png` | Lam đứng xanh trầm, sảnh vòm màu vàng ấm |
| `ref/03-tropical-timber.png` | Lam gỗ, tường cát, bồn cây nhỏ |

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `ref/*.png` | Chưa có | Ảnh chọn phương án, chưa chép vào file chính |

## Cách xem và kiểm tra

Mở trực tiếp ba PNG trong `ref/`. So sánh mặt tiền, ban công, cửa, vật liệu và độ dễ dựng hình. Sau khi chọn một phương án, cần chốt số tầng, kích thước và tạo thêm các góc nhìn/bản vẽ nếu agent 3D cần hình học chính xác.

## Đã kiểm tra

- Ba file PNG 1448 × 1086 đã được tạo và lưu trong vùng nháp.
- Đã xem trực quan: mỗi phương án có một tòa nhà riêng, toàn thân tòa không bị cắt, nhìn được mặt tiền và một mặt bên.
- Số tầng và chi tiết cấu kiện trong ảnh do AI tạo, chưa được xác thực là bản vẽ kiến trúc; không lấy làm số đo thi công.

## Prompt đã dùng

Tạo ảnh architectural visualization một chung cư mini Hà Nội, tòa nhà duy nhất, hình khối lặp lại rõ để dựng 3D, góc nhìn ba phần tư, thấy toàn bộ mái đến vỉa hè, nền phố trung tính. Màu theo kit Rooms: cát `#f8f2e6`, xanh trầm `#153d36`, vàng nhạt `#aa7d45`. Không có giao diện web, chữ, logo, người, xe, tòa khác hoặc cây che mặt đứng.

- 01: trụ gạch nung, ban công lan can xanh trầm, ánh sáng ban ngày.
- 02: tường cát, lam đứng và lan can xanh trầm, một vòm vào sảnh màu vàng ấm.
- 03: tường cát, đá sáng tầng trệt, lam gỗ và cây ban công tiết chế.

Công cụ: image_gen tích hợp. Ảnh tạo mới, không ghép ảnh chụp công trình thật.

## Giả định hoặc câu hỏi cho chủ dự án

- Hiểu yêu cầu là **ba kiểu tòa khác nhau để chọn một**, không phải ba góc nhìn của cùng một tòa.
- Sau khi chọn, cần chốt số tầng và tỷ lệ trước khi giao dựng 3D; ảnh hiện tại là mẫu hình dáng và vật liệu.
