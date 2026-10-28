# PLAN – FE-LOGIN-06: các thành phần biểu mẫu trong bộ kit

Feature: `docs/phase-1-foundation/feature_p1-3-frontend-form-kit.md` · Spec: KIT-01, KIT-05, KIT-07, KIT-09, UI-05, UI-07, UI-08 · Gốc: 177eb86

## 1. Mục tiêu và phạm vi

**Trong phạm vi (FE-LOGIN-06):** thêm vào bộ kit `src/components/` năm thành phần mà Phần 4 (trang đăng nhập, đổi mật khẩu, quên mật khẩu, tài khoản) cần: `TextField`, `PasswordField` (nút "Hiện"/"Ẩn"), `Checkbox`, `FormError`, `Spinner`. Style bằng token của `rooms.css` trong `.rooms-theme`, export từ `index.ts`, có mẫu trong `/components.html`, có test Node vì có logic (nối nhãn/lỗi, bật tắt mật khẩu) (KIT-07). Mỗi ô có `<label>`, viền focus rõ, chữ lỗi nối bằng `aria-describedby` (UI-08).

**Ngoài phạm vi:**
- Kiểm tra dữ liệu (số điện thoại 10 số, mật khẩu ≥ 8), react-hook-form + zod, gắn `ApiError.fields` vào ô: thuộc Phần 4 (FE-LOGIN-07, 12, 13). Thành phần ở đây chỉ hiển thị chữ lỗi được truyền vào (KIT-03: không có logic nghiệp vụ).
- Nút: dùng `RoomsButton` có sẵn, không tạo nút mới.
- Ảnh tham chiếu `Artifacts/layout_rooms/2026-10-26-stitch-mockups/2026-10-28-auth-layouts/ref/` còn CHỜ DUYỆT: **không dùng**. Chỉ dựng theo spec và bộ kit hiện có.
- Bỏ qua có chủ ý (không ai yêu cầu): dòng gợi ý `hint`, dấu `*` bắt buộc, `className` cho khung ngoài, kiểu cho placeholder. Trang cần gợi ý thì tự render `<p id>` và truyền `aria-describedby` (được giữ lại, xem hợp đồng).
- `docs/spec/31-ui-kit.md` (dòng "14 Node tests", và KIT-09 thêm màu lỗi mới theo quyết định D1) nằm ngoài vùng nháp FE: phiên chính cập nhật sau, bằng bản nháp trong `Artifacts/` hoặc "sửa lúc chép" khi chủ dự án đồng ý.

## 2. Kiến trúc

```
                         rooms.css (token + lớp .rooms-field*, .rooms-checkbox,
                              ▲     .rooms-form-error, .rooms-spinner, .rooms-visually-hidden,
                              │     token mới --rooms-error)
  FormFields.tsx ─────────────┘
   TextField ◄── PasswordField (dùng chung khung nhãn/lỗi, thêm nút Hiện/Ẩn)
   Checkbox · FormError · Spinner
        │ export
        ▼
  index.ts ──► pages/ComponentPreview.tsx  (mục 10 "Biểu mẫu" trong /components.html)
        │
        └──► (Phần 4, sau này) LoginPage, ChangePasswordPage…:
               {...register('phone')} ─► TextField / PasswordField / Checkbox  (ref, name, onChange, onBlur tới <input>)
               ApiError.message ─► FormError        isSubmitting ─► <RoomsButton disabled><Spinner label=…/>…</RoomsButton>

  tests/form-fields.test.mjs ── transpile (typescript) + shim react (useState, useId) ──► FormFields.tsx
```

### File thêm / sửa

Mọi file nháp nằm trong `Source/frontend/artifact_FE/2026-10-28-FE-LOGIN-06/` (viết tắt `<nháp>/`), đường dẫn bên trong giống `Source/frontend/`. File "Sửa" phải chép từ bản chính hiện tại (đang trùng commit Gốc 177eb86) rồi mới sửa.

