# FE-LOGIN-06: ô nhập, ô mật khẩu, checkbox, báo lỗi, spinner trong bộ kit

Trạng thái: ĐÃ DUYỆT 28/10/2026 (chủ dự án: "Đồng ý, duyệt bản nháp FE-LOGIN-06 như hiện tại, chép vào file chính." – giữ viền trái 3px của `.rooms-form-error`)
Task / spec: FE-LOGIN-06 (`docs/phase-1-foundation/feature_p1-3-frontend-form-kit.md`) · KIT-01, KIT-05, KIT-07, KIT-09, UI-05, UI-07, UI-08
Gốc: 177eb86

## Làm gì, vì sao

Bộ kit `src/components/` chưa có các ô nhập mà trang đăng nhập và đổi mật khẩu (Phần 4) cần. Bản nháp thêm `TextField`, `PasswordField` (nút "Hiện"/"Ẩn"), `Checkbox`, `FormError`, `Spinner`, dùng token của `rooms.css`, xuất từ `index.ts` và có mẫu "10 / Biểu mẫu" trong trang xem bộ kit (KIT-07). Mỗi ô có `<label>`, viền focus vàng khi dùng bàn phím, chữ báo lỗi nối bằng `aria-describedby` (UI-08). Thành phần chỉ hiển thị chữ lỗi được truyền vào; kiểm tra dữ liệu (react-hook-form + zod) thuộc Phần 4.

Thiết kế chi tiết: `PLAN.md` trong thư mục này.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích (`Source/frontend/…`) | Thêm / Sửa / Xóa |
|---|---|---|
| `src/components/FormFields.tsx` | `src/components/FormFields.tsx` | Thêm: 5 thành phần |
| `src/components/rooms.css` | `src/components/rooms.css` | Sửa: token `--rooms-error`, lớp `.rooms-field*`, `.rooms-checkbox`, `.rooms-form-error`, `.rooms-spinner`, `.rooms-visually-hidden`; thêm `input` vào luật focus |
| `src/components/index.ts` | `src/components/index.ts` | Sửa: export 5 thành phần và kiểu props |
| `src/components/README.md` | `src/components/README.md` | Sửa: 15 → 20 component, bản đồ tệp, bảng props, số test |
| `src/pages/ComponentPreview.tsx` | `src/pages/ComponentPreview.tsx` | Sửa: mục "10 / Biểu mẫu", footer thành mục 11 |
| `src/component-preview.css` | `src/component-preview.css` | Sửa: bố cục `.preview-form` |
| `tests/form-fields.test.mjs` | `tests/form-fields.test.mjs` | Thêm: test Node của 5 thành phần |
| `package.json` | `package.json` | Sửa: thêm `tests/form-fields.test.mjs` vào script `test:components` |

Không chép: `PLAN.md`, `REVIEW.md`, `preview.html`.

## Cách xem và kiểm tra

Trong `Source/frontend`:

- Xem thử: `npm run dev`, mở `http://localhost:5173/artifact_FE/2026-10-28-FE-LOGIN-06/preview.html` (đủ 5 thành phần, form demo bấm gửi được, ô lỗi, ô bị khóa, spinner).
- Test: `node --test artifact_FE/2026-10-28-FE-LOGIN-06/tests/form-fields.test.mjs`
- Lint: `npm run lint`
- So với bản chính: `git diff --no-index src/components/rooms.css artifact_FE/2026-10-28-FE-LOGIN-06/src/components/rooms.css` (tương tự cho các file "Sửa").
- Mục "10 / Biểu mẫu" thật trong `/components.html` chỉ xem được sau khi chép.

## Đã kiểm tra

28/10/2026, pipeline (planner → coder → tester → reviewer):

