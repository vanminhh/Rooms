# P2-3 · Sửa lỗi e2e quản lý tòa

Trạng thái: ĐÃ DUYỆT 03/11/2026
Task / spec: BE-P2-09, BE-P2-11, BLD-02, SCOPE-02, D2-14
Gốc: 2bc2f23

## Làm gì, vì sao

Lượt e2e database dev 03/11/2026 có 21/23 test qua, 2 lỗi: PATCH tòa bằng Manager nhận 403 dù chỉ gửi `amenities` và `description`; bài kiểm bí mật trong log so chuỗi với mật khẩu tạm đã xóa thành chuỗi rỗng. Bản nháp này sửa đúng hai điểm đó và kiểm lại trước khi áp dụng.

## File sẽ thêm / sửa / xóa ở bản chính

Đích tính từ `Source/backend/`.

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `src/modules/buildings/building-write.guard.ts` | cùng đường dẫn | Sửa |
| `test/buildings.e2e-spec.ts` | cùng đường dẫn | Sửa |

## Cách xem và kiểm tra

Kiểm mã draft trực tiếp bằng test preview trong `ref/`; sau khi chủ dự án duyệt và áp dụng, chạy lại lint, unit, build và e2e với database dev từ `Source/.env`. Không chép draft vào file chính để thử.

## Đã kiểm tra

- Trước bản nháp: e2e file chính 21/23 test PASS, 2 FAIL; log `20261103T1435-7V7H` đạt `CLEANED`. Lỗi BLD-02 là Manager PATCH `amenities`/`description` nhận 403; lỗi BE-P2-09 là assertion so log với mật khẩu tạm đã xóa thành chuỗi rỗng.
- Kiểm trực tiếp guard trong draft: `npx vitest run --config artifact_BE/2026-11-03-BE-P2-3-e2e-fix/ref/vitest.preview.config.ts` → 1 file, 2/2 test PASS. Test chứng minh DTO sau transform có key `address` với giá trị `undefined`: guard file chính hiện ném lỗi; guard trong draft chấp nhận hai trường Manager được phép và vẫn từ chối `address` được gửi.
- `npx tsc -p artifact_BE/2026-11-03-BE-P2-3-e2e-fix/ref/tsconfig.preview.json --noEmit` → PASS.
- `npx oxlint --type-aware` trên hai file draft → 0 cảnh báo, 0 lỗi.
- Đã so diff hai file draft với file chính: chỉ có guard bỏ qua key có giá trị `undefined` và e2e kiểm mật khẩu trước khi xóa biến, sau đó xác nhận biến đã xóa. `ref/` chỉ dùng kiểm draft, không áp dụng.
- E2E DB thật chỉ có thể xác nhận bản sửa sau khi chủ dự án duyệt và áp dụng draft; không gọi PASS ở giai đoạn này.
- Chủ dự án duyệt áp dụng đúng bản nháp này trong chat ngày 03/11/2026.
- Sau áp dụng: lint backend 99 file, 0 cảnh báo/lỗi; build PASS; e2e DB dev 23/23 PASS, log `20261103T1542-N0N9` đạt `CLEANED`. Unit main có 856 assertion PASS nhưng suite env.spec.ts chưa chạy do `.env.example` đã bị xóa theo quyết định riêng của chủ dự án; draft xử lý môi trường `2026-11-03-BE-env-location` đang chuẩn bị.
- Đã dọn 03/11/2026: xóa bản sao code/test và `ref/` trong approved; file chính ở `Source/backend/src/modules/buildings/building-write.guard.ts` và `Source/backend/test/buildings.e2e-spec.ts`, commit `728148e`. Chỉ giữ REVIEW.md; cleanup ghi trong `a66c9ab` và `ad4f6da`.

## Giả định hoặc câu hỏi cho chủ dự án

- Không có quyết định nghiệp vụ mới. Chủ dự án xác nhận `Source/.env` là database dev và giữ ở vị trí đó.

Đã chép vào file chính 03/11/2026 bằng apply-draft.mjs: 2 file.
