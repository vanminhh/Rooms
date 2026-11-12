# PLAN · Phase Extra · EX-1 – Backend guest accounts + SMS code (BE-EX-01..09)

Nguồn: `docs/phase-extra-home101/feature_ex-1-backend-guest-accounts.md`, `docs/spec/00-overview.md` (G-04, D-25, D-26, A-11), `docs/spec/01-architecture.md` (API-04, API-07, error codes, AUTH-T1..T3, DEP-02, DEP-05, DEP-08, LOC-02/03), `docs/spec/10-auth.md` (AUTH-06, 07, 10..15, SCOPE-03, SCOPE-05), `docs/spec/02-database.md` (DB-07, Planned changes EX-1), `docs/LESSONS.md`.
Quyết định của chủ sở hữu 12/11/2026 (1..8 trong lệnh lập kế hoạch) đã được gấp vào kế hoạch này, không hỏi lại.

## 1. Mục tiêu và phạm vi

**Trong phạm vi**

| Task | Nội dung | Spec |
|---|---|---|
| BE-EX-01 | Migration `guest_accounts`: `Role.GUEST`, `users.phone_verified_at`, `users.locale` + CHECK, bảng `phone_otps`; giữ nguyên mọi rule của `constraints.sql`; thêm tình huống cho `check-constraints.mjs` | DB-07, AUTH-11..15 |
| BE-EX-02 | Module `sms`: `SmsService` (abstract) + `ConsoleSmsService` + `UnavailableSmsService` | AUTH-13, Q-07 |
| BE-EX-03 | `OtpService`: sinh/gửi/tiêu thụ mã 6 số; mã lỗi `OTP_INVALID`, `SMS_UNAVAILABLE`, `PHONE_NOT_VERIFIED` | AUTH-13, A-11 |
| BE-EX-04 | `POST /auth/register` | AUTH-11 |
| BE-EX-05 | `POST /auth/verify-phone`, `POST /auth/resend-code`, login chặn GUEST chưa xác minh | AUTH-12, AUTH-T1, AUTH-T2 |
| BE-EX-06 | `POST /auth/phone/send-code`, `POST /auth/phone/verify`; `/auth/me` có `phoneVerified` | AUTH-12, AUTH-14 |
| BE-EX-07 | Quên/đặt lại mật khẩu bằng mã SMS, hai dạng body của `/auth/reset-password` | AUTH-07, AUTH-T3 |
| BE-EX-08 | `GUEST` trong `@Roles`, helper `/me/*`, `locale` trong `GET/PATCH /auth/me`, seed thêm 1 GUEST đã xác minh | API-07, SCOPE-03, SCOPE-05, AUTH-15, DEP-08 |
| BE-EX-09 | lint + test + build + e2e + reviewer | – |

**Ngoài phạm vi**: bản tiếng Anh của thông điệp lỗi (EX-3, chỉ viết tiếng Việt ở phần này), lịch xem phòng (EX-6), biến GUEST thành TENANT (Phase 3, CON-07), SDK của nhà gửi SMS thật (Q-07), mọi thay đổi FE.

## 2. Kiến trúc

```
                 POST /auth/register, verify-phone, resend-code,
                 forgot-password, reset-password      (@Public)
                 POST /auth/phone/send-code, /phone/verify,
                 GET/PATCH /auth/me                   (@Roles 4 vai trò)
                                │
                        AuthController (thin)
                                │
          ┌─────────────────────┴──────────────────────┐
          │                                            │
     AuthService ─────────── OtpService ──────────► SmsService (abstract)
     (login, me, reset)      (sinh, giới hạn,          │
          │                   tiêu thụ mã)      ConsoleSmsService (dev/test)
          │                        │             UnavailableSmsService (prod, chưa có provider)
          │                        │
          │                  RateLimiter(10/giờ, theo IP, in-memory, DEP-02)
          │                        │
          └────────── PrismaService ───────────────────┘
                   users · sessions · phone_otps
                   (đếm 5 SMS/số/ngày lấy từ phone_otps,
                    khóa pg_advisory_xact_lock theo số điện thoại)
```

### 2.1 Tệp thêm / sửa

| Tệp | Việc |
|---|---|
| `prisma/schema.prisma` | `enum Role` + `GUEST`; `enum OtpPurpose`; `User.phoneVerifiedAt`, `User.locale`; `model PhoneOtp` |
| `prisma/migrations/<ts>_guest_accounts/migration.sql` | SQL ở §2.2 (tạo tệp được duyệt; **áp vào DB phải xin OK riêng**) |
| `prisma/constraints.sql` | 3 CHECK + 1 partial unique index mới (DB-07) |
| `prisma/check-constraints.mjs` | 1 user GUEST trong dữ liệu nền + 5 tình huống mới (54 → 59) |
| `prisma/seed.ts` | `DevAccount.role` thêm `'GUEST'`; account `0900000006` đã xác minh; trường contact null cho GUEST như TENANT |
| `prisma/seed.spec.ts` | các số đếm 5 → 6 (xem §5) |
| `src/modules/sms/sms.service.ts` (mới) | `Sms`, `abstract SmsService`, `ConsoleSmsService`, `UnavailableSmsService` |
| `src/modules/sms/sms.module.ts` (mới) | chọn provider theo `NODE_ENV`; export `SmsService` |
| `src/modules/sms/sms.service.spec.ts` (mới) | BE-EX-02 |
| `src/modules/auth/otp.service.ts` (mới) | sinh mã, giới hạn, gửi, tiêu thụ |
| `src/modules/auth/otp.service.spec.ts` (mới) | AUTH-13 |
| `src/modules/auth/auth.service.ts` | `register`, `verifyPhone`, `resendCode`, `sendPhoneCode`, `verifyOwnPhone`, chặn login GUEST chưa xác minh, nhánh SMS của forgot/reset, `Me` + `phoneVerified`/`locale`, `buildings` chỉ cho BOSS/MANAGER, `updateMe` chấp nhận `locale` và chặn trường staff với GUEST |
| `src/modules/auth/auth.controller.ts` | 5 route mới, `@Roles` thêm `GUEST` |
| `src/modules/auth/dto/auth.dto.ts` | `RegisterDto`, `VerifyPhoneDto`, `ResendCodeDto`, `PhoneVerifyDto`, `ResetPasswordDto` (2 dạng), `UpdateMeDto` + `locale` |
| `src/modules/auth/auth.module.ts` | `imports` thêm `SmsModule`; `providers` thêm `OtpService` |
| `src/modules/auth/register.spec.ts`, `verify-phone.spec.ts`, `phone-verify.spec.ts`, `reset-by-code.spec.ts` (mới) | test HTTP theo task |
| `src/common/errors/error-code.ts` | `PHONE_NOT_VERIFIED` 403, `OTP_INVALID` 400, `SMS_UNAVAILABLE` 503 |
| `src/common/guards/auth.decorators.ts` | `MeRoles()` và `TenantMeRoles()` (§2.5) |
| `src/common/scope/scope.ts` | `allowedBuildingIds`: mọi vai trò không phải MANAGER (sau nhánh BOSS) trả `[]` |
| `src/common/date/today.ts` | `hanoiDayStart(now)` – thời điểm 00:00 `Asia/Ho_Chi_Minh` của ngày chứa `now` |
| `src/app.setup.spec.ts`, `src/common/guards/guards.spec.ts`, `src/modules/auth/auth.me.spec.ts`, `auth.account.spec.ts`, `auth.reset.spec.ts`, `test/fixtures/fake-prisma.ts`, `test/auth.e2e-spec.ts` + `test/scenarios/` | sửa theo §5 |
| `docs/spec/01-architecture.md`, `docs/spec/02-database.md`, `docs/phase-extra-home101/PROGRESS.md` | DEP-08 thêm `0900000006`; chuyển dòng EX-1 khỏi "Planned changes" và cập nhật số đếm; log tiến độ |

