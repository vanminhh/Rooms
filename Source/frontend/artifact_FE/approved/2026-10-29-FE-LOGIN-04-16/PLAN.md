# PLAN – FE-LOGIN-04..16: đăng nhập, định tuyến và 3 layout (frontend)

Feature: `docs/phase-1-foundation/feature_p1-4-frontend-auth.md` · Spec: AUTH-01, 02, 04, 05, 06, 07, 09, 10 · API-02, API-03 · AUTH-T1, T2 · UI-01..10 · KIT-01, 02, 03, 07, 10 · G-03, G-04 · Gốc: a5b2138

`<nháp>` = `Source/frontend/artifact_FE/2026-10-29-FE-LOGIN-04-16/`. Mọi lệnh chạy trong `D:\Rooms\Source\frontend` (PowerShell) trừ khi ghi khác.

## 1. Mục tiêu và phạm vi

**Trong phạm vi**

| Task | Nội dung | Spec |
|---|---|---|
| FE-LOGIN-04 | Thư mục `src/app`, `src/layouts`, `src/pages/{public,tenant,staff}`, `src/features/auth` (tạo bằng chính các file dưới đây, không tạo thư mục rỗng) | – |
| FE-LOGIN-05 | `src/shared/api.ts`: fetch wrapper, Bearer từ bộ nhớ, bóc `{ data }`, ném `ApiError`, 401 → refresh một lần → thử lại → đăng xuất | API-02, API-03, AUTH-T1, AUTH-T2 |
| FE-LOGIN-07 | Gắn `ApiError.fields` vào ô react-hook-form, `message` vào `FormError` | UI-05 |
| FE-LOGIN-08 | `AuthProvider`: `user` + access token trong bộ nhớ, lúc tải app gọi refresh rồi `me`; `login`, `logout`, `refreshMe` | AUTH-T1, AUTH-T2 |
| FE-LOGIN-09 | Router 3 layout + guard (chưa đăng nhập, sai vai trò, `mustChangePassword`, `/dang-nhap` khi đã đăng nhập) | AUTH-05, AUTH-06 |
| FE-LOGIN-10 | Layout dùng kit: `.rooms-theme`, `RoomsHeader`/`RoomsFooter`, font Taviraj + Manrope trong `index.html` | KIT-01, KIT-02, KIT-10 |
| FE-LOGIN-11 | Trang tạm `/thue` "Tổng quan", `/ql` "Việc hôm nay", chỉ chào theo tên | – |
| FE-LOGIN-12 | `/dang-nhap` | AUTH-01, 02, 04, 06, 10 |
| FE-LOGIN-13 | `/doi-mat-khau` | AUTH-03, AUTH-05 |
| FE-LOGIN-14 | `/quen-mat-khau` và `/quen-mat-khau?token=` | AUTH-07 |
| FE-LOGIN-15 | `/thue/tai-khoan`, `/ql/tai-khoan` | AUTH-09 |
| FE-LOGIN-16 | lint + build xanh (kiểm cuối) | – |

**Ngoài phạm vi**
- Nội dung thật của Tổng quan / Việc hôm nay, mọi trang khác, bộ chọn tòa có tác dụng lọc, bottom nav / side nav thật (chỉ "nav placeholders").
- Ảnh tham chiếu `Artifacts/layout_rooms/2026-10-26-stitch-mockups/2026-10-28-auth-layouts/ref/` (CHỜ DUYỆT): **không dùng**. Dựng từ spec và kit hiện có.
- Không thêm package. Không sửa `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`.
- Không chạy backend, không đụng DB dev, không đọc `Source/backend/.env`. Mọi kiểm tra dùng fetch giả (mock). Kiểm tay với 3 tài khoản seed trên API thật ("Done when" của FE-LOGIN-09) do **phiên chính** làm sau khi chủ dự án duyệt, không phải checkpoint.
- `REVIEW.md` do phiên chính giữ: không checkpoint nào giao cho coder/tester sửa nó, không checkpoint nào trượt vì nó chưa điền.

## 2. Kiến trúc

```
index.html (font KIT-02) ─► src/main.tsx ─► <AppProviders> ─► <RouterProvider router=createBrowserRouter(routes)>
                                               │  QueryClientProvider (TanStack Query)
                                               │  AuthProvider ── auth-context (useAuth)
                                               │       │ boot: refreshAccessToken() → getMe()
                                               │       ▼
src/shared/api.ts ◄──── src/features/auth/api.ts (login, me, refresh, logout, change/forgot/reset, updateMe, publicContact)
  fetch /api/v1/*  credentials:'include', Bearer (bộ nhớ), {data} / ApiError, 401→refresh 1 lần→retry
  (Vite proxy /api → :3000; cookie rt path /api/v1/auth)

routes.tsx
 ├─ PublicLayout (RoomsHeader "Đăng nhập" | "Trang của tôi", RoomsFooter + ContactInfo Boss ← usePublicContact)
 │    ├─ /, /phong               → PlaceholderPage "Trang đang được xây dựng" (Q4-A)
 │    ├─ *                       → NotFoundPage "Không tìm thấy trang" + "Về trang chủ" (Q4-A)
 │    ├─ GuestOnly ─ /dang-nhap  → LoginPage (ContactInfo ← usePublicContact)
 │    ├─ /quen-mat-khau          → ForgotPasswordPage (2 chế độ theo ?token)
 │    └─ RequireAuth('any') ─ /doi-mat-khau → ChangePasswordPage (ChangePasswordForm)
 ├─ /thue  RequireAuth(['TENANT'])         ─ TenantLayout (không footer) ─ index: TenantHomePage · tai-khoan: TenantAccountPage
 └─ /ql    RequireAuth(['MANAGER','BOSS']) ─ StaffLayout  (không footer, dòng tòa chỉ đọc) ─ index: StaffHomePage · tai-khoan: StaffAccountPage
                                                     (ChangePasswordForm + ProfileForm)
RequireAuth: status 'loading' → Spinner; 'error' → "Không tải được phiên đăng nhập." + "Thử lại" (Q6-A)
guards.ts (hàm thuần): homeOf, safeNext, postLoginPath, guardRedirect  ◄── RequireAuth / GuestOnly / LoginPage (GuestOnly + LoginPage cùng postLoginPath, T5)
internal-links.ts: bắt click <a href="/..."> trong layout → navigate() (RoomsHeader/Footer dùng <a> thường)
form-errors.ts: applyApiError(ApiError → setError từng ô + câu chung cho FormError)
```

### File thêm / sửa

File "Sửa" phải chép từ bản chính (đang trùng commit Gốc a5b2138) rồi mới sửa.

| Đích (`Source/frontend/…`) | Bản nháp | Thêm/Sửa | Mục đích | CP |
|---|---|---|---|---|
| `src/shared/api.ts` | `<nháp>/src/shared/api.ts` | Thêm | fetch wrapper, `ApiError`, refresh một luồng | CP-1 |
| `src/shared/form-errors.ts` | `<nháp>/src/shared/form-errors.ts` | Thêm | `applyApiError` (FE-LOGIN-07) | CP-1 |
| `src/features/auth/api.ts` | `<nháp>/src/features/auth/api.ts` | Thêm | kiểu `Me`, `Role`, `PublicContact` + hàm gọi từng endpoint | CP-1 |
| `tests/auth-api.test.mjs` | `<nháp>/tests/auth-api.test.mjs` | Thêm | test Node (tester viết) | CP-1 |
| `package.json` | `<nháp>/package.json` | Sửa | nối `tests/auth-api.test.mjs tests/auth-guards.test.mjs tests/auth-schemas.test.mjs tests/auth-login-flow.test.mjs` vào cuối script `test:components` (file cuối thêm ở CP-4); không đổi dòng khác | CP-1 (CP-4 thêm) |
| `src/app/auth-context.ts` | `<nháp>/src/app/auth-context.ts` | Thêm | `AuthContext`, `useAuth`, kiểu | CP-2 |
| `src/app/AuthProvider.tsx` | `<nháp>/src/app/AuthProvider.tsx` | Thêm | trạng thái đăng nhập | CP-2 |
| `src/app/guards.ts` | `<nháp>/src/app/guards.ts` | Thêm | hàm thuần chọn đường chuyển | CP-2 |
| `src/app/RequireAuth.tsx` | `<nháp>/src/app/RequireAuth.tsx` | Thêm | `RequireAuth`, `GuestOnly` | CP-2 |
| `src/app/AppProviders.tsx` | `<nháp>/src/app/AppProviders.tsx` | Thêm | `QueryClientProvider` + `AuthProvider` | CP-2 |
| `tests/auth-guards.test.mjs` | `<nháp>/tests/auth-guards.test.mjs` | Thêm | test Node (tester viết) | CP-2, CP-3 |
| `src/app/routes.tsx` | `<nháp>/src/app/routes.tsx` | Thêm | `routes: RouteObject[]` (CP-4..6 thêm route của mình) | CP-3 |
| `src/main.tsx` | `<nháp>/src/main.tsx` | Sửa | thay placeholder bằng providers + router | CP-3 |
| `index.html` | `<nháp>/index.html` | Sửa | thêm đúng 3 dòng font như `components.html` dòng 8–10 | CP-3 |
| `src/layouts/PublicLayout.tsx`, `TenantLayout.tsx`, `StaffLayout.tsx` | `<nháp>/src/layouts/…` | Thêm | 3 khung | CP-3 |
| `src/layouts/internal-links.ts` | `<nháp>/src/layouts/internal-links.ts` | Thêm | bắt click link nội bộ | CP-3 |
| `src/layouts/layouts.css` | `<nháp>/src/layouts/layouts.css` | Thêm | bố cục khung, chỉ dùng token `--rooms-*` | CP-3 |
| `src/pages/public/PlaceholderPage.tsx`, `NotFoundPage.tsx` | `<nháp>/src/pages/public/…` | Thêm | theo Q4-A | CP-3 |
| `src/features/auth/ContactInfo.tsx` | `<nháp>/src/features/auth/ContactInfo.tsx` | Thêm | hiện điện thoại, Zalo, Facebook (footer `PublicLayout` theo Q3-A, trang đăng nhập, quên mật khẩu, "Khách sẽ thấy:") | CP-3 |
| `src/features/auth/usePublicContact.ts` | `<nháp>/src/features/auth/usePublicContact.ts` | Thêm | `useQuery` `GET /public/contact` (footer + trang) | CP-3 |
| `src/features/auth/useSignOut.ts` | `<nháp>/src/features/auth/useSignOut.ts` | Thêm | hook "Đăng xuất" dùng chung: `TenantLayout`, `StaffLayout` (CP-3), `ChangePasswordPage` (CP-5) | CP-3 |
| `src/features/auth/auth.css` | `<nháp>/src/features/auth/auth.css` | Thêm | khối liên hệ (CP-3); cột form, khối báo thành công (CP-4); chỉ token `--rooms-*` | CP-3 (CP-4 thêm) |
| `tests/auth-schemas.test.mjs` | `<nháp>/tests/auth-schemas.test.mjs` | Thêm | test Node: `ContactInfo` (CP-3), schema zod thật (CP-4..6) (tester viết) | CP-3 (CP-4, 5, 6 thêm) |
| `src/pages/tenant/TenantHomePage.tsx`, `src/pages/staff/StaffHomePage.tsx` | `<nháp>/src/pages/…` | Thêm | FE-LOGIN-11 | CP-3 |
| — (không chép) | `<nháp>/preview.html` | chỉ nháp | chạy app với fetch giả | CP-3 (CP-4..6 mở rộng mock) |
| `src/features/auth/schemas.ts` | `<nháp>/src/features/auth/schemas.ts` | Thêm | zod: đăng nhập, quên, đổi, đặt lại, hồ sơ | CP-4 (CP-5, 6 thêm) |
| `src/pages/public/LoginPage.tsx` | `<nháp>/src/pages/public/LoginPage.tsx` | Thêm | FE-LOGIN-12 | CP-4 |
| `tests/auth-login-flow.test.mjs` | `<nháp>/tests/auth-login-flow.test.mjs` | Thêm | test Node luồng đăng nhập / `GuestOnly` / chuyển hướng sau đăng nhập (tester viết) | CP-4 |
| `src/features/auth/ChangePasswordForm.tsx` | `<nháp>/src/features/auth/ChangePasswordForm.tsx` | Thêm | dùng ở 3 trang | CP-5 |
| `src/pages/public/ChangePasswordPage.tsx` | `<nháp>/src/pages/public/…` | Thêm | FE-LOGIN-13 | CP-5 |
| `src/pages/public/ForgotPasswordPage.tsx` | `<nháp>/src/pages/public/…` | Thêm | FE-LOGIN-14 | CP-5 |
| `src/features/auth/ProfileForm.tsx` | `<nháp>/src/features/auth/ProfileForm.tsx` | Thêm | email (+ liên hệ cho nhân sự) | CP-6 |
| `src/pages/tenant/TenantAccountPage.tsx`, `src/pages/staff/StaffAccountPage.tsx` | `<nháp>/src/pages/…` | Thêm | FE-LOGIN-15 | CP-6 |

