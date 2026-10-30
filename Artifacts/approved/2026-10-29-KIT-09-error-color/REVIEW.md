# KIT-09: thêm màu lỗi `--rooms-error` và số test của bộ kit vào spec

Trạng thái: ĐÃ DUYỆT 29/10/2026 (chủ dự án: "Duyệt bản nháp spec KIT-09")
Task / spec: KIT-09 · FE-LOGIN-06 (quyết định Q1 của chủ dự án, 28/10/2026) · nên sửa số 2 của reviewer FE-LOGIN-06
Gốc: 605cec1

## Làm gì, vì sao

FE-LOGIN-06 đã thêm token `--rooms-error: #9b2c1f` vào `rooms.css` và 26 test vào `npm run test:components`, nhưng spec chưa ghi. Spec là nguồn đúng, nên cập nhật cho khớp:

- **KIT-09:** thêm màu lỗi, chỉ dùng cho chữ lỗi, viền ô nhập bị lỗi và khối `FormError`, kèm độ tương phản.
- **Mục "Preview and tests":** 14 → 40 test, thêm "form fields" vào danh sách nhóm test.
- **`docs/spec/README.md` mục "Status":** cũng ghi "14 tests", đổi thành 40. Ngoài yêu cầu ban đầu (chỉ `31-ui-kit.md`), nhưng là cùng một con số đã cũ; bỏ nếu không muốn. Phần còn lại của dòng "Status" (chưa có tính năng nào) để P1-QA-04 sửa khi xong Phase 1.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/spec/31-ui-kit.md` | cùng đường dẫn | Sửa: KIT-09, dòng `npm run test:components` |
| `docs/spec/README.md` | cùng đường dẫn | Sửa: "14 tests" → "40 tests" ở mục "Status" |

## Cách xem và kiểm tra

`git diff --no-index docs/spec/31-ui-kit.md Artifacts/2026-10-29-KIT-09-error-color/docs/spec/31-ui-kit.md`
`git diff --no-index docs/spec/README.md Artifacts/2026-10-29-KIT-09-error-color/docs/spec/README.md`

## Đã kiểm tra

29/10/2026:

- Mỗi file chỉ khác bản chính ở đúng các chỗ nêu trên (`git diff --no-index`).
- Độ tương phản tính lại theo công thức WCAG: `#9b2c1f` trên `#f8f2e6` 6,79; trên `#fcf8ee` 7,14; trên `#efe8d4` 6,19 (đều ≥ 4,5 như KIT-09 yêu cầu).
- Số test: `npm run test:components` trên bản chính in `tests 40 · pass 40 · fail 0` (commit ca59d0c).
- Phạm vi dùng màu khớp `rooms.css`: `.rooms-field-error`, `.rooms-field-input[aria-invalid='true']`, `.rooms-form-error`.
- File đích không đổi so với `605cec1` (`git status` sạch).

## Giả định hoặc câu hỏi cho chủ dự án

- Không có.

Đã chép vào file chính 29/10/2026 bằng apply-draft.mjs: 2 file.

Đã dọn 29/10/2026 (theo luật dọn `approved/` trong `Artifacts/README.md`): xóa bản sao `docs/spec/31-ui-kit.md` và `docs/spec/README.md` (lúc dọn, cả 2 trùng khớp với file cùng đường dẫn ở gốc repo). Giữ `REVIEW.md`. Mã commit: dcbdfb7.