| Đích (`Source/frontend/…`) | Bản nháp | Thêm/Sửa | Mục đích | CP |
|---|---|---|---|---|
| `src/components/FormFields.tsx` | `<nháp>/src/components/FormFields.tsx` | Thêm | 5 thành phần (một file, giống `effects.tsx` gom 3 thành phần) | CP-1 |
| `src/components/rooms.css` | `<nháp>/src/components/rooms.css` | Sửa | token `--rooms-error`, lớp mới, focus cho `input`, nét 500 cho chữ nhỏ | CP-1 |
| `src/components/index.ts` | `<nháp>/src/components/index.ts` | Sửa | export 5 thành phần + kiểu props | CP-1 |
| `package.json` | `<nháp>/package.json` | Sửa | thêm `tests/form-fields.test.mjs` vào cuối script `test:components` (chỉ sửa dòng đó) | CP-1 |
| `tests/form-fields.test.mjs` | `<nháp>/tests/form-fields.test.mjs` | Thêm | test Node (tester viết) | CP-1 |
| `src/pages/ComponentPreview.tsx` | `<nháp>/src/pages/ComponentPreview.tsx` | Sửa | mục "Biểu mẫu", số mục footer 10 → 11, "15 component" → "20 component" | CP-2 |
| `src/component-preview.css` | `<nháp>/src/component-preview.css` | Sửa | 1–2 luật bố cục `.preview-form` | CP-2 |
| `src/components/README.md` | `<nháp>/src/components/README.md` | Sửa | 15 → 20 component, dòng bản đồ tệp, dòng props, số test | CP-2 |
| — (không chép) | `<nháp>/preview.html` | chỉ nháp | xem thử trong vùng nháp | CP-2 |
| — (không chép) | `<nháp>/REVIEW.md` | chỉ nháp | điền bảng file, cách xem, giả định | CP-2 |

**Cảnh báo cho coder:** `apply-draft.mjs` chép **mọi** file trong thư mục nháp, trừ `REVIEW.md`, `PLAN.md`, `ref/` và `preview.html`. Không tạo file phụ nào khác (không `preview-entry.tsx`, không `tsconfig*.json`, không bản sao `Button.tsx`…), vì chúng sẽ bị chép vào bản chính. Mã chạy thử phải nằm inline trong `preview.html`; cấu hình kiểm tra kiểu đặt ngoài repo (scratchpad).

### Hợp đồng thành phần (`src/components/FormFields.tsx`)

Chỉ chữ ký và DOM bắt buộc; phần thân do coder viết. Được có hàm/thành phần nội bộ không export để dùng chung khung nhãn/lỗi.

```ts
import type { ComponentProps, ReactNode } from 'react'

export type TextFieldProps = ComponentProps<'input'> & { label: string; error?: string }
export function TextField(props: TextFieldProps)

export type PasswordFieldProps = Omit<TextFieldProps, 'type'>
export function PasswordField(props: PasswordFieldProps)

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & { label: string; error?: string }
export function Checkbox(props: CheckboxProps)

export function FormError(props: { children?: ReactNode })
export function Spinner(props: { label: string })
```

`index.ts` thêm: `export { TextField, PasswordField, Checkbox, FormError, Spinner } from './FormFields'` và `export type { TextFieldProps, PasswordFieldProps, CheckboxProps } from './FormFields'`.

**TextField** – DOM:
```
<div class="rooms-field">
  <label class="rooms-field-label" for={id}>{label}</label>
  <div class="rooms-field-control">
    <input {...rest} id={id} class="rooms-field-input {className}" aria-invalid aria-describedby />
  </div>
  {error && <p class="rooms-field-error" id="{id}-error">{error}</p>}
</div>
```
- `id` = `props.id` nếu có, không thì `useId()`. Id chữ lỗi luôn là `` `${id}-error` ``.
- Mọi prop HTML còn lại (`name`, `type`, `inputMode`, `autoComplete`, `required`, `disabled`, `value`, `onChange`, `onBlur`, `ref`…) đi thẳng vào `<input>`. `ref` (prop thường trong React 19) phải tới đúng `<input>` để `{...register('phone')}` của react-hook-form chạy.
- `className` của bên gọi nối sau `rooms-field-input` (giống `RoomsButton`), không thay thế.
- `error` khác rỗng: `aria-invalid={true}`, render chữ lỗi. `error` là `undefined` hoặc `''`: không có `aria-invalid`, không render chữ lỗi.
- `aria-describedby` = `aria-describedby` của bên gọi (nếu có) + `` `${id}-error` `` (nếu có lỗi), nối bằng dấu cách; không còn gì thì bỏ hẳn thuộc tính (không để chuỗi rỗng). `aria-invalid`, `aria-describedby`, `id` tính toán đặt **sau** `{...rest}`.
- Chữ lỗi không dùng `role="alert"` (tránh đọc dồn khi nhiều ô lỗi; react-hook-form focus ô lỗi đầu tiên, trình đọc màn hình đọc `aria-describedby`).

