# Test máy chủ bỏ qua các bản nháp đã áp dụng

Trạng thái: ĐÃ DUYỆT 28/10/2026
Task / spec: quyết định của chủ dự án 28/10/2026: xóa công cụ `check-draft`, chỉ giữ phần sửa vitest
Gốc: cad211e

## Làm gì, vì sao

`npm run test` và `npm run test:e2e` của máy chủ quét mọi `*.spec.ts` / `*.e2e-spec.ts` trong `Source/backend`, kể cả `artifact_BE/approved/`. Sau khi một bản nháp được áp dụng, thư mục của nó vẫn nằm trong `approved/` cùng bản test cũ. Code mà bản test đó kiểm đã nằm trong `src/`. Vì vậy test chính sẽ chạy lại test cũ mãi, và có thể đỏ khi code chính đổi về sau.

Sửa: thêm `exclude: [...configDefaults.exclude, 'artifact_BE/approved/**']` vào hai file cấu hình vitest. Test của bản nháp **đang làm** vẫn chạy trong `npm run test` như cũ (`Source/backend/CLAUDE.md`: "drafts must keep tests green").

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `vitest.config.ts` | `Source/backend/vitest.config.ts` | Sửa: thêm `exclude` |
| `vitest.config.e2e.ts` | `Source/backend/vitest.config.e2e.ts` | Sửa: thêm `exclude` |
| `CLAUDE.md` | `Source/backend/CLAUDE.md` | Sửa: dòng `artifact_BE/` thêm "(not approved/)" |

## Cách xem và kiểm tra

Từ `Source/backend`: `npx vitest list --config artifact_BE/2026-10-28-vitest-skip-approved/vitest.config.ts --root . --filesOnly`

## Đã kiểm tra

28/10/2026, từ `Source/backend`, với 2 file test tạm (đã xóa sau khi thử) `artifact_BE/approved/zz-tmp-old/old.spec.ts` và `artifact_BE/zz-tmp-active/active.spec.ts`:

- Cấu hình chính hiện tại liệt kê cả 3: `src/app.controller.spec.ts`, file đang làm, file trong `approved/`.
- Cấu hình nháp liệt kê `src/app.controller.spec.ts` và file đang làm, **không** liệt kê file trong `approved/`.
- Cấu hình e2e nháp vẫn tìm thấy `test/app.e2e-spec.ts`. Chưa thử với một file e2e nằm trong `approved/`; cùng mẫu `exclude` nên kỳ vọng giống trên.
- `npx vitest run` với cấu hình nháp: 1 file, 1 test, QUA.

## Giả định hoặc câu hỏi cho chủ dự án

- Không còn công cụ kiểm code nháp như đã chép vào file chính. Code nháp của máy chủ chỉ được kiểm kiểu và lint đầy đủ sau khi áp dụng; lỗi khi đó sửa bằng bản nháp tiếp theo.

Đã chép vào file chính 28/10/2026 bằng apply-draft.mjs: 3 file.
