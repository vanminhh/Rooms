# FE-LOGIN-03: proxy `/api` của Vite sang backend

Trạng thái: ĐÃ DUYỆT 28/10/2026
Task / spec: FE-LOGIN-03 (`docs/phase-1-foundation/feature_p1-0-setup.md`) · API-01 (base path `/api/v1`)
Gốc: b2be3cc

## Làm gì, vì sao

Khi chạy `npm run dev`, mọi request `/api/...` từ trình duyệt được Vite chuyển sang API ở `http://localhost:3000`. Trình duyệt chỉ thấy một địa chỉ (cùng origin), nên cookie đăng nhập hoạt động mà không cần bật CORS ở backend (BE-LOGIN-07 tắt CORS). Không đổi đường dẫn: `/api/v1/...` giữ nguyên khi sang backend.

Chỉ thêm 4 dòng `server.proxy`, phần còn lại của file giữ nguyên.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `vite.config.ts` | `Source/frontend/vite.config.ts` | Sửa: thêm `server.proxy` |

## Cách xem và kiểm tra

`git diff --no-index Source/frontend/vite.config.ts Source/frontend/artifact_FE/2026-10-28-FE-LOGIN-03/vite.config.ts`

## Đã kiểm tra

28/10/2026:

- Chạy Vite bằng cấu hình nháp cùng một API giả ở cổng 3000: `GET /api/v1/auth/me` kèm cookie `refresh=abc` tới đúng API giả với đường dẫn `/api/v1/auth/me` và cookie còn nguyên; trang `/` vẫn do Vite trả về. Kết quả: PASS.
- `npx eslint` trên file nháp: không lỗi.
- Chưa chạy `npm run build` với file này (build dùng file chính); chạy lại sau khi chép. Kiểm với API thật ở phần 4.

## Giả định hoặc câu hỏi cho chủ dự án

- Backend chạy cổng 3000 khi dev (mặc định của NestJS, đúng như task ghi).

Đã chép vào file chính 28/10/2026 bằng apply-draft.mjs: 1 file.

Đã dọn 28/10/2026 (theo luật dọn `approved/` trong `Artifacts/README.md`): xóa bản sao `vite.config.ts` (lúc dọn, trùng khớp với `Source/frontend/vite.config.ts`). Giữ `REVIEW.md`. Mã commit: 2e7a6b2.