`SmsModule` được `AuthModule` import (giống `MailerModule`), **không** thêm vào `AppModule` – nếu thêm, test danh sách module trong `prisma.service.spec.ts` sẽ đỏ (LESSONS BE-P2-10).

### 2.2 Schema và migration

```prisma
enum Role { BOSS MANAGER TENANT GUEST }          // thêm GUEST ở cuối

enum OtpPurpose { REGISTER VERIFY_PHONE RESET_PASSWORD }

model User {
  // ... giữ nguyên
  phoneVerifiedAt DateTime? @map("phone_verified_at") @db.Timestamptz
  locale          String    @default("vi") @db.VarChar(2)   // 'vi' | 'en' (LOC-03, CHECK trong constraints.sql)
}

model PhoneOtp {
  id        Int        @id @default(autoincrement())
  phone     String     @db.VarChar(10)   // không có FK: số lạ cũng được đếm, AUTH-13
  purpose   OtpPurpose
  codeHash  String     @map("code_hash") // sha256Hex(`${phone}:${purpose}:${code}`)
  tries     Int        @default(0)
  expiresAt DateTime   @map("expires_at") @db.Timestamptz
  usedAt    DateTime?  @map("used_at") @db.Timestamptz // dùng rồi HOẶC bị mã mới vô hiệu hóa
  createdAt DateTime   @default(now()) @map("created_at") @db.Timestamptz

  @@index([phone, purpose, createdAt])
  @@index([phone, createdAt])
  @@map("phone_otps")
}
```

`migration.sql` (sinh bằng `npx prisma migrate dev --create-only --name guest_accounts`, rồi **chép thêm bằng tay** phần "DB-07" ở cuối – phần `constraints.sql` chỉ được áp bởi migration đầu tiên):

```sql
ALTER TYPE "Role" ADD VALUE 'GUEST';
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'VERIFY_PHONE', 'RESET_PASSWORD');
ALTER TABLE "users" ADD COLUMN "phone_verified_at" TIMESTAMPTZ,
                   ADD COLUMN "locale" VARCHAR(2) NOT NULL DEFAULT 'vi';
CREATE TABLE "phone_otps" ( id SERIAL PRIMARY KEY, phone VARCHAR(10) NOT NULL,
  purpose "OtpPurpose" NOT NULL, code_hash TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX "phone_otps_phone_purpose_created_at_idx" ON "phone_otps"("phone","purpose","created_at");
CREATE INDEX "phone_otps_phone_created_at_idx" ON "phone_otps"("phone","created_at");

-- DB-07: phần Prisma không khai báo được (bản sao của các dòng mới trong constraints.sql)
ALTER TABLE users ADD CONSTRAINT users_locale CHECK (locale IN ('vi','en'));
ALTER TABLE phone_otps ADD CONSTRAINT phone_otps_phone_vn CHECK (phone ~ '^0[0-9]{9}$');
ALTER TABLE phone_otps ADD CONSTRAINT phone_otps_tries CHECK (tries BETWEEN 0 AND 5);
CREATE UNIQUE INDEX phone_otps_one_active ON phone_otps (phone, purpose) WHERE used_at IS NULL;
```

Quy tắc giữ `constraints.sql` (DB-07):
- Không câu lệnh nào trong migration được **dùng** giá trị `'GUEST'` (Postgres chỉ cho dùng sau khi commit `ALTER TYPE`); seed mới dùng nó.
- Hai trigger cũ đã chặn GUEST sẵn: `check_building_manager` yêu cầu `role = 'MANAGER'`, `check_contract_tenant` yêu cầu `role = 'TENANT'`. **Không sửa trigger**, chỉ thêm tình huống chứng minh.
- `users_one_boss`, `users_phone_vn`, `users_contact_phone_vn` không bị ảnh hưởng (chỉ thêm cột).
- 4 dòng mới ở trên được thêm vào `constraints.sql` **đúng cùng nội dung** để DB tạo mới từ đầu vẫn giống DB đã migrate.

Tình huống mới trong `check-constraints.mjs` (dữ liệu nền thêm `(6,'GUEST','0900000006','Khách thử', ...)`): 54 → **59**.