Không có component mới trong `src/components/` (xem A3): mọi phần mới chỉ dùng trong feature auth hoặc layout. Không sửa kit, `README.md` của kit, `ComponentPreview.tsx`.

**Cảnh báo cho coder:** `apply-draft.mjs` chép **mọi** file trong thư mục nháp trừ `REVIEW.md`, `PLAN.md`, `ref/`, `preview.html`. Không tạo file phụ (không `tsconfig*.json`, không `vite.*.config`, không bản sao file kit, không `preview-*.tsx`). Mã chạy thử nằm inline trong `preview.html`; cấu hình kiểm tra đặt ở scratchpad của agent (ngoài repo).

**Luật TypeScript của repo** (`erasableSyntaxOnly`, `verbatimModuleSyntax`): không `enum`, không parameter property trong constructor, không `namespace`; import kiểu bằng `import type`. File `.tsx` chỉ export component (luật `react-refresh/only-export-components`); hàm, hằng, context, hook đặt trong `.ts`. Lint: 0 lỗi, 0 cảnh báo mới.

### Hợp đồng API (đọc từ `auth.controller.ts`, `auth.dto.ts`, `auth.service.ts`, `settings.controller.ts`, `error-code.ts`)

Gốc URL `/api/v1`. Thành công: `{ "data": … }` (`null` khi controller trả `null`). Lỗi: `{ "error": { code, message, fields? } }`. Mọi request: `credentials: 'include'`.

| Endpoint | Body | Thành công `data` | Lỗi (HTTP · code · fields) |
|---|---|---|---|
| `POST /auth/login` | `{ phone, password, remember: boolean }` | `{ accessToken, user: Me }` + cookie `rt` | 400 `VALIDATION_FAILED` (`phone` "Số điện thoại không hợp lệ", `password` "Vui lòng nhập mật khẩu") · 401 `INVALID_CREDENTIALS` "Số điện thoại hoặc mật khẩu không đúng" · 403 `ACCOUNT_LOCKED` "Tài khoản đã bị khóa. Liên hệ quản lý." · 429 `TOO_MANY_REQUESTS` "Bạn thao tác quá nhiều lần, vui lòng thử lại sau" |
| `POST /auth/refresh` | – (cookie) | `{ accessToken }` (cookie xoay vòng) | 401 `UNAUTHENTICATED` |
| `POST /auth/logout` | – | `null` | luôn 200 |
| `GET /auth/me` | – (Bearer) | `Me` | 401 `UNAUTHENTICATED` |
| `PATCH /auth/me` | `{ email?, contactPhone?, zaloUrl?, facebookUrl? }` mỗi trường `string \| null` (`null` = xóa) | `Me` | 400 (`email` "Email không hợp lệ" / "Email đã được sử dụng", `contactPhone` "Số điện thoại không hợp lệ", `zaloUrl`/`facebookUrl` "Đường dẫn không hợp lệ", chỉ `https://`) · 403 `FORBIDDEN` (người thuê gửi trường liên hệ) · 403 `PASSWORD_CHANGE_REQUIRED` · 401 |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` | `null` | 400 (`currentPassword` "Mật khẩu hiện tại không đúng" / "Vui lòng nhập mật khẩu hiện tại", `newPassword` "Mật khẩu tối thiểu 8 ký tự" / "Mật khẩu mới phải khác mật khẩu hiện tại") · 401 |
| `POST /auth/forgot-password` | `{ phone }` | `null` (luôn 200 với số hợp lệ) | 400 (`phone`) |
| `POST /auth/reset-password` | `{ token, newPassword }` | `null` | 400 (`token` "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn", `newPassword`) |
| `GET /public/contact` | – | `{ phone, zaloUrl, facebookUrl }` (mỗi trường có thể `null`) hoặc `null` | – |

Mọi endpoint: 500 `INTERNAL_ERROR` "Có lỗi xảy ra, vui lòng thử lại sau"; trường lạ → `fields.<tên>` "Trường này không được phép gửi lên".

### Hợp đồng mã (chữ ký, không thân hàm)

**`src/shared/api.ts`**
```ts
export const API_BASE = '/api/v1'
export class ApiError extends Error {
  readonly code: string            // mã API, hoặc 'NETWORK_ERROR' khi không có phản hồi JSON
  readonly status: number          // HTTP status; 0 khi fetch ném lỗi
  readonly fields?: Record<string, string>
  constructor(init: { code: string; message: string; status: number; fields?: Record<string, string> })
}
export function setAccessToken(token: string | null): void      // chỉ giữ trong biến module, không localStorage/sessionStorage/cookie
export function setAuthHandlers(handlers: { onSignedOut?: () => void; onPasswordChangeRequired?: () => void }): void
export function refreshAccessToken(): Promise<string>              // POST /auth/refresh, lưu token mới; một luồng: gọi đồng thời dùng chung 1 promise
export function apiRequest<T>(path: string, options?: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown }): Promise<T>
```
Hành vi `apiRequest` (bắt buộc):
1. `fetch(API_BASE + path, { method, credentials: 'include', headers })`: `Accept: application/json`; có `body` thì `Content-Type: application/json` + `JSON.stringify(body)`; có token thì `Authorization: Bearer <token>`.
2. 2xx: trả `json.data`. Không phải 2xx: ném `ApiError` từ `json.error` (`code`, `message`, `fields`, `status` = HTTP status).
3. `fetch` ném lỗi hoặc thân không phải JSON có `data`/`error`: ném `ApiError { code: 'NETWORK_ERROR', status: <HTTP status hoặc 0>, message: 'Có lỗi xảy ra, vui lòng thử lại sau' }` (A13).
4. 401 **và** request vừa gửi có Bearer (không áp dụng cho `/auth/login`, `/auth/refresh`, request không token): gọi `refreshAccessToken()` đúng một lần, thử lại request đúng một lần với token mới. Refresh lỗi, hoặc lần thử lại vẫn 401: `setAccessToken(null)`, gọi `onSignedOut()`, ném `ApiError` 401.
5. 403 `PASSWORD_CHANGE_REQUIRED`: gọi `onPasswordChangeRequired()` rồi ném lỗi (AUTH-05, A14).
6. Nhiều request cùng 401 cùng lúc: chỉ **một** `POST /auth/refresh` (refresh xoay vòng cookie, gọi đôi sẽ làm phiên sau bị từ chối).

**`src/shared/form-errors.ts`**
```ts
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
export function applyApiError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fieldNames: readonly Path<T>[]): string
```
- `ApiError` có `fields`: mỗi khóa có trong `fieldNames` → `setError(name, { type: 'server', message })`.
- Trả câu cho `FormError`: nếu có khóa `fields` **không** thuộc `fieldNames` (vd `token`) → các câu đó nối bằng dấu cách (A15); ngược lại → `error.message` (UI-05, giữ nguyên chữ API).
- Không phải `ApiError` → "Có lỗi xảy ra, vui lòng thử lại sau". Không bao giờ trả chuỗi rỗng.

**`src/features/auth/api.ts`**
```ts
export type Role = 'BOSS' | 'MANAGER' | 'TENANT'
export interface MeBuilding { id: number; code: string; name: string }
export interface Me {
  id: number; role: Role; phone: string; fullName: string; email: string | null; mustChangePassword: boolean
  contactPhone: string | null; zaloUrl: string | null; facebookUrl: string | null
  buildings?: MeBuilding[]   // chỉ BOSS / MANAGER
}
export interface PublicContact { phone: string | null; zaloUrl: string | null; facebookUrl: string | null }
export type UpdateMeInput = Partial<Record<'email' | 'contactPhone' | 'zaloUrl' | 'facebookUrl', string | null>>
export function loginRequest(input: { phone: string; password: string; remember: boolean }): Promise<{ accessToken: string; user: Me }>
export function logoutRequest(): Promise<null>
export function getMe(): Promise<Me>
export function updateMe(input: UpdateMeInput): Promise<Me>
export function changePassword(input: { currentPassword: string; newPassword: string }): Promise<null>
export function forgotPassword(input: { phone: string }): Promise<null>
export function resetPassword(input: { token: string; newPassword: string }): Promise<null>
export function getPublicContact(): Promise<PublicContact | null>
```
Mỗi hàm một dòng gọi `apiRequest`. `loginRequest` không tự lưu token (AuthProvider lưu).

**`src/app/auth-context.ts`**
```ts
export type AuthStatus = 'loading' | 'ready' | 'error'          // 'error': bước khởi động lỗi không phải 401 (Q6-A)
export interface AuthContextValue {
  status: AuthStatus
  user: Me | null
  login(input: { phone: string; password: string; remember: boolean }): Promise<Me>
  logout(): Promise<void>
  refreshMe(): Promise<Me | null>
  retry(): void                                                  // Q6-A: status='loading', chạy lại bước khởi động
}
export const AuthContext: React.Context<AuthContextValue | null>
export function useAuth(): AuthContextValue                     // ném lỗi nếu nằm ngoài AuthProvider
```

**`src/app/AuthProvider.tsx`** – `export function AuthProvider({ children }: { children: ReactNode })`
- Khởi động (một lần, chịu được StrictMode chạy effect 2 lần nhờ refresh một luồng): `refreshAccessToken()` → `getMe()` → `user`, `status='ready'`. Refresh 401 → `user=null`, `status='ready'`, không báo lỗi. Lỗi khác (`NETWORK_ERROR`, 5xx, ở refresh hoặc `me`) → `user=null`, `status='error'` (Q6-A); `retry()` chạy lại từ đầu. `login` thành công khi đang `status='error'` → `status='ready'`.
- `login`: `loginRequest` → `setAccessToken(accessToken)` → `user` → trả `user`.
- `logout`: `logoutRequest()` (bỏ qua lỗi) → `setAccessToken(null)` → `user=null`. Không tự điều hướng; bên gọi điều hướng `/` **trước** khi xóa user để guard không chen `/dang-nhap?next=…` (xem layout).
- `refreshMe`: `getMe()` → `user`; 401 → `user=null`.
- Đăng ký `setAuthHandlers({ onSignedOut: () => user=null, onPasswordChangeRequired: () => refreshMe() })`.

**`src/app/guards.ts`** (hàm thuần, test bằng Node)
```ts
export function homeOf(role: Role): '/thue' | '/ql'              // TENANT → /thue; MANAGER, BOSS → /ql (AUTH-06)
export function safeNext(raw: string | null): string | null     // chỉ nhận chuỗi bắt đầu '/' nhưng không '//' hay '/\', không chứa '://'; '/dang-nhap…' → null (A7)
export function postLoginPath(role: Role, rawNext: string | null): string   // = safeNext(rawNext) ?? homeOf(role); dùng chung cho LoginPage và GuestOnly (AUTH-06, T5)
export function guardRedirect(
  user: Pick<Me, 'role' | 'mustChangePassword'> | null,
  location: { pathname: string; search: string },
  allow: readonly Role[] | 'any',
): string | null
```
`guardRedirect`: `user=null` → `` `/dang-nhap?next=${encodeURIComponent(pathname + search)}` ``; `mustChangePassword` và `pathname !== '/doi-mat-khau'` → `'/doi-mat-khau'` (AUTH-05); `allow` là mảng và không chứa `role` → `homeOf(role)` (AUTH-06); còn lại `null`.

**`src/app/RequireAuth.tsx`**
```tsx
export function RequireAuth({ allow }: { allow: readonly Role[] | 'any' }): JSX.Element   // status 'loading' → <Spinner label="Đang tải" />; 'error' → khối lỗi (dưới); redirect → <Navigate replace />; không → <Outlet />
export function GuestOnly(): JSX.Element                                                 // 'loading' → Spinner; đã đăng nhập → <Navigate to={postLoginPath(role, searchParams 'next')} replace /> (T5); không (kể cả 'error') → <Outlet />
```
- Khối lỗi (Q6-A): `<div className="rooms-theme">` (vì `RequireAuth` bọc ngoài layout) + `<p role="alert">Không tải được phiên đăng nhập.</p>` + `<RoomsButton onClick={retry}>Thử lại</RoomsButton>`; không chuyển `/dang-nhap`. Spinner lúc `loading` cũng nằm trong `<div className="rooms-theme">`. `import '../components'`.
- Trang công khai khi `status='error'`: coi như chưa đăng nhập (`/`, `/phong`, `/dang-nhap`, `/quen-mat-khau` dùng được; header `PublicLayout` hiện "Đăng nhập"). `/doi-mat-khau` cần đăng nhập nên hiện khối lỗi.

**`src/app/AppProviders.tsx`** – `export function AppProviders({ children }: { children: ReactNode })`: một `QueryClient` cấp module (không export), `QueryClientProvider` bọc `AuthProvider`.

**`src/app/routes.tsx`** – `export const routes: RouteObject[]` theo sơ đồ ở trên (import từ `'react-router'`). **`src/main.tsx`**: `createRoot(...).render(<StrictMode><AppProviders><RouterProvider router={createBrowserRouter(routes)} /></AppProviders></StrictMode>)`.

**`src/layouts/internal-links.ts`**
```ts
export function handleInternalLinkClick(event: React.MouseEvent<HTMLElement>, navigate: (to: string) => void): void
```
Bỏ qua nếu `defaultPrevented`, `button !== 0`, có phím Ctrl/Meta/Shift/Alt. Tìm `a[href]` gần nhất từ `event.target` (nằm trong `currentTarget`); bỏ qua nếu có `download` hoặc `target` khác `_self`, hoặc `href` (thuộc tính, không phải property) không bắt đầu bằng `/` hay bắt đầu bằng `//`. Còn lại: `preventDefault()` rồi `navigate(href)` (A2).