**PasswordField** – như TextField, thêm:
- State nội bộ `visible` (mặc định `false`). `<input type={visible ? 'text' : 'password'}>`.
- Luôn đặt `spellCheck={false}` và `autoCapitalize="none"` trên input (khi hiện mật khẩu dạng `text`, không để bộ kiểm tra chính tả hay bàn phím di động đọc/sửa mật khẩu). `autoComplete` do bên gọi truyền (`current-password` / `new-password`).
- Trong `.rooms-field-control`, sau input: `<button type="button" class="rooms-field-toggle" aria-controls={id} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} disabled={props.disabled}>{visible ? 'Ẩn' : 'Hiện'}</button>`. Bấm: đảo `visible`, không đổi giá trị ô, focus ở lại nút. `type="button"` để không gửi form.

**Checkbox** – DOM:
```
<div class="rooms-checkbox">
  <label><input {...rest} type="checkbox" id={id} aria-invalid aria-describedby /><span>{label}</span></label>
  {error && <p class="rooms-field-error" id="{id}-error">{error}</p>}
</div>
```
Quy tắc `id`, `ref`, `aria-invalid`, `aria-describedby` giống TextField.

**FormError** – `children` là `undefined`, `null`, `false` hoặc `''`: trả `null`. Ngược lại: `<div class="rooms-form-error" role="alert">{children}</div>` (div để chứa được liên kết, vd liên hệ quản lý ở AUTH-02).

**Spinner** – `<span class="rooms-spinner" role="status">` gồm vòng xoay `aria-hidden="true"` và `<span class="rooms-visually-hidden">{label}</span>`. `label` bắt buộc (không tự đặt câu chữ mặc định); dùng được bên trong `RoomsButton`.

### Hợp đồng CSS (`rooms.css`, thêm vào, không đổi luật cũ trừ hai chỗ nêu rõ)

- Token mới trong `.rooms-theme`: `--rooms-error: #9b2c1f;` (quyết định D1 của chủ dự án; tương phản ≈ 6,8 trên `--rooms-sand`, ≈ 7,1 trên `--rooms-paper`, ≈ 6,2 trên `#efe8d4`).
- `.rooms-field`: lưới dọc, `gap` 8px, rộng 100%, `min-width: 0`.
- `.rooms-field-label`: 13px, nét 600, màu `--rooms-text`, không viết hoa.
- `.rooms-field-input`: rộng 100%, `min-height: 50px` (bằng `RoomsButton`), nền `--rooms-paper`, chữ `--rooms-text`, viền 1px `--rooms-ink`, `border-radius: 2px`, padding ngang khoảng 16px (quyết định D2 của chủ dự án). Viền phải đạt ≥ 3:1 so với nền (WCAG 1.4.11). `[aria-invalid='true']` → `border-color: var(--rooms-error)`. `:disabled` → mờ đi, `cursor: not-allowed`.
- Focus: thêm `input` vào luật `:focus-visible` dùng chung (dòng 23 hiện tại) hoặc viết luật riêng; kết quả bắt buộc: ô nhập và checkbox có `outline` 3px `--rooms-gold` khi focus bàn phím; ô nhập dùng `outline-offset` ≤ 3px.
- `.rooms-field-control`: `position: relative`. Với PasswordField: `.rooms-field-toggle` nằm trong mép phải ô, vùng bấm ≥ 44 × 44px, nền trong suốt, chữ 12–13px nét 600 màu `--rooms-text`; input có `padding-right` đủ để chữ gõ không chui dưới nút.
- `.rooms-field-error`: 12px, nét 600, màu `--rooms-error`, `overflow-wrap: anywhere`.
- `.rooms-checkbox label`: `inline-flex`, căn giữa, `gap` ~10px, `min-height: 44px`, con trỏ tay; ô checkbox ~18px, `accent-color: var(--rooms-ink)`; chữ nhãn 13px nét 500 (thêm vào nhóm luật `font-weight: 500` cuối file, KIT-09).
- `.rooms-form-error`: khối có viền trái 3px `--rooms-error`, nền `--rooms-paper`, chữ `--rooms-error` 13px nét 600, padding ~12px 16px.
- `.rooms-spinner`: vòng tròn 1em, viền 2px `currentColor` khuyết một cạnh, `@keyframes rooms-spin` xoay tròn liên tục. Không cần luật giảm chuyển động riêng: luật `prefers-reduced-motion` có sẵn đã đặt `animation-duration: 0s` → vòng đứng yên nhưng vẫn hiện.
- `.rooms-visually-hidden`: mẫu ẩn chuẩn (position absolute, 1px, `clip-path: inset(50%)`, `white-space: nowrap`, `overflow: hidden`).
- `@media (max-width: 680px)`: `.rooms-field-input { font-size: 16px; }` (tránh iOS phóng to, giống `.rooms-search select`).