| # | Nhóm | Tình huống | Mong đợi |
|---|---|---|---|
| 55 | Tài khoản | Gán khách có tài khoản làm quản lý tòa (`UPDATE buildings SET manager_id = 6`) | `BUILDING_MANAGER_ROLE` |
| 56 | Tài khoản | Khách có tài khoản đứng tên hợp đồng (`tenant_id = 6`) | `CONTRACT_TENANT_ROLE` |
| 57 | Tài khoản | `locale = 'fr'` | `users_locale` |
| 58 | Mã SMS | Hai mã chưa dùng cho cùng (số, mục đích) | `phone_otps_one_active` |
| 59 | Mã SMS | `phone_otps.phone = '12345'` | `phone_otps_phone_vn` |

### 2.3 Module `sms`

```ts
export interface Sms { to: string; text: string }
export abstract class SmsService { abstract send(sms: Sms): Promise<void> }
@Injectable() export class ConsoleSmsService extends SmsService { send(sms: Sms): Promise<void> } // Logger.log, dev/test
@Injectable() export class UnavailableSmsService extends SmsService { send(): Promise<never> }   // throw SMS_UNAVAILABLE
```
`SmsModule`: `{ provide: SmsService, useClass: process.env.NODE_ENV === 'production' ? UnavailableSmsService : ConsoleSmsService }` (NODE_ENV là bắt buộc sẵn, DEP-05). `env.ts` **không đổi**: không có biến `SMS_*` nào bắt buộc, app khởi động không cần chúng (Q-07 chưa chọn provider nên chưa đọc biến nào).
Nội dung tin: `Mã xác minh Trọ Thông Minh: 123456. Mã có hiệu lực 5 phút.` `[ASSUMPTION]` câu chữ do kế hoạch đề xuất.

### 2.4 `OtpService` (AUTH-13, A-11)

```ts
export const OTP_LENGTH = 6, OTP_TTL_MS = 5*60*1000, OTP_MAX_TRIES = 5,
  OTP_RESEND_MS = 60_000, OTP_PER_PHONE_PER_DAY = 5, OTP_PER_IP_PER_HOUR = 10;

@Injectable() export class OtpService {
  constructor(prisma: PrismaService, sms: SmsService)
  /** Sinh + lưu + gửi. Ném 429 TOO_MANY_REQUESTS hoặc 503 SMS_UNAVAILABLE. */
  async send(phone: string, purpose: OtpPurpose, ip?: string): Promise<void>
  /** Đúng mã → đánh dấu đã dùng. Sai/hết hạn/đã dùng/hết lượt → 400 OTP_INVALID. */
  async consume(phone: string, purpose: OtpPurpose, code: string, tx?: TxClient): Promise<void>
}
```

`send` theo đúng thứ tự:
1. `ipLimiter.isBlocked(ip)` → 429; `ipLimiter.record(ip)` ngay (đồng bộ, trước `await` đầu tiên – cùng kiểu với AUTH-04 để nhiều request song song không cùng lọt).
2. Trong **một** `prisma.$transaction`:
   a. `tx.$executeRaw` `SELECT pg_advisory_xact_lock(hashtextextended(${'otp:'+phone}, 0))` – mọi lần đếm-rồi-ghi cho cùng số bị tuần tự hóa (LESSONS: "limit đếm rồi ghi phải an toàn khi song song").
   b. `count` `phone_otps` với `phone`, `createdAt >= hanoiDayStart(now)` (mọi purpose) → `>= 5` ném 429. Mốc 00:00 `Asia/Ho_Chi_Minh`, đếm từ bảng nên sống qua restart (câu trả lời 4).
   c. mã gần nhất của `(phone, purpose)` có `createdAt > now - 60s` → ném 429 (resend cooldown).
   d. `updateMany({ where: { phone, purpose, usedAt: null }, data: { usedAt: now } })` – mã mới vô hiệu hóa mã cũ chưa dùng (câu trả lời 5); nhờ đó `phone_otps_one_active` không bao giờ bị vi phạm.
   e. `create` dòng mới: `codeHash = sha256Hex(`${phone}:${purpose}:${code}`)`, `expiresAt = now + 5 phút`. Mã sinh bằng `randomInt(0, 1_000_000)` của `node:crypto`, pad 6 số.
3. Sau khi commit: `sms.send(...)`. Lỗi → `updateMany({ where: { id, usedAt: null }, data: { usedAt: now } })` rồi ném 503 `SMS_UNAVAILABLE`: không bao giờ trả thành công khi tin không đi được.

`consume`: lấy dòng mới nhất `(phone, purpose, usedAt: null)`; không có / `expiresAt <= now` / `tries >= 5` → `OTP_INVALID`; hash sai → `update tries: { increment: 1 }` rồi `OTP_INVALID`; hash đúng → `updateMany({ where: { id, usedAt: null }, data: { usedAt: now } })`, `count === 0` → `OTP_INVALID` (hai request song song cùng mã: đúng một thắng, như `password_reset_tokens`).

Giới hạn IP nằm trong RAM (DEP-02) với chú thích `shortcut:` sẵn có của `RateLimiter`.

### 2.5 Hợp đồng API

Mọi phản hồi thành công bọc `{ data }` (API-02), lỗi `{ error: { code, message, fields? } }` (API-03). Thông điệp tiếng Việt; bản tiếng Anh thuộc EX-3 (LOC-02).

