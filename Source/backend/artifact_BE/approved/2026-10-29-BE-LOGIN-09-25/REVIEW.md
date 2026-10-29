# BE-LOGIN-09..25: đăng nhập, phiên, mật khẩu, guard và phạm vi (backend)

Trạng thái: ĐÃ DUYỆT 29/10/2026 (chủ dự án: "Duyệt", kèm P16)
Task / spec: BE-LOGIN-09..25 (`docs/phase-1-foundation/feature_p1-2-backend-auth.md`) · AUTH-01..07, AUTH-09, AUTH-10, AUTH-T1..T3, SCOPE-01..03, AUD-01
Gốc: 9536e8d

## Làm gì, vì sao

Phần 2 của Phase 1, API mà frontend Phần 4 gọi:

- Mật khẩu argon2id, tối thiểu 8 ký tự (BE-LOGIN-09). Access token JWT 15 phút; refresh token ngẫu nhiên, chỉ lưu SHA-256, 12 giờ hoặc 30 ngày khi "Ghi nhớ", xoay vòng giữ hạn cũ (BE-LOGIN-10, 13; Q1).
- `POST /auth/login`, `refresh`, `logout`, `GET/PATCH /auth/me`, `change-password`, `forgot-password`, `reset-password`, `GET /public/contact` (BE-LOGIN-11..19), giới hạn 5 lần sai / 15 phút (BE-LOGIN-12, Q2), mailer in ra console cho dev.
- Guard toàn cục: đăng nhập (`@Public` để mở), vai trò (`@Roles`), route không khai báo thì bị chặn, bắt đổi mật khẩu (BE-LOGIN-20, 21). Helper phạm vi tòa nhà / hợp đồng người thuê (BE-LOGIN-22). Audit đổi / đặt lại mật khẩu (BE-LOGIN-23).
- e2e `test/auth.e2e-spec.ts` (BE-LOGIN-24) chỉ chạy được trên DB dev sau khi chép.
- Biến môi trường bắt buộc mới: `JWT_SECRET` (≥ 32 ký tự) và `APP_URL`.

Thiết kế chi tiết: `PLAN.md`.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích (`Source/backend/…`) | Thêm / Sửa / Xóa |
|---|---|---|
| `src/app.module.ts`, `src/common/env.ts`, `src/common/env.spec.ts`, `src/common/errors/validation.ts`, `src/common/prisma/prisma.service.spec.ts` | cùng đường dẫn | Sửa |
| `src/common/crypto/*` (password, token + spec) | cùng đường dẫn | Thêm |
| `src/common/guards/*` (decorators, jwt-auth, roles, must-change-password + spec) | cùng đường dẫn | Thêm |
| `src/common/scope/*`, `src/common/errors/validation.spec.ts` | cùng đường dẫn | Thêm |
| `src/modules/auth/*` (controller, service, module, dto, rate-limiter, token.service + 7 spec) | cùng đường dẫn | Thêm |
| `src/modules/audit/*`, `src/modules/mailer/*`, `src/modules/settings/*` | cùng đường dẫn | Thêm |
| `test/auth.e2e-spec.ts`, `test/fixtures/auth-scenarios.ts`, `test/fixtures/fake-prisma.ts` | cùng đường dẫn | Thêm |
| `.env.example`, `package.json`, `prisma/seed.ts`, `src/main.ts`, `src/app.setup.ts`, `src/common/errors/{all-exceptions.filter,error-code}.ts`, `src/common/prisma/{prisma.module,prisma.service}.ts`, `src/common/response.interceptor.ts` | cùng đường dẫn | Giống hệt bản chính (chỉ để import trong nháp chạy được); chép không đổi gì |

## Cách xem và kiểm tra

Trong `Source/backend`: `npx vitest run artifact_BE/2026-10-29-BE-LOGIN-09-25`, `npm run test`, `npm run lint`, `npm run build`.

**Không chạy `npm run test:e2e` khi bản nháp chưa chép:** cấu hình e2e quét cả `artifact_BE/` (chỉ bỏ `approved/`), nên sẽ chạy e2e của bản nháp lên DB dev.

