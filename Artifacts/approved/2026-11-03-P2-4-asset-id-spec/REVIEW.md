# P2-4 · Định danh ảnh và sức chứa phòng

Trạng thái: ĐÃ DUYỆT 04/11/2026
Task / spec: BE-P2-21 · ROOM-07, FILE-02
Gốc: a431a2c

## Làm gì, vì sao

Ghi quyết định của chủ dự án ngày 03/11/2026: dùng `asset_id` bất biến của Cloudinary để xóa đúng ảnh, kể cả khi một `publicId` được tái sử dụng. Test đồng thời của P2-4 đã chứng minh thao tác xóa theo `publicId` có thể hoàn tất muộn sau timeout và xóa nhầm ảnh mới. Ghi hai quyết định ngày 04/11/2026: người rời phòng hôm nay vẫn tính trong hôm nay; PATCH giảm `maxOccupants` dưới số đang ở trả 409 `CONFLICT_STATE`.

Chủ dự án chọn dừng P2-4 tại đây ngày 04/11/2026. Bản nháp spec này giữ nguyên, chưa được duyệt hoặc áp dụng vào file chính.

Sau đó chủ dự án yêu cầu tiếp tục làm nốt P2-4 và các phần Phase 2 tiếp theo trong chat cùng ngày. Bản nháp spec vẫn chưa được duyệt hoặc áp dụng.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/spec/01-architecture.md` | cùng đường dẫn từ gốc repo | Sửa |
| `docs/spec/02-database.md` | cùng đường dẫn từ gốc repo | Sửa |
| `docs/spec/11-buildings-rooms.md` | cùng đường dẫn từ gốc repo | Sửa |
| `docs/spec/14-contracts.md` | cùng đường dẫn từ gốc repo | Sửa |
| `docs/spec/30-frontend.md` | cùng đường dẫn từ gốc repo | Sửa |

## Cách xem và kiểm tra

Đọc diff hai spec trong draft so với commit `Gốc`; đối chiếu quyết định Q-P24-9, API/migration trong draft backend P2-4 và tài liệu Cloudinary. Không áp dụng spec hay backend trước khi chủ dự án duyệt từng draft.

## Đã kiểm tra

`git diff --no-index` so với spec chính: đúng các dòng FILE-02 (`01`), DB-B6 (`02`), ROOM-01/07 (`11`), CON-13 (`14`) và UI-10 (`30`); không có thay đổi khác. Các spec chính không bị sửa. Đối chiếu Q-P24-9 và tài liệu Cloudinary: Upload API hỗ trợ destroy theo `asset_id`; Admin API tra cứu metadata theo `asset_id`. Q-P24-11/12 được ghi đúng câu trả lời của chủ dự án. Draft backend P2-4 đã qua full-preview 937/937, DB 50/50 và reviewer độc lập DUYỆT; bản spec này vẫn cần chủ dự án duyệt riêng trước khi áp dụng.

## Giả định hoặc câu hỏi cho chủ dự án

Q-P24-9: Chủ dự án chọn A trong chat ngày 03/11/2026: xác minh/lưu `asset_id` bất biến và xóa theo ID này. Q-P24-11 B và Q-P24-12 A ngày 04/11/2026: người rời hôm nay vẫn tính hết ngày Hà Nội; giảm sức chứa dưới số đang ở trả 409 `CONFLICT_STATE`. `[ASSUMPTION]` kỹ thuật: metadata Cloudinary thiếu/không khớp trả 400 `VALIDATION_FAILED`; lỗi mạng/5xx khi tra cứu sẽ theo `INTERNAL_ERROR` chung, không gắn row. Xem A-P2-4-7/8/9 trong PLAN backend.

Đã chép vào file chính 04/11/2026 bằng apply-draft.mjs: 5 file.
