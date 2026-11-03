# Backend · Cấu hình môi trường tại Source/.env

Trạng thái: ĐÃ DUYỆT 03/11/2026
Task / spec: BE-LOGIN-03, BE-P2-09, P2-QA-02 · quyết định chủ dự án 03/11/2026
Gốc: ad4f6da

## Làm gì, vì sao

Chủ dự án giữ file bí mật tại `Source/.env` và giữ việc xóa `Source/backend/.env.example`. Backend hiện chỉ nạp `.env` trong `Source/backend`; unit test còn đọc `.env.example`. Chuẩn bị đường dẫn chạy app/e2e và cập nhật validation test, không đưa nội dung bí mật vào draft.

## File sẽ thêm / sửa / xóa ở bản chính

Đích tính từ `Source/backend/`.

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `src/main.ts` | cùng đường dẫn | Sửa |
| `src/common/env.ts` | cùng đường dẫn | Sửa |
| `src/common/env.spec.ts` | cùng đường dẫn | Sửa |
| `package.json` | cùng đường dẫn | Sửa |

## Cách xem và kiểm tra

Kiểm trực tiếp draft bằng test/typecheck không phát sinh output trong `ref/`; không chép vào main để thử. Sau duyệt và áp dụng chạy `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` trên main và xem log cleanup.

## Đã kiểm tra

- Trước draft: e2e P2-3 với `node --env-file=../.env` PASS 23/23, log `20261103T1542-N0N9` CLEANED; `npm run test` có 856 assertion PASS nhưng suite env.spec.ts không khởi chạy vì `.env.example` đã xóa. Test pending draft P2-4 cũng bị quét theo quy định backend/CLAUDE.md.
- Test trực tiếp draft: `npx vitest run --config artifact_BE/2026-11-03-BE-env-location/ref/vitest.preview.config.ts` → 3/3 PASS; `npx tsc -p artifact_BE/2026-11-03-BE-env-location/ref/tsconfig.preview.json --noEmit` → PASS; `npx oxlint --type-aware artifact_BE/2026-11-03-BE-env-location/src` → 0 cảnh báo/lỗi.
- Đối chiếu diff: `main.ts` nạp `../.env`, lệnh `test:e2e` nạp cùng file, thông báo lỗi chỉ nêu tên biến và vị trí file; `env.spec.ts` bỏ các bài kiểm file mẫu đã bị xóa, vẫn kiểm xác thực biến bằng dữ liệu giả. Không đọc hay chép giá trị bí mật.
- Chưa chạy toàn bộ `env.spec.ts` trên draft do các bài kiểm đọc các file phụ thuộc theo đường dẫn main; sẽ chạy trên file chính sau khi chủ dự án duyệt và áp dụng. `npm run test` còn quét draft P2-4 theo quy định, nên kết quả đầy đủ cần chờ P2-4.

## Giả định hoặc câu hỏi cho chủ dự án

Không có giả định nghiệp vụ mới. Theo quyết định chủ dự án, file bí mật tiếp tục nằm ở `Source/.env`, không sao chép vào repo/draft khác; `.env.example` không khôi phục.

Chủ dự án duyệt áp dụng đúng bản nháp này trong chat ngày 03/11/2026.

Sau áp dụng: lint backend 99 file 0 lỗi/cảnh báo; build PASS; unit main với `npm run test -- --exclude 'artifact_BE/**'` đạt 39 file/880 test PASS; `npm run test:e2e` đạt 3 file/23 test PASS, log `20261103T1555-CZIT` CLEANED. Lượt e2e trước đó `20261103T1542-N0N9` cũng PASS/CLEANED. `npm run test` không exclude hiện còn thu cả draft P2-4 đang làm, sẽ kiểm lại sau khi P2-4 hoàn tất.

Đã chép vào file chính 03/11/2026 bằng apply-draft.mjs: 4 file.