Sau khi chép (phiên chính): thêm `JWT_SECRET` (chuỗi ngẫu nhiên ≥ 32 ký tự) và `APP_URL` vào `.env` · `npm run lint`, `npm run test`, `npm run build` · `npm run test:e2e` trên DB dev (BE-LOGIN-24, seed chạy lại trước/sau) · đăng nhập thử từng vai trò bằng `POST /api/v1/auth/login`.

## Đã kiểm tra

29/10/2026, pipeline (planner → coder → tester → reviewer; dừng một lần vì giới hạn API, chạy tiếp):

- **CP-1 PASS** (84 test, 1 vòng sửa do kỳ vọng sai trong test), **CP-2 PASS** (72), **CP-3 PASS** (28), **CP-4 PASS** (81), **CP-5 PASS** (74), **CP-6 PASS** (47), **CP-7 PASS** (9 test luồng với DB giả; 9 test e2e đã viết, chưa chạy). Fail-proof check đã làm cho từng checkpoint.
- **Reviewer: CHẶN.**
  - Lỗi chặn 1 (`auth.service.ts:80-88`): giới hạn AUTH-04 bị lách khi gửi nhiều lần đăng nhập sai **song song** cho cùng một số: mọi yêu cầu qua `isBlocked` trước khi lần sai đầu tiên được ghi, nên thử được không giới hạn mật khẩu; mỗi lần còn tốn một argon2 (~64 MB RAM). Chưa có test song song. Hướng sửa: ghi lượt thử ngay sau `isBlocked` (trước `await`), thành công thì xóa, ACCOUNT_LOCKED thì bỏ lượt vừa ghi; thêm test 6 yêu cầu sai song song → có 429.
  - Nên sửa 1 (`auth.service.ts:233-259`): `forgot-password` trả nhanh với số không có tài khoản/email, chậm hơn với số có email (ghi token + gửi mail), đo thời gian là biết số nào có tài khoản (AUTH-07 cấm). Hướng sửa: ghi token + gửi mail chạy nền, mọi nhánh trả cùng lúc.
  - Nên sửa 2 (`vitest.config.e2e.ts:8-10`): e2e quét cả bản nháp trong `artifact_BE/`.
  - Ghi chú: mailer console in link đặt lại mật khẩu ra log, chưa chặn khi production; `resetPassword` không kiểm tài khoản bị khóa (vẫn không đăng nhập được); sau đổi / đặt lại mật khẩu, access token cũ còn dùng được tối đa 15 phút (đúng AUTH-T1/T3); tên test `scope.spec.ts:40` không khớp nội dung; fake `$transaction` không phân biệt ghi qua `tx`; `.env.example` có `JWT_SECRET="change-me"` nên app không khởi động với giá trị mẫu (cố ý).
- Phiên chính chạy lại: lần đầu `npm run test` có 3 file nháp (`guards.spec.ts`, `auth.me.spec.ts`, `settings.spec.ts`) không tải được (79 test bị bỏ qua; thời gian import rất lâu, file chạy riêng thì qua); hai lần chạy sau đều 20 file / 592 test qua. `npm run lint` và `oxlint` trên thư mục nháp 0 lỗi, `npm run build` qua, `main-files.mjs check`: không file chính nào bị đổi.

29/10/2026, lượt "sửa thêm" (orchestrator mới trên model đã cập nhật; chủ dự án chọn sửa 3 mục):

