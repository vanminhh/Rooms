# PLAN · Phase Extra · EX-1 – Tài khoản khách + mã xác minh **email** (BE-EX-33..35, BE-EX-07..09)

Cập nhật 12/11/2026 sau khi chủ dự án bỏ mã SMS (D-25 bản cuối). BE-EX-01..06 **đã làm và đã commit** với mã SMS; kế hoạch này chỉ còn phần chuyển sang email và phần còn lại của part.

Nguồn: `docs/phase-extra-home101/feature_ex-1-backend-guest-accounts.md` (bản mới), `docs/spec/10-auth.md` (AUTH-07, AUTH-11..15, SCOPE-03, SCOPE-05), `docs/spec/00-overview.md` (D-25, D-26, A-11, Q-14), `docs/spec/01-architecture.md` (API-02/03/07, bảng mã lỗi, AUTH-T1..T3, DEP-02, DEP-05, DEP-08, LOC-02/06), `docs/spec/02-database.md` (DB-07, "Planned changes" EX-1), `docs/LESSONS.md`, và mã nguồn hiện tại.

Quy tắc đã chốt (chủ dự án 12/11/2026) – **không hỏi lại**: bỏ `users.phone_verified_at`; đổi `phone_otps` thành bảng mã email (`phone` → `email`); xóa module `sms` và test của nó (`.env` do chủ dự án tự sửa); **tạo file migration được duyệt, áp vào DB phải xin OK riêng**; `locale` lúc đăng ký lấy từ `Accept-Language`; tài khoản khách chưa xác minh đã bị khóa thì không bao giờ được hồi sinh; `/auth/forgot-password` và `/auth/resend-code` luôn 200 với body y nhau, lỗi chỉ ghi log; mã mới vô hiệu hóa mã cũ chưa dùng; GUEST chưa xác minh đăng nhập thì kiểm mật khẩu trước.

## 1. Mục tiêu và phạm vi

| Task | Nội dung | Spec |
|---|---|---|
| BE-EX-33 ⏸ | Migration **mới** `email_verification` trên nền `guest_accounts`: `users.email_verified_at`, bỏ `users.phone_verified_at`, `phone_otps` → `email_otps` (`phone` → `email`, bỏ `purpose`); `constraints.sql` + `check-constraints.mjs` theo sau (62 → **63** tình huống) | DB-07, AUTH-11..15 |
| BE-EX-34 | `MailerService` có nhánh "production chưa cấu hình" → `MAIL_UNAVAILABLE`; `OtpService` chuyển đích từ số điện thoại sang email; mã lỗi: thêm `EMAIL_TAKEN`, `EMAIL_NOT_VERIFIED`, `MAIL_UNAVAILABLE`, bỏ `PHONE_NOT_VERIFIED`, `SMS_UNAVAILABLE`; xóa `src/modules/sms/` | AUTH-13, A-11, Q-14 |
| BE-EX-35 ⏸ | `POST /auth/register` thêm `email`; `POST /auth/verify-email`; `POST /auth/resend-code { phone }`; bỏ `/auth/phone/send-code` và `/auth/phone/verify`; login GUEST chưa xác minh → `EMAIL_NOT_VERIFIED`; `/auth/me` có `emailVerified` | AUTH-11, AUTH-12, AUTH-14 |
| BE-EX-07 | Quên mật khẩu cho khách: vẫn là link email của Phase 1; GUEST chưa xác minh email không nhận link; phản hồi y nhau ở mọi nhánh | AUTH-07 |
| BE-EX-08 | `GUEST` trong `@Roles`, helper `/me/*`, `locale` trong `GET/PATCH /auth/me`, seed thêm 1 GUEST đã xác minh | API-07, SCOPE-03, SCOPE-05, AUTH-15, DEP-08 |
| BE-EX-09 ⏸ | lint + test + build + e2e + reviewer | – |

**Ngoài phạm vi**: bản tiếng Anh của thông điệp lỗi và email (EX-3, LOC-02/LOC-06), adapter Resend thật (EX-8 / BE-EX-30, Q-14), lịch xem phòng (EX-6), biến GUEST thành TENANT (Phase 3, CON-07), mọi thay đổi FE (EX-2), sửa `.env` (chủ dự án).

**Không làm nữa** (phần SMS đã viết ở BE-EX-02..06): module `sms`, purpose `VERIFY_PHONE` / `RESET_PASSWORD`, route `/auth/phone/*`, nhánh đặt lại mật khẩu bằng mã.

## 2. Kiến trúc

```
   POST /auth/register, /auth/verify-email, /auth/resend-code,
        /auth/forgot-password, /auth/reset-password        (@Public)
   GET/PATCH /auth/me, /auth/change-password, /auth/logout (@Roles 4 vai trò)
                              │
                     AuthController (thin)
                              │
        ┌─────────────────────┴───────────────────────┐
   AuthService ───────────── OtpService ───────► MailerService (abstract)
   (login, register, me,    (sinh / giới hạn /        │
    verifyEmail, resend,     tiêu thụ mã 6 số          ├─ ConsoleMailerService (dev, test)
    forgot/reset)            theo **địa chỉ email**)   └─ UnavailableMailerService (production
        │                         │                       chưa có provider → MAIL_UNAVAILABLE)
        │                   RateLimiter (10 mã/IP/giờ, in-memory, DEP-02)
        │                         │
        └──────────── PrismaService ──────────────────┘
                users · sessions · password_reset_tokens · email_otps
                (5 mã/email/ngày đếm từ email_otps, pg_advisory_xact_lock theo email)
```

`src/modules/sms/` biến mất; `AuthModule.imports` chỉ còn `JwtModule`, `AuditModule`, `MailerModule`. **Không** thêm module nào vào `AppModule` (LESSONS BE-P2-10).

### 2.1 Tệp thêm / sửa / xóa