**Layouts** (`PublicLayout`, `TenantLayout`, `StaffLayout`, không prop, render `<Outlet />`)
- Gốc: `<div className="rooms-theme" onClick={e => handleInternalLinkClick(e, navigate)}>` + `RoomsHeader` (`logoSrc="/images/rooms-logo.webp"`, KIT-10) + `<main>`. `import '../components'` (KIT-01), `import './layouts.css'`.
- `PublicLayout`: `homeHref="/"`; `links` = `[{ label: 'Đăng nhập', href: '/dang-nhap' }]` khi chưa đăng nhập (kể cả `status='error'`), `[{ label: 'Trang của tôi', href: homeOf(user.role) }]` khi đã đăng nhập; lúc `status='loading'` chưa hiện mục nào. Footer (Q3-A): `<RoomsFooter description="Chung cư mini cho thuê tại Hà Nội." contact={<ContactInfo contact={data ?? null} />} />` với `data` từ `usePublicContact()` (cùng `queryKey` với trang đăng nhập nên chỉ 1 request); lỗi tải → `contact` trống, footer vẫn hiện. Không truyền `links` cho footer.
- `TenantLayout`: `homeHref="/thue"`, `links` (Q2-A) = `[{ label: 'Tổng quan', href: '/thue' }, { label: 'Tài khoản', href: '/thue/tai-khoan' }]`, `action` = `<RoomsButton variant="outline">Đăng xuất</RoomsButton>`. **Không footer** (Q3-A).
- `StaffLayout`: `homeHref="/ql"`, `links` (Q2-A) = `[{ label: 'Việc hôm nay', href: '/ql' }, { label: 'Tài khoản', href: '/ql/tai-khoan' }]`, cùng nút "Đăng xuất". **Không footer** (Q3-A). Dòng tòa chỉ đọc (Q5-A) đầu `<main>`: `<p>` "Tòa đang quản lý: " + `user.buildings` nối bằng ", ", mỗi tòa dạng `` `${code} · ${name}` `` (Boss: đúng danh sách BE trả, FE không lọc); `buildings` rỗng hoặc thiếu → "Chưa được giao tòa nào". Không `<select>`, không tác dụng lọc. Tên dài phải xuống dòng (`overflow-wrap: anywhere`).
- "Đăng xuất": dùng `useSignOut()` (dưới), không tự viết lại logic trong layout.

**`src/features/auth/useSignOut.ts`** (quyết định kỹ thuật, không phải component, không vào kit)
```ts
export function useSignOut(): { signOut: () => Promise<void>; signingOut: boolean }
```
- `signOut`: nếu `signingOut` đang `true` → không làm gì (chặn bấm đôi); ngược lại `signingOut=true` → `navigate('/', { replace: true })` → `await logout()` (từ `useAuth()`). Thứ tự này bắt buộc: điều hướng **trước** khi xóa user để guard không chen `/dang-nhap?next=…`.
- Nơi dùng (cả 3 giống hệt): `<RoomsButton variant="outline" type="button" disabled={signingOut} onClick={() => void signOut()}>Đăng xuất</RoomsButton>`. `TenantLayout`, `StaffLayout` đặt nút này vào `action` của `RoomsHeader`; `ChangePasswordPage` đặt dưới form (CP-5).

**`PlaceholderPage`** – `export function PlaceholderPage()`: `SectionHeading` "Trang đang được xây dựng" (Q4-A), dùng cho `/` và `/phong`. **`NotFoundPage`** – `export function NotFoundPage()`: `SectionHeading` "Không tìm thấy trang" + `<Link to="/">Về trang chủ</Link>`, route `*` trong `PublicLayout`.

**`src/features/auth/ContactInfo.tsx`** – `export function ContactInfo({ contact }: { contact: PublicContact | null })`
- `phone` → chữ thường chọn/sao chép được (không phải ảnh, không bắt buộc `tel:`). `zaloUrl` → `<a>` "Zalo", `facebookUrl` → `<a>` "Facebook", `target="_blank" rel="noopener noreferrer"`, chỉ render khi URL bắt đầu `https://` (A11). Trường `null` không hiện; tất cả `null` hoặc `contact=null` → không render gì.

**`src/features/auth/usePublicContact.ts`** – `export function usePublicContact(): UseQueryResult<PublicContact | null, ApiError>`, `queryKey: ['public', 'contact']`, `staleTime` 5 phút. Lỗi → nơi dùng ẩn khối liên hệ (A11).

**`src/features/auth/schemas.ts`** (zod 4, chép đúng chữ lỗi của DTO backend, A4)
```ts
export const loginSchema          // phone /^0[0-9]{9}$/ "Số điện thoại không hợp lệ"; password min(1) "Vui lòng nhập mật khẩu"; remember boolean
export const forgotSchema         // phone như trên
export const changePasswordSchema // currentPassword min(1) "Vui lòng nhập mật khẩu hiện tại"; newPassword min(8) "Mật khẩu tối thiểu 8 ký tự"; confirmPassword phải bằng newPassword → lỗi ở confirmPassword "Mật khẩu nhập lại không khớp" (A16)
export const resetPasswordSchema  // newPassword min(8); confirmPassword khớp
export const tenantProfileSchema  // email: rỗng hoặc email hợp lệ ≤ 255 "Email không hợp lệ"
export const staffProfileSchema   // + contactPhone rỗng hoặc /^0[0-9]{9}$/; zaloUrl, facebookUrl rỗng hoặc URL https:// "Đường dẫn không hợp lệ"
export type LoginValues = z.infer<typeof loginSchema>  // … một type cho mỗi schema
```
Không có độ dài tối đa cho mật khẩu (BE không có).

**`ChangePasswordForm`** – `export function ChangePasswordForm({ afterSuccess }: { afterSuccess: 'go-home' | 'stay' })`. Ba `PasswordField` "Mật khẩu hiện tại" (`current-password`), "Mật khẩu mới" (`new-password`), "Nhập lại mật khẩu mới" (`new-password`). Gửi `{ currentPassword, newPassword }`. Thành công: `go-home` → `await refreshMe()` rồi `navigate(homeOf(role), { replace: true })`; `stay` → reset form + khối báo thành công. Lỗi → `applyApiError(…, ['currentPassword', 'newPassword'])`.

**`ProfileForm`** – `export function ProfileForm({ staff }: { staff: boolean })`. Giá trị đầu lấy từ `useAuth().user`. TENANT: "Email". Nhân sự: "Email", "Số điện thoại liên hệ", "Zalo", "Facebook" + "Khách sẽ thấy:" và `<ContactInfo contact={{ phone: contactPhone, zaloUrl, facebookUrl }} />` từ giá trị đang gõ (`watch`). Gửi: trim; chuỗi rỗng → `null` (A8); người thuê chỉ gửi `email`. Thành công → `await refreshMe()` + khối báo thành công, ở lại trang. Lỗi → `applyApiError(…, [các ô])`.