| Method · Path | Quyền | Request | Thành công | Lỗi |
|---|---|---|---|---|
| `POST /auth/register` | `@Public` | `{ fullName: string 1..100, phone: ^0[0-9]{9}$, password: >= 8 }` | **201** `{ data: null }` | 400 `VALIDATION_FAILED` (+`fields`), 409 `PHONE_TAKEN`, 429 `TOO_MANY_REQUESTS`, 503 `SMS_UNAVAILABLE` |
| `POST /auth/verify-phone` | `@Public` | `{ phone, code: ^[0-9]{6}$ }` | 200 `{ data: { accessToken, user: Me } }` + cookie `rt` | 400 `VALIDATION_FAILED`, 400 `OTP_INVALID`, 403 `ACCOUNT_LOCKED` |
| `POST /auth/resend-code` | `@Public` | `{ phone, purpose: 'REGISTER' \| 'RESET_PASSWORD' }` | 200 `{ data: null }` **luôn luôn** | chỉ 400 `VALIDATION_FAILED` khi body sai định dạng |
| `POST /auth/phone/send-code` | `@Roles GUEST, TENANT, MANAGER, BOSS` | – (dùng số của người đăng nhập) | 200 `{ data: null }` | 401, 403 `FORBIDDEN`, 409 `CONFLICT_STATE` (đã xác minh), 429, 503 `SMS_UNAVAILABLE` |
| `POST /auth/phone/verify` | như trên | `{ code: ^[0-9]{6}$ }` | 200 `{ data: Me }` (`phoneVerified: true`) | 400 `OTP_INVALID`, 409 `CONFLICT_STATE` (đã xác minh) |
| `POST /auth/forgot-password` | `@Public` | `{ phone }` | 200 `{ data: null }` **luôn luôn, body y nhau ở mọi nhánh** | chỉ 400 `VALIDATION_FAILED` (số sai định dạng) |
| `POST /auth/reset-password` | `@Public` | `{ token, newPassword }` **hoặc** `{ phone, code, newPassword }` | 200 `{ data: null }` | 400 `VALIDATION_FAILED` (`fields.token` = câu `RESET_LINK_MSG` khi thiếu/ sai dạng body), 400 `OTP_INVALID` (nhánh mã SMS) |
| `GET /auth/me` | `@Roles` 4 vai trò, `@AllowPasswordChangeRequired` | – | 200 `{ data: Me }` | 401 |
| `PATCH /auth/me` | `@Roles` 4 vai trò | `UpdateMeDto` | 200 `{ data: Me }` | 400, 403 `FORBIDDEN` (GUEST/TENANT gửi trường của staff) |
| `POST /auth/login` | `@Public` | không đổi | không đổi | **mới**: 403 `PHONE_NOT_VERIFIED` khi `role = GUEST` và `phone_verified_at IS NULL`, **chỉ sau khi mật khẩu đúng** (câu trả lời 6); không tự gửi mã |

```ts
export interface Me {            // thêm 2 trường, bỏ buildings cho GUEST
  id: number; role: Role; phone: string; fullName: string; email: string | null;
  mustChangePassword: boolean; phoneVerified: boolean; locale: string;
  contactPhone: string | null; zaloUrl: string | null; facebookUrl: string | null;
  buildings?: MeBuilding[];      // chỉ BOSS và MANAGER
}
export class RegisterDto    { fullName: string; phone: string; password: string }
export class VerifyPhoneDto { phone: string; code: string }
export class ResendCodeDto  { phone: string; purpose: 'REGISTER' | 'RESET_PASSWORD' }
export class PhoneVerifyDto { code: string }
export class ResetPasswordDto { token?: string; phone?: string; code?: string; newPassword: string }
export class UpdateMeDto { /* ... */ locale?: 'vi' | 'en' }   // null không được phép cho locale
```
`ResetPasswordDto`: `@ValidateIf(o => !o.phone && !o.code)` cho `token`; `@ValidateIf(o => !o.token)` cho `phone` và `code`; gửi cả `token` và `phone`/`code` → 400 `VALIDATION_FAILED` `fields.token`. Pipe `forbidNonWhitelisted` hiện có vẫn chặn khóa lạ.

Hành vi nghiệp vụ cần đúng từng chữ:
- **AUTH-11** `register`: số thuộc tài khoản đã xác minh, hoặc do staff tạo (TENANT/MANAGER/BOSS, bất kể `phone_verified_at`) → `PHONE_TAKEN`, message `Số điện thoại đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu`. Số thuộc GUEST **chưa** xác minh → cập nhật `fullName` + `passwordHash` (mật khẩu cũ hết tác dụng), `mustChangePassword = false`, gửi mã mới. Số mới → tạo `GUEST`, `phone_verified_at = null`, `mustChangePassword = false`, `locale` theo §3/Q-EX1-1. Mọi nhánh: tạo/cập nhật user **và** dòng `phone_otps` trong cùng một `$transaction`, gửi SMS sau commit; SMS lỗi → 503, tài khoản tồn tại nhưng chưa xác minh và không có mã dùng được (người dùng đăng ký lại được).
- **AUTH-12** `verify-phone`: `consume(phone, 'REGISTER', code)` + `user.update phoneVerifiedAt = now` + tạo session + `lastLoginAt` trong **một** `$transaction`; trả đúng session như login (AUTH-T1, AUTH-T2). Tài khoản `isActive = false` → `ACCOUNT_LOCKED`, không đặt `phoneVerifiedAt`.
- **AUTH-13/14** `phone/send-code` + `phone/verify` dùng purpose `VERIFY_PHONE`, cho **mọi** vai trò đã đăng nhập mà `phone_verified_at IS NULL` (câu trả lời 7); chỉ đặt `phone_verified_at`, không gán, không gộp gì.
- **AUTH-07** `forgot-password`: `isActive === false` → không gửi gì (cả nhánh SMS, câu trả lời 8). `phone_verified_at != null` → mã SMS purpose `RESET_PASSWORD`; ngược lại nếu có `email` → link như cũ; ngược lại không gì. Giữ đúng kiểu hiện tại: công việc nặng chạy **không await** với `.catch(log)` để thời gian trả lời không tiết lộ tài khoản (LESSONS BE-LOGIN-18); do đó 429/503 của OtpService ở đây chỉ được ghi log (câu trả lời 3). Bộ đếm `forgotLimiter` 5/15 phút giữ nguyên.
- **AUTH-07 / AUTH-T3** `reset-password` nhánh SMS: `consume(phone, 'RESET_PASSWORD', code)` + `passwordHash` mới + `mustChangePassword = false` + thu hồi **mọi** session + audit `user.reset_password` trong một `$transaction` (dùng lại thân giao dịch của nhánh link). `[ASSUMPTION]` không thêm action audit mới cho register/verify (AUD-01 không liệt kê).
- **AUTH-13** `resend-code` luôn 200 với body y nhau, kể cả số lạ, vượt hạn mức hay SMS lỗi (câu trả lời 3). Mốc 429 của AUTH-13 được chứng minh qua `register` và `phone/send-code`.
- **AUTH-15** `locale`: `PATCH /auth/me` nhận `'vi' | 'en'` cho mọi vai trò; giá trị khác → 400 `fields.locale`.

