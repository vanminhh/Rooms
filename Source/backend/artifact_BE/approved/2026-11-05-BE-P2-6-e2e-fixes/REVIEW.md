# P2-6 · Sửa hai điểm còn lại của e2e (danh sách tòa, timeout fixture)

Trạng thái: ĐÃ DUYỆT 05/11/2026
Task / spec: BE-P2-35 · BE-P2-09, BE-P2-34
Gốc: 8bec6ab (P2-6 và bản sửa timeout đã chép vào main, chưa commit)

## Làm gì, vì sao

Sau bản sửa timeout giao dịch, `npm run test:e2e` trên main: 41/43 đạt, còn 2 fail do chính test/cấu hình, không phải lỗi nghiệp vụ:
1. `test/buildings.e2e-spec.ts:256`: gọi `GET /buildings?includeInactive=true` rồi tìm tòa vừa tạo trong trang đầu (mặc định 20 dòng). DB dev nay có 37 tòa (34 là tòa `[E2E` các lần chạy trước, được khóa chứ không xóa theo quy tắc không xóa cứng), nên tòa mới rơi ra khỏi trang đầu. Sửa: thêm `&sort=-createdAt` để tòa mới nhất luôn đứng đầu.
2. `test/viewings.e2e-spec.ts:139` (fixture) quá `testTimeout` 60 s khi DB chậm (~0,8 s/truy vấn). Sửa: `testTimeout` và `hookTimeout` 120 s trong `vitest.config.e2e.ts`.

## File sẽ sửa ở bản chính (đích từ `Source/backend/`)

| Bản nháp | Sửa |
|---|---|
| `test/buildings.e2e-spec.ts` | 1 dòng: URL thêm `&sort=-createdAt` |
| `vitest.config.e2e.ts` | thêm `testTimeout: 120_000`, `hookTimeout: 120_000` |

## Cách xem và kiểm tra

Không chạy được trong thư mục nháp (e2e ghi DB dev và bị loại khỏi draft). Sau khi duyệt và áp dụng: `npm run test:e2e` (kỳ vọng 43/43).

## Đã kiểm tra

Chưa chạy (xem trên). Nguyên nhân dòng 256 đã xác nhận bằng đếm trực tiếp DB dev (37 tòa, 34 `[E2E`).

## Giả định hoặc câu hỏi cho chủ dự án

- Dữ liệu `[E2E` tòa/lịch hẹn của các lần chạy trước vẫn nằm trên DB dev (34 tòa đã khóa, 12 lịch hẹn, trong đó 4 lịch không thuộc nhật ký nào nên cần `cleanup.mjs --apply` mới dọn). Dọn hết là việc của P2-10 (QA), cần chủ dự án đồng ý.

Đã chép vào file chính 05/11/2026 bằng apply-draft.mjs: 2 file.
