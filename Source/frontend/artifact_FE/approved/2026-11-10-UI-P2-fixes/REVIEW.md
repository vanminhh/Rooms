# UI · Sửa lỗi P2 từ review 10/11/2026

Trạng thái: ĐÃ DUYỆT 10/11/2026 (chủ dự án: "k cần tạo bản nháp sửa luôn")
Task / spec: UI-11, UI-13, UI-24, UI-40 · VIEW-08, KIT-05, D-6.4
Gốc: 5f1bd45

## Làm gì, vì sao

Năm lỗi P2 trong "Nhật ký lỗi" của `docs/phase-ui/feature_ui-mockup.md`:

1. **"Hôm nay" sau 18:00** (`ViewingForm.tsx`): khi cả 3 khung giờ hôm nay đã bắt đầu, nút "Hôm nay" bị khóa, hiện "Hôm nay đã hết buổi xem, vui lòng chọn từ ngày mai.", ô chọn ngày bắt đầu từ ngày mai.
2. **Chữ quá nhỏ**: chữ "APARTMENTS HANOI" ở đầu trang 6 → 9 px (chữ logo), ở chân trang 7 → 10 px; dòng cuối chân trang 9 → 11 px; nhãn nhỏ (eyebrow) 10 → 11 px; nhãn thanh lọc 9 → 11 px; nhãn khung giá đặt lịch và dòng phụ ở hero 10 → 11 px; quy tắc cũ `.rooms-brand small` 8 → 9 px.
3. **Nút đặt lịch cố định trên điện thoại** (`BookingJumpBar.tsx`, gắn trong `RoomDetailView.tsx`): màn < 980 px, thanh dưới đáy "Giá thuê · <giá>" + nút "Đặt lịch xem phòng <mã>"; chỉ hiện khi khung đặt lịch còn ở dưới màn hình, tự ẩn khi tới hoặc đã qua khung; bấm thì cuộn tới khung (không chuyển động nếu bật giảm chuyển động) và đặt con trỏ vào nút đầu tiên. Không ghi "/ tháng" cạnh giá (D-6.4).
4. **Nền trắng khi tải lại trang quản lý/người thuê** (`RequireAuth.tsx`, `layouts.css`): màn "Đang tải" và lỗi phiên dùng lớp `layout-startup` phủ kín màn hình nền cát. Thời gian chờ khoảng 8 giây là do BE/DB dev, không sửa ở đây.
5. **Test chập chờn**: `cp7-rooms` chờ form hiện đủ ô trước khi điền; `fe-p2-14-home` chỉ đếm 2 khối "Đang tải danh sách phòng", không đếm khối liên hệ.

## File sửa ở bản chính

| Bản nháp | Đích | Thêm / Sửa |
|---|---|---|
| `src/features/public/ViewingForm.tsx` | cùng đường dẫn trong `Source/frontend/` | Sửa |
| `src/features/public/BookingJumpBar.tsx` | | Thêm |
| `src/pages/public/RoomDetailView.tsx` | | Sửa |
| `src/features/public/booking-panel.css`, `public.css` | | Sửa |
| `src/components/Navigation.css`, `rooms.css` | | Sửa |
| `src/app/RequireAuth.tsx`, `src/layouts/layouts.css` | | Sửa |
| `tests/p2/ui-p2-fixes.test.mjs` | | Thêm (7 test) |
| `tests/p2/cp7-rooms.test.mjs`, `tests/p2/fe-p2-14-home.test.mjs`, `tests/auth-guards.test.mjs` | | Sửa |
| `tests/draft-root.mjs`, `tests/p2/public-dom.mjs`, `tests/form-fields.test.mjs`, `tests/p2/qa-fixes.test.mjs`, `tests/p2/fe-p2-16-detail.test.mjs`, `tests/p2/fe-p2-17-viewing-form.test.mjs`, `tests/p2/ui-23-room-detail.test.mjs`, `tests/p2/ui-24-booking-panel.test.mjs`, `tests/p2/ui-40-page-background.test.mjs` | | Không đổi nội dung (chép vào để chạy test) |

## Đã kiểm tra

Trên bản sao tạm `Source/frontend` + bản nháp (scratchpad), 10/11/2026: `tsc -b` 0 lỗi, `vite build` OK, `eslint src tests` 0 lỗi, `npm run test:components` 737 test: tất cả pass trừ `CP-1` (test này kiểm đường dẫn thư mục `Source/frontend`, chỉ sai ở bản sao tạm).

## Giả định hoặc câu hỏi cho chủ dự án

Chữ logo ở đầu trang để 9 px (không phải 11 px) vì là một phần của logo; nói nếu muốn to hơn.
