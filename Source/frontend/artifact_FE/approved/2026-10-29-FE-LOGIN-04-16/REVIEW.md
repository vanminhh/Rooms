# FE-LOGIN-04..16: đăng nhập, định tuyến và 3 layout (frontend)

Trạng thái: ĐÃ DUYỆT 29/10/2026 (chủ dự án: "Duyệt luôn")
Task / spec: FE-LOGIN-04..16 (`docs/phase-1-foundation/feature_p1-4-frontend-auth.md`) · AUTH-01, 02, 04, 05, 06, 07, 09, 10, AUTH-T1, T2 · UI-05, UI-07, UI-08 · KIT-01..08
Gốc: a5b2138

## Làm gì, vì sao

Phần 4 của Phase 1, giao diện đăng nhập gọi API Phần 2:

- `src/shared/api.ts`: gọi API kèm cookie, access token chỉ trong bộ nhớ, bóc `{ data }`, ném `ApiError` từ `{ error }`, 401 thì làm mới phiên một lần rồi thử lại (FE-LOGIN-05); helper đổ `fields` vào form (FE-LOGIN-07).
- `src/app/`: `AuthProvider` (mở app thì refresh + `/auth/me`), router với `PublicLayout`, `TenantLayout`, `StaffLayout` và guard: chưa đăng nhập → `/dang-nhap?next=…`, sai vai trò → trang chủ của mình, bị buộc đổi mật khẩu → `/doi-mat-khau` (FE-LOGIN-08, 09).
- Layout dùng bộ kit, footer liên hệ Boss ở trang công khai; trang chủ tạm `/thue` "Tổng quan", `/ql` "Việc hôm nay" (FE-LOGIN-10, 11).
- Trang `/dang-nhap`, `/doi-mat-khau`, `/quen-mat-khau` (cả đặt lại bằng link), `/thue/tai-khoan`, `/ql/tai-khoan` (FE-LOGIN-12..15). `/` và `/phong` hiện "Trang đang được xây dựng", đường dẫn lạ hiện "Không tìm thấy trang".

Thiết kế chi tiết: `PLAN.md`.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích (`Source/frontend/…`) | Thêm / Sửa / Xóa |
|---|---|---|
| `index.html`, `src/main.tsx` | cùng đường dẫn | Sửa: vỏ app, nạp router |
| `package.json` | `package.json` | Sửa: thêm 4 file test vào `test:components` |
| `src/app/*` (AuthProvider, routes, RequireAuth, guards) | cùng đường dẫn | Thêm |
| `src/layouts/*` (3 layout) | cùng đường dẫn | Thêm |
| `src/pages/public/*`, `src/pages/tenant/*`, `src/pages/staff/*` | cùng đường dẫn | Thêm |
| `src/features/auth/*` (api, schemas, form, ContactInfo, useSignOut, css) | cùng đường dẫn | Thêm |
| `src/shared/api.ts`, `src/shared/form-errors.ts` | cùng đường dẫn | Thêm |
| `tests/auth-api.test.mjs`, `auth-guards.test.mjs`, `auth-schemas.test.mjs`, `auth-login-flow.test.mjs` | `tests/…` | Thêm |

Không chép: `PLAN.md`, `REVIEW.md`, `preview.html`. Tổng 37 file được chép (34 thêm, 3 sửa).

## Cách xem và kiểm tra

Trong `Source/frontend`: `node --test artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/*.test.mjs`, `npm run lint`, `npm run build`, `npm run test:components`. Xem thử: `preview.html` trong thư mục nháp (cần cấu hình Vite tạm, xem `PLAN.md` A1).

Sau khi chép (phiên chính): `npm run lint`, `npm run build`, `npm run test:components`; chạy backend + `npm run dev`, đăng nhập thử 3 tài khoản seed (FE-LOGIN-09), tài khoản bị khóa, người thuê bị buộc đổi mật khẩu.

## Đã kiểm tra

29/10/2026, pipeline (planner → coder → tester → reviewer; orchestrator dừng 3 lần: 7 câu hỏi Q1–Q7, 2 điểm kỹ thuật ở CP-3, 1 câu hỏi Q8 ở CP-4):

