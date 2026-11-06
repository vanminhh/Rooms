# QA Phase 2: sửa các mục chưa đạt (A5, A9, B1, D3)

Trạng thái: ĐÃ DUYỆT 06/11/2026
Task / spec: P2-QA-01 · VIEW-04/05/10, PRC-01, PUB, UI-03, KIT-07
Gốc: 9d13364

## Làm gì, vì sao

Chủ dự án chạy checklist tay và ghi 4 chỗ cần sửa phía giao diện:

| Mục | Hiện trạng | Sửa |
|---|---|---|
| A5 | `/toa/:id` có route nhưng không có liên kết nào dẫn tới | Tên tòa ở trang chi tiết phòng `/phong/:id` thành liên kết sang `/toa/:id` (chủ dự án không chọn chỗ đặt, tôi chọn chỗ ít đổi nhất; thẻ phòng ở danh sách đã là liên kết cả thẻ nên không lồng thêm) |
| A9 | Lịch "Đã xác nhận" chỉ có "Không thành" | Thêm nút **"Chốt" bị mờ** cạnh "Không thành", kèm dòng "Chốt lịch sẽ có khi làm phần Hợp đồng." (VIEW-04/05: Chốt chỉ tạo qua hợp đồng ở Phase 3; chủ dự án chọn phương án này) |
| B1 | Khung phòng không hiện giá đề xuất | Hiện "Đề xuất giá 2.500.000 đ áp dụng từ dd/mm/yyyy." (cần bản nháp backend `2026-11-06-BE-P2-QA-pending-price`) |
| D3 | Vòng xoay "đang tải" nhỏ, nằm lệch trái, chữ bị ẩn | `Spinner` thêm thuộc tính `block`: căn giữa, vòng to hơn, hiện chữ. Các chỗ tải đứng riêng dùng `block` (13 chỗ + danh sách công khai); spinner trong nút giữ nguyên |

Ghi chú A7 (không sửa mã): 4 lần cùng một số bị chặn là đúng. Chuyển sang số khác mà vẫn báo "thao tác nhiều lần" là giới hạn **5 lần/giờ theo IP** (VIEW-02, A-03), tính cho mọi số điện thoại từ cùng máy; các lần đặt trước đó đã tính vào. Đúng spec, không phải lỗi.

## File sẽ thêm / sửa / xóa ở bản chính

Tất cả là **Sửa** (đích = cùng đường dẫn dưới `Source/frontend/`), trừ file test là **Thêm**:

`src/components/FormFields.tsx`, `rooms.css`, `README.md` (Spinner `block`); `src/pages/ComponentPreview.tsx` (mẫu `block`); `src/app/RequireAuth.tsx`; `src/features/public/ListState.tsx`; `src/pages/public/PublicRoomPage.tsx` (A5); `src/features/pricing/RoomPriceDialog.tsx`, `RatePlanList.tsx`; `src/features/rooms/RoomInspector.tsx` (D3, B1), `RoomImages.tsx`, `RoomGrid.tsx`, `api.ts` (kiểu `price`); `src/pages/staff/BuildingDetailPage.tsx`, `BuildingsPage.tsx`, `ApprovalsPage.tsx`, `ViewingsPage.tsx`, `StaffHomePage.tsx`; `src/features/managers/ManagerList.tsx`; `src/features/buildings/ServicesPanel.tsx`; `src/features/viewings/ViewingCard.tsx` (A9); `tests/p2/qa-fixes.test.mjs` (Thêm).

## Cách xem và kiểm tra

Áp dụng bản nháp backend trước. Rồi `npm run dev` ở `Source/frontend`: xem `/components.html` (mẫu Spinner), `/ql/lich-hen` (lịch Đã xác nhận), `/phong/<id>` (bấm tên tòa), `/ql/phong` (khung phòng có đề xuất chờ).

## Đã kiểm tra

- 06/11/2026: `tests/p2/qa-fixes.test.mjs` (tester, chạy trên mã của bản nháp) 12/12 đạt: Spinner `block`, nút "Chốt" mờ (không gửi yêu cầu khi bấm, không hiện ở lịch Mới hay đã đóng), liên kết tòa, giá đề xuất. Đã thử làm sai một kỳ vọng thì test đỏ, rồi trả lại.
- Các test cũ liên quan (11 file, 272 test) đạt, nhưng chạy trên mã chính nên chỉ chứng minh bản nháp không làm hỏng file chính.
- `npm run lint` đạt; `tsc --noEmit -p tsconfig.app.json` không báo lỗi.
- Chưa chạy: `npm run test:components` và `npm run build` trên file chính sau khi áp dụng; chưa xem trên trình duyệt.

## Giả định hoặc câu hỏi cho chủ dự án

Chữ giao diện mới cần chủ dự án đọc: nút "Chốt"; dòng "Chốt lịch sẽ có khi làm phần Hợp đồng."; "Đề xuất giá {số tiền} áp dụng từ {ngày}.". Nhãn tải giữ nguyên chữ cũ ("Đang xử lý", "Đang tải ..."), chỉ đổi từ ẩn sang hiện.
`[ASSUMPTION]`: liên kết tòa chỉ ở trang chi tiết phòng (chưa có ở trang chủ và thẻ phòng).