| Tệp | Việc |
|---|---|
| `prisma/schema.prisma` | `User.emailVerifiedAt` thay `phoneVerifiedAt`; `model EmailOtp` thay `model PhoneOtp`; bỏ `enum OtpPurpose`. Sửa tay từng dòng, **không chạy `prisma format`** (LESSONS BE-EX-01) |
| `prisma/migrations/20261112010000_email_verification/migration.sql` (mới) | SQL ở §2.3 – viết tay, chỉ tạo file |
| `prisma/schema.sql` | sinh lại bằng `migrate diff --from-empty` (file này checker đọc) |
| `prisma/constraints.sql` | 3 dòng `phone_otps_*` → 3 dòng `email_otps_*` (§2.3) |
| `prisma/check-constraints.mjs` | hằng `OTP`, 4 tình huống mã SMS → 5 tình huống mã email: 62 → **63** |
| `prisma/seed.ts`, `prisma/seed.spec.ts` | BE-EX-08: thêm GUEST `0900000006` (§2.7) |
| `src/modules/mailer/mailer.service.ts` | thêm `UnavailableMailerService` (ném `MAIL_UNAVAILABLE` 503) |
| `src/modules/mailer/mailer.module.ts` | `mailerServiceFor(env)` chọn provider theo `NODE_ENV` (§2.4) |
| `src/modules/mailer/mailer.service.spec.ts` (mới) | 3 test của §2.4 |
| `src/modules/auth/otp.service.ts` | đích là email, bỏ `purpose`, gửi qua `MailerService`, `MAIL_UNAVAILABLE` (§2.5) |
| `src/modules/auth/auth.service.ts` | `register` nhận email + thay thế theo phone **hoặc** email; `verifyEmail`; `resendCode`; login → `EMAIL_NOT_VERIFIED`; `forgotPassword` bỏ qua GUEST chưa xác minh; `Me.emailVerified`; bỏ `sendPhoneCode`, `verifyMyPhone`, `unverifiedSelf` |
| `src/modules/auth/auth.controller.ts` | `verify-phone` → `verify-email`; bỏ 2 route `/auth/phone/*` |
| `src/modules/auth/dto/auth.dto.ts` | `RegisterDto.email`; `VerifyPhoneDto` → `VerifyEmailDto`; `ResendCodeDto` bỏ `purpose`; bỏ `PhoneCodeDto`; `UpdateMeDto` thêm `locale` (BE-EX-08) |
| `src/modules/auth/auth.module.ts` | bỏ `SmsModule` |
| `src/common/errors/error-code.ts` | bỏ `PHONE_NOT_VERIFIED`, `SMS_UNAVAILABLE`; thêm `EMAIL_TAKEN` 409, `EMAIL_NOT_VERIFIED` 403, `MAIL_UNAVAILABLE` 503 |
| `src/common/errors/db-errors.ts` (+ spec) | thêm `users_email_key → EMAIL_TAKEN` (lưới an toàn cho P2002 khi hai đăng ký song song) |
| `src/common/guards/auth.decorators.ts`, `src/common/scope/scope.ts` | BE-EX-08: `MeRoles()` / `TenantMeRoles()`; `allowedBuildingIds` trả `[]` cho mọi vai trò không phải MANAGER |
| **xóa** `src/modules/sms/sms.service.ts`, `sms.module.ts`, `sms.service.spec.ts` | chủ dự án đã đồng ý (BE-EX-34) |
| Test phải sửa | §5 |
| `docs/spec/01-architecture.md` (DEP-08), `docs/spec/02-database.md` (bỏ 2 dòng EX-1 ở "Planned changes"), `docs/phase-extra-home101/PROGRESS.md` | cập nhật ở CP-3 |

### 2.2 Schema (Prisma)

```prisma
model User {
  // ... giữ nguyên
  emailVerifiedAt DateTime? @map("email_verified_at") @db.Timestamptz // AUTH-12 (thay phoneVerifiedAt)
  locale          String    @default("vi") @db.VarChar(2)             // AUTH-15, CHECK users_locale
}

// Mã xác minh email (AUTH-13). Không FK tới users: email lạ cũng được đếm hạn mức.
model EmailOtp {
  id        Int       @id @default(autoincrement())
  email     String    @db.VarChar(255) // luôn lowercase, CHECK email_otps_email_format
  codeHash  String    @map("code_hash") // sha256Hex(`${email}:${code}`)
  tries     Int       @default(0)
  expiresAt DateTime  @map("expires_at") @db.Timestamptz
  usedAt    DateTime? @map("used_at") @db.Timestamptz // đã dùng HOẶC bị mã mới vô hiệu hóa
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz

  @@index([email, createdAt])
  @@map("email_otps")
}
```

`enum OtpPurpose` bị **bỏ hẳn**: sau khi bỏ SMS chỉ còn một mục đích (đăng ký) – quên mật khẩu dùng link email (AUTH-07), `/auth/phone/*` không còn – và danh sách cột của bảng mã email trong `02-database.md` ("email, code hash, tries, expiry, used time") cũng không có `purpose`. Nhờ đó `email_otps_one_active` chỉ theo `email`, mã mới luôn vô hiệu hóa mã cũ của cùng địa chỉ.

### 2.3 Migration `email_verification` (BE-EX-33)

Chạy trên DB **đã có** `guest_accounts` (áp vào dev 12/11/2026). Prisma sinh ra sẽ là "drop + create", nên file viết tay (`migrate dev --create-only` rồi thay nội dung) để giữ dữ liệu và tên index đúng quy ước Prisma.

```sql
-- EX-1 / BE-EX-33: email thay số điện thoại làm đích xác minh (D-25 bản cuối, AUTH-11..15).
-- Tiền đề: migration guest_accounts đã chạy.

-- 1. users: email_verified_at thay phone_verified_at (chủ dự án 12/11/2026 đồng ý bỏ cột)
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ;
ALTER TABLE "users" DROP COLUMN "phone_verified_at";

-- 2. phone_otps -> email_otps. Mã chỉ sống 5 phút nên xóa hết dòng cũ
--    (giá trị cũ là số điện thoại, sẽ vi phạm CHECK email ở bước 4).
DELETE FROM "phone_otps";
ALTER TABLE "phone_otps" RENAME TO "email_otps";
ALTER SEQUENCE "phone_otps_id_seq" RENAME TO "email_otps_id_seq";
ALTER TABLE "email_otps" RENAME CONSTRAINT "phone_otps_pkey" TO "email_otps_pkey";
ALTER TABLE "email_otps" RENAME COLUMN "phone" TO "email";
ALTER TABLE "email_otps" ALTER COLUMN "email" TYPE VARCHAR(255);
ALTER TABLE "email_otps" DROP COLUMN "purpose";
DROP TYPE "OtpPurpose";

-- 3. Index: chỉ còn (email, created_at) vì không còn purpose
DROP INDEX "phone_otps_phone_purpose_created_at_idx";
ALTER INDEX "phone_otps_phone_created_at_idx" RENAME TO "email_otps_email_created_at_idx";
DROP INDEX "phone_otps_one_active";
CREATE UNIQUE INDEX "email_otps_one_active" ON "email_otps" ("email") WHERE "used_at" IS NULL;

-- 4. CHECK (bản sao đúng từng chữ của các dòng mới trong constraints.sql, DB-07)
ALTER TABLE "email_otps" DROP CONSTRAINT "phone_otps_phone_vn";
ALTER TABLE "email_otps" RENAME CONSTRAINT "phone_otps_tries" TO "email_otps_tries";
ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_email_format"
  CHECK (email = lower(email) AND email LIKE '%_@_%._%' AND length(email) <= 255);
```