- **CP-1 PASS:** 26 test mới trong `tests/form-fields.test.mjs` (UI-08, UI-05, KIT-07, KIT-09, gồm tính tương phản WCAG); `npm run test:components` bản chính 14/14; fail-proof check đã làm.
- **CP-2 PASS** (chạy lại sau khi điền `REVIEW.md`): `preview.html` kiểm trên trình duyệt 23/23 xanh; tsc (tsconfig tạm có `rootDirs`), eslint, `npm run lint`, `npm run build` qua; fail-proof check đã làm.
- **Reviewer: DUYỆT**, không có lỗi chặn. Nên sửa:
  1. Mẫu `<RoomsButton>{isSubmitting && <Spinner …/>}Đăng nhập</RoomsButton>` (`ComponentPreview.tsx:127,133`, `README.md:92`): trình đọc màn hình đọc tên nút thành "Đang đăng nhập Đăng nhập", `role="status"` trong nút có thể không được đọc. Hướng sửa: ghi chú báo trạng thái ở vùng `role="status"` ngoài nút, hoặc quyết ở Phần 4.
  2. Spec lệch: KIT-09 (`docs/spec/31-ui-kit.md:19`) chưa có `--rooms-error`, dòng 25 còn ghi "14 Node tests" (nay 40). Hướng sửa: bản nháp trong `Artifacts/`.
- Ghi chú của reviewer: `FormError` hiện khung rỗng nếu `children` là mảng toàn `false`; `role="alert"` không đọc lại khi cùng thông báo lặp (bản xem thử đã xử lý); 2 tên test nói rộng hơn phần test kiểm.
- Phiên chính chạy lại: `node --test …/tests/form-fields.test.mjs` 26/26 pass; `npm run lint` qua; `npm run test:components` 14/14; `package.json` nháp chỉ đổi đúng dòng `test:components`; `main-files.mjs check`: không file chính nào bị đổi.
- Kiểm thiết kế tự động: `rooms.css:59` `.rooms-form-error` dùng viền trái 3px (kiểu "side-tab"); chờ chủ dự án chọn giữ hay đổi.
- Chưa kiểm (chỉ làm được sau khi chép): mục "10 / Biểu mẫu" thật trong `/components.html`, `ComponentPreview.tsx` lúc chạy (luồng gửi form, dọn hẹn giờ), `npm run build` với file mới.

## Giả định hoặc câu hỏi cho chủ dự án

Quyết định của chủ dự án (28/10/2026):

- **D1. Màu báo lỗi:** thêm token `--rooms-error: #9b2c1f` (tương phản ≈ 6,8 trên nền cát `#f8f2e6`).
- **D2. Kiểu ô nhập:** viền đủ 4 cạnh 1px `--rooms-ink`, nền `--rooms-paper`, cao 50px như `RoomsButton`.

Giả định ([ASSUMPTION]):

- **A1.** Năm thành phần chung một file `FormFields.tsx` (giống `effects.tsx` gom 3 thành phần), thay vì năm file.
- **A2.** Tên đọc cho trình đọc màn hình của nút bật tắt là "Hiện mật khẩu" / "Ẩn mật khẩu"; chữ hiển thị vẫn "Hiện" / "Ẩn" như task ghi.
- **A3.** `Spinner` bắt buộc truyền `label`, không có câu mặc định.
- **A4.** Chữ trong mẫu xem thử (AUTH-01, FE-LOGIN-12) chỉ để minh họa; thành phần không kiểm tra dữ liệu.

Việc sau khi chép (bản nháp riêng trong `Artifacts/`): thêm `--rooms-error` vào KIT-09 và cập nhật số test trong `docs/spec/31-ui-kit.md`.

Đã chép vào file chính 29/10/2026 bằng apply-draft.mjs: 8 file. Bước chuyển thư mục vào `approved/` bị Windows chặn (EPERM: dev server Vite chạy từ 27/10 giữ thư mục); chủ dự án đồng ý tắt server, rồi thư mục được chuyển bằng `fs.renameSync`.

Kiểm trên file chính 29/10/2026: `npm run test:components` 40/40, `npm run build` và `npm run lint` qua; `/components.html#form` hiện mục "10 / Biểu mẫu" đủ 5 thành phần, thử bấm "Hiện"/"Ẩn", gửi form (nút khóa + spinner, không gửi lần hai, hiện lỗi AUTH-01 với `role="alert"`), màu lỗi `#9b2c1f`, không lỗi console.