- Sửa lỗi chặn 1: ghi lượt thử ngay sau `isBlocked`, trước `await`; test mới `auth.login-limit.spec.ts` gửi 6 lần sai song song → có 429. **CP-4 PASS** (98 test).
- Sửa nên sửa 1: `forgot-password` ghi token + gửi mail chạy nền, mọi nhánh trả cùng lúc. **CP-6 PASS** (55 test).
- Sửa nên sửa 2: thêm `vitest.config.e2e.ts` vào bản nháp, loại toàn bộ `artifact_BE/**` khỏi e2e. **CP-7 PASS** (kiểm tĩnh; không chạy e2e).
- Fail-proof check đã làm cho CP-4, CP-6.
- **Reviewer: DUYỆT**, không có lỗi chặn. Nên sửa (trước khi lên production, không chặn Phase 1): mailer console in link đặt lại mật khẩu ra log, chưa chặn khi `NODE_ENV=production`; `resetPassword` không kiểm tài khoản bị khóa (link gửi trước khi khóa vẫn đổi được mật khẩu, nhưng vẫn không đăng nhập được); bộ đếm giới hạn nằm trong bộ nhớ, chạy 2 instance trở lên thì giới hạn bị nhân lên. Ghi chú: kẻ xấu có thể cố ý khóa tạm 15 phút một số điện thoại (hệ quả của AUTH-04 tính theo số); `/auth/refresh` mở cho người đang bị buộc đổi mật khẩu; tenant gửi trường liên hệ của nhân viên nhận `FORBIDDEN`.
- Phiên chính chạy lại: `npm run test` 21 file / 617 test qua; `npm run lint` và `oxlint` thư mục nháp 0 lỗi; `npm run build` qua; diff `vitest.config.e2e.ts` chỉ đổi dòng exclude; `main-files.mjs check`: không file chính nào bị đổi.

Bảng file: thêm `vitest.config.e2e.ts` (Sửa, đích `Source/backend/vitest.config.e2e.ts`) và `src/modules/auth/auth.login-limit.spec.ts` (Thêm).

## Giả định hoặc câu hỏi cho chủ dự án

Planner thêm trong lượt sửa, cần chủ dự án chấp nhận: **P16** – lỗi 500 xảy ra giữa lúc đăng nhập vẫn tính là một lần sai; đăng nhập đúng **song song** vào tài khoản bị khóa có thể thoáng nhận 429 (gửi lần lượt thì vẫn đúng Q2d).


Quyết định của chủ dự án (29/10/2026): Q1–Q6 và hai chỗ spec lệch đều theo đề xuất trong `PLAN.md` §3.1, §3.4.

Planner tự chốt, cần chủ dự án xác nhận:

1. Đúng mật khẩu trên tài khoản bị khóa: không tính là lần sai, cũng không xóa bộ đếm (chỉ đăng nhập thành công mới xóa).
2. Quên mật khẩu: yêu cầu đã bị chặn không đếm thêm; số không tồn tại vẫn đếm.
3. e2e gọi `PATCH /auth/me` với `{}` vì seed không khôi phục email / liên hệ.

Giả định spec: A-07 (phiên không ghi nhớ tối đa 12 giờ). Quyết định kỹ thuật P1–P15: `PLAN.md` §3.3. Quy tắc mới không có trong spec: `JWT_SECRET` ≥ 32 ký tự, `APP_URL` bắt buộc.

Việc sau (bản nháp spec riêng): AUTH-T3 "mọi phiên" → "các phiên khác" khi đổi mật khẩu; bỏ dòng `OUT_OF_SCOPE` cho người thuê (SCOPE-03 = 404).

Đã chép vào file chính 29/10/2026 bằng apply-draft.mjs: 54 file.

Sau khi chép 29/10/2026 (phiên chính): thêm `JWT_SECRET` ngẫu nhiên (64 ký tự, không in ra) và `APP_URL` vào `.env`; `tsc` sạch; `npm run test` 592/592; lint 0 lỗi; build qua; `npm run test:e2e` trên DB dev 17/17; đăng nhập qua API: Boss, 2 quản lý, người thuê có cờ (`mustChangePassword=true`) đều OK, người thuê bị khóa → `ACCOUNT_LOCKED`, sai mật khẩu → `INVALID_CREDENTIALS`. Chủ dự án chấp nhận P16 khi duyệt.

Đã dọn 30/10/2026 (theo luật dọn `approved/` trong `Artifacts/README.md`): xóa bản sao 54 file (lúc dọn, cả 54 trùng khớp với file chính cùng tên trong `Source/backend/`). Giữ `REVIEW.md` và `PLAN.md`. Mã commit: a5b2138.
