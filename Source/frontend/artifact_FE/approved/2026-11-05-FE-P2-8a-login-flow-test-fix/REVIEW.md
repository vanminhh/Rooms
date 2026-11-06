# P2-8a · Cập nhật test đăng nhập theo StaffLayout và route mới

Trạng thái: ĐÃ DUYỆT 05/11/2026
Task / spec: FE-P2-08 · FE-P2-01, FE-P2-03, AUTH-06
Gốc: 8bec6ab (P2-8a đã chép vào main, chưa commit)

## Làm gì, vì sao

Sau khi áp dụng P2-8a, `npm run test:components` trên main có 21 test fail trong `tests/auth-login-flow.test.mjs` (draft P2-8a chưa chạy bộ test này trên mã mới). Nguyên nhân:
1. `StaffLayout` nay có bộ chọn tòa (`<select>`); DOM giả của file test thiếu `select.options` nên react-dom ném lỗi khi dựng (19 test).
2. Hai test cũ nay sai theo thiết kế mới: `Q4-A` (`/phong` giờ là trang "Tìm phòng · Đang làm", không còn "Trang đang được xây dựng") và `FE-LOGIN-10, Q2-A, Q5-A` (menu staff theo vai trò: manager 6 mục, Boss 8 mục; dòng "Tòa đang quản lý" đã bỏ, thay bằng bộ chọn tòa).

## File sẽ sửa ở bản chính (đích từ `Source/frontend/`)

| Bản nháp | Sửa |
|---|---|
| `tests/auth-login-flow.test.mjs` | thêm getter `options` cho `<select>` trong `FakeElement`; cập nhật 2 test nêu trên (~32 dòng thay đổi thực) |

Không đổi code ứng dụng.

## Cách xem và kiểm tra

Đã chạy trên bản sao tạm của `Source/frontend` (file test này + hai sửa đường dẫn đã áp dụng): `auth-login-flow` 100/100; toàn bộ `npm run test:components` **407/407**. Sau khi duyệt và áp dụng sẽ chạy lại `lint`, `build`, `test:components` trên main.

## Đã kiểm tra

Như trên. Chưa có reviewer riêng (thay đổi chỉ ở test, đúng theo thiết kế đã duyệt của P2-8a).

## Giả định hoặc câu hỏi cho chủ dự án

Không có.

Đã chép vào file chính 05/11/2026 bằng apply-draft.mjs: 1 file.
