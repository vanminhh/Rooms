# Ảnh layout module auth

Trạng thái: CHỜ DUYỆT
Task / spec: FE-LOGIN-12..15 · AUTH-01, AUTH-05, AUTH-07, AUTH-09, AUTH-10 · KIT-01..10

## Làm gì, vì sao

Bảy ảnh mockup tĩnh tham khảo cho module auth, dựa trên `public-home_01.png`, `public-room-detail_01.png` trong thư mục cha, ảnh phòng Hà Nội của bộ kit và đặc tả dự án. Màu cát, xanh trầm, vàng tiết chế và logo cửa vòm nối với bộ mockup Rooms hiện có.

| Ảnh trong `ref/` | Nội dung | Đường dẫn theo spec |
|---|---|---|
| `01-dang-nhap.png` | Đăng nhập bằng số điện thoại, mật khẩu; liên hệ và xem phòng trống | `/dang-nhap` |
| `02-quen-mat-khau.png` | Nhập số điện thoại để yêu cầu hướng dẫn | `/quen-mat-khau` |
| `03-xac-nhan-huong-dan.png` | Thông báo giống nhau sau khi gửi yêu cầu, kèm liên hệ minh họa | `/quen-mat-khau` sau gửi |
| `04-dat-lai-mat-khau.png` | Mật khẩu mới và nhập lại từ link trong email | `/quen-mat-khau?token=...` |
| `05-doi-mat-khau-lan-dau.png` | Mật khẩu hiện tại, mới, nhập lại | `/doi-mat-khau` |
| `06-tai-khoan-nguoi-thue-mobile.png` | Email và đổi mật khẩu của người thuê, hướng mobile | `/thue/tai-khoan` |
| `07-tai-khoan-nhan-su-desktop.png` | Email, đổi mật khẩu và thông tin liên hệ công khai của nhân sự | `/ql/tai-khoan` |

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `ref/*.png` | Chưa có | Ảnh ý tưởng chờ chủ dự án xem; không tự chép vào app |

Không chạy `apply-draft.mjs` cho bộ ảnh tham khảo này. Nếu chủ dự án chọn hướng thiết kế, việc triển khai trang thật cần bản nháp frontend và quy trình duyệt riêng.

## Cách xem và kiểm tra

Mở bảy PNG trong `ref/`; các ảnh 01–05 và 07 là bố cục máy tính, ảnh 06 là bố cục điện thoại. Ảnh được tạo bằng công cụ image_gen tích hợp, dựa trên mockup mẫu và ảnh phòng hiện có. Các prompt yêu cầu layout auth theo đúng tên trường trong spec, không đăng ký công khai, không chọn vai trò và không đăng nhập bằng email.

## Đã kiểm tra

- Đã xem trực quan bảy ảnh, đối chiếu các trường chính với `feature_login.md` và `10-auth.md`.
- Đăng nhập có số điện thoại, mật khẩu, ghi nhớ, quên mật khẩu, lời nhắc cấp tài khoản khi ký hợp đồng và liên hệ minh họa.
- Trạng thái quên mật khẩu dùng thông báo chung; đặt lại mật khẩu gồm hai trường; đổi mật khẩu gồm ba trường. Trang tài khoản nhân sự tách thông tin liên hệ công khai khỏi email.
- Bảy PNG đã lưu thành công: 01–05 1586 × 992, 06 940 × 1672, 07 1585 × 992.
- Chưa kiểm tra tương tác, đọc màn hình, độ tương phản hoặc responsive thật. Các trạng thái lỗi, tải, token hết hạn và thành công đổi mật khẩu chưa được minh họa.

## Giả định hoặc câu hỏi cho chủ dự án

- Số điện thoại, địa chỉ email và liên kết trong ảnh chỉ là ví dụ, không phải dữ liệu liên hệ thật. Logo trong ảnh là bản do AI thể hiện, khi triển khai phải dùng logo của kit.
- Nội dung và thứ tự các mục điều hướng được minh họa để xem bố cục; chưa chốt đầy đủ menu cho từng vai trò.
- Ảnh 06 biểu diễn hướng mobile, không xác nhận bố cục hoạt động ở đúng 360 px. Cần kiểm tra khi dựng giao diện thật.