- **CP-1 PASS** (36 test), **CP-2 PASS** (15), **CP-3 PASS** (43; tsc CP-2 + CP-3 qua), **CP-4 PASS** sau 1 vòng sửa (126 tổng), **CP-5 PASS** (158), **CP-6 PASS** (194), **CP-7 PASS** (lint, build, `test:components`, tsc, eslint). Fail-proof check cho CP-1..CP-6.
- Tester CP-4 chạy 59 kiểm tra trình duyệt trên `preview.html` (dev server tạm, đã tắt). Chưa kiểm trong trình duyệt: CP-5, CP-6, thứ tự Tab / focus, menu di động, tên tòa rất dài ở 360 px. Mọi test dùng `fetch` giả, chưa chạy với backend thật.
- **Reviewer: DUYỆT**, không có lỗi chặn. Nên sửa:
  1. `src/shared/api.ts:103-106`: làm mới phiên lỗi vì mất mạng hoặc lỗi server (5xx) cũng đăng xuất người dùng (trong bộ nhớ), dù cookie vẫn còn. Chỉ nên đăng xuất khi 401. Spec chưa nói; test hiện ghim hành vi đăng xuất.
  2. `src/app/AuthProvider.tsx`: nếu bấm đăng nhập đúng lúc app đang tải phiên, kết quả tải phiên có thể ghi đè lần đăng nhập (cửa sổ rất hẹp vì trang đăng nhập hiện spinner khi đang tải).
  3. `GENERIC_MESSAGE` khai báo 2 lần (`api.ts:3`, `form-errors.ts:4`).
- Ghi chú pipeline: sau khi đổi mật khẩu thành công, nếu tải lại thông tin người dùng lỗi (không phải 401) thì trang báo lỗi chung và ở lại; người dùng thử lại bằng mật khẩu cũ sẽ bị báo sai. Ô "Khách sẽ thấy:" trống (không hiện "Chưa có thông tin liên hệ") khi link Zalo/Facebook không bắt đầu `https://`.
- Phiên chính chạy lại: `node --test` thư mục nháp 194/194; `npm run test:components` 40/40 (bản chính); `npm run lint`, `npm run build` qua; `package.json` nháp chỉ đổi dòng `test:components`; `main-files.mjs check`: không file chính nào bị đổi.

## Giả định hoặc câu hỏi cho chủ dự án

Quyết định của chủ dự án (29/10/2026): Q1–Q7 theo đề xuất A (bảng chữ giao diện, menu chỉ trang đã làm, footer liên hệ Boss ở trang công khai, trang đang xây + 404, dòng tòa chỉ đọc, lỗi lúc mở app có "Thử lại", có "Đăng xuất" ở trang buộc đổi mật khẩu); Q8: người đã đăng nhập mở `/dang-nhap?next=` thì tới `next` nếu hợp lệ và đúng vai trò.

Giả định: A1–A18 trong `PLAN.md` §3 (gồm bảng chữ giao diện A16), quyết định kỹ thuật T1–T5.

Đã chép vào file chính 29/10/2026 bằng apply-draft.mjs: 37 file. Bước chuyển thư mục vào `approved/` bị Windows chặn (EPERM: dev server Vite cổng 5173 giữ thư mục); chủ dự án cho phép tắt server, rồi thư mục được chuyển bằng `fs.renameSync`.

Kiểm trên file chính 29/10/2026: `npm run lint`, `npm run build` qua; `npm run test:components` 233/234 (test cũ của FE-LOGIN-06 đòi `form-fields.test.mjs` đứng cuối script), sửa bằng bản nháp `2026-10-29-FE-LOGIN-06-test-fix` → 234/234. Đăng nhập thật với API đang chạy: quản lý 1 → `/ql` (CG01, DD01); Boss → `/ql` (3 tòa); người thuê có cờ → `/doi-mat-khau`, tải lại vẫn giữ phiên; người thuê bị khóa → "Tài khoản đã bị khóa. Liên hệ quản lý.".
