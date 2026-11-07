# Bỏ cache tạm của bản nháp backend P2-17-21 khỏi Git

Trạng thái: ĐÃ DUYỆT 06/11/2026
Task / spec: Git housekeeping; không đổi quy tắc nghiệp vụ
Gốc: 2450365

## Làm gì, vì sao

Chỉ bỏ 4 thư mục `ref/node-compile-cache/`, `ref/temp/`, `ref/node-cache/`, `ref/tmp-cache/` khỏi Git index bằng `git rm -r --cached`. Không xóa file trong working tree, không đụng `ref/generated/` hay file tham chiếu ngoài 4 thư mục này. Thêm 4 quy tắc bỏ qua đúng phạm vi vào `.gitignore` để cache không bị stage lại.

Số liệu từ `git ls-files` và kích thước file trên đĩa ngày 06/11/2026:

| Phạm vi | File đang được Git theo dõi | Dung lượng file |
|---|---:|---:|
| Toàn bộ `ref/` trước | 4.288 | 51.743.187 byte (49,35 MiB) |
| `node-compile-cache/` | 1.794 | 13.953.000 byte |
| `temp/` | 1.174 | 4.290.512 byte |
| `node-cache/` | 640 | 2.842.552 byte |
| `tmp-cache/` | 639 | 2.860.620 byte |
| Tổng bỏ khỏi index sau duyệt | 4.247 | 23.946.684 byte (22,84 MiB) |
| Còn được Git theo dõi sau duyệt | 41 | 27.796.503 byte (26,51 MiB) |

Con số 4.288 là **toàn bộ** file đang được Git theo dõi dưới `ref/`, không phải số file trong 4 thư mục cache đã nêu. 3 trong 41 file giữ lại là kết quả thuộc các thư mục `vite*-cache/` khác; chúng nằm ngoài phạm vi được yêu cầu.

`git rm --cached` chỉ thay đổi Git index. Dung lượng file trên ổ đĩa vẫn là 51.743.187 byte; lịch sử Git cũ cũng không tự thu nhỏ. Bảng “sau” mô tả dung lượng file còn được Git theo dõi, không phải dung lượng đĩa được giải phóng.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thao tác sau duyệt |
|---|---|---|
| `.gitignore` | `.gitignore` | Sửa: thêm 4 quy tắc ignore, giữ nguyên nội dung cũ |
| Không có bản sao trong nháp | 4 thư mục cache nêu trên | Chỉ `git rm -r --cached`, không xóa file trên đĩa |

## Danh sách file giữ lại trong `ref/`

Các đường dẫn sau tính từ `Source/backend/artifact_BE/approved/2026-11-03-BE-P2-17-21/ref/`:

```text
constraints.sql
generate-preview-client.mjs
generated/client.d.ts
generated/client.js
generated/default.d.ts
generated/default.js
generated/edge.d.ts
generated/edge.js
generated/index-browser.js
generated/index.d.ts
generated/index.js
generated/package.json
generated/query_engine-windows.dll.node
generated/query_engine_bg.js
generated/query_engine_bg.wasm
generated/runtime/edge-esm.js
generated/runtime/edge.js
generated/runtime/index-browser.d.ts
generated/runtime/index-browser.js
generated/runtime/library.d.ts
generated/runtime/library.js
generated/runtime/react-native.js
generated/runtime/wasm-compiler-edge.js
generated/runtime/wasm-engine-edge.js
generated/schema.prisma
generated/wasm-edge-light-loader.mjs
generated/wasm-worker-loader.mjs
generated/wasm.d.ts
generated/wasm.js
package.json
rooms.migration.preview.spec.ts
schema.preview.prisma
schema.sql
tsconfig.preview.json
vite-cache/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json
vite-full-preview-cache/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json
vite-migration-cache/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json
vitest.full-preview.config.ts
vitest.migration.config.ts
vitest.preview.config.ts
vitest.preview.setup.ts
```

## Cách xem và kiểm tra

1. Xem `.gitignore` trong thư mục nháp và danh sách file ở trên.
2. Sau khi chủ dự án duyệt, chạy `node .claude/scripts/apply-draft.mjs Artifacts/2026-11-06-git-cache-cleanup` để áp dụng `.gitignore` theo guard của repo.
3. Sau đó chạy `git rm -r --cached -- Source/backend/artifact_BE/approved/2026-11-03-BE-P2-17-21/ref/node-compile-cache Source/backend/artifact_BE/approved/2026-11-03-BE-P2-17-21/ref/temp Source/backend/artifact_BE/approved/2026-11-03-BE-P2-17-21/ref/node-cache Source/backend/artifact_BE/approved/2026-11-03-BE-P2-17-21/ref/tmp-cache`.
4. Kiểm tra số file bị stage xóa, danh sách giữ lại, `git check-ignore` và `git status`; không commit.

## Đã kiểm tra

- Working tree sạch trước khi tạo bản nháp; `.gitignore` đã được commit tại `2450365`.
- `git ls-files` cho thấy đúng 4.247 file được theo dõi trong 4 thư mục mục tiêu; tổng `ref/` là 4.288 file.
- Đã áp dụng `.gitignore` bằng `apply-draft.mjs` sau khi chủ dự án duyệt trong chat ngày 06/11/2026.
- Đã chạy `git rm -r --cached` trên đúng 4 thư mục: 4.247 file được stage xóa, 0 đường dẫn xóa ngoài phạm vi; cả 4 thư mục vẫn còn trên đĩa.
- Sau áp dụng, `git ls-files` còn 41 file trong `ref/`, tổng 27.796.503 byte. `git check-ignore --no-index -v` khớp cả 4 quy tắc. HEAD vẫn là `2450365`; chưa commit.

## Giả định hoặc câu hỏi cho chủ dự án

- Giữ nguyên 3 file `vite*-cache/.../results.json` vì bạn chỉ nêu 4 thư mục cần gỡ. Nếu muốn bỏ cả chúng, cần mở rộng phạm vi trước khi duyệt.

Đã chép vào file chính 06/11/2026 bằng apply-draft.mjs: 1 file.
