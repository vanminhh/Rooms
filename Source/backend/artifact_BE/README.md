# artifact_BE – bản nháp backend chờ duyệt

Quy trình, mẫu `REVIEW.md` và cách chạy thử: [../../../Artifacts/README.md](../../../Artifacts/README.md).

- Mỗi việc một thư mục `<YYYY-MM-DD>-<mã task>/`; file nháp đặt theo đường dẫn tính từ `Source/backend/` (vd `src/modules/auth/auth.service.ts`).
- Chạy test nháp: `npx vitest run artifact_BE/<thư-mục-nháp>` (`npm run test` cũng chạy các `*.spec.ts` ở đây).
- Đã duyệt và đưa vào bản chính: chuyển thư mục vào `approved/`.