### 2.6 Guard, roles và helper `/me/*`

- `auth.decorators.ts`: `export const MeRoles = () => Roles('GUEST', 'TENANT');` (xem phòng, thông báo, tài khoản) và `export const TenantMeRoles = () => Roles('TENANT');` (hợp đồng, hóa đơn, yêu cầu – GUEST nhận 403 `FORBIDDEN`, API-07, SCOPE-03). EX-1 chỉ định nghĩa + test chúng; route `/me/*` thật đến ở EX-6 và Phase 3.
- `RolesGuard`, `MustChangePasswordGuard`, `JwtAuthGuard`: **không đổi** (vai trò lấy từ DB, `GUEST` chỉ là một giá trị enum mới). GUEST luôn `mustChangePassword = false`.
- `scope.ts` `allowedBuildingIds`: sau nhánh `BOSS → null`, trả `[]` cho mọi vai trò không phải `MANAGER` (nay GUEST cũng vậy; hiện tại chỉ chặn `'TENANT'` nên GUEST sẽ chạy một truy vấn vô nghĩa).
- `getMe`: `buildings` chỉ khi `role === 'BOSS' || role === 'MANAGER'` (điều kiện `!== 'TENANT'` hiện tại sẽ trả `buildings` cho GUEST).
- `updateMe`: chặn `contactPhone`/`zaloUrl`/`facebookUrl` cho `TENANT` **và** `GUEST` (SCOPE-05).
- Staff route (`/buildings`, `/rooms`, `/pricing`, `/viewings`, `/managers`, `/files/sign`, `/dashboard`) không thêm `GUEST` → GUEST nhận 403 `FORBIDDEN` nhờ mặc định-từ-chối (SCOPE-01).
- Seed dev: `{ key: 'guest', role: 'GUEST', phone: '0900000006', fullName: 'Đỗ Thị Khách', password: 'Khach@2026', mustChangePassword: false, isActive: true }` với `phoneVerifiedAt` đặt sẵn (đã xác minh) và `locale: 'vi'`; thêm vào danh sách DEP-08 của `01-architecture.md` (câu trả lời 1).

## 3. Câu hỏi bỏ ngỏ

- **Q-EX1-1 (CP-2, BE-EX-04)** `users.locale` lúc đăng ký lấy từ đâu? AUTH-15 chỉ nói "từ ngôn ngữ đang dùng", LOC-02 nói FE gửi `Accept-Language`, nhưng phần LOC chỉ được xây ở EX-3.
  (a) đọc header `Accept-Language` (`en` → `'en'`, còn lại `'vi'`) – không cần đổi DTO, chạy được ngay · (b) thêm trường tùy chọn `locale` vào `RegisterDto` · (c) cả hai, body thắng header.
  **Đề xuất (a)**, mặc định `'vi'`.
- **Q-EX1-2 (CP-2, BE-EX-04)** Đăng ký bằng số của một GUEST **chưa xác minh nhưng đã bị khóa** (`is_active = false`) thì sao? D-26 nói tài khoản bị staff khóa không bao giờ tự mở lại, AUTH-11 lại nói GUEST chưa xác minh bị thay tên + mật khẩu.
  (a) `PHONE_TAKEN`, không hồi sinh tài khoản bị khóa · (b) thay tên + mật khẩu và gửi mã như GUEST chưa khóa (mở khóa ngầm) · (c) trả 200 giả nhưng không gửi gì.
  **Đề xuất (a)**.

`[ASSUMPTION]` dùng trong kế hoạch: A-11 (toàn bộ tham số mã SMS); câu chữ tiếng Việt của tin SMS và của 3 thông điệp lỗi mới; không thêm action `audit_logs` cho register/verify; `locale` lưu `VARCHAR(2)` + CHECK thay vì enum Postgres (để EX-3 thêm ngôn ngữ không cần migration enum).

## 4. Checkpoints

### CP-1 · BE-EX-01 – schema, migration, ràng buộc DB (⏸)

Tệp: `prisma/schema.prisma`, `prisma/migrations/<ts>_guest_accounts/migration.sql`, `prisma/constraints.sql`, `prisma/check-constraints.mjs`.
Chỉ tạo tệp migration; **xin OK riêng trước khi áp vào bất kỳ DB nào** (câu trả lời 2, root CLAUDE.md rule 7).

**Done when**
```bash
cd Source/backend
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$DIRECT_URL" --script     # kỳ vọng: "-- This is an empty migration."
npm i --no-save @electric-sql/pglite@0.2
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script -o prisma/schema.sql
node prisma/check-constraints.mjs . prisma        # kỳ vọng: 59/59 tình huống đúng như mong đợi
npx vitest run prisma/seed.spec.ts                # xanh (seed chưa đổi ở CP này)
```
Báo cáo số tình huống checker in ra (54 → 59; con số "50/50" trong tài liệu cũ đã lạc hậu, LESSONS).

**Kịch bản test** (đều trong `check-constraints.mjs`, kết quả lấy từ spec)
| Tình huống | Spec | Kỳ vọng |
|---|---|---|
| GUEST làm quản lý tòa | SCOPE-05, BLD-03 | `BUILDING_MANAGER_ROLE` |
| GUEST đứng tên hợp đồng | CON-07, DB "Planned changes" | `CONTRACT_TENANT_ROLE` |
| `locale = 'fr'` | AUTH-15 | `users_locale` |
| `locale` mặc định khi không truyền | AUTH-15 | `ok`, giá trị `'vi'` |
| hai mã chưa dùng cùng (số, purpose) | AUTH-13 (mã mới vô hiệu hóa mã cũ) | `phone_otps_one_active` |
| `phone_otps.phone = '12345'` | G-04 | `phone_otps_phone_vn` |
| `tries = 6` | AUTH-13 (tối đa 5 lượt sai) | `phone_otps_tries` |
| 54 tình huống cũ | DB-07 | không đổi, vẫn PASS |

