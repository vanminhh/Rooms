# FE-LOGIN-06: test KIT-07 không đòi `form-fields` là file cuối của `test:components`

Trạng thái: ĐÃ DUYỆT 29/10/2026 (chủ dự án: "Duyệt")
Task / spec: FE-LOGIN-06 · KIT-07 (sửa nhỏ, không qua pipeline)
Gốc: a5b2138

## Làm gì, vì sao

Sau khi chép FE-LOGIN-04..16, `package.json` nối thêm 4 file test sau `tests/form-fields.test.mjs`. Test cũ của FE-LOGIN-06 đòi `form-fields.test.mjs` phải đứng **cuối** script, nên `npm run test:components` rớt 1 test (233/234). Đổi thành: script có chứa file này. Tên test bỏ chữ "after the existing ones".

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `tests/form-fields.test.mjs` | `Source/frontend/tests/form-fields.test.mjs` | Sửa: 1 điều kiện + tên test |

## Cách xem và kiểm tra

`git diff --no-index tests/form-fields.test.mjs artifact_FE/2026-10-29-FE-LOGIN-06-test-fix/tests/form-fields.test.mjs` (trong `Source/frontend`)

## Đã kiểm tra

29/10/2026: bản chính `npm run test:components` 233/234, test rớt đúng là test này. Điều kiện mới kiểm trên `package.json` thật: có `form-fields.test.mjs` → đúng; script thiếu file này → sai. File nháp không chạy được tại chỗ vì đọc `../src/components/` tương đối; chạy lại `npm run test:components` sau khi chép.

## Giả định hoặc câu hỏi cho chủ dự án

- Không có.

Đã chép vào file chính 29/10/2026 bằng apply-draft.mjs: 1 file (chuyển thư mục bị Vite giữ, chuyển tay sau khi tắt server). `npm run test:components` 234/234.