`constraints.sql`: 3 dòng khối "Mã SMS" được thay (DB tạo mới từ đầu phải giống DB đã migrate):

```sql
-- Mã xác minh email (AUTH-13, EX-1): email lowercase, tối đa 5 lượt sai, mỗi email chỉ một mã chưa dùng
ALTER TABLE email_otps ADD CONSTRAINT email_otps_email_format CHECK (email = lower(email) AND email LIKE '%_@_%._%' AND length(email) <= 255);
ALTER TABLE email_otps ADD CONSTRAINT email_otps_tries CHECK (tries BETWEEN 0 AND 5);
CREATE UNIQUE INDEX email_otps_one_active ON email_otps (email) WHERE used_at IS NULL;
```

`users.email` giữ nguyên (`@unique`, `VarChar(255)`, không CHECK): dữ liệu cũ do staff nhập có thể chữ hoa, thêm CHECK bây giờ là một migration có thể thất bại. BE đã `toLowerCase()` ở `updateMe` và sẽ làm vậy ở `register`. `check-constraints.mjs` (`OTP` → `INSERT INTO email_otps (email, code_hash, expires_at)`), 62 → **63** tình huống:

| Nhóm | Tình huống | Spec | Mong đợi |
|---|---|---|---|
| Mã email | Hai mã chưa dùng cho cùng email | AUTH-13 | `email_otps_one_active` |
| Mã email | Mã cũ đã dùng + mã mới chưa dùng | AUTH-13 | `ok` |
| Mã email | `email = '12345'` | AUTH-13 | `email_otps_email_format` |
| Mã email | `email = 'Khach@Example.com'` (chữ hoa) | AUTH-13 | `email_otps_email_format` |
| Mã email | `tries = 6` | AUTH-13 (tối đa 5 lượt) | `email_otps_tries` |
| 58 tình huống còn lại | – | DB-07 | không đổi, vẫn PASS |

Hai tình huống `locale` và hai tình huống "GUEST không được làm quản lý / đứng tên hợp đồng" giữ nguyên (trigger không sửa).

### 2.4 Phía gửi thư (BE-EX-34)

```ts
// mailer.service.ts
export abstract class MailerService { abstract send(mail: Mail): Promise<void> }
@Injectable() export class ConsoleMailerService extends MailerService { send(mail: Mail): Promise<void> }
// Production chưa có provider: mọi lần gửi thất bại, không request nào báo thành công mà thư không đi (AUTH-13, Q-14)
@Injectable() export class UnavailableMailerService extends MailerService { send(): Promise<void> } // reject MAIL_UNAVAILABLE

// mailer.module.ts
export const mailerServiceFor = (env: NodeJS.ProcessEnv): MailerService =>
  env.NODE_ENV === 'production' ? new UnavailableMailerService() : new ConsoleMailerService();
```

- EX-1 **chưa** có adapter thật, nên "production" = "chưa cấu hình `MAIL_*`" (`shortcut:` ghi trong mã: khi BE-EX-30 thêm adapter Resend, điều kiện thành `production && !MAIL_API_KEY`). Lợi thêm: production không còn ghi link đặt lại mật khẩu ra log.
- `env.ts` **không đổi**: không biến `MAIL_*`/`SMS_*` nào bắt buộc, app khởi động không cần chúng (DEP-05, mã lỗi `MAIL_UNAVAILABLE` ghi rõ "the app still starts without one").
- Nội dung thư mã xác minh `[ASSUMPTION]`: subject `Mã xác minh – Trọ Thông Minh`, text `Mã xác minh của bạn là 123456. Mã có hiệu lực 5 phút.\n\nNếu không phải bạn yêu cầu, hãy bỏ qua email này.` Chỉ tiếng Việt ở part này (LOC-06 thuộc EX-3).

### 2.5 `OtpService` sau khi chuyển (AUTH-13, A-11)

Hằng số giữ nguyên trừ tên: `OTP_TTL_MS = 5 phút`, `OTP_MAX_TRIES = 5`, `OTP_RESEND_MS = 60 s`, `OTP_PER_EMAIL_PER_DAY = 5` (thay `OTP_PER_PHONE_PER_DAY`), `OTP_PER_IP_PER_HOUR = 10`. `hanoiDayStart` giữ nguyên.

```ts
@Injectable() export class OtpService {
  constructor(prisma: PrismaService, mailer: MailerService)
  takeIp(ip: string | undefined): void                       // 10/IP/giờ, đồng bộ trước await đầu tiên → 429
  lock(tx: Tx, email: string): Promise<void>                 // pg_advisory_xact_lock(hashtext('otp:' + email))
  issue(tx: Tx, email: string, now?: Date): Promise<IssuedCode>   // 5/email/ngày + chờ 60 s → 429
  deliver(email: string, issued: IssuedCode): Promise<void>  // gửi thư; lỗi → xóa dòng + 503 MAIL_UNAVAILABLE
  send(email: string, ip: string | undefined): Promise<void> // takeIp + issue (1 transaction) + deliver
  check(email: string, code: string, now?: Date): Promise<number>  // sai/hết hạn/đã dùng/hết lượt → 400 OTP_INVALID
  markUsed(tx: Tx, id: number, now?: Date): Promise<void>
}
```

Thay đổi so với bản SMS: tham số `phone` → `email` (gọi viên đã `trim().toLowerCase()`), bỏ tham số `purpose` ở mọi hàm và mọi `where`, `hashCode = sha256Hex(`${email}:${code}`)`, `prisma.phoneOtp` → `prisma.emailOtp`, `sms.send({to, text})` → `mailer.send({to, subject, text})`, `SMS_UNAVAILABLE` → `MAIL_UNAVAILABLE`. Các bảo đảm song song **không đổi** (LESSONS BE-LOGIN-12): advisory lock theo email trước khi đếm-rồi-ghi; `record(ip)` đồng bộ trước `await`; `updateMany({ where: { id, usedAt: null, tries: { lt: 5 } } })` để một mã chỉ dùng được một lần và 5 lượt sai không bị vượt khi đoán song song.

### 2.6 Hợp đồng API (BE-EX-35, BE-EX-07, BE-EX-08)

Thành công bọc `{ data }` (API-02), lỗi `{ error: { code, message, fields? } }` (API-03).