### CP-2 · BE-EX-02..06 – module sms, OtpService, đăng ký, xác minh (⏸)

Tệp: `src/modules/sms/*`, `src/modules/auth/otp.service.ts` (+ spec), `auth.service.ts`, `auth.controller.ts`, `dto/auth.dto.ts`, `auth.module.ts`, `src/common/errors/error-code.ts`, `src/common/date/today.ts`, `src/app.setup.spec.ts`, `test/fixtures/fake-prisma.ts`, `auth.me.spec.ts`, 3 spec HTTP mới.

**Done when**: `cd Source/backend && npm run lint && npm run test` xanh; trong log test thấy dòng `ConsoleSmsService` in mã; app khởi động không có biến `SMS_*` nào (`npm run start:dev` với `.env` hiện tại, hoặc test khẳng định `REQUIRED_ENV` không chứa `SMS_`).

**Kịch bản test**
| Nhóm | Kịch bản | Spec ID | Kỳ vọng |
|---|---|---|---|
| sms | `ConsoleSmsService.send` ghi log và resolve | BE-EX-02 | resolve, log chứa mã |
| sms | `UnavailableSmsService.send` | AUTH-13 | ném `SMS_UNAVAILABLE`, HTTP 503 |
| sms | `SmsModule` chọn Console ngoài production, Unavailable khi `NODE_ENV=production` | AUTH-13, DEP-05 | đúng lớp |
| mã lỗi | `ErrorCode` có đúng **28** thành viên, `ERRORS` đủ status 403/400/503 cho 3 mã mới | 01-architecture#error-codes | 28, status đúng bảng spec |
| OTP happy | gửi rồi nhập đúng mã | AUTH-13 | 200, `used_at` được đặt |
| OTP sai | mã sai 1 lần | AUTH-13 | 400 `OTP_INVALID`, `tries = 1` |
| OTP biên | lần sai thứ 6 (sau 5 lần sai) kể cả nhập **đúng** mã | AUTH-13 | 400 `OTP_INVALID` |
| OTP biên | đúng mã tại `expiresAt - 1ms` / tại đúng `expiresAt` | AUTH-13 (5 phút) | 200 / 400 `OTP_INVALID` |
| OTP đã dùng | dùng lại mã đã dùng | AUTH-13 | 400 `OTP_INVALID` |
| OTP song song | 2 request cùng mã đúng đồng thời | AUTH-13, LESSONS | đúng 1 lần 200, 1 lần 400, 1 session |
| OTP cooldown | gửi lại sau 59 s / sau đúng 60 s | AUTH-13 | 429 / gửi được |
| OTP ngày | SMS thứ 6 trong cùng ngày `Asia/Ho_Chi_Minh` | AUTH-13, câu trả lời 4 | 429 `TOO_MANY_REQUESTS` |
| OTP ngày biên | 5 SMS lúc 23:59+07:00, thêm 1 lúc 00:01+07:00 ngày sau | AUTH-13, G-02 | SMS thứ 6 **đi được** (bộ đếm reset 00:00) |
| OTP ngày | đếm lấy từ `phone_otps`, không mất sau khi tạo `OtpService` mới | câu trả lời 4 | vẫn 429 |
| OTP ngày song song | 5 request gửi song song khi đã có 4 mã trong ngày | AUTH-13, LESSONS BE-LOGIN-12 | đúng 1 request thành công, 4 request 429, bảng có đúng 5 dòng trong ngày |
| OTP IP | SMS thứ 11 từ cùng IP trong 1 giờ | AUTH-13, DEP-02 | 429 |
| OTP vô hiệu hóa | gửi mã mới cùng (số, purpose) | câu trả lời 5 | mã cũ → `OTP_INVALID`, mã mới → 200 |
| OTP lỗi gửi | `sms.send` ném | AUTH-13 | 503 `SMS_UNAVAILABLE`, dòng vừa tạo bị đánh dấu dùng → mã không dùng được |
| register happy | số mới | AUTH-11 | 201 `{data:null}`, user `GUEST`, `phone_verified_at` null, `mustChangePassword` false, 1 SMS |
| register trùng | số của GUEST đã xác minh / TENANT / MANAGER / BOSS | AUTH-11 | 409 `PHONE_TAKEN`, không gửi SMS, dữ liệu user không đổi |
| register thay thế | số của GUEST chưa xác minh | AUTH-11 | 201, tên + mật khẩu mới dùng được, mật khẩu cũ **không** đăng nhập được, mã mới được gửi |
| register validate | `phone = '12345'`, `password` 7 ký tự, `fullName` rỗng / 101 ký tự | G-04, AUTH-03 | 400 `VALIDATION_FAILED` + `fields` đúng tên trường |
| register biên | `fullName` đúng 100 ký tự, `password` đúng 8 ký tự | AUTH-03 | 201 |
| login | GUEST chưa xác minh + mật khẩu **đúng** | AUTH-12, câu trả lời 6 | 403 `PHONE_NOT_VERIFIED`, không gửi mã |
| login | GUEST chưa xác minh + mật khẩu **sai** | AUTH-01, câu trả lời 6 | 401 `INVALID_CREDENTIALS` (không tiết lộ trạng thái xác minh) |
| login | TENANT/MANAGER/BOSS do staff tạo, `phone_verified_at` null | AUTH-12 | 200 như trước |
| login | GUEST bị khóa, mật khẩu đúng | AUTH-02 | 403 `ACCOUNT_LOCKED` (ưu tiên trước `PHONE_NOT_VERIFIED`) |
| verify-phone | đúng mã | AUTH-12, AUTH-T1, AUTH-T2 | 200 `accessToken` + `user`, cookie `rt` đúng path `/api/v1/auth`, `phone_verified_at` được đặt, đăng nhập được ngay sau đó |
| verify-phone | sai mã / số lạ | AUTH-13 | 400 `OTP_INVALID`, body y nhau (không tiết lộ tài khoản) |
| verify-phone | mã purpose `RESET_PASSWORD` dùng cho verify-phone | AUTH-13 | 400 `OTP_INVALID` |
| verify-phone | tài khoản bị khóa | AUTH-02 | 403 `ACCOUNT_LOCKED`, `phone_verified_at` vẫn null |
| resend-code | số lạ / vượt hạn mức / SMS lỗi / số hợp lệ | AUTH-13, câu trả lời 3 | 4 lần đều 200 với **body y nhau**; chỉ trường hợp hợp lệ có SMS |
| phone/send-code | TENANT, MANAGER, BOSS, GUEST chưa xác minh | AUTH-12, câu trả lời 7 | 200, có SMS |
| phone/send-code | số đã xác minh | AUTH-12 | 409 `CONFLICT_STATE` |
| phone/send-code | không đăng nhập | API-07 | 401 `UNAUTHENTICATED` |
| phone/verify | đúng mã | AUTH-14 | 200, `phoneVerified: true`, **không** tạo/sửa viewing hay contract nào |
| phone/verify | mã của số khác | AUTH-14 | 400 `OTP_INVALID` |
| /auth/me | khóa trả về | AUTH-15, BE-LOGIN-15 | đúng `ME_KEYS` + `phoneVerified` + `locale`; GUEST **không** có khóa `buildings` |
| acceptance | khách đăng ký → login 403 → verify → login 200 | spec 10 Acceptance | đúng chuỗi trạng thái |