### Hợp đồng trang xem thử (`ComponentPreview.tsx`)

- `sections`: chèn `['form', 'Biểu mẫu']` ngay trước `['footer', 'Footer']`. `<Sample id="form" number="10" name="Biểu mẫu" …>` đặt trước Sample footer; Sample footer đổi `number="11"`. Intro: `15 component` → `20 component`. Import 5 thành phần từ `'../components'`.
- Nội dung mẫu (dữ liệu minh họa, không kiểm tra thật, không gọi API):
  - Form demo `<form className="preview-form" noValidate>`: `FormError`, `TextField` "Số điện thoại" (`type="tel"`, `inputMode="numeric"`, `autoComplete="tel"`), `PasswordField` "Mật khẩu" (`autoComplete="current-password"`), `Checkbox` "Ghi nhớ đăng nhập", `RoomsButton type="submit"` "Đăng nhập". Gửi form: `preventDefault`, nút `disabled` + `<Spinner label="Đang đăng nhập" />` ~1,2 giây, rồi `FormError` hiện "Số điện thoại hoặc mật khẩu không đúng" (chữ của AUTH-01) và `setFeedback` báo đây là bản xem thử, chưa gọi API. Hẹn giờ phải được dọn khi unmount; đang gửi thì không gửi lần hai.
  - Hàng trạng thái: một `TextField` có `error="Số điện thoại gồm 10 chữ số, bắt đầu bằng 0"` (lấy từ FE-LOGIN-12, chỉ để minh họa), một `TextField` `disabled`, một `Spinner label="Đang tải"` đứng riêng.
  - `hint` của Sample: "TextField · PasswordField · Checkbox · FormError · Spinner · Nhãn, chữ lỗi và viền focus cho bàn phím."
  - `code` của Sample: ví dụ dùng với react-hook-form, để Phần 4 làm theo:
    ```
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormError>{apiError?.message}</FormError>
      <TextField label="Số điện thoại" type="tel" autoComplete="tel" {...register("phone")} error={errors.phone?.message} />
      <PasswordField label="Mật khẩu" autoComplete="current-password" {...register("password")} error={errors.password?.message} />
      <Checkbox label="Ghi nhớ đăng nhập" {...register("remember")} />
      <RoomsButton type="submit" disabled={isSubmitting}>{isSubmitting && <Spinner label="Đang đăng nhập" />}Đăng nhập</RoomsButton>
    </form>
    ```
- `component-preview.css`: `.preview-form` (lưới dọc, `gap` ~22px, `max-width` ~440px) và nếu cần một luật cho hàng trạng thái. Không thêm màu mới.

### `preview.html` (chỉ trong nháp, không chép)

Đặt ở `<nháp>/preview.html`. Cùng thẻ font như `components.html`, `lang="vi"`. Một `<script type="module">` **inline** (JS thuần, dùng `createElement`, không JSX) import:
`react`, `react-dom/client`, `./src/components/rooms.css` (bản nháp), `./src/components/FormFields.tsx` (bản nháp), `/src/components/Button.tsx` (bản chính, cho `RoomsButton`).
Render trong `<div class="rooms-theme">` đủ các trạng thái như mục "Biểu mẫu" ở trên (form demo có bấm gửi, ô lỗi, ô disabled, spinner). Không import `./src/components/index.ts` hay `./src/pages/ComponentPreview.tsx` của nháp: chúng trỏ tới file kit không có trong thư mục nháp. Mục "Biểu mẫu" thật trong `/components.html` chỉ xem được sau khi chép (bước Done when của feature).

### Kiểm tra kiểu cho bản nháp (dùng ở CP-1 và CP-2)