| Method · Path | Quyền | Request | Thành công | Lỗi |
|---|---|---|---|---|
| `POST /auth/register` | `@Public` | `{ fullName: 1..100, phone: ^0[0-9]{9}$, email: IsEmail ≤255, password: ≥8 }` | **201** `{ data: null }` | 400 `VALIDATION_FAILED` (+`fields`), 409 `PHONE_TAKEN`, 409 `EMAIL_TAKEN`, 429 `TOO_MANY_REQUESTS`, 503 `MAIL_UNAVAILABLE` |
| `POST /auth/verify-email` | `@Public` | `{ phone, code: ^[0-9]{6}$ }` | 200 `{ data: { accessToken, user: Me } }` + cookie `rt` | 400 `VALIDATION_FAILED`, 400 `OTP_INVALID`, 403 `ACCOUNT_LOCKED` |
| `POST /auth/resend-code` | `@Public` | `{ phone }` | 200 `{ data: null }` **luôn luôn, body y nhau** | chỉ 400 `VALIDATION_FAILED` khi `phone` sai định dạng |
| `POST /auth/forgot-password` | `@Public` | `{ phone }` | 200 `{ data: null }` **luôn luôn, body y nhau** | chỉ 400 `VALIDATION_FAILED` |
| `POST /auth/reset-password` | `@Public` | `{ token, newPassword }` | 200 `{ data: null }` | 400 `VALIDATION_FAILED` (`fields.token` = `RESET_LINK_MSG`) – **không đổi so với Phase 1** |
| `POST /auth/login` | `@Public` | không đổi | không đổi | **mới**: 403 `EMAIL_NOT_VERIFIED` khi `role = GUEST` và `email_verified_at IS NULL`, **chỉ sau khi mật khẩu đúng**; không tự gửi mã |
| `GET /auth/me` | `@Roles` 4 vai trò, `@AllowPasswordChangeRequired` | – | 200 `{ data: Me }` | 401 |
| `PATCH /auth/me` | `@Roles` 4 vai trò | `UpdateMeDto` (+ `locale`) | 200 `{ data: Me }` | 400 `fields.locale`, 403 `FORBIDDEN` (GUEST/TENANT gửi trường của staff) |
| ~~`POST /auth/phone/send-code`~~, ~~`POST /auth/phone/verify`~~ | – | – | **bị xóa** (tài khoản do staff tạo không cần xác minh, AUTH-12) | đường dẫn lạ → 404 `NOT_FOUND` |

```ts
export interface Me {
  id: number; role: Role; phone: string; fullName: string; email: string | null;
  mustChangePassword: boolean; emailVerified: boolean; locale: string;   // emailVerified thay phoneVerified
  contactPhone: string | null; zaloUrl: string | null; facebookUrl: string | null;
  buildings?: MeBuilding[];  // chỉ BOSS và MANAGER
}
export class RegisterDto    { fullName: string; phone: string; email: string; password: string }
export class VerifyEmailDto { phone: string; code: string }
export class ResendCodeDto  { phone: string }
export class UpdateMeDto    { email?: string | null; contactPhone?: string | null; zaloUrl?: string | null; facebookUrl?: string | null; locale?: 'vi' | 'en' }
```

Hành vi phải đúng từng chữ:

- **AUTH-11 `register`.** Chuẩn hóa `email = dto.email.trim().toLowerCase()`, `fullName = dto.fullName.trim()`. `takeIp(ip)`, băm mật khẩu, rồi **một** `$transaction`: `lock(tx, 'otp:' + email)` và `lock(tx, 'reg:' + phone)` (thứ tự cố định, email trước – hai đăng ký cùng số hoặc cùng email bị tuần tự hóa, không deadlock), tìm `byPhone` và `byEmail`, xử lý theo bảng dưới, rồi `otp.issue(tx, email)`; `otp.deliver` **sau khi commit**. P2002 trên `users_phone_key` / `users_email_key` (lưới an toàn) → `PHONE_TAKEN` / `EMAIL_TAKEN`.
  "Tài khoản tự đăng ký chưa từng xác minh" = `role === 'GUEST' && emailVerifiedAt === null` (staff không bao giờ tạo GUEST) **và** `isActive === true` (bị khóa thì không hồi sinh, D-26).

  | `byPhone` | `byEmail` | Kết quả |
  |---|---|---|
  | – | – | tạo `GUEST` mới: `emailVerifiedAt = null`, `mustChangePassword = false`, `locale` theo `Accept-Language` |
  | cùng một dòng, thay thế được | | thay `fullName`, `passwordHash`, `locale`; gửi mã mới; mật khẩu cũ hết tác dụng |
  | một bên có, thay thế được | bên kia trống | thay như trên **và** ghi luôn trường còn lại (đổi email của chính tài khoản giữ chỗ, hoặc đổi số) |
  | `byPhone` không thay thế được (đã xác minh / staff / bị khóa) | bất kỳ | 409 `PHONE_TAKEN`, `fields.phone = 'Số điện thoại đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu'` |
  | `byPhone` trống hoặc thay thế được | `byEmail` không thay thế được | 409 `EMAIL_TAKEN`, `fields.email = 'Email đã được dùng cho tài khoản khác'` |
  | hai dòng **khác nhau**, cả hai đều thay thế được | | 409 `EMAIL_TAKEN` `[ASSUMPTION]` – không gộp hai tài khoản (AUTH-14). Xem Q-EX1-10 |

  Thứ tự kiểm: số điện thoại trước, email sau (acceptance của spec 10 nêu `PHONE_TAKEN` trước). Mọi nhánh lỗi: không ghi gì, không gửi thư.