**Trang** (mỗi trang một component default/named export, bọc nội dung bằng `SectionHeading` cho tiêu đề; nút bằng `RoomsButton type="submit"` + `<Spinner label=… />` khi `isSubmitting`; nút `disabled` khi đang gửi; form `noValidate`, `zodResolver`):
- `LoginPage`: `TextField` "Số điện thoại" (`type="tel"`, `inputMode="numeric"`, `autoComplete="username"`), `PasswordField` "Mật khẩu" (`current-password`), `Checkbox` "Ghi nhớ đăng nhập" (mặc định bỏ chọn, A5), nút "Đăng nhập", `<Link to="/quen-mat-khau">Quên mật khẩu?</Link>`, `FormError`. Bên dưới: "Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng", `ContactInfo` (Boss, `usePublicContact`), `<Link to="/phong">Xem phòng trống</Link>`. Thành công → `navigate(postLoginPath(user.role, next), { replace: true })` (cùng hàm với `GuestOnly`, T5). `location.state?.notice === 'password-reset'` → khối báo thành công "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới." (A16). Tiêu đề "Đăng nhập", spinner "Đang đăng nhập" (A16).
- `ChangePasswordPage` (`/doi-mat-khau`): tiêu đề "Đổi mật khẩu"; khi `user.mustChangePassword` hiện thêm câu "Bạn cần đổi mật khẩu trước khi tiếp tục" (chữ của BE `PASSWORD_CHANGE_REQUIRED`); `ChangePasswordForm afterSuccess="go-home"`; dưới form luôn có nút "Đăng xuất" (Q7-A) dựng bằng `useSignOut()` đúng như ở layout (`variant="outline"`, `type="button"`, `disabled={signingOut}`).
- `ForgotPasswordPage` (`/quen-mat-khau`): không `token` → `TextField` "Số điện thoại" + nút gửi; sau 200 thay form bằng đúng câu "Nếu số điện thoại có email, chúng tôi đã gửi link đặt lại mật khẩu. Nếu không, hãy liên hệ quản lý." + `ContactInfo` (Boss, A9). Có `token` (đọc từ `useSearchParams`) → "Mật khẩu mới" + "Nhập lại mật khẩu mới" → `resetPassword({ token, newPassword })` → `navigate('/dang-nhap', { replace: true, state: { notice: 'password-reset' } })`. Lỗi link (`fields.token`) → `FormError` hiện đúng câu API + `<Link to="/quen-mat-khau">Gửi lại liên kết</Link>` (A16). Chữ (A16): không token – tiêu đề "Quên mật khẩu", nút "Gửi", spinner "Đang gửi"; có token – tiêu đề và nút "Đặt lại mật khẩu", spinner "Đang lưu". Trang này không có link ra ngoài khi đang có `token`.
- `TenantAccountPage` (`/thue/tai-khoan`): tiêu đề + 2 khối "Đổi mật khẩu" (`ChangePasswordForm afterSuccess="stay"`) và email (`ProfileForm staff={false}`).
- `StaffAccountPage` (`/ql/tai-khoan`): như trên với `ProfileForm staff`.
- `TenantHomePage` "Tổng quan", `StaffHomePage` "Việc hôm nay": tiêu đề + "Xin chào, {user.fullName}" (A16).
- Trang tài khoản (A16): tiêu đề "Tài khoản"; khối "Đổi mật khẩu" (nút "Đổi mật khẩu", spinner "Đang lưu", báo "Đã đổi mật khẩu."); khối "Thông tin liên hệ" (nhân sự) / "Email" (người thuê) với nút "Lưu", spinner "Đang lưu", báo "Đã lưu."; "Khách sẽ thấy:" khi cả 3 trường trống → "Chưa có thông tin liên hệ".
- `ContactInfo` (A16): "Điện thoại: {phone}", link "Zalo", "Facebook".

**CSS** (`layouts.css`, `auth.css`): chỉ dùng biến `--rooms-*` có sẵn và font của kit; không màu hex mới, không font mới. Khối báo thành công: `role="status"`, viền trái `--rooms-ink`, nền `--rooms-paper`, chữ `--rooms-text` (không dùng màu lỗi). Cột form tối đa ~440px; 360px không tràn ngang (UI-07). Chữ ≤ 13px nét 500 (KIT-09).

### Cách chạy thử bản nháp (tester)

