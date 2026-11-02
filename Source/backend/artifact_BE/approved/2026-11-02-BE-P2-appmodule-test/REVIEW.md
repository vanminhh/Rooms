# Sửa test AppModule sau P2-2

Trạng thái: ĐÃ DUYỆT 02/11/2026
Task / spec: BE-P2-07 (thêm `FilesModule`) · BE-LOGIN-19
Gốc: b020c48

## Làm gì, vì sao

P2-2 thêm `FilesModule` vào `AppModule`. Test Phase 1 `src/common/prisma/prisma.service.spec.ts` khẳng định `AppModule` chỉ import đúng `[PrismaModule, AuthModule, SettingsModule]`, nên đỏ sau khi chép P2-2 (pipeline không thấy vì lúc đó file chính `app.module.ts` chưa đổi). Sửa danh sách kỳ vọng, thêm `FilesModule`.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `src/common/prisma/prisma.service.spec.ts` | `Source/backend/src/common/prisma/prisma.service.spec.ts` | Sửa: +import `FilesModule`, danh sách kỳ vọng thêm `FilesModule`, tên test thêm BE-P2-07 |

## Cách xem và kiểm tra

`git diff --no-index Source/backend/src/common/prisma/prisma.service.spec.ts Source/backend/artifact_BE/2026-11-02-BE-P2-appmodule-test/src/common/prisma/prisma.service.spec.ts`

## Đã kiểm tra

02/11/2026: diff chỉ 2 chỗ như trên; `src/app.module.ts` chính có `imports: [PrismaModule, AuthModule, SettingsModule, FilesModule]`. Test này import file chính bằng đường dẫn tương đối nên không chạy được trong vùng nháp; kiểm bằng `npm run test` ngay sau khi chép (đang đỏ đúng 1 test này: 786/787).

## Giả định hoặc câu hỏi cho chủ dự án

Không.

Đã chép vào file chính 02/11/2026 bằng apply-draft.mjs: 1 file.
