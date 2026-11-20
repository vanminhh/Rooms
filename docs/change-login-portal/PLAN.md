# PLAN · Đăng nhập theo lối vào (BE-LP-01..03, FE-LP-01..03, QA-LP-01)

Yêu cầu của chủ dự án 20/11/2026: màn chào phân luồng luôn việc đăng nhập. Chọn "Tôi đang thuê" thì chỉ tài khoản người thuê đăng nhập được; chọn "Quản lý tòa nhà" thì chỉ quản lý và Boss. Sai thì **backend** từ chối, **không tạo phiên**. **Một trang đăng nhập dùng chung**, không làm trang riêng.

Luật đã ghi vào spec: D-43 (`00-overview.md`), AUTH-16 + SCOPE-05 + API + Acceptance (`10-auth.md`), mã lỗi `WRONG_PORTAL` (`01-architecture.md`), UI-11 + dòng `/dang-nhap?loi-vao=` (`30-frontend.md`). Task: [feature_login-portal.md](feature_login-portal.md).

Không đổi schema, không cài gói mới, không xóa file.

## 1. Cách chạy, nhìn từ người dùng

```
Màn chào ──"Tôi đang thuê"──► /thue ──(chưa đăng nhập)──► /dang-nhap?loi-vao=thue&next=/thue
         ──"Quản lý tòa nhà"─► /ql   ──(chưa đăng nhập)──► /dang-nhap?loi-vao=quan-ly&next=/ql
         ──"Tìm phòng"────────► /    (đăng nhập ở /dang-nhap như cũ, mọi vai trò)

/dang-nhap?loi-vao=thue    ──POST /auth/login { phone, password, remember, portal: 'TENANT' }
/dang-nhap?loi-vao=quan-ly ──POST /auth/login { …, portal: 'STAFF' }
/dang-nhap                 ──POST /auth/login { … }            (không portal: như hiện nay)
```

Không cần trang mới: màn chào đã đưa tới `/thue` và `/ql`; route guard (đã có) thêm `loi-vao` khi đẩy người chưa đăng nhập về trang đăng nhập. Nhờ vậy một link `/thue/...` gửi qua email cũng đi đúng lối người thuê.

## 2. Backend

**Tệp sửa**

| Tệp | Việc |
|---|---|
| `src/common/errors/error-code.ts` | thêm `WRONG_PORTAL` (403, chữ Việt của AUTH-16) |
| `src/common/i18n/messages.ts` | chữ tiếng Anh của `WRONG_PORTAL` |
| `src/modules/auth/dto/auth.dto.ts` | `LoginDto.portal?` với `@IsOptional() @IsIn(['TENANT','STAFF'])`, thông báo "Lối vào không hợp lệ" |
| `src/modules/auth/auth.service.ts` | kiểm `portal` trong `login()` |
| `src/app.setup.spec.ts` | số mã lỗi 31 → 32, thêm dòng `WRONG_PORTAL` vào bảng EXPECTED |
| `src/modules/auth/auth.login-portal.spec.ts` (mới) | test AUTH-16 |
| `test/auth.e2e-spec.ts` hoặc `test/scenarios` | ca e2e của BE-LP-03 |

**Vị trí kiểm trong `AuthService.login()`** (thứ tự giữ nguyên, chỉ chèn một bước):

1. Giới hạn 5 lần sai / số / 15 phút (AUTH-04) – không đổi.
2. Sai số hoặc sai mật khẩu → `INVALID_CREDENTIALS` – không đổi.
3. Tài khoản bị khóa → `ACCOUNT_LOCKED` – không đổi.
4. **Mới:** có `portal` mà vai trò không khớp bảng §3 → bỏ lượt đếm vừa ghi (`loginLimiter.remove`, giống bước 3) rồi `ForbiddenException(WRONG_PORTAL)`.
5. Khách chưa xác minh email → `EMAIL_NOT_VERIFIED` – không đổi (khách đã bị chặn ở bước 4 khi có `portal`).
6. Tạo phiên, cookie, `last_login_at` – không đổi.

Vì bước 4 đứng sau bước 2, người đoán mật khẩu không biết được số điện thoại có tài khoản hay là tài khoản gì. Không ghi `audit_logs` (AUD-01 không liệt kê đăng nhập).

Một hàm nhỏ trong service là đủ, không cần guard hay module mới:

```ts
// AUTH-16, D-43
const PORTAL_ROLES = { TENANT: ['TENANT'], STAFF: ['MANAGER', 'BOSS'] } as const
```

## 3. Bảng vai trò × lối vào (kỳ vọng của test, lấy từ AUTH-16)

| Tài khoản (seed) | không `portal` | `portal: TENANT` | `portal: STAFF` |
|---|---|---|---|
| Boss `0900000001` | đăng nhập | `WRONG_PORTAL` | đăng nhập |
| Quản lý `0900000002` | đăng nhập | `WRONG_PORTAL` | đăng nhập |
| Người thuê `0900000004` | đăng nhập (rồi bị buộc đổi mật khẩu) | đăng nhập | `WRONG_PORTAL` |
| Khách `0900000006` | đăng nhập | `WRONG_PORTAL` | `WRONG_PORTAL` |
| Bất kỳ, sai mật khẩu | `INVALID_CREDENTIALS` | `INVALID_CREDENTIALS` | `INVALID_CREDENTIALS` |
| Người thuê bị khóa `0900000005` | `ACCOUNT_LOCKED` | `ACCOUNT_LOCKED` | `ACCOUNT_LOCKED` |
| `portal: "ADMIN"` | – | `VALIDATION_FAILED` `fields.portal` | – |

