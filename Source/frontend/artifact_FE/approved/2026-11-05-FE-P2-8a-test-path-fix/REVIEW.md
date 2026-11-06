# P2-8a · Sửa đường dẫn trong 2 test sau khi áp dụng

Trạng thái: ĐÃ DUYỆT 05/11/2026
Task / spec: FE-P2-08 · FE-P2-01, FE-P2-05
Gốc: 8bec6ab (P2-8a đã chép vào main, chưa commit)

## Làm gì, vì sao

Sau khi áp dụng P2-8a, `npm run test:components` trên main: `cp1-routes.test.mjs` và `cp5-buildings-services.test.mjs` fail vì tính đường dẫn theo độ sâu thư mục nháp (`../../../../src/app/guards.ts`, và `mainSrcRoot = draftRoot/../../src`). Trên main hai đường dẫn này trỏ sai ra ngoài `Source/frontend`. Sửa đúng 2 dòng, không đổi logic test hay code.

## File sẽ sửa ở bản chính (đích từ `Source/frontend/`)

| Bản nháp | Sửa |
|---|---|
| `tests/p2/cp1-routes.test.mjs` | dòng 170: `'../../../../src/app/guards.ts'` → `'../../src/app/guards.ts'` |
| `tests/p2/cp5-buildings-services.test.mjs` | dòng 26: `mainSrcRoot` = `draftSrcRoot` |

## Cách xem và kiểm tra

Không chạy được trong thư mục nháp (đường dẫn trỏ về `src/` của main). Sau khi duyệt và áp dụng: `npm run test:components` (kỳ vọng toàn bộ đạt), `npm run lint`, `npm run build`.

## Đã kiểm tra

Chạy `tests/p2/cp1-routes` và `cp5` trên main trước khi sửa: fail với `ENOENT ...\Rooms\src\app\guards.ts` và lỗi đọc `.length`. Các file p2 khác (cp2, cp3, cp4, cp6, cp7, cp8) và 234 test cũ đạt.

## Giả định hoặc câu hỏi cho chủ dự án

Không có.