### CP-3 · BE-EX-07..09 – quên mật khẩu bằng mã, roles/scope/locale, kiểm tra cuối (⏸)

Tệp: `auth.service.ts`, `dto/auth.dto.ts`, `auth.controller.ts`, `src/common/guards/auth.decorators.ts`, `src/common/scope/scope.ts`, `prisma/seed.ts` + `seed.spec.ts`, `guards.spec.ts`, `auth.account.spec.ts`, `auth.reset.spec.ts`, `reset-by-code.spec.ts` (mới), `test/auth.e2e-spec.ts` + `test/scenarios/`, `docs/spec/01-architecture.md`, `docs/spec/02-database.md`, `docs/phase-extra-home101/PROGRESS.md`.

**Done when**
```bash
cd Source/backend && npm run lint && npm run test && npm run build && npm run test:e2e
```
tất cả xanh (dán output thật). E2E thêm chuỗi đăng ký → verify → login → đặt lại mật khẩu bằng mã (đọc mã từ DB `phone_otps`? **không** – mã chỉ có ở dạng hash: e2e lấy mã từ log của `ConsoleSmsService` qua spy, hoặc tự tính hash và so sánh; cách chọn phải ghi trong báo cáo). Chạy **reviewer** một lần trên thay đổi chưa commit (authorization + schema) và dán toàn bộ báo cáo. Liệt kê `[ASSUMPTION]` đã dùng (A-11 + §3).

**Kịch bản test**
| Nhóm | Kịch bản | Spec ID | Kỳ vọng |
|---|---|---|---|
| forgot | số đã xác minh, tài khoản hoạt động | AUTH-07 | 200 `{data:null}`, 1 SMS purpose `RESET_PASSWORD`, không có email |
| forgot | số chưa xác minh nhưng có email | AUTH-07 | 200, link email như trước, không SMS |
| forgot | số đã xác minh **và** có email | AUTH-07 | 200, chỉ SMS (nhánh SMS thắng) |
| forgot | tài khoản bị khóa, số đã xác minh | AUTH-07, câu trả lời 8 | 200, **không** SMS, không email |
| forgot | số lạ | AUTH-07 | 200, không gửi gì |
| forgot | body của 5 nhánh trên + nhánh SMS lỗi | AUTH-07, LESSONS BE-LOGIN-18 | **giống nhau từng byte**; thời gian trả lời không chờ việc gửi |
| forgot | vượt 5 request/15 phút cho cùng số | AUTH-07 Q4e | 200, không gửi gì (không 429) |
| reset SMS | `{phone, code, newPassword}` đúng | AUTH-07 | 200, mật khẩu mới đăng nhập được, mật khẩu cũ không |
| reset SMS | mã sai / hết hạn / đã dùng | AUTH-13 | 400 `OTP_INVALID` |
| reset SMS | mọi session bị thu hồi, 1 dòng audit `user.reset_password` | AUTH-T3, AUD-01 | refresh cũ 401, đúng 1 dòng audit |
| reset SMS | mã purpose `REGISTER` dùng để đặt lại mật khẩu | AUTH-13 | 400 `OTP_INVALID` |
| reset SMS | mật khẩu mới 7 ký tự | AUTH-03 | 400 `fields.newPassword` |
| reset | nhánh link cũ `{token, newPassword}` | AUTH-07 | mọi test `auth.reset.spec.ts` cũ vẫn xanh |
| reset | body `{newPassword}` trống dạng, hoặc gửi cả `token` lẫn `phone`+`code` | API-03 | 400 `VALIDATION_FAILED` `fields.token` |
| roles | GUEST trên `/buildings`, `/rooms`, `/pricing`, `/managers`, `/dashboard`, `/files/sign` | SCOPE-05, API-07 | 403 `FORBIDDEN` (body đúng chuẩn) |
| roles | GUEST trên route `TenantMeRoles` (hợp đồng/hóa đơn/yêu cầu) | SCOPE-03, API-07 | 403 `FORBIDDEN` |
| roles | GUEST trên route `MeRoles` | SCOPE-03 | 200 |
| roles | `guards.spec.ts` ma trận đủ **4** vai trò × route boss/staff/tenant/me | SCOPE-01 | đúng 200/403 cho từng ô |
| scope | `buildingIds` của GUEST | SCOPE-02 | `[]`, không truy vấn `buildings` |
| scope | GUEST đọc id của khách khác (probe `/t/contracts/:id`) | SCOPE-03 | 404 `NOT_FOUND`, không 403 |
| locale | `PATCH /auth/me { locale: 'en' }` cho GUEST, TENANT, MANAGER | AUTH-15 | 200, giá trị lưu lại, `GET /auth/me` trả `'en'` |
| locale | `locale: 'fr'`, `locale: null`, `locale: 'EN'` | AUTH-15 | 400 `fields.locale` |
| locale | GUEST gửi `contactPhone`/`zaloUrl`/`facebookUrl` | AUTH-09, SCOPE-05 | 403 `FORBIDDEN` |
| seed | 6 tài khoản dev: 1 BOSS, 2 MANAGER, 2 TENANT, 1 GUEST; GUEST `0900000006` đã xác minh, `locale 'vi'`, `mustChangePassword` false, không có `contact_phone` | DEP-08, câu trả lời 1 | đúng như trên; seed chạy 2 lần không thêm dòng |
| e2e | đăng ký → login 403 `PHONE_NOT_VERIFIED` → verify 200 → login 200 → forgot (SMS) → reset bằng mã → login bằng mật khẩu mới | spec 10 Acceptance | toàn chuỗi xanh trên DB dev |