- **AUTH-12 `verify-email`.** `user = findUnique({ phone })`; không có user, hoặc `user.email` null → 400 `OTP_INVALID` (body y nhau, không tiết lộ tài khoản). `isActive === false` → 403 `ACCOUNT_LOCKED`, không đặt `emailVerifiedAt`. Rồi `codeId = otp.check(user.email, dto.code)` và **một** `$transaction`: `markUsed`, `user.update({ emailVerifiedAt: now })`, `startSession` → trả đúng phần như login (AUTH-T1, AUTH-T2; cookie `rt` path `/api/v1/auth`). Tài khoản đã xác minh không còn mã chưa dùng nên tự nhiên nhận `OTP_INVALID`.
- **AUTH-13 `resend-code`.** Trả 200 ngay, việc gửi chạy sau (`void ... .catch(log)`) để cả body lẫn thời gian trả lời không tiết lộ gì (LESSONS BE-LOGIN-18). Đủ điều kiện = `isActive && role === 'GUEST' && emailVerifiedAt === null && email !== null` → `otp.send(user.email, ip)`. Hạn mức và lỗi gửi chỉ ghi log.
- **AUTH-07 `forgot-password`.** Giữ nguyên Phase 1, thêm một điều kiện bỏ qua: GUEST chưa xác minh email không nhận link ("An account whose email is not verified yet gets no link"). Tài khoản do staff tạo (MANAGER/TENANT/BOSS) **vẫn** nhận link như Phase 1 dù `email_verified_at` null – họ không có luồng xác minh nào (AUTH-12), xem Q-EX1-12. `forgotLimiter` 5 request/15 phút giữ nguyên; mọi nhánh trả `200 { data: null }`.
- **AUTH-15 `locale`.** `PATCH /auth/me` nhận `'vi' | 'en'` cho mọi vai trò; giá trị khác hoặc `null` → 400 `fields.locale`.
- **SCOPE-03 / SCOPE-05 (BE-EX-08).** `MeRoles() = Roles('GUEST','TENANT')` (xem phòng, thông báo, tài khoản) và `TenantMeRoles() = Roles('TENANT')` (hợp đồng, hóa đơn, yêu cầu; GUEST → 403 `FORBIDDEN`). Guard không đổi. `getMe` trả `buildings` chỉ khi `BOSS`/`MANAGER`; `updateMe` chặn `contactPhone`/`zaloUrl`/`facebookUrl` với `TENANT` và `GUEST`; `allowedBuildingIds` trả `[]` cho mọi vai trò không phải MANAGER. Route của staff không thêm `GUEST` → 403 nhờ mặc định-từ-chối (SCOPE-01).

### 2.7 Seed dev (BE-EX-08, DEP-08)

`DevAccount` thêm `'guest'` vào `key`, `'GUEST'` vào `role`, và trường `email?: string`. Dòng mới:
`{ key: 'guest', role: 'GUEST', phone: '0900000006', fullName: 'Đỗ Thị Khách', email: 'guest@example.com', password: 'Khach@2026', mustChangePassword: false, isActive: true }` – `create` đặt `emailVerifiedAt: now`, `locale: 'vi'`; `contact_phone` null như TENANT (sửa điều kiện `role === 'TENANT'` thành `TENANT || GUEST`); `update` của upsert đặt lại cả `emailVerifiedAt` để re-seed luôn cho tài khoản đã xác minh `[ASSUMPTION]`. Ghi tài khoản này vào danh sách tài khoản dev ở DEP-08 (`01-architecture.md`).

## 3. Câu hỏi bỏ ngỏ

Xem mục 6 (cuối file) – chỉ còn những gì spec và các câu trả lời ngày 12/11/2026 chưa định.

`[ASSUMPTION]` kế hoạch dùng: A-11 (toàn bộ tham số mã email); câu chữ tiếng Việt của thư mã xác minh và của 3 mã lỗi mới; bỏ hẳn `purpose` khỏi bảng mã; `register` với số và email thuộc **hai** tài khoản chưa xác minh khác nhau → `EMAIL_TAKEN`, không gộp; không thêm action `audit_logs` cho register/verify (AUD-01 không liệt kê); re-seed đặt lại `email_verified_at` của GUEST mẫu; `locale` lưu `VARCHAR(2)` + CHECK (đã làm ở BE-EX-01).

## 4. Checkpoints

### CP-1 · BE-EX-33 – migration, ràng buộc DB (⏸)

Tệp: `prisma/schema.prisma`, `prisma/migrations/20261112010000_email_verification/migration.sql`, `prisma/schema.sql`, `prisma/constraints.sql`, `prisma/check-constraints.mjs`.
**Chỉ tạo file migration; xin OK riêng trước khi áp vào bất kỳ DB nào** (chủ dự án 12/11/2026, root `CLAUDE.md` rule 7). Mã nguồn chưa biên dịch được ở CP này (Prisma client cũ) – chạy `npx prisma generate` rồi để `npm run test` đỏ sang CP-2 là chấp nhận được, nhưng phải nói rõ trong báo cáo.

**Done when**
```bash
cd D:/Rooms/Source/backend
# 1. Migration viết tay phản ánh đúng diff schema cũ -> mới (offline, KHÔNG dùng DB dev làm shadow – LESSONS BE-EX-01)
git show HEAD:Source/backend/prisma/schema.prisma > "$SCRATCH/schema.old.prisma"
npx prisma migrate diff --from-schema-datamodel "$SCRATCH/schema.old.prisma" --to-schema-datamodel prisma/schema.prisma --script
#    kỳ vọng: chỉ các thay đổi của §2.3 (Prisma viết drop/create cho bảng; file tay dùng RENAME – đối chiếu bằng mắt, ghi vào báo cáo)
# 2. schema.sql sinh lại + kiểm ràng buộc
npm i --no-save @electric-sql/pglite@0.2        # LESSONS P1-QA-04
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script -o prisma/schema.sql
node prisma/check-constraints.mjs . prisma      # kỳ vọng: 63/63 tình huống đúng như mong đợi
```
Báo cáo số tình huống checker in ra (62 → **63**) và xin phép áp migration vào DB dev.

**Kịch bản test** (trong `check-constraints.mjs`, kết quả lấy từ spec)

| Tình huống | Spec | Kỳ vọng |
|---|---|---|
| Hai mã chưa dùng cho cùng email | AUTH-13 | `email_otps_one_active` |
| Mã cũ đã dùng + mã mới chưa dùng cho cùng email | AUTH-13 (mã mới vô hiệu hóa mã cũ) | `ok` |
| `email = '12345'` | AUTH-13 | `email_otps_email_format` |
| `email = 'Khach@Example.com'` | AUTH-13 (lưu lowercase) | `email_otps_email_format` |
| `tries = 6` | AUTH-13 (tối đa 5 lượt sai) | `email_otps_tries` |
| `locale = 'fr'` / `locale` mặc định | AUTH-15 | `users_locale` / `ok` ('vi') |
| GUEST làm quản lý tòa / đứng tên hợp đồng | SCOPE-05, CON-07 | `BUILDING_MANAGER_ROLE` / `CONTRACT_TENANT_ROLE` |
| 56 tình huống còn lại | DB-07 | không đổi, vẫn PASS |

Sau khi chủ dự án cho phép áp: `npx prisma migrate deploy` (hoặc `migrate dev`) trên DB dev phải chạy sạch trên DB **đã có** `guest_accounts`, rồi `npx prisma migrate status` không còn drift và `npx vitest run prisma/seed.spec.ts` xanh.

### CP-2 · BE-EX-34, BE-EX-35 – mã email, đăng ký, xác minh (⏸)

Tệp: `src/modules/mailer/*`, `src/modules/auth/otp.service.ts`, `auth.service.ts`, `auth.controller.ts`, `dto/auth.dto.ts`, `auth.module.ts`, `src/common/errors/error-code.ts`, `db-errors.ts`, **xóa** `src/modules/sms/`, cùng các test ở §5.

