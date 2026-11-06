# P2-4 · Sửa kiểm thử sau áp dụng

Trạng thái: ĐÃ DUYỆT 04/11/2026
Task / spec: BE-P2-17, BE-P2-21, BE-P2-11 · ROOM-01, API-04
Gốc: 70aa09c

## Làm gì, vì sao

Sau khi áp dụng draft P2-4 đã duyệt, `npm run test` trên main có hai suite mới dừng trước assertion vì thiếu `reflect-metadata`, và một assertion cũ trong PrismaService vẫn kỳ vọng AppModule chưa có RoomsModule. Sửa đúng ba file test để kiểm chứng cấu hình main hiện tại. Không đổi code nghiệp vụ.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích từ `Source/backend/` | Thêm / Sửa / Xóa |
|---|---|---|
| `src/modules/rooms/rooms.cp1.spec.ts` | cùng đường dẫn | Sửa |
| `src/modules/rooms/dto/rooms.dto.spec.ts` | cùng đường dẫn | Sửa |
| `src/common/prisma/prisma.service.spec.ts` | cùng đường dẫn | Sửa |

## Cách xem và kiểm tra

Từ `Source/backend`, chạy `node ./node_modules/vitest/vitest.mjs run --config artifact_BE/2026-11-04-BE-P2-4-main-test-fix/ref/vitest.preview.config.ts --maxWorkers=1 --reporter=dot` để overlay ba file test draft lên bộ unit main; không chép file nháp vào main để thử. Chạy ba đường dẫn test draft riêng và `npx oxlint --type-aware artifact_BE/2026-11-04-BE-P2-4-main-test-fix/src`. Sau khi duyệt và áp dụng, chạy lại `npm run test`, `npm run lint`, `npm run build` trên main.

## Đã kiểm tra

Trước bản nháp: Prisma migrate deploy PASS; main lint/build PASS; `npm run test` có 941/942 assertion PASS, 2 suite thiếu `reflect-metadata`, 1 assertion AppModule thiếu RoomsModule. Bản nháp sau sửa: 3/3 file và 58/58 test mục tiêu PASS; toàn bộ unit qua overlay 50/50 file, 993/993 test PASS; oxlint draft 0 lỗi/cảnh báo trên 3 file. E2E DB dev của main P2-4 sau migration 3/3 file, 23/23 test PASS. `scripts/e2e/cleanup.mjs` chỉ liệt kê: không có log chưa dọn hoặc bản ghi E2E lạ. Cấu hình overlay ở `ref/` không được áp dụng vào main. `npm run test` main sẽ kiểm lại sau khi chủ dự án duyệt hotfix.

## Giả định hoặc câu hỏi cho chủ dự án

Không có giả định nghiệp vụ mới. Cần chủ dự án duyệt rõ bản nháp này trước khi áp dụng.

Đã chép vào file chính 04/11/2026 bằng apply-draft.mjs: 3 file.
