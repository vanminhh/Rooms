# UI-02 · Duyệt câu chữ trên trang công khai

Trạng thái: ĐÃ DUYỆT 10/11/2026 (chủ dự án: "Duyệt cả hai")
Task / spec: UI-02 · KIT-13 (UI-01), ROOM-08, VIEW-12, G-03
Gốc: ff78ce5

## Làm gì, vì sao

Review 10/11/2026 (impeccable audit) thấy giao diện merge từ nhánh `tquynh` có câu cam kết và câu sai sự thật chưa được chủ dự án duyệt. Chủ dự án quyết ngày 10/11/2026:
- 2 câu cam kết ở khung đặt lịch → thay bằng câu đúng với luồng hiện có;
- bảng chi phí → chữ trung tính;
- tên khách thấy là **ROOMS** (cả tiêu đề tab).

## Bảng câu chữ

| # | Chỗ | Câu cũ | Câu mới | Lý do |
|---|---|---|---|---|
| 1 | Chi tiết phòng, dưới nút đặt lịch | Quản lý tòa nhà trực tiếp đón tiếp, không qua trung gian. | Quản lý tòa nhà sẽ gọi lại để xác nhận lịch hẹn. | Chủ dự án chọn; đúng màn gửi thành công (VIEW-12) |
| 2 | như trên | Xem phòng và tư vấn hoàn toàn miễn phí. | Gửi yêu cầu chưa giữ chỗ phòng. | Chủ dự án chọn; đúng màn gửi thành công |
| 3 | Bảng chi phí (kit `CostBreakdown`) | Chi phí minh bạch · Một tháng, an tâm ở lại. | Chi phí mỗi tháng | Chủ dự án chọn chữ trung tính |
| 4 | như trên, dòng tổng | Tổng chi phí | Ước tính mỗi tháng | Chưa gồm điện, nước (ROOM-08), "tổng" là sai |
| 5 | Trang chủ, thẻ "Vì sao" số 03 | Xem hình ảnh thật, diện tích… | Xem ảnh phòng, diện tích… | Ảnh hero/khu vực là ảnh AI; phòng có thể chưa có ảnh |
| 6 | Trang chủ, bước 01 | Xem ảnh thật, giá, diện tích… | Xem ảnh, giá, diện tích… | như dòng 5 |
| 7 | Chi tiết tòa, khung liên hệ | Liên hệ được lấy từ quản lý phụ trách tòa; nếu chưa có sẽ dùng liên hệ mặc định của chủ nhà. | (bỏ) | Câu giải thích nội bộ, khách không cần |
| 8 | Tìm phòng, đoạn giới thiệu | Chọn khu vực và khoảng giá phù hợp. Bộ lọc được giữ trong đường dẫn để bạn có thể tải lại hoặc chia sẻ kết quả. | Chọn khu vực và khoảng giá phù hợp với bạn. | Câu kỹ thuật |
| 9 | Tiêu đề tab trình duyệt (`index.html`) | Trọ Thông Minh | ROOMS · Phòng thuê tại Hà Nội | Chủ dự án chọn ROOMS cho khách |

Giữ nguyên (đúng sự thật, theo spec): tiêu đề hero "Một nơi ở vừa vặn giữa phố.", đoạn giới thiệu hero, 3 số liệu (lấy từ API), thẻ "Vì sao" 01, 02, 04, bước 02, 03, khối liên hệ cuối trang, câu chào màn đăng nhập, nhãn "Ảnh minh họa".

Dòng 5–9 là đề xuất của AI (sửa câu sai/kỹ thuật); chủ dự án duyệt cùng bản nháp này.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `src/pages/public/RoomDetailView.tsx` | `Source/frontend/src/pages/public/RoomDetailView.tsx` | Sửa (dòng 1, 2) |
| `src/components/CostBreakdown.tsx` | `Source/frontend/src/components/CostBreakdown.tsx` | Sửa (dòng 3, 4) |
| `src/pages/public/PublicHomePage.tsx` | `Source/frontend/src/pages/public/PublicHomePage.tsx` | Sửa (dòng 5, 6) |
| `src/pages/public/PublicBuildingPage.tsx` | `Source/frontend/src/pages/public/PublicBuildingPage.tsx` | Sửa (dòng 7) |
| `src/features/public/public-building.css` | `Source/frontend/src/features/public/public-building.css` | Sửa: bỏ class không còn dùng |
| `src/pages/public/PublicRoomsPage.tsx` | `Source/frontend/src/pages/public/PublicRoomsPage.tsx` | Sửa (dòng 8) |
| `index.html` | `Source/frontend/index.html` | Sửa (dòng 9) |
| `tests/p2/fe-p2-16-detail.test.mjs` | `Source/frontend/tests/p2/fe-p2-16-detail.test.mjs` | Sửa: theo câu mới, thêm kiểm câu cũ đã bỏ |
| `tests/p2/ui-24-booking-panel.test.mjs` | `Source/frontend/tests/p2/ui-24-booking-panel.test.mjs` | Sửa: theo câu mới |
| `tests/draft-root.mjs`, `tests/p2/public-dom.mjs`, `tests/p2/fe-p2-14-home`, `ui-21-home-lower`, `ui-25-building-detail`, `fe-p2-15-search`, `ui-23-room-detail` `.test.mjs` | cùng tên ở `Source/frontend/tests/` | Không đổi nội dung: chép vào để test chạy trên file nháp |

## Cách xem và kiểm tra

- So sánh: `git diff --no-index Source/frontend/src Source/frontend/artifact_FE/2026-11-10-UI-02-copy/src`.
- Test trên bản nháp (trong `Source/frontend`): `node --test artifact_FE/2026-11-10-UI-02-copy/tests/p2/*.test.mjs`.
- Bạn kiểm tay sau khi chép: `/phong/7` (2 dòng dưới nút đặt lịch, bảng chi phí), `/` (thẻ 03, bước 01), `/toa/3`, `/phong`, tên tab trình duyệt.

## Đã kiểm tra

10/11/2026:
- `node --test artifact_FE/2026-11-10-UI-02-copy/tests/p2/*.test.mjs`: 83/83 pass (7 file test đọc file nháp).
- `npx eslint artifact_FE/2026-11-10-UI-02-copy`: 0 lỗi.
- Chưa xem trên trình duyệt (chỉ đổi chữ); chưa chạy `npm run build` trên file nháp (sẽ chạy sau khi chép).

## Giả định hoặc câu hỏi cho chủ dự án

Không còn câu hỏi. Câu chữ ở trang quản lý và người thuê là chữ chức năng, không thuộc bảng này.