**Done when**
```bash
cd D:/Rooms/Source/backend && npm run lint && npm run test && npm run build
```
tất cả xanh (dán output thật); `rg -i "sms" Source/backend/src Source/backend/test` không còn kết quả; log test có dòng `ConsoleMailerService` in mã 6 số; `REQUIRED_ENV` không chứa `MAIL_`/`SMS_` (test khẳng định) nên app khởi động không cần biến nào mới.

**Kịch bản test** (mong đợi lấy từ spec, không lấy từ mã)

| Nhóm | Kịch bản | Spec ID | Kỳ vọng |
|---|---|---|---|
| mailer | `ConsoleMailerService.send` ghi log rồi resolve | AUTH-13, Q-14 | resolve, log chứa mã |
| mailer | `UnavailableMailerService.send` | AUTH-13 | reject `MAIL_UNAVAILABLE`, HTTP 503 |
| mailer | `mailerServiceFor` chọn Console ngoài production, Unavailable khi `NODE_ENV=production` | DEP-05, Q-14 | đúng lớp; app vẫn khởi động được |
| mã lỗi | `ErrorCode` có đúng **29** thành viên; `ERRORS` có `EMAIL_TAKEN` 409, `EMAIL_NOT_VERIFIED` 403, `MAIL_UNAVAILABLE` 503; **không** còn `PHONE_NOT_VERIFIED`, `SMS_UNAVAILABLE` | 01-architecture#error-codes | 29, status đúng bảng spec |
| mã lỗi | P2002 `users_email_key` | 01-architecture | `EMAIL_TAKEN` |
| OTP happy | gửi rồi nhập đúng mã | AUTH-13 | 200, `used_at` được đặt |
| OTP sai | mã sai 1 lần | AUTH-13 | 400 `OTP_INVALID`, `tries = 1` |
| OTP biên | đúng mã tại `expiresAt - 1 ms` / tại đúng `expiresAt` | AUTH-13 (5 phút) | 200 / 400 `OTP_INVALID` |
| OTP biên | lần thứ 6 (sau 5 lần sai) kể cả nhập **đúng** mã | AUTH-13 (5 lượt) | 400 `OTP_INVALID` |
| OTP đã dùng | dùng lại mã đã dùng | AUTH-13 (dùng một lần) | 400 `OTP_INVALID` |
| OTP song song | 20 lần đoán đồng thời, mã đúng ở cuối | AUTH-13, LESSONS BE-LOGIN-12 | tối đa 1 lần 200, `tries = 5` |
| OTP lưu trữ | nội dung dòng `email_otps` | AUTH-13 (chỉ lưu hash) | `codeHash = sha256(`<email>:<code>`)`, body không chứa mã |
| OTP cooldown | gửi lại sau 59 s / sau đúng 60 s | AUTH-13 | 429 `TOO_MANY_REQUESTS` / gửi được |
| OTP ngày | mã thứ 6 cho **cùng email** trong ngày lịch Hà Nội | AUTH-13, G-02 | 429 |
| OTP ngày biên | 5 mã lúc 23:59+07:00, thêm 1 lúc 00:00+07:00 ngày sau | AUTH-13 | mã thứ 6 **đi được** |
| OTP ngày song song | 5 request song song khi email đã có 4 mã trong ngày | AUTH-13, LESSONS BE-LOGIN-12 | đúng 1 thành công, 4 lần 429, bảng có đúng 5 dòng |
| OTP IP | mã thứ 11 từ cùng IP trong 1 giờ (10 email khác nhau) | AUTH-13, DEP-02 | 429; sau 1 giờ gửi được |
| OTP vô hiệu hóa | gửi mã mới cho cùng email | AUTH-13 (chủ dự án 12/11) | mã cũ → `OTP_INVALID`, mã mới → 200 |
| OTP lỗi gửi | `mailer.send` ném | AUTH-13 | 503 `MAIL_UNAVAILABLE`, dòng mã bị xóa, không tốn hạn mức ngày |
| register happy | số + email mới | AUTH-11 | 201 `{data:null}`, user `GUEST`, `email` lowercase, `email_verified_at` null, `mustChangePassword` false, đúng 1 thư tới địa chỉ đó |
| register locale | `Accept-Language: en` / `fr` / thiếu | AUTH-15, LOC-02 | `locale` `'en'` / `'vi'` / `'vi'` |
| register trùng số | số của GUEST đã xác minh / TENANT / MANAGER / BOSS | AUTH-11 | 409 `PHONE_TAKEN` + `fields.phone`, không thư, dữ liệu user không đổi |
| register trùng email | email của TENANT (do staff nhập) hoặc của GUEST đã xác minh, số mới | AUTH-11 | 409 `EMAIL_TAKEN` + `fields.email`, không thư, không tạo user |
| register trùng email hoa/thường | email khác chữ hoa thường với email đã có | AUTH-11 | 409 `EMAIL_TAKEN` |
| register thay thế | số của GUEST chưa xác minh (email giữ nguyên) | AUTH-11 | 201, tên + mật khẩu mới dùng được, mật khẩu cũ **không** đăng nhập được, mã mới được gửi, vẫn đúng 1 dòng user |
| register thay thế | email của GUEST chưa xác minh, **số mới** | AUTH-11 | 201, dòng cũ được thay (số mới ghi vào), không tạo dòng thứ hai |
| register thay thế | số của GUEST chưa xác minh, **email mới** | AUTH-11 | 201, email mới ghi vào, mã gửi tới email mới |
| register biên | số và email thuộc **hai** GUEST chưa xác minh khác nhau | AUTH-11, AUTH-14, `[ASSUMPTION]` Q-EX1-10 | 409 `EMAIL_TAKEN`, không gộp, hai dòng user không đổi |
| register khóa | GUEST chưa xác minh nhưng `is_active = false` (trùng số, rồi trùng email) | AUTH-11, D-26 | 409 `PHONE_TAKEN` / `EMAIL_TAKEN`, `is_active` vẫn false, không thư |
| register validate | `phone = '12345'`, `email = 'abc'`, `password` 7 ký tự, `fullName` rỗng | G-04, AUTH-03, AUTH-11 | 400 `VALIDATION_FAILED`, `fields` đúng 4 tên trường |
| register biên | `fullName` đúng 100 ký tự, `password` đúng 8 ký tự, `email` 255 ký tự | AUTH-03, AUTH-11 | 201 |
| register bảo mật | gửi thêm `role: 'BOSS'` | API-03 | 400, không tạo user |
| login | GUEST chưa xác minh + mật khẩu **đúng** | AUTH-12 (chủ dự án 12/11) | 403 `EMAIL_NOT_VERIFIED`, không gửi mã |
| login | GUEST chưa xác minh + mật khẩu **sai** | AUTH-01 | 401 `INVALID_CREDENTIALS` (không tiết lộ trạng thái xác minh) |
| login | GUEST chưa xác minh **và** bị khóa, mật khẩu đúng | AUTH-02 | 403 `ACCOUNT_LOCKED` (ưu tiên trước `EMAIL_NOT_VERIFIED`) |
| login | TENANT/MANAGER/BOSS do staff tạo, `email_verified_at` null | AUTH-12 | 200 như trước |
| verify-email | đúng mã | AUTH-12, AUTH-T1, AUTH-T2 | 200 `accessToken` + `user.emailVerified = true`, cookie `rt` path `/api/v1/auth`, `email_verified_at` được đặt, đúng 1 session, login ngay sau đó 200 |
| verify-email | sai mã / số lạ / số chưa có email | AUTH-13 | 400 `OTP_INVALID`, body y nhau |
| verify-email | tài khoản bị khóa | AUTH-02 | 403 `ACCOUNT_LOCKED`, `email_verified_at` vẫn null |
| verify-email | mã của email khác dùng cho số này | AUTH-13 | 400 `OTP_INVALID` |
| verify-email | AUTH-14: sau khi xác minh | AUTH-14 | chỉ `email_verified_at` đổi; không viewing, không contract nào bị tạo/sửa |
| resend-code | số lạ / GUEST chưa xác minh / số của staff / vượt hạn mức | AUTH-13 (chủ dự án 12/11) | 4 lần đều 200 với **body y nhau từng byte**; chỉ GUEST chưa xác minh có thư |
| resend-code | mã gửi lại xác minh được tài khoản | AUTH-12 | 200 ở `verify-email` |
| resend-code | body `{ phone: '123' }`; gửi thêm khóa `purpose` | API-03 | 400 `VALIDATION_FAILED` |
| route bị bỏ | `POST /auth/phone/send-code`, `POST /auth/phone/verify` | AUTH-12 | 404 `NOT_FOUND` |
| /auth/me | khóa trả về | AUTH-15, BE-LOGIN-15 | `ME_KEYS` có `emailVerified` + `locale`, **không** có `phoneVerified`; GUEST không có khóa `buildings` |
| acceptance | khách đăng ký → login 403 `EMAIL_NOT_VERIFIED` → verify-email → login 200 | spec 10 Acceptance | đúng chuỗi |
| acceptance | mã sai lần 6, mã hết hạn, mã đã dùng → `OTP_INVALID`; mã thứ 6 trong ngày → 429; mailer lỗi ở register → `MAIL_UNAVAILABLE` | spec 10 Acceptance | đúng từng dòng |