`npm run build` chỉ kiểm `src/` bản chính, nên tester tạo một tsconfig tạm **ngoài repo** (scratchpad của agent), ví dụ `<scratchpad>/tsconfig.draft.json`:
```json
{
  "extends": "D:/Rooms/Source/frontend/tsconfig.app.json",
  "compilerOptions": {
    "types": [],
    "noUncheckedSideEffectImports": false,
    "rootDirs": ["D:/Rooms/Source/frontend/src", "D:/Rooms/Source/frontend/artifact_FE/2026-10-28-FE-LOGIN-06/src"]
  },
  "include": [],
  "files": ["D:/Rooms/Source/frontend/artifact_FE/2026-10-28-FE-LOGIN-06/src/components/index.ts"]
}
```
(CP-2 thêm `.../2026-10-28-FE-LOGIN-06/src/pages/ComponentPreview.tsx` vào `files`.) `rootDirs` cho `./Button`, `../shared/formatters`… trong file nháp rơi về bản chính. Chạy trong `D:\Rooms\Source\frontend`: `npx tsc -p <scratchpad>/tsconfig.draft.json` → không in gì, mã thoát 0. (`rootDirs` chỉ đặt được trong tsconfig, không có cờ dòng lệnh ở TS 6.0.3.)

## 3. Câu hỏi bỏ ngỏ

Không còn câu hỏi bỏ ngỏ.

**Quyết định của chủ dự án (28/10/2026)** (ghi vào REVIEW.md là quyết định của chủ dự án, không phải giả định):
- D1. Màu báo lỗi (Q1-A): thêm token `--rooms-error: #9b2c1f`.
- D2. Kiểu ô nhập (Q2-A): ô viền đủ 4 cạnh 1px `--rooms-ink`, nền `--rooms-paper`, cao 50px như `RoomsButton`.

**[ASSUMPTION] dùng trong plan** (ghi vào REVIEW.md, mục "Giả định hoặc câu hỏi cho chủ dự án"):
- A1. Năm thành phần chung một file `FormFields.tsx` (cách gom như `effects.tsx`), thay vì năm file.
- A2. Tên đọc cho trình đọc màn hình của nút bật tắt: "Hiện mật khẩu" / "Ẩn mật khẩu"; chữ hiển thị vẫn "Hiện" / "Ẩn" như task ghi.
- A3. `Spinner` bắt buộc truyền `label`, không có câu mặc định.
- A4. Chữ trong mẫu xem thử lấy từ spec (AUTH-01, FE-LOGIN-12) chỉ để minh họa; thành phần không kiểm tra dữ liệu.

## 4. Checkpoints

Lệnh chạy trong `D:\Rooms\Source\frontend` (PowerShell). `<nháp>` = `artifact_FE/2026-10-28-FE-LOGIN-06`.
Không có API, quyền, tòa nhà, người thuê, tiền hay ngày ở phần này, nên không có kịch bản quyền/phạm vi/múi giờ `Asia/Ho_Chi_Minh`; thay bằng biên dữ liệu và xung đột trạng thái (disabled, đang gửi, lỗi rỗng).

### CP-1 – Năm thành phần, CSS, export, test

- **Task:** FE-LOGIN-06 (phần thành phần) · KIT-07, KIT-09, UI-08
- **File (coder):** `<nháp>/src/components/FormFields.tsx`, `<nháp>/src/components/rooms.css`, `<nháp>/src/components/index.ts`, `<nháp>/package.json`
- **File (tester):** `<nháp>/tests/form-fields.test.mjs`: cùng cách với `tests/interaction.test.mjs` (đọc `../src/components/FormFields.tsx` tương đối theo file test, `ts.transpileModule`, shim `react` có `useState` và `useId` trả id tăng dần đoán trước được (`r0`, `r1`, …), `react/jsx-runtime` trả `{type, props}`). Loader phải gọi đệ quy các node có `type` là function (thành phần con nội bộ) và chọn export theo tên. Tên test bắt đầu bằng mã spec (vd `UI-08: …`).
- **Done when:**
  - `node --test artifact_FE/2026-10-28-FE-LOGIN-06/tests/form-fields.test.mjs` → mọi test `pass`, `fail 0`.
  - `npx eslint artifact_FE/2026-10-28-FE-LOGIN-06` → không lỗi.
  - `npx tsc -p <scratchpad>/tsconfig.draft.json` (files: index.ts nháp) → không in gì, mã thoát 0.
  - `npm run test:components` → 14/14 pass (bản chính chưa đổi).
  - `git diff --no-index src/components/rooms.css artifact_FE/2026-10-28-FE-LOGIN-06/src/components/rooms.css` chỉ có phần thêm theo hợp đồng CSS (+ `input` trong luật focus, + lớp mới trong nhóm nét 500); `git diff --no-index package.json artifact_FE/2026-10-28-FE-LOGIN-06/package.json` chỉ đổi đúng dòng `test:components`.
