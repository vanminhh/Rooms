# Sửa 2 test cũ theo hành vi mới của bản QA-fixes

Trạng thái: ĐÃ DUYỆT 06/11/2026
Task / spec: P2-QA-01 · PRC-07, VIEW-04/05
Gốc: 9d13364

## Làm gì, vì sao

Sau khi áp dụng `2026-11-06-FE-P2-QA-fixes`, `npm run test:components` có 2 test cũ đỏ ổn định (cả khi chạy tuần tự). Cả hai kỳ vọng hành vi **trước** khi chủ dự án yêu cầu sửa, nên cập nhật test, không đổi mã:

| Test | Kỳ vọng cũ | Kỳ vọng mới |
|---|---|---|
| `fe09-room-price.test.mjs` PRC-07 (đề xuất chưa quá hạn) | "Đề xuất giá áp dụng từ" | "Đề xuất giá 2.500.000 đ áp dụng từ" (có `price` trong `pendingProposal`) |
| `fe12-viewings-page.test.mjs` VIEW-04 (thẻ Đã xác nhận) | không có nút "Chốt" | có nút "Chốt" và nó bị tắt (VIEW-05: chốt qua hợp đồng ở Phase 3). Thẻ Mới và thẻ WON/LOST/CANCELLED vẫn không có "Chốt" (các test đó không đổi) |

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `tests/p2/fe09-room-price.test.mjs` | `Source/frontend/tests/p2/fe09-room-price.test.mjs` | Sửa (1 test) |
| `tests/p2/fe12-viewings-page.test.mjs` | `Source/frontend/tests/p2/fe12-viewings-page.test.mjs` | Sửa (1 test) |

## Cách xem và kiểm tra

`npm run test:components` trong `Source/frontend`.

## Đã kiểm tra

- 06/11/2026: chạy 2 file nháp (qua một liên kết tạm tới `src` chính, đã xóa) tuần tự: 44/44 đạt.

## Giả định hoặc câu hỏi cho chủ dự án

Không có. Hai test `FE-P2-15 #6b` và `FE8B-6/NOTI-06` đỏ một lần khi chạy song song nhưng đạt khi chạy tuần tự (flaky đã ghi ở mục 10 của checklist), không liên quan bản này.