### CP-3 · BE-EX-07, BE-EX-08, BE-EX-09 – quên mật khẩu, roles/scope/locale, kiểm tra cuối (⏸)

Tệp: `auth.service.ts`, `dto/auth.dto.ts`, `src/common/guards/auth.decorators.ts`, `src/common/scope/scope.ts`, `prisma/seed.ts` + `seed.spec.ts`, `guards.spec.ts`, `auth.account.spec.ts`, `auth.me.spec.ts`, `auth.reset.spec.ts`, `test/auth.e2e-spec.ts` + `test/scenarios/`, `docs/spec/01-architecture.md` (DEP-08), `docs/spec/02-database.md`, `docs/phase-extra-home101/PROGRESS.md`.

**Done when**
```bash
cd D:/Rooms/Source/backend && npm run lint && npm run test && npm run build
# e2e: LESSONS BE-EX-06 – trên máy này .env nằm ở Source/backend
node --env-file=.env ./node_modules/vitest/vitest.mjs run --config ./vitest.config.e2e.ts
```
tất cả xanh (dán output thật). Chuỗi e2e thêm: đăng ký → đọc mã → `verify-email` → login → `forgot-password` → `reset-password` bằng link → login bằng mật khẩu mới. Mã 6 số **không** đọc được từ DB (chỉ có hash): e2e `overrideProvider(MailerService)` bằng spy bọc `ConsoleMailerService` và lấy mã từ nội dung thư; cách làm phải ghi trong báo cáo. Dòng rác do e2e tạo (user khách, `email_otps`) phải được dọn như các scenario hiện có (`scripts/e2e/cleanup.mjs` ở chế độ liệt kê, `--apply` chỉ khi chủ dự án đồng ý – LESSONS P2-QA-03). Chạy **reviewer** một lần trên thay đổi chưa commit (authorization + schema) và dán toàn bộ báo cáo; liệt kê `[ASSUMPTION]` đã dùng.

**Kịch bản test**

| Nhóm | Kịch bản | Spec ID | Kỳ vọng |
|---|---|---|---|
| forgot | GUEST đã xác minh email, đang hoạt động | AUTH-07 | 200, 1 thư chứa link, token chỉ lưu SHA-256, hết hạn 30 phút |
| forgot | GUEST **chưa** xác minh email | AUTH-07 | 200, **không** thư, không token |
| forgot | số lạ | AUTH-07 | 200, không gửi gì |
| forgot | GUEST đã xác minh nhưng bị khóa | AUTH-07, D-26 | 200, không thư |
| forgot | TENANT/MANAGER có email (`email_verified_at` null) | AUTH-07, Q-EX1-12 | 200, **vẫn** có link như Phase 1 |
| forgot | body của 5 nhánh trên + nhánh mailer lỗi | AUTH-07, LESSONS BE-LOGIN-18 | **giống nhau từng byte**, thời gian trả lời không chờ việc gửi |
| forgot | request thứ 6 trong 15 phút cho cùng số | AUTH-07 (Q4e) | 200, không gửi gì (không 429) |
| reset | link đúng / sai / đã dùng / hết hạn | AUTH-07 | mọi test `auth.reset.spec.ts` của Phase 1 vẫn xanh |
| reset | GUEST đặt lại mật khẩu bằng link | AUTH-07, AUTH-T3 | 200, mọi session bị thu hồi, 1 dòng audit `user.reset_password`, mật khẩu mới đăng nhập được (email đã xác minh nên không bị chặn) |
| roles | GUEST trên `/buildings`, `/rooms`, `/pricing`, `/managers`, `/dashboard`, `/files/sign` | SCOPE-05, API-07 | 403 `FORBIDDEN` |
| roles | GUEST trên route `TenantMeRoles` | SCOPE-03 | 403 `FORBIDDEN` |
| roles | GUEST trên route `MeRoles` | SCOPE-03 | 200 |
| roles | ma trận `guards.spec.ts` đủ **4** vai trò × route boss/staff/tenant/me | SCOPE-01 | đúng 200/403 từng ô |
| scope | `allowedBuildingIds` của GUEST | SCOPE-02 | `[]`, không truy vấn `buildings` |
| scope | GUEST đọc id của người khác | SCOPE-03 | 404 `NOT_FOUND` (không 403) |
| locale | `PATCH /auth/me { locale: 'en' }` cho GUEST, TENANT, MANAGER | AUTH-15 | 200, `GET /auth/me` trả `'en'` |
| locale | `locale: 'fr'` / `null` / `'EN'` | AUTH-15 | 400 `fields.locale` |
| locale | GUEST gửi `contactPhone`/`zaloUrl`/`facebookUrl` | AUTH-09, SCOPE-05 | 403 `FORBIDDEN` |
| seed | 6 tài khoản dev: 1 BOSS, 2 MANAGER, 2 TENANT, 1 GUEST; GUEST `0900000006`, `guest@example.com` đã xác minh, `locale 'vi'`, `mustChangePassword` false, `contact_phone` null | DEP-08 (chủ dự án 12/11) | đúng như trên; chạy seed hai lần không thêm dòng |
| e2e | đăng ký → verify-email → login → forgot → reset bằng link → login | spec 10 Acceptance | toàn chuỗi xanh trên DB dev |