1. **Kiểm kiểu** – `npm run build` chỉ kiểm `src/` bản chính. Cấu hình đã được chấp nhận: `<scratchpad>\tsc-check\tsconfig.draft.json` (thư mục con `tsc-check\` trong scratchpad, ngoài repo); mọi chỗ trong plan ghi `<scratchpad>/tests/tsconfig.draft.json` đều chỉ file này. Nội dung (tạo lại theo mẫu nếu thiếu):
   ```json
   {
     "extends": "D:/Rooms/Source/frontend/tsconfig.app.json",
     "compilerOptions": {
       "types": [],
       "noUncheckedSideEffectImports": false,
       "rootDirs": ["D:/Rooms/Source/frontend/src", "D:/Rooms/Source/frontend/artifact_FE/2026-10-29-FE-LOGIN-04-16/src"]
     },
     "include": ["D:/Rooms/Source/frontend/artifact_FE/2026-10-29-FE-LOGIN-04-16/src/**/*"]
   }
   ```
   `rootDirs` cho `../components`, `../shared/formatters` trong file nháp rơi về bản chính. Lệnh: `npx tsc -p <scratchpad>/tests/tsconfig.draft.json` → không in gì, mã thoát 0.
2. **Test Node** – cùng cách với `tests/form-fields.test.mjs`: `ts.transpileModule` (CommonJS, ReactJSX), shim `require` theo tên module; `zod` và `react-hook-form` (chỉ kiểu) dùng bản thật/không cần; `fetch` thay bằng hàm giả trên `globalThis`. File test đọc mã nguồn tương đối theo chính nó (`../src/...`) để sau khi chép vẫn chạy được. Tên test bắt đầu bằng mã spec.
3. **Chạy app trong trình duyệt** – file nháp import tương đối tới file kit/shared không có trong thư mục nháp, nên `npm run dev` thường báo không tìm thấy file (A1). Tester tạo `<scratchpad>/vite.draft.mjs` (ngoài repo, JS thuần, chỉ import `node:fs`/`node:path`), export object: `root: 'D:/Rooms/Source/frontend'`, `server: { port: 5174, strictPort: true }`, một plugin `enforce: 'pre'` tên `draft-overlay` với `resolveId(source, importer)`: chỉ khi `importer` nằm trong `<nháp>/src/` và `source` bắt đầu bằng `.`; nếu đường dẫn đích có trong nháp (thử `''`, `.ts`, `.tsx`, `.css`, `/index.ts`, `/index.tsx`) → trả `null`; nếu không → đổi tiền tố `<nháp>/src/` thành `Source/frontend/src/` và `return this.resolve(mainPath, importer, { skipSelf: true })`. So đường dẫn sau khi đổi `\` thành `/`, không phân biệt hoa thường ổ đĩa. Chạy: `npm run dev -- --config <scratchpad>/vite.draft.mjs`, mở `http://localhost:5174/artifact_FE/2026-10-29-FE-LOGIN-04-16/preview.html?...`. Nếu JSX không biên dịch được khi thiếu plugin React, import `@vitejs/plugin-react` bằng đường dẫn tuyệt đối `file:///D:/Rooms/Source/frontend/node_modules/@vitejs/plugin-react/…` trong file scratchpad. **Tắt dev server và trình duyệt trước khi báo cáo.**

### `preview.html` (coder viết ở CP-3, mở rộng ở CP-4..6; chỉ nháp, không chép)

Cùng thẻ font như `components.html`, `lang="vi"`, một `<script type="module">` inline, JS thuần (`createElement`, không JSX):
1. Đọc query: `path` (mặc định `/dang-nhap`), `session` (`none` | `tenant` | `tenant-must-change` | `manager` | `manager-empty` | `boss`, mặc định `none`), `boot` (`ok` | `error`), `contact` (`full` | `partial` | `none` | `error` | `unsafe`).
2. Gắn `window.fetch` giả **trước** khi `await import('./src/app/routes.tsx')`, `'./src/app/AppProviders.tsx'`. Mỗi lời gọi ghi vào `window.__mock.calls` (`{ method, url, headers, body, credentials }`). `window.__mock` có `expireAccessToken()` (lời gọi kế tiếp có Bearer cũ → 401 `UNAUTHENTICATED`), `failNextRefresh()` và `setBoot('ok' | 'error')` (đổi kết quả refresh để thử nút "Thử lại", Q6-A). Trả lời sau ~400 ms.
3. Dữ liệu minh họa (không phải dữ liệu seed thật, mật khẩu chung `matkhau123`): BOSS `0900000001` "Phạm Minh Đức" 3 tòa; MANAGER `0900000002` "Nguyễn Thu Hà" 2 tòa (`A01`, `A02`); `manager-empty` 0 tòa; TENANT `0900000004` "Nguyễn Văn An" (`mustChangePassword` theo `session`/khi đăng nhập: true); `0900000005` → 403 `ACCOUNT_LOCKED`; `0900000009` → 429 `TOO_MANY_REQUESTS`; sai → 401 `INVALID_CREDENTIALS`; phone sai định dạng → 400 `fields.phone`. Đổi mật khẩu: sai hiện tại → `fields.currentPassword`; mới = hiện tại → `fields.newPassword`. Reset: token `hople` thành công, khác → 400 `fields.token`. PATCH me: email `trung@example.com` → `fields.email` "Email đã được sử dụng"; người thuê gửi trường liên hệ → 403 `FORBIDDEN`. Contact: `full` = cả 3, `partial` = chỉ phone, `none` = `data: null`, `error` = 500, `unsafe` = `zaloUrl: "javascript:alert(1)"`. `boot=error` → refresh trả 500. Mọi `message` chép đúng chữ của BE (bảng hợp đồng API).
4. Render `AppProviders` > `RouterProvider` với `createMemoryRouter(routes, { initialEntries: [path] })`. Một thanh cố định **ngoài** `.rooms-theme` hiện `location.pathname + search + state` hiện tại (`router.subscribe`) để tester đọc kết quả điều hướng.

## 3. Câu hỏi bỏ ngỏ

**Không còn câu hỏi bỏ ngỏ.** Không checkpoint nào bị chặn.

### Đã trả lời (chủ dự án, 29/10/2026)

| Câu | Trả lời | Đã đưa vào |
|---|---|---|
| Q1. Câu chữ giao diện spec chưa ghi | **A** – dùng bảng dưới, ghi là `[ASSUMPTION]` (A16) | mục 2 (Trang, schemas, layouts, RequireAuth), CP-3..CP-6 |
| Q2. Mục menu `TenantLayout` / `StaffLayout` | **A** – chỉ trang có ở phần này: "Tổng quan"/"Việc hôm nay" + "Tài khoản" | mục 2 Layouts, CP-3 |
| Q3. Footer | **A** – `RoomsFooter` + liên hệ Boss chỉ ở `PublicLayout`; Tenant/Staff không footer | mục 2 Layouts, CP-3 (`ContactInfo`, `usePublicContact` chuyển lên CP-3) |
| Q4. Đường dẫn chưa có trang | **A** – `/`, `/phong`: "Trang đang được xây dựng"; đường lạ: "Không tìm thấy trang" + "Về trang chủ" | sơ đồ, mục 2, CP-3 |
| Q5. Tòa trong `StaffLayout` | **A** – dòng chỉ đọc; rỗng → "Chưa được giao tòa nào" | mục 2 Layouts, CP-3 |
| Q6. API lỗi lúc khởi động | **A** – trang cần đăng nhập hiện lỗi + "Thử lại"; trang công khai vẫn dùng được | `AuthProvider`, `RequireAuth`, CP-2, CP-3 |
| Q7. "Đăng xuất" trên `/doi-mat-khau` | **A** – nút "Đăng xuất" dưới form đổi mật khẩu | `ChangePasswordPage`, CP-5 |

### Quyết định kỹ thuật (planner, theo ý kiến phiên chính 29/10/2026 sau lượt coder CP-3)

| # | Quyết định | Đã đưa vào |
|---|---|---|
| T1 | Kiểm `GuestOnly` trên `/dang-nhap` (tenant → `/thue`, boss/manager → `/ql`) chuyển từ CP-3 sang CP-4, nơi route `/dang-nhap` được thêm | CP-3, CP-4 |
| T2 | Logic "Đăng xuất" dùng chung qua hook `src/features/auth/useSignOut.ts` (không phải thư mục component mới, không vào kit); hành vi giữ nguyên: `disabled` khi chạy, `navigate('/', { replace: true })` rồi `await logout()` | mục 2, CP-3 (hook + 2 layout), CP-5 (`ChangePasswordPage`) |
| T3 | Route chưa đăng ký (`/dang-nhap` tới CP-4; `/doi-mat-khau`, `/quen-mat-khau` tới CP-5; `/thue/tai-khoan`, `/ql/tai-khoan` tới CP-6) hiện "Không tìm thấy trang"; kịch bản cần các trang đó dời sang checkpoint của chúng | CP-3..CP-6 |
| T4 | `tsc` của CP-2 chưa được xác nhận; tester tạo `<scratchpad>/tests/tsconfig.draft.json` (ngoài repo) và xác nhận cùng CP-3. Cập nhật 29/10: file thực tế `<scratchpad>\tsc-check\tsconfig.draft.json` được chấp nhận | "Cách chạy thử" bước 1, CP-2, CP-3 |
| T5 | **Quyết định chủ dự án 29/10/2026:** người đã đăng nhập mở `/dang-nhap?next=…` được chuyển **đúng như sau khi đăng nhập**: tới `next` nếu là đường dẫn trong app hợp lệ cho vai trò của họ, ngược lại về trang chủ vai trò. Cài đặt: `GuestOnly` (`src/app/RequireAuth.tsx`) và `LoginPage` cùng gọi `postLoginPath(role, rawNext) = safeNext(rawNext) ?? homeOf(role)` (`src/app/guards.ts`); `next` thuộc vai trò khác do guard đích đưa về trang chủ vai trò. Mốc spec: AUTH-06 ("Opening `/dang-nhap` while logged in redirects the same way") không nói về `next` → ghi thêm A18 | mục 2 (`guards.ts`, `RequireAuth.tsx`, `LoginPage`), CP-4 |

**Bảng chữ giao diện (Q1-A, ghi là A16).** Chữ có sẵn trong spec/feature hoặc trong BE vẫn dùng nguyên văn; bảng này chỉ cho phần spec không ghi:

| Chỗ | Chữ |
|---|---|
| Tiêu đề trang đăng nhập · nhãn spinner | "Đăng nhập" · "Đang đăng nhập" |
| Báo sau khi đặt lại mật khẩu (trên `/dang-nhap`) | "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới." |
| Lỗi nhập lại không khớp | "Mật khẩu nhập lại không khớp" |
| Nút / spinner đổi mật khẩu | "Đổi mật khẩu" / "Đang lưu" |
| Báo đổi mật khẩu xong (trang tài khoản) | "Đã đổi mật khẩu." |
| Tiêu đề / nút / spinner quên mật khẩu | "Quên mật khẩu" / "Gửi" / "Đang gửi" |
| Tiêu đề / nút / spinner đặt lại mật khẩu | "Đặt lại mật khẩu" / "Đặt lại mật khẩu" / "Đang lưu" (spinner thêm khi gộp, cùng chữ spinner đổi mật khẩu) |
| Link khi liên kết hỏng | "Gửi lại liên kết" |
| Trang tài khoản: tiêu đề · khối · nút · báo | "Tài khoản" · "Đổi mật khẩu", "Thông tin liên hệ" (nhân sự) / "Email" (người thuê) · "Lưu" ("Đang lưu") · "Đã lưu." |
| "Khách sẽ thấy:" khi chưa có gì | "Chưa có thông tin liên hệ" |
| Khối liên hệ | "Điện thoại: 09…", link "Zalo", "Facebook" |
| Trang chủ tạm | "Tổng quan" / "Việc hôm nay" + "Xin chào, {họ tên}" |
| Danh sách tòa (Q5-A) | "Tòa đang quản lý:" · rỗng: "Chưa được giao tòa nào" |
| Đang tải | "Đang tải" |
| Trang tạm / không tìm thấy (Q4-A) | "Trang đang được xây dựng" / "Không tìm thấy trang" + link "Về trang chủ" |
| Lỗi khởi động (Q6-A) | "Không tải được phiên đăng nhập." + nút "Thử lại" |
| Mô tả footer `PublicLayout` (Q3-A) | "Chung cư mini cho thuê tại Hà Nội." |
| Menu (Q2-A) | người thuê "Tổng quan", "Tài khoản"; nhân sự "Việc hôm nay", "Tài khoản" |

**[ASSUMPTION] dùng trong plan** (phiên chính chép vào REVIEW.md)
- A1. Chạy thử app bản nháp bằng `npm run dev -- --config <scratchpad>/vite.draft.mjs` (cấu hình ngoài repo, thêm bước tìm file rơi về bản chính), vì `npm run dev` thường không tìm được file kit từ thư mục nháp. Không sửa `vite.config.ts`.
- A2. Layout bắt click link nội bộ của `RoomsHeader`/`RoomsFooter` (vốn là `<a href>`) để chuyển trang không tải lại (không mất token trong bộ nhớ, không refresh mỗi lần bấm). Không sửa kit.
- A3. `ContactInfo`, khối báo thành công, CSS trang ở `src/features/auth/` và `src/layouts/` (chỉ feature auth và footer `PublicLayout` theo Q3-A dùng, KIT-07); không thêm component vào kit. Khi trang công khai Phase 2 cần `ContactInfo` thì chuyển vào kit.
- A4. Chữ lỗi kiểm tra phía client chép đúng chữ DTO backend ("Số điện thoại không hợp lệ", "Vui lòng nhập mật khẩu", "Mật khẩu tối thiểu 8 ký tự", "Vui lòng nhập mật khẩu hiện tại", "Email không hợp lệ", "Đường dẫn không hợp lệ").
- A5. "Ghi nhớ đăng nhập" mặc định bỏ chọn (A-07).
- A6. Phiên hết hạn giữa chừng (refresh thất bại) → chuyển `/dang-nhap?next=…`, không thêm câu báo.
- A7. `next` chỉ nhận đường dẫn trong app (`/…`, không `//`, không `://`, không `/dang-nhap`); khác → trang chủ theo vai trò. `next` thuộc vai trò khác → guard đưa về trang chủ của mình.
- A8. Trang tài khoản: ô email / liên hệ để trống → gửi `null` (xóa, đúng quyết định Q5b của BE); lưu xong ở lại trang, hiện "Đã lưu.". Hai form riêng (mật khẩu, thông tin).
- A9. `/quen-mat-khau` hiện liên hệ Boss từ `/public/contact` (đúng file feature). AUTH-07 ghi "building manager's contact", nhưng trang không biết người dùng là ai nếu không lộ tài khoản.
- A10. Người đã đăng nhập vẫn mở được `/quen-mat-khau`.
- A11. Link Zalo/Facebook mở tab mới, chỉ hiện khi bắt đầu `https://`; trường trống ẩn; tải liên hệ lỗi thì ẩn khối liên hệ.
- A12. Bốn file test mới (`auth-api`, `auth-guards`, `auth-schemas`, `auth-login-flow`) nối vào script `test:components` (giống FE-LOGIN-06), để một lệnh vẫn chạy mọi test FE.
- A13. Mất mạng / phản hồi không phải JSON → `ApiError { code: 'NETWORK_ERROR' }` với chữ "Có lỗi xảy ra, vui lòng thử lại sau" (chữ `INTERNAL_ERROR` của BE).
- A14. API trả `PASSWORD_CHANGE_REQUIRED` → `refreshMe()` → guard đưa tới `/doi-mat-khau`.
- A15. `fields` không có ô tương ứng (vd `token`) hiện ở `FormError` thay cho câu chung.
- A16. Mọi chữ giao diện trong bảng chữ (Q1-A) ở trên, kể cả spinner "Đang lưu" của form đặt lại mật khẩu (dòng bảng duy nhất thêm khi gộp).
- A17. Khi khởi động lỗi (Q6-A), trang công khai coi như chưa đăng nhập: header `PublicLayout` hiện "Đăng nhập", `/dang-nhap` và `/quen-mat-khau` dùng được; đăng nhập thành công thì hết trạng thái lỗi. `/doi-mat-khau` (cần đăng nhập) hiện khối lỗi + "Thử lại".
- A18. (T5, chủ dự án đã quyết 29/10/2026) Người đã đăng nhập mở `/dang-nhap?next=…` dùng `next` y như sau khi đăng nhập (`postLoginPath`): `next` hợp lệ cho vai trò → tới `next`; không hợp lệ (A7) hoặc thuộc vai trò khác → trang chủ vai trò. AUTH-06 chỉ ghi "redirects the same way", không nhắc `next`.

## 4. Checkpoints

Không có tiền, ngày nghiệp vụ hay múi giờ ở phần này (không kịch bản `Asia/Ho_Chi_Minh`). "Tòa khác / người thuê khác" do BE chặn (SCOPE-02/03), FE chỉ hiện `buildings` BE trả; kịch bản phạm vi ở đây là **vai trò khác**. Mọi chữ mong đợi lấy từ spec, file feature, BE hoặc bảng chữ Q1-A (A16). Không checkpoint nào còn bị chặn bởi câu hỏi.

Kiểm tra chung cuối mỗi CP (ngoài "Done when" riêng): `npx eslint artifact_FE/2026-10-29-FE-LOGIN-04-16` → 0 lỗi, 0 cảnh báo; `npm run test:components` → 40/40 pass (bản chính không đổi); thư mục nháp chỉ có file trong bảng mục 2 (+ `PLAN.md`, `REVIEW.md`).

### CP-1 – api client, form helper, hàm gọi endpoint

- **Task:** FE-LOGIN-04 (một phần), FE-LOGIN-05, FE-LOGIN-07 · API-02, API-03, AUTH-T1, AUTH-T2, UI-05, AUTH-05
- **File (coder):** `<nháp>/src/shared/api.ts`, `<nháp>/src/shared/form-errors.ts`, `<nháp>/src/features/auth/api.ts`, `<nháp>/package.json`
- **File (tester):** `<nháp>/tests/auth-api.test.mjs`
- **Done when:**
  - `node --test artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-api.test.mjs` → `fail 0`.
  - `npx tsc -p <scratchpad>/tests/tsconfig.draft.json` → mã thoát 0.
  - `git diff --no-index package.json artifact_FE/2026-10-29-FE-LOGIN-04-16/package.json` → chỉ dòng `test:components` đổi.
  - `Get-ChildItem -Recurse -File artifact_FE/2026-10-29-FE-LOGIN-04-16/src | Select-String -Pattern 'localStorage|sessionStorage|document\.cookie'` → không có kết quả.
- **Kịch bản test:**
  - [API-02] 200 `{ data: { x: 1 } }` → trả `{ x: 1 }`; 200 `{ data: null }` → `null`.
  - [API-03] 401 `{ error: { code: 'INVALID_CREDENTIALS', message: 'Số điện thoại hoặc mật khẩu không đúng' } }` → ném `ApiError` với đúng `code`, `message`, `status 401`, `instanceof Error`.
  - [API-03] 400 có `fields: { phone: 'Số điện thoại không hợp lệ' }` → `ApiError.fields` giữ nguyên.
  - [A13] `fetch` ném `TypeError` → `ApiError { code: 'NETWORK_ERROR', status: 0, message: 'Có lỗi xảy ra, vui lòng thử lại sau' }`; 502 thân HTML → `NETWORK_ERROR`, `status 502`.
  - [AUTH-T1] Sau `setAccessToken('t1')` mọi request có `Authorization: Bearer t1`; `setAccessToken(null)` → không có header. Mọi request có `credentials: 'include'`; có body → `Content-Type: application/json` và body JSON đúng.
  - [AUTH-T2] Request có Bearer nhận 401 → đúng 1 `POST /api/v1/auth/refresh`, rồi thử lại với token mới, trả data của lần thử lại.
  - [AUTH-T2] Refresh trả 401 → `onSignedOut` gọi 1 lần, token bị xóa (request sau không có Bearer), ném `ApiError` 401; không thử lại lần hai.
  - [AUTH-T2] Lần thử lại vẫn 401 → `onSignedOut`, ném; tổng 1 refresh, 2 lần gọi endpoint.
  - [AUTH-T2] 3 request có Bearer cùng nhận 401 đồng thời → đúng **1** refresh, cả 3 được thử lại và thành công. Hai lời gọi `refreshAccessToken()` song song → 1 fetch.
  - [AUTH-01] `POST /auth/login` (không Bearer) nhận 401 `INVALID_CREDENTIALS` → **không** gọi refresh, ném nguyên lỗi.
  - [AUTH-05] 403 `PASSWORD_CHANGE_REQUIRED` → `onPasswordChangeRequired` gọi 1 lần, vẫn ném lỗi.
  - [API-01] Hàm trong `features/auth/api.ts` gọi đúng method + đường dẫn: `loginRequest` → `POST /api/v1/auth/login` body `{ phone, password, remember }`; `getMe` → `GET /api/v1/auth/me`; `updateMe({ email: null })` → `PATCH` body `{"email":null}`; `changePassword`, `forgotPassword`, `resetPassword`, `logoutRequest`, `getPublicContact` → `GET /api/v1/public/contact`.
  - [UI-05] `applyApiError(ApiError fields { currentPassword: 'Mật khẩu hiện tại không đúng' }, setError, ['currentPassword','newPassword'])` → `setError('currentPassword', { type: 'server', message: 'Mật khẩu hiện tại không đúng' })`, trả `error.message` của API.
  - [UI-05, A15] `fields { token: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' }` với `fieldNames ['newPassword','confirmPassword']` → không gọi `setError`, trả đúng câu của `token`.
  - [UI-05] Lỗi không phải `ApiError` (vd `new Error('x')`) → trả "Có lỗi xảy ra, vui lòng thử lại sau"; `ApiError` không `fields` → trả `message`. Kết quả không bao giờ rỗng.

### CP-2 – AuthProvider, guard, providers

- **Task:** FE-LOGIN-08, FE-LOGIN-09 (phần guard) · AUTH-05, AUTH-06, AUTH-T1, AUTH-T2 · Q6-A (`status='error'`, `retry`, khối lỗi trong `RequireAuth`)
- **File (coder):** `<nháp>/src/app/auth-context.ts`, `<nháp>/src/app/AuthProvider.tsx`, `<nháp>/src/app/guards.ts`, `<nháp>/src/app/RequireAuth.tsx`, `<nháp>/src/app/AppProviders.tsx`
- **File (tester):** `<nháp>/tests/auth-guards.test.mjs` (phần `guards.ts`)
- **Done when:**
  - `node --test artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-guards.test.mjs` → `fail 0`.
  - `npx tsc -p <scratchpad>/tests/tsconfig.draft.json` → mã thoát 0. **Chưa được tester xác nhận ở lượt CP-2**; xác nhận cùng lượt CP-3 (xem CP-3, "Kiểm kiểu").
  - (Hành vi khởi động của AuthProvider kiểm trong trình duyệt ở CP-3.)
- **Kịch bản test (`guards.ts`):**
  - [AUTH-06] `homeOf('TENANT') === '/thue'`, `homeOf('MANAGER') === '/ql'`, `homeOf('BOSS') === '/ql'`.
  - [AUTH-06 route guard] `guardRedirect(null, { pathname: '/thue/tai-khoan', search: '?a=1' }, ['TENANT'])` → `/dang-nhap?next=%2Fthue%2Ftai-khoan%3Fa%3D1`.
  - [AUTH-06] Vai trò khác: TENANT trên `/ql` (`allow ['MANAGER','BOSS']`) → `/thue`; MANAGER trên `/thue` → `/ql`; BOSS trên `/thue` → `/ql`.
  - [AUTH-05] `mustChangePassword: true` trên `/thue` → `/doi-mat-khau`; trên `/doi-mat-khau` (`allow 'any'`) → `null`. `mustChangePassword` được xét **trước** vai trò (TENANT bị buộc đổi mở `/ql` → `/doi-mat-khau`).
  - [AUTH-06] Đúng vai trò, không buộc đổi → `null`.
  - [A7] `safeNext`: `'/thue/tai-khoan'` → giữ; `'/ql?x=1'` → giữ; `null`, `''`, `'thue'`, `'//evil.com'`, `'/\\evil.com'`, `'https://evil.com'`, `'/x?u=https://a'` (chứa `://`) → `null`; `'/dang-nhap'`, `'/dang-nhap?next=/ql'` → `null`.

### CP-3 – Router, 3 layout, trang chủ tạm, khung chạy thử

- **Task:** FE-LOGIN-04, FE-LOGIN-09, FE-LOGIN-10, FE-LOGIN-11 · AUTH-05, AUTH-06, AUTH-10, KIT-01, KIT-02, KIT-10, UI-07, UI-08 · Q2-A, Q3-A, Q4-A, Q5-A, Q6-A
- **File (coder):** `<nháp>/src/app/routes.tsx`, `<nháp>/src/main.tsx`, `<nháp>/index.html`, `<nháp>/src/layouts/PublicLayout.tsx`, `TenantLayout.tsx`, `StaffLayout.tsx`, `internal-links.ts`, `layouts.css`, `<nháp>/src/pages/public/PlaceholderPage.tsx`, `NotFoundPage.tsx`, `<nháp>/src/pages/tenant/TenantHomePage.tsx`, `<nháp>/src/pages/staff/StaffHomePage.tsx`, `<nháp>/src/features/auth/ContactInfo.tsx`, `usePublicContact.ts`, `useSignOut.ts` (dùng trong `TenantLayout`, `StaffLayout`), `auth.css` (phần khối liên hệ), `<nháp>/preview.html`
- **File (tester):** thêm vào `<nháp>/tests/auth-guards.test.mjs` các test `internal-links.ts`; tạo `<nháp>/tests/auth-schemas.test.mjs` với test `ContactInfo` (shim JSX như `form-fields.test.mjs`).
- Nếu một lần gọi coder không đủ, tách: CP-3a (`routes.tsx`, `main.tsx`, `index.html`, 3 layout, `useSignOut.ts`, `internal-links.ts`, `layouts.css`, 4 trang) rồi CP-3b (`ContactInfo`, `usePublicContact`, `auth.css`, footer `PublicLayout`, `preview.html`).
- **Route chưa đăng ký ở CP-3:** `/dang-nhap` (CP-4), `/doi-mat-khau`, `/quen-mat-khau` (CP-5), `/thue/tai-khoan`, `/ql/tai-khoan` (CP-6). Cho tới checkpoint của chúng, mở các đường này rơi vào route `*` → "Không tìm thấy trang" trong `PublicLayout`, **không** qua guard (kể cả `/thue/tai-khoan`, `/ql/tai-khoan`). Đó là đúng ở CP-3, không phải lỗi. Chuyển hướng **tới** các đường này (vd `/dang-nhap?next=…`, `/doi-mat-khau`) chỉ kiểm bằng URL trên thanh đường dẫn của preview; trang đích hiện "Không tìm thấy trang". Kiểm `GuestOnly` trên `/dang-nhap` thuộc CP-4, không thuộc CP-3.
- **Kiểm kiểu (tester, gộp CP-2):** tạo `<scratchpad>/tests/tsconfig.draft.json` đúng mẫu ở "Cách chạy thử" bước 1 (thư mục con `tests/` của scratchpad tester, ngoài repo; không tạo trong thư mục nháp). Vì `include` là toàn bộ `src` nháp, một lần `npx tsc` ở lượt này xác nhận luôn file CP-1 và CP-2 (`auth-context.ts`, `AuthProvider.tsx`, `guards.ts`, `RequireAuth.tsx`, `AppProviders.tsx`) — ghi rõ trong báo cáo "tsc CP-2 + CP-3: mã thoát 0" kèm lệnh đã chạy.
- **Done when:**
  - `node --test artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-guards.test.mjs artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-schemas.test.mjs` → `fail 0`.
  - `npx tsc -p <scratchpad>/tests/tsconfig.draft.json` → mã thoát 0, không in gì (bao gồm file CP-2).
  - `git diff --no-index index.html artifact_FE/2026-10-29-FE-LOGIN-04-16/index.html` → chỉ thêm 3 dòng font giống hệt `components.html` dòng 8–10.
  - Overlay dev server (mục "Cách chạy thử" bước 3) mở `preview.html?session=tenant&path=/thue` → thấy "Tổng quan" + "Nguyễn Văn An", không lỗi console; server và trình duyệt đã tắt.
- **Kịch bản test:**
  - [internal-links] Test Node với sự kiện giả: click trái vào `<a href="/thue">` → `preventDefault` + `navigate('/thue')`; Ctrl/Meta/Shift/Alt, nút giữa, `target="_blank"`, `download`, `href="https://x"`, `href="//x"`, `href="#a"` → không gọi `navigate`, không `preventDefault`; sự kiện đã `defaultPrevented` → bỏ qua.
  - [AUTH-T2] `session=tenant&path=/thue`: `__mock.calls` có `POST /api/v1/auth/refresh` **một lần** (dù StrictMode) rồi `GET /api/v1/auth/me` có Bearer; trang "Tổng quan" chào "Nguyễn Văn An".
  - [AUTH-06] `session=none&path=/thue` → URL `/dang-nhap?next=%2Fthue`. `session=none&path=/ql` → `/dang-nhap?next=%2Fql`. (Trang đích hiện "Không tìm thấy trang" ở CP-3.)
  - [AUTH-06] `session=tenant&path=/ql` → `/thue`. `session=manager&path=/thue` → `/ql`. `session=boss&path=/thue` → `/ql`.
  - [AUTH-05] `session=tenant-must-change&path=/thue` → `/doi-mat-khau`; `path=/ql` → `/doi-mat-khau` (chỉ kiểm URL; trang đích "Không tìm thấy trang" ở CP-3).
  - [Q4-A, route chưa đăng ký] `session=none&path=/doi-mat-khau`, `/quen-mat-khau`, `/thue/tai-khoan`, `/ql/tai-khoan` → "Không tìm thấy trang" trong `PublicLayout`, URL giữ nguyên (đúng ở CP-3).
  - [Q6-A] `boot=error&path=/thue` → URL vẫn `/thue` (không sang `/dang-nhap`), hiện "Không tải được phiên đăng nhập." (`role="alert"`) + nút "Thử lại", nằm trong `.rooms-theme`; bấm "Thử lại" → thêm đúng 1 `POST /api/v1/auth/refresh` (gọi `__mock.setBoot('ok')` trước khi bấm → trang "Tổng quan" hiện lại). `boot=error&path=/ql` → cùng khối lỗi.
  - [Q6-A, A17] `boot=error&path=/` → "Trang đang được xây dựng", header có "Đăng nhập". (`/dang-nhap` khi `boot=error` kiểm ở CP-4, `/doi-mat-khau` ở CP-5.)
  - [FE-LOGIN-10] `PublicLayout`, `session=none`: menu có "Đăng nhập" → `/dang-nhap`. `session=tenant`: "Trang của tôi" → `/thue`; `session=manager`: "Trang của tôi" → `/ql`. Bấm link menu: URL đổi, **không** tải lại trang (`__mock.calls` không có refresh mới).
  - [FE-LOGIN-10, Q2-A] `TenantLayout`: menu đúng 2 mục "Tổng quan" → `/thue`, "Tài khoản" → `/thue/tai-khoan`; `StaffLayout` (manager và boss): đúng 2 mục "Việc hôm nay" → `/ql`, "Tài khoản" → `/ql/tai-khoan`; không mục nào khác. Nút "Đăng xuất" (từ `useSignOut`) là `<button>`; bấm → `POST /api/v1/auth/logout`, URL thành `/` (không ghé `/dang-nhap?next=…`), header `PublicLayout` lại hiện "Đăng nhập"; mở lại `/thue` → `/dang-nhap?next=%2Fthue`. Bấm nhanh 2 lần → chỉ 1 `POST /auth/logout`; trong lúc chạy nút `disabled`. Hành vi giống hệt ở `TenantLayout` và `StaffLayout`.
  - [FE-LOGIN-10, Q5-A] `session=manager&path=/ql` → một dòng chữ "Tòa đang quản lý: A01 · <tên>, A02 · <tên>", không có `<select>`; `session=boss` → đủ 3 tòa mock trả; `session=manager-empty` → "Chưa được giao tòa nào". Tên tòa dài 120 ký tự không tràn ngang ở 360px. `TenantLayout` không có dòng tòa.
  - [FE-LOGIN-11] `/thue` tiêu đề "Tổng quan", `/ql` tiêu đề "Việc hôm nay", mỗi trang có họ tên người dùng; không có số liệu nào khác.
  - [Q3-A, AUTH-10] `PublicLayout` (`/`): có `<footer>` với "Chung cư mini cho thuê tại Hà Nội." và liên hệ Boss từ `GET /api/v1/public/contact` (`contact=full`: "Điện thoại: …", link "Zalo", "Facebook"); `contact=error`/`none` → footer vẫn hiện, không có khối liên hệ, không lỗi console. `/thue` và `/ql`: **không** có `<footer class="rooms-footer">`.
  - [Q4-A] `/` và `/phong` → "Trang đang được xây dựng" trong `PublicLayout`; `/khong-co` → "Không tìm thấy trang" + link "Về trang chủ" → bấm → `/`.
  - [AUTH-10, A11] Test Node `ContactInfo`: đủ 3 trường → số điện thoại là chữ "Điện thoại: …", 2 link "Zalo", "Facebook" có `target="_blank"` và `rel` chứa `noopener`; chỉ `phone` → không link; `contact=null` hoặc cả 3 `null` → không render; `zaloUrl: 'javascript:alert(1)'` hoặc `http://…` → không có link Zalo. Trình duyệt `contact=unsafe` → không có link Zalo.
  - [KIT-01, KIT-10] Mọi trang nằm trong phần tử có class `rooms-theme`; header có logo `/images/rooms-logo.webp`.
  - [UI-07] Khung 360px, 3 layout: `document.documentElement.scrollWidth <= 360`; nút "Đăng xuất" và menu dùng được (menu di động mở/đóng, Escape đóng).
  - [UI-08, G-03] Tab qua header: mọi link/nút có viền focus; mọi chữ hiển thị và `aria-label` là tiếng Việt.

### CP-4 – Trang đăng nhập, khối liên hệ, schema

- **Task:** FE-LOGIN-12 · AUTH-01, AUTH-02, AUTH-04, AUTH-06, AUTH-10, G-04, UI-05, UI-08, UI-09
- **File (coder):** `<nháp>/src/features/auth/schemas.ts` (`loginSchema`), `<nháp>/src/features/auth/auth.css` (thêm cột form, khối báo thành công), `<nháp>/src/pages/public/LoginPage.tsx`, sửa `<nháp>/src/app/routes.tsx` (thêm `/dang-nhap` dưới `GuestOnly`), `<nháp>/src/app/guards.ts` (thêm `postLoginPath`) và `<nháp>/src/app/RequireAuth.tsx` (`GuestOnly` dùng `postLoginPath`, T5), sửa `<nháp>/package.json` (nối `tests/auth-login-flow.test.mjs` vào cuối `test:components`, sau 3 file test nháp kia), mở rộng mock trong `<nháp>/preview.html` nếu thiếu. Dùng lại `ContactInfo`, `usePublicContact` từ CP-3.
- **File (tester):** thêm phần `loginSchema` vào `<nháp>/tests/auth-schemas.test.mjs`; `<nháp>/tests/auth-login-flow.test.mjs` (luồng đăng nhập, `GuestOnly`, `postLoginPath`).
- **Done when:**
  - `node --test artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-schemas.test.mjs artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-login-flow.test.mjs` → `fail 0`.
  - `git diff --no-index package.json artifact_FE/2026-10-29-FE-LOGIN-04-16/package.json` → chỉ dòng `test:components` đổi, cuối dòng là `tests/auth-api.test.mjs tests/auth-guards.test.mjs tests/auth-schemas.test.mjs tests/auth-login-flow.test.mjs`.
  - `npx tsc -p <scratchpad>/tests/tsconfig.draft.json` → mã thoát 0.
  - Overlay dev server: `preview.html?path=/dang-nhap` đăng nhập được bằng `0900000004`/`matkhau123` (→ `/doi-mat-khau`) và `0900000002` (→ `/ql`); server và trình duyệt đã tắt.
- **Kịch bản test:**
  - [G-04] `loginSchema`: `'0900000004'` hợp lệ; `'090000000'` (9 số), `'09000000044'` (11 số), `'1900000004'`, `'09000a0004'`, `' 0900000004'`, `''` → lỗi `phone` "Số điện thoại không hợp lệ".
  - [AUTH-01] `password: ''` → "Vui lòng nhập mật khẩu"; `password: 'a'` hợp lệ (đăng nhập không kiểm độ dài).
  - [AUTH-01, AUTH-06] Trình duyệt: `0900000002`/`matkhau123` → `POST /api/v1/auth/login` body `{"phone":"0900000002","password":"matkhau123","remember":false}` → URL `/ql`. `0900000001` → `/ql`. Tick "Ghi nhớ đăng nhập" → body `remember: true`.
  - [AUTH-05] `0900000004` → `/doi-mat-khau` (không phải `/thue`).
  - [AUTH-06, A7] `path=/dang-nhap?next=%2Fql%2Ftai-khoan`, đăng nhập manager → `/ql/tai-khoan`. Cùng `next`, đăng nhập tenant (đã đổi mật khẩu trong mock) → `/thue`. `next=%2F%2Fevil.com` → trang chủ vai trò.
  - [AUTH-01] Sai mật khẩu → `FormError` (`role="alert"`) đúng "Số điện thoại hoặc mật khẩu không đúng"; ở lại trang; chữ đã gõ còn nguyên.
  - [AUTH-02] `0900000005` → "Tài khoản đã bị khóa. Liên hệ quản lý."
  - [AUTH-04] `0900000009` → "Bạn thao tác quá nhiều lần, vui lòng thử lại sau" (chữ API, UI-05).
  - [UI-05] Số sai định dạng gõ vào → lỗi zod dưới ô, **không** gọi API. Mock trả 400 `fields.phone` (bỏ qua zod bằng cách sửa mock) → chữ lỗi hiện dưới ô "Số điện thoại".
  - [UI-09] Đang gửi: nút `disabled` + spinner "Đang đăng nhập"; bấm thêm / Enter thêm → chỉ 1 `POST /auth/login`.
  - [AUTH-10, D-02] Dưới form: đúng chữ "Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng"; liên hệ Boss từ `GET /api/v1/public/contact` (trang và footer dùng chung: chỉ **1** request `GET /public/contact`); link "Xem phòng trống" → `/phong`; link "Quên mật khẩu?" → `/quen-mat-khau`. `contact=error` / `contact=none` → trang vẫn dùng được, không có khối liên hệ, không lỗi console.
  - [UI-08] Mỗi ô có nhãn; Tab: số điện thoại → mật khẩu → "Hiện" → "Ghi nhớ đăng nhập" → "Đăng nhập" → các link; Enter trong ô gửi form.
  - [UI-07] 360px: không tràn ngang; ô nhập chữ 16px.
  - [AUTH-T1] Sau đăng nhập, `localStorage` và `sessionStorage` rỗng (`localStorage.length === 0`).
  - [A16] Tiêu đề "Đăng nhập"; `path=/dang-nhap` với `state.notice='password-reset'` (đi từ CP-5) → khối `role="status"` "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới."; mở `/dang-nhap` thường → không có khối này.
  - [Q6-A, A17] `boot=error&path=/dang-nhap` → form dùng được; đăng nhập `0900000002` → `/ql` hiện bình thường (hết khối lỗi).
  - [AUTH-06, GuestOnly – chuyển từ CP-3] `session=tenant&path=/dang-nhap` → `/thue`; `session=manager&path=/dang-nhap` → `/ql`; `session=boss&path=/dang-nhap` → `/ql`; `session=tenant-must-change&path=/dang-nhap` → cuối cùng `/doi-mat-khau` (URL; trang đích "Không tìm thấy trang" tới CP-5). `session=tenant&path=/dang-nhap?next=%2Fql` → cuối cùng `/thue` (`next` không dùng được vì `/ql` không thuộc vùng của người thuê; T5). Lúc đang khởi động (`status='loading'`) chỉ hiện Spinner "Đang tải", không nháy form.
  - [AUTH-06, T5 – bộ test chuyển hướng sau đăng nhập trong `auth-login-flow.test.mjs`, fetch giả] Phải có: (a) đăng nhập manager với `next=/ql/tai-khoan` → `/ql/tai-khoan`; (b) **người đã đăng nhập (MANAGER) mở `/dang-nhap?next=/ql/tai-khoan` → dừng ở `/ql/tai-khoan`**; (c) TENANT đã đăng nhập + `next=/ql` → cuối cùng `/thue`; (d) `next=//evil.com` hoặc `next=/dang-nhap` → trang chủ vai trò. `postLoginPath`: `('MANAGER','/ql/tai-khoan')` → `/ql/tai-khoan`; `('TENANT', null)` → `/thue`; `('BOSS','https://evil.com')` → `/ql`.
  - [Tên test] Tester **đổi tên** test hiện có `'AUTH-06/T1: GuestOnly sends a signed-in user from /dang-nhap to their home (tenant /thue, manager /ql, boss /ql), dropping next'` sao cho tên đúng với điều nó kiểm: người thuê + `next=/ql` cuối cùng ở `/thue`, `next` không được dùng vì `/ql` không phải vùng của người thuê (không còn chữ "dropping next"). Tên vẫn bắt đầu bằng mã spec.
  - [Route chưa đăng ký] `/doi-mat-khau`, `/quen-mat-khau` vẫn "Không tìm thấy trang" ở CP-4; link "Quên mật khẩu?" chỉ kiểm URL `/quen-mat-khau`.

### CP-5 – Đổi mật khẩu, quên / đặt lại mật khẩu

- **Task:** FE-LOGIN-13, FE-LOGIN-14 · AUTH-03, AUTH-05, AUTH-07, UI-05 · Q7-A
- **File (coder):** `<nháp>/src/features/auth/schemas.ts` (thêm `forgotSchema`, `changePasswordSchema`, `resetPasswordSchema`), `<nháp>/src/features/auth/ChangePasswordForm.tsx`, `<nháp>/src/pages/public/ChangePasswordPage.tsx` (nút "Đăng xuất" dùng `<nháp>/src/features/auth/useSignOut.ts` có từ CP-3, không sửa hook), `<nháp>/src/pages/public/ForgotPasswordPage.tsx`, sửa `<nháp>/src/app/routes.tsx` (thêm `/doi-mat-khau` dưới `RequireAuth allow="any"`, `/quen-mat-khau`), `<nháp>/preview.html` nếu thiếu mock.
- **File (tester):** thêm test schema vào `<nháp>/tests/auth-schemas.test.mjs`.
- **Done when:** test Node `fail 0`; `tsc` mã thoát 0; overlay dev server: tenant bị buộc đổi đổi được mật khẩu và về `/thue`; `/quen-mat-khau?token=hople` đặt lại được và về `/dang-nhap` có câu báo; server và trình duyệt đã tắt.
- **Kịch bản test:**
  - [AUTH-03] `changePasswordSchema`: `newPassword` 7 ký tự → "Mật khẩu tối thiểu 8 ký tự"; 8 ký tự hợp lệ; `confirmPassword` khác → lỗi ở `confirmPassword` "Mật khẩu nhập lại không khớp" (A16); `currentPassword: ''` → "Vui lòng nhập mật khẩu hiện tại". `resetPasswordSchema` cùng biên 7/8 và khớp. `forgotSchema` cùng biên số điện thoại như CP-4.
  - [AUTH-05] `session=tenant-must-change&path=/doi-mat-khau`: tiêu đề "Đổi mật khẩu", câu "Bạn cần đổi mật khẩu trước khi tiếp tục"; đổi đúng → `POST /api/v1/auth/change-password` body `{ currentPassword, newPassword }` (không gửi `confirmPassword`) → `GET /auth/me` → URL `/thue`; mở lại `/doi-mat-khau` vẫn được (không buộc nữa, không có câu "Bạn cần…").
  - [UI-05] Sai mật khẩu hiện tại → dưới ô "Mật khẩu hiện tại": "Mật khẩu hiện tại không đúng"; `FormError` hiện `message` API. Mới = hiện tại → dưới ô "Mật khẩu mới": "Mật khẩu mới phải khác mật khẩu hiện tại".
  - [AUTH-05] `session=none&path=/doi-mat-khau` → `/dang-nhap?next=%2Fdoi-mat-khau`.
  - [Q6-A, A17 – chuyển từ CP-3] `boot=error&path=/doi-mat-khau` → khối lỗi "Không tải được phiên đăng nhập." + "Thử lại", URL giữ nguyên. `boot=error&path=/quen-mat-khau` → trang dùng được.
  - [Route chưa đăng ký] `/thue/tai-khoan`, `/ql/tai-khoan` vẫn "Không tìm thấy trang" tới CP-6.
  - [Q7-A] `session=tenant-must-change&path=/doi-mat-khau`: dưới form có `<button>` "Đăng xuất" (viền); bấm → `POST /api/v1/auth/logout`, URL `/` (không ghé `/dang-nhap?next=…`), header hiện "Đăng nhập"; mở lại `/thue` → `/dang-nhap?next=%2Fthue`. Nút "Đăng xuất" không gửi form đổi mật khẩu (`type="button"`, không có `POST /auth/change-password`). Bấm nhanh 2 lần → chỉ 1 `POST /auth/logout`, nút `disabled` khi đang chạy (cùng `useSignOut` với layout).
  - [AUTH-07] `/quen-mat-khau`: nhập `0900000004` → `POST /api/v1/auth/forgot-password` → form biến mất, hiện **đúng** câu "Nếu số điện thoại có email, chúng tôi đã gửi link đặt lại mật khẩu. Nếu không, hãy liên hệ quản lý." + liên hệ Boss. Nhập số khác bất kỳ hợp lệ → **cùng** câu, cùng giao diện (không lộ tài khoản). Số sai định dạng → lỗi dưới ô, không gọi API.
  - [AUTH-07] `/quen-mat-khau?token=hople`: hai ô "Mật khẩu mới", "Nhập lại mật khẩu mới"; gửi → body `{ token: 'hople', newPassword }` → URL `/dang-nhap` với câu "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới." (A16). `token=sai` → `FormError` đúng "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn" + link "Gửi lại liên kết" → `/quen-mat-khau` (A16); không có link ra ngoài app trên trang có token.
  - [UI-09] Đang gửi ở cả 3 form: nút `disabled` + spinner, không gửi đôi.
  - [UI-07, UI-08] 360px không tràn; mọi ô có nhãn; câu báo thành công có `role="status"`, không dùng màu lỗi.

### CP-6 – Trang tài khoản người thuê và nhân sự

- **Task:** FE-LOGIN-15 · AUTH-09, AUTH-03, UI-05, UI-06
- **File (coder):** `<nháp>/src/features/auth/schemas.ts` (thêm `tenantProfileSchema`, `staffProfileSchema`), `<nháp>/src/features/auth/ProfileForm.tsx`, `<nháp>/src/pages/tenant/TenantAccountPage.tsx`, `<nháp>/src/pages/staff/StaffAccountPage.tsx`, sửa `<nháp>/src/app/routes.tsx` (thêm 2 route `tai-khoan`), `<nháp>/preview.html` nếu thiếu mock.
- **File (tester):** thêm test schema vào `<nháp>/tests/auth-schemas.test.mjs`.
- **Done when:** test Node `fail 0`; `tsc` mã thoát 0; overlay dev server: lưu email người thuê và liên hệ quản lý thành công; server và trình duyệt đã tắt.
- **Kịch bản test:**
  - [AUTH-09] Schema: email `''` hợp lệ (→ `null` khi gửi), `a@b.vn` hợp lệ, `abc` → "Email không hợp lệ", 256 ký tự → lỗi, 255 hợp lệ. `contactPhone` `''` hợp lệ, biên G-04 như CP-4. `zaloUrl`/`facebookUrl`: `''` hợp lệ, `https://zalo.me/0900000002` hợp lệ, `http://zalo.me/x`, `zalo.me/x`, `javascript:alert(1)` → "Đường dẫn không hợp lệ".
  - [AUTH-09] `session=tenant&path=/thue/tai-khoan`: có khối đổi mật khẩu + ô "Email"; **không** có "Số điện thoại liên hệ", "Zalo", "Facebook", không có "Khách sẽ thấy:". Lưu `an@example.com` → `PATCH /api/v1/auth/me` body đúng `{"email":"an@example.com"}` → `GET /auth/me` → câu "Đã lưu." (A16). Tiêu đề "Tài khoản", khối "Đổi mật khẩu" và "Email". Xóa trống rồi lưu → body `{"email":null}` (A8).
  - [AUTH-09] `session=manager&path=/ql/tai-khoan`: đủ "Email", "Số điện thoại liên hệ", "Zalo", "Facebook"; gõ vào → "Khách sẽ thấy:" cập nhật ngay (số điện thoại chữ, link Zalo/Facebook); để trống hết → "Chưa có thông tin liên hệ" (A16). Khối tên "Thông tin liên hệ". Lưu → body có cả 4 khóa, ô trống là `null`.
  - [UI-05] Email `trung@example.com` → dưới ô "Email": "Email đã được sử dụng"; `FormError` hiện `message` API.
  - [AUTH-09 quyền] Mock 403 `FORBIDDEN` (người thuê gửi trường nhân sự, ép bằng mock) → `FormError` "Bạn không có quyền thực hiện thao tác này"; giao diện người thuê không bao giờ gửi các trường đó.
  - [AUTH-03] Đổi mật khẩu trên trang tài khoản (`afterSuccess="stay"`): thành công → ở lại trang, form trống, câu "Đã đổi mật khẩu."; biên 7/8 ký tự như CP-5.
  - [AUTH-06] `session=manager&path=/thue/tai-khoan` → `/ql`; `session=boss&path=/thue/tai-khoan` → `/ql`; `session=tenant&path=/ql/tai-khoan` → `/thue`; `session=boss&path=/ql/tai-khoan` → trang hiện bình thường.
  - [AUTH-06 – chuyển từ CP-3] `session=none&path=/ql/tai-khoan` → `/dang-nhap?next=%2Fql%2Ftai-khoan`; `session=none&path=/thue/tai-khoan` → `/dang-nhap?next=%2Fthue%2Ftai-khoan`. [AUTH-05] `session=tenant-must-change&path=/thue/tai-khoan` → `/doi-mat-khau`. [Q6-A] `boot=error&path=/ql/tai-khoan` → khối lỗi + "Thử lại".
  - [AUTH-T2] Trên trang tài khoản: `__mock.expireAccessToken()` rồi lưu → 1 refresh, PATCH thử lại thành công. `failNextRefresh()` + hết hạn → `/dang-nhap?next=%2Fql%2Ftai-khoan`.
  - [UI-09] Hai form độc lập: đang lưu form này không khóa form kia; không gửi đôi.
  - [UI-07, UI-08] 360px không tràn (URL Facebook dài 200 ký tự trong "Khách sẽ thấy:" xuống dòng); mọi ô có nhãn.

### CP-7 – Kiểm cuối cả bản nháp (FE-LOGIN-16)

- **Task:** FE-LOGIN-16 · toàn bộ. Không có file mới; coder chỉ sửa nếu kiểm tra trượt.
- **Done when:**
  - `npm run lint` → 0 lỗi (bao gồm file trong `artifact_FE/`).
  - `npm run build` → qua (bản chính, không đổi).
  - `npm run test:components` → 40/40 pass.
  - `node --test artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-api.test.mjs artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-guards.test.mjs artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-schemas.test.mjs artifact_FE/2026-10-29-FE-LOGIN-04-16/tests/auth-login-flow.test.mjs` → `fail 0`.
  - `npx tsc -p <scratchpad>/tests/tsconfig.draft.json` (include toàn bộ `src` nháp) → mã thoát 0.
  - Danh sách file trong thư mục nháp khớp đúng bảng mục 2 (+ `PLAN.md`, `REVIEW.md`); không file kit, không tsconfig/vite config, không `localStorage`.
  - Không còn dev server hay trình duyệt nào tester đã mở.
- **Kịch bản test:** chạy lại một lượt ngắn qua preview: 3 vai trò (`0900000001`, `0900000002`, `0900000004`) đăng nhập và vào đúng layout (AUTH-06, Phase 1 "3 roles log in and land in the right layout"); người thuê bị buộc đổi → `/doi-mat-khau` (AUTH-05); "Đăng xuất" ở 2 layout → `/`; mọi chữ tiếng Việt (G-03).

### Sau khi chủ dự án duyệt (phiên chính, không phải tester)

Chép bằng `apply-draft.mjs`; trên bản chính chạy `npm run lint`, `npm run build`, `npm run test:components` (40 + test mới). Kiểm tay "Done when" của FE-LOGIN-09 với 3 tài khoản seed và API thật (`npm run start:dev` ở backend + `npm run dev`), đúng điều kiện "Part done when" của file feature.