- **Kịch bản test:**
  - [UI-08] Đường chính: `TextField label="Số điện thoại"` → `<label htmlFor>` bằng `id` của `<input>`, id không rỗng; không lỗi thì input không có `aria-invalid`, không có `aria-describedby`, không có `.rooms-field-error`.
  - [UI-08] Có `error="Số điện thoại gồm 10 chữ số, bắt đầu bằng 0"` → `aria-invalid === true`, `aria-describedby` chứa `${id}-error`, phần tử có id đó chứa đúng chữ lỗi, không có `role="alert"`.
  - [UI-08] Biên: `error=""` và `error={undefined}` → giống không lỗi (không `aria-invalid`, không chữ lỗi, không `aria-describedby` rỗng).
  - [UI-08] Bên gọi truyền `id="phone"` → `htmlFor === 'phone'`, chữ lỗi có id `phone-error`. Bên gọi truyền `aria-describedby="phone-note"` + có lỗi → `"phone-note phone-error"`; không lỗi → `"phone-note"`.
  - [UI-08] Hai `TextField` không truyền id trong cùng một lần render → hai id khác nhau.
  - [UI-05, react-hook-form] `name`, `type="tel"`, `inputMode`, `autoComplete`, `required`, `disabled`, `onChange`, `onBlur`, `ref` truyền vào đều có trên `<input>`; `className="x"` → class input là `rooms-field-input x` (không mất class kit).
  - [UI-08] `PasswordField`: ban đầu input `type="password"`, `spellCheck === false`, `autoCapitalize === 'none'`; nút `type="button"`, chữ "Hiện", `aria-label="Hiện mật khẩu"`, `aria-controls` = id input. Gọi `onClick` rồi render lại → `type="text"`, chữ "Ẩn", `aria-label="Ẩn mật khẩu"`, `spellCheck` vẫn `false`. Bấm lần nữa → về `password`.
  - [UI-08] `PasswordField` có `error` → nối nhãn/lỗi giống TextField. `PasswordField disabled` → nút bật tắt cũng `disabled`.
  - [UI-08] `Checkbox label="Ghi nhớ đăng nhập"`: input `type="checkbox"` nằm trong `<label>` có chữ nhãn; `checked`, `onChange`, `name`, `ref` tới input; có `error` → `aria-invalid` + `aria-describedby` trỏ đúng chữ lỗi.
  - [UI-05] `FormError` với `undefined`, `null`, `false`, `''` → trả `null`. Với "Số điện thoại hoặc mật khẩu không đúng" (AUTH-01) → `role="alert"`, class `rooms-form-error`, chứa đúng chữ.
  - [UI-08] `Spinner label="Đang tải"` → phần tử `role="status"` chứa chữ "Đang tải" không nằm trong nhánh `aria-hidden`.
  - [KIT-07] `index.ts` nháp export đủ `TextField`, `PasswordField`, `Checkbox`, `FormError`, `Spinner` (được tsc ở Done when bao phủ; test có thể đọc file và so tên).
  - [KIT-09] Tính tương phản (công thức WCAG, ghi kết quả vào báo cáo): `--rooms-error` trên `#f8f2e6`, `#fcf8ee`, `#efe8d4` ≥ 4,5; viền ô nhập trên `#f8f2e6` và `#fcf8ee` ≥ 3; `--rooms-gold` (viền focus) trên `#f8f2e6` ≥ 3.

### CP-2 – Mẫu trong trang xem thử, README, xem thử trong nháp

