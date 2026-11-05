# P2-8a · Frontend quản lý tòa, nhân sự và phòng

Trạng thái: ĐÃ DUYỆT 05/11/2026
Task / spec: FE-P2-01..08 · UI-01..10, BLD-01..06, ROOM-01/02/07/09, SVC, AUTH-08, SCOPE-02, KIT-07
Gốc: 8bec6ab

## Làm gì, vì sao

Dựng khung route Phase 2 và các màn quản lý từ UI kit chính thức: chọn tòa trong `StaffLayout`, `/ql/toa-nha` (+ chi tiết, dịch vụ, khóa/mở khóa), `/ql/nhan-su` (mật khẩu tạm chỉ hiện một lần), `/ql/phong` (lưới tầng, tạo/sửa, bảo trì/khóa với số lịch chờ, ảnh phòng: sign → upload Cloudinary → gửi `publicId`, `assetId`, `version`, `format`). Thêm 2 mảnh kit dùng chung: `ConfirmDialog`, `ImageUploader`. Các trang Đơn giá, Duyệt giá, Lịch hẹn và 3 trang công khai là placeholder "Đang làm" (đúng phạm vi FE-P2-01; làm ở P2-8b/P2-9).

## File sẽ thêm / sửa / xóa ở bản chính (đích từ `Source/frontend/`)

Sửa (10): `package.json` (script `test:components` thêm `tests/p2/*.test.mjs`), `src/app/routes.tsx`, `src/components/index.ts`, `src/components/rooms.css`, `src/layouts/layouts.css`, `src/layouts/StaffLayout.tsx`, `src/pages/ComponentPreview.tsx`, `src/shared/api.ts`, `src/shared/formatters.ts`, `tests/auth-guards.test.mjs` (cập nhật Q2-A, Q5-A và mock route công khai theo FE-P2-01/03).

Thêm (~38): `src/components/{ConfirmDialog,ImageUploader}.tsx`; `src/features/buildings/*` (11 file), `src/features/managers/*` (4), `src/features/rooms/*` (7); `src/shared/status-labels.ts`; `src/pages/staff/{Buildings,BuildingDetail,Managers,Rooms,Prices,Approvals,Viewings}Page.tsx`, `src/pages/public/{PublicRooms,PublicBuilding,PublicRoom}Page.tsx`; `tests/p2/cp1..cp8*.test.mjs`.

Không xóa file nào. `ref/`, `PLAN.md`, `REVIEW.md`, `preview.html` không áp dụng.

## Cách xem và kiểm tra

Sau áp dụng, từ `Source/frontend`: `npm run lint`, `npm run build`, `npm run test:components`; chạy thật `npm run dev` với backend (`npm run start:dev`) để kiểm tay các màn, vì test hiện mock toàn bộ `fetch`.

## Đã kiểm tra

- Tester CP-1..CP-8 PASS (tổng `test:components` bản nháp **407/407**; `tests/p2` + `auth-guards` 209/209); tsc preview và lint sạch; `test:components` bản chính 234/234 (không đổi); đã làm fail-proof cho từng CP.
- Reviewer: **DUYỆT**, không lỗi chặn. Nên biết: (1) trang công khai và 3 trang staff còn "Đang làm" nhưng route đã trỏ tới; (2) số lịch chờ trong hộp xác nhận khóa có thể lệch 1 nếu có lịch phát sinh giữa lúc đọc và xác nhận (BE vẫn là nguồn sự thật).
- `main-files.mjs check`: không file chính nào đổi.
- **Chưa kiểm:** gọi thật `GET /rooms/:id`, API ảnh và Cloudinary (test mock hoàn toàn); kiểm tay trên trình duyệt chưa làm.

## Giả định hoặc câu hỏi cho chủ dự án

- [ASSUMPTION A-CP3-1] `ConfirmDialog` không khóa đường đóng (Escape, Hủy) khi đang xử lý, chỉ khóa nút xác nhận.
- [ASSUMPTION A-CP8-1] Gallery ảnh phòng chỉ tải khi bấm "Ảnh phòng" (mặc định đóng).
- **Chữ giao diện chưa có trong spec, cần chủ dự án duyệt:** water mode "Theo đồng hồ (m³)" / "Theo số người"; đơn vị dịch vụ "Theo phòng" / "Theo người" / "Theo xe"; dịch vụ "Đã có giá" / "Chưa có giá", "Đang dùng" / "Đã khóa".
- Quyết định kỹ thuật (không phải luật nghiệp vụ): thêm phòng bị chặn khi chưa chọn tòa; `maxOccupants` mặc định 2; "Đề xuất giá" là link tới `/ql/don-gia`; kiểm kích thước và MIME ảnh trước khi sign.
- Câu hỏi mở (không chặn): (a) ảnh mồ côi trên Cloudinary khi attach lỗi sau khi upload; (b) khóa/mở khóa quản lý không có hộp xác nhận (UI-04 chỉ bắt buộc cho thao tác tiền) và chưa có nút sao chép mật khẩu tạm.

Đã chép vào file chính 05/11/2026 bằng apply-draft.mjs: 56 file.