## 5. Test cũ sẽ đỏ (phải sửa trong cùng thay đổi)

| Tệp | Vì sao | Sửa |
|---|---|---|
| `src/app.setup.spec.ts` | `ErrorCode có đúng 25 thành viên` + bảng `EXPECTED` | 25 → **28**, thêm `PHONE_NOT_VERIFIED` 403, `OTP_INVALID` 400, `SMS_UNAVAILABLE` 503 (LESSONS BE-P2-02) |
| `src/common/prisma/prisma.service.spec.ts` | danh sách `AppModule.imports` | **không đổi** vì `SmsModule` do `AuthModule` import; đừng thêm `SmsModule` vào `AppModule` (LESSONS BE-P2-10) |
| `test/fixtures/fake-prisma.ts` | thiếu bảng `phoneOtp`; `matches()` chỉ hỗ trợ `in`/`not` nên `{ gt, gte, lt }` sẽ ném; `findFirst` bỏ qua `orderBy`; không có `count`, `$executeRaw` | thêm bảng `phoneOtp`, toán tử `gt/gte/lt/lte`, `count`, `$executeRaw` (no-op trả 0), `orderBy` trong `findFirst`; user defaults thêm `phoneVerifiedAt: null`, `locale: 'vi'`; `IDS.users.guest = 6` (LESSONS BE-P2-17) |
| `src/modules/auth/auth.me.spec.ts` | `ME_KEYS` và 2 assert `toEqual` toàn body (boss, manager1) | thêm `locale`, `phoneVerified` |
| `src/modules/auth/auth.account.spec.ts` | `ME_KEYS` + assert toàn body của `PATCH /auth/me` | như trên; thêm test `locale` |
| `src/common/guards/guards.spec.ts` | ma trận `it.each` 3 vai trò; không có GUEST trong fake | thêm vai trò `guest`, route probe `MeRoles`/`TenantMeRoles`, cập nhật test `SCOPE-02: tenant -> []` thành "mọi vai trò không phải MANAGER" |
| `prisma/seed.spec.ts` | `DEV_ACCOUNTS toHaveLength(5)` (2 chỗ), `upserts toHaveLength(10)`, `local.t.user toHaveLength(5)`, test "1 BOSS, 2 MANAGER, 2 TENANT" | 5 → **6**, 10 → **12**, thêm khẳng định về GUEST đã xác minh |
| `prisma/seed.ts` | `a.role === 'TENANT' ? null : a.phone` sẽ gán `contact_phone` cho GUEST; `update` của upsert phải giữ `phone_verified_at` cho GUEST | sửa điều kiện thành `TENANT \|\| GUEST`; thêm `phoneVerifiedAt`, `locale` vào `create` (và vào `update` của riêng GUEST nếu muốn re-seed đặt lại trạng thái xác minh – ghi rõ trong báo cáo) |
| `src/modules/auth/auth.reset.spec.ts` | `ResetPasswordDto` thành 2 dạng: các test "body `{}` → `fields.token`" phụ thuộc thông điệp | kiểm lại từng assert; giữ nguyên `RESET_LINK_MSG` để không phải sửa |
| `prisma/check-constraints.mjs` | dữ liệu nền + số tình huống | +1 user GUEST, 54 → 59 |
| `test/auth.e2e-spec.ts`, `test/scenarios/*` | thêm chuỗi đăng ký → verify → reset bằng mã | scenario mới; nhớ `test:e2e` cần `Source/.env` (LESSONS BE-P2-09) và timeout dài sẵn có |

## 6. An toàn khi chạy song song (LESSONS BE-LOGIN-12)

| Hạn mức | Cách giữ an toàn | Test |
|---|---|---|
| 5 SMS/số/ngày (đếm từ bảng) | `pg_advisory_xact_lock` theo số điện thoại ở đầu giao dịch, rồi `count` + `create` trong cùng giao dịch | 5 request song song khi đã có 4 mã → đúng 1 thành công |
| 10 SMS/IP/giờ | `RateLimiter.record()` gọi **đồng bộ trước `await` đầu tiên** (như AUTH-04) | 11 request song song cùng IP → đúng 10 đi được |
| mã dùng 1 lần | `updateMany({ where: { id, usedAt: null } })`, `count === 0` → `OTP_INVALID` | 2 verify song song cùng mã → 1×200, 1×400, 1 session |
| 1 mã chưa dùng/(số, purpose) | partial unique `phone_otps_one_active` làm lưới an toàn; vi phạm (P2002 trên index này) được map thành 429 `TOO_MANY_REQUESTS` trong `db-errors.ts` | 2 lần gửi song song cùng số + purpose → 1×200, 1×429, bảng có 1 dòng chưa dùng |
| đổi mật khẩu bằng mã | giữ nguyên khuôn giao dịch của nhánh link (đã có test song song) | 2 reset song song cùng mã → 1×200, 1×400 |