## 5. Test cũ sẽ đỏ (phải sửa trong cùng thay đổi)

| Tệp | Vì sao | Sửa |
|---|---|---|
| `src/modules/auth/auth.signup.spec.ts` | toàn bộ viết cho SMS (69 chỗ): `SmsService`, `verify-phone`, `/auth/phone/*`, `purpose`, `PHONE_NOT_VERIFIED` | viết lại theo bảng kịch bản CP-2: spy `MailerService`, `verify-email`, `resend-code { phone }`, `EMAIL_*`; bỏ describe `/auth/phone/*` |
| `src/modules/sms/sms.service.spec.ts` | module bị xóa | **xóa** cùng `sms.service.ts`, `sms.module.ts` (chủ dự án đã đồng ý) |
| `src/app.setup.spec.ts` | `ErrorCode có đúng 28 thành viên` + bảng `EXPECTED` | 28 → **29**; bỏ 2 dòng `PHONE_NOT_VERIFIED`/`SMS_UNAVAILABLE`, thêm `EMAIL_TAKEN` 409, `EMAIL_NOT_VERIFIED` 403, `MAIL_UNAVAILABLE` 503 (LESSONS BE-P2-02) |
| `test/fixtures/fake-prisma.ts` | bảng `phoneOtp`, mặc định user `phoneVerifiedAt`, `email: null` cứng, `IDS.users` thiếu khách | `phoneOtp` → `emailOtp` (mặc định `tries: 0, usedAt: null`); `phoneVerifiedAt` → `emailVerifiedAt`; nạp `email`/`emailVerifiedAt` từ `DEV_ACCOUNTS`; thêm `IDS.users.guest = 6`; `$queryRaw` no-op giữ nguyên |
| `src/modules/auth/auth.me.spec.ts`, `auth.account.spec.ts` | `ME_KEYS` có `phoneVerified`, assert toàn body | `phoneVerified` → `emailVerified`; thêm test `locale` (BE-EX-08) |
| `src/modules/auth/auth.reset.spec.ts` | thêm nhánh GUEST chưa xác minh không nhận link | thêm test của CP-3, các test cũ giữ nguyên |
| `src/common/guards/guards.spec.ts` | ma trận 3 vai trò, `SCOPE-02: tenant -> []` | thêm vai trò `guest`, route probe `MeRoles`/`TenantMeRoles`, đổi tên test SCOPE-02 thành "mọi vai trò không phải MANAGER" |
| `src/common/errors/db-errors.spec.ts` | map mới | thêm case `users_email_key` |
| `prisma/seed.spec.ts` | `DEV_ACCOUNTS toHaveLength(5)`, `upserts toHaveLength(10)`, `local.t.user toHaveLength(5)`, test "1 BOSS, 2 MANAGER, 2 TENANT" | 5 → **6**, 10 → **12**, thêm khẳng định GUEST đã xác minh email |
| `prisma/check-constraints.mjs` | hằng `OTP`, 4 tình huống mã SMS | 5 tình huống mã email, 62 → **63** |
| `test/auth.e2e-spec.ts`, `test/scenarios/*` | thêm chuỗi đăng ký → verify-email → reset bằng link | scenario mới + override `MailerService`; e2e đọc `.env` ở `Source/backend` (LESSONS BE-EX-06), giữ `testTimeout` dài (LESSONS BE-P2-29..35) |

## 6. Open questions

- **Q-EX1-10 (CP-2, BE-EX-35)** Đăng ký mà **số điện thoại** thuộc một GUEST chưa xác minh và **email** thuộc một GUEST chưa xác minh **khác**: (a) `EMAIL_TAKEN`, không đổi gì (mặc định của kế hoạch, không gộp tài khoản – AUTH-14) · (b) `PHONE_TAKEN` · (c) thay thế dòng khớp số và xóa email khỏi dòng kia. **Đề xuất (a).**
- **Q-EX1-11 (CP-2, BE-EX-35)** Hạn mức 5 mã/ngày giờ tính theo **email** (AUTH-13), nên một người có thể đăng ký nhiều email khác nhau trên cùng một số, chỉ bị chặn bởi 10 mã/IP/giờ. Có cần thêm hạn mức theo số điện thoại không? (a) không, giữ đúng AUTH-13 (mặc định) · (b) thêm 5 lần đăng ký/số/ngày, đếm từ `email_otps` thì không được nên phải thêm cột hoặc bảng · (c) thêm 10 lần đăng ký/IP/ngày trong bộ nhớ. **Đề xuất (a)**, xem lại nếu bị lạm dụng thật.
- **Q-EX1-12 (CP-3, BE-EX-07)** AUTH-07 viết "tài khoản có email chưa xác minh thì không nhận link". Áp dụng cho ai? (a) chỉ GUEST tự đăng ký; tài khoản do staff tạo (MANAGER/TENANT, không có luồng xác minh nào) vẫn nhận link như Phase 1 (mặc định của kế hoạch) · (b) áp cho mọi vai trò – managers/tenants đang có email sẽ **mất** khả năng tự đặt lại mật khẩu, chỉ còn staff reset tay · (c) áp cho mọi vai trò và thêm luồng xác minh email cho staff (ngoài phạm vi EX-1). **Đề xuất (a).**
