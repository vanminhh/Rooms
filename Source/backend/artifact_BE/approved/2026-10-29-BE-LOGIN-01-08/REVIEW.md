# BE-LOGIN-01..08: nền móng backend (Prisma, migration, seed, khung API, định dạng lỗi)

Trạng thái: ĐÃ DUYỆT 29/10/2026 (chủ dự án: "Duyệt cả hai")
Task / spec: BE-LOGIN-01..08 (`docs/phase-1-foundation/feature_p1-1-backend-foundation.md`) · API-01..04, roadmap Phase 1 seed, PRC-04, SVC-01, RATE-02, CON-04, CON-10, BIL-01, BIL-09
Gốc: 5c11740

## Làm gì, vì sao

Phần 1 của Phase 1, nền cho đăng nhập (Phần 2):

- **BE-LOGIN-01:** bỏ `ObserveModule` và gói `@nestjs/observe`; `AppModule` chỉ còn `PrismaModule`.
- **BE-LOGIN-02:** `prisma/schema.prisma`, `constraints.sql`, `check-constraints.mjs` giống hệt bản ở `docs/database/`. Sửa đường dẫn tài liệu: bản nháp riêng `Artifacts/2026-10-29-BE-LOGIN-02-doc-paths/`.
- **BE-LOGIN-03:** `.env.example` đủ 8 biến (giá trị giả); lúc khởi động thiếu `DATABASE_URL` hoặc `DIRECT_URL` thì dừng và báo tên biến (D3).
- **BE-LOGIN-04:** migration `prisma/migrations/20261029000000_init/migration.sql` = SQL sinh bằng `prisma migrate diff` + `constraints.sql` nối từ dòng 794.
- **BE-LOGIN-05:** `PrismaService` toàn cục, đóng kết nối khi tắt app.
- **BE-LOGIN-06:** `prisma/seed.ts` (chạy bằng `npx prisma db seed` = `node prisma/seed.ts`, không cần `tsx`): 5 tài khoản, 3 tòa, phòng, giá đã duyệt, dịch vụ, bảng giá, 1 hợp đồng ACTIVE theo BIL-01/BIL-09. Chạy lại chỉ đặt lại 5 tài khoản dev (D5).
- **BE-LOGIN-07:** `/api/v1`, cookie parser, validation pipe (whitelist + cấm trường lạ), không bật CORS. Đường dẫn ngoài `/api/v1` trả 404 `NOT_FOUND` dạng API-03 (D6).
- **BE-LOGIN-08:** `{ data }` (API-02), `{ error: { code, message, fields? } }` (API-03/04), enum `ErrorCode` gồm mã của spec + `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `INTERNAL_ERROR` (D4).

Thiết kế chi tiết: `PLAN.md`.

Tài khoản dev (ghi ở đầu `seed.ts`, chỉ dùng cho dev): Boss `0900000001`, Quản lý 1 `0900000002` (CG01, DD01), Quản lý 2 `0900000003`, Người thuê phải đổi mật khẩu `0900000004` (hợp đồng `HD000001`), Người thuê bị khóa `0900000005`.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích (`Source/backend/…`) | Thêm / Sửa / Xóa |
|---|---|---|
| `package.json` | `package.json` | Sửa: bỏ `@nestjs/observe`, `@types/node` 24.0.0 → 24.19.2 (D7), thêm `prisma.seed` |
| `.env.example` | `.env.example` | Thêm |
| `prisma/schema.prisma`, `prisma/constraints.sql`, `prisma/check-constraints.mjs` | `prisma/…` | Thêm (giống hệt `docs/database/`) |
| `prisma/migrations/20261029000000_init/migration.sql`, `prisma/migrations/migration_lock.toml` | `prisma/migrations/…` | Thêm |
| `prisma/seed.ts`, `prisma/seed.spec.ts` | `prisma/…` | Thêm |
| `src/main.ts`, `src/app.module.ts` | `src/…` | Sửa |
| `src/app.setup.ts`, `src/app.setup.spec.ts` | `src/…` | Thêm |
| `src/common/env.ts`, `src/common/env.spec.ts` | `src/common/…` | Thêm |
| `src/common/errors/all-exceptions.filter.ts`, `error-code.ts`, `validation.ts` | `src/common/errors/…` | Thêm |
| `src/common/prisma/prisma.module.ts`, `prisma.service.ts`, `prisma.service.spec.ts` | `src/common/prisma/…` | Thêm |
| `src/common/response.interceptor.ts` | `src/common/…` | Thêm |
| `test/app.e2e-spec.ts` | `test/…` | Sửa |
| – | `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts` | Xóa (khung Hello World của Nest, không còn ai dùng; xóa tay sau khi chủ dự án đồng ý) |
| – | `docs/database/schema.prisma`, `constraints.sql`, `check-constraints.mjs` | Xóa (bằng tay, BE-LOGIN-02) |

Chép cùng lúc với `Artifacts/2026-10-29-BE-LOGIN-02-doc-paths/`.

## Cách xem và kiểm tra

Trong `Source/backend`:

- Test nháp: `npx vitest run artifact_BE/2026-10-29-BE-LOGIN-01-08` và e2e `npx vitest run --config ./vitest.config.e2e.ts artifact_BE/2026-10-29-BE-LOGIN-01-08`
- `npm run test`, `npm run lint`, `npm run build`
- Diff file sửa: `git diff --no-index src/main.ts artifact_BE/2026-10-29-BE-LOGIN-01-08/src/main.ts` (tương tự cho `package.json`, `src/app.module.ts`, `test/app.e2e-spec.ts`)

Sau khi chép (phiên chính làm, theo thứ tự): `npm install` (bỏ `@nestjs/observe`, cài `@types/node` 24.19.2, `package-lock.json` khớp `package.json`) · xóa tay các file "Xóa" · `npx prisma generate` · `npx prisma validate` · `npx tsc --noEmit` không còn lỗi `import.meta.main` · chủ dự án tắt Data API của Supabase · `npx prisma migrate deploy` (áp vào DB dev) · kiểm DB 50/50 (`docs/spec/02-database.md`) · `npx prisma db seed` hai lần, mỗi lần phải thấy dòng "Seed xong: …" · `npm run lint`, `npm run test`, `npm run build` · khởi động thiếu `DATABASE_URL` thấy báo tên biến.

## Đã kiểm tra

29/10/2026, pipeline (planner → coder → tester → reviewer):

- **CP-1 PASS** (BE-LOGIN-02, 04): `prisma validate`; 3 file `prisma/` giống hệt `docs/database/`; migration khớp SQL sinh từ schema + `constraints.sql`; fail-proof check đã làm.
- **CP-2 PASS** (BE-LOGIN-01, 03, 05): 25 test.
- **CP-3 PASS** (BE-LOGIN-07, 08): 103 test + 7 e2e, sau 1 vòng sửa cho D6 (404 ngoài `/api/v1`).
- **CP-4 PASS** (BE-LOGIN-06): 33 test, gồm chạy seed 2 lần trên DB giả mô phỏng trigger; seed cho lại hóa đơn mẫu 3.119.000 đ (BIL-09).
- Pipeline không chạm DB dev, không đọc `.env`.
- **Reviewer: DUYỆT**, không có lỗi chặn. Nên sửa:
  1. Khung Hello World (`app.controller.ts`, `app.service.ts`, spec) không còn dùng → đã ghi "Xóa" ở bảng trên.
  2. `package-lock.json` vẫn còn `@nestjs/observe` → chạy `npm uninstall @nestjs/observe` sau khi chép (đã ghi ở bước sau khi chép).
  3. `all-exceptions.filter.ts:35`: lỗi body-parser không phải SyntaxError (JSON > 100 kB → 413, charset sai → 415) đang thành 500 `INTERNAL_ERROR`; nên trả 4xx (API-04).
  4. `all-exceptions.filter.ts:35`: lỗi Prisma/Postgres (trùng số điện thoại, trigger `MANAGER_MAX_2_BUILDINGS`, CHECK) đang thành 500; spec và `Source/backend/CLAUDE.md` yêu cầu ánh xạ sang mã lỗi. Chưa task Phase 1 nào nhận việc này.
  5. `prisma/seed.ts:269-270`: seed chỉ chạy khi `import.meta.url` khớp `process.argv[1]`; trên Windows lệch hoa/thường ổ đĩa hoặc junction thì `npx prisma db seed` báo thành công mà không ghi gì. Nên dùng `import.meta.main` (Node 24).
- Ghi chú của reviewer: chú thích "dummy env" ở `test/app.e2e-spec.ts:7-8` không đúng thực tế (vô hại); 2 test kiểm thứ tự gọi trong `main.ts` bằng tìm chuỗi (yếu); `fields` sẽ hiện câu tiếng Anh nếu DTO sau quên `message` tiếng Việt; interceptor chưa có lối ra cho `meta` phân trang; test "AppModule chỉ import PrismaModule" phải sửa khi Phần 2 thêm AuthModule; `HD000001` chỉ khớp CON-03 trên DB mới.
- Phiên chính chạy lại (lượt 1): `npm run test` 162/162 (5 file); e2e nháp 7/7; `npm run lint` và `oxlint` trên thư mục nháp 0 lỗi; `npm run build` qua; `main-files.mjs check`: không file chính nào bị đổi.

29/10/2026, lượt "sửa thêm" (chủ dự án chọn sửa nên sửa 3 và 5 của reviewer):

- Sửa 3: lỗi body-parser của client (413, 415) trả 400 `VALIDATION_FAILED` (D8), không ghi log lỗi nội bộ. Sửa 5: seed chạy khi `import.meta.main`, import từ test không chạy seed; `@types/node` nâng lên 24.19.2 (D7).
- **CP-3 PASS** (137 test + 8 e2e), **CP-4 PASS** (35 test, gồm chạy trực tiếp qua đường dẫn tương đối và ổ đĩa viết thường); fail-proof check đã làm. `tsc` còn đúng 1 lỗi đã chấp nhận (`seed.ts(269,17) TS2339 import.meta.main`), hết sau `npm install`.
- **Reviewer: DUYỆT**, không có lỗi chặn. Nên sửa:
  1. `package-lock.json` lệch `package.json` (`@nestjs/observe`, `@types/node`) → `npm install` ngay sau khi chép (đã ghi ở bước sau khi chép).
  2. Khung Hello World → đã ghi "Xóa".
  3. `import.meta.main` cần Node ≥ 24.2; Node cũ hơn thì seed thoát 0 mà không ghi gì. Hướng sửa: thêm `"engines": { "node": ">=24.2" }`, hoặc khi kiểm phải thấy "Seed xong". Máy hiện tại chạy Node 24.22.
  4. Chạy lại seed đặt lại mật khẩu và `isActive` của 5 tài khoản nhưng không thu hồi `sessions` (AUTH-T3); chỉ có tác dụng khi Phần 2 có phiên đăng nhập.
  5. `INTERNAL_ERROR` chưa có trong bảng mã lỗi của spec → đã thêm vào bản nháp `Artifacts/2026-10-29-BE-LOGIN-02-doc-paths/`.
- Ghi chú thêm của reviewer: seed không có chặn production (mật khẩu Boss nằm trong git và bị đặt lại mỗi lần chạy; chặn rẻ bằng `NODE_ENV === 'production'`); chú thích `seed.spec.ts:11` còn nhắc `docs/database/constraints.sql`; test tên BIL-09 trong `seed.spec.ts` chỉ kiểm dữ liệu seed, không thay unit test tính hóa đơn của Phase 4; ánh xạ lỗi Prisma sang mã lỗi spec chưa task nào nhận.
- Phiên chính chạy lại (lượt 2): `npm run test` 198/198 (5 file); e2e nháp 8/8; `npm run lint` và `oxlint` trên thư mục nháp 0 lỗi; `npm run build` qua; `package.json` nháp chỉ đổi 3 chỗ trên; `main-files.mjs check`: không file chính nào bị đổi.
- Chưa kiểm (chỉ làm được sau khi chép): migration trên Postgres thật, seed trên DB dev, DB check 50/50 từ `Source/backend/prisma/`.

## Giả định hoặc câu hỏi cho chủ dự án

Quyết định của chủ dự án (29/10/2026): D1 cho `prisma generate` với env giả · D2 coder sinh `migration.sql` bằng `prisma migrate diff -o` · D3 bắt buộc `DATABASE_URL` + `DIRECT_URL` · D4 mã 500 = `INTERNAL_ERROR` · D5 chạy lại seed chỉ đặt lại 5 tài khoản dev · D6 đường dẫn ngoài `/api/v1` trả 404 `NOT_FOUND` dạng API-03 · D7 `@types/node` 24.19.2 · D8 lỗi 413/415 của client trả 400 `VALIDATION_FAILED`.

Giả định ([ASSUMPTION], PLAN §3):

1. Câu chữ tiếng Việt của các mã lỗi ngoài AUTH-01/02, của `fields` cho trường lạ, của thông báo thiếu biến môi trường.
2. Dữ liệu seed mẫu: tên, địa chỉ, giá các phòng khác phòng 203, số điện thoại, mật khẩu dev, biển số, chỉ số nước 52, liên hệ Zalo/Facebook và `bank_account` giữ chỗ, liên hệ quản lý = số đăng nhập, người tạo = quản lý 1, giờ ký / vào ở.
3. Mã hợp đồng cố định `HD000001`.
4. Giá phòng và bảng giá seed có hiệu lực từ 01/09/2026.
5. `PrismaService` kết nối khi có truy vấn đầu tiên (không kết nối lúc khởi động).
6. Xóa khung Hello World; hoãn ánh xạ lỗi Prisma và `meta` phân trang.
7. Áp migration bằng `prisma migrate deploy` thay cho `migrate dev`.

Lệch kế hoạch: seed tạo `buildings` bằng `findFirst` + `create` thay cho `upsert`, vì `upsert` kích trigger `buildings_manager_check` và lần chạy thứ 2 sẽ báo `MANAGER_MAX_2_BUILDINGS`.

Giới hạn đã biết: so khớp `/api/v1` phân biệt hoa thường (`/API/V1/…` → 404). Seed không có chốt chặn môi trường: chạy nhầm vào DB khác sẽ đặt lại mật khẩu 5 số `0900000001..05`.

`INTERNAL_ERROR` được thêm vào `01-architecture.md#error-codes` trong bản nháp `Artifacts/2026-10-29-BE-LOGIN-02-doc-paths/`.

Chưa quyết (đề xuất ghi thành việc cho phần sau, không chặn bản nháp này): ánh xạ lỗi Prisma/Postgres sang mã lỗi spec; thu hồi `sessions` khi chạy lại seed (khi Phần 2 có phiên); chặn seed khi `NODE_ENV=production`; `engines` Node ≥ 24.2.

Đã chép vào file chính 29/10/2026 bằng apply-draft.mjs: 23 file.