- **Task:** FE-LOGIN-06 (mẫu xem thử, tài liệu kit) · KIT-01, KIT-05, KIT-07, UI-07, UI-08
- **File (coder):** `<nháp>/src/pages/ComponentPreview.tsx`, `<nháp>/src/component-preview.css`, `<nháp>/src/components/README.md`, `<nháp>/preview.html`, `<nháp>/REVIEW.md` (điền bảng "File sẽ thêm / sửa / xóa" theo bảng ở mục 2, "Cách xem và kiểm tra" theo Done when bên dưới, "Giả định hoặc câu hỏi cho chủ dự án": D1–D2 ghi là quyết định của chủ dự án ngày 28/10/2026, A1–A4 ghi là giả định).
- README: "15 component" → "20 component"; thêm dòng bản đồ tệp `src/components/FormFields.tsx` và `tests/form-fields.test.mjs`; thêm 5 dòng bảng props theo hợp đồng; dòng bản đồ tệp `tests/*.test.mjs` ghi số test thật sau khi thêm (14 + số test của CP-1). Không sửa các đoạn lịch sử (đợt rà soát 25/10).
- **Done when:**
  - `npx tsc -p <scratchpad>/tsconfig.draft.json` (files: index.ts + ComponentPreview.tsx nháp) → mã thoát 0.
  - `npm run lint` → không lỗi.
  - `node --test artifact_FE/2026-10-28-FE-LOGIN-06/tests/form-fields.test.mjs` vẫn pass.
  - `npm run dev`, mở `http://localhost:5173/artifact_FE/2026-10-28-FE-LOGIN-06/preview.html` → đủ 5 thành phần, không lỗi console.
  - `git diff --no-index src/pages/ComponentPreview.tsx artifact_FE/2026-10-28-FE-LOGIN-06/src/pages/ComponentPreview.tsx` chỉ có: import, mục `sections`, Sample "Biểu mẫu", state/hẹn giờ của form demo, số footer 11, "20 component".
  - Thư mục nháp không có file nào ngoài bảng ở mục 2 (+ `PLAN.md`).
- **Kịch bản test** (trên `preview.html`; phần nào không làm được bằng công cụ hiện có thì ghi "kiểm tay" vào báo cáo):
  - [UI-08] Bấm vào chữ nhãn "Số điện thoại" → con trỏ vào đúng ô. Bấm chữ "Ghi nhớ đăng nhập" → checkbox đổi trạng thái.
  - [UI-08, KIT-05] Tab qua form: thứ tự ô điện thoại → ô mật khẩu → nút "Hiện" → checkbox → nút "Đăng nhập"; mỗi điểm có viền focus vàng nhìn thấy rõ; Space đổi checkbox.
  - [UI-08] Gõ mật khẩu, bấm "Hiện" (chuột, Enter, Space) → chữ hiện, nút thành "Ẩn", giá trị giữ nguyên, focus ở nút, form **không** gửi. Enter trong ô nhập → form gửi.
  - [KIT-05] Gửi form → nút `disabled` có spinner xoay; bấm tiếp trong lúc chờ → không gửi lần hai; sau ~1,2 giây hiện "Số điện thoại hoặc mật khẩu không đúng" trong `FormError`.
  - [KIT-05] Bật giảm chuyển động (DevTools → Rendering → `prefers-reduced-motion: reduce`) → spinner đứng yên nhưng vẫn hiện, không lỗi.
  - [UI-07, KIT-05] Khung 360px: `document.documentElement.scrollWidth <= 360`; ô nhập rộng hết khung; chữ ô nhập 16px; nút "Hiện" ≥ 44 × 44px; hàng checkbox cao ≥ 44px; chữ lỗi rất dài (vd 200 ký tự không dấu cách) xuống dòng, không tràn ngang; mật khẩu dài không chui dưới nút "Hiện".
  - [UI-08] Ô có lỗi: viền màu lỗi + chữ lỗi bên dưới (không chỉ dựa vào màu). Ô `disabled`: không gõ được, nhìn khác ô thường.
  - [KIT-01] Mọi thành phần chỉ có style khi nằm trong `.rooms-theme` (token lấy từ `.rooms-theme`); không thêm font, không thêm framework CSS.
  - [KIT-04 / G-03] Mọi chữ hiển thị và `aria-label` là tiếng Việt.

### Sau khi chủ dự án duyệt (phiên chính, không phải tester)

Chép bằng `apply-draft.mjs`, rồi trên bản chính: `npm run test:components` (14 + số test mới, tất cả pass), `npm run build`, `npm run lint` đều qua; mở `/components.html` thấy mục "10 / Biểu mẫu" với đủ 5 thành phần. Đây là "Done when" của FE-LOGIN-06 trong file feature. Sau đó cập nhật `docs/spec/31-ui-kit.md` (số test; màu lỗi `--rooms-error` theo quyết định D1) theo quy trình nháp.
