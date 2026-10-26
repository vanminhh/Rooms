# Lưu logo vào assets/

Trạng thái: ĐÃ DUYỆT 26/10/2026 (chủ dự án: "Duyệt bản nháp 2026-10-26-logo-assets, chép 2 file vào assets/.")

Đã áp dụng 26/10/2026: chép `logo.webp` và `logo-header.png` vào `assets/`; mã SHA-256 trùng với bản nháp. Hai file là ảnh nhị phân, công cụ ghi file không chép được, nên phải dùng `cp` sau khi chủ dự án duyệt trong chat. Hook bảo vệ không thấy lệnh này.

Đã dọn 26/10/2026 (theo luật dọn `approved/` trong `Artifacts/README.md`, làm trước khi commit theo yêu cầu chủ dự án): xóa bản sao `assets/logo.webp` và `assets/logo-header.png` (lúc dọn, cả hai trùng từng byte với `assets/` ở gốc repo). Giữ `REVIEW.md`. Mã commit: chưa có.

Task / spec: yêu cầu của chủ dự án 26/10/2026 ("chốt ảnh logo ... lưu sang asset đổi thành logo và cái logo ở header nữa") · KIT-10

## Làm gì, vì sao

Đưa hai file logo vào thư mục gốc `assets/` (kho ảnh gốc, app không đọc trực tiếp) để có bản chính thức, tên dễ nhớ:

1. **`assets/logo.webp`**: logo vuông đầy đủ (khung trang trí, cửa vòm, chìa khóa, chữ "ROOMS Apartments"), 1275 × 1233 px, 110 KB. Giống hệt `Source/frontend/public/images/rooms-logo.webp`, chỉ đổi tên.
2. **`assets/logo-header.png`**: biểu tượng cửa vòm + chìa khóa đang hiện trên header và màn chờ, 614 × 502 px, 266 KB. Trước đây biểu tượng này chỉ là phần cắt bằng CSS, chưa có file riêng. Mình cắt đúng vùng CSS đang dùng (x 336–950, y 214–716 của logo vuông) bằng Chrome và lưu PNG để không giảm chất lượng.

Không đổi gì trong app: header và màn chờ vẫn dùng `public/images/rooms-logo.webp` + phần cắt CSS như đã duyệt.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `assets/logo.webp` | `assets/logo.webp` | Thêm |
| `assets/logo-header.png` | `assets/logo-header.png` | Thêm |

## Cách xem và kiểm tra

Mở `assets/logo.webp` và `assets/logo-header.png` ở gốc repo.

## Đã kiểm tra

- `logo.webp` có cùng dung lượng (112 836 byte) với `public/images/rooms-logo.webp`, vì được chép thẳng từ file đó.
- `logo-header.png`: script cắt kiểm tra ảnh nguồn đúng 1275 × 1233 và file PNG ra đúng 614 × 502. Mở ra xem: cửa vòm, viền vàng và chìa khóa đầy đủ, không mất cạnh, giống biểu tượng trên header.

## Giả định hoặc câu hỏi cho chủ dự án

- Tên file: mình hiểu "đổi thành logo" là `logo.webp`, còn biểu tượng header đặt tên `logo-header.png`. Muốn tên khác thì báo.
- `logo-header.png` vẫn còn **nền kem** và hai nét cung xám mờ ở góc trên (từ vòng tròn trang trí của logo gốc), y như phần cắt trên header. Trên nền khác màu sẽ thấy ô nền. Nếu cần dùng trên nhiều nền, mình làm thêm bản **nền trong suốt** được.
- Có muốn đổi luôn app sang dùng file trong `assets/` không (ví dụ đổi `public/images/rooms-logo.webp` thành `public/images/logo.webp`, hoặc header dùng thẳng file biểu tượng thay vì cắt bằng CSS)? Đó là một thay đổi riêng, phải qua nháp `artifact_FE`.