Thêm: lần bị từ chối không tạo dòng `sessions`, không có `Set-Cookie`, `last_login_at` giữ nguyên; 6 lần `WRONG_PORTAL` liên tiếp không ra 429; `Accept-Language: en` → chữ tiếng Anh, `code` không đổi.

## 4. Frontend

| Tệp | Việc |
|---|---|
| `src/app/guards.ts` | `entryOf(pathname)`; `guardRedirect` thêm `loi-vao=thue` / `loi-vao=quan-ly` khi đẩy về `/dang-nhap`; `portalOf(param)` → `'TENANT' \| 'STAFF' \| undefined` |
| `src/features/auth/api.ts` | `loginRequest` gửi `portal` khi có |
| `src/app/auth-context.ts`, `AuthProvider.tsx` | `login({ …, portal? })` |
| `src/pages/public/LoginPage.tsx` | đọc `loi-vao`; tiêu đề theo lối vào; ẩn "Chưa có tài khoản? Đăng ký"; thêm link "Dùng trang đăng nhập chung" (giữ `next`); gửi `portal`; lỗi `WRONG_PORTAL` hiện `error.message` ở ô lỗi của form (đã có sẵn qua `applyApiError`) |
| `src/shared/i18n/vi.ts`, `en.ts` | khóa mới: `auth.portal.tenantTitle` "Đăng nhập người thuê" / "Tenant login", `auth.portal.staffTitle` "Đăng nhập quản lý" / "Staff login", `auth.portal.general` "Dùng trang đăng nhập chung" / "Use the general login page" |
| `EntryScreen.tsx` | **không đổi** |
| test mới `tests/lp/login-portal.test.mjs` + glob `tests/lp/*.test.mjs` trong `test:components` | §5 |

Thứ tự tham số trong URL cố định (`loi-vao` trước `next`) để test so chuỗi được.

## 5. Test sẽ đỏ và cách sửa

| Tệp | Vì sao | Sửa |
|---|---|---|
| `Source/backend/src/app.setup.spec.ts` | đếm đúng 31 mã lỗi | 32, thêm dòng `WRONG_PORTAL` 403 |
| test catalog tiếng Anh của BE (`common/i18n/i18n.spec.ts`) | đòi mọi mã có chữ Anh | tự xanh khi BE-LP-01 thêm chữ |
| `Source/frontend/tests/auth-guards.test.mjs` dòng ~49, 51, 158 | URL chuyển hướng của `/thue`, `/ql` có thêm `loi-vao` | đổi kỳ vọng theo §4 |
| `Source/frontend/tests/auth-login-flow.test.mjs` dòng ~566, 641, 642 | như trên | như trên |
| `ui-30-login`, `ex3-auth-pages`, `ex3-i18n` | chữ / khóa mới | thêm khóa, giữ chữ cũ của trang chung |

Các test mở thẳng `/dang-nhap?next=%2Fql` (không `loi-vao`) vẫn đúng vì trang chung không đổi hành vi.

## 6. Kiểm tay (QA-LP-01)

Dùng tài khoản seed trên DB dev, cả tiếng Việt và English, ở 360 px và desktop:

1. Màn chào → "Tôi đang thuê" → trang có tiêu đề "Đăng nhập người thuê", không có link đăng ký.
2. Đăng nhập quản lý `0900000002` → báo lỗi `WRONG_PORTAL`, vẫn ở trang đăng nhập, F5 vẫn chưa đăng nhập.
3. Đăng nhập người thuê `0900000004` → vào được (bị buộc đổi mật khẩu theo AUTH-05).
4. Màn chào → "Quản lý tòa nhà" → "Đăng nhập quản lý"; người thuê bị từ chối; quản lý và Boss vào `/ql`.
5. Khách `0900000006` bị từ chối ở cả hai lối, vào được ở `/dang-nhap`.
6. Link "Dùng trang đăng nhập chung" mở `/dang-nhap` giữ `next`.
7. Sai mật khẩu ở lối vào nào cũng chỉ ra "Số điện thoại hoặc mật khẩu không đúng".

## 7. Câu hỏi (đã trả lời 20/11/2026: cả ba theo đề xuất in đậm, spec không phải sửa thêm)

- **OQ-LP-1** Người **đã đăng nhập** (ví dụ quản lý) mở màn chào và chọn "Tôi đang thuê": không có lần đăng nhập nào để chặn. (a) **giữ như AUTH-06: đưa về khu của mình (`/ql`), không báo gì** · (b) đưa về khu của mình và hiện một dòng "Bạn đang đăng nhập bằng tài khoản quản lý" · (c) đăng xuất rồi mở trang đăng nhập người thuê.
- **OQ-LP-2** Trang đăng nhập chung `/dang-nhap` vẫn cho mọi vai trò (đã ghi trong D-43 theo câu trả lời "lối Tìm phòng và trang thường vẫn cho mọi tài khoản"). Có muốn bỏ link "Dùng trang đăng nhập chung" ở hai lối vào để người dùng không vòng qua được? (a) **giữ link** (đây là phân luồng, không phải bảo mật; quyền vẫn do vai trò quyết định) · (b) bỏ link.
- **OQ-LP-3** Chữ báo lỗi: (a) **một câu chung như AUTH-16** · (b) hai câu riêng: "Đây không phải tài khoản người thuê" / "Đây không phải tài khoản quản lý" (cần hai mã lỗi hoặc FE tự chọn chữ theo lối vào).

## 8. Điểm dừng

1. ⏸ BE-LP-01..03 – backend + e2e.
2. ⏸ FE-LP-01..03 – frontend.
3. ⏸ QA-LP-01 – reviewer + kiểm tay.

Ước lượng: backend ~4 tệp sửa + 1 spec mới; frontend ~6 tệp sửa + 1 test mới; khoảng 6 khóa i18n mới.
